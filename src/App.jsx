import {
  Bell,
  Bot,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  Clipboard,
  ClipboardCheck,
  Braces,
  CloudSun,
  Copy,
  Download,
  Edit3,
  Eye,
  EyeOff,
  FileUp,
  Filter,
  Home,
  IndianRupee,
  KeyRound,
  LayoutDashboard,
  ListPlus,
  Mic,
  MicOff,
  NotebookPen,
  Plus,
  Percent,
  Pencil,
  Search,
  SendHorizontal,
  Settings,
  ShieldCheck,
  Sparkles,
  Share2,
  Tag,
  Trash2,
  Upload,
  UserRound,
  Users,
  WalletCards,
  X,
  Mail,
  Inbox,
  Bike,
  Car,
  Gauge,
  Fuel,
  Wrench,
  Shield,
  FileText
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  clearPersistedState,
  estimateStorage,
  loadPersistedState,
  requestPersistentStorage,
  savePersistedState
} from "./storage.js";
import { AI_JSON_REFERENCE, askGeminiAssistant, FREE_GEMINI_MODELS, semanticVectorSearch } from "./ai.js";
import {
  hasSupabase,
  getCloudProject,
  getCloudProjectWithPIN,
  createCloudProject,
  updateCloudProject,
  deleteCloudProject,
  getCloudParticipants,
  addCloudParticipant,
  removeCloudParticipant,
  getCloudExpenses,
  upsertCloudExpense,
  deleteCloudExpense,
  getCloudMessages,
  addCloudMessage,
  clearCloudMessages,
  getCloudActivities,
  addCloudActivity,
  getCloudTasks,
  upsertCloudTask,
  deleteCloudTask,
  getCloudDocuments,
  addCloudDocument,
  deleteCloudDocument,
  updateCloudDocument,
  supabase
} from "./supabase.js";

const STORE_KEY = "lifepilot.state.v1";
const PIN_SESSION_KEY = "lifepilot.pin.validUntil";
const APP_PIN_HASH = "cc41d80b1697c04d19330fba23a82cfc68fb086e3445691578bfae3a3d6f3e57";
const rupee = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2
});

function generateCloudProjectId(name, type) {
  const cleanName = String(name || type || "PRJ").replace(/[^a-zA-Z]/g, "").toUpperCase();
  const prefix = cleanName.slice(0, 3) || "PRJ";
  const randomChars = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `LP-${prefix}-${randomChars}`;
}

// --- Utility Helpers for Image Attachments & UUID ---
const generateUUID = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

const compressImage = (file, maxWidth = 600, maxHeight = 600, quality = 0.5) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        const compressedDataUrl = canvas.toDataURL("image/jpeg", quality);
        resolve(compressedDataUrl);
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

const base64ToBlob = (base64, mimeType = "image/jpeg") => {
  const byteString = atob(base64.split(',')[1]);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ab], { type: mimeType });
};

const uploadImageToSupabase = async (file) => {
  if (!supabase) throw new Error("Supabase is not configured");
  
  const fileExt = file.name.split('.').pop();
  const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
  const filePath = `${fileName}`;

  const { data, error } = await supabase.storage
    .from('expense-proofs')
    .upload(filePath, file);

  if (error) {
    throw error;
  }

  const { data: { publicUrl } } = supabase.storage
    .from('expense-proofs')
    .getPublicUrl(filePath);

  return publicUrl;
};

const extractAttachmentUrls = (notes) => {
  if (!notes) return { cleanNotes: "", urls: [] };
  const regex = /\[Attachment:\s*([^\]]+)\]/g;
  const urls = [];
  let match;
  let cleanNotes = notes;
  while ((match = regex.exec(notes)) !== null) {
    urls.push(match[1].trim());
  }
  cleanNotes = cleanNotes.replace(regex, "").trim();
  return { cleanNotes, urls };
};

const extractAttachmentUrl = (notes) => {
  const { cleanNotes, urls } = extractAttachmentUrls(notes);
  return { cleanNotes, url: urls[0] || "" };
};

const parseSettlementExpenseId = (notes) => {
  if (!notes || !notes.includes("Settlement for expense ID: ")) return null;
  const rawAfter = notes.split("Settlement for expense ID: ")[1];
  if (!rawAfter) return null;
  const match = rawAfter.match(/^([a-zA-Z0-9-]+)/);
  return match ? match[1] : null;
};

const DEFAULT_CATEGORIES = [
  { id: "cat-food", name: "Food", type: "Debit", color: "#f2b8a2", icon: "bowl" },
  { id: "cat-travel", name: "Travel", type: "Debit", color: "#a9d7f5", icon: "route" },
  { id: "cat-bills", name: "Bills", type: "Debit", color: "#f4d06f", icon: "receipt" },
  { id: "cat-health", name: "Health", type: "Debit", color: "#b6dfc8", icon: "heart" },
  { id: "cat-income", name: "Income", type: "Credit", color: "#b7e4c7", icon: "coin" },
  { id: "cat-shopping", name: "Shopping", type: "Debit", color: "#dfc3f4", icon: "bag" }
];

const emptyState = {
  onboarded: false,
  profile: null,
  tasks: [],
  reminders: [],
  notes: [],
  events: [],
  expenses: [],
  bills: [],
  salaries: [],
  salaryExpenses: [],
  projects: [],
  projectTransactions: [],
  credentials: [],
  loans: [],
  vehicles: [],
  fuelLogs: [],
  serviceLogs: [],
  chargingLogs: [],
  vehicleReminders: [],
  vehicleDocuments: [],
  aiMessages: [],
  gmailRecords: [],
  gmailInbox: [],
  savedGmailRecords: [],
  aiMemory: {
    defaultPaymentMethod: "",
    commonParticipants: [],
    frequentMerchants: [],
    updatedAt: ""
  },
  weather: {
    location: "",
    latitude: "",
    longitude: "",
    current: null,
    updatedAt: ""
  },
  categories: DEFAULT_CATEGORIES,
  settings: {
    notificationsEnabled: false,
    defaultFuelPrice: 102.98,
    taskNotifications: true,
    reminderNotifications: true,
    eventNotifications: true,
    budgetAlerts: true,
    salaryReminder: false,
    dailyExpenseReminder: false,
    birthdayNotification: true,
    repeatHours: 3,
    quietStart: "22:00",
    quietEnd: "07:00",
    defaultDashboardView: "today",
    calendarStartDay: "Sunday",
    defaultReminderTime: "09:00",
    defaultTaskPriority: "Medium",
    showSalaryInDaily: false,
    showCompletedOnDashboard: false,
    aiEnabled: false,
    aiModel: "gemini-2.5-flash-lite",
    aiExpenseCategory: true,
    aiMonthlySummary: true,
    aiReminderSuggestions: true,
    aiTaskBreakdown: true,
    telegramNotifications: false,
    telegramLastSyncAt: "",
    telegramLastStatus: "",
    telegramLastError: "",
    gmailClientId: "",
    gmailAccessToken: "",
    gmailTokenExpiry: 0,
    gmailProcessedEmailIds: [],
    gmailInboxProcessedIds: [],
    gmailLastSyncAt: "",
    gmailLastStatus: "",
    gmailLastError: "",
    weatherEnabled: false,
    weatherLocation: "",
    modernTheme: false,
    localLlmEnabled: false,
    localLlmUrl: "http://localhost:11434",
    localModelName: "llama3.2"
  }
};

const navItems = [
  { key: "home", label: "Home", icon: Home },
  { key: "todo", label: "Todo", icon: CheckCircle2 },
  { key: "calendar", label: "Calendar", icon: CalendarDays },
  { key: "tasks", label: "Tasks", icon: ClipboardCheck },
  { key: "reminders", label: "Reminders", icon: Bell },
  { key: "notes", label: "Notes", icon: NotebookPen },
  { key: "events", label: "Events", icon: Sparkles },
  { key: "expenses", label: "Expenses", icon: WalletCards },
  { key: "vault", label: "Vault", icon: KeyRound },
  { key: "gmail", label: "Gmail Records", icon: Mail },
  { key: "gmailInbox", label: "Gmail Inbox", icon: Inbox },
  { key: "autotrack", label: "AutoTrack", icon: Bike },
  { key: "settings", label: "Settings", icon: Settings }
];

const quickActions = [
  { kind: "task", label: "Add Todo", icon: CheckCircle2 },
  { kind: "task", label: "Add Task", icon: ClipboardCheck },
  { kind: "reminder", label: "Add Reminder", icon: Bell },
  { kind: "note", label: "Add Note", icon: NotebookPen },
  { kind: "event", label: "Add Event", icon: Sparkles },
  { kind: "expense", label: "Add Daily Expense", icon: IndianRupee },
  { kind: "bill", label: "Add Bill", icon: Bell },
  { kind: "loan", label: "Add EMI / Loan", icon: Percent },
  { kind: "salary", label: "Add Salary", icon: CircleDollarSign },
  { kind: "project", label: "Add Expense Project", icon: BriefcaseBusiness },
  { kind: "credential", label: "Add Secure Credential", icon: KeyRound }
];

const dashboardNavigationItems = [
  { key: "todo", label: "Todo List", icon: CheckCircle2 },
  { key: "calendar", label: "Calendar", icon: CalendarDays },
  { key: "expenses", label: "Money & Expenses", icon: WalletCards },
  { key: "salary", label: "Salary Tracker", icon: CircleDollarSign },
  { key: "loans", label: "EMI / Loans", icon: Percent },
  { key: "gmail", label: "Gmail Records", icon: Mail },
  { key: "gmailInbox", label: "Gmail Inbox", icon: Inbox },
  { key: "vault", label: "Secure Vault", icon: KeyRound },
  { key: "tasks", label: "Tasks Manager", icon: ClipboardCheck },
  { key: "reminders", label: "Reminders", icon: Bell },
  { key: "notes", label: "Notes & Diary", icon: NotebookPen }
];

const aiQuickChips = [
  { label: "⚡ had tea for 20", prompt: "had tea for 20" },
  { label: "⚡ paid 150 for auto", prompt: "paid 150 for auto" },
  { label: "⚡ note: shopping list", prompt: "note: buy groceries and fruits" },
  { label: "⚡ remind me to pay bill", prompt: "remind me to pay electric bill tomorrow at 5pm" },
  { label: "Analyze month", prompt: "Analyze this month spending, cashflow, bills, and project balances" },
  { label: "Find overdue", prompt: "Find all overdue tasks, reminders, bills, and unpaid items" }
];

function todayISO() {
  return localDateISO(new Date());
}

function addDaysISO(iso, days) {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localDateISO(date);
}

function nowTime() {
  return new Date().toTimeString().slice(0, 5);
}

function id(prefix) {
  return `${prefix}-${crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)}`;
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

function base64ToBytes(value) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function isValidPin(pin) {
  return (await sha256Hex(pin)) === APP_PIN_HASH;
}

async function deriveVaultKey(pin, salt) {
  const baseKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 160000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptVaultPayload(payload, pin) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveVaultKey(pin, salt);
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  return {
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(ciphertext)
  };
}

async function encryptWithAppPin(payload) {
  return encryptVaultPayload(payload, APP_PIN_HASH);
}

async function decryptVaultPayload(record, pin) {
  const salt = base64ToBytes(record.encrypted?.salt || "");
  const iv = base64ToBytes(record.encrypted?.iv || "");
  const ciphertext = base64ToBytes(record.encrypted?.ciphertext || "");
  const key = await deriveVaultKey(pin, salt);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(plain));
}

async function decryptCredentialPayload(record, pin) {
  try {
    return await decryptVaultPayload(record, pin);
  } catch {
    return decryptVaultPayload(record, APP_PIN_HASH);
  }
}

function localDateISO(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function currentMonthCursor() {
  return new Date(`${todayISO()}T12:00:00`);
}

function mergeState(parsed) {
  return {
    ...emptyState,
    ...(parsed || {}),
    settings: { ...emptyState.settings, ...(parsed?.settings || {}) },
    weather: { ...emptyState.weather, ...(parsed?.weather || {}) },
    aiMemory: { ...emptyState.aiMemory, ...(parsed?.aiMemory || {}) },
    categories: parsed?.categories?.length ? parsed.categories : DEFAULT_CATEGORIES,
    credentials: parsed?.credentials || [],
    bills: parsed?.bills || [],
    loans: parsed?.loans || [],
    vehicles: parsed?.vehicles || [],
    fuelLogs: parsed?.fuelLogs || [],
    serviceLogs: parsed?.serviceLogs || [],
    chargingLogs: parsed?.chargingLogs || [],
    vehicleReminders: parsed?.vehicleReminders || [],
    vehicleDocuments: parsed?.vehicleDocuments || []
  };
}

function readLegacyStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return emptyState;
    return mergeState(JSON.parse(raw));
  } catch {
    return emptyState;
  }
}

function formatDate(value) {
  if (!value) return "";
  const today = todayISO();
  if (value === today) return "Today";
  if (value === addDaysISO(today, 1)) return "Tomorrow";
  if (value === addDaysISO(today, -1)) return "Yesterday";
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

function monthName(value) {
  return new Date(`${value || todayISO()}T12:00:00`).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric"
  });
}

function dateKey(date) {
  return localDateISO(date);
}

function startOfWeek(date, firstDay = "Sunday") {
  const copy = new Date(date);
  const day = copy.getDay();
  const offset = firstDay === "Monday" ? (day === 0 ? -6 : 1 - day) : -day;
  copy.setDate(copy.getDate() + offset);
  return copy;
}

function inRange(date, range) {
  if (!date) return false;
  const d = new Date(`${date}T12:00:00`);
  const now = new Date();
  const today = new Date(todayISO() + "T12:00:00");
  if (range === "today") return date === todayISO();
  if (range === "week") {
    const start = startOfWeek(today);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return d >= start && d <= end;
  }
  if (range === "month") return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  if (range === "lastMonth") {
    const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return d.getMonth() === last.getMonth() && d.getFullYear() === last.getFullYear();
  }
  if (range === "year") return d.getFullYear() === now.getFullYear();
  return true;
}

function isoDateTime(date, time = "09:00", offsetMinutes = 0) {
  if (!date) return "";
  const [hours = "09", minutes = "00"] = String(time || "09:00").split(":");
  const value = new Date(`${date}T${hours.padStart(2, "0")}:${minutes.padStart(2, "0")}:00`);
  if (Number.isNaN(value.getTime())) return "";
  value.setMinutes(value.getMinutes() - offsetMinutes);
  return value.toISOString();
}

function reminderOffsetMinutes(value) {
  const map = {
    "Same day": 0,
    "15 minutes": 15,
    "30 minutes": 30,
    "1 hour": 60,
    "2 hours": 120,
    "1 day": 24 * 60,
    "2 days": 2 * 24 * 60,
    "3 days": 3 * 24 * 60,
    "1 week": 7 * 24 * 60
  };
  return map[value] || 0;
}

function nextBirthdayISO(profile) {
  if (!profile?.dob) return "";
  const today = todayISO();
  let candidate = `${today.slice(0, 4)}-${profile.dob.slice(5)}`;
  if (candidate < today) candidate = `${Number(today.slice(0, 4)) + 1}-${profile.dob.slice(5)}`;
  return candidate;
}

function buildTelegramNotificationPayload(state) {
  const timezone = "Asia/Kolkata";
  const items = [];
  const add = (item) => {
    if (!item.dueAt) return;
    items.push({
      timezone,
      enabled: true,
      priority: "Medium",
      updatedAt: item.updatedAt || item.dueAt,
      ...item
    });
  };

  if (state.settings.taskNotifications) {
    state.tasks
      .filter((task) => !["Completed", "Cancelled"].includes(task.status))
      .forEach((task) => add({
        localId: task.id,
        type: "task",
        title: task.title,
        body: [task.description, task.startTime || task.endTime ? `Time: ${[task.startTime, task.endTime].filter(Boolean).join(" - ")}` : "", task.priority ? `Priority: ${task.priority}` : ""].filter(Boolean).join("\n"),
        dueAt: isoDateTime(task.dueDate, task.endTime || task.dueTime || task.startTime || "09:00"),
        repeat: "No repeat",
        status: "active",
        priority: task.priority || "Medium",
        updatedAt: task.updatedAt
      }));
  }

  if (state.settings.reminderNotifications) {
    state.reminders
      .filter((reminder) => reminder.status === "Active" && reminder.notificationEnabled !== false)
      .forEach((reminder) => add({
        localId: reminder.id,
        type: "reminder",
        title: reminder.title,
        body: reminder.description || "",
        dueAt: isoDateTime(reminder.date, reminder.time || state.settings.defaultReminderTime || "09:00"),
        repeat: reminder.repeat || "No repeat",
        status: "active",
        priority: reminder.priority || "Medium",
        updatedAt: reminder.updatedAt
      }));
  }

  if (state.settings.eventNotifications) {
    state.events
      .filter((event) => event.status !== "Cancelled")
      .forEach((event) => add({
        localId: event.id,
        type: "event",
        title: event.title,
        body: [event.location, event.description].filter(Boolean).join("\n"),
        dueAt: isoDateTime(event.startDate, event.startTime || "09:00", reminderOffsetMinutes(event.reminderBefore)),
        repeat: event.repeat || "No repeat",
        status: "active",
        updatedAt: event.updatedAt
      }));
  }

  (state.bills || [])
    .filter((bill) => bill.status !== "Paid")
    .forEach((bill) => add({
      localId: bill.id,
      type: "bill",
      title: bill.title,
      body: `${rupee.format(amount(bill.amount))} due ${formatDate(bill.dueDate)}${bill.category ? `\nCategory: ${bill.category}` : ""}`,
      dueAt: isoDateTime(billReminderDate(bill), "09:00"),
      repeat: "No repeat",
      status: "active",
      updatedAt: bill.updatedAt
    }));

  if (state.settings.birthdayNotification && state.profile?.dob) {
    add({
      localId: `birthday-${state.profile.dob}`,
      type: "birthday",
      title: `Birthday: ${state.profile.name}`,
      body: "LifePilot birthday reminder.",
      dueAt: isoDateTime(nextBirthdayISO(state.profile), "09:00"),
      repeat: "Yearly",
      status: "active",
      updatedAt: state.profile.updatedAt
    });
  }

  if (state.settings.budgetAlerts) {
    projectAlerts(state).forEach((alert) => add({
      localId: alert.id,
      type: "budget",
      title: alert.title,
      body: alert.message,
      dueAt: isoDateTime(todayISO(), "09:00"),
      repeat: "No repeat",
      status: "active",
      priority: alert.level === "danger" ? "High" : "Medium"
    }));
  }

  add({
    localId: `daily-digest-${todayISO()}`,
    type: "digest",
    title: "LifePilot daily digest",
    body: dailyDigestTelegramText(state),
    dueAt: isoDateTime(todayISO(), "08:00"),
    repeat: "Daily",
    status: "active",
    priority: "Medium",
    updatedAt: `${todayISO()}T00:00:00.000Z`
  });

  add({
    localId: `month-end-review-${todayISO().slice(0, 7)}`,
    type: "month-review",
    title: "LifePilot month-end review",
    body: dailyDigestTelegramText(state),
    dueAt: isoDateTime(monthEndReviewDate(), "19:00"),
    repeat: "No repeat",
    status: "active",
    priority: "High",
    updatedAt: `${todayISO().slice(0, 7)}-01T00:00:00.000Z`
  });

  // Vehicle reminders
  (state.vehicleReminders || [])
    .filter((reminder) => !reminder.isCompleted)
    .forEach((reminder) => {
      const vehicle = (state.vehicles || []).find((v) => v.id === reminder.vehicleId);
      const vehicleName = vehicle ? `${vehicle.brand} ${vehicle.model} (${vehicle.name})` : "Vehicle";
      
      if (reminder.isMileageBased) {
        const kmsLeft = Number(reminder.dueMileage || 0) - Number(vehicle?.currentOdometer || 0);
        if (kmsLeft <= 500) {
          add({
            localId: reminder.id,
            type: "vehicleReminder",
            title: `Vehicle: ${reminder.title}`,
            body: `${vehicleName} odometer is ${vehicle?.currentOdometer || 0} km. Due mileage ${reminder.dueMileage} km reached or near (${kmsLeft <= 0 ? "Overdue" : `${kmsLeft} km left`}).`,
            dueAt: isoDateTime(todayISO(), "09:00"),
            repeat: "No repeat",
            status: "active",
            priority: kmsLeft <= 0 ? "High" : "Medium",
            updatedAt: reminder.updatedAt
          });
        }
      } else if (reminder.dueDate) {
        add({
          localId: reminder.id,
          type: "vehicleReminder",
          title: `Vehicle: ${reminder.title}`,
          body: `${vehicleName} - Service/Task due on ${formatDate(reminder.dueDate)}.`,
          dueAt: isoDateTime(reminder.dueDate, "09:00"),
          repeat: "No repeat",
          status: "active",
          priority: reminder.dueDate < todayISO() ? "High" : "Medium",
          updatedAt: reminder.updatedAt
        });
      }
    });

  // Vehicle documents
  (state.vehicleDocuments || [])
    .forEach((doc) => {
      if (!doc.expiryDate) return;
      const vehicle = (state.vehicles || []).find((v) => v.id === doc.vehicleId);
      const vehicleName = vehicle ? `${vehicle.brand} ${vehicle.model} (${vehicle.name})` : "Vehicle";
      const alertDate = addDaysISO(doc.expiryDate, -10);
      
      add({
        localId: doc.id,
        type: "vehicleDocument",
        title: `Vehicle Doc: ${doc.title}`,
        body: `${vehicleName} document is expiring on ${formatDate(doc.expiryDate)}.\nNotes: ${doc.notes || ""}`,
        dueAt: isoDateTime(alertDate < todayISO() ? todayISO() : alertDate, "09:00"),
        repeat: "No repeat",
        status: "active",
        priority: doc.expiryDate < todayISO() ? "High" : "Medium",
        updatedAt: doc.updatedAt
      });
    });

  return { items, timezone };
}

async function syncTelegramNotifications(state) {
  const payload = buildTelegramNotificationPayload(state);
  const response = await fetch("/api/notifications/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...payload,
      categories: {
        tasks: state.settings.taskNotifications,
        reminders: state.settings.reminderNotifications,
        events: state.settings.eventNotifications,
        bills: true,
        budgets: state.settings.budgetAlerts,
        birthdays: state.settings.birthdayNotification
      }
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Telegram sync failed");
  return data;
}

async function testTelegramNotifications() {
  const response = await fetch("/api/notifications/test-telegram", { method: "POST" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Telegram test failed");
  return data;
}

function decodeBase64Url(str) {
  if (!str) return "";
  try {
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const pad = base64.length % 4;
    if (pad) {
      base64 += '='.repeat(4 - pad);
    }
    const raw = atob(base64);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      bytes[i] = raw.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  } catch (e) {
    console.error("Base64Url decode failed", e);
    return "";
  }
}

function getGmailMessageBody(payload) {
  if (payload.body && payload.body.data) {
    return decodeBase64Url(payload.body.data);
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const body = getGmailMessageBody(part);
      if (body) return body;
    }
  }
  return "";
}

async function callLocalLlm({ url, model, prompt }) {
  const endpoint = `${url}/api/generate`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2000); // 2-second timeout

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: model || "llama3.2",
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.2
        }
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Local LLM returned status ${response.status}`);
    }

    const data = await response.json();
    const responseText = data.response || "";
    
    return {
      candidates: [
        {
          content: {
            parts: [{ text: responseText }]
          }
        }
      ]
    };
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

async function parseEmailWithGemini({ model, subject, from, date, body, localLlm }) {
  const selectedModel = model || "gemini-2.5-flash-lite";
  const prompt = `You are a financial parsing assistant. Analyze this email and extract the transaction details if it represents a financial purchase, payment, debit, credit, refund, bill, or money transfer. 
If it is NOT a financial transaction (e.g., promotional mail, password reset, login alert, shipping notice, newsletter), return a JSON object with "isTransaction": false.

If it IS a financial transaction, return a JSON object with:
{
  "isTransaction": true,
  "title": "Merchant or bank name (e.g. Amazon, Uber, HDFC Bank, Swiggy)",
  "amount": number (numerical value of the amount, e.g. 299.00),
  "type": "Debit" or "Credit",
  "date": "YYYY-MM-DD",
  "time": "HH:mm" (extract time if available, otherwise omit),
  "category": "Suggested category (e.g., Food, Travel, Bills, Shopping, Income, Healthcare, Entertainment, Education, Others)",
  "currency": "INR",
  "notes": "Short summary of transaction description",
  "paymentMethod": "Payment method used (e.g., UPI, Credit Card, Debit Card, Net Banking, Wallet)",
  "accountReference": "Account or Card Reference (e.g. Card ending 1234, HDFC Bank, SBI Account)"
}

Email Subject: ${subject}
Sender (From): ${from}
Email Date: ${date}
Email Snippet/Body:
${body.substring(0, 1500)}

Return ONLY the raw JSON object. Do not include markdown code block formatting (like \`\`\`json).`;

  if (localLlm && localLlm.enabled) {
    try {
      const localResult = await callLocalLlm({
        url: localLlm.url,
        model: localLlm.model,
        prompt
      });
      const data = localResult.data || localResult;
      const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "{}";
      const cleanText = text.replace(/```json/gi, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleanText);
      return {
        ...parsed,
        _usedModel: "local:" + (localLlm.model || "llama3.2")
      };
    } catch (err) {
      console.warn("Local LLM parsing failed or offline, falling back to Gemini/Public AI...", err);
    }
  }

  let response;
  let usedModel = selectedModel;
  let isFallback = false;

  try {
    response = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: selectedModel,
        prompt
      })
    });

    if (!response.ok) {
      throw new Error(`Primary AI request failed: ${response.status}`);
    }
  } catch (err) {
    console.warn("Primary AI parsing failed, attempting fallback to public model (DeepSeek R1)...", err);
    usedModel = "mlvoca:deepseek-r1:1.5b";
    isFallback = true;
    try {
      response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: usedModel,
          prompt
        })
      });
      if (!response.ok) throw new Error(`Fallback model DeepSeek failed: ${response.status}`);
    } catch (fallbackErr) {
      console.warn("DeepSeek R1 fallback failed, trying secondary fallback (TinyLlama)...", fallbackErr);
      usedModel = "mlvoca:tinyllama";
      response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: usedModel,
          prompt
        })
      });
    }
  }

  if (!response.ok) {
    throw new Error("All AI parsing models (including public fallbacks) failed");
  }

  const rawResult = await response.text();
  let result;
  try {
    result = JSON.parse(rawResult);
  } catch (err) {
    throw new Error(`AI API returned invalid JSON. Preview: ${rawResult.substring(0, 150)}`);
  }
  const data = result.data || result;
  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "{}";
  const cleanText = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const parsed = JSON.parse(cleanText);
  return {
    ...parsed,
    _usedModel: usedModel
  };
}

async function parseGeneralEmailWithGemini({ model, subject, from, date, body, localLlm }) {
  const selectedModel = model || "gemini-2.5-flash-lite";
  const prompt = `You are a helpful personal assistant. Analyze this general email (not a financial transaction) and extract a JSON summary.
Your response MUST be a JSON object matching this structure:
{
  "summary": "A clear 1-2 sentence summary of what this email is about.",
  "isImportant": true or false (true if this email contains an important personal notification, action item, or time-sensitive update; false otherwise),
  "urls": ["array of any relevant action links or URLs found in the email, if none return empty array"]
}

Email Subject: ${subject}
Sender (From): ${from}
Email Date: ${date}
Email Snippet/Body:
${body.substring(0, 1500)}

Return ONLY the raw JSON object. Do not include markdown code block formatting (like \`\`\`json).`;

  if (localLlm && localLlm.enabled) {
    try {
      const localResult = await callLocalLlm({
        url: localLlm.url,
        model: localLlm.model,
        prompt
      });
      const data = localResult.data || localResult;
      const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "{}";
      const cleanText = text.replace(/```json/gi, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleanText);
      return {
        summary: parsed.summary || "",
        isImportant: !!parsed.isImportant,
        urls: Array.isArray(parsed.urls) ? parsed.urls : [],
        _usedModel: "local:" + (localLlm.model || "llama3.2")
      };
    } catch (err) {
      console.warn("Local LLM parsing failed or offline for general email, falling back to Gemini...", err);
    }
  }

  let response;
  let usedModel = selectedModel;

  try {
    response = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: selectedModel,
        prompt
      })
    });
    if (!response.ok) throw new Error(`Primary AI request failed: ${response.status}`);
  } catch (err) {
    console.warn("Primary AI parsing failed for general email, attempting fallback (DeepSeek R1)...", err);
    usedModel = "mlvoca:deepseek-r1:1.5b";
    try {
      response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: usedModel,
          prompt
        })
      });
      if (!response.ok) throw new Error(`Fallback model failed: ${response.status}`);
    } catch (fallbackErr) {
      console.warn("DeepSeek fallback failed, trying secondary fallback (TinyLlama)...", fallbackErr);
      usedModel = "mlvoca:tinyllama";
      response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: usedModel,
          prompt
        })
      });
    }
  }

  if (!response.ok) {
    throw new Error("All AI parsing models failed for general email");
  }

  const rawResult = await response.text();
  let result;
  try {
    result = JSON.parse(rawResult);
  } catch (err) {
    throw new Error(`AI API returned invalid JSON. Preview: ${rawResult.substring(0, 150)}`);
  }
  const data = result.data || result;
  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "{}";
  const cleanText = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const parsed = JSON.parse(cleanText);
  return {
    summary: parsed.summary || "",
    isImportant: !!parsed.isImportant,
    urls: Array.isArray(parsed.urls) ? parsed.urls : [],
    _usedModel: usedModel
  };
}



function nextRepeatDate(date, repeat) {
  const next = new Date(`${date || todayISO()}T12:00:00`);
  if (repeat === "Daily") next.setDate(next.getDate() + 1);
  else if (repeat === "Weekly") next.setDate(next.getDate() + 7);
  else if (repeat === "Monthly") next.setMonth(next.getMonth() + 1);
  else if (repeat === "Yearly") next.setFullYear(next.getFullYear() + 1);
  else next.setDate(next.getDate() + 1);
  while (localDateISO(next) <= todayISO()) {
    if (repeat === "Weekly") next.setDate(next.getDate() + 7);
    else if (repeat === "Monthly") next.setMonth(next.getMonth() + 1);
    else if (repeat === "Yearly") next.setFullYear(next.getFullYear() + 1);
    else next.setDate(next.getDate() + 1);
  }
  return localDateISO(next);
}

function isLoanMonthPaid(loan, yearMonth) {
  if (loan.status !== "Active") return true;
  if ((loan.paidMonths || []).includes(yearMonth)) return true;
  if (!loan.startDate) return false;
  
  const start = new Date(`${loan.startDate}T12:00:00`);
  const current = new Date(`${yearMonth}-01T12:00:00`);
  
  const startMonths = start.getFullYear() * 12 + start.getMonth();
  const currentMonths = current.getFullYear() * 12 + current.getMonth();
  const diffMonths = currentMonths - startMonths;
  
  if (diffMonths < 0) return true;
  
  const emiNum = diffMonths + 1;
  return emiNum <= amount(loan.completedMonths);
}

function getNextUnpaidEmiDate(loan) {
  if (!loan.emiDate || loan.status !== "Active") return null;
  const now = new Date();
  let checkYear = now.getFullYear();
  let checkMonth = now.getMonth();
  
  if (loan.startDate) {
    const start = new Date(`${loan.startDate}T12:00:00`);
    checkYear = start.getFullYear();
    checkMonth = start.getMonth();
  }
  
  for (let i = 0; i < 120; i++) {
    const monthStr = `${checkYear}-${String(checkMonth + 1).padStart(2, "0")}`;
    const emiDateStr = `${monthStr}-${String(loan.emiDate).padStart(2, "0")}`;
    
    const emiNum = i + 1;
    const isPaidByCount = emiNum <= amount(loan.completedMonths);
    const isPaidByList = (loan.paidMonths || []).includes(monthStr);
    
    if (!isPaidByCount && !isPaidByList) {
      if (loan.startDate && emiDateStr < loan.startDate) {
        checkMonth++;
        if (checkMonth > 11) {
          checkMonth = 0;
          checkYear++;
        }
        continue;
      }
      return emiDateStr;
    }
    
    checkMonth++;
    if (checkMonth > 11) {
      checkMonth = 0;
      checkYear++;
    }
  }
  return null;
}

function isBirthday(profile, iso) {
  if (!profile?.dob || !iso) return false;
  return profile.dob.slice(5) === iso.slice(5);
}

function amount(value) {
  return Number(value || 0);
}

function formatBytes(value) {
  if (!value) return "0 MB";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const size = value / 1024 ** index;
  return `${size.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function sum(items, predicate = () => true) {
  return items.filter(predicate).reduce((total, item) => total + amount(item.amount), 0);
}

function topEntries(values, limit = 8) {
  const counts = values
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .reduce((acc, value) => ({ ...acc, [value]: (acc[value] || 0) + 1 }), {});
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }));
}

function buildAiMemory(state) {
  const transactions = allTransactions(state);
  const paymentMethods = topEntries(transactions.map((item) => item.paymentMethod));
  const participants = topEntries([
    ...state.projects.flatMap((project) => project.participants || []),
    ...state.projectTransactions.flatMap((item) => [item.paidBy, item.owedBy, ...(item.participants || [])])
  ]);
  const merchants = topEntries(
    transactions
      .filter((item) => item.type === "Debit")
      .map((item) => item.title)
  );
  return {
    defaultPaymentMethod: paymentMethods[0]?.value || state.aiMemory?.defaultPaymentMethod || "UPI",
    commonParticipants: participants,
    frequentMerchants: merchants,
    updatedAt: new Date().toISOString()
  };
}

function memorySignature(memory) {
  return JSON.stringify({
    defaultPaymentMethod: memory?.defaultPaymentMethod || "",
    commonParticipants: (memory?.commonParticipants || []).map((item) => `${item.value}:${item.count}`),
    frequentMerchants: (memory?.frequentMerchants || []).map((item) => `${item.value}:${item.count}`)
  });
}

function buildDailyDigest(state) {
  const today = todayISO();
  const weekEnd = addDaysISO(today, 7);
  const transactions = allTransactions(state);
  const todaySpend = sum(transactions, (item) => item.type === "Debit" && item.date === today);
  const monthDebit = sum(transactions, (item) => item.type === "Debit" && inRange(item.date, "month"));
  const monthCredit = sum(transactions, (item) => item.type === "Credit" && inRange(item.date, "month"));
  const openTasks = state.tasks.filter((task) => task.dueDate === today && !["Completed", "Cancelled"].includes(task.status));
  const dueReminders = state.reminders.filter((reminder) => reminder.date === today && reminder.status === "Active");
  const overdueTasks = state.tasks.filter((task) => !["Completed", "Cancelled"].includes(task.status) && task.dueDate < today);
  const overdueBills = (state.bills || []).filter((bill) => bill.status !== "Paid" && bill.dueDate < today);
  const upcomingBills = (state.bills || []).filter((bill) => bill.status !== "Paid" && bill.dueDate >= today && bill.dueDate <= weekEnd);
  const activeProjectBalances = buildMonthEndReview(state).projectBalances;
  return {
    today,
    title: "AI Daily Digest",
    lines: [
      `${openTasks.length} task${openTasks.length === 1 ? "" : "s"} and ${dueReminders.length} reminder${dueReminders.length === 1 ? "" : "s"} today`,
      `${rupee.format(todaySpend)} spent today`,
      `${rupee.format(monthCredit - monthDebit)} cashflow this month`,
      `${upcomingBills.length} unpaid bill${upcomingBills.length === 1 ? "" : "s"} due within 7 days`,
      `${overdueTasks.length + overdueBills.length} overdue item${overdueTasks.length + overdueBills.length === 1 ? "" : "s"}`
    ],
    openTasks,
    dueReminders,
    upcomingBills,
    overdueTasks,
    overdueBills,
    projectBalances: activeProjectBalances
  };
}

function buildMonthEndReview(state) {
  const today = todayISO();
  const month = today.slice(0, 7);
  const unpaidBills = (state.bills || [])
    .filter((bill) => bill.status !== "Paid" && String(bill.dueDate || "").startsWith(month))
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
  const overspending = projectAlerts(state);
  const upcomingReminders = state.reminders
    .filter((reminder) => reminder.status === "Active" && reminder.date >= today && reminder.date <= addDaysISO(today, 7))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const projectBalances = state.projects
    .filter((project) => project.status === "Active")
    .map((project) => {
      const stats = projectStats(state, project);
      return {
        id: project.id,
        name: project.name,
        debit: stats.debit,
        credit: stats.credit,
        remaining: stats.remaining,
        overspent: stats.overspent
      };
    });
  return { unpaidBills, overspending, upcomingReminders, projectBalances };
}

function dailyDigestTelegramText(state) {
  const digest = buildDailyDigest(state);
  const review = buildMonthEndReview(state);
  const lines = [
    "LifePilot daily digest",
    ...digest.lines,
    review.unpaidBills.length ? `Unpaid bills: ${review.unpaidBills.map((bill) => `${bill.title} ${rupee.format(amount(bill.amount))} on ${formatDate(bill.dueDate)}`).join("; ")}` : "No unpaid bills this month.",
    review.overspending.length ? `Budget alerts: ${review.overspending.map((alert) => alert.title).join(", ")}` : "No active budget alerts.",
    review.projectBalances.length ? `Projects: ${review.projectBalances.map((project) => `${project.name} remaining ${rupee.format(project.remaining)}`).join("; ")}` : "No active project balances."
  ];
  return lines.join("\n");
}

function monthEndReviewDate() {
  const today = todayISO();
  const now = new Date(`${today}T12:00:00`);
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  lastDay.setDate(Math.max(1, lastDay.getDate() - 2));
  return localDateISO(lastDay);
}

function unwrapIcsLine(text) {
  return text.replace(/\r?\n[ \t]/g, "");
}

function parseIcsDate(raw) {
  if (!raw) return { date: "", time: "" };
  const cleaned = raw.replace(/Z$/, "");
  const date = `${cleaned.slice(0, 4)}-${cleaned.slice(4, 6)}-${cleaned.slice(6, 8)}`;
  const time = cleaned.includes("T") ? `${cleaned.slice(9, 11)}:${cleaned.slice(11, 13)}` : "";
  return { date, time };
}

function parseIcs(text) {
  const clean = unwrapIcsLine(text);
  const blocks = clean.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || [];
  return blocks.map((block) => {
    const read = (name) => {
      const line = block.split(/\r?\n/).find((entry) => entry.startsWith(name) || entry.startsWith(`${name};`));
      return line ? line.slice(line.indexOf(":") + 1).replace(/\\n/g, "\n").replace(/\\,/g, ",") : "";
    };
    const start = parseIcsDate(read("DTSTART"));
    const end = parseIcsDate(read("DTEND"));
    return {
      id: id("ics"),
      selected: true,
      title: read("SUMMARY") || "Imported event",
      description: read("DESCRIPTION"),
      startDate: start.date,
      startTime: start.time,
      endDate: end.date || start.date,
      endTime: end.time,
      location: read("LOCATION"),
      organizer: read("ORGANIZER"),
      repeat: block.includes("RRULE") ? read("RRULE") || "Repeating" : "No repeat",
      notes: read("COMMENT")
    };
  });
}

function useLocalState() {
  const [state, setState] = useState(readLegacyStore);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    loadPersistedState(STORE_KEY)
      .then((stored) => {
        if (alive) setState(mergeState(stored));
      })
      .finally(() => {
        if (alive) setReady(true);
      });

    requestPersistentStorage();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    savePersistedState(STORE_KEY, state);
  }, [ready, state]);

  return [state, setState, ready];
}

function useInstallPrompt() {
  const [prompt, setPrompt] = useState(null);
  useEffect(() => {
    const handler = (event) => {
      event.preventDefault();
      setPrompt(event);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);
  return prompt;
}

export default function App() {
  const [state, setState, storageReady] = useLocalState();
  const [pinUnlocked, setPinUnlocked] = useState(() => Number(localStorage.getItem(PIN_SESSION_KEY) || 0) > Date.now());
  const [pinBooting, setPinBooting] = useState(true);
  const [active, setActive] = useState("home");
  const [modal, setModal] = useState(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [viewingImage, setViewingImage] = useState(null);
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [expenseTab, setExpenseTab] = useState("command");
  const [selectedSalary, setSelectedSalary] = useState("");
  const [selectedProject, setSelectedProject] = useState("");
  const installPrompt = useInstallPrompt();
  const [carLoading, setCarLoading] = useState(false);
  const notified = useRef(new Set());
  const telegramSyncSignature = useRef("");

  const [gmailSyncing, setGmailSyncing] = useState(false);
  const [gmailSyncStatus, setGmailSyncStatus] = useState("");
  const [gmailInboxSyncing, setGmailInboxSyncing] = useState(false);
  const [gmailInboxSyncStatus, setGmailInboxSyncStatus] = useState("");

  const fetchGmailTransactions = async (isBackground = false) => {
    const token = state.settings.gmailAccessToken;
    const expiry = state.settings.gmailTokenExpiry;
    if (!token || (expiry && expiry < Date.now())) {
      if (!isBackground) {
        setToast("Gmail connection expired. Please reconnect.");
      }
      return;
    }

    if (!isBackground) {
      setGmailSyncing(true);
      setGmailSyncStatus("Querying Google Inbox...");
    }

    const escapeHtml = (str) => String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const sendTelegramSyncSummary = async (newRecords, error = null) => {
      if (!state.settings.telegramNotifications) return;
      
      let text = `<b>📬 LifePilot Gmail Sync</b>\n`;
      text += `Status: ${error ? "❌ Failed" : "✅ Success"}\n`;
      text += `Time: ${new Date().toLocaleTimeString("en-IN")}\n`;
      
      if (error) {
        text += `Error: ${escapeHtml(error.message || error)}\n`;
      } else {
        text += `New Extracted Actions: <b>${newRecords.length}</b>\n`;
        if (newRecords.length > 0) {
          text += `\n<b>Transactions Details:</b>\n`;
          newRecords.forEach((r, idx) => {
            text += `${idx + 1}. <b>${r.title}</b>\n`;
            text += `   Amount: ${rupee.format(r.amount)}\n`;
            text += `   Category: ${r.category}\n`;
            text += `   Type: ${r.type}\n`;
            if (r.paymentMethod) {
              text += `   Payment: ${r.paymentMethod}${r.accountReference ? ` (${r.accountReference})` : ""}\n`;
            }
          });
        }
      }
      
      try {
        await fetch("/api/notifications/send-custom", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text })
        });
      } catch (err) {
        console.error("Failed to send Gmail sync summary to Telegram", err);
      }
    };

    try {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      const afterStr = `${yyyy}/${mm}/${dd}`;
      const query = encodeURIComponent(`label:INBOX after:${afterStr} (debit OR credit OR transaction OR payment OR spent OR UPI OR bank)`);
      
      let messages = [];
      let nextPageToken = "";
      do {
        const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=100${nextPageToken ? `&pageToken=${nextPageToken}` : ""}`;
        const listRes = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!listRes.ok) {
          const errText = await listRes.text();
          throw new Error(`Gmail API returned ${listRes.status}: ${errText}`);
        }
        const listData = await listRes.json();
        if (listData.messages) {
          messages.push(...listData.messages);
        }
        nextPageToken = listData.nextPageToken;
      } while (nextPageToken);

      if (!messages.length) {
        if (!isBackground) {
          setGmailSyncStatus("No new messages found matching transaction keywords.");
          setTimeout(() => setGmailSyncing(false), 2000);
        }
        await sendTelegramSyncSummary([]);
        return;
      }

      const existingEmailIds = new Set([
        ...(state.settings.gmailProcessedEmailIds || []),
        ...(state.gmailRecords || []).map((r) => r.emailId)
      ]);

      const unprocessedMessages = messages.filter((msg) => !existingEmailIds.has(msg.id));

      if (!unprocessedMessages.length) {
        if (!isBackground) {
          setGmailSyncStatus("No new unprocessed transaction emails in Inbox.");
          setTimeout(() => setGmailSyncing(false), 2000);
        }
        await sendTelegramSyncSummary([]);
        return;
      }

      if (!isBackground) {
        setGmailSyncStatus(`Found ${unprocessedMessages.length} new message(s). Processing...`);
      }
      const newRecords = [];

      for (let i = 0; i < unprocessedMessages.length; i++) {
        const msg = unprocessedMessages[i];
        if (!isBackground) {
          setGmailSyncStatus(`Fetching email ${i + 1} of ${unprocessedMessages.length}...`);
        }

        const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (!msgRes.ok) continue;

        const msgRawText = await msgRes.text();
        let msgData;
        try {
          msgData = JSON.parse(msgRawText);
        } catch (err) {
          throw new Error(`Gmail Message API returned invalid JSON. Preview: ${msgRawText.substring(0, 150)}`);
        }
        const payload = msgData.payload || {};
        const headers = payload.headers || [];

        const subject = headers.find((h) => h.name.toLowerCase() === "subject")?.value || "";
        const from = headers.find((h) => h.name.toLowerCase() === "from")?.value || "";
        const dateHeader = headers.find((h) => h.name.toLowerCase() === "date")?.value || "";

        const snippet = (msgData.snippet || "").substring(0, 160);
        const bodyText = getGmailMessageBody(payload) || snippet;

        if (!isBackground) {
          setGmailSyncStatus(`Analyzing email ${i + 1} with Gemini...`);
        }

        try {
          const parsed = await parseEmailWithGemini({
            model: state.settings.aiModel,
            subject,
            from,
            date: dateHeader,
            body: bodyText,
            localLlm: {
              enabled: state.settings.localLlmEnabled,
              url: state.settings.localLlmUrl,
              model: state.settings.localModelName
            }
          });

          if (parsed && parsed.isTransaction) {
            newRecords.push({
              id: "gr-" + Math.random().toString(36).substring(2, 9),
              emailId: msg.id,
              title: parsed.title || "Unknown Merchant",
              amount: parsed.amount || 0,
              type: parsed.type || "Debit",
              date: parsed.date || todayISO(),
              time: parsed.time || "",
              category: parsed.category || "Others",
              currency: parsed.currency || "INR",
              notes: parsed.notes || "",
              paymentMethod: parsed.paymentMethod || "UPI",
              accountReference: parsed.accountReference || "",
              subject,
              sender: from,
              emailDate: dateHeader
            });
          } else {
            setState((current) => {
              const cleanProcessed = Array.isArray(current.settings.gmailProcessedEmailIds)
                ? current.settings.gmailProcessedEmailIds.slice(-200)
                : [];
              const next = {
                ...current,
                settings: {
                  ...current.settings,
                  gmailProcessedEmailIds: [...cleanProcessed, msg.id]
                }
              };
              savePersistedState(STORE_KEY, next);
              return next;
            });
          }
        } catch (err) {
          console.error(`Error parsing email ${msg.id} with Gemini`, err);
        }
      }

      if (newRecords.length) {
        setState((current) => {
          const cleanProcessed = Array.isArray(current.settings.gmailProcessedEmailIds)
            ? current.settings.gmailProcessedEmailIds.slice(-200)
            : [];
          const next = {
            ...current,
            gmailRecords: [...(current.gmailRecords || []), ...newRecords],
            settings: {
              ...current.settings,
              gmailLastSyncAt: new Date().toISOString(),
              gmailLastStatus: `Synced ${newRecords.length} new records`,
              gmailLastError: "",
              gmailProcessedEmailIds: [...cleanProcessed, ...newRecords.map((r) => r.emailId)]
            }
          };
          savePersistedState(STORE_KEY, next);
          return next;
        });
        setToast(`Fetched ${newRecords.length} transaction(s)!`);
      } else {
        setState((current) => {
          const next = {
            ...current,
            settings: {
              ...current.settings,
              gmailLastSyncAt: new Date().toISOString(),
              gmailLastStatus: "Synced, no new records",
              gmailLastError: ""
            }
          };
          savePersistedState(STORE_KEY, next);
          return next;
        });
        if (!isBackground) {
          setToast("No new transaction records found in emails.");
        }
      }
      await sendTelegramSyncSummary(newRecords);
    } catch (err) {
      console.error("Gmail sync failed", err);
      setState((current) => ({
        ...current,
        settings: {
          ...current.settings,
          gmailLastStatus: "Sync failed",
          gmailLastError: err.stack || err.message || "Unknown error"
        }
      }));
      if (!isBackground) {
        setToast(`Gmail sync failed: ${err.message}`);
      }
      await sendTelegramSyncSummary([], err);
    } finally {
      if (!isBackground) {
        setGmailSyncing(false);
        setGmailSyncStatus("");
      }
    }
  };

  const fetchGmailInbox = async (isBackground = false) => {
    const token = state.settings.gmailAccessToken;
    const expiry = state.settings.gmailTokenExpiry;
    if (!token || (expiry && expiry < Date.now())) {
      if (!isBackground) {
        setToast("Gmail connection expired. Please reconnect.");
      }
      return;
    }

    if (!isBackground) {
      setGmailInboxSyncing(true);
      setGmailInboxSyncStatus("Querying Google Inbox for emails...");
    }

    try {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      const afterStr = `${yyyy}/${mm}/${dd}`;
      // Query for label:INBOX, starting from today, and excluding transactions
      const query = encodeURIComponent(`label:INBOX after:${afterStr} -debit -credit -transaction -payment -spent -UPI -bank`);
      
      let messages = [];
      let nextPageToken = "";
      do {
        const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=100${nextPageToken ? `&pageToken=${nextPageToken}` : ""}`;
        const listRes = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!listRes.ok) {
          const errText = await listRes.text();
          throw new Error(`Gmail API returned ${listRes.status}: ${errText}`);
        }
        const listData = await listRes.json();
        if (listData.messages) {
          messages.push(...listData.messages);
        }
        nextPageToken = listData.nextPageToken;
      } while (nextPageToken);

      if (!messages.length) {
        if (!isBackground) {
          setGmailInboxSyncStatus("No new emails found in Inbox.");
          setTimeout(() => setGmailInboxSyncing(false), 2000);
        }
        return;
      }

      const existingInboxIds = new Set([
        ...(state.settings.gmailInboxProcessedIds || []),
        ...(state.gmailInbox || []).map((r) => r.emailId),
        ...(state.savedGmailRecords || []).map((r) => r.emailId)
      ]);

      const unprocessedMessages = messages.filter((msg) => !existingInboxIds.has(msg.id));

      if (!unprocessedMessages.length) {
        if (!isBackground) {
          setGmailInboxSyncStatus("No new unprocessed emails in Inbox.");
          setTimeout(() => setGmailInboxSyncing(false), 2000);
        }
        return;
      }

      if (!isBackground) {
        setGmailInboxSyncStatus(`Found ${unprocessedMessages.length} new email(s). Processing...`);
      }
      const newRecords = [];

      for (let i = 0; i < unprocessedMessages.length; i++) {
        const msg = unprocessedMessages[i];
        if (!isBackground) {
          setGmailInboxSyncStatus(`Fetching email ${i + 1} of ${unprocessedMessages.length}...`);
        }

        const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (!msgRes.ok) continue;

        const msgRawText = await msgRes.text();
        let msgData;
        try {
          msgData = JSON.parse(msgRawText);
        } catch (err) {
          throw new Error(`Gmail Message API returned invalid JSON. Preview: ${msgRawText.substring(0, 150)}`);
        }
        const payload = msgData.payload || {};
        const headers = payload.headers || [];

        const subject = headers.find((h) => h.name.toLowerCase() === "subject")?.value || "";
        const from = headers.find((h) => h.name.toLowerCase() === "from")?.value || "";
        const dateHeader = headers.find((h) => h.name.toLowerCase() === "date")?.value || "";

        const snippet = (msgData.snippet || "").substring(0, 160);
        const bodyText = getGmailMessageBody(payload) || snippet;

        // Run local regex safety check
        const SECURE_EMAIL_REGEX = /\b(otp|one[- ]time[- ]password|verification[- ]code|security[- ]code|passcode|password[- ]reset|reset[- ]password|recovery[- ]link|account[- ]recovery|login[- ]credentials|login[- ]details|credentials|sign[- ]in[- ]code|verification[- ]link|2fa|mfa|two[- ]factor)\b/i;
        const isSecure = SECURE_EMAIL_REGEX.test(subject) || SECURE_EMAIL_REGEX.test(snippet) || SECURE_EMAIL_REGEX.test(bodyText);

        let emailDateStr = todayISO();
        try {
          if (dateHeader) {
            const parsedDate = new Date(dateHeader);
            if (!isNaN(parsedDate.getTime())) {
              emailDateStr = parsedDate.toLocaleDateString("en-CA");
            }
          }
        } catch (e) {
          console.warn("Failed to parse date header", dateHeader);
        }

        // Detect attachments locally
        const hasAttachments = (part) => {
          if (part.filename && part.body && part.body.attachmentId) return true;
          if (part.parts) {
            for (const subPart of part.parts) {
              if (hasAttachments(subPart)) return true;
            }
          }
          return false;
        };
        const hasFiles = hasAttachments(payload);

        if (isSecure) {
          newRecords.push({
            id: "gi-" + Math.random().toString(36).substring(2, 9),
            emailId: msg.id,
            subject,
            sender: from,
            emailDate: dateHeader,
            snippet: "[🔒 Secure Content]",
            summary: "Gmail is secured to view. See details in Gmail app.",
            isImportant: false,
            isSecure: true,
            urls: [],
            hasFiles,
            date: emailDateStr
          });
        } else if (i >= 15) {
          // AI Safeguard limit reached: Queue for next sync to prevent rate limits
          newRecords.push({
            id: "gi-" + Math.random().toString(36).substring(2, 9),
            emailId: msg.id,
            subject,
            sender: from,
            emailDate: dateHeader,
            snippet,
            summary: "AI summary queued. Sync again to summarize.",
            isImportant: false,
            isSecure: false,
            urls: [],
            hasFiles,
            date: emailDateStr,
            aiUnavailable: true
          });
        } else {
          if (!isBackground) {
            setGmailInboxSyncStatus(`Summarizing email ${i + 1} with Gemini...`);
          }

          try {
            const parsed = await parseGeneralEmailWithGemini({
              model: state.settings.aiModel,
              subject,
              from,
              date: dateHeader,
              body: bodyText,
              localLlm: {
                enabled: state.settings.localLlmEnabled,
                url: state.settings.localLlmUrl,
                model: state.settings.localModelName
              }
            });

            newRecords.push({
              id: "gi-" + Math.random().toString(36).substring(2, 9),
              emailId: msg.id,
              subject,
              sender: from,
              emailDate: dateHeader,
              snippet,
              summary: parsed.summary || "No summary provided.",
              isImportant: !!parsed.isImportant,
              isSecure: false,
              urls: parsed.urls || [],
              hasFiles,
              date: emailDateStr
            });
          } catch (err) {
            console.warn(`Error summarizing email ${msg.id} with Gemini. Adding placeholder tag.`, err);
            newRecords.push({
              id: "gi-" + Math.random().toString(36).substring(2, 9),
              emailId: msg.id,
              subject,
              sender: from,
              emailDate: dateHeader,
              snippet,
              summary: "AI summary not available.",
              isImportant: false,
              isSecure: false,
              urls: [],
              hasFiles,
              date: emailDateStr,
              aiUnavailable: true
            });
          }
        }
      }

      if (newRecords.length) {
        setState((current) => {
          const cleanProcessed = Array.isArray(current.settings.gmailInboxProcessedIds) 
            ? current.settings.gmailInboxProcessedIds.slice(-200) 
            : [];
          const next = {
            ...current,
            gmailInbox: [...(current.gmailInbox || []), ...newRecords],
            settings: {
              ...current.settings,
              gmailInboxProcessedIds: [...cleanProcessed, ...newRecords.map((r) => r.emailId)]
            }
          };
          savePersistedState(STORE_KEY, next);
          return next;
        });
        setToast(`Fetched ${newRecords.length} email(s) in Inbox!`);
      } else {
        if (!isBackground) {
          setToast("No new emails found.");
        }
      }
    } catch (err) {
      console.error("Gmail Inbox sync failed", err);
      if (!isBackground) {
        setToast(`Gmail Inbox sync failed: ${err.message}`);
      }
    } finally {
      if (!isBackground) {
        setGmailInboxSyncing(false);
        setGmailInboxSyncStatus("");
      }
    }
  };

  const ignoreGmailInbox = (emailId) => {
    setState((current) => {
      const next = {
        ...current,
        gmailInbox: (current.gmailInbox || []).filter((r) => r.emailId !== emailId),
        settings: {
          ...current.settings,
          gmailInboxProcessedIds: [...(current.settings.gmailInboxProcessedIds || []), emailId]
        }
      };
      savePersistedState(STORE_KEY, next);
      return next;
    });
    setToast("Email ignored.");
  };

  const saveGmailInbox = (emailId) => {
    setState((current) => {
      const record = (current.gmailInbox || []).find((r) => r.emailId === emailId);
      if (!record) return current;
      const next = {
        ...current,
        gmailInbox: (current.gmailInbox || []).filter((r) => r.emailId !== emailId),
        savedGmailRecords: [...(current.savedGmailRecords || []), { ...record, saved: true }]
      };
      savePersistedState(STORE_KEY, next);
      return next;
    });
    setToast("Email saved.");
  };

  const deleteSavedGmail = (emailId) => {
    setState((current) => {
      const next = {
        ...current,
        savedGmailRecords: (current.savedGmailRecords || []).filter((r) => r.emailId !== emailId),
        settings: {
          ...current.settings,
          gmailInboxProcessedIds: [...(current.settings.gmailInboxProcessedIds || []), emailId]
        }
      };
      savePersistedState(STORE_KEY, next);
      return next;
    });
    setToast("Saved email deleted.");
  };

  useEffect(() => {
    if (!storageReady) return;
    const token = state.settings.gmailAccessToken;
    const expiry = state.settings.gmailTokenExpiry;
    if (token && (!expiry || expiry > Date.now())) {
      const timer = setTimeout(() => {
        fetchGmailTransactions(true);
      }, 3000);
      const interval = setInterval(() => {
        fetchGmailTransactions(true);
      }, 300000);
      return () => {
        clearTimeout(timer);
        clearInterval(interval);
      };
    }
  }, [storageReady, state.settings.gmailAccessToken, state.settings.gmailTokenExpiry]);

  useEffect(() => {
    const timer = setTimeout(() => setPinBooting(false), 900);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 2400);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!state.settings.notificationsEnabled || !("Notification" in window) || Notification.permission !== "granted") return;
    const tick = () => {
      const now = new Date();
      const hhmm = now.toTimeString().slice(0, 5);
      const today = todayISO();
      const dueTasks = state.tasks.filter((task) => {
        const taskTime = task.endTime || task.dueTime || task.startTime || "09:00";
        return task.dueDate === today && taskTime <= hhmm && !["Completed", "Cancelled"].includes(task.status);
      });
      const dueReminders = state.reminders.filter((reminder) =>
        reminder.date <= today &&
        reminder.time <= hhmm &&
        reminder.status === "Active" &&
        reminder.notificationEnabled
      );
      const dueBills = (state.bills || []).filter((bill) => bill.status !== "Paid" && billReminderDate(bill) <= today);
      const dueLoans = (state.loans || []).filter((loan) => {
        if (loan.status !== "Active" || !loan.emiDate) return false;
        const nextDate = getNextUnpaidEmiDate(loan);
        if (!nextDate) return false;
        const reminderStart = addDaysISO(nextDate, -5);
        return today >= reminderStart && today <= nextDate;
      });
      [...dueTasks, ...dueReminders, ...dueBills, ...dueLoans].forEach((item) => {
        const key = `${item.id}-${today}-${hhmm.slice(0, 2)}`;
        if (notified.current.has(key)) return;
        notified.current.add(key);
        
        let body = "LifePilot reminder.";
        if (item.emiDate && item.status && (item.status === "Active" || item.status === "Pending")) {
          const nextDate = getNextUnpaidEmiDate(item);
          const daysLeft = Math.ceil((new Date(`${nextDate}T12:00:00`) - new Date(`${today}T12:00:00`)) / (1000 * 60 * 60 * 24));
          body = daysLeft === 0 ? "EMI due today!" : `EMI due in ${daysLeft} days (on ${formatDate(nextDate)}).`;
        } else if (item.dueDate) {
          body = `Bill due ${formatDate(item.dueDate)}.`;
        } else if (item.isMoneyReceive) {
          body = `Receive ${rupee.format(Number(item.moneyAmount || 0))} from ${item.payerName}.`;
        } else {
          body = "LifePilot reminder for today.";
        }
        
        new Notification(item.title, { body, icon: "/icons/icon.svg" });
      });
      const recurringDue = dueReminders.filter((reminder) => reminder.repeat && reminder.repeat !== "No repeat");
      if (recurringDue.length) {
        setState((current) => ({
          ...current,
          reminders: current.reminders.map((reminder) => {
            const due = recurringDue.find((item) => item.id === reminder.id);
            return due ? { ...reminder, date: nextRepeatDate(reminder.date, reminder.repeat), updatedAt: new Date().toISOString() } : reminder;
          })
        }));
      }
      if (state.profile && isBirthday(state.profile, today)) {
        const key = `birthday-${today}`;
        if (!notified.current.has(key) && state.settings.birthdayNotification) {
          notified.current.add(key);
          new Notification(`Happy Birthday, ${state.profile.name}!`, { body: "LifePilot has your day ready.", icon: "/icons/icon.svg" });
        }
      }
    };
    tick();
    const timer = setInterval(tick, 60000);
    return () => clearInterval(timer);
  }, [state]);

  useEffect(() => {
    if (!storageReady) return;
    const today = todayISO();
    setState((current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.status !== "Completed" && task.status !== "Cancelled" && task.dueDate < today
          ? { ...task, status: "Overdue" }
          : task
      ),
      reminders: current.reminders.map((reminder) =>
        reminder.status === "Active" && reminder.date < today && (!reminder.repeat || reminder.repeat === "No repeat") ? { ...reminder, status: "Expired" } : reminder
      )
    }));
  }, [setState, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    const nextMemory = buildAiMemory(state);
    if (memorySignature(nextMemory) === memorySignature(state.aiMemory)) return;
    setState((current) => ({ ...current, aiMemory: nextMemory }));
  }, [state.expenses, state.salaryExpenses, state.projectTransactions, state.projects, storageReady, setState]);

  useEffect(() => {
    if (!selectedProject || !supabase) return;
    const activeProject = state.projects.find(p => p.id === selectedProject);
    if (!activeProject?.isCloud) return;

    const syncCloudData = async () => {
      try {
        const cloudExpenses = await getCloudExpenses(selectedProject);
        const cloudParticipants = await getCloudParticipants(selectedProject);
        
        setState(current => {
          const normalExpenses = cloudExpenses.filter(e => e.category !== "Settlement");
          const settlementExpenses = cloudExpenses.filter(e => e.category === "Settlement");

          const mappedExpenses = normalExpenses.map(exp => ({
            id: exp.id,
            projectId: exp.project_id,
            title: exp.title,
            amount: exp.amount,
            type: "Debit",
            category: exp.category,
            date: exp.date,
            time: exp.time,
            paidBy: exp.paid_by,
            owedBy: exp.owed_by,
            participants: exp.participants,
            paymentMethod: exp.payment_method,
            notes: exp.notes,
            updatedAt: exp.updated_at
          }));

          const mappedSettlements = settlementExpenses.map(exp => ({
            id: exp.id,
            from: exp.paid_by,
            to: exp.owed_by,
            amount: Number(exp.amount),
            paidAt: exp.created_at,
            notes: exp.notes
          }));
          
          const cleanTransactions = current.projectTransactions.filter(t => t.projectId !== selectedProject);
          const nextTransactions = [...mappedExpenses, ...cleanTransactions];
          
          const mappedParticipants = cloudParticipants.map(p => p.name);
          const nextProjects = current.projects.map(p => 
            p.id === selectedProject 
              ? { ...p, participants: mappedParticipants, paidSettlements: mappedSettlements } 
              : p
          );
          
          return {
            ...current,
            projectTransactions: nextTransactions,
            projects: nextProjects
          };
        });
      } catch (err) {
        console.error("Owner sync error", err);
      }
    };
    
    syncCloudData();

    const channel = supabase
      .channel(`owner:${selectedProject}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "cloud_expenses", filter: `project_id=eq.${selectedProject}` }, () => {
        syncCloudData();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "cloud_participants", filter: `project_id=eq.${selectedProject}` }, () => {
        syncCloudData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedProject]);

  useEffect(() => {
    if (!storageReady || !state.settings.telegramNotifications) return;
    const payload = buildTelegramNotificationPayload(state);
    const signature = JSON.stringify(payload.items.map((item) => [
      item.localId,
      item.type,
      item.title,
      item.dueAt,
      item.repeat,
      item.status,
      item.updatedAt
    ]));
    if (signature === telegramSyncSignature.current) return;
    telegramSyncSignature.current = signature;
    const timer = setTimeout(() => {
      syncTelegramNotifications(state)
        .then((result) => {
          setState((current) => ({
            ...current,
            settings: {
              ...current.settings,
              telegramLastSyncAt: new Date().toISOString(),
              telegramLastStatus: `${result.synced || 0} reminders synced`,
              telegramLastError: ""
            }
          }));
        })
        .catch((error) => {
          setState((current) => ({
            ...current,
            settings: {
              ...current.settings,
              telegramLastStatus: "Sync failed",
              telegramLastError: error.message || "Telegram sync failed"
            }
          }));
        });
    }, 900);
    return () => clearTimeout(timer);
  }, [state, setState, storageReady]);


  const updateState = (recipe, message = "Saved") => {
    setState((current) => {
      const next = typeof recipe === "function" ? recipe(current) : recipe;
      return next;
    });
    setToast(message);
  };

  const upsert = (collection, item, prefix) => {
    updateState((current) => {
      const exists = Boolean(item.id) && (current[collection] || []).some((entry) => entry.id === item.id);
      const record = { ...item, id: item.id || id(prefix), updatedAt: new Date().toISOString() };
      
      let nextState = {
        ...current,
        [collection]: exists
          ? current[collection].map((entry) => (entry.id === item.id ? record : entry))
          : [record, ...current[collection]]
      };
      
      if (collection === "salaries") {
        const salaryIdVal = record.id;
        const matchingExpense = current.expenses.find(e => e.salaryId === salaryIdVal);
        const expenseRecord = {
          id: matchingExpense?.id || id("expense"),
          title: `Salary: ${record.title}`,
          amount: record.amount,
          type: "Credit",
          category: "Salary",
          date: record.receivedDate,
          time: matchingExpense?.time || "",
          paymentMethod: record.paymentMethod || "Bank transfer",
          notes: record.notes,
          salaryId: salaryIdVal,
          updatedAt: new Date().toISOString()
        };
        
        nextState = {
          ...nextState,
          expenses: matchingExpense
            ? current.expenses.map(e => e.salaryId === salaryIdVal ? expenseRecord : e)
            : [expenseRecord, ...current.expenses]
        };
      }
      
      if (collection === "reminders") {
        if (record.isMoneyReceive && record.status === "Completed") {
          const reminderIdVal = record.id;
          const matchingExpense = current.expenses.find(e => e.reminderId === reminderIdVal);
          const expenseRecord = {
            id: matchingExpense?.id || id("expense"),
            title: `Received: ${record.title}`,
            amount: record.moneyAmount || 0,
            type: "Credit",
            category: "Salary",
            date: record.date || todayISO(),
            time: matchingExpense?.time || record.time || "",
            paymentMethod: "UPI",
            notes: record.description || "",
            reminderId: reminderIdVal,
            updatedAt: new Date().toISOString()
          };
          nextState = {
            ...nextState,
            expenses: matchingExpense
              ? current.expenses.map(e => e.reminderId === reminderIdVal ? expenseRecord : e)
              : [expenseRecord, ...current.expenses]
          };
        } else {
          const reminderIdVal = record.id;
          if (current.expenses.some(e => e.reminderId === reminderIdVal)) {
            nextState = {
              ...nextState,
              expenses: current.expenses.filter(e => e.reminderId !== reminderIdVal)
            };
          }
        }
      }
      
      return nextState;
    }, item.id ? "Changes saved" : "Added");
  };

  const requestConfirm = ({ title, message, confirmLabel = "Confirm", tone = "danger", onConfirm }) => {
    setConfirmDialog({ title, message, confirmLabel, tone, onConfirm });
  };

  const remove = (collection, itemId, label = "item", options = {}) => {
    requestConfirm({
      title: options.title || `Delete ${label}?`,
      message: options.message || (collection === "projectTransactions"
        ? "Are you sure you want to delete this expense? This might affect the splits and pending balances."
        : `Are you sure you want to delete this ${label}? This action cannot be undone.`),
      confirmLabel: options.confirmLabel || "Delete",
      tone: "danger",
      onConfirm: () => {
        if (hasSupabase()) {
          if (collection === "projects") {
            const project = state.projects.find(p => p.id === itemId);
            if (project?.isCloud) {
              deleteCloudProject(itemId).catch(console.error);
            }
          } else if (collection === "projectTransactions") {
            const tx = state.projectTransactions.find(t => t.id === itemId);
            const parentProj = state.projects.find(p => p.id === tx?.projectId);
            if (parentProj?.isCloud) {
              deleteCloudExpense(itemId).catch(console.error);
              const linked = state.projectTransactions.filter(t => 
                t.projectId === parentProj.id &&
                t.category === "Settlement" &&
                t.notes && t.notes.includes(`Settlement for expense ID: ${itemId}`)
              );
              linked.forEach(s => {
                deleteCloudExpense(s.id).catch(console.error);
              });
              addCloudActivity(
                parentProj.id,
                "delete_expense",
                `${state.profile?.name || "Owner"} deleted expense "${tx.title}" of ₹${tx.amount}`,
                state.profile?.name || "Owner"
              ).catch(console.error);
            }
          }
        }

        if (options.apply) {
          updateState(options.apply, "Deleted");
          return;
        }
        updateState((current) => {
          let updatedTransactions = current.projectTransactions || [];
          let updatedProjects = current.projects || [];
          
          if (collection === "projectTransactions") {
            updatedTransactions = updatedTransactions.filter((item) => String(item.id) !== String(itemId));
            updatedTransactions = updatedTransactions.filter((item) => {
              if (item.category === "Settlement") {
                const linkedId = parseSettlementExpenseId(item.notes);
                return String(linkedId) !== String(itemId);
              }
              return true;
            });
            updatedProjects = updatedProjects.map(p => ({
              ...p,
              paidSettlements: (p.paidSettlements || []).filter(s => String(s.expenseId) !== String(itemId))
            }));
          }

          const targetList = Array.isArray(current[collection]) ? current[collection] : [];
          const updatedCollectionList = targetList.filter((item) => String(item.id) !== String(itemId));

          const updatedExpenses = (collection === "expenses" || collection === "salaryExpenses")
            ? (current.expenses || []).filter((item) => String(item.id) !== String(itemId))
            : collection === "reminders"
            ? (current.expenses || []).filter((e) => String(e.reminderId) !== String(itemId))
            : current.expenses;

          return {
            ...current,
            [collection]: collection === "projectTransactions" 
              ? updatedTransactions 
              : updatedCollectionList,
            projects: updatedProjects,
            expenses: updatedExpenses
          };
        }, "Deleted");
      }
    });
  };

  const openAdd = (kind, context = {}) => {
    setQuickOpen(false);
    setModal({ kind, context });
  };

  const showView = (key) => {
    setQuickOpen(false);
    if (key === "calendar") {
      setSelectedDate(todayISO());
    }
    if (key === "salary") {
      setActive("expenses");
      setExpenseTab("salary");
      return;
    }
    if (key === "bills") {
      setActive("expenses");
      setExpenseTab("bills");
      return;
    }
    setActive(key);
  };

  useEffect(() => {
    if (!storageReady) return;
    if (window.location.hash) {
      const hash = window.location.hash.substring(1);
      const params = new URLSearchParams(hash);
      const accessToken = params.get("access_token");
      const stateParam = params.get("state");
      const expiresIn = params.get("expires_in");
      
      if (accessToken && stateParam === "gmail_auth") {
        setState((current) => ({
          ...current,
          settings: {
            ...current.settings,
            gmailAccessToken: accessToken,
            gmailTokenExpiry: Date.now() + Number(expiresIn || 3600) * 1000
          }
        }));
        setToast("Gmail connected successfully!");
        setActive("gmail");
        window.history.replaceState(null, null, " ");
      }
    }
  }, [storageReady, setState]);

  const connectGmail = () => {
    if (!state.settings.gmailClientId) {
      setToast("Please enter a Google Client ID in settings first.");
      return;
    }
    const redirectUri = window.location.origin;
    const scope = "https://www.googleapis.com/auth/gmail.readonly";
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(state.settings.gmailClientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=${encodeURIComponent(scope)}&state=gmail_auth`;
    window.location.href = authUrl;
  };

  const disconnectGmail = () => {
    setState((current) => ({
      ...current,
      settings: {
        ...current.settings,
        gmailAccessToken: "",
        gmailTokenExpiry: 0
      }
    }));
    setToast("Disconnected from Gmail");
  };

  const requestNotifications = async () => {
    if (!("Notification" in window)) {
      setToast("This browser does not support notifications");
      return;
    }
    const permission = await Notification.requestPermission();
    updateState((current) => ({
      ...current,
      settings: { ...current.settings, notificationsEnabled: permission === "granted" }
    }), permission === "granted" ? "Notifications enabled" : "Notifications blocked");
  };

  if (!storageReady) {
    return <LoadingScreen />;
  }

  // Shutdown cloud project route interception and keep everything 100% local
  const path = window.location.pathname;
  if (path.startsWith("/project/")) {
    window.history.replaceState({}, "", "/");
  }

  if (pinBooting) {
    return <LoadingScreen message="Securing LifePilot" />;
  }

  if (!pinUnlocked) {
    return <PinLock onUnlock={() => {
      localStorage.setItem(PIN_SESSION_KEY, String(Date.now() + 60 * 60 * 1000));
      setPinUnlocked(true);
    }} />;
  }

  if (!state.onboarded) {
    return <Onboarding state={state} setState={setState} setToast={setToast} />;
  }

  return (
    <div className={`app-shell ${appThemeClass(state)}`}>
      <aside className="sidebar">
        <Brand />
        <nav className="nav-list">
          {navItems.map((item) => (
            <NavButton key={item.key} item={item} active={active === item.key} onClick={() => showView(item.key)} />
          ))}
        </nav>
      </aside>

      <main className="main">
        <TopBar
          state={state}
          active={active}
          installPrompt={installPrompt}
          requestNotifications={requestNotifications}
          setActive={showView}
          setAiOpen={setAiOpen}
        />

        {active === "home" && <HomeView state={state} setState={setState} openAdd={openAdd} setActive={showView} setAiOpen={setAiOpen} />}
        {active === "calendar" && (
          <CalendarView
            state={state}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            openAdd={openAdd}
            setModal={setModal}
            upsert={upsert}
            requestConfirm={requestConfirm}
            setToast={setToast}
          />
        )}
        {active === "todo" && <WorkList type="todo" state={state} openAdd={openAdd} setModal={setModal} remove={remove} upsert={upsert} requestConfirm={requestConfirm} />}
        {active === "tasks" && <WorkList type="task" state={state} openAdd={openAdd} setModal={setModal} remove={remove} upsert={upsert} requestConfirm={requestConfirm} />}
        {active === "reminders" && <WorkList type="reminder" state={state} openAdd={openAdd} setModal={setModal} remove={remove} upsert={upsert} requestConfirm={requestConfirm} />}
        {active === "notes" && <WorkList type="note" state={state} openAdd={openAdd} setModal={setModal} remove={remove} upsert={upsert} requestConfirm={requestConfirm} />}
        {active === "events" && <WorkList type="event" state={state} openAdd={openAdd} setModal={setModal} remove={remove} upsert={upsert} requestConfirm={requestConfirm} />}
        {active === "expenses" && (
          <ExpenseView
            state={state}
            expenseTab={expenseTab}
            setExpenseTab={setExpenseTab}
            selectedSalary={selectedSalary}
            setSelectedSalary={setSelectedSalary}
            selectedProject={selectedProject}
            setSelectedProject={setSelectedProject}
            openAdd={openAdd}
            setModal={setModal}
            remove={remove}
            upsert={upsert}
            requestConfirm={requestConfirm}
            setToast={setToast}
            setState={setState}
            setViewingImage={setViewingImage}
          />
        )}
        {active === "loans" && (
          <LoansView
            state={state}
            openAdd={openAdd}
            setModal={setModal}
            remove={remove}
            upsert={upsert}
            requestConfirm={requestConfirm}
            setToast={setToast}
            setState={setState}
          />
        )}
        {active === "vault" && (
          <VaultView
            state={state}
            upsert={upsert}
            setToast={setToast}
            setModal={setModal}
            remove={remove}
          />
        )}
        {active === "settings" && (
          <SettingsView
            state={state}
            setState={setState}
            setToast={setToast}
            requestNotifications={requestNotifications}
            setModal={setModal}
            remove={remove}
            upsert={upsert}
            requestConfirm={requestConfirm}
            connectGmail={connectGmail}
            disconnectGmail={disconnectGmail}
          />
        )}
        {active === "gmail" && (
          <GmailRecordsView
            state={state}
            setState={setState}
            setToast={setToast}
            fetchGmailTransactions={fetchGmailTransactions}
            connectGmail={connectGmail}
            gmailSyncing={gmailSyncing}
            gmailSyncStatus={gmailSyncStatus}
          />
        )}
        {active === "gmailInbox" && (
          <GmailInboxView
            state={state}
            setState={setState}
            setToast={setToast}
            fetchGmailInbox={fetchGmailInbox}
            connectGmail={connectGmail}
            gmailInboxSyncing={gmailInboxSyncing}
            gmailInboxSyncStatus={gmailInboxSyncStatus}
            ignoreGmailInbox={ignoreGmailInbox}
            saveGmailInbox={saveGmailInbox}
            deleteSavedGmail={deleteSavedGmail}
          />
        )}
        {active === "autotrack" && (
          <AutoTrackView
            state={state}
            setState={setState}
            upsert={upsert}
            remove={remove}
            setToast={setToast}
            setCarLoading={setCarLoading}
          />
        )}
      </main>

      <button className="floating-add tactile" onClick={() => setQuickOpen((value) => !value)} aria-label="Quick add">
        {quickOpen ? <X size={24} /> : <Plus size={26} />}
      </button>
      {quickOpen && <button className="quick-backdrop" aria-label="Close quick actions" onClick={() => setQuickOpen(false)} />}
      {quickOpen && <QuickActionSheet openAdd={openAdd} />}

      <nav className="bottom-nav">
        <button className={active === "home" ? "active" : ""} onClick={() => showView("home")}><Home size={21} /><span>Home</span></button>
        <button className={active === "calendar" ? "active" : ""} onClick={() => showView("calendar")}><CalendarDays size={21} /><span>Calendar</span></button>
        <button className={`bottom-add ${quickOpen ? "open" : ""}`} onClick={() => setQuickOpen((value) => !value)}>{quickOpen ? <X size={24} /> : <Plus size={24} />}</button>
        <button className={active === "expenses" ? "active" : ""} onClick={() => showView("expenses")}><WalletCards size={21} /><span>Money</span></button>
        <button className={active === "vault" ? "active" : ""} onClick={() => showView("vault")}><KeyRound size={21} /><span>Vault</span></button>
      </nav>

      {modal && (
        <EntityModal
          state={state}
          modal={modal}
          close={() => setModal(null)}
          upsert={upsert}
          setState={setState}
          setToast={setToast}
        />
      )}
      {viewingImage && (
        <div className="modal-backdrop" style={{ zIndex: 99999, padding: "1rem", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setViewingImage(null)}>
          <div className="modal" style={{ maxWidth: "100%", maxHeight: "100%", background: "transparent", border: "none", boxShadow: "none", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", position: "relative", padding: 0 }} onClick={e => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setViewingImage(null)}
              style={{ position: "absolute", top: "10px", right: "10px", background: "rgba(0,0,0,0.6)", color: "#fff", border: "none", borderRadius: "50%", width: "36px", height: "36px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10, backdropFilter: "blur(4px)" }}
            >
              <X size={20} />
            </button>
            <img src={viewingImage} alt="Full screen proof" style={{ maxWidth: "100%", maxHeight: "85vh", borderRadius: "8px", objectFit: "contain", background: "transparent" }} loading="lazy" />
          </div>
        </div>
      )}
      {confirmDialog && (
        <ConfirmModal
          dialog={confirmDialog}
          close={() => setConfirmDialog(null)}
        />
      )}
      {aiOpen && (
        <AiAssistant
          state={state}
          setState={setState}
          upsert={upsert}
          setToast={setToast}
          close={() => setAiOpen(false)}
        />
      )}
      {carLoading && <CarLoader active={carLoading} text="Processing AutoTrack..." />}
      {toast && <div className="toast"><CheckCircle2 size={18} />{toast}</div>}
    </div>
  );
}

function Brand() {
  return (
    <div className="brand">
      <img loading="lazy" src="/icons/icon.svg" alt="" />
      <div>
        <strong>LifePilot</strong>
        <span>Planner and money diary</span>
      </div>
    </div>
  );
}

function CarLoader({ active, text }) {
  if (!active) return null;
  return (
    <div className="car-loader-overlay">
      <div className="car-loader-box panel tactile">
        <div className="car-track">
          <div className="car-moving">
            <svg viewBox="0 0 24 24" width="36" height="36" fill="currentColor">
              <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.27-3.82c.14-.4.52-.68.95-.68h9.54c.43 0 .81.28.95.68L19 11H5z" />
            </svg>
          </div>
        </div>
        <p className="car-loader-text">{text || "Processing AutoTrack..."}</p>
      </div>
    </div>
  );
}

function LoadingScreen({ message = "Preparing your offline workspace" }) {
  return (
    <main className="onboarding">
      <section className="onboarding-panel loading-panel">
        <Brand />
        <div className="loading-orbit" />
        <h1>{message}</h1>
        <p>Opening local storage and getting LifePilot ready.</p>
      </section>
    </main>
  );
}

function PinLock({ onUnlock }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setChecking(true);
    if (await isValidPin(pin)) {
      onUnlock();
      return;
    }
    setError("Wrong PIN. Please try again.");
    setPin("");
    setChecking(false);
  };

  return (
    <main className="pin-screen">
      <form className="pin-card" onSubmit={submit}>
        <Brand />
        <div className="pin-icon"><KeyRound size={30} /></div>
        <h1>Enter PIN</h1>
        <p>LifePilot is locked for your privacy.</p>
        <input
          value={pin}
          onChange={(event) => {
            setError("");
            setPin(event.target.value.replace(/\D/g, "").slice(0, 4));
          }}
          inputMode="numeric"
          type="password"
          placeholder="Enter PIN"
          autoComplete="off"
          autoCorrect="off"
          spellCheck="false"
          aria-label="PIN"
          autoFocus
        />
        {error && <p className="validation">{error}</p>}
        <button className="primary tactile" type="submit" disabled={checking}>{checking ? "Checking..." : "Unlock"}</button>
      </form>
    </main>
  );
}

function NavButton({ item, active, onClick }) {
  const Icon = item.icon;
  return (
    <button className={`nav-button tactile ${active ? "active" : ""}`} onClick={onClick}>
      <Icon size={20} />
      <span>{item.label}</span>
    </button>
  );
}

function TopBar({ state, active, installPrompt, requestNotifications, setActive, setAiOpen }) {
  const title = navItems.find((item) => item.key === active)?.label || "LifePilot";
  return (
    <header className="topbar">
      <div>
        <p>{formatDate(todayISO())}</p>
        <h1>{title}</h1>
      </div>
      <div className="top-actions">
        <button className="icon-button ai-button tactile" title="LifePilot AI" onClick={() => setAiOpen(true)}>
          <Bot size={19} />
        </button>
        {installPrompt && (
          <button
            className="icon-button tactile"
            title="Install app"
            onClick={() => installPrompt.prompt()}
          >
            <Download size={19} />
          </button>
        )}
        <button className={`icon-button tactile ${active === "autotrack" ? "active" : ""}`} title="AutoTrack" onClick={() => setActive("autotrack")}>
          <Bike size={19} />
        </button>
        <button className="profile-chip tactile" onClick={() => setActive("settings")}>
          {state.profile?.image ? <img loading="lazy" src={state.profile.image} alt="" /> : <UserRound size={19} />}
          <span>{state.profile?.name}</span>
        </button>
      </div>
    </header>
  );
}

function Onboarding({ state, setState, setToast }) {
  const [form, setForm] = useState({
    name: state.profile?.name || "",
    dob: state.profile?.dob || "",
    address: "",
    bio: "",
    monthlySalary: "",
    monthlyBudget: "",
    dailyExpenseReminder: false,
    notificationsEnabled: false,
    image: ""
  });
  const [error, setError] = useState("");

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const submit = (event) => {
    event.preventDefault();
    if (!form.name.trim() || !form.dob) {
      setError("Name and date of birth are required.");
      return;
    }
    setState((current) => ({
      ...current,
      onboarded: true,
      profile: {
        name: form.name.trim(),
        dob: form.dob,
        address: form.address.trim(),
        bio: form.bio.trim(),
        image: form.image,
        monthlySalary: form.monthlySalary,
        monthlyBudget: form.monthlyBudget
      },
      settings: {
        ...current.settings,
        dailyExpenseReminder: form.dailyExpenseReminder,
        notificationsEnabled: form.notificationsEnabled
      }
    }));
    setToast("Welcome to LifePilot");
  };

  return (
    <main className="onboarding">
      <section className="onboarding-panel">
        <Brand />
        <div className="onboarding-copy">
          <h1>Build your personal cockpit for days, money, and little promises.</h1>
          <p>Local-first, light, private, and ready before any login exists.</p>
        </div>
        <form className="form-grid" onSubmit={submit}>
          <label>Name<input value={form.name} onChange={(e) => set("name", e.target.value)} required /></label>
          <label>Date of birth<input type="date" value={form.dob} onChange={(e) => set("dob", e.target.value)} required /></label>
          <label>Profile image<input type="file" accept="image/*" onChange={(e) => readImage(e.target.files?.[0], (image) => set("image", image))} /></label>
          <label>Address<input value={form.address} onChange={(e) => set("address", e.target.value)} /></label>
          <label className="wide">Short bio<textarea value={form.bio} onChange={(e) => set("bio", e.target.value)} /></label>
          <label>Monthly salary amount<input type="number" min="0" value={form.monthlySalary} onChange={(e) => set("monthlySalary", e.target.value)} /></label>
          <label>Monthly budget goal<input type="number" min="0" value={form.monthlyBudget} onChange={(e) => set("monthlyBudget", e.target.value)} /></label>
          <label className="toggle-row"><input type="checkbox" checked={form.dailyExpenseReminder} onChange={(e) => set("dailyExpenseReminder", e.target.checked)} /> Daily expense reminder</label>
          <label className="toggle-row"><input type="checkbox" checked={form.notificationsEnabled} onChange={(e) => set("notificationsEnabled", e.target.checked)} /> Notifications preference</label>
          {error && <p className="validation wide">{error}</p>}
          <button className="primary tactile wide" type="submit">Enter LifePilot</button>
        </form>
      </section>
    </main>
  );
}

function readImage(file, callback) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => callback(reader.result);
  reader.readAsDataURL(file);
}

function QuickActionSheet({ openAdd }) {
  return (
    <div className="quick-sheet raised">
      {quickActions.map((action) => {
        const Icon = action.icon;
        return (
          <button className="tactile" key={`${action.kind}-${action.label}`} onClick={() => openAdd(action.kind)}>
            <Icon size={18} />
            <span>{action.label}</span>
          </button>
        );
      })}
    </div>
  );
}

async function fetchWeatherSnapshot({ location, latitude, longitude }) {
  const params = new URLSearchParams();
  if (location?.trim()) params.set("location", location.trim());
  if (latitude) params.set("latitude", latitude);
  if (longitude) params.set("longitude", longitude);
  const response = await fetch(`/api/weather?${params.toString()}`, { cache: "no-store" });
  const weather = await response.json().catch(() => ({}));
  if (!response.ok || !weather.current) throw new Error(weather.error || "Weather update failed");
  return {
    location: weather.location || location || "Current location",
    latitude: weather.latitude,
    longitude: weather.longitude,
    current: weather.current,
    serverTime: weather.serverTime || "",
    error: "",
    loading: false,
    updatedAt: weather.updatedAt || new Date().toISOString()
  };
}

function useWeather(state, setState) {
  useEffect(() => {
    const location = state.settings.weatherLocation?.trim();
    if (!state.settings.weatherEnabled || !location) return;
    const last = state.weather?.updatedAt ? new Date(state.weather.updatedAt).getTime() : 0;
    if (Date.now() - last < 30 * 60 * 1000 && state.weather?.current) return;

    let alive = true;
    const load = async () => {
      setState((current) => ({ ...current, weather: { ...current.weather, loading: true, error: "" } }));
      try {
        const snapshot = await fetchWeatherSnapshot({
          location,
          latitude: state.weather?.location?.toLowerCase() === location.toLowerCase() ? state.weather?.latitude : "",
          longitude: state.weather?.location?.toLowerCase() === location.toLowerCase() ? state.weather?.longitude : ""
        });
        if (!alive) return;
        setState((current) => ({ ...current, weather: { ...current.weather, ...snapshot } }));
      } catch (error) {
        if (!alive) return;
        setState((current) => ({
          ...current,
          weather: {
            ...current.weather,
            loading: false,
            error: error.message || "Weather update failed"
          }
        }));
      }
    };
    load();
    return () => {
      alive = false;
    };
  }, [state.settings.weatherEnabled, state.settings.weatherLocation, state.weather?.updatedAt, state.weather?.current, state.weather?.latitude, state.weather?.longitude, state.weather?.location, setState]);
}

function WeatherScene({ weather, enabled }) {
  if (!enabled || !weather?.current) return null;
  const meta = weatherCodeMeta(weather.current.weather_code);
  const dayMode = weather.current.is_day ? "day" : "night";
  return (
    <div className={`weather-scene ${meta.theme} ${dayMode}`} aria-hidden="true">
      <span className="weather-orb" />
      <span className="weather-cloud one" />
      <span className="weather-cloud two" />
      {meta.theme === "rain" && <span className="weather-rain" />}
      {meta.theme === "storm" && <span className="weather-bolt" />}
    </div>
  );
}

function weatherCodeMeta(code = 0) {
  if ([95, 96, 99].includes(code)) return { label: "Thunderstorm", theme: "storm" };
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return { label: "Rainy", theme: "rain" };
  if ([45, 48].includes(code)) return { label: "Foggy", theme: "cloud" };
  if ([1, 2, 3].includes(code)) return { label: "Cloudy", theme: "cloud" };
  return { label: "Clear", theme: "clear" };
}

function appThemeClass(state) {
  if (state.settings.modernTheme) return "theme-modern";
  const weather = state.settings.weatherEnabled ? state.weather?.current : null;
  const time = new Date();
  const isNight = weather?.is_day === 0 || time.getHours() >= 19 || time.getHours() < 6;
  if (isNight) return "theme-night";
  if (weather) return `theme-${weatherCodeMeta(weather.weather_code).theme}`;
  return time.getHours() < 11 ? "theme-morning" : "theme-day";
}

function LumiCompanion({ userName = "there", setAiOpen }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`lumi-companion ${open ? "open" : ""}`}>
      <button className="lumi-character tactile" type="button" onClick={() => setOpen((value) => !value)} aria-label="Open Lumi helper">
        <img loading="lazy" src="/characters/lumi.png" alt="Lumi AI helper" />
      </button>
      {open && (
        <div className="lumi-popover raised">
          <strong>Hello, {userName || "there"}</strong>
          <p>I am Lumi. Need any help? Open the AI box and ask me. I am happy to help you.</p>
          <button
            className="primary tactile"
            type="button"
            onClick={() => {
              setOpen(false);
              setAiOpen(true);
            }}
          >
            <Bot size={17} />Open AI Assistant
          </button>
        </div>
      )}
    </div>
  );
}

function homeInsightCards(state) {
  const today = todayISO();
  const weekEnd = addDaysISO(today, 7);
  const transactions = allTransactions(state);
  const monthCredit = sum(transactions, (item) => item.type === "Credit" && inRange(item.date, "month"));
  const monthDebit = sum(transactions, (item) => item.type === "Debit" && inRange(item.date, "month"));
  const todayDue = [
    ...state.tasks.filter((task) => task.dueDate === today && !["Completed", "Cancelled"].includes(task.status)),
    ...state.reminders.filter((reminder) => reminder.date === today && reminder.status === "Active"),
    ...state.events.filter((event) => event.startDate === today)
  ];
  const weekTasks = state.tasks.filter((task) => task.dueDate >= today && task.dueDate <= weekEnd && !["Completed", "Cancelled"].includes(task.status));
  const weekSpend = sum(transactions, (item) => item.type === "Debit" && item.date >= today && item.date <= weekEnd);
  const overdueTasks = state.tasks.filter((task) => task.status === "Overdue" || (!["Completed", "Cancelled"].includes(task.status) && task.dueDate < today));
  const overdueBills = (state.bills || []).filter((bill) => bill.status !== "Paid" && bill.dueDate < today);
  const upcomingBills = (state.bills || []).filter((bill) => bill.status !== "Paid" && bill.dueDate >= today && bill.dueDate <= weekEnd);
  return [
    {
      title: "Today",
      value: `${todayDue.length} items`,
      detail: `${rupee.format(sum(transactions, (item) => item.type === "Debit" && item.date === today))} spending today`,
      target: "calendar"
    },
    {
      title: "This week",
      value: rupee.format(weekSpend),
      detail: `${weekTasks.length} open tasks in next 7 days`,
      target: "tasks"
    },
    {
      title: "Cashflow",
      value: rupee.format(monthCredit - monthDebit),
      detail: `${rupee.format(monthCredit)} in - ${rupee.format(monthDebit)} out this month`,
      target: "expenses",
      tone: monthCredit - monthDebit < 0 ? "warn" : "good"
    },
    {
      title: "Loans & EMIs",
      value: (state.loans || []).filter(l => l.status === "Active").length ? `${(state.loans || []).filter(l => l.status === "Active").length} Active` : "No loans",
      detail: `${rupee.format(sum((state.loans || []).filter(l => l.status === "Active"), l => l.monthlyPayment))} active EMI`,
      target: "loans"
    },
    {
      title: "Overdue",
      value: `${overdueTasks.length + overdueBills.length}`,
      detail: `${overdueTasks.length} work items, ${overdueBills.length} unpaid bills`,
      target: overdueBills.length ? "expenses" : "tasks",
      tone: overdueTasks.length || overdueBills.length ? "warn" : "good"
    },
    {
      title: "Upcoming bills",
      value: rupee.format(sum(upcomingBills)),
      detail: `${upcomingBills.length} bill${upcomingBills.length === 1 ? "" : "s"} due this week`,
      target: "expenses"
    },
    {
      title: "Todo List",
      value: `${state.tasks.filter((t) => t.status !== "Completed" && t.status !== "Cancelled").length} items`,
      detail: "Open todo and task list",
      target: "todo"
    },
    {
      title: "Gmail Records",
      value: `${(state.gmailRecords || []).length} pending`,
      detail: "Extracted email transaction queue",
      target: "gmail"
    }
  ];
}

function HomeView({ state, setState, openAdd, setActive, setAiOpen }) {
  const [range, setRange] = useState("today");
  useWeather(state, setState);
  const today = todayISO();
  const todayTasks = state.tasks.filter((task) => task.dueDate === today && (state.settings.showCompletedOnDashboard || task.status !== "Completed"));
  const todayReminders = state.reminders.filter((reminder) => reminder.date === today);
  const todayEvents = state.events.filter((event) => event.startDate === today);
  const todayNotes = state.notes.filter((note) => note.date === today);
  const money = useMoneyStats(state);
  const filteredExpenses = state.expenses.filter((expense) => inRange(expense.date, range));
  const budgetAlerts = projectAlerts(state);
  const insightCards = homeInsightCards(state);
  const dailyDigest = buildDailyDigest(state);
  const monthReview = buildMonthEndReview(state);

  const importantDues = (() => {
    const dues = [];
    const todayDateObj = new Date(`${today}T12:00:00`);

    // 1. EMI (Loans) - due in next 10 days or overdue
    (state.loans || []).forEach((loan) => {
      if (loan.status === "Active" || loan.status === "Pending") {
        const nextDate = getNextUnpaidEmiDate(loan);
        if (nextDate) {
          const daysLeft = Math.ceil((new Date(`${nextDate}T12:00:00`) - todayDateObj) / 86400000);
          if (daysLeft <= 10) {
            dues.push({
              id: `loan-${loan.id}-${nextDate}`,
              type: "EMI",
              title: `${loan.title} EMI`,
              detail: daysLeft < 0 ? `₹${loan.monthlyPayment} overdue since ${formatDate(nextDate)}` : `₹${loan.monthlyPayment} due on ${formatDate(nextDate)}`,
              daysLeft,
              targetTab: "loans"
            });
          }
        }
      }
    });

    // 2. Tasks - due in next 10 days or overdue, not completed or cancelled
    (state.tasks || []).forEach((task) => {
      if (task.dueDate && !["Completed", "Cancelled"].includes(task.status)) {
        const daysLeft = Math.ceil((new Date(`${task.dueDate}T12:00:00`) - todayDateObj) / 86400000);
        if (daysLeft <= 10) {
          dues.push({
            id: `task-${task.id}`,
            type: "Task",
            title: task.title,
            detail: daysLeft < 0 ? `Overdue since ${formatDate(task.dueDate)}` : `Due on ${formatDate(task.dueDate)}`,
            daysLeft,
            targetTab: "tasks"
          });
        }
      }
    });

    // 3. Reminders - active, due in next 10 days or overdue
    (state.reminders || []).forEach((reminder) => {
      if (reminder.date && reminder.status === "Active") {
        const daysLeft = Math.ceil((new Date(`${reminder.date}T12:00:00`) - todayDateObj) / 86400000);
        if (daysLeft <= 10) {
          dues.push({
            id: `reminder-${reminder.id}`,
            type: "Reminder",
            title: reminder.title,
            detail: daysLeft < 0 ? `Overdue since ${formatDate(reminder.date)}` : `Due on ${formatDate(reminder.date)}`,
            daysLeft,
            targetTab: "reminders"
          });
        }
      }
    });

    // 4. Bills - unpaid, due in next 10 days or overdue
    (state.bills || []).forEach((bill) => {
      if (bill.dueDate && bill.status !== "Paid") {
        const daysLeft = Math.ceil((new Date(`${bill.dueDate}T12:00:00`) - todayDateObj) / 86400000);
        if (daysLeft <= 10) {
          dues.push({
            id: `bill-${bill.id}`,
            type: "Bill",
            title: bill.title,
            detail: daysLeft < 0 ? `₹${bill.amount} overdue since ${formatDate(bill.dueDate)}` : `₹${bill.amount} due on ${formatDate(bill.dueDate)}`,
            daysLeft,
            targetTab: "bills"
          });
        }
      }
    });

    // 5. Vehicle Reminders (date-based & mileage-based)
    (state.vehicleReminders || []).forEach((reminder) => {
      if (!reminder.isCompleted) {
        const vehicle = (state.vehicles || []).find(v => v.id === reminder.vehicleId);
        const vehicleName = vehicle ? `${vehicle.brand} ${vehicle.model}` : "Vehicle";
        
        if (reminder.isMileageBased) {
          const currentOdo = Number(vehicle?.currentOdometer || 0);
          const dueOdo = Number(reminder.dueMileage || 0);
          const kmsLeft = dueOdo - currentOdo;
          
          if (kmsLeft <= 500) {
            dues.push({
              id: `vehicle-rem-${reminder.id}`,
              type: "Vehicle",
              title: `${vehicleName}: ${reminder.title}`,
              detail: kmsLeft <= 0 ? `Overdue by ${Math.abs(kmsLeft)} km (at ${dueOdo} km)` : `Due at ${dueOdo} km (${kmsLeft} km left)`,
              daysLeft: kmsLeft <= 0 ? -1 : 1,
              targetTab: "autotrack"
            });
          }
        } else if (reminder.dueDate) {
          const daysLeft = Math.ceil((new Date(`${reminder.dueDate}T12:00:00`) - todayDateObj) / 86400000);
          if (daysLeft <= 10) {
            dues.push({
              id: `vehicle-rem-${reminder.id}`,
              type: "Vehicle",
              title: `${vehicleName}: ${reminder.title}`,
              detail: daysLeft < 0 ? `Overdue since ${formatDate(reminder.dueDate)}` : `Due on ${formatDate(reminder.dueDate)}`,
              daysLeft,
              targetTab: "autotrack"
            });
          }
        }
      }
    });

    // 6. Vehicle Documents (insurance/rc/puc expiring or expired)
    (state.vehicleDocuments || []).forEach((doc) => {
      if (doc.expiryDate) {
        const vehicle = (state.vehicles || []).find(v => v.id === doc.vehicleId);
        const vehicleName = vehicle ? `${vehicle.brand} ${vehicle.model}` : "Vehicle";
        const daysLeft = Math.ceil((new Date(`${doc.expiryDate}T12:00:00`) - todayDateObj) / 86400000);
        
        if (daysLeft <= 10) {
          dues.push({
            id: `vehicle-doc-${doc.id}`,
            type: "Vehicle",
            title: `${vehicleName}: ${doc.title}`,
            detail: daysLeft < 0 ? `Expired on ${formatDate(doc.expiryDate)}` : `Expires on ${formatDate(doc.expiryDate)}`,
            daysLeft,
            targetTab: "autotrack"
          });
        }
      }
    });

    return dues.sort((a, b) => a.daysLeft - b.daysLeft);
  })();

  const refreshWeather = () => {
    setState((current) => ({
      ...current,
      weather: { ...current.weather, updatedAt: "", loading: false, error: "" }
    }));
  };

  return (
    <section className="page-grid">
      <div className="hero-panel raised">
        <WeatherScene weather={state.weather} enabled={state.settings.weatherEnabled} />
        <LumiCompanion userName={state.profile?.name} setAiOpen={setAiOpen} />
        <div>
          <p className="eyebrow">Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}</p>
          <h2>{state.profile?.name}, your day is ready.</h2>
          <p>{todayTasks.length} tasks, {todayReminders.length} reminders, {todayEvents.length} events, and {rupee.format(sum(filteredExpenses, (e) => e.type === "Debit"))} spending in view.</p>
        </div>
        {isBirthday(state.profile, today) && <div className="birthday-card">Happy Birthday, {state.profile.name}!</div>}
      </div>

      {importantDues.length > 0 && (
        <section className="panel span-2 glass-panel important-dues-section">
          <SectionHeader title="🚨 Important Dues & Actions" />
          <div className="important-dues-grid">
            {importantDues.map((due) => (
              <button 
                key={due.id} 
                className={`due-box-card tactile ${due.daysLeft < 0 ? "due-overdue" : due.daysLeft === 0 ? "due-today" : due.daysLeft <= 3 ? "due-soon" : ""}`} 
                onClick={() => setActive(due.targetTab)}
              >
                <div className="due-badge">{due.type}</div>
                <div className="due-info">
                  <strong>{due.title}</strong>
                  <span>{due.detail}</span>
                </div>
                <div className="due-countdown">
                  {due.daysLeft < 0 ? "Overdue" : due.daysLeft === 0 ? "Today" : `${due.daysLeft}d left`}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {state.settings.weatherEnabled && (
        <section className="panel weather-card span-2">
          <SectionHeader
            title="Live Weather"
            action={
              <div className="cluster">
                <button className="secondary tactile" onClick={refreshWeather}>Refresh</button>
                <button className="secondary tactile" onClick={() => setActive("settings")}>Weather Settings</button>
              </div>
            }
          />
          {state.weather?.current ? (
            <div className="weather-details">
              <CloudSun size={34} />
              <div>
                <strong>{state.weather.location}</strong>
                <span>{weatherCodeMeta(state.weather.current.weather_code).label} - {Math.round(state.weather.current.temperature_2m)} C - Wind {Math.round(state.weather.current.wind_speed_10m)} km/h</span>
                {state.weather.loading && <small>Updating latest weather...</small>}
                {!state.weather.loading && state.weather.updatedAt && <small>Updated {new Date(state.weather.updatedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</small>}
              </div>
            </div>
          ) : state.weather?.loading ? (
            <EmptyState text="Updating weather from your saved location..." small />
          ) : state.weather?.error ? (
            <EmptyState text={`${state.weather.error}. Tap Refresh or update location in Settings.`} small />
          ) : <EmptyState text="Add a weather location in Settings to show live conditions here." small />}
        </section>
      )}

      <section className="panel span-2">
        <SectionHeader title="Saved Insights" action={<button className="secondary tactile" onClick={() => setAiOpen(true)}>Ask AI</button>} />
        <div className="insight-grid">
          {insightCards.map((card) => (
            <button className={`insight-card tactile ${card.tone || ""}`} key={card.title} onClick={() => card.target ? setActive(card.target) : setAiOpen(true)}>
              <span>{card.title}</span>
              <strong>{card.value}</strong>
              <small>{card.detail}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="panel span-2 glass-panel home-digest">
        <SectionHeader title="AI Daily Digest" action={<button className="secondary tactile" onClick={() => setAiOpen(true)}><Bot size={17} />Review</button>} />
        <div className="digest-layout">
          <div className="digest-main">
            {dailyDigest.lines.map((line) => <p key={line}><Sparkles size={16} />{line}</p>)}
          </div>
          <div className="digest-side">
            <strong>Month-end review</strong>
            <small>{monthReview.unpaidBills.length} unpaid bills</small>
            <small>{monthReview.overspending.length} budget alerts</small>
            <small>{monthReview.projectBalances.length} active project balances</small>
            <small>{monthReview.upcomingReminders.length} upcoming reminders</small>
          </div>
        </div>
      </section>

      <section className="panel">
        <SectionHeader title="Quick Open" action={<Select value={range} onChange={setRange} options={rangeOptions()} />} />
        <div className="quick-grid">
          {dashboardNavigationItems.map((item) => {
            const Icon = item.icon;
            return (
              <button className="quick-card tactile" key={item.key} onClick={() => setActive(item.key)}>
                <Icon size={22} />
                {item.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="panel span-2">
        <SectionHeader title="Today" action={<button className="secondary tactile" onClick={() => setActive("calendar")}>Open Calendar</button>} />
        <div className="today-columns">
          <MiniList title="Tasks" items={todayTasks} empty="You have no tasks today. Add your first task." field="title" />
          <MiniList title="Reminders" items={todayReminders} empty="No reminders waiting today." field="title" />
          <MiniList title="Events" items={todayEvents} empty="No events on the page today." field="title" />
          <MiniList title="Notes" items={todayNotes} empty="No notes for today yet." field="title" />
        </div>
      </section>

      <MetricGrid
        metrics={[
          ["Month Credit", money.monthCredit],
          ["Month Debit", money.monthDebit],
          ["Balance", money.balance],
          ["Salary Received", money.salaryTotal],
          ["Project Spending", money.projectDebit],
          ["Remaining Budget", money.remainingBudget]
        ]}
      />

      <section className="panel">
        <SectionHeader title="Budget Alerts" />
        {budgetAlerts.length ? budgetAlerts.map((alert) => <AlertRow key={alert.id} alert={alert} />) : <EmptyState text="No budget alerts right now." />}
      </section>

      <section className="panel">
        <SectionHeader title="Active Projects" />
        {state.projects.filter((p) => p.status === "Active").length ? (
          state.projects.filter((p) => p.status === "Active").map((project) => <ProjectRow key={project.id} state={state} project={project} />)
        ) : <EmptyState text="No active expense projects. Create a trip, renovation, or custom project." />}
      </section>
    </section>
  );
}

function CalendarView({ state, selectedDate, setSelectedDate, openAdd, setModal, upsert, requestConfirm, setToast }) {
  const [cursor, setCursor] = useState(new Date(`${selectedDate}T12:00:00`));
  const [view, setView] = useState("month");
  const [preview, setPreview] = useState(null);
  useEffect(() => {
    if (selectedDate === todayISO()) {
      setCursor(currentMonthCursor());
    }
  }, [selectedDate]);
  const days = useMemo(() => calendarDays(cursor, state.settings.calendarStartDay), [cursor, state.settings.calendarStartDay]);
  const selectedItems = itemsForDate(state, selectedDate);

  const importFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const events = parseIcs(String(reader.result));
      const duplicates = events.filter((incoming) => state.events.some((event) =>
        event.title === incoming.title && event.startDate === incoming.startDate && event.startTime === incoming.startTime
      ));
      setPreview({ events, duplicateIds: duplicates.map((event) => event.id), mode: duplicates.length ? "review" : "normal" });
    };
    reader.readAsText(file);
  };

  const confirmImport = (skipDuplicates = true) => {
    if (!preview) return;
    const selected = preview.events.filter((event) => event.selected);
    let imported = 0;
    let skipped = 0;
    selected.forEach((event) => {
      const duplicate = state.events.some((existing) =>
        existing.title === event.title && existing.startDate === event.startDate && existing.startTime === event.startTime
      );
      if (duplicate && skipDuplicates) {
        skipped += 1;
        return;
      }
      upsert("events", {
        title: event.title,
        description: event.description,
        startDate: event.startDate,
        startTime: event.startTime,
        endDate: event.endDate,
        endTime: event.endTime,
        location: event.location,
        category: "Imported",
        repeat: event.repeat,
        reminderBefore: "",
        imported: true,
        organizer: event.organizer,
        notes: event.notes,
        status: "Scheduled"
      }, "event");
      imported += 1;
    });
    setPreview(null);
    setToast(`${imported} imported, ${skipped} skipped, ${preview.duplicateIds.length} duplicates`);
  };

  return (
    <section className="calendar-layout">
      <div className="panel calendar-panel">
        <SectionHeader
          title={view === "month" ? monthName(dateKey(cursor)) : formatDate(selectedDate)}
          action={
            <div className="cluster calendar-view-actions">
              <Segmented className="calendar-tabs" value={view} onChange={setView} options={[["month", "Month"], ["week", "Week"], ["day", "Day"]]} />
              <label className="icon-button tactile" title="Import calendar file">
                <FileUp size={18} />
                <input hidden type="file" accept=".ics,text/calendar" onChange={(e) => importFile(e.target.files?.[0])} />
              </label>
            </div>
          }
        />
        <div className="calendar-controls">
          <button className="icon-button tactile" onClick={() => setCursor(shiftCursor(cursor, view, -1))}><ChevronLeft /></button>
          <button className="secondary tactile" onClick={() => { setCursor(currentMonthCursor()); setSelectedDate(todayISO()); }}>Today</button>
          <button className="icon-button tactile" onClick={() => setCursor(shiftCursor(cursor, view, 1))}><ChevronRight /></button>
        </div>
        {view === "month" && <MonthGrid days={days} cursor={cursor} state={state} selectedDate={selectedDate} setSelectedDate={setSelectedDate} />}
        {view === "week" && <WeekGrid cursor={cursor} state={state} selectedDate={selectedDate} setSelectedDate={setSelectedDate} />}
        {view === "day" && <DayPanel state={state} selectedDate={selectedDate} />}
      </div>

      <DateDetail state={state} selectedDate={selectedDate} items={selectedItems} openAdd={openAdd} setModal={setModal} />

      {preview && (
        <div className="modal-backdrop">
          <div className="modal ics-modal">
            <SectionHeader title="ICS Preview" action={<button className="icon-button tactile" onClick={() => setPreview(null)}><X size={18} /></button>} />
            {preview.duplicateIds.length > 0 && <p className="warning">Some events may already exist in your calendar.</p>}
            <div className="ics-list">
              {preview.events.map((event, index) => (
                <div className="ics-row" key={event.id}>
                  <input type="checkbox" checked={event.selected} onChange={(e) => setPreview((current) => ({
                    ...current,
                    events: current.events.map((item) => item.id === event.id ? { ...item, selected: e.target.checked } : item)
                  }))} />
                  <input value={event.title} onChange={(e) => updatePreviewEvent(setPreview, event.id, "title", e.target.value)} />
                  <input type="date" value={event.startDate} onChange={(e) => updatePreviewEvent(setPreview, event.id, "startDate", e.target.value)} />
                  <input type="time" value={event.startTime} onChange={(e) => updatePreviewEvent(setPreview, event.id, "startTime", e.target.value)} />
                  <input value={event.location} placeholder="Location" onChange={(e) => updatePreviewEvent(setPreview, event.id, "location", e.target.value)} />
                  <button className="icon-button tactile" onClick={() => setPreview((current) => ({ ...current, events: current.events.filter((_, i) => i !== index) }))}><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <button className="secondary tactile" onClick={() => setPreview(null)}>Cancel</button>
              {preview.duplicateIds.length > 0 && <button className="secondary tactile" onClick={() => confirmImport(false)}>Import anyway</button>}
              <button
                className="primary tactile"
                onClick={() => requestConfirm({
                  title: "Add imported events?",
                  message: "Do you want to add the selected events to your calendar?",
                  confirmLabel: "Add Events",
                  tone: "primary",
                  onConfirm: () => confirmImport(true)
                })}
              >
                Add Events
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function updatePreviewEvent(setPreview, id, key, value) {
  setPreview((current) => ({ ...current, events: current.events.map((event) => event.id === id ? { ...event, [key]: value } : event) }));
}

function calendarDays(cursor, firstDay) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = startOfWeek(first, firstDay);
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

function shiftCursor(cursor, view, direction) {
  const next = new Date(cursor);
  if (view === "month") next.setMonth(next.getMonth() + direction);
  if (view === "week") next.setDate(next.getDate() + direction * 7);
  if (view === "day") next.setDate(next.getDate() + direction);
  return next;
}

function MonthGrid({ days, cursor, state, selectedDate, setSelectedDate }) {
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return (
    <div className="month-grid">
      {labels.map((label) => <div className="weekday" key={label}>{label}</div>)}
      {days.map((day) => {
        const key = dateKey(day);
        const marks = markersForDate(state, key);
        return (
          <button
            key={key}
            className={`date-cell tactile ${day.getMonth() !== cursor.getMonth() ? "muted" : ""} ${selectedDate === key ? "selected" : ""} ${isBirthday(state.profile, key) ? "birthday" : ""}`}
            onClick={() => setSelectedDate(key)}
          >
            <span>{day.getDate()}</span>
            <div className="markers">{marks.slice(0, 5).map((mark) => <i key={mark} className={mark} />)}</div>
          </button>
        );
      })}
    </div>
  );
}

function WeekGrid({ cursor, state, selectedDate, setSelectedDate }) {
  const start = startOfWeek(cursor);
  return (
    <div className="week-grid">
      {Array.from({ length: 7 }, (_, index) => {
        const date = new Date(start);
        date.setDate(start.getDate() + index);
        const key = dateKey(date);
        return (
          <button key={key} className={`week-day tactile ${selectedDate === key ? "selected" : ""}`} onClick={() => setSelectedDate(key)}>
            <strong>{date.toLocaleDateString("en-IN", { weekday: "short" })}</strong>
            <span>{date.getDate()}</span>
            <small>{itemsForDate(state, key).length} items</small>
          </button>
        );
      })}
    </div>
  );
}

function DayPanel({ state, selectedDate }) {
  return <div className="day-panel"><MiniList title={formatDate(selectedDate)} items={flatItemsForDate(state, selectedDate)} empty="Nothing is scheduled for this date." field="title" /></div>;
}

function DateDetail({ state, selectedDate, items, openAdd, setModal }) {
  return (
    <aside className="panel date-detail">
      <SectionHeader title={formatDate(selectedDate)} />
      <div className="date-actions">
        {quickActions.slice(0, 8).map((action) => <button className="secondary tactile" key={`${action.kind}-${action.label}`} onClick={() => openAdd(action.kind, { date: selectedDate })}>{action.label.replace("Add ", "")}</button>)}
      </div>
      {isBirthday(state.profile, selectedDate) && <div className="birthday-card">Birthday: {state.profile.name}</div>}
      {Object.entries(items).map(([key, list]) => (
        <div className="date-section" key={key}>
          <h3>{sectionLabel(key)}</h3>
          {list.length ? list.map((item) => (
            <button className="item-row tactile" key={item.id} onClick={() => setModal({ kind: item.kind, item })}>
              <span>{item.title || item.name || item.source}</span>
              <small>{item.amount ? rupee.format(item.amount) : item.time || item.startTime || item.status}</small>
            </button>
          )) : <p className="empty-line">Nothing here.</p>}
        </div>
      ))}
    </aside>
  );
}

function WorkList({ type, state, openAdd, setModal, remove, upsert, requestConfirm }) {
  const config = {
    todo: { collection: "tasks", title: "Todo List", add: "task", kind: "task", label: "todo", date: "dueDate", status: ["All", "Today", "Upcoming", "Past", "Overdue", "Completed", "Pending", "In Progress", "Cancelled"] },
    task: { collection: "tasks", title: "Tasks", add: "task", kind: "task", label: "task", date: "dueDate", status: ["All", "Today", "Upcoming", "Past", "Overdue", "Completed", "Pending", "In Progress", "Cancelled"] },
    reminder: { collection: "reminders", title: "Reminders", add: "reminder", date: "date", status: ["All", "Today", "Upcoming", "Past", "Expired", "Completed", "Repeating"] },
    note: { collection: "notes", title: "Notes", add: "note", date: "date", status: ["All", "Today", "Pinned"] },
    event: { collection: "events", title: "Events", add: "event", date: "startDate", status: ["All", "Today", "Upcoming", "Past", "Imported", "Completed"] }
  }[type];
  config.kind = config.kind || type;
  config.label = config.label || type;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [subtaskDrafts, setSubtaskDrafts] = useState({});
  const [editingSubtask, setEditingSubtask] = useState(null);
  const list = state[config.collection]
    .filter((item) => matchesQuery(item, query))
    .filter((item) => matchesListFilter(item, filter, config.date));
  const updateSubtasks = (task, nextSubtasks) => {
    upsert("tasks", { ...task, subtasks: nextSubtasks }, "task");
  };
  const addSubtask = (task) => {
    const title = String(subtaskDrafts[task.id] || "").trim();
    if (!title) return;
    updateSubtasks(task, [...normalizeSubtasks(task.subtasks), { id: id("subtask"), title, status: "Pending" }]);
    setSubtaskDrafts((current) => ({ ...current, [task.id]: "" }));
  };
  const toggleSubtask = (task, subtaskId) => {
    updateSubtasks(task, normalizeSubtasks(task.subtasks).map((subtask) =>
      subtask.id === subtaskId ? { ...subtask, status: subtask.status === "Completed" ? "Pending" : "Completed", updatedAt: new Date().toISOString() } : subtask
    ));
  };
  const deleteSubtask = (task, subtask) => {
    const applyDelete = () => updateSubtasks(task, normalizeSubtasks(task.subtasks).filter((entry) => entry.id !== subtask.id));
    if (requestConfirm) {
      requestConfirm({
        title: "Delete subtask?",
        message: `Delete "${subtask.title}" from this todo?`,
        confirmLabel: "Delete",
        tone: "danger",
        onConfirm: applyDelete
      });
      return;
    }
    applyDelete();
  };
  const saveSubtaskEdit = (task, subtaskId, title) => {
    const nextTitle = String(title || "").trim();
    if (!nextTitle) return;
    updateSubtasks(task, normalizeSubtasks(task.subtasks).map((subtask) =>
      subtask.id === subtaskId ? { ...subtask, title: nextTitle, updatedAt: new Date().toISOString() } : subtask
    ));
    setEditingSubtask(null);
  };

  return (
    <section className="panel">
      <SectionHeader title={config.title} action={<button className="primary tactile" onClick={() => openAdd(config.add)}><Plus size={18} />Add</button>} />
      <Toolbar query={query} setQuery={setQuery} filter={filter} setFilter={setFilter} options={config.status} />
      <div className="list-grid">
        {list.length ? list.map((item) => {
          const isDone = item.status === "Completed";
          const displayTime = item.startTime || item.endTime
            ? [item.startTime, item.endTime].filter(Boolean).join(" - ")
            : item.time || item.dueTime || "";
          const subtasks = normalizeSubtasks(item.subtasks);
          const completedSubtasks = subtasks.filter((subtask) => subtask.status === "Completed").length;
          return (
          <article className={`record-card ${type} ${isDone ? "completed" : ""}`} key={item.id}>
            <div>
              <p className="eyebrow">{item.category || item.priority || item.status || (item.imported ? "Imported" : "")}</p>
              <h3 className={isDone ? "task-text--completed" : ""}>{item.title}</h3>
              <p>{item.description || item.content || item.notes || "No extra notes."}</p>
              {item.isMoneyReceive && (
                <div className="money-receivable-badge">
                  <CircleDollarSign size={14} />
                  <span>Receive <strong>{rupee.format(Number(item.moneyAmount || 0))}</strong> from <strong>{item.payerName}</strong></span>
                </div>
              )}
              <small>{formatDate(item[config.date])} {displayTime}</small>
              {type === "todo" && (
                <div className="todo-subtasks">
                  <div className="todo-progress">
                    <span>{completedSubtasks}/{subtasks.length || 0} finished</span>
                    <Progress value={subtasks.length ? (completedSubtasks / subtasks.length) * 100 : 0} />
                  </div>
                  {subtasks.length ? subtasks.map((subtask) => {
                    const editKey = `${item.id}:${subtask.id}`;
                    const isEditing = editingSubtask?.key === editKey;
                    const isSubDone = subtask.status === "Completed";
                    return (
                      <div className={`subtask-row ${isSubDone ? "done" : ""}`} key={subtask.id}>
                        <button className={`icon-button tactile ${isSubDone ? "active" : ""}`} type="button" title={isSubDone ? "Undo subtask" : "Complete subtask"} onClick={() => toggleSubtask(item, subtask.id)}>
                          <CheckCircle2 size={15} />
                        </button>
                        {isEditing ? (
                          <input value={editingSubtask.title} onChange={(event) => setEditingSubtask({ ...editingSubtask, title: event.target.value })} />
                        ) : <span className={isSubDone ? "task-text--completed" : ""}>{subtask.title}</span>}
                        {isEditing ? (
                          <button className="secondary tactile" type="button" onClick={() => saveSubtaskEdit(item, subtask.id, editingSubtask.title)}>Save</button>
                        ) : (
                          <button className="icon-button tactile" type="button" title="Edit subtask" onClick={() => setEditingSubtask({ key: editKey, title: subtask.title })}><Edit3 size={15} /></button>
                        )}
                        <button className="icon-button danger tactile" type="button" title="Delete subtask" onClick={() => deleteSubtask(item, subtask)}><Trash2 size={15} /></button>
                      </div>
                    );
                  }) : <p className="empty-line">No subtasks yet. Add steps below.</p>}
                  <div className="subtask-add">
                    <input value={subtaskDrafts[item.id] || ""} onChange={(event) => setSubtaskDrafts((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="Add subtask" />
                    <button className="secondary tactile" type="button" onClick={() => addSubtask(item)}><Plus size={15} />Add</button>
                  </div>
                </div>
              )}
            </div>
            <div className="record-actions">
              {(type === "todo" || type === "task" || type === "reminder") && (
                <button
                  className={`icon-button tactile ${isDone ? "active" : ""}`}
                  title={isDone ? "Undo completed" : "Mark completed"}
                  onClick={() => upsert(config.collection, { ...item, status: isDone ? (type === "reminder" ? "Active" : "Pending") : "Completed" }, config.kind)}
                >
                  <CheckCircle2 size={17} />
                </button>
              )}
              {type === "note" && (
                <button className="icon-button tactile" title="Pin note" onClick={() => upsert(config.collection, { ...item, pinned: !item.pinned }, config.kind)}>
                  <Tag size={17} />
                </button>
              )}
              <button className="icon-button tactile" title="Edit" onClick={() => setModal({ kind: config.kind, item })}><Edit3 size={17} /></button>
              <button className="icon-button danger tactile" title="Delete" onClick={() => remove(config.collection, item.id, config.label)}><Trash2 size={17} /></button>
            </div>
          </article>
          );
        }) : <EmptyState text={`No ${config.title.toLowerCase()} match this view.`} />}
      </div>
    </section>
  );
}

function ExpenseView({ state, expenseTab, setExpenseTab, selectedSalary, setSelectedSalary, selectedProject, setSelectedProject, openAdd, setModal, remove, upsert, requestConfirm, setToast, setState, setViewingImage = () => {} }) {
  const tabs = [["command", "Command"], ["daily", "Daily"], ["bills", "Bills"], ["salary", "Salary"], ["projects", "Projects"], ["analytics", "Analytics"]];
  const downloadReport = () => {
    openExpensePdfReport(state);
    setToast("PDF report opened");
  };
  return (
    <section className="panel">
      <SectionHeader
        title="Money Command Center"
        action={<div className="money-tabs-wrap"><Segmented className="money-tabs" value={expenseTab} onChange={setExpenseTab} options={tabs} /><button className="icon-button tactile pdf-tab-icon" type="button" title="Download money PDF" aria-label="Download money PDF" onClick={downloadReport}><Download size={16} /></button></div>}
      />
      {expenseTab === "command" && <MoneyCommand state={state} openAdd={openAdd} />}
      {expenseTab === "daily" && <DailyExpenses state={state} openAdd={openAdd} setModal={setModal} remove={remove} setToast={setToast} setViewingImage={setViewingImage} />}
      {expenseTab === "bills" && <BillsView state={state} openAdd={openAdd} setModal={setModal} remove={remove} upsert={upsert} />}
      {expenseTab === "salary" && <SalaryView state={state} selectedSalary={selectedSalary} setSelectedSalary={setSelectedSalary} openAdd={openAdd} setModal={setModal} remove={remove} setViewingImage={setViewingImage} />}
      {expenseTab === "projects" && <ProjectsView state={state} selectedProject={selectedProject} setSelectedProject={setSelectedProject} openAdd={openAdd} setModal={setModal} remove={remove} upsert={upsert} requestConfirm={requestConfirm} setToast={setToast} setState={setState} setViewingImage={setViewingImage} />}
      {expenseTab === "analytics" && <Analytics state={state} />}
    </section>
  );
}

function MoneyCommand({ state, openAdd }) {
  const money = useMoneyStats(state);
  const recent = allTransactions(state).slice(0, 10);
  return (
    <div className="money-grid">
      <MetricGrid
        metrics={[
          ["Total Credit", money.totalCredit],
          ["Total Debit", money.totalDebit],
          ["Total Balance", money.balance],
          ["Salary Spent", money.salarySpent],
          ["Daily Expense", money.dailyDebit],
          ["Active Budgets", money.activeBudget],
          ["Project Spending", money.projectDebit],
          ["Overspent", money.overspent]
        ]}
      />
      <section className="sub-panel">
        <SectionHeader title="Add Money Record" />
        <div className="quick-grid">
          <button className="quick-card tactile" onClick={() => openAdd("expense")}><IndianRupee />Daily Expense</button>
          <button className="quick-card tactile" onClick={() => openAdd("bill")}><Bell />Bill Tracker</button>
          <button className="quick-card tactile" onClick={() => openAdd("loan")}><Percent />EMI / Loan</button>
          <button className="quick-card tactile" onClick={() => openAdd("salary")}><CircleDollarSign />Salary</button>
          <button className="quick-card tactile" onClick={() => openAdd("project")}><BriefcaseBusiness />Expense Project</button>
        </div>
      </section>
      <section className="sub-panel">
        <SectionHeader title="Recent Transactions" />
        {recent.length ? recent.map((item) => <TransactionRow key={`${item.source}-${item.id}`} item={item} />) : <EmptyState text="No expenses added yet. Start tracking your spending." />}
      </section>
      <section className="sub-panel">
        <SectionHeader title="Credit vs Debit" />
        <BarPair credit={money.totalCredit} debit={money.totalDebit} />
      </section>
      <section className="sub-panel">
        <SectionHeader title="Warnings" />
        {projectAlerts(state).length ? projectAlerts(state).map((alert) => <AlertRow key={alert.id} alert={alert} />) : <EmptyState text="No budget warnings yet." />}
      </section>
    </div>
  );
}

function DailyExpenses({ state, openAdd, setModal, remove, setToast, setViewingImage = () => {} }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("This month");
  const list = state.expenses.filter((item) => matchesQuery(item, query)).filter((item) => matchesMoneyFilter(item, filter));
  const dailySplit = dailySplitSummary(list);
  const downloadDailyReport = () => {
    openExpensePdfReport(state, { mode: "daily", title: "LifePilot Daily Transactions Report", transactions: list });
    setToast("Daily PDF report opened");
  };
  return (
    <div>
      <Toolbar query={query} setQuery={setQuery} filter={filter} setFilter={setFilter} options={["All", "Today", "This week", "This month", "Last month", "Credit", "Debit"]} />
      <MetricGrid metrics={[["Daily Credit", sum(list, (e) => e.type === "Credit")], ["Daily Debit", sum(list, (e) => e.type === "Debit")], ["Balance", sum(list, (e) => e.type === "Credit") - sum(list, (e) => e.type === "Debit")], ["Today's Spending", sum(state.expenses, (e) => e.date === todayISO() && e.type === "Debit")]]} />
      {(() => {
        const salaryCredits = list.filter(e => e.category === "Salary" && e.type === "Credit");
        const totalSalaryInView = sum(salaryCredits, e => e.amount);
        if (totalSalaryInView > 0) {
          const totalDebit = sum(list, e => e.type === "Debit");
          return (
            <div className="salary-insights-banner">
              <Sparkles size={16} className="sparkle-icon" />
              <span>
                Salary Credit Detected: You received <strong>{rupee.format(totalSalaryInView)}</strong> in salary. 
                Your daily debit accounts for <strong>{Math.round((totalDebit / totalSalaryInView) * 100)}%</strong> of your salary.
              </span>
            </div>
          );
        }
        return null;
      })()}
      <div className="money-action-row spaced">
        <button className="primary tactile" onClick={() => openAdd("expense")}><Plus size={18} />Add Entry</button>
        <button className="icon-button tactile pdf-tab-icon" type="button" title="Download daily PDF" aria-label="Download daily PDF" onClick={downloadDailyReport}><Download size={16} /></button>
      </div>
      <RecordTable list={list} type="expense" setModal={setModal} remove={(id) => remove("expenses", id, "daily expense")} setViewingImage={setViewingImage} />
      <section className="sub-panel daily-split-panel">
        <SectionHeader title="Daily Split and Owes" />
        {dailySplit.settlements.length ? dailySplit.settlements.map((item, index) => (
          <div className="settlement-row" key={`${item.from}-${item.to}-${index}`}>
            <span>{item.from}</span>
            <strong>pays {rupee.format(item.amount)}</strong>
            <span>{item.to}</span>
          </div>
        )) : <EmptyState text="No daily split owes in this view." small />}
      </section>
    </div>
  );
}

function BillsView({ state, openAdd, setModal, remove, upsert }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("Unpaid");
  const list = state.bills
    .filter((item) => matchesQuery(item, query))
    .filter((item) => matchesBillFilter(item, filter))
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
  const unpaid = state.bills.filter((bill) => bill.status !== "Paid");
  const overdue = unpaid.filter((bill) => bill.dueDate < todayISO());
  const dueSoon = unpaid.filter((bill) => bill.dueDate >= todayISO() && bill.dueDate <= addDaysISO(todayISO(), 7));

  const unpaidWithSplits = unpaid.filter((bill) => bill.splits && bill.splits.length > 0);
  const totalCollectable = unpaidWithSplits.reduce((sum, bill) => {
    return sum + bill.splits.reduce((s, item) => s + amount(item.amount), 0);
  }, 0);
  const myTotalShare = sum(unpaid, (bill) => {
    const collected = bill.splits ? bill.splits.reduce((s, item) => s + amount(item.amount), 0) : 0;
    return Math.max(amount(bill.amount) - collected, 0);
  });

  return (
    <div>
      <Toolbar query={query} setQuery={setQuery} filter={filter} setFilter={setFilter} options={["All", "Unpaid", "Paid", "Overdue", "Due soon", "This month"]} />
      <MetricGrid metrics={[["Unpaid bills", sum(unpaid)], ["Paid bills", sum(state.bills, (bill) => bill.status === "Paid")], ["Overdue", sum(overdue)], ["Due soon", sum(dueSoon)]]} />
      
      {unpaidWithSplits.length > 0 && (
        <div className="bills-split-insights">
          <div className="insight-card">
            <Users size={18} className="insight-icon" />
            <div className="insight-content">
              <h4>Split Collections Insights</h4>
              <p>
                You have {unpaidWithSplits.length} unpaid bill{unpaidWithSplits.length === 1 ? "" : "s"} with active splits.
              </p>
              <div className="insight-stats">
                <div>
                  <span className="label">Total to collect:</span>
                  <strong className="collect-amount">{rupee.format(totalCollectable)}</strong>
                </div>
                <div>
                  <span className="label">Your remaining share:</span>
                  <strong className="share-amount">{rupee.format(myTotalShare)}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <button className="primary tactile spaced" onClick={() => openAdd("bill")}><Plus size={18} />Add Bill</button>
      <div className="record-table">
        {list.length ? list.map((bill) => (
          <div className="transaction-row" key={bill.id}>
            <div>
              <strong>{bill.title}</strong>
              <small>{bill.status} - due {formatDate(bill.dueDate)} - reminder {bill.reminderBefore || "None"}</small>
              {bill.splits && bill.splits.length > 0 && (() => {
                const total = amount(bill.amount);
                const collected = bill.splits.reduce((sum, item) => sum + amount(item.amount), 0);
                const remaining = Math.max(total - collected, 0);
                return (
                  <div className="bill-card-splits-info">
                    <span className="splits-detail">
                      Collect: {bill.splits.map(item => `${item.name}: ${rupee.format(item.amount)}`).join(", ")}
                    </span>
                    <span className="splits-divider">|</span>
                    <span className="my-share">
                      My share: <strong>{rupee.format(remaining)}</strong>
                    </span>
                  </div>
                );
              })()}
            </div>
            <span className={bill.status === "Paid" ? "credit" : bill.dueDate < todayISO() ? "debit" : ""}>{rupee.format(amount(bill.amount))}</span>
            <button className="icon-button tactile" title="Mark paid" onClick={() => upsert("bills", { ...bill, status: bill.status === "Paid" ? "Unpaid" : "Paid" }, "bill")}><CheckCircle2 size={16} /></button>
            <button className="icon-button tactile" onClick={() => setModal({ kind: "bill", item: bill })}><Edit3 size={16} /></button>
            <button className="icon-button tactile danger" onClick={() => remove("bills", bill.id, "bill")}><Trash2 size={16} /></button>
          </div>
        )) : <EmptyState text="No bills match this view." />}
      </div>
    </div>
  );
}

function getLoanPaymentStats(loan) {
  let paid = 0;
  let outstanding = 0;
  const totalMonths = amount(loan.totalMonths);
  const completedMonths = amount(loan.completedMonths);
  
  for (let i = 1; i <= totalMonths; i++) {
    let isPaid = i <= completedMonths;
    let monthKey = "";
    if (loan.startDate) {
      const start = new Date(`${loan.startDate}T12:00:00`);
      start.setMonth(start.getMonth() + (i - 1));
      monthKey = start.toISOString().slice(0, 7);
      isPaid = isLoanMonthPaid(loan, monthKey);
    }
    
    const emiVal = loan.customPayments?.[i] !== undefined 
      ? Number(loan.customPayments[i]) 
      : amount(loan.monthlyPayment);
      
    if (isPaid) {
      paid += emiVal;
    } else {
      outstanding += emiVal;
    }
  }
  
  // Add foreclosure amount if present
  paid += amount(loan.foreclosurePaidAmount);
  
  return { paid, outstanding };
}

function getInterestBreakdown(loan) {
  const principal = amount(loan.totalAmount);
  const rate = Number(loan.interestRate || 0);
  const period = loan.interestPeriod || "Annually";
  const months = amount(loan.totalMonths);
  const emi = amount(loan.monthlyPayment);
  const completed = amount(loan.completedMonths);
  
  if (principal <= 0 || rate <= 0 || months <= 0 || emi <= 0) {
    const totalRepayable = months * emi;
    const estTotalInterest = Math.max(0, totalRepayable - principal);
    const interestRatio = totalRepayable > 0 ? estTotalInterest / totalRepayable : 0;
    
    let paidAmount = 0;
    for (let i = 1; i <= completed; i++) {
      paidAmount += loan.customPayments?.[i] !== undefined 
        ? Number(loan.customPayments[i]) 
        : emi;
    }
    const estInterestPaid = paidAmount * interestRatio;
    const estOutstandingInterest = estTotalInterest - estInterestPaid;
    
    return {
      totalInterest: estTotalInterest,
      interestPaid: estInterestPaid,
      remainingInterest: estOutstandingInterest,
      isEstimated: true
    };
  }
  
  const monthlyRate = period === "Monthly" ? rate / 100 : rate / 12 / 100;
  let balance = principal;
  let totalInterestVal = 0;
  let interestPaidVal = 0;
  
  for (let i = 1; i <= months; i++) {
    const monthlyInterest = balance * monthlyRate;
    const monthlyPrincipal = Math.max(0, emi - monthlyInterest);
    balance = Math.max(0, balance - monthlyPrincipal);
    
    totalInterestVal += monthlyInterest;
    
    let isPaid = i <= completed;
    if (loan.startDate) {
      const start = new Date(`${loan.startDate}T12:00:00`);
      start.setMonth(start.getMonth() + (i - 1));
      const monthKey = start.toISOString().slice(0, 7);
      isPaid = isLoanMonthPaid(loan, monthKey);
    }
    
    if (isPaid) {
      interestPaidVal += monthlyInterest;
    }
  }
  
  return {
    totalInterest: totalInterestVal,
    interestPaid: interestPaidVal,
    remainingInterest: Math.max(0, totalInterestVal - interestPaidVal),
    isEstimated: false
  };
}

function LoansView({ state, openAdd, setModal, remove, upsert, requestConfirm, setToast, setState }) {
  const [selectedLoanId, setSelectedLoanId] = useState(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("Active");
  const [editingSalary, setEditingSalary] = useState(false);
  const [salaryInput, setSalaryInput] = useState("");

  const userSalary = Number(state.profile?.monthlySalary || 0);

  const saveSalary = () => {
    const val = Number(salaryInput);
    if (isNaN(val) || val < 0) {
      setToast("Enter a valid salary amount");
      return;
    }
    setState((current) => ({
      ...current,
      profile: { ...(current.profile || {}), monthlySalary: val }
    }));
    setEditingSalary(false);
    setToast("Monthly salary saved!");
  };

  const loans = (state.loans || [])
    .filter((item) => matchesQuery(item, query))
    .filter((item) => {
      if (filter === "All") return true;
      return item.status === filter;
    });

  const activeLoans = (state.loans || []).filter(loan => loan.status === "Active");
  const totalActiveEmi = sum(activeLoans, loan => loan.monthlyPayment);
  const remainingFreeSalary = Math.max(0, userSalary - totalActiveEmi);
  const dtiPercent = userSalary > 0 ? ((totalActiveEmi / userSalary) * 100).toFixed(1) : 0;

  // Compute last EMI date for each active loan
  const activeLoanInsights = activeLoans.map((loan) => {
    const remainingMonths = Math.max(0, amount(loan.totalMonths) - amount(loan.completedMonths));
    let lastEmiDate = "Unknown";
    if (remainingMonths === 0) {
      lastEmiDate = "Completed";
    } else if (loan.startDate) {
      const start = new Date(`${loan.startDate}T12:00:00`);
      start.setMonth(start.getMonth() + amount(loan.totalMonths) - 1);
      lastEmiDate = start.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    } else {
      const finalDate = new Date();
      finalDate.setMonth(finalDate.getMonth() + remainingMonths);
      lastEmiDate = finalDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    }
    const salaryShare = userSalary > 0 ? ((amount(loan.monthlyPayment) / userSalary) * 100).toFixed(1) : 0;
    return { ...loan, remainingMonths, lastEmiDate, salaryShare };
  });

  const closedLoans = (state.loans || []).filter(loan => loan.status !== "Active");
  const averageEmi = activeLoans.length ? totalActiveEmi / activeLoans.length : 0;
  const totalPrincipal = (state.loans || []).reduce((acc, loan) => acc + amount(loan.totalAmount), 0);

  let totalPaid = 0;
  let totalOutstanding = 0;
  (state.loans || []).forEach(loan => {
    const stats = getLoanPaymentStats(loan);
    totalPaid += stats.paid;
    if (loan.status === "Active") {
      totalOutstanding += stats.outstanding;
    }
  });

  let totalInterestPayable = 0;
  let totalInterestPaid = 0;
  let totalRemainingInterest = 0;
  (state.loans || []).forEach(loan => {
    if (Number(loan.interestRate) > 0) {
      const info = getInterestBreakdown(loan);
      totalInterestPayable += info.totalInterest;
      totalInterestPaid += info.interestPaid;
      totalRemainingInterest += info.remainingInterest;
    }
  });

  let nextUpcomingEmi = null;
  activeLoans.forEach(loan => {
    const nextDate = getNextUnpaidEmiDate(loan);
    if (nextDate) {
      if (!nextUpcomingEmi || nextDate < nextUpcomingEmi.date) {
        nextUpcomingEmi = {
          date: nextDate,
          title: loan.title,
          amount: loan.monthlyPayment
        };
      }
    }
  });

  const upcomingEmiTimeline = [];
  activeLoans.forEach(loan => {
    const nextDate = getNextUnpaidEmiDate(loan);
    if (nextDate) {
      let emiNum = amount(loan.completedMonths) + 1;
      if (loan.startDate) {
        const start = new Date(`${loan.startDate}T12:00:00`);
        const next = new Date(`${nextDate}-01T12:00:00`);
        const startMonths = start.getFullYear() * 12 + start.getMonth();
        const nextMonths = next.getFullYear() * 12 + next.getMonth();
        emiNum = Math.max(1, nextMonths - startMonths + 1);
      }
      
      const emiAmount = loan.customPayments?.[emiNum] !== undefined 
        ? Number(loan.customPayments[emiNum]) 
        : amount(loan.monthlyPayment);

      upcomingEmiTimeline.push({
        loan,
        date: nextDate,
        title: loan.title,
        amount: emiAmount,
        emiNum
      });
    }
  });
  upcomingEmiTimeline.sort((a, b) => a.date.localeCompare(b.date));

  const selectedLoan = (state.loans || []).find(l => l.id === selectedLoanId);
  const selectedLoanStats = selectedLoan ? getLoanPaymentStats(selectedLoan) : null;

  const handleEditPaymentAmount = (loan, emiNum, monthKey) => {
    const currentAmount = loan.customPayments?.[emiNum] !== undefined 
      ? loan.customPayments[emiNum] 
      : loan.monthlyPayment;
    
    const input = window.prompt(`Enter amount paid for EMI #${emiNum}:`, currentAmount);
    if (input === null) return;
    const newAmount = Number(input);
    if (isNaN(newAmount) || newAmount < 0) {
      alert("Please enter a valid positive amount.");
      return;
    }
    
    const customPayments = { ...(loan.customPayments || {}), [emiNum]: newAmount };
    
    let completedMonths = amount(loan.completedMonths);
    let paidMonths = [...(loan.paidMonths || [])];
    let status = loan.status;
    
    let isPaid = emiNum <= completedMonths;
    if (monthKey) {
      isPaid = isLoanMonthPaid(loan, monthKey);
    }
    
    if (!isPaid) {
      if (monthKey) {
        if (!paidMonths.includes(monthKey)) {
          paidMonths.push(monthKey);
        }
        if (emiNum > completedMonths) {
          completedMonths = emiNum;
        }
      } else {
        if (emiNum > completedMonths) {
          completedMonths = emiNum;
        }
      }
      if (completedMonths >= amount(loan.totalMonths)) {
        status = "Completed";
      }
    }
    
    upsert("loans", {
      ...loan,
      customPayments,
      completedMonths,
      paidMonths,
      status
    }, "loan");
    setToast(`EMI #${emiNum} payment updated to ${rupee.format(newAmount)}!`);
  };

  const handleMarkPaid = (loan) => {
    const today = todayISO();
    const currentMonth = today.slice(0, 7);
    const paidMonths = loan.paidMonths || [];
    
    if (paidMonths.includes(currentMonth)) {
      setToast("EMI for this month is already marked as paid!");
      return;
    }
    
    const nextCompleted = amount(loan.completedMonths) + 1;
    const nextStatus = nextCompleted >= amount(loan.totalMonths) ? "Completed" : loan.status;
    const nextPaidMonths = [...paidMonths, currentMonth];
    
    upsert("loans", {
      ...loan,
      completedMonths: nextCompleted,
      status: nextStatus,
      paidMonths: nextPaidMonths
    }, "loan");
    setToast("EMI marked as paid for this month!");
  };

  const handleToggleMonthPaid = (loan, emiNum, monthKey) => {
    let completedMonths = amount(loan.completedMonths);
    let paidMonths = [...(loan.paidMonths || [])];
    let status = loan.status;

    let isPaid = emiNum <= completedMonths;
    if (monthKey) {
      isPaid = isLoanMonthPaid(loan, monthKey);
    }

    if (isPaid) {
      if (monthKey) {
        paidMonths = paidMonths.filter(m => m !== monthKey);
      }
      completedMonths = Math.max(0, completedMonths - 1);
      if (status === "Completed") {
        status = "Active";
      }
      upsert("loans", {
        ...loan,
        completedMonths,
        paidMonths,
        status
      }, "loan");
      setToast(`EMI #${emiNum} marked as unpaid (undone).`);
    } else {
      if (monthKey && !paidMonths.includes(monthKey)) {
        paidMonths.push(monthKey);
      }
      if (emiNum > completedMonths) {
        completedMonths = emiNum;
      }
      if (completedMonths >= amount(loan.totalMonths)) {
        status = "Completed";
      }
      upsert("loans", {
        ...loan,
        completedMonths,
        paidMonths,
        status
      }, "loan");
      setToast(`EMI #${emiNum} marked as paid!`);
    }
  };

  const handleForeclose = (loan) => {
    const remainingAmountStr = String(amount(loan.monthlyPayment) * Math.max(0, amount(loan.totalMonths) - amount(loan.completedMonths)));
    const input = window.prompt(`Foreclosing "${loan.title}".\nEnter total foreclosure amount paid (including all settlements):`, remainingAmountStr);
    if (input === null) return;
    const paidAmount = Number(input);
    if (isNaN(paidAmount) || paidAmount < 0) {
      alert("Please enter a valid amount.");
      return;
    }

    upsert("loans", {
      ...loan,
      status: "Foreclosed",
      foreclosurePaidAmount: paidAmount
    }, "loan");
    setToast("Loan foreclosed successfully!");
  };

  return (
    <div className="loans-container split-view">
      <div className="loans-main">

        <Toolbar 
          query={query} 
          setQuery={setQuery} 
          filter={filter} 
          setFilter={setFilter} 
          options={["Active", "Completed", "Foreclosed", "All"]} 
        />

        <button className="primary tactile spaced" onClick={() => openAdd("loan")}>
          <Plus size={18} />Add EMI / Loan
        </button>

        <div className="loans-grid">
          {loans.length ? loans.map((loan) => {
            const nextDate = getNextUnpaidEmiDate(loan);
            
            let daysLeft = null;
            let overdueDays = null;
            if (nextDate) {
              const diffTime = new Date(`${nextDate}T12:00:00`) - new Date(`${todayISO()}T12:00:00`);
              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
              if (diffDays >= 0) {
                daysLeft = diffDays;
              } else {
                overdueDays = Math.abs(diffDays);
              }
            }

            const percent = Math.round((amount(loan.completedMonths) / amount(loan.totalMonths)) * 100) || 0;

            return (
              <button 
                key={loan.id} 
                className={`loan-card record-card tactile ${selectedLoanId === loan.id ? "selected" : ""}`}
                onClick={() => setSelectedLoanId(curr => curr === loan.id ? null : loan.id)}
              >
                <div className="loan-card-header">
                  <div>
                    <h3>{loan.title}</h3>
                    {loan.bankName && <p className="bank-name">{loan.bankName}</p>}
                  </div>
                  <span className={`status-badge badge-${loan.status.toLowerCase()}`}>{loan.status}</span>
                </div>
                
                <div className="loan-card-body">
                  <div className="emi-amount-row">
                    <span>Monthly EMI:</span>
                    <strong>{rupee.format(amount(loan.monthlyPayment))}</strong>
                  </div>
                  
                  <div className="progress-labels">
                    <span>{loan.completedMonths} / {loan.totalMonths} months paid</span>
                    <span>{percent}%</span>
                  </div>
                  <div className="progress-bar-track">
                    <div className="progress-bar-fill" style={{ width: `${percent}%` }} />
                  </div>

                  {loan.status === "Active" && nextDate && (
                    <div className="next-emi-info">
                      <Bell size={14} className="next-emi-icon" />
                      <span>
                        {daysLeft === 0 ? "EMI due today!" : 
                         daysLeft !== null ? `Next EMI: ${loan.emiDate ? nextDate.split("-")[2] : ""} (in ${daysLeft} days)` : 
                         `EMI Overdue by ${overdueDays} days!`}
                      </span>
                    </div>
                  )}
                </div>
              </button>
            );
          }) : <EmptyState text="No loans match this filter." />}
        </div>
      </div>

      <div className="sub-panel loan-detail-panel">
        {selectedLoan ? (
          <div className="loan-details">
            <div className="loan-details-header">
              <h2>{selectedLoan.title}</h2>
              {selectedLoan.bankName && <p className="bank-subtitle">{selectedLoan.bankName}</p>}
              <span className={`status-badge badge-${selectedLoan.status.toLowerCase()}`}>{selectedLoan.status}</span>
            </div>

            <div className="loan-details-grid card-grid-2">
              <div className="detail-stat">
                <span>Monthly Payment</span>
                <strong>{rupee.format(amount(selectedLoan.monthlyPayment))}</strong>
              </div>
              <div className="detail-stat">
                <span>Total Term</span>
                <strong>{selectedLoan.totalMonths} Months</strong>
              </div>
              <div className="detail-stat">
                <span>Paid Months</span>
                <strong>{selectedLoan.completedMonths} Months</strong>
              </div>
              <div className="detail-stat">
                <span>Remaining Months</span>
                <strong>{Math.max(0, amount(selectedLoan.totalMonths) - amount(selectedLoan.completedMonths))} Months</strong>
              </div>
              <div className="detail-stat highlight-stat">
                <span>Total Paid So Far</span>
                <strong className="text-success">{rupee.format(selectedLoanStats.paid)}</strong>
              </div>
              <div className="detail-stat highlight-stat">
                <span>Remaining Outstanding</span>
                <strong className="text-warning">{rupee.format(selectedLoanStats.outstanding)}</strong>
              </div>
              {(() => {
                const nextDate = getNextUnpaidEmiDate(selectedLoan);
                if (!nextDate) return null;
                const diffTime = new Date(`${nextDate}T12:00:00`) - new Date(`${todayISO()}T12:00:00`);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                const label = diffDays === 0 ? "due today" : diffDays > 0 ? `${diffDays} days left` : `overdue by ${Math.abs(diffDays)} days`;
                return (
                  <div className="detail-stat highlight-stat">
                    <span>Next EMI Date</span>
                    <strong>{formatDate(nextDate)} <span style={{ fontSize: "0.8rem", color: "var(--muted)", display: "block", marginTop: "0.15rem" }}>({label})</span></strong>
                  </div>
                );
              })()}
              {selectedLoan.totalAmount && (
                <div className="detail-stat">
                  <span>Total Principal</span>
                  <strong>{rupee.format(amount(selectedLoan.totalAmount))}</strong>
                </div>
              )}
              {selectedLoan.emiDate && (
                <div className="detail-stat">
                  <span>EMI Day</span>
                  <strong>Day {selectedLoan.emiDate}</strong>
                </div>
              )}
              {selectedLoan.startDate && (
                <div className="detail-stat">
                  <span>Start Date</span>
                  <strong>{formatDate(selectedLoan.startDate)}</strong>
                </div>
              )}
              {selectedLoan.foreclosurePaidAmount && (
                <div className="detail-stat highlight-stat">
                  <span>Foreclosure Paid</span>
                  <strong>{rupee.format(amount(selectedLoan.foreclosurePaidAmount))}</strong>
                </div>
              )}
            </div>

            {Number(selectedLoan.interestRate) > 0 && (() => {
              const interestInfo = getInterestBreakdown(selectedLoan);
              return (
                <div className="loan-interest-analysis">
                  <h4>Interest Analysis ({selectedLoan.interestRate}% {selectedLoan.interestPeriod})</h4>
                  <div className="interest-stats-grid card-grid-2">
                    <div className="detail-stat">
                      <span>Total Interest Payable</span>
                      <strong>{rupee.format(interestInfo.totalInterest)}</strong>
                    </div>
                    <div className="detail-stat">
                      <span>Estimated Interest Paid</span>
                      <strong className="text-success">{rupee.format(interestInfo.interestPaid)}</strong>
                    </div>
                    <div className="detail-stat">
                      <span>Remaining Interest</span>
                      <strong className="text-warning">{rupee.format(interestInfo.remainingInterest)}</strong>
                    </div>
                    <div className="detail-stat">
                      <span>Total Repayment (P + I)</span>
                      <strong>{rupee.format(amount(selectedLoan.totalAmount) + interestInfo.totalInterest)}</strong>
                    </div>
                  </div>
                  <div className="interest-disclaimer-box">
                    <Sparkles size={14} className="disclaimer-sparkle" />
                    <span>
                      This is generated based on loan details provided; actual amount might vary. Please verify with your bank.
                    </span>
                  </div>
                </div>
              );
            })()}

            {selectedLoan.notes && (
              <div className="loan-details-notes">
                <h4>Notes</h4>
                <p>{selectedLoan.notes}</p>
              </div>
            )}

            <div className="loan-actions-bar">
              {selectedLoan.status === "Active" && (
                <>
                  <button 
                    className="primary tactile" 
                    onClick={() => handleMarkPaid(selectedLoan)}
                  >
                    <CheckCircle2 size={16} /> Mark Month Paid
                  </button>
                  <button 
                    className="secondary tactile warn-button" 
                    onClick={() => handleForeclose(selectedLoan)}
                  >
                    <ShieldCheck size={16} /> Foreclose Loan
                  </button>
                </>
              )}
              <button 
                className="secondary tactile" 
                onClick={() => setModal({ kind: "loan", item: selectedLoan })}
              >
                <Edit3 size={16} /> Edit
              </button>
              <button 
                className="secondary tactile danger" 
                onClick={() => remove("loans", selectedLoan.id, "loan", {
                  apply: (current) => {
                    setSelectedLoanId(null);
                    return {
                      ...current,
                      loans: current.loans.filter(l => l.id !== selectedLoan.id)
                    };
                  }
                })}
              >
                <Trash2 size={16} /> Delete
              </button>
            </div>

            <div className="payment-history-section">
              <h3>Payment Schedule / History</h3>
              <div className="payment-history-list">
                {Array.from({ length: amount(selectedLoan.totalMonths) }, (_, index) => {
                  const emiNum = index + 1;
                  let monthNameStr = `EMI #${emiNum}`;
                  let monthYearStr = "";
                  
                  if (selectedLoan.startDate) {
                    const start = new Date(`${selectedLoan.startDate}T12:00:00`);
                    start.setMonth(start.getMonth() + index);
                    monthYearStr = start.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
                    monthNameStr = `${monthYearStr} (EMI #${emiNum})`;
                  }

                  let isPaid = emiNum <= amount(selectedLoan.completedMonths);
                  let monthKey = "";
                  if (selectedLoan.startDate) {
                    const start = new Date(`${selectedLoan.startDate}T12:00:00`);
                    start.setMonth(start.getMonth() + index);
                    monthKey = start.toISOString().slice(0, 7);
                    isPaid = isLoanMonthPaid(selectedLoan, monthKey);
                  }

                  const today = todayISO();
                  const currentMonthKey = today.slice(0, 7);
                  const isCurrentMonth = monthKey === currentMonthKey;

                  const emiAmount = selectedLoan.customPayments?.[emiNum] !== undefined 
                    ? Number(selectedLoan.customPayments[emiNum]) 
                    : amount(selectedLoan.monthlyPayment);

                  return (
                    <div className={`payment-history-row ${isPaid ? "paid" : "pending"} ${isCurrentMonth ? "current" : ""}`} key={emiNum}>
                      <div className="payment-info">
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <strong>EMI #{emiNum}</strong>
                          <span className="payment-amount-badge">{rupee.format(emiAmount)}</span>
                        </div>
                        {monthYearStr && <span className="payment-date">{monthYearStr}</span>}
                        {isCurrentMonth && <span className="current-badge">Current Month</span>}
                      </div>
                      <div className="payment-status-row" style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                        <span className={`status-text ${isPaid ? "text-success" : "text-muted"}`} style={{ fontWeight: 700, fontSize: "0.85rem" }}>
                          {isPaid ? "Paid" : "Pending"}
                        </span>
                        <button 
                          className="icon-button tactile" 
                          title="Edit amount for this specific month"
                          onClick={() => handleEditPaymentAmount(selectedLoan, emiNum, monthKey)}
                          style={{ padding: "0.25rem 0.4rem", borderRadius: "6px", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                        >
                          <Edit3 size={13} />
                        </button>
                        <button 
                          className={`mini-pay-button tactile ${isPaid ? "secondary danger" : "primary"}`}
                          onClick={() => handleToggleMonthPaid(selectedLoan, emiNum, monthKey)}
                          style={{ padding: "0.25rem 0.55rem", fontSize: "0.75rem", borderRadius: "6px" }}
                        >
                          {isPaid ? "Undo (Unpay)" : "Mark Paid"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="loan-portfolio-insights">
            <div className="loan-portfolio-header">
              <h2>EMI &amp; Loan Portfolio</h2>
              <p className="subtitle">Overall overview of active and closed liabilities, upcoming dues, and insights.</p>
            </div>

            {/* Monthly Salary Banner */}
            <div className="salary-banner-card panel tactile" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", padding: "1rem 1.25rem", marginBottom: "1.25rem", borderLeft: "5px solid var(--blue)", borderRadius: "14px", background: "linear-gradient(135deg, rgba(99,102,241,0.06) 0%, rgba(6,182,212,0.04) 100%)" }}>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase", color: "var(--muted)", letterSpacing: "0.04em" }}>Monthly Take-Home Salary</span>
                {editingSalary ? (
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "0.5rem" }}>
                    <input
                      type="number"
                      min="0"
                      autoFocus
                      value={salaryInput}
                      onChange={(e) => setSalaryInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") saveSalary(); if (e.key === "Escape") setEditingSalary(false); }}
                      placeholder="e.g. 50000"
                      style={{ flex: 1, maxWidth: "200px", padding: "0.5rem 0.75rem", border: "2px solid var(--ink)", borderRadius: "8px", fontWeight: 700, fontSize: "1.1rem" }}
                    />
                    <button className="primary tactile" style={{ padding: "0.4rem 1rem", fontSize: "0.85rem" }} onClick={saveSalary}>Save</button>
                    <button className="secondary tactile" style={{ padding: "0.4rem 0.75rem", fontSize: "0.85rem" }} onClick={() => setEditingSalary(false)}>Cancel</button>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginTop: "0.25rem" }}>
                    <strong style={{ fontSize: "1.6rem", fontWeight: 900 }}>
                      {userSalary > 0 ? rupee.format(userSalary) : "Not Set"}
                    </strong>
                    <button
                      className="secondary tactile"
                      style={{ padding: "0.25rem 0.75rem", fontSize: "0.78rem", borderRadius: "8px" }}
                      onClick={() => { setSalaryInput(userSalary > 0 ? String(userSalary) : ""); setEditingSalary(true); }}
                    >
                      <Edit3 size={13} /> {userSalary > 0 ? "Edit" : "Set Salary"}
                    </button>
                  </div>
                )}
              </div>
              {userSalary > 0 && activeLoans.length > 0 && (
                <div style={{ textAlign: "right", minWidth: "120px" }}>
                  <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>EMI-to-Income</span>
                  <div style={{ fontSize: "1.4rem", fontWeight: 900, color: Number(dtiPercent) > 50 ? "#dc3545" : Number(dtiPercent) > 35 ? "#fd7e14" : "#198754" }}>
                    {dtiPercent}%
                  </div>
                  <span style={{ fontSize: "0.7rem", color: "var(--muted)" }}>
                    {Number(dtiPercent) > 50 ? "⚠️ High Risk" : Number(dtiPercent) > 35 ? "⚡ Moderate" : "✅ Healthy"}
                  </span>
                </div>
              )}
            </div>

            {/* Salary vs EMI KPI Cards */}
            {userSalary > 0 && activeLoans.length > 0 && (
              <div className="portfolio-stats-grid" style={{ marginBottom: "1.25rem" }}>
                <div className="portfolio-stat-card" style={{ borderLeft: "4px solid #198754" }}>
                  <span className="stat-label">Monthly Salary</span>
                  <strong className="stat-value" style={{ color: "#198754" }}>{rupee.format(userSalary)}</strong>
                  <span className="stat-sub">Take-home income</span>
                </div>
                <div className="portfolio-stat-card" style={{ borderLeft: "4px solid #dc3545" }}>
                  <span className="stat-label">Total Active EMI</span>
                  <strong className="stat-value" style={{ color: "#dc3545" }}>{rupee.format(totalActiveEmi)}</strong>
                  <span className="stat-sub">{activeLoans.length} active EMIs</span>
                </div>
                <div className="portfolio-stat-card" style={{ borderLeft: `4px solid ${remainingFreeSalary < userSalary * 0.3 ? "#dc3545" : remainingFreeSalary < userSalary * 0.5 ? "#fd7e14" : "#198754"}` }}>
                  <span className="stat-label">Remaining Free Salary</span>
                  <strong className="stat-value" style={{ color: remainingFreeSalary < userSalary * 0.3 ? "#dc3545" : remainingFreeSalary < userSalary * 0.5 ? "#fd7e14" : "#198754" }}>
                    {rupee.format(remainingFreeSalary)}
                  </strong>
                  <span className="stat-sub">After all EMI deductions</span>
                </div>
              </div>
            )}

            <div className="portfolio-stats-grid">
              <div className="portfolio-stat-card active-emi-card">
                <span className="stat-label">Active Monthly EMI</span>
                <strong className="stat-value text-primary">{rupee.format(totalActiveEmi)}</strong>
                <span className="stat-sub">{activeLoans.length} active EMIs</span>
              </div>
              <div className="portfolio-stat-card outstanding-card">
                <span className="stat-label">Total Outstanding</span>
                <strong className="stat-value text-warning">{rupee.format(totalOutstanding)}</strong>
                <span className="stat-sub">Remaining to pay</span>
              </div>
              <div className="portfolio-stat-card paid-card">
                <span className="stat-label">Total Paid Till Now</span>
                <strong className="stat-value text-success">{rupee.format(totalPaid)}</strong>
                <span className="stat-sub">Completed payments</span>
              </div>
              {totalPrincipal > 0 && (
                <div className="portfolio-stat-card principal-card">
                  <span className="stat-label">Total Principal</span>
                  <strong className="stat-value">{rupee.format(totalPrincipal)}</strong>
                  <span className="stat-sub">Original borrowing</span>
                </div>
              )}
            </div>

            {(totalPaid + totalOutstanding) > 0 && (
              <div className="portfolio-progress-section">
                <div className="portfolio-progress-header">
                  <span>Portfolio Paid Off ({Math.round(totalPaid / (totalPaid + totalOutstanding) * 100)}%)</span>
                  <span>{rupee.format(totalPaid)} / {rupee.format(totalPaid + totalOutstanding)}</span>
                </div>
                <div className="progress-bar-track large-track">
                  <div 
                    className="progress-bar-fill fill-success" 
                    style={{ width: `${(totalPaid / (totalPaid + totalOutstanding)) * 100}%` }} 
                  />
                </div>
              </div>
            )}

            {/* Active EMI Payoff Timeline Table */}
            {activeLoanInsights.length > 0 && (
              <div style={{ marginTop: "1.25rem" }}>
                <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "1.05rem" }}>📅 Active Loan Payoff Timeline</h3>
                <p style={{ margin: "0 0 0.75rem 0", fontSize: "0.82rem", color: "var(--muted)" }}>Each active EMI with its salary share and calculated last EMI month.</p>
                <div className="autotrack-table-container">
                  <table className="autotrack-table">
                    <thead>
                      <tr>
                        <th>Loan / EMI</th>
                        <th>Monthly EMI</th>
                        <th>Progress</th>
                        <th>Remaining</th>
                        {userSalary > 0 && <th>% of Salary</th>}
                        <th>Last EMI Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeLoanInsights.map((loan) => {
                        const percent = Math.round((amount(loan.completedMonths) / amount(loan.totalMonths)) * 100) || 0;
                        return (
                          <tr key={loan.id}>
                            <td data-label="Loan / EMI">
                              <strong>{loan.title}</strong>
                              {loan.bankName && <><br /><small style={{ color: "var(--muted)" }}>{loan.bankName}</small></>}
                            </td>
                            <td data-label="Monthly EMI"><strong>{rupee.format(amount(loan.monthlyPayment))}</strong></td>
                            <td data-label="Progress">
                              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                <div className="progress-bar-track" style={{ width: "80px", height: "8px" }}>
                                  <div className="progress-bar-fill" style={{ width: `${percent}%` }} />
                                </div>
                                <span style={{ fontSize: "0.82rem", fontWeight: 700 }}>{percent}%</span>
                              </div>
                              <small style={{ color: "var(--muted)" }}>{loan.completedMonths}/{loan.totalMonths} months</small>
                            </td>
                            <td data-label="Remaining"><strong>{loan.remainingMonths}</strong> months</td>
                            {userSalary > 0 && (
                              <td data-label="% of Salary">
                                <span style={{
                                  fontWeight: 800,
                                  color: Number(loan.salaryShare) > 30 ? "#dc3545" : Number(loan.salaryShare) > 15 ? "#fd7e14" : "#198754",
                                  padding: "0.15rem 0.5rem",
                                  borderRadius: "6px",
                                  background: Number(loan.salaryShare) > 30 ? "rgba(220,53,69,0.1)" : Number(loan.salaryShare) > 15 ? "rgba(253,126,20,0.1)" : "rgba(25,135,84,0.1)"
                                }}>
                                  {loan.salaryShare}%
                                </span>
                              </td>
                            )}
                            <td data-label="Last EMI Date">
                              <strong style={{ color: "var(--ink)" }}>📅 {loan.lastEmiDate}</strong>
                            </td>
                          </tr>
                        );
                      })}
                      {userSalary > 0 && (
                        <tr style={{ fontWeight: 900, borderTop: "3px solid var(--ink)" }}>
                          <td data-label="Total"><strong>Total EMI Deduction</strong></td>
                          <td data-label="Monthly EMI"><strong style={{ color: "#dc3545" }}>{rupee.format(totalActiveEmi)}</strong></td>
                          <td data-label="Progress"></td>
                          <td data-label="Remaining"></td>
                          <td data-label="% of Salary">
                            <strong style={{ color: Number(dtiPercent) > 50 ? "#dc3545" : "#198754" }}>{dtiPercent}%</strong>
                          </td>
                          <td data-label="Last EMI Date"></td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="insights-secondary-details-row">
              <div className="secondary-detail-item">
                <span className="label">Total Loans Tracked</span>
                <strong>{state.loans?.length || 0} ({activeLoans.length} active, {closedLoans.length} closed)</strong>
              </div>
              {activeLoans.length > 1 && (
                <div className="secondary-detail-item">
                  <span className="label">Average Monthly EMI</span>
                  <strong>{rupee.format(averageEmi)}</strong>
                </div>
              )}
            </div>

            {totalInterestPayable > 0 && (
              <div className="portfolio-interest-summary">
                <h3>Portfolio Interest Summary</h3>
                <div className="portfolio-stats-grid">
                  <div className="portfolio-stat-card interest-payable-card">
                    <span className="stat-label">Total Interest Payable</span>
                    <strong className="stat-value">{rupee.format(totalInterestPayable)}</strong>
                    <span className="stat-sub">Across all interest-bearing loans</span>
                  </div>
                  <div className="portfolio-stat-card interest-paid-card">
                    <span className="stat-label">Total Interest Paid</span>
                    <strong className="stat-value text-success">{rupee.format(totalInterestPaid)}</strong>
                    <span className="stat-sub">Estimated paid so far</span>
                  </div>
                  <div className="portfolio-stat-card interest-remaining-card">
                    <span className="stat-label">Remaining Interest Dues</span>
                    <strong className="stat-value text-warning">{rupee.format(totalRemainingInterest)}</strong>
                    <span className="stat-sub">Future interest commitments</span>
                  </div>
                </div>
              </div>
            )}

            {nextUpcomingEmi ? (
              <div className="upcoming-emi-alert-card">
                <div className="alert-header">
                  <Bell size={18} className="alert-icon" />
                  <div>
                    <h4>Next Upcoming EMI</h4>
                    <p className="alert-subtitle">Due date is approaching soon</p>
                  </div>
                </div>
                {(() => {
                  const matchingLoan = activeLoans.find(l => l.title === nextUpcomingEmi.title);
                  let nextEmiNum = 1;
                  let nextEmiAmount = nextUpcomingEmi.amount;
                  if (matchingLoan) {
                    const nextDate = getNextUnpaidEmiDate(matchingLoan);
                    if (nextDate) {
                      let emiNum = amount(matchingLoan.completedMonths) + 1;
                      if (matchingLoan.startDate) {
                        const start = new Date(`${matchingLoan.startDate}T12:00:00`);
                        const next = new Date(`${nextDate}-01T12:00:00`);
                        const startMonths = start.getFullYear() * 12 + start.getMonth();
                        const nextMonths = next.getFullYear() * 12 + next.getMonth();
                        emiNum = Math.max(1, nextMonths - startMonths + 1);
                      }
                      nextEmiNum = emiNum;
                      nextEmiAmount = matchingLoan.customPayments?.[emiNum] !== undefined 
                        ? Number(matchingLoan.customPayments[emiNum]) 
                        : amount(matchingLoan.monthlyPayment);
                    }
                  }
                  
                  return (
                    <>
                      <div className="alert-details">
                        <div className="alert-details-row">
                          <span>Loan/EMI:</span>
                          <strong>{nextUpcomingEmi.title} (EMI #{nextEmiNum})</strong>
                        </div>
                        <div className="alert-details-row">
                          <span>Monthly payment:</span>
                          <strong className="text-warning">{rupee.format(nextEmiAmount)}</strong>
                        </div>
                        <div className="alert-details-row">
                          <span>EMI Due Date:</span>
                          <strong>{formatDate(nextUpcomingEmi.date)}</strong>
                        </div>
                      </div>
                      {(() => {
                        const diffTime = new Date(`${nextUpcomingEmi.date}T12:00:00`) - new Date(`${todayISO()}T12:00:00`);
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        return (
                          <div className="alert-actions">
                            <span className="due-countdown">
                              {diffDays === 0 ? "🔥 Due today!" : diffDays > 0 ? `⏰ In ${diffDays} days` : `⚠️ Overdue by ${Math.abs(diffDays)} days!`}
                            </span>
                            {matchingLoan && (
                              <button 
                                className="primary mini-pay-button tactile"
                                onClick={() => handleMarkPaid(matchingLoan)}
                              >
                                <CheckCircle2 size={14} /> Mark as Paid
                              </button>
                            )}
                          </div>
                        );
                      })()}
                    </>
                  );
                })()}
              </div>
            ) : activeLoans.length > 0 ? (
              <div className="no-upcoming-emi-card">
                <CheckCircle2 size={20} className="success-icon" />
                <span>No upcoming active EMIs. You're all clear!</span>
              </div>
            ) : null}

            {activeLoans.length > 0 && upcomingEmiTimeline.length > 0 && (
              <div className="timeline-section">
                <h3>Upcoming Payments Timeline</h3>
                <p className="section-desc">Chronological view of upcoming payments across all active loans.</p>
                <div className="timeline-list">
                  {upcomingEmiTimeline.slice(0, 5).map((item, idx) => {
                    const diffTime = new Date(`${item.date}T12:00:00`) - new Date(`${todayISO()}T12:00:00`);
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    return (
                      <div className="timeline-item" key={`${item.loan.id}-${item.date}`}>
                        <div className="timeline-badge-line">
                          <div className="timeline-dot"></div>
                          {idx < Math.min(upcomingEmiTimeline.length, 5) - 1 && <div className="timeline-line"></div>}
                        </div>
                        <div className="timeline-content">
                          <div className="timeline-main-info">
                            <strong>{item.title}</strong>
                            <span className="timeline-date">{formatDate(item.date)}</span>
                          </div>
                          <div className="timeline-pay-info">
                            <strong className="timeline-amount">{rupee.format(item.amount)}</strong>
                            <span className={`timeline-countdown ${diffDays <= 5 ? "urgent" : ""}`}>
                              {diffDays === 0 ? "Due today" : diffDays > 0 ? `${diffDays}d left` : `${Math.abs(diffDays)}d overdue`}
                            </span>
                            <button 
                              className="timeline-pay-btn tactile"
                              onClick={() => handleMarkPaid(item.loan)}
                              title="Mark as paid"
                            >
                              Pay
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="portfolio-ai-advisor">
              <div className="ai-advisor-header">
                <Sparkles size={16} className="ai-sparkle-icon" />
                <h4>AI Advisor Loan Tips</h4>
              </div>
              <div className="ai-advisor-tips-list">
                {(() => {
                  const tips = [];
                  if (activeLoans.length === 0) {
                    tips.push("No active loans tracked. Add your active loans using the '+ Add EMI / Loan' button to get insights, calendar schedules, and AI suggestions.");
                  } else {
                    const highPaidLoan = activeLoans.find(l => (amount(l.completedMonths) / amount(l.totalMonths)) >= 0.75);
                    if (highPaidLoan) {
                      const percent = Math.round((amount(highPaidLoan.completedMonths) / amount(highPaidLoan.totalMonths)) * 100);
                      tips.push(`Your loan "${highPaidLoan.title}" is ${percent}% paid off! Since it's nearing completion, you could prioritize foreclosing it to free up monthly cash flow.`);
                    }
                    
                    if (activeLoans.length > 1) {
                      tips.push(`You have ${activeLoans.length} active loans. To save the most money on interest, focus extra payments on the loan with the highest interest rate (Avalanche method). Alternatively, use the Snowball method (pay off the smallest loan first) to gain psychological wins.`);
                    }

                    if (totalActiveEmi > 0) {
                      tips.push(`Your combined monthly EMI commitment is ${rupee.format(totalActiveEmi)}. Ensure this amount is budgeted in your monthly expense plans on the respective EMI days.`);
                    }

                    const missingDates = activeLoans.filter(l => !l.startDate);
                    if (missingDates.length > 0) {
                      tips.push(`Tip: Add a start date for "${missingDates[0].title}" to automatically map it to the payment schedule timeline and calendar.`);
                    }
                  }
                  return tips.map((tip, index) => (
                    <p className="ai-tip-paragraph" key={index}>• {tip}</p>
                  ));
                })()}
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}

function SalaryView({ state, selectedSalary, setSelectedSalary, openAdd, setModal, remove, setViewingImage = () => {} }) {
  const active = state.salaries.find((salary) => salary.id === selectedSalary) || state.salaries[0];
  const linked = active ? state.salaryExpenses.filter((expense) => expense.salaryId === active.id) : [];
  const spent = sum(linked, (expense) => expense.type !== "Credit");

  const activeMonth = active?.month || (active?.receivedDate ? active.receivedDate.slice(0, 7) : "");
  let prevMonthStr = "";
  if (activeMonth) {
    const [yr, mo] = activeMonth.split("-").map(Number);
    const d = new Date(yr, mo - 2, 1);
    prevMonthStr = d.toISOString().slice(0, 7);
  }
  const prevSalaries = prevMonthStr 
    ? (state.salaries || []).filter(s => (s.month === prevMonthStr || (s.receivedDate && s.receivedDate.slice(0, 7) === prevMonthStr)))
    : [];
  const prevTotalAmount = sum(prevSalaries, s => s.amount);
  const prevLinkedExpenses = prevMonthStr
    ? (state.salaryExpenses || []).filter(e => prevSalaries.some(s => s.id === e.salaryId))
    : [];
  const prevTotalSpent = sum(prevLinkedExpenses, e => e.type !== "Credit");
  const prevRemaining = prevTotalAmount - prevTotalSpent;

  return (
    <div className="split-view">
      <div>
        <button className="primary tactile spaced" onClick={() => openAdd("salary")}><Plus size={18} />Add Salary</button>
        <div className="list-grid">
          {state.salaries.length ? state.salaries.map((salary) => (
            <button key={salary.id} className={`record-card tactile ${active?.id === salary.id ? "selected" : ""}`} onClick={() => setSelectedSalary(salary.id)}>
              <h3>{salary.title}</h3>
              <p>{salary.source}</p>
              <strong>{rupee.format(amount(salary.amount))}</strong>
            </button>
          )) : <EmptyState text="No salary added yet. Add your first salary record." />}
        </div>
      </div>
      <div className="sub-panel">
        {active ? (
          <>
            <SectionHeader title={active.title} action={<button className="secondary tactile" onClick={() => setModal({ kind: "salary", item: active })}>Edit</button>} />
            <MetricGrid metrics={[["Salary amount", active.amount], ["Total spent", spent], ["Remaining", amount(active.amount) - spent], ["Usage", `${Math.round((spent / Math.max(amount(active.amount), 1)) * 100)}%`]]} />
            <button className="primary tactile spaced" onClick={() => openAdd("salaryExpense", { salaryId: active.id })}>Add Expense from Salary</button>
            <RecordTable list={linked} type="salaryExpense" setModal={setModal} remove={(id) => remove("salaryExpenses", id, "salary-linked expense")} setViewingImage={setViewingImage} />
            
            {prevTotalAmount > 0 && (
              <div className="month-comparison-card">
                <h4>Month-on-Month Comparison</h4>
                <div className="comparison-grid">
                  <div className="comparison-item">
                    <span className="label">Last Month's Salary ({prevMonthStr})</span>
                    <strong className="value">{rupee.format(prevTotalAmount)}</strong>
                  </div>
                  <div className="comparison-item">
                    <span className="label">Last Month's Spent</span>
                    <strong className="value danger-text">{rupee.format(prevTotalSpent)}</strong>
                  </div>
                  <div className="comparison-item">
                    <span className="label">Last Month's Savings</span>
                    <strong className="value success-text">{rupee.format(prevRemaining)}</strong>
                  </div>
                </div>
                <div className="comparison-analysis">
                  {(() => {
                    const diffAmount = amount(active.amount) - prevTotalAmount;
                    const diffPercent = prevTotalAmount > 0 ? (diffAmount / prevTotalAmount) * 100 : 0;
                    const isIncrease = diffAmount >= 0;
                    return (
                      <p className="analysis-text">
                        {isIncrease ? "📈" : "📉"} Your salary for this month is <strong>{rupee.format(Math.abs(diffAmount))} ({Math.abs(diffPercent).toFixed(1)}%) {isIncrease ? "higher" : "lower"}</strong> than last month.
                        {prevRemaining > 0 && <span> You saved <strong>{rupee.format(prevRemaining)}</strong> in savings last month.</span>}
                      </p>
                    );
                  })()}
                </div>
              </div>
            )}
            
            <button 
              className="secondary danger tactile spaced" 
              onClick={() => remove("salaries", active.id, "salary", {
                apply: (current) => ({
                  ...current,
                  salaries: current.salaries.filter((s) => s.id !== active.id),
                  expenses: current.expenses.filter((e) => e.salaryId !== active.id)
                })
              })}
            >
              Delete Salary
            </button>
          </>
        ) : <EmptyState text="Select or create a salary record." />}
      </div>
    </div>
  );
}

function ProjectsView({ state, selectedProject, setSelectedProject, openAdd, setModal, remove, upsert, requestConfirm, setToast, setState, setViewingImage = () => {} }) {
  const active = state.projects.find((project) => project.id === selectedProject) || null;
  const transactions = active ? state.projectTransactions.filter((item) => item.projectId === active.id).sort(sortByDateDesc) : [];
  const [projectTab, setProjectTab] = useState("transactions");
  const shareText = active ? buildProjectShareText(active, transactions) : "";
  const fileInputRef = useRef(null);

  const downloadProjectReport = () => {
    if (!active) return;
    openExpensePdfReport(state, { mode: "project", title: `${active.name} Expense Project Report`, project: active });
    setToast("Project PDF report opened");
  };

  const copyShare = async () => {
    if (!shareText) return;
    try {
      await navigator.clipboard.writeText(shareText);
      setToast("Project share copied");
    } catch {
      setToast("Copy failed");
    }
  };

  const nativeShare = async () => {
    if (!shareText) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: `${active.name} project summary`, text: shareText });
        return;
      } catch {
        // User cancellation or blocked share falls back to copy.
      }
    }
    await copyShare();
  };

  const triggerImport = () => {
    fileInputRef.current?.click();
  };

  const handleImportTripJson = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        if (!parsed.trip || !parsed.trip.name) {
          setToast("Invalid JSON: trip object is missing or has no name.");
          return;
        }
        
        const tripData = parsed.trip;
        const projectRecord = {
          id: tripData.tripId || id("project"),
          name: tripData.name,
          type: "Trip",
          description: tripData.notes || "",
          startDate: tripData.startDate ? tripData.startDate.slice(0, 10) : todayISO(),
          endDate: tripData.endedAt ? tripData.endedAt.slice(0, 10) : todayISO(),
          budget: tripData.budget || 0,
          participants: (tripData.participants || []).map(p => p.name),
          status: tripData.status === "ended" ? "Completed" : "Active",
          notes: tripData.notes || "",
          updatedAt: new Date().toISOString()
        };

        const transactionRecords = (parsed.expenses || []).map(exp => ({
          id: exp.expenseId || id("projectTransaction"),
          projectId: projectRecord.id,
          title: exp.title || "Expense",
          amount: amount(exp.amount),
          type: "Debit",
          splitMode: "Equal split",
          category: exp.categoryId || "Custom",
          date: exp.date ? exp.date.slice(0, 10) : todayISO(),
          time: exp.date ? exp.date.slice(11, 16) : "",
          paidBy: exp.paidBy?.name || "",
          owedBy: "",
          participants: projectRecord.participants,
          paymentMethod: "UPI",
          notes: exp.notes || "",
          updatedAt: new Date().toISOString()
        }));

        setState((current) => {
          const exists = current.projects.some(p => p.id === projectRecord.id);
          const nextProjects = exists
            ? current.projects.map(p => p.id === projectRecord.id ? projectRecord : p)
            : [projectRecord, ...current.projects];
          
          const cleanTransactions = current.projectTransactions.filter(t => t.projectId !== projectRecord.id);
          const nextTransactions = [...transactionRecords, ...cleanTransactions];

          return {
            ...current,
            projects: nextProjects,
            projectTransactions: nextTransactions
          };
        });
        
        setToast(`Trip "${projectRecord.name}" imported with ${transactionRecords.length} expenses!`);
        setSelectedProject(projectRecord.id);
      } catch (err) {
        console.error(err);
        setToast("Failed to parse JSON file.");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="split-view">
      <div>
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.85rem" }}>
          <button className="primary tactile" onClick={() => openAdd("project")} style={{ margin: 0 }}><Plus size={18} />Create Project</button>
          <button className="secondary tactile" onClick={triggerImport} style={{ margin: 0 }}><Upload size={18} />Import Trip</button>
          <input type="file" ref={fileInputRef} accept=".json" onChange={handleImportTripJson} style={{ display: "none" }} />
        </div>
        <div className="list-grid project-card-grid">
          {state.projects.length ? state.projects.map((project) => <ProjectCard key={project.id} state={state} project={project} active={active?.id === project.id} onClick={() => setSelectedProject(active?.id === project.id ? "" : project.id)} />) : <EmptyState text="No active expense projects. Create a trip, renovation, or custom project." />}
        </div>
      </div>
      <div className="sub-panel">
        {active ? (
          <>
            <SectionHeader title={active.name} action={<button className="secondary tactile" onClick={() => setModal({ kind: "project", item: active })}>Edit</button>} />
            <ProjectDashboard state={state} project={active} />
            {active.isCloud && (
              <div className="panel" style={{ margin: "1rem 0", padding: "1.1rem" }}>
                <SectionHeader title="Cloud Room Sharing" />
                <div className="share-info-box">
                  <div className="share-info-row">
                    <span>Room ID:</span>
                    <strong>{active.id}</strong>
                  </div>
                  <div className="share-info-row">
                    <span>Room PIN:</span>
                    <strong>{active.pin}</strong>
                  </div>
                  <div className="share-info-row" style={{ wordBreak: "break-all" }}>
                    <span>Share Link:</span>
                    <a href="#" onClick={(e) => {
                      e.preventDefault();
                      window.location.href = `/project/${active.id}`;
                    }}>
                      {window.location.origin}/project/{active.id}
                    </a>
                  </div>
                </div>
                <div className="cluster" style={{ gap: "0.5rem", marginTop: "0.5rem" }}>
                  <button className="primary tactile" onClick={() => {
                    window.location.href = `/project/${active.id}`;
                  }}>Open Cloud Room</button>
                  <button className="secondary tactile" onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/project/${active.id}`);
                    setToast("Link copied!");
                  }}>Copy Link</button>
                  <button className="secondary tactile" onClick={() => {
                    navigator.clipboard.writeText(active.pin);
                    setToast("PIN copied!");
                  }}>Copy PIN</button>
                  <button className="secondary tactile" onClick={() => {
                    const text = `Join my LifePilot Shared Expense Room: "${active.name}"\nLink: ${window.location.origin}/project/${active.id}\nPIN: ${active.pin}`;
                    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
                  }}>WhatsApp</button>
                  <button className="secondary tactile" onClick={() => {
                    const subject = `Join my Shared Expense Room: ${active.name}`;
                    const body = `Hi,\n\nJoin my LifePilot Shared Expense Room: "${active.name}"\nLink: ${window.location.origin}/project/${active.id}\nPIN: ${active.pin}`;
                    window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, "_blank");
                  }}>Email</button>
                  <button 
                    className={`secondary tactile ${active.sharing_enabled === false ? "active" : ""}`} 
                    onClick={async () => {
                      try {
                        const nextVal = active.sharing_enabled === false;
                        await updateCloudProject(active.id, { sharing_enabled: nextVal });
                        upsert("projects", { ...active, sharing_enabled: nextVal }, "project");
                        setToast(nextVal ? "Sharing enabled" : "Sharing disabled");
                      } catch (err) {
                        setToast("Failed to toggle sharing: " + err.message);
                      }
                    }}
                  >
                    {active.sharing_enabled === false ? "Enable Sharing" : "Disable Sharing"}
                  </button>
                  <button 
                    className="secondary danger tactile" 
                    onClick={() => {
                      requestConfirm({
                        title: "Clear Chat?",
                        message: "Are you sure you want to clear all chat messages in this cloud room? This action cannot be undone.",
                        confirmLabel: "Clear Chat",
                        onConfirm: async () => {
                          try {
                            await clearCloudMessages(active.id);
                            await addCloudActivity(active.id, "clear_chat", `${state.profile?.name || "Owner"} cleared the chat room`, state.profile?.name || "Owner");
                            setToast("Chat cleared");
                          } catch (err) {
                            setToast("Failed to clear chat: " + err.message);
                          }
                        }
                      });
                    }}
                  >
                    Clear Chat
                  </button>
                </div>
              </div>
            )}
            <div className="cluster spaced">
              <button className="primary tactile" onClick={() => openAdd("projectTransaction", { projectId: active.id })}>Add Transaction</button>
              <button className="secondary tactile" onClick={() => setModal({ kind: "participants", item: active })}>Participants</button>
              {active.status === "Completed" ? (
                <button className="secondary tactile" onClick={() => upsert("projects", { ...active, status: "Active" }, "project")}>Restart</button>
              ) : (
                <>
                  {active.status === "Paused" ? <button className="secondary tactile" onClick={() => upsert("projects", { ...active, status: "Active" }, "project")}>Continue</button> : <button className="secondary tactile" onClick={() => upsert("projects", { ...active, status: "Paused" }, "project")}>Pause</button>}
                  <button className="secondary tactile" onClick={() => upsert("projects", { ...active, status: "Completed" }, "project")}>End</button>
                </>
              )}
            </div>
            <div className="cluster project-share-actions">
              <button className="icon-button tactile pdf-tab-icon" type="button" title="Download project PDF" aria-label="Download project PDF" onClick={downloadProjectReport}><Download size={16} /></button>
              <button className="secondary tactile" onClick={nativeShare}><Share2 size={17} />Share</button>
              <button className="secondary tactile" onClick={copyShare}><Copy size={17} />Copy</button>
            </div>
            <ProjectParticipantBreakdown project={active} transactions={transactions} />
            <Segmented value={projectTab} onChange={setProjectTab} options={[["transactions", "Transactions"], ["split", "Split"]]} />
            {projectTab === "transactions" ? (
              <DateGroupedRecordTable list={transactions} type="projectTransaction" setModal={setModal} remove={(id) => remove("projectTransactions", id, "project transaction")} project={active} upsert={upsert} requestConfirm={requestConfirm} setViewingImage={setViewingImage} />
            ) : (
              <ProjectSplitView project={active} transactions={transactions} upsert={upsert} requestConfirm={requestConfirm} setViewingImage={setViewingImage} />
            )}
            <button
              className="secondary danger tactile spaced"
              onClick={() => remove("projects", active.id, "project", {
                title: "Delete project?",
                message: "Deleting this project will remove all expenses, participants, and history inside it. Are you sure you want to continue?",
                confirmLabel: "Delete Project",
                apply: (current) => ({
                  ...current,
                  projects: current.projects.filter((project) => project.id !== active.id),
                  projectTransactions: current.projectTransactions.filter((transaction) => transaction.projectId !== active.id)
                })
              })}
            >
              Delete Project
            </button>
          </>
        ) : <EmptyState text="Select a project card to open its transactions, split, PDF, and share options." />}
      </div>
    </div>
  );
}

function Analytics({ state }) {
  const [range, setRange] = useState("month");
  const [source, setSource] = useState("All");
  const [projectId, setProjectId] = useState("All");
  const [chartMode, setChartMode] = useState("Category");
  const [chartType, setChartType] = useState("bar");
  const sourceOptions = ["All", "Daily Expense", "Bill Tracker", "Salary", "Salary-Linked Expense", "Project Expense"];
  const projectOptions = [["All", "All projects"], ...state.projects.map((project) => [project.id, project.name])];
  const transactions = allTransactions(state)
    .filter((item) => range === "all" || inRange(item.date, range))
    .filter((item) => source === "All" || (source === "Project Expense" ? item.projectId : item.source === source))
    .filter((item) => projectId === "All" || item.projectId === projectId);
  const byCategory = groupAmounts(transactions.filter((item) => item.type === "Debit"), "category");
  const byMonth = groupByMonth(transactions.filter((item) => item.type === "Debit"));
  const bySource = groupAmounts(transactions.filter((item) => item.type === "Debit"), "source");
  const byPayment = groupAmounts(transactions.filter((item) => item.type === "Debit"), "paymentMethod");
  const byProject = groupAmounts(transactions.filter((item) => item.type === "Debit" && item.projectId).map((item) => ({ ...item, projectName: state.projects.find((project) => project.id === item.projectId)?.name || "Project" })), "projectName");
  const byBillTimeline = groupByDate((state.bills || []).filter((bill) => bill.status !== "Paid"));
  const byDay = groupByDate(transactions.filter((item) => item.type === "Debit"));
  const byParticipant = groupParticipantBalances(state, projectId);
  const chartData = { Category: byCategory, Daily: byDay, Month: byMonth, Source: bySource, Payment: byPayment, Project: byProject, Bills: byBillTimeline, Participants: byParticipant }[chartMode] || byCategory;
  const totalCredit = sum(transactions, (item) => item.type === "Credit");
  const totalDebit = sum(transactions, (item) => item.type === "Debit");
  const totalBills = sum(state.bills || [], (bill) => bill.status !== "Paid");
  const netBalance = totalCredit - totalDebit;
  return (
    <div className="analytics-grid">
      <section className="sub-panel span-2 analytics-dashboard-head">
        <SectionHeader title="Analytics Dashboard" />
        <div className="filter-grid">
          <label>Range<Select value={range} onChange={setRange} options={rangeOptions()} /></label>
          <label>Source<Select value={source} onChange={setSource} options={sourceOptions} /></label>
          <label>Project<Select value={projectId} onChange={setProjectId} options={projectOptions} /></label>
          <label>Dataset<Select value={chartMode} onChange={setChartMode} options={["Category", "Daily", "Month", "Source", "Payment", "Project", "Bills", "Participants"]} /></label>
          <label>Visual<Select value={chartType} onChange={setChartType} options={[["bar", "Bar"], ["line", "Line"], ["pie", "Pie"]]}/></label>
        </div>
        <div className="insight-grid">
          <article className="insight-card good"><span>Credit</span><strong>{rupee.format(totalCredit)}</strong><small>Filtered money in</small></article>
          <article className="insight-card warn"><span>Debit</span><strong>{rupee.format(totalDebit)}</strong><small>Filtered money out</small></article>
          <article className={`insight-card ${netBalance < 0 ? "warn" : "good"}`}><span>Balance</span><strong>{rupee.format(netBalance)}</strong><small>Credit minus debit</small></article>
          <article className="insight-card"><span>Unpaid bills</span><strong>{rupee.format(totalBills)}</strong><small>Open bill timeline</small></article>
        </div>
      </section>
      <MetricGrid metrics={[["Highest category", highestLabel(byCategory)], ["Highest project", highestLabel(byProject)], ["Payment leader", highestLabel(byPayment)], ["Participant balance", highestLabel(byParticipant)]]} />
      <Chart title={`${chartMode} Dashboard`} data={chartData} type={chartType} />
      <Chart title="Daily Expense Trend" data={byDay} type="line" />
      <Chart title="Category Spend" data={byCategory} type="pie" />
      <Chart title="Project Spending" data={byProject} type="bar" />
      <Chart title="Bill Due Timeline" data={byBillTimeline} type="line" />
      <Chart title="Participant Balances" data={byParticipant} type="bar" />
      <section className="sub-panel">
        <SectionHeader title="Credit vs Debit" />
        <BarPair credit={totalCredit} debit={totalDebit} />
      </section>
      <section className="sub-panel">
        <SectionHeader title="Project-wise Spending" />
        {state.projects.length ? state.projects.map((project) => <ProjectRow key={project.id} state={state} project={project} />) : <EmptyState text="No project analytics yet." />}
      </section>
    </div>
  );
}

function SettingsView({ state, setState, setToast, requestNotifications, setModal, remove, upsert, requestConfirm, connectGmail, disconnectGmail }) {
  const [storageInfo, setStorageInfo] = useState(null);

  useEffect(() => {
    let alive = true;
    estimateStorage().then((info) => {
      if (alive) setStorageInfo(info);
    });
    return () => {
      alive = false;
    };
  }, [state]);

  const exportData = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `lifepilot-backup-${todayISO()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const importData = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const incoming = JSON.parse(String(reader.result));
        setState({ ...emptyState, ...incoming, settings: { ...emptyState.settings, ...(incoming.settings || {}) } });
        setToast("Data imported");
      } catch {
        setToast("Import failed");
      }
    };
    reader.readAsText(file);
  };
  const setSetting = (key, value) => setState((current) => ({ ...current, settings: { ...current.settings, [key]: value } }));
  const testTelegram = async () => {
    try {
      await testTelegramNotifications();
      setState((current) => ({
        ...current,
        settings: {
          ...current.settings,
          telegramLastStatus: "Telegram test sent",
          telegramLastError: ""
        }
      }));
      setToast("Telegram test sent");
    } catch (error) {
      setState((current) => ({
        ...current,
        settings: {
          ...current.settings,
          telegramLastStatus: "Telegram test failed",
          telegramLastError: error.message || "Telegram test failed"
        }
      }));
      setToast(error.message || "Telegram test failed");
    }
  };
  const syncTelegramNow = async () => {
    try {
      const result = await syncTelegramNotifications(state);
      setState((current) => ({
        ...current,
        settings: {
          ...current.settings,
          telegramLastSyncAt: new Date().toISOString(),
          telegramLastStatus: `${result.synced || 0} reminders synced`,
          telegramLastError: ""
        }
      }));
      setToast("Telegram reminders synced");
    } catch (error) {
      setState((current) => ({
        ...current,
        settings: {
          ...current.settings,
          telegramLastStatus: "Sync failed",
          telegramLastError: error.message || "Telegram sync failed"
        }
      }));
      setToast(error.message || "Telegram sync failed");
    }
  };

  const useCurrentWeatherLocation = () => {
    if (!navigator.geolocation) {
      setToast("Location permission is not supported");
      return;
    }
    setState((current) => ({ ...current, weather: { ...current.weather, loading: true, error: "" } }));
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const label = "Current location";
        try {
          const snapshot = await fetchWeatherSnapshot({
            location: label,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          });
          setState((current) => ({
            ...current,
            settings: { ...current.settings, weatherEnabled: true, weatherLocation: label },
            weather: { ...current.weather, ...snapshot }
          }));
          setToast("Weather updated");
        } catch {
          setState((current) => ({
            ...current,
            settings: { ...current.settings, weatherEnabled: true, weatherLocation: label },
            weather: {
              ...current.weather,
              location: label,
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              loading: false,
              error: "Weather update failed",
              updatedAt: ""
            }
          }));
          setToast("Location saved. Weather will retry on Home.");
        }
      },
      () => {
        setState((current) => ({ ...current, weather: { ...current.weather, loading: false, error: "Location permission denied" } }));
        setToast("Location permission denied");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 15 * 60 * 1000 }
    );
  };

  return (
    <section className="settings-grid">
      <div className="panel">
        <SectionHeader title="Profile" action={<button className="secondary tactile" onClick={() => setModal({ kind: "profile", item: state.profile })}>Edit Profile</button>} />
        <div className="panel modern-theme-toggle-panel">
          <div className="modern-theme-banner">
            <div>
              <strong>✨ Modern Theme</strong>
              <p>Switch to a sleek, dark-accent UI with glassmorphism cards and smooth animations.</p>
            </div>
            <Toggle label="" checked={!!state.settings.modernTheme} onChange={(value) => setSetting("modernTheme", value)} />
          </div>
        </div>
        <div className="profile-large">
          {state.profile?.image ? <img loading="lazy" src={state.profile.image} alt="" /> : <UserRound size={42} />}
          <div>
            <h3>{state.profile?.name}</h3>
            <p>{state.profile?.bio || "No bio added."}</p>
            <small>{formatDate(state.profile?.dob)}</small>
          </div>
        </div>
      </div>

      <div className="panel">
        <SectionHeader title="Notifications" action={<button className="secondary tactile" onClick={requestNotifications}>Request</button>} />
        {[
          ["notificationsEnabled", "Enable all notifications"],
          ["taskNotifications", "Task notifications"],
          ["reminderNotifications", "Reminder notifications"],
          ["eventNotifications", "Event notifications"],
          ["budgetAlerts", "Budget alerts"],
          ["salaryReminder", "Salary reminder"],
          ["dailyExpenseReminder", "Daily expense reminder"],
          ["birthdayNotification", "Birthday notification"],
          ["telegramNotifications", "Telegram bot notifications"]
        ].map(([key, label]) => <Toggle key={key} label={label} checked={state.settings[key]} onChange={(value) => setSetting(key, value)} />)}<label>Repeated notification frequency<input type="number" min="2" max="3" value={state.settings.repeatHours} onChange={(e) => setSetting("repeatHours", e.target.value)} /></label>
      </div>

      <div className="panel">
        <SectionHeader
          title="Telegram Bot"
          action={<div className="cluster"><button className="secondary tactile" type="button" onClick={syncTelegramNow}>Sync now</button><button className="secondary tactile" type="button" onClick={testTelegram}>Test</button></div>}
        />
        <Toggle label="Send reminders through Telegram when app is closed" checked={state.settings.telegramNotifications} onChange={(value) => setSetting("telegramNotifications", value)} />
        <div className="storage-status">
          <div>
            <span>Backend sync</span>
            <strong>{state.settings.telegramLastStatus || "Not synced yet"}</strong>
          </div>
          <div>
            <span>Last sync</span>
            <strong>{state.settings.telegramLastSyncAt ? new Date(state.settings.telegramLastSyncAt).toLocaleString("en-IN") : "Waiting"}</strong>
          </div>
        </div>
        {state.settings.telegramLastError && <p className="warning">{state.settings.telegramLastError}</p>}
        <p className="helper-text">Telegram works while the app is closed after Supabase tables and Vercel env vars are configured.</p>
      </div>

      <div className="panel">
        <SectionHeader title="Gmail Integration" />
        <label>Google OAuth Client ID
          <input
            value={state.settings.gmailClientId || ""}
            onChange={(e) => setSetting("gmailClientId", e.target.value)}
            placeholder="GCP OAuth Client ID (Web Application)"
          />
        </label>
        <div className="storage-status">
          <div>
            <span>OAuth Status</span>
            <strong>{state.settings.gmailAccessToken ? "Connected" : "Disconnected"}</strong>
          </div>
          {state.settings.gmailAccessToken && (
            <div>
              <span>Expires</span>
              <strong>
                {state.settings.gmailTokenExpiry
                  ? new Date(state.settings.gmailTokenExpiry).toLocaleTimeString()
                  : "N/A"}
              </strong>
            </div>
          )}
        </div>
        <p className="helper-text">Authorized Redirect URI to whitelist in Google Cloud Console: <code>{window.location.origin}</code></p>
        <div className="cluster spaced">
          {state.settings.gmailAccessToken ? (
            <button className="secondary danger tactile" type="button" onClick={disconnectGmail}>Disconnect Gmail</button>
          ) : (
            <button className="primary tactile" type="button" onClick={connectGmail}>Connect Gmail</button>
          )}
          <button
            className="secondary tactile"
            type="button"
            onClick={() => {
              setSetting("gmailProcessedEmailIds", []);
              setToast("Gmail sync history cleared");
            }}
          >
            Reset Sync History
          </button>
        </div>
      </div>

      <div className="panel">
        <SectionHeader title="Preferences" />
        <Toggle label="Show salary in daily dashboard" checked={state.settings.showSalaryInDaily} onChange={(value) => setSetting("showSalaryInDaily", value)} />
        <Toggle label="Show completed tasks on dashboard" checked={state.settings.showCompletedOnDashboard} onChange={(value) => setSetting("showCompletedOnDashboard", value)} />
        <label>Calendar start day<Select value={state.settings.calendarStartDay} onChange={(value) => setSetting("calendarStartDay", value)} options={[["Sunday", "Sunday"], ["Monday", "Monday"]]} /></label>
      </div>

      <div className="panel">
        <SectionHeader title="Weather" action={<button className="secondary tactile" type="button" onClick={useCurrentWeatherLocation}><CloudSun size={17} />Use current</button>} />
        <Toggle label="Show live weather on Home" checked={state.settings.weatherEnabled} onChange={(value) => setSetting("weatherEnabled", value)} />
        <label>Weather location<input value={state.settings.weatherLocation || ""} onChange={(e) => {
          const value = e.target.value;
          setState((current) => ({
            ...current,
            settings: { ...current.settings, weatherLocation: value },
            weather: { ...current.weather, location: value, current: value === current.weather.location ? current.weather.current : null, updatedAt: "" }
          }));
        }} placeholder="Mumbai, Delhi, Bangalore..." /></label>
        <button className="secondary tactile" type="button" onClick={useCurrentWeatherLocation}>Update current location</button>
        <p className="helper-text">Weather uses Open-Meteo when online and keeps the last result saved for offline viewing.</p>
      </div>

      <div className="panel">
        <SectionHeader title="AI Settings" />
        <Toggle label="Enable AI assistant" checked={state.settings.aiEnabled} onChange={(value) => setSetting("aiEnabled", value)} />
        <label>
          Free model
          <Select
            value={state.settings.aiModel || FREE_GEMINI_MODELS[0].id}
            onChange={(value) => setSetting("aiModel", value)}
            options={FREE_GEMINI_MODELS.map((entry) => [entry.id, `${entry.label} (${entry.limit})`])}
          />
        </label>
        <Toggle label="AI expense category suggestions" checked={state.settings.aiExpenseCategory} onChange={(value) => setSetting("aiExpenseCategory", value)} />
        <Toggle label="AI monthly summary" checked={state.settings.aiMonthlySummary} onChange={(value) => setSetting("aiMonthlySummary", value)} />
        <Toggle label="AI reminder suggestions" checked={state.settings.aiReminderSuggestions} onChange={(value) => setSetting("aiReminderSuggestions", value)} />
        <Toggle label="AI task breakdown" checked={state.settings.aiTaskBreakdown} onChange={(value) => setSetting("aiTaskBreakdown", value)} />
        <div style={{ marginTop: "1rem", borderTop: "1px dashed var(--line)", paddingTop: "1rem" }}>
          <Toggle label="Enable Local LLM (Ollama/LM Studio)" checked={state.settings.localLlmEnabled} onChange={(value) => setSetting("localLlmEnabled", value)} />
          {state.settings.localLlmEnabled && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "0.75rem" }}>
              <label>Local LLM Endpoint URL
                <input
                  value={state.settings.localLlmUrl || "http://localhost:11434"}
                  onChange={(e) => setSetting("localLlmUrl", e.target.value)}
                  placeholder="e.g. http://localhost:11434 or Ngrok URL"
                />
              </label>
              <label>Local Model Name
                <input
                  value={state.settings.localModelName || "llama3.2"}
                  onChange={(e) => setSetting("localModelName", e.target.value)}
                  placeholder="e.g. llama3.2, mistral, qwen2.5-coder"
                />
              </label>
              <p className="helper-text" style={{ margin: 0 }}>
                If enabled, LifePilot will attempt to route AI tasks (chat & summaries) directly to your local endpoint first. If it is offline or times out (1.5s), it will automatically fallback to Gemini.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="panel">
        <SectionHeader title="Categories" action={<button className="primary tactile" onClick={() => setModal({ kind: "category" })}>Add Category</button>} />
        <div className="category-list">
          {state.categories.map((category) => (
            <div className="category-pill" key={category.id} style={{ "--cat": category.color }}>
              <span>{category.name}</span>
              <small>{category.type}</small>
              <button className="icon-button tactile" onClick={() => setModal({ kind: "category", item: category })}><Edit3 size={15} /></button>
              <button className="icon-button tactile danger" onClick={() => {
                const used = allTransactions(state).some((item) => item.category === category.name);
                if (used) {
                  setToast("Category is used in existing records");
                  return;
                }
                remove("categories", category.id, "category");
              }}><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <SectionHeader title="AutoTrack Settings" />
        <label>Default Fuel Price (per Litre)
          <input
            type="number"
            step="0.01"
            min="0"
            value={state.settings.defaultFuelPrice !== undefined ? state.settings.defaultFuelPrice : 102.98}
            onChange={(e) => setSetting("defaultFuelPrice", Number(e.target.value) || 0)}
          />
        </label>
      </div>

      <div className="panel">
        <SectionHeader title="Data Management" />
        <div className="storage-status">
          <div>
            <span>Offline database</span>
            <strong>IndexedDB active</strong>
          </div>
          <div>
            <span>Estimated usage</span>
            <strong>{storageInfo ? `${formatBytes(storageInfo.usage || 0)} / ${formatBytes(storageInfo.quota || 0)}` : "Available"}</strong>
          </div>
        </div>
        <div className="cluster">
          <button className="secondary tactile" onClick={exportData}><Download size={18} />Export data</button>
          <label className="secondary tactile import-label"><Upload size={18} />Import data<input hidden type="file" accept="application/json" onChange={(e) => importData(e.target.files?.[0])} /></label>
          <button
            className="secondary danger tactile"
            onClick={() => requestConfirm({
              title: "Delete everything?",
              message: "Are you sure you want to delete all app data? This will remove your profile, tasks, reminders, notes, events, expenses, salary records, projects, and settings. This action cannot be undone.",
              confirmLabel: "Delete Everything",
              tone: "danger",
              onConfirm: async () => {
                await clearPersistedState(STORE_KEY);
                setState(emptyState);
              }
            })}
          >
            Reset app
          </button>
        </div>
      </div>
    </section>
  );
}

function VaultView({ state, upsert, setToast, setModal, remove }) {
  const [vaultReveal, setVaultReveal] = useState(null);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [pinFilter, setPinFilter] = useState("All");
  const typeOptions = ["All", ...uniqueList(state.credentials.map((credential) => credential.type))];
  const filtered = state.credentials
    .filter((credential) => matchesQuery(credential, query))
    .filter((credential) => typeFilter === "All" || credential.type === typeFilter)
    .filter((credential) => pinFilter === "All" || (pinFilter === "Pinned" ? credential.pinned : !credential.pinned))
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || String(a.title).localeCompare(String(b.title)));
  const pinnedCount = state.credentials.filter((credential) => credential.pinned).length;

  return (
    <section className="vault-page">
      <div className="hero-panel vault-hero raised">
        <div>
          <p className="eyebrow">Private local vault</p>
          <h2>Secure Vault</h2>
          <p>{state.credentials.length} credentials saved, {pinnedCount} pinned. Details stay locked until PIN unlock.</p>
        </div>
        <button className="primary tactile" onClick={() => setModal({ kind: "credential" })}><KeyRound size={18} />Add Credential</button>
      </div>

      <section className="panel">
        <div className="vault-warning">
          <ShieldCheck size={20} />
          <span>Secrets are encrypted locally and are not included in AI API requests. PIN is required every time details are revealed.</span>
        </div>
        <div className="vault-toolbar">
          <label className="search-box"><Search size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search cards, banks, usernames, URLs" /></label>
          <label className="filter-box"><Filter size={18} /><Select value={typeFilter} onChange={setTypeFilter} options={typeOptions} /></label>
          <Segmented value={pinFilter} onChange={setPinFilter} options={[["All", "All"], ["Pinned", "Pinned"], ["Unpinned", "Unpinned"]]} />
        </div>
        <div className="cluster spaced">
          {filtered.length > 1 && <button className="secondary tactile" onClick={() => setVaultReveal({ credentials: filtered })}><Eye size={16} />View filtered</button>}
          {state.credentials.length > 1 && <button className="secondary tactile" onClick={() => setVaultReveal({ credentials: state.credentials })}><Eye size={16} />View all</button>}
        </div>
      </section>

      <div className="credential-grid vault-grid">
        {filtered.length ? filtered.map((credential) => (
          <article className={`credential-card ${credentialTypeClass(credential.type)} ${credential.pinned ? "pinned" : ""}`} key={credential.id}>
            <div>
              <p className="eyebrow">{credential.type}</p>
              <h3>{credential.title}</h3>
              <p>{credential.url || credential.username || "No public metadata added."}</p>
            </div>
            <div className="record-actions credential-actions">
              <button className="icon-button tactile" title={credential.pinned ? "Unpin" : "Pin"} onClick={() => upsert("credentials", { ...credential, pinned: !credential.pinned }, "credential")}><Tag size={16} /></button>
              <button className="icon-button tactile" title="View" onClick={() => setVaultReveal({ credentials: [credential] })}><Eye size={16} /></button>
              <button className="icon-button tactile" title="Edit" onClick={() => setModal({ kind: "credential", item: credential })}><Edit3 size={16} /></button>
              <button className="icon-button tactile danger" title="Delete" onClick={() => remove("credentials", credential.id, "credential")}><Trash2 size={16} /></button>
            </div>
          </article>
        )) : <EmptyState text="No credentials match this vault view." />}
      </div>

      {vaultReveal && <CredentialRevealModal records={vaultReveal.credentials} close={() => setVaultReveal(null)} setToast={setToast} />}
    </section>
  );
}

function EntityModal({ state, modal, close, upsert, setState, setToast }) {
  const initial = getInitialForm(modal.kind, modal.item, modal.context, state);
  const [form, setForm] = useState(initial);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event) => {
    event.preventDefault();
    const validation = validateForm(modal.kind, form);
    if (validation) {
      setError(validation);
      return;
    }
    if (modal.kind === "profile") {
      setState((current) => ({ ...current, profile: form }));
      setToast("Profile saved");
      close();
      return;
    }
    if (modal.kind === "participants") {
      const parsedParticipants = splitParticipants(form.participants);
      if (modal.item?.isCloud && hasSupabase()) {
        setLoading(true);
        try {
          const prjId = modal.item.id;
          const existingParticipants = await getCloudParticipants(prjId);
          const currentNames = existingParticipants.map(p => p.name);
          
          for (const name of parsedParticipants) {
            if (!currentNames.includes(name)) {
              await addCloudParticipant(prjId, name, "participant");
            }
          }
          for (const name of currentNames) {
            if (!parsedParticipants.includes(name) && existingParticipants.find(p => p.name === name)?.role !== "owner") {
              await removeCloudParticipant(prjId, name);
            }
          }
          await addCloudActivity(
            prjId,
            "update_participants",
            `${state.profile?.name || "Owner"} updated project participants`,
            state.profile?.name || "Owner"
          );
        } catch (err) {
          console.error("Failed to sync participants to cloud", err);
        } finally {
          setLoading(false);
        }
      }
      upsert("projects", { ...modal.item, participants: parsedParticipants }, "project");
      close();
      return;
    }
    if (modal.kind === "project") {
      const normalized = normalizeForm("project", form);
      if (normalized.isCloud) {
        if (!hasSupabase()) {
          setError("Supabase backend is not configured in the environment.");
          return;
        }
        setLoading(true);
        try {
          const isEdit = Boolean(modal.item);
          const prjId = modal.item?.id || generateCloudProjectId(normalized.name, normalized.type);
          normalized.id = prjId;
          
          if (!isEdit) {
            await createCloudProject({
              id: prjId,
              name: normalized.name,
              type: normalized.type,
              budget: Number(normalized.budget || 0),
              start_date: normalized.startDate,
              end_date: normalized.endDate,
              status: normalized.status || "Active",
              pin: normalized.pin,
              owner_name: state.profile?.name || "Owner",
              sharing_enabled: true
            });
            await addCloudParticipant(prjId, state.profile?.name || "Owner", "owner");
            if (normalized.participants && normalized.participants.length > 0) {
              for (const p of normalized.participants) {
                if (p.trim() && p !== (state.profile?.name || "Owner")) {
                  await addCloudParticipant(prjId, p.trim(), "participant");
                }
              }
            }
            await addCloudActivity(
              prjId, 
              "create", 
              `${state.profile?.name || "Owner"} created cloud project "${normalized.name}"`, 
              state.profile?.name || "Owner"
            );
          } else {
            await updateCloudProject(prjId, {
              name: normalized.name,
              type: normalized.type,
              budget: Number(normalized.budget || 0),
              start_date: normalized.startDate,
              end_date: normalized.endDate,
              status: normalized.status,
              pin: normalized.pin
            });
            const existingParticipants = await getCloudParticipants(prjId);
            const currentNames = existingParticipants.map(p => p.name);
            const newNames = normalized.participants || [];
            
            for (const name of newNames) {
              if (!currentNames.includes(name)) {
                await addCloudParticipant(prjId, name, "participant");
              }
            }
            for (const name of currentNames) {
              if (!newNames.includes(name) && existingParticipants.find(p => p.name === name)?.role !== "owner") {
                await removeCloudParticipant(prjId, name);
              }
            }
            await addCloudActivity(
              prjId, 
              "update_project", 
              `${state.profile?.name || "Owner"} updated project details`, 
              state.profile?.name || "Owner"
            );
          }
          
          upsert("projects", normalized, "project");
          setToast("Cloud project saved and synced");
          close();
          return;
        } catch (err) {
          console.error("Cloud project creation failed", err);
          setError("Failed to sync project to Supabase: " + err.message);
          return;
        } finally {
          setLoading(false);
        }
      }
    }
    if (modal.kind === "projectTransaction") {
      const normalized = normalizeForm("projectTransaction", form);
      const parentProject = state.projects.find(p => p.id === normalized.projectId);
      if (parentProject?.isCloud && hasSupabase()) {
        setLoading(true);
        try {
          const syncId = normalized.id || ("projectTransaction-" + Math.random().toString(36).substring(2, 11));
          normalized.id = syncId;
          const dbRecord = {
            id: syncId,
            project_id: normalized.projectId,
            title: normalized.title,
            amount: Number(normalized.amount || 0),
            category: normalized.category,
            date: normalized.date,
            time: normalized.time || "",
            paid_by: normalized.paidBy || state.profile?.name || "Owner",
            owed_by: normalized.owedBy || "",
            participants: normalized.participants || [],
            payment_method: normalized.paymentMethod || "UPI",
            notes: normalized.notes || "",
            created_by: state.profile?.name || "Owner"
          };
          await upsertCloudExpense(dbRecord);
          
          const actionLabel = modal.item ? "edited" : "added";
          await addCloudActivity(
            normalized.projectId,
            modal.item ? "edit_expense" : "add_expense",
            `${state.profile?.name || "Owner"} ${actionLabel} expense "${normalized.title}" of ₹${normalized.amount}`,
            state.profile?.name || "Owner"
          );
          
          upsert("projectTransactions", normalized, "projectTransaction");
          setToast("Transaction synced to cloud");
          close();
          return;
        } catch (err) {
          console.error("Cloud transaction creation failed", err);
          setError("Failed to sync transaction to Supabase: " + err.message);
          return;
        } finally {
          setLoading(false);
        }
      }
    }
    if (modal.kind === "credential") {
      const secret = pickCredentialSecret(form);
      const hasNewSecret = Object.values(secret).some((value) => String(value || "").trim());
      if (!modal.item && !hasNewSecret) {
        setError("Add at least one private credential field.");
        return;
      }
      const encrypted = hasNewSecret ? await encryptWithAppPin(secret) : modal.item.encrypted;
      upsert("credentials", {
        id: modal.item?.id,
        title: form.title.trim(),
        type: form.type,
        url: form.url.trim(),
        username: form.username.trim(),
        notes: form.notes.trim(),
        pinned: Boolean(form.pinned),
        encrypted,
        fieldNames: Object.keys(secret).filter((key) => String(secret[key] || "").trim()),
        updatedAt: new Date().toISOString()
      }, "credential");
      close();
      return;
    }
    const collection = collectionForKind(modal.kind);
    upsert(collection, normalizeForm(modal.kind, form), modal.kind);
    close();
  };

  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={submit}>
        <SectionHeader title={modal.item ? `Edit ${kindLabel(modal.kind)}` : `Add ${kindLabel(modal.kind)}`} action={<button type="button" className="icon-button tactile" onClick={close} disabled={loading}><X size={18} /></button>} />
        <div className="form-grid">
          {fieldsForKind(modal.kind, state, form).map((field) => <Field key={field.name} field={field} value={form[field.name]} set={set} form={form} disabled={loading} />)}
          {error && <p className="validation wide">{error}</p>}
          {loading && (
            <p className="wide" style={{
              color: "var(--ink)",
              background: "linear-gradient(135deg, #e3f2fd, #bbdefb)",
              padding: "0.75rem",
              borderRadius: "13px",
              margin: 0,
              fontSize: "0.9rem",
              textAlign: "center",
              fontWeight: "600",
              boxShadow: "var(--shadow-inset)"
            }}>
              🔄 Syncing with cloud database, please wait...
            </p>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary tactile" onClick={close} disabled={loading}>Cancel</button>
          <button className="primary tactile" type="submit" disabled={loading}>
            {loading ? "Syncing..." : (modal.item ? "Save Changes" : "Add")}
          </button>
        </div>
      </form>
    </div>
  );
}

function ConfirmModal({ dialog, close }) {
  const [working, setWorking] = useState(false);
  const confirm = async () => {
    setWorking(true);
    try {
      await dialog.onConfirm?.();
      close();
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <section className={`confirm-modal tone-${dialog.tone || "danger"}`}>
        <div className="confirm-icon">
          <Trash2 size={28} />
        </div>
        <div>
          <h2>{dialog.title}</h2>
          <p>{dialog.message}</p>
        </div>
        <div className="modal-actions">
          <button className="secondary tactile" type="button" onClick={close} disabled={working}>Cancel</button>
          <button className={`primary tactile ${dialog.tone === "danger" ? "danger-action" : ""}`} type="button" onClick={confirm} disabled={working}>
            {working ? "Working..." : dialog.confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

function pickCredentialSecret(form) {
  return {
    accountNumber: form.accountNumber || "",
    cardNumber: form.cardNumber || "",
    expiry: form.expiry || "",
    cvv: form.cvv || "",
    cardPin: form.cardPin || "",
    password: form.password || "",
    recovery: form.recovery || "",
    extraSecret: form.extraSecret || ""
  };
}

function CredentialRevealModal({ records, close, setToast }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [revealed, setRevealed] = useState([]);
  const [working, setWorking] = useState(false);

  const reveal = async (event) => {
    event.preventDefault();
    setWorking(true);
    setError("");
    try {
      if (!(await isValidPin(pin))) {
        setError("Wrong PIN. Details stay locked.");
        setPin("");
        return;
      }
      const unlocked = await Promise.all(records.map(async (record) => ({
        ...record,
        secret: await decryptCredentialPayload(record, pin)
      })));
      setRevealed(unlocked);
      setPin("");
    } catch {
      setError("Could not unlock this credential. Re-enter PIN or save the record again.");
    } finally {
      setWorking(false);
    }
  };

  const copy = async (value) => {
    try {
      await navigator.clipboard.writeText(String(value || ""));
      setToast("Copied");
    } catch {
      setToast("Copy failed");
    }
  };

  return (
    <div className="modal-backdrop">
      <section className="modal vault-modal">
        <SectionHeader title="Unlock Credentials" action={<button className="icon-button tactile" onClick={close}><X size={18} /></button>} />
        {!revealed.length ? (
          <form className="form-grid" onSubmit={reveal}>
            <p className="vault-warning wide"><ShieldCheck size={20} />PIN is checked locally. Credential values are not sent to AI or any public API.</p>
            <label className="wide">PIN<input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} type="password" inputMode="numeric" autoComplete="off" placeholder="Enter PIN" autoFocus /></label>
            {error && <p className="validation wide">{error}</p>}
            <div className="modal-actions wide">
              <button className="secondary tactile" type="button" onClick={close}>Cancel</button>
              <button className="primary tactile" type="submit" disabled={working}>{working ? "Unlocking..." : "Unlock"}</button>
            </div>
          </form>
        ) : (
          <div className="credential-grid reveal-grid">
            {revealed.map((record) => (
              <article className={`credential-card revealed ${credentialTypeClass(record.type)}`} key={record.id}>
                <p className="eyebrow">{record.type}</p>
                <h3>{record.title}</h3>
                {record.url && <CredentialField label="URL" value={record.url} copy={copy} />}
                {record.username && <CredentialField label="Username" value={record.username} copy={copy} />}
                {Object.entries(record.secret || {}).filter(([, value]) => String(value || "").trim()).map(([key, value]) => (
                  <CredentialField key={key} label={credentialFieldLabel(key)} value={value} copy={copy} />
                ))}
                {record.notes && <p>{record.notes}</p>}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function CredentialField({ label, value, copy }) {
  return (
    <div className="credential-field">
      <span>{label}</span>
      <strong>{value}</strong>
      <button className="icon-button tactile" onClick={() => copy(value)}><Copy size={15} /></button>
    </div>
  );
}

function credentialFieldLabel(key) {
  return {
    accountNumber: "Account Number",
    cardNumber: "Card Number",
    expiry: "Expiry",
    cvv: "CVV",
    cardPin: "Card PIN",
    password: "Password",
    recovery: "Recovery",
    extraSecret: "Extra Secret"
  }[key] || key;
}

function credentialTypeClass(type) {
  return `credential-${String(type || "custom").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function AiAssistant({ state, setState, upsert, setToast, close }) {
  const [input, setInput] = useState("");
  const [manualJson, setManualJson] = useState("");
  const [jsonToolsOpen, setJsonToolsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [model, setModel] = useState(state.settings.aiModel || FREE_GEMINI_MODELS[0].id);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const messages = state.aiMessages || [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, loading, jsonToolsOpen]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const scrollH = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(Math.max(scrollH, 44), 116)}px`;
    }
  }, [input]);

  const saveMessages = (recipe) => {
    setState((current) => ({
      ...current,
      aiMessages: typeof recipe === "function" ? recipe(current.aiMessages || []) : recipe
    }));
  };

  const addMessage = (message) => {
    const record = { id: id("msg"), createdAt: new Date().toISOString(), ...message };
    saveMessages((current) => [...current, record].slice(-80));
    return record;
  };

  const submitPrompt = async (rawText) => {
    const text = rawText.trim();
    if (!text || loading) return;
    setInput("");
    addMessage({ role: "user", text });

    const batchIntent = getBatchIntent(text);
    if (batchIntent) {
      const pending = getPendingAiActions(state.aiMessages || []);
      if (!pending.length) {
        addMessage({ role: "ai", text: "No pending AI actions are waiting for confirmation.", actions: [] });
        return;
      }
      setState((current) => resolveAllPendingAiActions(current, batchIntent));
      addMessage({ role: "ai", text: batchIntent === "confirm" ? "Confirmed all pending AI actions." : "Cancelled all pending AI actions.", actions: [] });
      setToast(batchIntent === "confirm" ? "All AI actions confirmed" : "All AI actions cancelled");
      return;
    }

    const smartCred = parseBankCredentialDetails(text);
    if (smartCred) {
      addMessage({
        role: "ai",
        text: `🔐 **Smart Vault AI Parser**: I structured your bank details for **"${smartCred.action.data.title}"**. Review the details and confirm below to encrypt and save them directly into your Vault.`,
        actions: [smartCred.action]
      });
      return;
    }

    const credentialIntent = getCredentialIntent(text, state.credentials || []);
    if (credentialIntent) {
      if (model.startsWith("mlvoca:")) {
        addMessage({
          role: "ai",
          text: "Public AI models are blocked from credential and vault answers for security. Switch to Gemini for non-secret credential guidance, or use the local Vault PIN reveal so secrets never leave this device.",
          actions: []
        });
        return;
      }
      addMessage({
        role: "ai",
        text: credentialIntent.mode === "view"
          ? "Credential details are locked locally. Enter PIN below to reveal matching cards in this chat. I will not send these details to any AI API."
          : "For security, add or edit credential secrets from the Vault page. I can show saved credential details here only after PIN unlock.",
        credentialQuery: credentialIntent,
        actions: []
      });
      return;
    }

    // AI Semantic Vector Search & Delete handler
    const isDeleteQuery = /^(delete|remove|erase|clear)\b/i.test(text.trim());
    const isSearchQuery = /^(search|find|lookup|show|query)\b/i.test(text.trim());

    if (isDeleteQuery) {
      const cleanSearchQuery = text.replace(/^(delete|remove|erase|clear)\b/i, "").trim();
      const results = semanticVectorSearch(cleanSearchQuery || text, state, 5);
      if (results.length > 0) {
        const topMatch = results[0];
        addMessage({
          role: "ai",
          text: `⚡ Found matching ${topMatch.kindLabel} **"${topMatch.title}"**${topMatch.amount ? ` (₹${topMatch.amount})` : ""}. Confirm below to delete it permanently.`,
          actions: [
            {
              operation: "delete",
              type: topMatch.type,
              id: topMatch.id,
              summary: `Delete ${topMatch.kindLabel}: "${topMatch.title}"${topMatch.amount ? ` (₹${topMatch.amount})` : ""}`
            }
          ]
        });
        return;
      }
    }

    if (isSearchQuery) {
      const cleanSearchQuery = text.replace(/^(search|find|lookup|show|query)\b/i, "").trim();
      const results = semanticVectorSearch(cleanSearchQuery || text, state, 8);
      if (results.length > 0) {
        const tableRows = results.map((r) => `| ${r.kindLabel} | ${r.title} | ${r.amount ? `₹${r.amount}` : "-"} | ${r.date || "-"} | \`${r.id}\` |`).join("\n");
        const reply = `### 🔍 Vector Search Results for "${cleanSearchQuery || text}"\n\n| Type | Title | Amount | Date | Record ID |\n| :--- | :--- | :--- | :--- | :--- |\n${tableRows}\n\nAsk me to delete or edit any record above by name or ID!`;
        addMessage({ role: "ai", text: reply, actions: [] });
        return;
      }
    }

    const natural = parseNaturalMessage(text);
    if (natural) {
      addMessage({
        role: "ai",
        text: `⚡ I parsed your message: **${natural.summary}**. Confirm below to save it immediately to your records.`,
        actions: [natural.action]
      });
      return;
    }

    const bankParse = parseBankMessage(text, state);
    if (bankParse) {
      addMessage({
        role: "ai",
        text: bankParse.isDuplicate
          ? `⚠️ **Duplicate Detected**: A transaction of ₹${bankParse.amount} for "${bankParse.title}" on ${bankParse.date} is already in your records. Review or confirm below to save anyway.`
          : bankParse.needsReview
          ? "I found a bank-style message but need you to confirm the missing fields before saving."
          : `⚡ I parsed this bank transaction (${bankParse.bankName ? bankParse.bankName + " - " : ""}${bankParse.title}: ₹${bankParse.amount}). Review fields and confirm to save.`,
        bankParse,
        actions: []
      });
      return;
    }

    const localAnswer = buildLocalAiAnswer(text, state);
    if (localAnswer) {
      addMessage({ role: "ai", text: localAnswer, actions: [] });
      return;
    }

    setLoading(true);

    try {
      setState((current) => ({
        ...current,
        settings: { ...current.settings, aiEnabled: true, aiModel: model }
      }));
      const result = await askGeminiAssistant({ state: { ...state, __today: todayISO() }, model, message: text });
      const modelActions = normalizeAiActions(result);
      const guaranteedReply = ensureLocalTableReply(text, result.reply, state);
      addMessage({ role: "ai", text: guaranteedReply || result.reply, actions: guaranteedReply ? [] : modelActions });
    } catch (error) {
      addMessage({ role: "ai", text: error.busy ? "Server busy. Please try after some time." : "AI is unavailable right now. Please try again later.", actions: [] });
    } finally {
      setLoading(false);
    }
  };

  const send = (event) => {
    event.preventDefault();
    submitPrompt(input);
  };

  const autoParseAndAdd = (event) => {
    event?.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput("");
    addMessage({ role: "user", text });

    const bankParse = parseBankMessage(text, state);
    if (bankParse) {
      if (bankParse.isDuplicate) {
        addMessage({
          role: "ai",
          text: `⚠️ **Duplicate Detected**: A transaction of ₹${bankParse.amount} for "${bankParse.title}" on ${bankParse.date} is already in your records. Check the card below if you wish to add it anyway.`,
          bankParse,
          actions: []
        });
        setToast("Duplicate transaction detected");
        return;
      }

      const base = {
        title: bankParse.title,
        amount: amount(bankParse.amount),
        type: bankParse.type,
        category: bankParse.category,
        paymentMethod: bankParse.paymentMethod,
        notes: bankParse.notes,
        id: id(bankParse.destination === "bill" ? "bill" : "expense"),
        updatedAt: new Date().toISOString()
      };
      if (bankParse.destination === "bill") {
        setState((current) => ({
          ...current,
          bills: [{ ...base, dueDate: bankParse.date, status: bankParse.billStatus, reminderBefore: bankParse.reminderBefore }, ...current.bills]
        }));
      } else {
        setState((current) => ({
          ...current,
          expenses: [{ ...base, date: bankParse.date, time: bankParse.time, reminder: false }, ...current.expenses]
        }));
      }
      addMessage({
        role: "ai",
        text: `⚡ **Auto-Added Bank Transaction**: ${bankParse.title} (₹${bankParse.amount}, ${bankParse.type})`,
        actions: []
      });
      setToast(`Auto-added: ${bankParse.title} (₹${bankParse.amount})`);
      return;
    }

    const natural = parseNaturalMessage(text);
    if (natural && natural.action) {
      setState((current) => applyAiActionData(current, natural.action, natural.action.data));
      addMessage({
        role: "ai",
        text: `⚡ **Auto-Added**: ${natural.summary}`,
        actions: []
      });
      setToast(`Auto-added: ${natural.action.data.title || "Record"}`);
    } else {
      submitPrompt(text);
    }
  };

  const pasteFromClipboardAndParse = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text || !text.trim()) {
        setToast("Clipboard is empty");
        return;
      }
      const trimmed = text.trim();
      setInput(trimmed);

      const bank = parseBankMessage(trimmed, state);
      const natural = parseNaturalMessage(trimmed);

      if (bank) {
        if (bank.isDuplicate) {
          setToast(`⚠️ Duplicate detected: ₹${bank.amount} (${bank.title})`);
        } else {
          setToast(`Pasted & parsed SMS: ${bank.title} (₹${bank.amount})`);
        }
      } else if (natural) {
        setToast(`Pasted & parsed message: ${natural.summary}`);
      } else {
        setToast("Pasted from clipboard");
      }
    } catch {
      setToast("Clipboard access denied or empty");
    }
  };

  const toggleVoiceInput = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setToast("Voice input is not supported in this browser.");
      return;
    }
    if (listening) {
      setListening(false);
      return;
    }
    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = "en-US";
      recognition.onstart = () => setListening(true);
      recognition.onresult = (event) => {
        const transcript = Array.from(event.results)
          .map((r) => r[0].transcript)
          .join("");
        setInput(transcript);
      };
      recognition.onerror = () => {
        setListening(false);
        setToast("Voice recognition error.");
      };
      recognition.onend = () => {
        setListening(false);
      };
      recognition.start();
    } catch {
      setListening(false);
      setToast("Voice recognition failed.");
    }
  };

  const useQuickChip = (chip) => {
    if (chip.label === "Parse bank message") {
      setInput(chip.prompt);
      requestAnimationFrame(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }));
      return;
    }
    submitPrompt(chip.prompt);
  };

  const copyMessage = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setToast("Copied");
    } catch {
      setToast("Copy failed");
    }
  };

  const clearChat = () => {
    saveMessages([]);
    setToast("AI chat cleared");
  };

  const importManualJson = () => {
    try {
      const parsed = JSON.parse(manualJson);
      const actions = normalizeAiActions(parsed);
      if (!actions.length) {
        setToast("No valid actions found in JSON");
        return;
      }
      addMessage({
        role: "ai",
        text: parsed.reply || "I imported your pasted AI JSON. Confirm, edit, or cancel each action below.",
        actions
      });
      setManualJson("");
      setToast("AI JSON imported");
    } catch {
      setToast("Invalid JSON");
    }
  };

  const copyJsonReference = async () => {
    try {
      await navigator.clipboard.writeText(AI_JSON_REFERENCE);
      setToast("JSON format copied");
    } catch {
      setToast("Copy failed");
    }
  };

  return (
    <div className="ai-drawer">
      <section className="ai-panel">
        <div className="ai-header">
          <div>
            <p className="eyebrow">LifePilot AI Assistant</p>
            <h2>LifePilot Assistant</h2>
          </div>
          <div className="ai-header-actions">
            <button className={`icon-button tactile ${jsonToolsOpen ? "active" : ""}`} title="AI JSON fallback" onClick={() => setJsonToolsOpen((value) => !value)} aria-label="AI JSON fallback"><Braces size={18} /></button>
            <button className="icon-button tactile" onClick={close} aria-label="Close AI"><X size={18} /></button>
          </div>
        </div>

        <div className="ai-model-row">
          <label>
            Model
            <Select
              value={model}
              onChange={(value) => {
                setModel(value);
                setState((current) => ({ ...current, settings: { ...current.settings, aiModel: value } }));
              }}
              options={FREE_GEMINI_MODELS.map((entry) => [entry.id, `${entry.label} (${entry.limit})`])}
            />
          </label>
          <p className="ai-provider-note">Choose between Gemini, Mistral AI, or MLVoca endpoints.</p>
        </div>

        <div className="ai-json-tools">
          {jsonToolsOpen && (
            <div className="ai-json-panel">
              <p>When free AI limits are finished, generate this JSON outside the app, paste it here, then confirm each action.</p>
              <div className="cluster">
                <button className="secondary tactile" type="button" onClick={copyJsonReference}><Copy size={16} />Copy format</button>
              </div>
              <textarea value={manualJson} onChange={(e) => setManualJson(e.target.value)} placeholder={AI_JSON_REFERENCE} />
              <div className="cluster">
                <button className="primary tactile" type="button" onClick={importManualJson}>Import JSON Actions</button>
                <button className="secondary tactile" type="button" onClick={() => setJsonToolsOpen(false)}>Close</button>
              </div>
            </div>
          )}
        </div>

        <div className="ai-chip-row" aria-label="Quick AI commands">
          {aiQuickChips.map((chip) => (
            <button className="ai-chip tactile" type="button" key={chip.label} onClick={() => useQuickChip(chip)}>{chip.label}</button>
          ))}
        </div>

        <div className="ai-messages">
          {messages.length ? messages.map((message) => (
            <AiMessage
              key={message.id}
              state={state}
              setState={setState}
              message={message}
              copyMessage={copyMessage}
              upsert={upsert}
              setToast={setToast}
            />
          )) : (
            <div className="empty-state small">
              <Bot size={22} />
              <p>Ask me to create tasks, reminders, notes, events, expenses, salary records, projects, or categories.</p>
            </div>
          )}
          {loading && <div className="ai-typing">Thinking...</div>}
          <div ref={messagesEndRef} />
        </div>

        <form className="ai-input" onSubmit={send}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submitPrompt(input);
              }
            }}
            placeholder="Type 'had tea for 20', 'paid 150 for cab', or paste Bank SMS..."
            rows={1}
          />
          <div className="ai-input-actions">
            <button
              className="secondary tactile icon-only-btn"
              type="button"
              onClick={pasteFromClipboardAndParse}
              title="Paste from clipboard"
              aria-label="Paste from clipboard"
            >
              <Clipboard size={18} />
            </button>
            <button
              className={`secondary tactile icon-only-btn ${listening ? "listening-active" : ""}`}
              type="button"
              onClick={toggleVoiceInput}
              title={listening ? "Listening... Click to stop" : "Voice input"}
              aria-label="Voice input"
            >
              {listening ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
            <button
              className="primary tactile icon-only-btn"
              type="submit"
              disabled={loading}
              title="Send message"
              aria-label="Send message"
            >
              <SendHorizontal size={18} />
            </button>
          </div>
        </form>
        <button className="secondary tactile clear-chat" onClick={clearChat} type="button">Clear recent chat</button>
      </section>
    </div>
  );
}

function AiMessage({ state, setState, message, copyMessage, upsert, setToast }) {
  const pendingCount = (message.actions || []).filter((action) => !action.status).length;

  const confirmAll = () => {
    setState((current) => resolveMessageAiActions(current, message.id, "confirm"));
    setToast(`${pendingCount} AI action${pendingCount === 1 ? "" : "s"} confirmed`);
  };

  const cancelAll = () => {
    setState((current) => resolveMessageAiActions(current, message.id, "cancel"));
    setToast(`${pendingCount} AI action${pendingCount === 1 ? "" : "s"} cancelled`);
  };

  return (
    <article className={`ai-message ${message.role}`}>
      <div className="ai-message-top">
        <strong>{message.role === "user" ? "You" : "LifePilot AI"}</strong>
        <button className="icon-button tactile" title="Copy message" onClick={() => copyMessage(message.text)}><Copy size={15} /></button>
      </div>
      <MessageBody text={message.text} />
      {message.actions?.length ? (
        <div className="ai-actions">
          {pendingCount > 1 && (
            <div className="ai-batch-actions">
              <button className="primary tactile" type="button" onClick={confirmAll}>Confirm all</button>
              <button className="secondary tactile" type="button" onClick={cancelAll}>Cancel all</button>
            </div>
          )}
          {message.actions.map((action, index) => <AiActionCard key={`${message.id}-${index}`} messageId={message.id} actionIndex={index} state={state} setState={setState} action={action} upsert={upsert} setToast={setToast} />)}
        </div>
      ) : null}
      {message.credentialQuery && <CredentialChatCard state={state} query={message.credentialQuery} setToast={setToast} />}
      {message.bankParse && <BankParseCard state={state} setState={setState} parsed={message.bankParse} setToast={setToast} />}
    </article>
  );
}

function AiActionCard({ messageId, actionIndex, state, setState, action, upsert, setToast }) {
  const operation = action.operation || "create";
  const [draft, setDraft] = useState(JSON.stringify(action.data || {}, null, 2));
  const [done, setDone] = useState(Boolean(action.status));

  useEffect(() => {
    setDone(Boolean(action.status));
  }, [action.status]);

  const persistActionStatus = (status) => {
    setState((current) => {
      const next = {
        ...current,
        aiMessages: (current.aiMessages || []).map((message) => {
          if (message.id !== messageId) return message;
          return {
            ...message,
            actions: (message.actions || []).map((entry, index) =>
              index === actionIndex ? { ...entry, status, resolvedAt: new Date().toISOString() } : entry
            )
          };
        })
      };
      savePersistedState(STORE_KEY, next);
      return next;
    });
  };

  const apply = async () => {
    try {
      const data = JSON.parse(draft);
      if (action.type === "credential" && data.secret) {
        const encrypted = await encryptWithAppPin(data.secret);
        const credRecord = {
          id: data.id || id("credential"),
          title: data.title || "Bank Credential",
          type: data.type || "debit_card",
          url: data.url || "",
          username: data.username || "",
          notes: data.notes || "",
          pinned: Boolean(data.pinned),
          encrypted,
          fieldNames: Object.keys(data.secret || {}).filter((k) => String(data.secret[k] || "").trim()),
          updatedAt: new Date().toISOString()
        };
        setState((current) => ({
          ...current,
          credentials: [credRecord, ...(current.credentials || []).filter((c) => c.id !== credRecord.id)],
          aiMessages: (current.aiMessages || []).map((message) => {
            if (message.id !== messageId) return message;
            return {
              ...message,
              actions: (message.actions || []).map((entry, index) =>
                index === actionIndex ? { ...entry, status: "created", resolvedAt: new Date().toISOString() } : entry
              )
            };
          })
        }));
        setToast("Saved & Encrypted into Vault");
        setDone(true);
        return;
      }
      setState((current) => resolveSingleAiAction(current, messageId, actionIndex, action, data));
      setToast(operation === "delete" ? "Deleted" : operation === "edit" ? "Changes saved" : "Added");
      setDone(true);
    } catch (err) {
      console.error("AI action resolution error", err);
      setToast("Fix the action JSON before confirming");
    }
  };

  return (
    <div className={`ai-action-card ${done ? "done" : ""}`}>
      <strong>{done ? actionDoneLabel(action.status || operation) : action.summary || `${operationLabel(operation)} ${kindLabel(action.type)}`}</strong>
      {operation !== "create" && action.id && <small>ID: {action.id}</small>}
      {operation !== "delete" && <textarea value={draft} onChange={(e) => setDraft(e.target.value)} disabled={done} />}
      <div className="cluster">
        <button className="primary tactile" type="button" onClick={apply} disabled={done}>{done ? "Done" : `Confirm & ${operationLabel(operation)}`}</button>
        <button className="secondary tactile" type="button" onClick={() => { setDone(true); persistActionStatus("cancelled"); }} disabled={done}>Cancel</button>
      </div>
    </div>
  );
}

function BankParseCard({ state, setState, parsed, setToast }) {
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState(() => ({
    destination: parsed.destination || "daily",
    projectId: state.projects[0]?.id || "",
    title: parsed.title || "",
    amount: parsed.amount || "",
    type: parsed.type || "Debit",
    date: parsed.date || todayISO(),
    time: parsed.time || nowTime(),
    category: parsed.type === "Credit" ? "Income" : "Bills",
    paymentMethod: parsed.paymentMethod || "Bank",
    paidBy: "",
    notes: parsed.notes || "",
    billStatus: parsed.billStatus || (parsed.destination === "bill" ? "Unpaid" : "Paid"),
    reminderBefore: parsed.reminderBefore || "1 day"
  }));
  const selectedProject = state.projects.find((project) => project.id === form.projectId);
  const projectParticipants = selectedProject?.participants || [];
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const save = () => {
    if (!form.title.trim() || amount(form.amount) <= 0) {
      setToast("Confirm title and amount first");
      return;
    }
    if (form.destination === "project" && !form.projectId) {
      setToast("Select a project first");
      return;
    }
    const base = {
      title: form.title.trim(),
      amount: amount(form.amount),
      type: form.type,
      category: form.category,
      paymentMethod: form.paymentMethod,
      notes: form.notes,
      id: id(form.destination === "bill" ? "bill" : form.destination === "project" ? "projectTransaction" : "expense"),
      updatedAt: new Date().toISOString()
    };
    setState((current) => {
      if (form.destination === "project") {
        return {
          ...current,
          projectTransactions: [{
            ...base,
            projectId: form.projectId,
            date: form.date,
            time: form.time,
            paidBy: form.paidBy,
            splitMode: "No split",
            owedBy: "",
            participants: []
          }, ...current.projectTransactions]
        };
      }
      if (form.destination === "bill") {
        return {
          ...current,
          bills: [{
            ...base,
            dueDate: form.date,
            status: form.billStatus,
            reminderBefore: form.reminderBefore
          }, ...current.bills]
        };
      }
      return {
        ...current,
        expenses: [{
          ...base,
          date: form.date,
          time: form.time,
          reminder: false
        }, ...current.expenses]
      };
    });
    setSaved(true);
    setToast("Bank message saved");
  };

  return (
    <div className={`ai-action-card bank-parse-card ${saved ? "done" : ""} ${parsed.isDuplicate ? "duplicate-warning" : ""}`}>
      <strong>{saved ? "Saved" : parsed.isDuplicate ? "⚠️ Duplicate Transaction Detected" : "Bank message parsed"}</strong>
      <small>{parsed.isDuplicate ? `Matching record of ₹${parsed.amount} for "${parsed.title}" on ${parsed.date} already exists.` : `Parsed confidence: ${parsed.confidence}. Review before saving.`}</small>
      
      {(parsed.bankName || parsed.merchant || parsed.accountNum || parsed.utrNumber) && (
        <div className="cluster" style={{ gap: "0.35rem", marginTop: "0.4rem" }}>
          {parsed.bankName && <span className="chip" style={{ background: "rgba(59, 130, 246, 0.12)", color: "#1d4ed8", fontSize: "0.76rem" }}>🏦 {parsed.bankName}</span>}
          {parsed.merchant && <span className="chip" style={{ background: "rgba(16, 185, 129, 0.12)", color: "#047857", fontSize: "0.76rem" }}>🛒 {parsed.merchant}</span>}
          {parsed.accountNum && <span className="chip" style={{ background: "rgba(107, 114, 128, 0.12)", fontSize: "0.76rem" }}>💳 A/C XX{parsed.accountNum}</span>}
          {parsed.utrNumber && <span className="chip" style={{ background: "rgba(139, 92, 246, 0.12)", color: "#6d28d9", fontSize: "0.76rem" }}>🔖 Ref: {parsed.utrNumber}</span>}
        </div>
      )}

      <div className="form-grid compact-form" style={{ marginTop: "0.6rem" }}>
        <label>Save to<Select value={form.destination} onChange={(value) => set("destination", value)} options={[["daily", "Daily expense"], ["project", "Project expense"], ["bill", "Bill tracker"]]} /></label>
        {form.destination === "project" && <label>Project<Select value={form.projectId} onChange={(value) => set("projectId", value)} options={[["", "Select project"], ...state.projects.map((project) => [project.id, project.name])]} /></label>}
        <label>Type<Select value={form.type} onChange={(value) => set("type", value)} options={["Debit", "Credit"]} /></label>
        <label>Amount<input type="number" min="0" value={form.amount} onChange={(e) => set("amount", e.target.value)} /></label>
        <label className="wide">Title<input value={form.title} onChange={(e) => set("title", e.target.value)} /></label>
        <label>{form.destination === "bill" ? "Due date" : "Transaction date"}<input value={form.date} onChange={(e) => set("date", e.target.value)} placeholder="YYYY-MM-DD" /></label>
        <label>Time<input type="time" value={form.time} onChange={(e) => set("time", e.target.value)} /></label>
        <label>Category<Select value={form.category} onChange={(value) => set("category", value)} options={[["", "Select category"], ...state.categories.map((category) => [category.name, category.name])]} /></label>
        <label>Payment<input value={form.paymentMethod} onChange={(e) => set("paymentMethod", e.target.value)} /></label>
        {form.destination === "project" && <label>Paid by<Select value={form.paidBy} onChange={(value) => set("paidBy", value)} options={[["", "Select payer"], ...projectParticipants.map((name) => [name, name])]} /></label>}
        {form.destination === "bill" && <label>Status<Select value={form.billStatus} onChange={(value) => set("billStatus", value)} options={["Unpaid", "Paid"]} /></label>}
        {form.destination === "bill" && <label>Reminder<Select value={form.reminderBefore} onChange={(value) => set("reminderBefore", value)} options={["None", "Same day", "1 day", "2 days", "3 days", "1 week"]} /></label>}
        <label className="wide">Note<textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} /></label>
      </div>
      {parsed.questions.length ? <p className="warning">Please confirm: {parsed.questions.join(", ")}</p> : null}
      <div className="cluster">
        <button className="primary tactile" type="button" onClick={save} disabled={saved}>{saved ? "Saved" : parsed.isDuplicate ? "Add Duplicate Anyway" : "Confirm & Save"}</button>
      </div>
    </div>
  );
}

function CredentialChatCard({ state, query, setToast }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [revealed, setRevealed] = useState([]);
  const matches = matchingCredentials(state.credentials || [], query.text);

  const unlock = async () => {
    setError("");
    try {
      if (!(await isValidPin(pin))) {
        setError("Wrong PIN. Details stay locked.");
        setPin("");
        return;
      }
      const unlocked = await Promise.all(matches.map(async (record) => ({ ...record, secret: await decryptCredentialPayload(record, pin) })));
      setRevealed(unlocked);
      setPin("");
    } catch {
      setError("Unable to unlock matching credentials.");
    }
  };

  const copy = async (value) => {
    try {
      await navigator.clipboard.writeText(String(value || ""));
      setToast("Copied");
    } catch {
      setToast("Copy failed");
    }
  };

  if (!matches.length) return <div className="ai-action-card done"><strong>No matching credential found.</strong><small>Add it from the Vault page.</small></div>;

  return (
    <div className="ai-action-card vault-chat-card">
      {!revealed.length ? (
        <>
          <strong>{matches.length} matching credential{matches.length === 1 ? "" : "s"} locked</strong>
          <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} type="password" inputMode="numeric" autoComplete="off" placeholder="Enter PIN" />
          {error && <p className="validation">{error}</p>}
          <button className="primary tactile" type="button" onClick={unlock}>Reveal in chat</button>
        </>
      ) : (
        <div className="credential-grid reveal-grid">
          {revealed.map((record) => (
            <article className={`credential-card revealed ${credentialTypeClass(record.type)}`} key={record.id}>
              <p className="eyebrow">{record.type}</p>
              <h3>{record.title}</h3>
              {record.url && <CredentialField label="URL" value={record.url} copy={copy} />}
              {record.username && <CredentialField label="Username" value={record.username} copy={copy} />}
              {Object.entries(record.secret || {}).filter(([, value]) => String(value || "").trim()).map(([key, value]) => (
                <CredentialField key={key} label={credentialFieldLabel(key)} value={value} copy={copy} />
              ))}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function formatText(str) {
  if (!str) return null;
  const parts = String(str).split(/(\*\*.*?\*\*|__.*?__)/g);
  return parts.map((part, idx) => {
    if ((part.startsWith("**") && part.endsWith("**")) || (part.startsWith("__") && part.endsWith("__"))) {
      const clean = part.slice(2, -2).replace(/\*\*/g, "").trim();
      return <strong key={idx}>{clean}</strong>;
    }
    const cleanPart = part.replace(/\*\*/g, "").replace(/`/g, "");
    return cleanPart;
  });
}

function renderMarkdownContent(rawText) {
  if (!rawText) return null;
  const lines = String(rawText || "").split("\n");
  const blocks = [];
  let currentList = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      if (currentList) {
        blocks.push(currentList);
        currentList = null;
      }
      continue;
    }

    if (/^#+\s+/.test(line)) {
      if (currentList) {
        blocks.push(currentList);
        currentList = null;
      }
      const headingText = line.replace(/^#+\s+/, "");
      blocks.push({ type: "heading", text: headingText });
      continue;
    }

    const bulletMatch = /^[*-•]\s+(.*)/.exec(line);
    const numberMatch = /^(\d+[\.\)])\s+(.*)/.exec(line);

    if (bulletMatch || numberMatch) {
      const isNumbered = Boolean(numberMatch);
      const content = isNumbered ? numberMatch[2] : bulletMatch[1];
      const listType = isNumbered ? "ol" : "ul";

      if (!currentList || currentList.listType !== listType) {
        if (currentList) blocks.push(currentList);
        currentList = { type: "list", listType, items: [] };
      }
      currentList.items.push(content);
    } else {
      if (currentList) {
        blocks.push(currentList);
        currentList = null;
      }
      blocks.push({ type: "paragraph", text: line });
    }
  }

  if (currentList) {
    blocks.push(currentList);
  }

  return blocks.map((block, idx) => {
    if (block.type === "heading") {
      return (
        <h4 key={idx} className="ai-heading" style={{ margin: "0.75rem 0 0.4rem 0", fontSize: "1.05rem", fontWeight: 800, color: "var(--ink)", display: "flex", alignItems: "center", gap: "0.35rem" }}>
          {formatText(block.text)}
        </h4>
      );
    }
    if (block.type === "list") {
      const Tag = block.listType;
      return (
        <Tag key={idx} className={`ai-list ${block.listType === "ol" ? "numbered" : "bullet"}`} style={{ margin: "0.4rem 0", paddingLeft: "1.2rem" }}>
          {block.items.map((item, itemIdx) => (
            <li key={itemIdx} style={{ margin: "0.25rem 0", lineHeight: "1.45" }}>{formatText(item)}</li>
          ))}
        </Tag>
      );
    }
    return (
      <p key={idx} className="ai-paragraph" style={{ margin: "0.4rem 0", lineHeight: "1.45" }}>
        {formatText(block.text)}
      </p>
    );
  });
}

function MessageBody({ text }) {
  const parsed = splitMarkdownTable(text);
  const money = extractMoneyHighlights(text);
  if (!parsed.table) {
    return (
      <div className={money.length ? "ai-rich-text money" : "ai-rich-text"}>
        {money.length ? <MoneyHighlights values={money} /> : null}
        {renderMarkdownContent(text)}
      </div>
    );
  }
  return (
    <div className="ai-rich-text">
      {parsed.before && renderMarkdownContent(parsed.before)}
      {money.length ? <MoneyHighlights values={money} /> : null}
      <div className="ai-table-wrap premium">
        <table className="ai-table">
          <thead>
            <tr>{parsed.table.headers.map((header, index) => <th key={index}>{formatText(header)}</th>)}</tr>
          </thead>
          <tbody>
            {parsed.table.rows.map((row, index) => (
              <tr key={index}>{row.map((cell, cellIndex) => <td className={hasMoney(cell) ? "money-cell" : ""} key={`${index}-${cellIndex}`}>{formatText(cell)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      {parsed.after && renderMarkdownContent(parsed.after)}
    </div>
  );
}

function splitMarkdownTable(text) {
  const lines = String(text || "").trim().split("\n");
  const start = lines.findIndex((line, index) =>
    line.trim().startsWith("|") &&
    line.trim().endsWith("|") &&
    lines[index + 1]?.includes("---")
  );
  if (start < 0) return { before: "", after: String(text || ""), table: null };
  let end = start;
  while (end < lines.length && lines[end].trim().startsWith("|") && lines[end].trim().endsWith("|")) end += 1;
  return {
    before: lines.slice(0, start).join("\n").trim(),
    table: parseMarkdownTable(lines.slice(start, end).join("\n")),
    after: lines.slice(end).join("\n").trim()
  };
}

function parseMarkdownTable(text) {
  const lines = String(text || "").trim().split("\n").filter(Boolean);
  const tableLines = lines.filter((line) => line.trim().startsWith("|") && line.trim().endsWith("|"));
  if (tableLines.length < 3 || !tableLines[1].includes("---")) return null;
  const split = (line) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
  return {
    headers: split(tableLines[0]),
    rows: tableLines.slice(2).map(split)
  };
}

function hasMoney(text) {
  return /(?:\u20b9|inr|rs\.?)\s*[\d,]+(?:\.\d{1,2})?|[\d,]+(?:\.\d{1,2})?\s*(?:\u20b9|inr|rs\.?)/i.test(String(text || ""));
}

function extractMoneyHighlights(text) {
  const matches = String(text || "").match(/(?:\u20b9|INR|Rs\.?)\s*[\d,]+(?:\.\d{1,2})?|[\d,]+(?:\.\d{1,2})?\s*(?:\u20b9|INR|Rs\.?)/gi) || [];
  return [...new Set(matches.map((match) => match.trim()))].slice(0, 6);
}

function MoneyHighlights({ values }) {
  return (
    <div className="ai-money-strip">
      {values.map((value) => <span key={value}>{value}</span>)}
    </div>
  );
}

function buildLocalAiAnswer(text, state) {
  return buildLocalExpenseAnswer(text, state) || buildLocalTodoAnswer(text, state);
}

function ensureLocalTableReply(prompt, reply, state) {
  if (!isLocalExpenseTablePrompt(prompt)) return "";
  if (parseMarkdownTable(reply)) return "";
  if (!/\b(here|found|below|list|table|record|expense|transaction|spend|spending)\b/i.test(reply || "")) return "";
  return buildLocalExpenseAnswer(prompt, state, { force: true });
}

function normalizeAiQuery(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\banalsyze\b/g, "analyze")
    .replace(/\banalyse\b/g, "analyze")
    .replace(/\banlysis\b/g, "analysis")
    .replace(/\banalytics?\b/g, "analysis")
    .replace(/\bexpn?se?s?\b/g, "expense")
    .replace(/\bexps?ne?s?\b/g, "expense")
    .replace(/\btrs?nactions?\b/g, "transaction")
    .replace(/\btranactions?\b/g, "transaction")
    .replace(/\bspilt\b/g, "split")
    .replace(/\bremi?ai?nders?\b/g, "reminder");
}

function isLocalExpenseTablePrompt(text) {
  const normalized = normalizeAiQuery(text);
  const wantsMoney = /\b(expenses?|transactions?|spend|spending|money|debit|credit|payment|payments|bills?|salary|cashflow|projects?)\b/.test(normalized);
  const wantsAnalysis = /\b(analyze|analysis|insights?|dashboard|reports?|summary|summaries)\b/.test(normalized);
  const wantsPeriodAnalysis = wantsAnalysis && /\b(months?|weeks?|today|daily|projects?|salary|bills?|cashflow|all time)\b/.test(normalized);
  const wantsTable = /\b(show|list|find|tell|give|table|summary|months?|today|yesterday|weeks?|highest|where|what|how|total|all|records?|available|details?|analyze|analysis|insights?|reports?)\b/.test(normalized);
  return (wantsMoney || wantsPeriodAnalysis) && (wantsTable || /^all\s+(expenses?|transactions?)\b/.test(normalized) || /^(expenses?|transactions?)\??$/.test(normalized.trim()));
}

function buildLocalExpenseAnswer(text, state, options = {}) {
  const normalized = normalizeAiQuery(text);
  if (!options.force && !isLocalExpenseTablePrompt(normalized)) return "";
  const scope = localDateScope(normalized);
  const wantsCredit = /\bcredit|income|salary\b/.test(normalized);
  const wantsDebit = /\bexpenses?|spend|spending|debit|paid|spent\b/.test(normalized);
  let rows = allTransactions(state).filter((item) => item.date);
  if (scope.filter) rows = rows.filter(scope.filter);
  if (wantsCredit && !wantsDebit) rows = rows.filter((item) => item.type === "Credit");
  else if (wantsDebit || /\bexpenses?|spend|spending\b/.test(normalized)) rows = rows.filter((item) => item.type !== "Credit");
  if (/\bprojects?\b/.test(normalized)) rows = rows.filter((item) => /project/i.test(item.source || ""));
  if (/\bdaily\b/.test(normalized)) rows = rows.filter((item) => item.source === "Daily Expense");
  if (/\bbill|bills\b/.test(normalized)) rows = rows.filter((item) => item.source === "Bill Tracker");
  rows = rows.slice().sort(sortByDateDesc);
  const totalDebit = sum(rows, (item) => item.type !== "Credit");
  const totalCredit = sum(rows, (item) => item.type === "Credit");
  const bySourceRows = Object.entries(groupAmounts(rows, "source"))
    .sort((a, b) => b[1] - a[1])
    .map(([source, value]) => [source, rupee.format(value)]);
  const tableRows = rows.length
    ? rows.map((item) => [
        formatDate(item.date),
        item.source || "",
        item.title || item.name || "",
        item.type || "",
        rupee.format(amount(item.amount)),
        item.category || "",
        item.paymentMethod || "",
        item.id || ""
      ])
    : [["No records", scope.label, "-", "-", rupee.format(0), "-", "-", "-"]];
  return [
    `I found ${rows.length} ${rows.length === 1 ? "record" : "records"} for ${scope.label}.`,
    `Total debit: ${rupee.format(totalDebit)}. Total credit: ${rupee.format(totalCredit)}.`,
    markdownTable(["Source", "Total"], bySourceRows.length ? bySourceRows : [["No source", rupee.format(0)]]),
    markdownTable(["Date", "Source", "Title", "Type", "Amount", "Category", "Payment", "ID"], tableRows)
  ].join("\n\n");
}

function buildLocalTodoAnswer(text, state) {
  const normalized = text.toLowerCase();
  const wantsTodo = /\b(todo|to-do|task|tasks|subtask|subtasks)\b/.test(normalized);
  const wantsList = /\b(show|list|find|tell|give|table|pending|completed|today|overdue)\b/.test(normalized);
  if (!wantsTodo || !wantsList) return "";
  const scope = localDateScope(normalized);
  let tasks = state.tasks.slice();
  if (scope.filter && /\b(today|yesterday|week|month|\d{4}-\d{2}-\d{2})\b/.test(normalized)) tasks = tasks.filter(scope.filter);
  if (/\bcompleted|done|finished\b/.test(normalized)) tasks = tasks.filter((task) => task.status === "Completed");
  if (/\bpending|open|active\b/.test(normalized)) tasks = tasks.filter((task) => !["Completed", "Cancelled"].includes(task.status));
  if (/\boverdue\b/.test(normalized)) tasks = tasks.filter((task) => !["Completed", "Cancelled"].includes(task.status) && task.dueDate < todayISO());
  const tableRows = tasks.length
    ? tasks.slice(0, 40).map((task) => {
        const subtasks = normalizeSubtasks(task.subtasks);
        const done = subtasks.filter((subtask) => subtask.status === "Completed").length;
        return [
          task.title,
          formatDate(task.dueDate),
          [task.startTime, task.endTime || task.dueTime].filter(Boolean).join(" - "),
          task.status,
          `${done}/${subtasks.length}`,
          task.id
        ];
      })
    : [["No todos", scope.label, "-", "-", "0/0", "-"]];
  return [
    `I found ${tasks.length} todo ${tasks.length === 1 ? "item" : "items"} for ${scope.label}.`,
    markdownTable(["Todo", "Date", "Time", "Status", "Subtasks", "ID"], tableRows)
  ].join("\n\n");
}

function openExpensePdfReport(state, options = {}) {
  const html = buildExpenseReportHtml(state, options);
  const reportWindow = window.open("", "_blank");
  if (!reportWindow) {
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `lifepilot-expense-report-${todayISO()}.html`;
    link.click();
    URL.revokeObjectURL(url);
    return;
  }
  reportWindow.document.open();
  reportWindow.document.write(html);
  reportWindow.document.close();
  reportWindow.focus();
  setTimeout(() => reportWindow.print(), 350);
}

function buildExpenseReportHtml(state, options = {}) {
  const mode = options.mode || "all";
  const project = options.project || null;
  const reportTitle = options.title || "LifePilot Expense Report";
  const baseTransactions = mode === "daily"
    ? (options.transactions || state.expenses).map((item) => ({ ...item, source: "Daily Expense" }))
    : mode === "project" && project
      ? state.projectTransactions.filter((item) => item.projectId === project.id).map((item) => ({ ...item, source: `${project.name} Project` }))
      : allTransactions(state);
  const transactions = baseTransactions.sort(sortByDateDesc);
  const money = {
    credit: sum(transactions, (item) => item.type === "Credit"),
    debit: sum(transactions, (item) => item.type !== "Credit"),
    balance: sum(transactions, (item) => item.type === "Credit") - sum(transactions, (item) => item.type !== "Credit")
  };
  const byDate = transactions.reduce((acc, item) => {
    const key = item.date || "No date";
    acc[key] = acc[key] || [];
    acc[key].push(item);
    return acc;
  }, {});
  const dailySplit = mode === "project" ? { stats: [], settlements: [] } : dailySplitSummary(mode === "daily" ? (options.transactions || state.expenses) : state.expenses);
  const projectsForReport = mode === "daily" ? [] : project ? [project] : state.projects;
  const projectSections = projectsForReport.map((projectItem) => {
    const projectTransactions = state.projectTransactions.filter((item) => item.projectId === projectItem.id).sort(sortByDateDesc);
    const stats = projectStats(state, projectItem);
    const split = projectSplitSummary(projectItem, projectTransactions);
    return `
      <section>
        <h2>${escapeHtml(projectItem.name)}</h2>
        ${reportTable(["Budget", "Debit", "Credit", "Remaining", "Overspent", "Status"], [[rupee.format(amount(projectItem.budget)), rupee.format(stats.debit), rupee.format(stats.credit), rupee.format(stats.remaining), rupee.format(stats.overspent), projectItem.status || ""]])}
        <h3>Transactions</h3>
        ${reportTable(["Date", "Title", "Type", "Amount", "Paid By", "Split", "Category"], projectTransactions.map((item) => [formatDate(item.date), item.title, item.type, rupee.format(amount(item.amount)), item.paidBy || "", splitModeOf(item), item.category || ""]))}
        <h3>Owes</h3>
        ${reportTable(["From", "To", "Amount"], split.settlements.map((item) => [item.from, item.to, rupee.format(item.amount)]))}
        <h3>Paid Settlements</h3>
        ${reportTable(["From", "To", "Amount", "Paid At"], split.paidSettlements.map((item) => [item.from, item.to, rupee.format(amount(item.amount)), item.paidAt ? new Date(item.paidAt).toLocaleString("en-IN") : ""]))}
      </section>
    `;
  }).join("");
  return `<!doctype html>
  <html>
    <head>
      <title>${escapeHtml(reportTitle)}</title>
      <style>
        @page { margin: 16mm; }
        body { margin: 0; color: #111; font-family: Inter, Arial, sans-serif; background: #fbf7e8; }
        body::before { content: "LifePilot"; position: fixed; inset: 38% auto auto 8%; z-index: 0; color: rgba(17,17,17,.045); font-size: 96px; font-weight: 950; transform: rotate(-22deg); }
        main { position: relative; z-index: 1; }
        header { display: flex; align-items: center; gap: 14px; border: 3px solid #111; border-radius: 22px; padding: 18px; background: #d8ff8f; box-shadow: 8px 8px 0 #111; }
        header img { width: 58px; height: 58px; }
        .back-button { margin-left: auto; border: 2px solid #111; border-radius: 14px; background: #fff; color: #111; box-shadow: 4px 4px 0 #111; padding: 10px 14px; font-weight: 950; cursor: pointer; }
        h1, h2, h3 { margin: 0 0 10px; }
        h1 { font-size: 30px; }
        h2 { margin-top: 22px; font-size: 22px; }
        h3 { margin-top: 16px; font-size: 16px; }
        .meta { color: #4c4d5d; font-weight: 800; }
        .cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 18px 0; }
        .card { border: 3px solid #111; border-radius: 18px; padding: 14px; background: #fffdf5; box-shadow: 5px 5px 0 #111; }
        .card span { display: block; color: #5f6070; font-size: 12px; font-weight: 900; text-transform: uppercase; }
        .card strong { display: block; margin-top: 8px; font-size: 22px; }
        section { break-inside: avoid; margin: 18px 0; }
        table { width: 100%; border-collapse: separate; border-spacing: 0; overflow: hidden; border: 2px solid #111; border-radius: 14px; background: #fff; margin-bottom: 12px; font-size: 12px; }
        th, td { padding: 8px; border-right: 2px solid #111; border-bottom: 2px solid #111; text-align: left; vertical-align: top; }
        th { background: #c5c8ff; font-weight: 950; }
        tr:last-child td { border-bottom: 0; }
        th:last-child, td:last-child { border-right: 0; }
        .watermark-logo { position: fixed; right: 18mm; bottom: 16mm; width: 95px; opacity: .08; }
        @media print { button { display: none; } body { background: #fff; } }
      </style>
    </head>
    <body>
      <main>
        <header>
          <img loading="lazy" src="/icons/icon.svg" alt="" />
          <div>
            <h1>${escapeHtml(reportTitle)}</h1>
            <div class="meta">Generated ${new Date().toLocaleString("en-IN")} - ${transactions.length} records</div>
          </div>
          <button class="back-button" type="button" onclick="if (window.opener) window.opener.focus(); window.close();">Back to app</button>
        </header>
        <img loading="lazy" class="watermark-logo" src="/icons/icon.svg" alt="" />
        <div class="cards">
          <div class="card"><span>Total Credit</span><strong>${rupee.format(money.credit)}</strong></div>
          <div class="card"><span>Total Debit</span><strong>${rupee.format(money.debit)}</strong></div>
          <div class="card"><span>Balance</span><strong>${rupee.format(money.balance)}</strong></div>
        </div>
        <section>
          <h2>Source Analytics</h2>
          ${reportTable(["Source", "Total"], Object.entries(groupAmounts(transactions, "source")).sort((a, b) => b[1] - a[1]).map(([source, total]) => [source, rupee.format(total)]))}
          <h2>Category Analytics</h2>
          ${reportTable(["Category", "Total"], Object.entries(groupAmounts(transactions.filter((item) => item.type !== "Credit"), "category")).sort((a, b) => b[1] - a[1]).map(([category, total]) => [category, rupee.format(total)]))}
        </section>
        <section>
          <h2>Date-wise Transactions</h2>
          ${Object.keys(byDate).sort((a, b) => String(b).localeCompare(String(a))).map((date) => `
            <h3>${date === "No date" ? "No date" : formatDate(date)}</h3>
            ${reportTable(["Source", "Title", "Type", "Amount", "Category", "Payment"], byDate[date].map((item) => [item.source || "", item.title || item.name || "", item.type || "", rupee.format(amount(item.amount)), item.category || "", item.paymentMethod || ""]))}
          `).join("")}
        </section>
        ${mode === "project" ? "" : `<section>
          <h2>Daily Transaction Splits</h2>
          ${reportTable(["Participant", "Paid", "Share", "Balance"], dailySplit.stats.map((item) => [item.name, rupee.format(item.paid), rupee.format(item.share), `${item.balance >= 0 ? "Gets" : "Owes"} ${rupee.format(Math.abs(item.balance))}`]))}
          <h3>Daily Owes</h3>
          ${reportTable(["From", "To", "Amount"], dailySplit.settlements.map((item) => [item.from, item.to, rupee.format(item.amount)]))}
        </section>`}
        <section>
          <h2>Expense Projects, Splits and Owes</h2>
          ${projectSections || "<p>No expense projects yet.</p>"}
        </section>
      </main>
    </body>
  </html>`;
}

function reportTable(headers, rows) {
  const cleanRows = rows?.length ? rows : [headers.map(() => "-")];
  return `<table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${cleanRows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char]));
}

function localDateScope(normalizedText) {
  const today = todayISO();
  const explicit = normalizedText.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (explicit) return { label: formatDate(explicit[1]), filter: (item) => item.date === explicit[1] || item.dueDate === explicit[1] };
  if (/\byesterday\b/.test(normalizedText)) {
    const date = addDaysISO(today, -1);
    return { label: "yesterday", filter: (item) => item.date === date || item.dueDate === date };
  }
  if (/\btoday\b/.test(normalizedText)) return { label: "today", filter: (item) => item.date === today || item.dueDate === today };
  if (/\bweeks?\b/.test(normalizedText)) return { label: "this week", filter: (item) => inRange(item.date || item.dueDate, "week") };
  if (/\blast month\b/.test(normalizedText)) return { label: "last month", filter: (item) => inRange(item.date || item.dueDate, "lastMonth") };
  const namedMonth = namedMonthScope(normalizedText);
  if (namedMonth) return namedMonth;
  if (/\bmonths?\b|\bmonthly\b|\bjanuary\b|\bfebruary\b|\bmarch\b|\bapril\b|\bmay\b|\bjune\b|\bjuly\b|\baugust\b|\bseptember\b|\boctober\b|\bnovember\b|\bdecember\b/.test(normalizedText)) {
    return { label: "this month", filter: (item) => inRange(item.date || item.dueDate, "month") };
  }
  return { label: "all time", filter: null };
}

function namedMonthScope(normalizedText) {
  const months = [
    ["january", "01"], ["jan", "01"],
    ["february", "02"], ["feb", "02"],
    ["march", "03"], ["mar", "03"],
    ["april", "04"], ["apr", "04"],
    ["may", "05"],
    ["june", "06"], ["jun", "06"],
    ["july", "07"], ["jul", "07"],
    ["august", "08"], ["aug", "08"],
    ["september", "09"], ["sep", "09"],
    ["october", "10"], ["oct", "10"],
    ["november", "11"], ["nov", "11"],
    ["december", "12"], ["dec", "12"]
  ];
  const found = months.find(([name]) => new RegExp(`\\b${name}\\b`).test(normalizedText));
  if (!found) return null;
  const year = normalizedText.match(/\b(20\d{2})\b/)?.[1] || todayISO().slice(0, 4);
  const month = `${year}-${found[1]}`;
  return {
    label: new Date(`${month}-01T12:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" }),
    filter: (item) => String(item.date || item.dueDate || "").startsWith(month)
  };
}

function normalizeAiActions(parsed) {
  const rawActions = Array.isArray(parsed) ? parsed : parsed.actions;
  if (!Array.isArray(rawActions)) return [];
  return rawActions
    .map((action) => {
      const normalizedType = action.type === "todo" ? "task" : action.type;
      return {
      operation: action.operation || "create",
      type: normalizedType,
      id: action.id || "",
      summary: action.summary || "",
      data: action.data || {}
      };
    })
    .filter((action) => {
      const validOperation = ["create", "edit", "delete"].includes(action.operation);
      const validType = Boolean(collectionForKind(action.type));
      const hasPayload = action.operation === "delete" ? Boolean(action.id) : Boolean(action.data);
      return validOperation && validType && hasPayload;
    });
}

function getBatchIntent(text) {
  const normalized = text.trim().toLowerCase();
  if (/^(confirm|apply|add|create|save)\s+(all|everything)$/i.test(normalized)) return "confirm";
  if (/^(cancel|discard|skip)\s+(all|everything)$/i.test(normalized)) return "cancel";
  if (/^(delete|remove)\s+(all|everything)\s+(pending|ai actions)$/i.test(normalized)) return "cancel";
  return "";
}

function getCredentialIntent(text, credentials) {
  const normalized = text.trim().toLowerCase();
  const credentialWords = /(credential|card|debit card|credit card|bank account|account detail|social media|password|cvv|pin)/i;
  if (!credentialWords.test(normalized)) return null;
  if (/\b(show|view|give|list|display|details|detail|all)\b/i.test(normalized)) {
    return { mode: "view", text };
  }
  if (/\b(add|create|edit|update|save|delete|remove)\b/i.test(normalized)) {
    return { mode: "manage", text, count: credentials.length };
  }
}

function parseBankCredentialDetails(text) {
  const raw = String(text || "").trim();
  if (!raw || raw.length < 8) return null;
  const lower = raw.toLowerCase();

  // Pattern detection for bank cards, accounts, IFSC, PIN, CVV, passwords
  const cardMatch = raw.match(/\b(?:\d[ -]*?){13,19}\b/);
  const accountMatch = raw.match(/\b(?:a\/c|acct|account|acc no|acc)\s*[:#-]?\s*(\d{9,18})\b/i) || (lower.includes("account number") && raw.match(/\b\d{9,18}\b/));
  const ifscMatch = raw.match(/\b([A-Z]{4}0[A-Z0-9]{6})\b/i);
  const expiryMatch = raw.match(/\b(?:exp|expiry|valid thru|valid to|valid date)?\s*[:#-]?\s*(\d{2}\s*[\/\-]\s*\d{2,4})\b/i);
  const cvvMatch = raw.match(/\b(?:cvv|cvc|security code)\s*[:#-]?\s*(\d{3,4})\b/i);
  const pinMatch = raw.match(/\b(?:pin|atm pin|upi pin|card pin)\s*[:#-]?\s*(\d{4,6})\b/i);
  const passwordMatch = raw.match(/\b(?:password|pwd|pass|netbanking pass)\s*[:#-]?\s*([^\s,;\n]+)/i);

  const isBankOrCredPaste = Boolean(
    cardMatch || 
    accountMatch || 
    ifscMatch || 
    (cvvMatch && expiryMatch) || 
    (passwordMatch && (lower.includes("bank") || lower.includes("card") || lower.includes("login"))) ||
    (pinMatch && (lower.includes("card") || lower.includes("upi") || lower.includes("bank")))
  );
  if (!isBankOrCredPaste) return null;

  // Extract Bank Name
  const bankMatch = raw.match(/\b(hdfc|sbi|icici|axis|kotak|bob|pnb|canara|union bank|indusind|idfc|yes bank|federal|standard chartered|hsbc|citibank|rbl|slice|onecard|jupiter|cred|paytm|phonepe|gpay)\b/i);
  const bankName = bankMatch ? bankMatch[1].toUpperCase() : "";

  // Determine Credential Type & Title
  let credType = "debit_card";
  let typeTitle = "Card";
  if (lower.includes("credit card") || lower.includes("credit")) {
    credType = "credit_card";
    typeTitle = "Credit Card";
  } else if (lower.includes("debit card") || lower.includes("debit")) {
    credType = "debit_card";
    typeTitle = "Debit Card";
  } else if (lower.includes("account") || ifscMatch || accountMatch) {
    credType = "bank_account";
    typeTitle = "Bank Account";
  } else if (lower.includes("netbanking") || lower.includes("login") || passwordMatch) {
    credType = "website_login";
    typeTitle = "NetBanking Login";
  }

  const title = bankName ? `${bankName} ${typeTitle}` : `Bank ${typeTitle}`;

  // Extract Username / Account Holder
  const nameMatch = raw.match(/\b(?:name|holder|holder name|user|username|customer id)\s*[:#-]?\s*([A-Za-z ]{2,30})/i);
  const username = nameMatch ? nameMatch[1].trim() : "";

  // Build secret object with extracted fields
  const secret = {};
  if (cardMatch) secret.cardNumber = cardMatch[0].replace(/[- ]/g, "");
  if (expiryMatch) secret.expiry = expiryMatch[1].trim();
  if (cvvMatch) secret.cvv = cvvMatch[1].trim();
  if (pinMatch) secret.pin = pinMatch[1].trim();
  const accNumStr = typeof accountMatch === "object" && accountMatch && accountMatch[1] ? accountMatch[1] : (typeof accountMatch === "object" && accountMatch ? accountMatch[0] : "");
  if (accNumStr) secret.accountNumber = accNumStr;
  if (ifscMatch) secret.ifsc = ifscMatch[1].toUpperCase();
  if (passwordMatch) secret.password = passwordMatch[1].trim();
  secret.notes = `Pasted bank detail import`;

  return {
    type: "credential",
    summary: `Save Credential: ${title}`,
    action: {
      operation: "create",
      type: "credential",
      summary: `Save ${title} to Secure Vault`,
      data: {
        title,
        type: credType,
        username,
        url: "",
        notes: `Smart AI Vault import on ${todayISO()}`,
        secret
      }
    }
  };
}

function parseNaturalMessage(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();

  // 1. Note parsing (e.g. "note: buy travel list", "write down password details")
  if (/^(note:|note\b|write down:|save note:)/i.test(lower)) {
    const content = raw.replace(/^(note:|note|write down:|save note:)\s*/i, "").trim();
    if (!content) return null;
    const title = content.split("\n")[0].slice(0, 45);
    return {
      type: "note",
      summary: `Note "${title}"`,
      action: {
        operation: "create",
        type: "note",
        summary: `Add Note: ${title}`,
        data: {
          title,
          content,
          date: todayISO()
        }
      }
    };
  }

  // 2. Natural Expense parsing (e.g., "had tea for 20", "paid 150 for auto", "tea 20 rs", "spent 500 on groceries", "coffee 60", "salary 50000")
  const cleanNatural = raw.replace(/\([^)]*[\d,]+[^)]*\)/gi, "");
  const amountMatch =
    cleanNatural.match(/(?:for|paid|spent|had|cost|gave|inr|rs\.?|\u20b9|\$)\s*([\d,]+(?:\.\d{1,2})?)/i) ||
    cleanNatural.match(/([\d,]+(?:\.\d{1,2})?)\s*(?:rs|rupees|inr|\$|\u20b9)/i) ||
    raw.match(/(?:inr|rs\.?|\u20b9|\$)?\s*([\d,]+(?:\.\d{1,2})?)\s*(?:rs|rupees|inr|\$)?/i);

  let amountVal = 0;
  if (amountMatch) {
    const num = Number(String(amountMatch[1]).replace(/,/g, ""));
    if (!Number.isNaN(num) && num > 0) {
      amountVal = num;
    }
  }

  const isExpenseKeyword = /(had|paid|spent|bought|cost|gave|tea|coffee|chai|food|lunch|dinner|breakfast|auto|cab|taxi|uber|ola|petrol|fuel|groceries|rent|bill|recharge|movie|snacks)/i.test(lower);
  const isCredit = /(received|got|credited|credit|income|salary|cashback|refund|added)/i.test(lower);
  const hasCurrency = /(inr|rs\.?|\u20b9|\$|rupees)/i.test(lower);

  if (amountVal > 0 && (isExpenseKeyword || isCredit || hasCurrency || /^\w+\s+\d+$/.test(raw) || /^\w+\s+for\s+\d+$/i.test(raw))) {
    let title = raw
      .replace(/(?:inr|rs\.?|\u20b9|\$)?\s*[\d,]+(?:\.\d{1,2})?\s*(?:rs|rupees|inr|\$)?/gi, "")
      .replace(/\b(had|paid|spent|bought|for|on|of|credited|received|got|rs|rupees|inr|rupee)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!title || title.length < 2) {
      title = isCredit ? "Income" : "Expense";
    } else {
      title = title.charAt(0).toUpperCase() + title.slice(1);
    }

    let category = "General";
    if (/(tea|coffee|chai|food|lunch|dinner|breakfast|snacks|restaurant|burger|pizza|drink|water|cafe)/i.test(lower)) {
      category = "Food & Drinks";
    } else if (/(auto|cab|taxi|uber|ola|petrol|fuel|bus|train|flight|metro|travel)/i.test(lower)) {
      category = "Transport";
    } else if (/(groceries|supermarket|vegetables|milk|fruits|mart)/i.test(lower)) {
      category = "Groceries";
    } else if (/(rent|electric|electricity|water bill|wifi|internet|recharge|mobile|utility)/i.test(lower)) {
      category = "Bills & Utilities";
    } else if (/(salary|freelance|bonus|interest|stipend)/i.test(lower)) {
      category = "Salary";
    } else if (/(shopping|clothes|shoes|book|amazon|flipkart)/i.test(lower)) {
      category = "Shopping";
    }

    const type = isCredit ? "Credit" : "Debit";

    return {
      type: "expense",
      summary: `Expense "${title}" (₹${amountVal}, ${type})`,
      action: {
        operation: "create",
        type: "expense",
        summary: `Add Expense: ${title} (₹${amountVal})`,
        data: {
          title,
          amount: amountVal,
          type,
          category,
          date: todayISO(),
          time: nowTime(),
          paymentMethod: "UPI",
          notes: `Parsed from chat: "${raw}"`
        }
      }
    };
  }

  // 3. Reminder / Task parsing (e.g. "remind me to pay bill tomorrow 5pm", "todo: call dentist")
  if (/\b(remind|reminder|todo|task|schedule)\b/i.test(lower)) {
    const due = extractMessageDate(raw, "due") || todayISO();
    const timeMatch = raw.match(/\b(\d{1,2}):(\d{2})(?:\s?([ap]m))?\b/i) || raw.match(/\b(\d{1,2})\s*([ap]m)\b/i);
    let timeStr = "09:00";
    if (timeMatch) {
      let hr = Number(timeMatch[1]);
      const pm = (timeMatch[3] || timeMatch[2])?.toLowerCase() === "pm";
      if (pm && hr < 12) hr += 12;
      if (!pm && hr === 12) hr = 0;
      const min = timeMatch[2] && !isNaN(Number(timeMatch[2])) ? timeMatch[2] : "00";
      timeStr = `${String(hr).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
    }

    let title = raw
      .replace(/\b(remind me to|remind me|reminder:|todo:|task:)\b/gi, "")
      .trim();
    if (title) title = title.charAt(0).toUpperCase() + title.slice(1);
    else title = "Reminder";

    return {
      type: "reminder",
      summary: `Reminder "${title}" (${due} ${timeStr})`,
      action: {
        operation: "create",
        type: "reminder",
        summary: `Add Reminder: ${title}`,
        data: {
          title,
          date: due,
          time: timeStr,
          description: `Parsed from chat: "${raw}"`,
          status: "Active",
          notificationEnabled: true
        }
      }
    };
  }

  return null;
}

function parseBankMessage(text, state = null) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();

  const bankWords = /(bill|due|statement|minimum amount|min amt|payment reminder|debited|credited|debit|credit|spent|withdrawn|received|deposited|transaction|upi|imps|neft|rtgs|a\/c|acct|account|card|available balance|avl bal|inr|rs\.?|\u20b9|\$)/i;
  if (!bankWords.test(raw)) return null;

  // Clean raw text to strip available balance or parenthetical trailing numbers before amount matching
  const cleanForAmount = raw
    .replace(/(?:avl\s*bal|available\s*balance|bal|balance|dispute|callfor dispute|sms block)[^,\n.]*(?:inr|rs\.?|\u20b9|\$)?\s*[\d,]+(?:\.\d{1,2})?/gi, "")
    .replace(/\([^)]*[\d,]+[^)]*\)/gi, "");

  // Prioritize explicit transaction verb amount match over trailing figures
  const amountMatch =
    cleanForAmount.match(/(?:debited|debit|spent|paid|withdrawn|credited|credit|received|for|towards|cost|amount|inr|rs\.?|\u20b9|\$)\s*(?:by|for|of)?\s*(?:inr|rs\.?|\u20b9|\$)?\s*([\d,]+(?:\.\d{1,2})?)/i) ||
    cleanForAmount.match(/([\d,]+(?:\.\d{1,2})?)\s*(?:rs|rupees|inr|\$|\u20b9)?\s*(?:debited|credited|paid|spent|received|for)/i) ||
    raw.match(/(?:inr|rs\.?|\u20b9|\$)\s*([\d,]+(?:\.\d{1,2})?)/i) ||
    raw.match(/([\d,]+(?:\.\d{1,2})?)\s*(?:inr|rs\.?|\u20b9|\$)/i);

  if (!amountMatch) return null;
  const amountValue = Number(String(amountMatch[1]).replace(/,/g, ""));
  if (!amountValue || Number.isNaN(amountValue)) return null;

  const isBillReminder = /(bill|due date|due on|pay by|payment due|minimum amount|min amt|statement|outstanding|total amount due|amount due)/i.test(lower);
  const debit = /(debited|debit|spent|paid|withdrawn|purchase|\bdr\b|sent)/i.test(lower);
  const credit = /(credited|received|deposited|refund|\bcr\b)/i.test(lower);

  // 1. Extract Bank Name
  const bankRegex = /\b(hdfc|sbi|icici|axis|paytm|phonepe|googlepay|gpay|kotak|bob|bank of baroda|pnb|canara|union bank|federal|indusind|idfc|yes bank|standard chartered|hsbc|cred|jupiter|fi bank|slice)\b/i;
  const bankMatch = raw.match(bankRegex);
  const bankName = bankMatch ? bankMatch[1].toUpperCase() : "";

  // 2. Extract Merchant / Biller Name
  const merchantMatch =
    raw.match(/\b(?:to|at|for|towards|from|by|biller|merchant|vpa)\s+([A-Z0-9][A-Z0-9 ._&-]{2,40})/i) ||
    raw.match(/\binfo:\s*([A-Z0-9._&-]{2,30})/i);
  let merchant = merchantMatch ? merchantMatch[1].replace(/\s+(on|dt|date|ref|utr|a\/c|acct|account|card|rs|inr|bal).*$/i, "").trim() : "";

  // Known merchant cleanup
  if (/swiggy/i.test(raw)) merchant = "Swiggy";
  else if (/zomato/i.test(raw)) merchant = "Zomato";
  else if (/amazon/i.test(raw)) merchant = "Amazon";
  else if (/flipkart/i.test(raw)) merchant = "Flipkart";
  else if (/uber/i.test(raw)) merchant = "Uber";
  else if (/ola/i.test(raw)) merchant = "Ola";
  else if (/dmart|d-mart/i.test(raw)) merchant = "D-Mart";
  else if (/jio/i.test(raw)) merchant = "Jio";
  else if (/airtel/i.test(raw)) merchant = "Airtel";
  else if (/petrol|fuel|shell|hpcl|bpcl|iocl/i.test(raw)) merchant = "Petrol Pump";

  // 3. Extract UTR / Ref Number
  const utrMatch = raw.match(/\b(?:ref|utr|txn id|transaction id|ref no|rrn)\s*[:#-]?\s*([a-z0-9]{6,20})\b/i);
  const utrNumber = utrMatch ? utrMatch[1] : "";

  // 4. Extract Account / Card Number
  const accountMatch = raw.match(/(?:a\/c|acct|account|card)\s*(?:xx|x+|\*)?(\d{3,6})/i);
  const accountNum = accountMatch ? accountMatch[1] : "";

  // 5. Date & Time
  const extractedDate = extractMessageDate(raw, isBillReminder ? "due" : "transaction");
  const timeMatch = raw.match(/\b(\d{1,2}):(\d{2})(?:\s?([ap]m))?\b/i);
  const parsedDate = extractedDate || todayISO();
  const parsedTime = timeMatch ? normalizeSmsTime(timeMatch) : nowTime();

  // 6. Payment Method
  const paymentMethod = /(upi)/i.test(raw) ? "UPI" : /(card|debit card|credit card)/i.test(raw) ? "Card" : /(imps|neft|rtgs|transfer)/i.test(raw) ? "Bank transfer" : "Bank";

  const creditKeywords = /\b(credited|credit|received|deposited|refund|cashback|salary|income|got|\bcr\b)\b/i;
  const debitKeywords = /\b(debited|debit|spent|paid|withdrawn|purchase|sent|\bdr\b)\b/i;
  const isCreditExplicit = creditKeywords.test(lower);
  const isDebitExplicit = debitKeywords.test(lower);

  let type = "Debit";
  if (isBillReminder) {
    type = "Debit";
  } else if (isCreditExplicit && !isDebitExplicit) {
    type = "Credit";
  } else if (isDebitExplicit && !isCreditExplicit) {
    type = "Debit";
  } else if (isCreditExplicit && isDebitExplicit) {
    const cIdx = lower.search(creditKeywords);
    const dIdx = lower.search(debitKeywords);
    type = cIdx < dIdx ? "Credit" : "Debit";
  } else {
    type = "Debit";
  }

  const title = merchant || (bankName ? `${bankName} ${type}` : (isBillReminder ? "Bill reminder" : type === "Credit" ? "Bank credit" : "Bank transaction"));

  // 7. Auto Category
  let category = "General";
  const titleLower = `${title} ${raw}`.toLowerCase();
  if (/(tea|coffee|chai|food|swiggy|zomato|lunch|dinner|breakfast|snacks|restaurant|burger|pizza|drink|cafe)/i.test(titleLower)) {
    category = "Food & Drinks";
  } else if (/(auto|cab|taxi|uber|ola|petrol|fuel|bus|train|flight|metro|travel)/i.test(titleLower)) {
    category = "Transport";
  } else if (/(groceries|supermarket|vegetables|milk|fruits|mart|dmart)/i.test(titleLower)) {
    category = "Groceries";
  } else if (/(rent|electric|electricity|water bill|wifi|internet|recharge|mobile|utility|jio|airtel)/i.test(titleLower)) {
    category = "Bills & Utilities";
  } else if (/(salary|freelance|bonus|interest|stipend)/i.test(titleLower)) {
    category = "Salary";
  } else if (/(shopping|clothes|shoes|book|amazon|flipkart)/i.test(titleLower)) {
    category = "Shopping";
  }

  // 8. Agentic Duplicate Check
  let isDuplicate = false;
  let existingItem = null;
  if (state) {
    const allExpenses = state.expenses || [];
    const allBills = state.bills || [];

    if (utrNumber) {
      existingItem = allExpenses.find((e) => e.notes && e.notes.includes(utrNumber));
    }
    if (!existingItem) {
      existingItem = allExpenses.find((e) => e.date === parsedDate && amount(e.amount) === amountValue && (e.title === title || e.notes?.includes(title)));
    }
    if (!existingItem && isBillReminder) {
      existingItem = allBills.find((b) => b.dueDate === parsedDate && amount(b.amount) === amountValue && b.title === title);
    }
    if (existingItem) {
      isDuplicate = true;
    }
  }

  const questions = [];
  if (!type) questions.push("Debit or credit");
  if (!merchant && !isBillReminder) questions.push("merchant/title");
  if (!extractedDate) questions.push(isBillReminder ? "due date" : "transaction date");

  return {
    amount: amountValue,
    type,
    title,
    bankName,
    merchant,
    utrNumber,
    accountNum,
    category,
    date: parsedDate,
    time: parsedTime,
    destination: isBillReminder ? "bill" : "daily",
    billStatus: isBillReminder ? "Unpaid" : "Paid",
    reminderBefore: isBillReminder ? "1 day" : "None",
    paymentMethod,
    isDuplicate,
    existingItem,
    confidence: type && (merchant || isBillReminder) && extractedDate ? "High" : "Review needed",
    needsReview: !type || (!merchant && !isBillReminder) || !extractedDate,
    questions,
    notes: [
      `Parsed from ${isBillReminder ? "bill reminder" : "bank SMS"}`,
      bankName ? `Bank: ${bankName}` : "",
      accountNum ? `Account/Card: XX${accountNum}` : "",
      utrNumber ? `Ref/UTR: ${utrNumber}` : "",
      raw
    ].filter(Boolean).join("\n")
  };
}

function extractMessageDate(text, mode = "transaction") {
  const source = String(text || "");
  const clean = source.replace(/[,]/g, " ");
  const preferred = mode === "due"
    ? clean.match(/(?:due(?:\s+date)?|pay\s+by|before|on\s+or\s+before)\D{0,20}(\d{1,2}(?:st|nd|rd|th)?[\s-/]*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*[\s-/]*\d{2,4}?|\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})/i)
    : clean.match(/(?:on|dt|date|txn\s+date|transaction\s+date)\D{0,14}(\d{1,2}(?:st|nd|rd|th)?[\s-/]*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*[\s-/]*\d{2,4}?|\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})/i);
  const preferredDate = preferred ? parseDateToken(preferred[1]) : "";
  if (preferredDate) return preferredDate;
  const patterns = [
    /\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/,
    /\b(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})\b/,
    /\b(\d{1,2})(?:st|nd|rd|th)?[\s-]+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*[\s-]*(\d{2,4})?\b/i,
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*[\s-]+(\d{1,2})(?:st|nd|rd|th)?[\s-]*(\d{2,4})?\b/i
  ];
  for (const pattern of patterns) {
    const match = clean.match(pattern);
    const parsed = match ? parseDateToken(match[0]) : "";
    if (parsed) return parsed;
  }
  return "";
}

function parseDateToken(token) {
  const value = String(token || "").replace(/,/g, " ").trim();
  let match = value.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (match) return formatIsoParts(match[1], match[2], match[3]);
  match = value.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (match) return normalizeSmsDate(match[1], match[2], match[3]);
  match = value.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s-]+([a-z]+)[\s-]*(\d{2,4})?$/i);
  if (match) return normalizeSmsDate(match[1], monthNumber(match[2]), match[3] || String(new Date().getFullYear()));
  match = value.match(/^([a-z]+)[\s-]+(\d{1,2})(?:st|nd|rd|th)?[\s-]*(\d{2,4})?$/i);
  if (match) return normalizeSmsDate(match[2], monthNumber(match[1]), match[3] || String(new Date().getFullYear()));
  return "";
}

function normalizeSmsDate(dayValue, monthValue, yearValue) {
  if (!monthValue) return "";
  const day = String(dayValue).padStart(2, "0");
  const month = String(monthValue).padStart(2, "0");
  const yearRaw = String(yearValue || new Date().getFullYear());
  const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
  return formatIsoParts(year, month, day);
}

function formatIsoParts(year, month, day) {
  const date = new Date(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  if (date.getFullYear() !== Number(year) || date.getMonth() + 1 !== Number(month) || date.getDate() !== Number(day)) return "";
  return `${year}-${month}-${day}`;
}

function monthNumber(name) {
  const key = String(name || "").slice(0, 3).toLowerCase();
  return { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" }[key] || "";
}

function normalizeSmsTime(match) {
  let hour = Number(match[1]);
  const minute = String(match[2]).padStart(2, "0");
  const meridian = match[3]?.toLowerCase();
  if (meridian === "pm" && hour < 12) hour += 12;
  if (meridian === "am" && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${minute}`;
}

function matchingCredentials(credentials, queryText) {
  const text = String(queryText || "").toLowerCase();
  const wantsAll = /\b(all|everything)\b/.test(text);
  return credentials.filter((credential) => {
    if (wantsAll) return true;
    const haystack = [credential.title, credential.type, credential.url, credential.username, credential.notes].join(" ").toLowerCase();
    if (text.includes("debit card")) return credential.type === "Debit Card";
    if (text.includes("credit card")) return credential.type === "Credit Card";
    if (text.includes("bank")) return credential.type === "Bank Account";
    if (text.includes("social")) return credential.type === "Social Media";
    if (text.includes("card")) return ["Debit Card", "Credit Card"].includes(credential.type);
    return text.split(/\s+/).filter((word) => word.length > 2).some((word) => haystack.includes(word));
  });
}

function getPendingAiActions(messages) {
  return messages.flatMap((message) =>
    (message.actions || [])
      .map((action, index) => ({ messageId: message.id, actionIndex: index, action }))
      .filter((entry) => !entry.action.status)
  );
}

function resolveAllPendingAiActions(current, mode) {
  return getPendingAiActions(current.aiMessages || []).reduce((next, entry) => {
    if (mode === "cancel") return markAiAction(next, entry.messageId, entry.actionIndex, "cancelled");
    return resolveSingleAiAction(next, entry.messageId, entry.actionIndex, entry.action, entry.action.data || {});
  }, current);
}

function resolveMessageAiActions(current, messageId, mode) {
  const message = (current.aiMessages || []).find((entry) => entry.id === messageId);
  if (!message) return current;
  return (message.actions || []).reduce((next, action, index) => {
    if (action.status) return next;
    if (mode === "cancel") return markAiAction(next, messageId, index, "cancelled");
    return resolveSingleAiAction(next, messageId, index, action, action.data || {});
  }, current);
}

function resolveSingleAiAction(current, messageId, actionIndex, action, dataOverride) {
  const next = applyAiActionData(current, action, dataOverride);
  const status = action.operation === "delete" ? "deleted" : action.operation === "edit" ? "updated" : "created";
  return markAiAction(next, messageId, actionIndex, status);
}

function markAiAction(current, messageId, actionIndex, status) {
  return {
    ...current,
    aiMessages: (current.aiMessages || []).map((message) => {
      if (message.id !== messageId) return message;
      return {
        ...message,
        actions: (message.actions || []).map((entry, index) =>
          index === actionIndex ? { ...entry, status, resolvedAt: new Date().toISOString() } : entry
        )
      };
    })
  };
}

function applyAiActionData(current, action, dataOverride = {}) {
  if (action.type === "projectSettlement") return applyAiProjectSettlement(current, action, dataOverride);
  const collection = collectionForKind(action.type);
  if (!collection) return current;
  const operation = action.operation || "create";
  const data = resolveLinkedAiData(current, action.type, dataOverride);

  if (operation === "delete") return applyAiDelete(current, collection, action);

  if (operation === "edit") {
    let nextState = {
      ...current,
      [collection]: current[collection].map((item) =>
        item.id === action.id
          ? { ...item, ...normalizeForm(action.type, data), id: item.id, updatedAt: new Date().toISOString() }
          : item
      )
    };
    if (action.type === "salary") {
      const updatedSalary = nextState.salaries.find(s => s.id === action.id);
      if (updatedSalary) {
        const matchingExpense = current.expenses.find(e => e.salaryId === action.id);
        const expenseRecord = {
          id: matchingExpense?.id || id("expense"),
          title: `Salary: ${updatedSalary.title}`,
          amount: updatedSalary.amount,
          type: "Credit",
          category: "Salary",
          date: updatedSalary.receivedDate,
          time: matchingExpense?.time || "",
          paymentMethod: updatedSalary.paymentMethod || "Bank transfer",
          notes: updatedSalary.notes,
          salaryId: action.id,
          updatedAt: new Date().toISOString()
        };
        nextState.expenses = matchingExpense
          ? current.expenses.map(e => e.salaryId === action.id ? expenseRecord : e)
          : [expenseRecord, ...current.expenses];
      }
    }
    if (action.type === "reminder") {
      const updatedReminder = nextState.reminders.find(r => r.id === action.id);
      if (updatedReminder) {
        if (updatedReminder.isMoneyReceive && updatedReminder.status === "Completed") {
          const matchingExpense = current.expenses.find(e => e.reminderId === action.id);
          const expenseRecord = {
            id: matchingExpense?.id || id("expense"),
            title: `Received: ${updatedReminder.title}`,
            amount: updatedReminder.moneyAmount || 0,
            type: "Credit",
            category: "Salary",
            date: updatedReminder.date || todayISO(),
            time: matchingExpense?.time || updatedReminder.time || "",
            paymentMethod: "UPI",
            notes: updatedReminder.description || "",
            reminderId: action.id,
            updatedAt: new Date().toISOString()
          };
          nextState.expenses = matchingExpense
            ? current.expenses.map(e => e.reminderId === action.id ? expenseRecord : e)
            : [expenseRecord, ...current.expenses];
        } else {
          nextState.expenses = current.expenses.filter(e => e.reminderId !== action.id);
        }
      }
    }
    return nextState;
  }

  const record = {
    ...normalizeForm(action.type, withAiDefaults(action.type, data)),
    id: id(action.type),
    updatedAt: new Date().toISOString()
  };
  let nextState = { ...current, [collection]: [record, ...current[collection]] };
  if (action.type === "salary") {
    const expenseRecord = {
      id: id("expense"),
      title: `Salary: ${record.title}`,
      amount: record.amount,
      type: "Credit",
      category: "Salary",
      date: record.receivedDate,
      time: "",
      paymentMethod: record.paymentMethod || "Bank transfer",
      notes: record.notes,
      salaryId: record.id,
      updatedAt: new Date().toISOString()
    };
    nextState.expenses = [expenseRecord, ...current.expenses];
  }
  if (action.type === "reminder") {
    if (record.isMoneyReceive && record.status === "Completed") {
      const expenseRecord = {
        id: id("expense"),
        title: `Received: ${record.title}`,
        amount: record.moneyAmount || 0,
        type: "Credit",
        category: "Salary",
        date: record.date || todayISO(),
        time: record.time || "",
        paymentMethod: "UPI",
        notes: record.description || "",
        reminderId: record.id,
        updatedAt: new Date().toISOString()
      };
      nextState.expenses = [expenseRecord, ...current.expenses];
    }
  }
  return nextState;
}

function applyAiProjectSettlement(current, action, dataOverride = {}) {
  const operation = action.operation || "create";
  const data = { ...(action.data || {}), ...(dataOverride || {}) };
  const project = data.projectId
    ? current.projects.find((entry) => entry.id === data.projectId)
    : current.projects.find((entry) => entry.name?.toLowerCase() === String(data.projectName || "").toLowerCase());
  const projectId = project?.id;
  if (!projectId && operation !== "delete" && operation !== "edit") return current;

  if (operation === "delete") {
    return {
      ...current,
      projects: current.projects.map((entry) =>
        (entry.paidSettlements || []).some((settlement) => settlement.id === action.id)
          ? { ...entry, paidSettlements: (entry.paidSettlements || []).filter((settlement) => settlement.id !== action.id), updatedAt: new Date().toISOString() }
          : entry
      )
    };
  }

  if (operation === "edit") {
    return {
      ...current,
      projects: current.projects.map((entry) => {
        const hasSettlement = (entry.paidSettlements || []).some((settlement) => settlement.id === action.id);
        if (!hasSettlement) return entry;
        return {
          ...entry,
          paidSettlements: (entry.paidSettlements || []).map((settlement) =>
            settlement.id === action.id
              ? (() => {
                  const projectTransactions = current.projectTransactions.filter((item) => item.projectId === entry.id);
                  const withoutThis = { ...entry, paidSettlements: (entry.paidSettlements || []).filter((item) => item.id !== settlement.id) };
                  const originalPending = projectSplitSummary(withoutThis, projectTransactions).settlements.find((item) => item.from === settlement.from && item.to === settlement.to);
                  const max = amount(originalPending?.amount || settlement.amount);
                  const safeAmount = Math.min(Math.max(amount(data.amount ?? settlement.amount), 0), max);
                  return {
                    ...settlement,
                    ...data,
                    id: settlement.id,
                    amount: safeAmount,
                    paymentType: data.paymentType || (safeAmount >= max ? "Full" : "Custom"),
                    updatedAt: new Date().toISOString()
                  };
                })()
              : settlement
          ),
          updatedAt: new Date().toISOString()
        };
      })
    };
  }

  if (!data.from || !data.to || amount(data.amount) <= 0) return current;
  const projectTransactions = current.projectTransactions.filter((item) => item.projectId === projectId);
  const pending = projectSplitSummary(project, projectTransactions).settlements.find((item) => item.from === data.from && item.to === data.to);
  const safeAmount = Math.min(amount(data.amount), amount(pending?.amount || data.amount));
  const paid = {
    id: id("settlement"),
    from: data.from,
    to: data.to,
    amount: safeAmount,
    paymentType: data.paymentType || (pending && safeAmount >= amount(pending.amount) ? "Full" : "Custom"),
    paidAt: data.paidAt || new Date().toISOString()
  };
  return {
    ...current,
    projects: current.projects.map((entry) =>
      entry.id === projectId
        ? { ...entry, paidSettlements: [paid, ...(entry.paidSettlements || [])], updatedAt: new Date().toISOString() }
        : entry
    )
  };
}

function resolveLinkedAiData(current, type, data) {
  if (type === "projectTransaction" && !data.projectId && data.projectName) {
    const project = current.projects.find((entry) => entry.name?.toLowerCase() === String(data.projectName).toLowerCase());
    if (project) return { ...data, projectId: project.id };
  }
  if (type === "salaryExpense" && !data.salaryId && data.salaryTitle) {
    const salary = current.salaries.find((entry) => entry.title?.toLowerCase() === String(data.salaryTitle).toLowerCase());
    if (salary) return { ...data, salaryId: salary.id };
  }
  if (["fuelLog", "serviceLog", "chargingLog", "vehicleReminder", "vehicleDocument"].includes(type) && !data.vehicleId && data.vehicleName) {
    const vehicle = current.vehicles.find((entry) => 
      entry.name?.toLowerCase() === String(data.vehicleName).toLowerCase() ||
      entry.model?.toLowerCase() === String(data.vehicleName).toLowerCase()
    );
    if (vehicle) return { ...data, vehicleId: vehicle.id };
  }
  return data;
}

function applyAiDelete(current, collection, action) {
  const next = { ...current, [collection]: current[collection].filter((item) => item.id !== action.id) };
  if (action.type === "project") {
    next.projectTransactions = current.projectTransactions.filter((item) => item.projectId !== action.id);
  }
  if (action.type === "salary") {
    next.salaryExpenses = current.salaryExpenses.filter((item) => item.salaryId !== action.id);
    next.expenses = current.expenses.filter((item) => item.salaryId !== action.id);
  }
  if (action.type === "reminder") {
    next.expenses = current.expenses.filter((item) => item.reminderId !== action.id);
  }
  if (action.type === "vehicle") {
    next.fuelLogs = current.fuelLogs.filter((item) => item.vehicleId !== action.id);
    next.serviceLogs = current.serviceLogs.filter((item) => item.vehicleId !== action.id);
    next.chargingLogs = current.chargingLogs.filter((item) => item.vehicleId !== action.id);
    next.vehicleReminders = current.vehicleReminders.filter((item) => item.vehicleId !== action.id);
    next.vehicleDocuments = current.vehicleDocuments.filter((item) => item.vehicleId !== action.id);
  }
  return next;
}

function operationLabel(operation) {
  return { create: "Create", edit: "Save Edit", delete: "Delete" }[operation] || "Apply";
}

function actionDoneLabel(operation) {
  return { create: "Created", edit: "Updated", delete: "Deleted", created: "Created", updated: "Updated", deleted: "Deleted", cancelled: "Cancelled" }[operation] || "Done";
}

function Field({ field, value, set, form }) {
  const [showSecret, setShowSecret] = useState(false);
  if (field.type === "password") {
    return (
      <label className={field.wide ? "wide" : ""}>
        {field.label}
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <input
            type={showSecret ? "text" : "password"}
            value={value || ""}
            onChange={(e) => set(field.name, e.target.value)}
            required={field.required}
            style={{ flex: 1 }}
          />
          <button
            type="button"
            className="icon-button tactile"
            style={{ minWidth: "38px", height: "38px" }}
            onClick={() => setShowSecret((prev) => !prev)}
            title={showSecret ? "Hide secret" : "Show secret"}
            aria-label={showSecret ? "Hide secret" : "Show secret"}
          >
            {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </label>
    );
  }
  if (field.type === "billSplits") {
    return <BillSplitsEditor field={field} value={value} set={set} form={form} />;
  }
  if (field.type === "subtasks") {
    const textValue = Array.isArray(value) ? normalizeSubtasks(value).map((item) => item.title).join("\n") : value || "";
    return <label className={field.wide ? "wide" : ""}>{field.label}<textarea value={textValue} onChange={(e) => set(field.name, e.target.value)} /></label>;
  }
  if (field.type === "textarea") return <label className={field.wide ? "wide" : ""}>{field.label}<textarea value={value || ""} onChange={(e) => set(field.name, e.target.value)} required={field.required} /></label>;
  if (field.type === "select") return <label className={field.wide ? "wide" : ""}>{field.label}<Select value={value || ""} onChange={(next) => set(field.name, next)} options={field.options} /></label>;
  if (field.type === "participantMulti") {
    const selected = splitParticipants(Array.isArray(value) ? value.join(",") : value);
    const toggle = (name) => {
      const next = selected.includes(name) ? selected.filter((item) => item !== name) : [...selected, name];
      set(field.name, next.join(", "));
    };
    return (
      <label className="wide">{field.label}
        <div className="participant-picker">
          {field.options.length ? field.options.map(([key, label]) => (
            <button type="button" className={`participant-chip tactile ${selected.includes(key) ? "active" : ""}`} key={key} onClick={() => toggle(key)}>
              <Users size={15} />{label}
            </button>
          )) : <input value={value || ""} onChange={(e) => set(field.name, e.target.value)} />}
        </div>
      </label>
    );
  }
  if (field.type === "participantMultiCustom") {
    return <ParticipantMultiCustom field={field} value={value} set={set} />;
  }
  if (field.type === "checkbox") return <label className="toggle-row"><input type="checkbox" checked={Boolean(value)} onChange={(e) => set(field.name, e.target.checked)} />{field.label}</label>;
  if (field.type === "file") return <label className={field.wide ? "wide" : ""}>{field.label}<input type="file" accept="image/*" onChange={(e) => readImage(e.target.files?.[0], (image) => set(field.name, image))} /></label>;
  if (field.type === "date" || field.type === "month") {
    return (
      <label className={field.wide ? "wide" : ""}>
        {field.label}
        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <input
            type={field.type}
            value={value || ""}
            onChange={(e) => set(field.name, e.target.value)}
            required={field.required}
            min={field.min}
            style={{ flex: 1, padding: "0.5rem 0.65rem" }}
          />
          {field.type === "date" && (
            <button
              type="button"
              className="secondary tactile"
              style={{ padding: "0.45rem 0.65rem", fontSize: "0.75rem", fontWeight: "700", whiteSpace: "nowrap" }}
              onClick={() => set(field.name, todayISO())}
              title="Set to today"
            >
              Today
            </button>
          )}
        </div>
      </label>
    );
  }
  return <label className={field.wide ? "wide" : ""}>{field.label}<input type={field.type || "text"} min={field.min} step={field.step} value={value || ""} onChange={(e) => set(field.name, e.target.value)} required={field.required} /></label>;
}

function BillSplitsEditor({ field, value, set, form }) {
  const splits = Array.isArray(value) ? value : [];
  const [name, setName] = useState("");
  const [amountVal, setAmountVal] = useState("");

  const addSplit = () => {
    const trimmedName = name.trim();
    const parsedAmount = parseFloat(amountVal) || 0;
    if (!trimmedName || parsedAmount <= 0) return;
    const next = [...splits, { id: id("split"), name: trimmedName, amount: parsedAmount }];
    set(field.name, next);
    setName("");
    setAmountVal("");
  };

  const removeSplit = (index) => {
    const next = splits.filter((_, i) => i !== index);
    set(field.name, next);
  };

  const totalBill = parseFloat(form.amount) || 0;
  const collected = splits.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
  const remaining = Math.max(totalBill - collected, 0);

  return (
    <div className="bill-splits-editor wide">
      <span className="field-label-text" style={{ display: "block", marginBottom: "0.5rem", fontWeight: "bold", fontSize: "0.85rem" }}>{field.label}</span>
      
      {splits.length > 0 && (
        <div className="bill-splits-list">
          {splits.map((item, index) => (
            <div className="bill-split-row" key={item.id || index}>
              <span>{item.name}: <strong>{rupee.format(item.amount)}</strong></span>
              <button type="button" className="icon-button danger tactile" onClick={() => removeSplit(index)}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="bill-split-inputs inline-add">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Person name" />
        <input type="number" value={amountVal} onChange={(e) => setAmountVal(e.target.value)} placeholder="Amount" min="0" step="any" />
        <button className="secondary tactile" type="button" onClick={addSplit}>Add Split</button>
      </div>

      <div className="bill-splits-summary">
        <div className="summary-row">
          <span>Total Bill:</span>
          <span>{rupee.format(totalBill)}</span>
        </div>
        <div className="summary-row to-collect">
          <span>To collect from others:</span>
          <span>{rupee.format(collected)}</span>
        </div>
        <div className="summary-row to-pay">
          <span>Remaining to be paid by me:</span>
          <strong>{rupee.format(remaining)}</strong>
        </div>
      </div>
    </div>
  );
}

function ParticipantMultiCustom({ field, value, set }) {
  const selected = splitParticipants(Array.isArray(value) ? value.join(",") : value);
  const [customName, setCustomName] = useState("");
  const toggle = (name) => {
    const next = selected.includes(name) ? selected.filter((item) => item !== name) : [...selected, name];
    set(field.name, next.join(", "));
  };
  const addCustom = () => {
    const name = customName.trim();
    if (!name) return;
    set(field.name, uniqueList([...selected, name]).join(", "));
    setCustomName("");
  };
  return (
    <label className="wide">{field.label}
      <div className="participant-picker">
        {field.options.map(([key, label]) => (
          <button type="button" className={`participant-chip tactile ${selected.includes(key) ? "active" : ""}`} key={key} onClick={() => toggle(key)}>
            <Users size={15} />{label}
          </button>
        ))}
        {selected.filter((name) => !field.options.some(([key]) => key === name)).map((name) => (
          <button type="button" className="participant-chip active tactile" key={name} onClick={() => toggle(name)}>
            <Users size={15} />{name}
          </button>
        ))}
      </div>
      <div className="inline-add">
        <input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="Add participant name" />
        <button className="secondary tactile" type="button" onClick={addCustom}>Add</button>
      </div>
    </label>
  );
}

function Select({ value, onChange, options }) {
  const normalized = options.map((option) => Array.isArray(option) ? option : [option, option]);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {normalized.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
    </select>
  );
}

function Segmented({ value, onChange, options, className = "" }) {
  return (
    <div className={`segmented ${className}`.trim()}>
      {options.map(([key, label]) => <button type="button" key={key} className={value === key ? "active" : ""} onClick={() => onChange(key)}>{label}</button>)}
    </div>
  );
}

function SectionHeader({ title, action }) {
  return (
    <div className="section-header">
      <h2>{title}</h2>
      {action}
    </div>
  );
}

function Toolbar({ query, setQuery, filter, setFilter, options }) {
  return (
    <div className="toolbar">
      <label className="search-box"><Search size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" /></label>
      <label className="filter-box"><Filter size={18} /><Select value={filter} onChange={setFilter} options={options} /></label>
    </div>
  );
}

function Toggle({ label, checked, onChange }) {
  return <label className="toggle-row"><input type="checkbox" checked={Boolean(checked)} onChange={(e) => onChange(e.target.checked)} />{label}</label>;
}

function MetricGrid({ metrics }) {
  return (
    <div className="metric-grid">
      {metrics.map(([label, value]) => (
        <div className="metric-card raised" key={label}>
          <span>{label}</span>
          <strong>{typeof value === "number" ? rupee.format(value) : value}</strong>
        </div>
      ))}
    </div>
  );
}

function MiniList({ title, items, empty, field }) {
  return (
    <div className="mini-list">
      <h3>{title}</h3>
      {items.length ? items.slice(0, 5).map((item) => <p key={item.id}><span>{item[field]}</span><small>{item.time || item.dueTime || item.startTime || item.status}</small></p>) : <EmptyState text={empty} small />}
    </div>
  );
}
function Linkify({ children }) {
  if (typeof children !== "string" || !children) return children;
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = children.split(urlRegex);
  return (
    <>
      {parts.map((part, i) => {
        if (part.match(urlRegex)) {
          return (
            <a key={i} href={part} target="_blank" rel="noopener noreferrer" style={{ color: "var(--brand)", textDecoration: "underline", wordBreak: "break-all" }}>
              {part}
            </a>
          );
        }
        return part;
      })}
    </>
  );
}

function EmptyState({ text, small = false }) {
  return <div className={`empty-state ${small ? "small" : ""}`}><p>{text}</p></div>;
}

function AlertRow({ alert }) {
  return <div className={`alert-row ${alert.level}`}><strong>{alert.title}</strong><span>{alert.message}</span></div>;
}

function TransactionRow({ item }) {
  return (
    <div className="transaction-row">
      <div><strong>{item.title}</strong><small>{item.source} - {formatDate(item.date)}</small></div>
      <span className={item.type === "Credit" ? "credit" : "debit"}>{item.type === "Credit" ? "+" : "-"}{rupee.format(amount(item.amount))}</span>
    </div>
  );
}

function ExpenseSplitInlineDetails({ expense, project, isCloud, onMarkPaid, onDeletePaid, setConfirmDialog, setViewingImage = () => {} }) {
  const [expanded, setExpanded] = useState(false);
  const [customKey, setCustomKey] = useState("");
  const [customAmount, setCustomAmount] = useState("");

  const splitMode = expense.splitMode || (expense.owed_by ? "Direct owed" : (expense.participants && expense.participants.length > 0 ? "Equal split" : "No split"));
  if (splitMode === "No split") return null;

  let rows = [];
  const amtVal = Number(expense.amount || 0);
  const paidBy = expense.paidBy || expense.paid_by;

  if (splitMode === "Direct owed") {
    const owedBy = expense.owedBy || expense.owed_by;
    if (paidBy && owedBy && paidBy !== owedBy) {
      rows = [{ from: owedBy, to: paidBy, amount: Math.round(amtVal * 100) / 100, label: "owes", expenseId: expense.id }];
    }
  } else if (splitMode === "Equal split") {
    const splitMembers = (expense.participants || []).filter(Boolean);
    if (paidBy && splitMembers.length > 0) {
      const share = amtVal / splitMembers.length;
      rows = splitMembers
        .filter((name) => name !== paidBy)
        .map((name) => ({ from: name, to: paidBy, amount: Math.round(share * 100) / 100, label: "owes", expenseId: expense.id }));
    }
  }

  if (rows.length === 0) return null;

  return (
    <div className="expense-inline-splits" style={{ marginTop: "0.5rem", fontSize: "0.85rem", width: "100%", borderTop: "1px dashed rgba(0,0,0,0.06)", paddingTop: "0.4rem" }}>
      <div 
        style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: "var(--brand, #6f68d8)", cursor: "pointer", fontWeight: 700 }}
        onClick={() => setExpanded(!expanded)}
      >
        <span>👥 This payment is split ({splitMode})</span>
        <span style={{ fontSize: "0.75rem", opacity: 0.8 }}>(Click arrow to see owed details)</span>
        <span style={{ display: "inline-flex", transform: expanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
          ▼
        </span>
      </div>
      
      {expanded && (
        <div style={{ marginTop: "0.4rem", padding: "0.6rem 0.8rem", background: "rgba(0,0,0,0.02)", borderRadius: "10px", border: "1px dashed rgba(0,0,0,0.08)", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {rows.map((row, idx) => {
            const rowKey = `${row.from}_${row.to}_${idx}`;
            // Find linked settlement to check if already paid
            const linked = (project?.paidSettlements || []).find(s => 
              s.from === row.from &&
              s.to === row.to &&
              (!s.expenseId || String(s.expenseId) === String(expense.id))
            );

            return (
              <div key={rowKey} style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
                  <span>
                    <strong>{row.from}</strong> owes <strong>{row.to}</strong>: <strong>{rupee.format(row.amount)}</strong>
                  </span>
                  
                  {linked ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
                      <span style={{ color: "#2a9d8f", fontWeight: "bold", background: "rgba(42, 157, 143, 0.08)", padding: "2px 8px", borderRadius: "8px", border: "1px solid rgba(42, 157, 143, 0.12)", fontSize: "0.8rem" }}>
                        ✓ Paid: {rupee.format(linked.amount)}
                      </span>
                      {(() => {
                        const { urls } = extractAttachmentUrls(linked.notes || "");
                        const hasNoProof = linked.notes && linked.notes.includes("[No payment proof provided]");
                        return (
                          <>
                            {urls && urls.map((url, uidx) => (
                              <span key={uidx} style={{ display: "inline-flex", alignItems: "center", background: "rgba(16, 185, 129, 0.08)", color: "#10b981", padding: "2px 8px", borderRadius: "8px", border: "1px solid rgba(16, 185, 129, 0.12)", fontWeight: "bold", fontSize: "0.78rem" }}>
                                <a href={url} onClick={(e) => { e.preventDefault(); setViewingImage?.(url); }} style={{ color: "inherit", textDecoration: "none" }}>Proof {urls.length > 1 ? `#${uidx + 1}` : ""}</a>
                              </span>
                            ))}
                            {hasNoProof && (
                              <span style={{ display: "inline-flex", alignItems: "center", background: "rgba(239, 68, 68, 0.08)", color: "#ef4444", padding: "2px 8px", borderRadius: "8px", border: "1px solid rgba(239, 68, 68, 0.12)", fontWeight: "bold", fontSize: "0.78rem" }}>
                                No Proof
                              </span>
                            )}
                          </>
                        );
                      })()}
                      <button 
                        className="secondary tactile" 
                        style={{ padding: "2px 6px", fontSize: "0.72rem", opacity: 0.5, cursor: "not-allowed" }} 
                        type="button" 
                        disabled
                        title="Already paid. Delete payment or edit amount to change."
                      >
                        Fully Paid
                      </button>
                      <button 
                        className="secondary tactile" 
                        style={{ padding: "2px 6px", fontSize: "0.72rem" }} 
                        type="button" 
                        onClick={() => {
                          setCustomKey(customKey === rowKey ? "" : rowKey);
                          setCustomAmount(String(linked.amount));
                        }}
                      >
                        Custom
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: "0.3rem", alignItems: "center" }}>
                      <span style={{ color: "#e76f51", fontWeight: "bold", background: "rgba(231, 111, 81, 0.08)", padding: "2px 8px", borderRadius: "8px", border: "1px solid rgba(231, 111, 81, 0.12)", fontSize: "0.8rem", marginRight: "0.2rem" }}>
                        ⏳ Pending
                      </span>
                      <button 
                        className="secondary tactile" 
                        style={{ padding: "2px 6px", fontSize: "0.72rem" }} 
                        type="button" 
                        onClick={() => {
                          setConfirmDialog({
                            title: "Mark as Paid",
                            message: `Are you sure you want to mark this split as fully paid (${rupee.format(row.amount)})?`,
                            confirmLabel: "Mark Paid",
                            tone: "primary",
                            onConfirm: () => onMarkPaid(row, row.amount, "Full")
                          });
                        }}
                      >
                        Fully Paid
                      </button>
                      <button 
                        className="secondary tactile" 
                        style={{ padding: "2px 6px", fontSize: "0.72rem" }} 
                        type="button" 
                        onClick={() => {
                          setCustomKey(customKey === rowKey ? "" : rowKey);
                          setCustomAmount("");
                        }}
                      >
                        Custom
                      </button>
                    </div>
                  )}
                </div>
                {customKey === rowKey && (
                  <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", marginTop: "0.2rem", flexWrap: "wrap" }}>
                    <input
                      type="number"
                      step="0.01"
                      value={customAmount}
                      onChange={(e) => setCustomAmount(e.target.value)}
                      placeholder={`Max ${row.amount}`}
                      min="0.01"
                      max={row.amount}
                      style={{ padding: "2px 6px", width: "80px", fontSize: "0.8rem", border: "1px solid var(--line)", borderRadius: "6px" }}
                    />
                    <button 
                      className="primary tactile" 
                      style={{ padding: "2px 8px", fontSize: "0.72rem" }} 
                      type="button" 
                      onClick={() => {
                        const safeAmt = Math.min(Math.max(Number(customAmount), 0), row.amount);
                        if (safeAmt > 0) {
                          setConfirmDialog({
                            title: "Save Payment",
                            message: `Are you sure you want to save settlement payment of ${rupee.format(safeAmt)}?`,
                            confirmLabel: "Save",
                            tone: "primary",
                            onConfirm: () => {
                              onMarkPaid(row, safeAmt, "Custom", linked?.id);
                              setCustomKey("");
                              setCustomAmount("");
                            }
                          });
                        }
                      }}
                    >
                      Save
                    </button>
                    {linked && onDeletePaid && (
                      <button 
                        className="secondary danger tactile" 
                        style={{ padding: "2px 8px", fontSize: "0.72rem" }} 
                        type="button" 
                        onClick={() => {
                          setConfirmDialog({
                            title: "Delete Payment",
                            message: "Are you sure you want to delete this settlement payment?",
                            confirmLabel: "Delete",
                            tone: "danger",
                            onConfirm: () => {
                              onDeletePaid(linked);
                              setCustomKey("");
                              setCustomAmount("");
                            }
                          });
                        }}
                      >
                        Delete Payment
                      </button>
                    )}
                    <button 
                      className="secondary tactile" 
                      style={{ padding: "2px 6px", fontSize: "0.72rem" }} 
                      type="button" 
                      onClick={() => setCustomKey("")}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RecordTable({ list, type, setModal, remove, project, upsert, requestConfirm, setViewingImage = () => {} }) {
  const handleRemove = (item) => {
    if (typeof remove === "function") {
      if (remove.length === 1) {
        remove(item.id);
      } else {
        const col = collectionForKind(type) || "expenses";
        remove(col, item.id, type || "expense");
      }
    }
  };

  return (
    <div className="record-table">
      {list.length ? list.map((item) => (
        <div className="transaction-row" key={item.id} style={{ display: "flex", flexDirection: "column", alignItems: "stretch", minHeight: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
            <div>
              <strong>{item.title}</strong>
              <small>{item.category || item.source} - {formatDate(item.date || item.receivedDate)}</small>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span className={item.type === "Credit" ? "credit" : "debit"}>{item.amount ? rupee.format(amount(item.amount)) : item.status}</span>
              <button className="icon-button tactile" type="button" onClick={() => setModal({ kind: type, item })}><Edit3 size={16} /></button>
              <button className="icon-button tactile danger" type="button" onClick={() => handleRemove(item)}><Trash2 size={16} /></button>
            </div>
          </div>
          {type === "projectTransaction" && (
            <ExpenseSplitInlineDetails 
              expense={item} 
              project={project} 
              isCloud={false} 
              setConfirmDialog={requestConfirm} 
              setViewingImage={setViewingImage}
              onMarkPaid={(row, amt, paymentType, existingSettlementId) => {
                if (!project || !upsert) return;
                if (existingSettlementId) {
                  const updatedSettlements = (project.paidSettlements || []).map(s => 
                    s.id === existingSettlementId 
                      ? { ...s, amount: Math.round(amt * 100) / 100, paymentType }
                      : s
                  );
                  upsert("projects", { ...project, paidSettlements: updatedSettlements }, "project");
                } else {
                  const paid = {
                    id: id("settlement"),
                    from: row.from,
                    to: row.to,
                    amount: Math.round(amt * 100) / 100,
                    paymentType,
                    paidAt: new Date().toISOString(),
                    expenseId: item.id
                  };
                  upsert("projects", { ...project, paidSettlements: [paid, ...(project.paidSettlements || [])] }, "project");
                }
              }} 
              onDeletePaid={(settlement) => {
                if (!project || !upsert) return;
                const updatedSettlements = (project.paidSettlements || []).filter(s => s.id !== settlement.id);
                upsert("projects", { ...project, paidSettlements: updatedSettlements }, "project");
              }}
            />
          )}
        </div>
      )) : <EmptyState text="No records match this view." />}
    </div>
  );
}

function DateGroupedRecordTable({ list, type, setModal, remove, project, upsert, requestConfirm, setViewingImage = () => {} }) {
  const groups = list.reduce((acc, item) => {
    const date = item.date || item.receivedDate || "No date";
    acc[date] = acc[date] || [];
    acc[date].push(item);
    return acc;
  }, {});
  const dates = Object.keys(groups).sort((a, b) => String(b).localeCompare(String(a)));
  if (!dates.length) return <EmptyState text="No records match this view." />;
  return (
    <div className="date-grouped-table">
      {dates.map((date) => (
        <section className="date-money-group" key={date}>
          <div className="date-money-header">
            <strong>{date === todayISO() ? "Today" : formatDate(date)}</strong>
            <span>{rupee.format(sum(groups[date], (item) => item.type === "Debit"))} debit - {rupee.format(sum(groups[date], (item) => item.type === "Credit"))} credit</span>
          </div>
          <RecordTable list={groups[date].sort(sortByTimeDesc)} type={type} setModal={setModal} remove={remove} project={project} upsert={upsert} requestConfirm={requestConfirm} setViewingImage={setViewingImage} />
        </section>
      ))}
    </div>
  );
}

function ProjectParticipantBreakdown({ project, transactions }) {
  const { stats } = projectSplitSummary(project, transactions);
  return (
    <section className="participant-panel">
      <SectionHeader title="Participant Spending" />
      {stats.length ? stats.map((item) => (
        <div className="participant-row" key={item.name}>
          <strong>{item.name}</strong>
          <span>Paid {rupee.format(item.paid)}</span>
          <span>Share {rupee.format(item.share)}</span>
          <span className={item.balance >= 0 ? "credit" : "debit"}>{item.balance >= 0 ? "Gets" : "Owes"} {rupee.format(Math.abs(item.balance))}</span>
        </div>
      )) : <EmptyState text="Add project participants to see person-wise spending." small />}
    </section>
  );
}

function ProjectSplitView({ project, transactions, upsert, requestConfirm, setViewingImage = () => {} }) {
  const { stats, settlements, splitTransactions, equalSplits, directOwedSplits, paidSettlements } = projectSplitSummary(project, transactions);
  const [customSettlementKey, setCustomSettlementKey] = useState("");
  const [customAmount, setCustomAmount] = useState("");
  const [editingSettlementId, setEditingSettlementId] = useState("");
  const [editingAmount, setEditingAmount] = useState("");
  const settlementKey = (item) => `${item.from}__${item.to}`;
  const markSettlementPaid = (item, paidAmount = item.amount, paymentType = "Full") => {
    const safeAmount = Math.min(Math.max(amount(paidAmount), 0), amount(item.amount));
    if (safeAmount <= 0) return;
    const paid = {
      id: id("settlement"),
      from: item.from,
      to: item.to,
      amount: Math.round(safeAmount * 100) / 100,
      paymentType,
      paidAt: new Date().toISOString()
    };
    if (project.isCloud && hasSupabase()) {
      upsertCloudExpense({
        id: paid.id,
        project_id: project.id,
        title: `Settlement: ${item.from} paid ${item.to}`,
        amount: paid.amount,
        category: "Settlement",
        date: todayISO(),
        time: nowTime(),
        paid_by: item.from,
        owed_by: item.to,
        participants: [],
        payment_method: "UPI",
        notes: `Settlement payment (${paymentType})`,
        created_by: project.owner_name || "Owner",
        created_at: paid.paidAt
      })
      .then(() => {
        addCloudActivity(
          project.id,
          "add_settlement",
          `Settlement of ₹${paid.amount} from ${item.from} to ${item.to} was paid`,
          project.owner_name || "Owner"
        ).catch(console.error);
      })
      .catch(console.error);
    } else {
      upsert("projects", { ...project, paidSettlements: [paid, ...(project.paidSettlements || [])] }, "project");
    }
    setCustomSettlementKey("");
    setCustomAmount("");
  };
  const deleteSettlementPaid = (settlement) => {
    const applyDelete = () => {
      if (project.isCloud && hasSupabase()) {
        deleteCloudExpense(settlement.id)
        .then(() => {
          addCloudActivity(
            project.id,
            "delete_settlement",
            `Settlement payment of ₹${settlement.amount} from ${settlement.from} to ${settlement.to} was deleted`,
            project.owner_name || "Owner"
          ).catch(console.error);
        })
        .catch(console.error);
      } else {
        upsert("projects", { ...project, paidSettlements: (project.paidSettlements || []).filter((item) => item.id !== settlement.id) }, "project");
      }
    };
    if (requestConfirm) {
      requestConfirm({
        title: "Delete settlement payment?",
        message: `${settlement.from} paid ${rupee.format(settlement.amount)} to ${settlement.to}. Deleting this will add the amount back to pending owes.`,
        confirmLabel: "Delete Payment",
        onConfirm: applyDelete
      });
      return;
    }
    applyDelete();
  };
  const editableMax = (settlement) => {
    const withoutThis = { ...project, paidSettlements: (project.paidSettlements || []).filter((item) => item.id !== settlement.id) };
    const originalPending = projectSplitSummary(withoutThis, transactions).settlements.find((item) => item.from === settlement.from && item.to === settlement.to);
    return amount(originalPending?.amount || settlement.amount);
  };
  const saveSettlementEdit = (settlement) => {
    const max = editableMax(settlement);
    const safeAmount = Math.min(Math.max(amount(editingAmount), 0), max);
    if (safeAmount <= 0) return;
    if (project.isCloud && hasSupabase()) {
      const roundedAmt = Math.round(safeAmount * 100) / 100;
      upsertCloudExpense({
        id: settlement.id,
        project_id: project.id,
        title: `Settlement: ${settlement.from} paid ${settlement.to}`,
        amount: roundedAmt,
        category: "Settlement",
        date: todayISO(),
        time: nowTime(),
        paid_by: settlement.from,
        owed_by: settlement.to,
        participants: [],
        payment_method: "UPI",
        notes: `Settlement payment (Custom) - edited`,
        created_by: project.owner_name || "Owner",
        created_at: settlement.paidAt || new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .then(() => {
        addCloudActivity(
          project.id,
          "edit_settlement",
          `Settlement payment from ${settlement.from} to ${settlement.to} was updated to ₹${roundedAmt}`,
          project.owner_name || "Owner"
        ).catch(console.error);
      })
      .catch(console.error);
    } else {
      const roundedAmt = Math.round(safeAmount * 100) / 100;
      upsert("projects", {
        ...project,
        paidSettlements: (project.paidSettlements || []).map((item) =>
          item.id === settlement.id
            ? { ...item, amount: roundedAmt, paymentType: safeAmount >= max ? "Full" : "Custom", updatedAt: new Date().toISOString() }
            : item
        )
      }, "project");
    }
    setEditingSettlementId("");
    setEditingAmount("");
  };
  return (
    <section className="split-ledger">
      <SectionHeader title="Split Settlement" />
      <div className="split-summary-grid">
        {stats.length ? stats.map((item) => (
          <article className="split-person-card" key={item.name}>
            <strong>{item.name}</strong>
            <span style={{ fontSize: "0.85rem", color: "var(--ink)", display: "block", marginBottom: "0.25rem" }}>Total Spent: <strong>{rupee.format(item.totalSpent)}</strong></span>
            <span style={{ fontSize: "0.76rem", opacity: 0.8, display: "block" }}>Paid (in splits): {rupee.format(item.paid)}</span>
            <span style={{ fontSize: "0.76rem", opacity: 0.8, display: "block" }}>Split Share: {rupee.format(item.share)}</span>
            <b className={item.balance >= 0 ? "credit" : "debit"} style={{ marginTop: "0.35rem", display: "block" }}>
              {item.balance >= 0 ? "Should receive" : "Should pay"} {rupee.format(Math.abs(item.balance))}
            </b>
          </article>
        )) : <EmptyState text="Add participants and project expenses to calculate split balances." />}
      </div>
      <section className="date-money-group">
        <SectionHeader title="Who Pays Whom" />
        {settlements.length ? settlements.map((item, index) => (
          <div className="settlement-card" key={`${item.from}-${item.to}-${index}`}>
            <div className="settlement-row">
              <span>{item.from}</span>
              <strong>pays {rupee.format(item.amount)}</strong>
              <span>{item.to}</span>
              <div className="settlement-actions">
                <button className="secondary tactile" type="button" onClick={() => markSettlementPaid(item, item.amount, "Full")}>Fully Paid</button>
                <button className={`secondary tactile ${customSettlementKey === settlementKey(item) ? "active" : ""}`} type="button" onClick={() => {
                  setCustomSettlementKey(customSettlementKey === settlementKey(item) ? "" : settlementKey(item));
                  setCustomAmount("");
                }}>Custom</button>
              </div>
            </div>
            {customSettlementKey === settlementKey(item) && (
              <div className="settlement-edit-row">
                <label>Paid now
                  <input
                    value={customAmount}
                    onChange={(event) => setCustomAmount(event.target.value)}
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={item.amount}
                    placeholder={`Max ${item.amount}`}
                  />
                </label>
                <button className="primary tactile" type="button" onClick={() => markSettlementPaid(item, customAmount, "Custom")}>Save Payment</button>
                <button className="secondary tactile" type="button" onClick={() => setCustomSettlementKey("")}>Cancel</button>
              </div>
            )}
          </div>
        )) : <EmptyState text="No one owes anything yet." small />}
      </section>
      <section className="date-money-group">
        <SectionHeader title="Paid Settlements" />
        {paidSettlements.length ? paidSettlements.map((item) => (
          <div className="settlement-card" key={item.id}>
            <div className="settlement-row paid">
              <span>{item.from}</span>
              <strong>{item.paymentType === "Custom" ? "custom paid" : "paid"} {rupee.format(item.amount)}</strong>
              <span>{item.to}</span>
              <div className="settlement-actions">
                <button className="secondary tactile" type="button" onClick={() => {
                  setEditingSettlementId(item.id);
                  setEditingAmount(String(amount(item.amount)));
                }}>Edit</button>
                <button className="secondary danger tactile" type="button" onClick={() => deleteSettlementPaid(item)}>Delete</button>
              </div>
            </div>
            <small className="settlement-meta" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
              <span>
                {item.paidAt ? new Date(item.paidAt).toLocaleString("en-IN") : ""}
                {item.updatedAt ? ` - edited ${new Date(item.updatedAt).toLocaleString("en-IN")}` : ""}
              </span>
              {(() => {
                const { urls } = extractAttachmentUrls(item.notes || "");
                const hasNoProof = item.notes && item.notes.includes("[No payment proof provided]");
                return (
                  <span style={{ display: "flex", gap: "0.4rem" }}>
                    {urls && urls.map((url, uidx) => (
                      <span key={uidx} style={{ display: "inline-flex", alignItems: "center", background: "rgba(16, 185, 129, 0.08)", color: "#10b981", padding: "2px 8px", borderRadius: "8px", border: "1px solid rgba(16, 185, 129, 0.12)", fontWeight: "bold", fontSize: "0.75rem" }}>
                        <a href={url} onClick={(e) => { e.preventDefault(); setViewingImage?.(url); }} style={{ color: "inherit", textDecoration: "none" }}>Proof {urls.length > 1 ? `#${uidx + 1}` : ""}</a>
                      </span>
                    ))}
                    {hasNoProof && (
                      <span style={{ display: "inline-flex", alignItems: "center", background: "rgba(239, 68, 68, 0.08)", color: "#ef4444", padding: "2px 8px", borderRadius: "8px", border: "1px solid rgba(239, 68, 68, 0.12)", fontWeight: "bold", fontSize: "0.75rem" }}>
                        No Proof
                      </span>
                    )}
                  </span>
                );
              })()}
            </small>
            {editingSettlementId === item.id && (
              <div className="settlement-edit-row">
                <label>Edit paid amount
                  <input
                    value={editingAmount}
                    onChange={(event) => setEditingAmount(event.target.value)}
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={editableMax(item)}
                    placeholder={`Max ${editableMax(item)}`}
                  />
                </label>
                <button className="primary tactile" type="button" onClick={() => saveSettlementEdit(item)}>Save Edit</button>
                <button className="secondary tactile" type="button" onClick={() => setEditingSettlementId("")}>Cancel</button>
              </div>
            )}
          </div>
        )) : <EmptyState text="Paid settlement history will appear here." small />}
      </section>
      <section className="date-money-group">
        <SectionHeader title="Expense-wise Equal Split" />
        {equalSplits.length ? equalSplits.map((expense) => (
          <div className="expense-split-card" key={expense.id}>
            <div className="date-money-header">
              <strong>{expense.title}</strong>
              <span>{rupee.format(expense.amount)} - {formatDate(expense.date)}</span>
            </div>
            {expense.rows.map((row) => (
              <div className="settlement-row" key={`${expense.id}-${row.from}-${row.to}`}>
                <span>{row.from}</span>
                <strong>{row.label} {rupee.format(row.amount)}</strong>
                <span>{row.to}</span>
              </div>
            ))}
          </div>
        )) : <EmptyState text="Select split participants on each project expense to see isolated expense splits." small />}
      </section>
      <section className="date-money-group">
        <SectionHeader title="Direct Owed" />
        {directOwedSplits.length ? directOwedSplits.map((expense) => (
          <div className="expense-split-card direct" key={expense.id}>
            <div className="date-money-header">
              <strong>{expense.title}</strong>
              <span>{rupee.format(expense.amount)} - {formatDate(expense.date)}</span>
            </div>
            {expense.rows.map((row) => (
              <div className="settlement-row" key={`${expense.id}-${row.from}-${row.to}`}>
                <span>{row.from}</span>
                <strong>{row.label} {rupee.format(row.amount)}</strong>
                <span>{row.to}</span>
              </div>
            ))}
          </div>
        )) : <EmptyState text="Direct owed payments will appear separately here." small />}
      </section>
      <section className="date-money-group">
        <SectionHeader title="Split Transactions" />
        {splitTransactions.length ? splitTransactions.map((item) => (
          <div className="transaction-row" key={item.id}>
            <div>
              <strong>{item.title}</strong>
              <small>{formatDate(item.date)} - {splitModeOf(item)} - paid by {item.paidBy || "Unassigned"}</small>
            </div>
            <span>{splitModeOf(item) === "Direct owed" ? `Owed by ${item.owedBy || "Unassigned"}` : (item.participants || []).join(", ")}</span>
            <b>{rupee.format(amount(item.amount))}</b>
          </div>
        )) : <EmptyState text="Add equal-split members or direct owed details to include expenses in this ledger." small />}
      </section>
    </section>
  );
}

function dailySplitSummary(transactions) {
  const names = uniqueList(transactions.flatMap((item) => [item.paidBy, item.owedBy, ...(item.participants || [])]));
  const stats = names.map((name) => {
    const paid = transactions.filter((item) => item.type === "Debit" && item.paidBy === name).reduce((total, item) => {
      const mode = splitModeOf(item);
      const hasEqualSplit = mode === "Equal split" && (item.participants || []).filter(Boolean).length > 0;
      const hasDirectOwed = mode === "Direct owed" && item.owedBy;
      return hasEqualSplit || hasDirectOwed ? total + amount(item.amount) : total;
    }, 0);
    const share = transactions.filter((item) => item.type === "Debit").reduce((total, item) => {
      const mode = splitModeOf(item);
      if (mode === "Direct owed") return item.owedBy === name ? total + amount(item.amount) : total;
      if (mode !== "Equal split") return total;
      const splitMembers = (item.participants || []).filter(Boolean);
      return splitMembers.includes(name) ? total + amount(item.amount) / Math.max(splitMembers.length, 1) : total;
    }, 0);
    return { name, paid, share, credit: 0, balance: paid - share };
  });
  return { stats, settlements: buildSettlements(stats) };
}

function projectSplitSummary(project, transactions) {
  const names = uniqueList([...(project.participants || []), ...transactions.flatMap((item) => [item.paidBy, item.owedBy, ...(item.participants || [])])]);
  const debitTransactions = transactions.filter((item) => item.type === "Debit");
  const paidSettlements = (project.paidSettlements || []).filter((item) => item.from && item.to && amount(item.amount) > 0);

  const activeSplitTransactions = debitTransactions.filter((item) =>
    (splitModeOf(item) === "Equal split" && (item.participants || []).filter(Boolean).length > 0) ||
    (splitModeOf(item) === "Direct owed" && item.paidBy && item.owedBy)
  );
  const expenseSplits = buildExpenseSplits(activeSplitTransactions);

  const rawStats = names.map((name) => {
    const totalSpent = debitTransactions.reduce((total, item) => {
      return item.paidBy === name ? total + amount(item.amount) : total;
    }, 0);

    // Sum of rounded splits where name receives the money (to)
    const paid = expenseSplits.reduce((total, split) => {
      if (!split || !split.rows) return total;
      const creditRows = split.rows.filter(r => r.to === name);
      const creditSum = creditRows.reduce((sum, r) => sum + r.amount, 0);
      return total + creditSum;
    }, 0);

    // Sum of rounded splits where name owes the money (from)
    const share = expenseSplits.reduce((total, split) => {
      if (!split || !split.rows) return total;
      const debitRows = split.rows.filter(r => r.from === name);
      const debitSum = debitRows.reduce((sum, r) => sum + r.amount, 0);
      return total + debitSum;
    }, 0);

    const credit = 0;
    return { name, paid, share, credit, totalSpent, balance: paid + credit - share };
  });

  const stats = rawStats.map((row) => {
    const paidOut = paidSettlements.filter((item) => item.from === row.name).reduce((total, item) => total + amount(item.amount), 0);
    const received = paidSettlements.filter((item) => item.to === row.name).reduce((total, item) => total + amount(item.amount), 0);
    return { 
      ...row, 
      settledPaid: paidOut, 
      settledReceived: received, 
      totalSpent: row.totalSpent + paidOut,
      balance: row.balance + paidOut - received 
    };
  });

  return {
    stats,
    settlements: buildSettlements(stats),
    splitTransactions: activeSplitTransactions,
    expenseSplits,
    equalSplits: expenseSplits.filter((item) => splitModeOf(item) === "Equal split"),
    directOwedSplits: expenseSplits.filter((item) => splitModeOf(item) === "Direct owed"),
    paidSettlements
  };
}

function buildExpenseSplits(transactions) {
  return transactions
    .map((item) => {
      if (splitModeOf(item) === "Direct owed") {
        if (!item.paidBy || !item.owedBy) return null;
        return {
          ...item,
          rows: [{ from: item.owedBy, to: item.paidBy, amount: Math.round(amount(item.amount) * 100) / 100, label: "owes" }]
        };
      }
      const splitMembers = (item.participants || []).filter(Boolean);
      if (!item.paidBy || !splitMembers.length) return null;
      const share = amount(item.amount) / splitMembers.length;
      const rows = splitMembers
        .filter((name) => name !== item.paidBy)
        .map((name) => ({ from: name, to: item.paidBy, amount: Math.round(share * 100) / 100, label: "owes" }));
      return { ...item, rows };
    })
    .filter((item) => item && item.rows.length);
}

function splitModeOf(item) {
  if (item.splitMode) return item.splitMode;
  return (item.participants || []).filter(Boolean).length ? "Equal split" : "No split";
}

function buildSettlements(stats) {
  const debtors = stats
    .filter((item) => item.balance < -0.005)
    .map((item) => ({ name: item.name, amount: Math.abs(item.balance) }))
    .sort((a, b) => b.amount - a.amount);
  const creditors = stats
    .filter((item) => item.balance > 0.005)
    .map((item) => ({ name: item.name, amount: item.balance }))
    .sort((a, b) => b.amount - a.amount);
  const settlements = [];
  let d = 0;
  let c = 0;
  while (d < debtors.length && c < creditors.length) {
    const amountToSettle = Math.min(debtors[d].amount, creditors[c].amount);
    if (amountToSettle > 0.005) {
      settlements.push({ from: debtors[d].name, to: creditors[c].name, amount: Math.round(amountToSettle * 100) / 100 });
    }
    debtors[d].amount -= amountToSettle;
    creditors[c].amount -= amountToSettle;
    if (debtors[d].amount <= 0.005) d += 1;
    if (creditors[c].amount <= 0.005) c += 1;
  }
  return settlements;
}

function markdownTable(headers, rows) {
  if (!rows.length) return "";
  const clean = (value) => String(value ?? "").replace(/\|/g, "/").replace(/\n/g, " ");
  return [
    `| ${headers.map(clean).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(clean).join(" | ")} |`)
  ].join("\n");
}

function buildProjectShareText(project, transactions) {
  const stats = projectStats({ projects: [project], projectTransactions: transactions }, project);
  const split = projectSplitSummary(project, transactions);
  const header = [
    `LifePilot Expense Project: ${project.name}`,
    `Status: ${project.status}`,
    `Type: ${project.type}`,
    `Dates: ${formatDate(project.startDate)} to ${formatDate(project.endDate)}`,
    `Budget: INR ${amount(project.budget)}`,
    `Total debit: INR ${stats.debit}`,
    `Total credit: INR ${stats.credit}`,
    `Remaining: INR ${stats.remaining}`,
    `Overspent: INR ${stats.overspent}`,
    `Participants: ${(project.participants || []).join(", ") || "None"}`
  ];
  const transactionRows = transactions
    .slice()
    .sort(sortByDateDesc)
    .map((item) => [
      formatDate(item.date),
      item.title,
      item.type,
      `INR ${amount(item.amount)}`,
      item.category || "",
      item.paymentMethod || "",
      item.paidBy || "",
      splitModeOf(item),
      splitModeOf(item) === "Direct owed" ? item.owedBy || "" : (item.participants || []).join(", "),
      item.notes || ""
    ]);
  const participantRows = split.stats.map((item) => [
    item.name,
    `INR ${Number(item.paid).toFixed(2)}`,
    `INR ${Number(item.share).toFixed(2)}`,
    item.balance >= 0 ? "Gets" : "Owes",
    `INR ${Number(Math.abs(item.balance)).toFixed(2)}`
  ]);
  const settlementRows = split.settlements.map((item) => [item.from, item.to, `INR ${item.amount}`]);
  const equalRows = split.equalSplits.flatMap((expense) =>
    expense.rows.map((row) => [expense.title, row.from, row.to, `INR ${row.amount}`])
  );
  const directRows = split.directOwedSplits.flatMap((expense) =>
    expense.rows.map((row) => [expense.title, row.from, row.to, `INR ${row.amount}`])
  );
  const paidRows = split.paidSettlements.map((item) => [
    item.from,
    item.to,
    `INR ${amount(item.amount)}`,
    item.paidAt ? new Date(item.paidAt).toLocaleString("en-IN") : ""
  ]);
  return [
    header.join("\n"),
    "",
    "Transactions",
    markdownTable(["Date", "Title", "Type", "Amount", "Category", "Payment", "Paid by", "Split", "Participants/Owed by", "Notes"], transactionRows) || "No transactions.",
    "",
    "Participant Balances",
    markdownTable(["Participant", "Paid", "Share", "Status", "Balance"], participantRows) || "No participant balances.",
    "",
    "Who Pays Whom",
    markdownTable(["From", "To", "Amount"], settlementRows) || "No pending settlements.",
    "",
    "Expense-wise Equal Split",
    markdownTable(["Expense", "From", "To", "Amount"], equalRows) || "No equal splits.",
    "",
    "Direct Owed",
    markdownTable(["Expense", "From", "To", "Amount"], directRows) || "No direct owed entries.",
    "",
    "Paid Settlements",
    markdownTable(["From", "To", "Amount", "Paid at"], paidRows) || "No paid settlements."
  ].join("\n");
}

function ProjectCard({ state, project, active, onClick }) {
  const stats = projectStats(state, project);
  return (
    <button className={`record-card tactile ${active ? "selected" : ""}`} onClick={onClick}>
      <h3>{project.name}</h3>
      <p>{project.type} - {project.status}</p>
      <Progress value={stats.usage} />
      <small>{rupee.format(stats.debit)} spent of {rupee.format(amount(project.budget))}</small>
    </button>
  );
}

function ProjectRow({ state, project }) {
  const stats = projectStats(state, project);
  const isEnded = !["Active", "Paused"].includes(project.status);
  return (
    <div className="project-row">
      <div>
        <strong>{project.name}</strong>
        <small>
          {project.status} 
          {!isEnded && (
            stats.daysRemaining >= 0 
              ? ` - ${stats.daysRemaining} days remaining` 
              : ` - ${Math.abs(stats.daysRemaining)} days overdue`
          )}
        </small>
      </div>
      <Progress value={stats.usage} />
      <span>{Math.round(stats.usage)}%</span>
    </div>
  );
}

function ProjectDashboard({ state, project }) {
  const stats = projectStats(state, project);
  const isEnded = !["Active", "Paused"].includes(project.status);
  const metrics = [
    ["Budget", amount(project.budget)],
    ["Total credit", stats.credit],
    ["Total debit", stats.debit],
    ["Remaining", stats.remaining],
    ["Overspent", stats.overspent],
    ["Participants", `${project.participants?.length || 0}`],
    isEnded ? ["Status", project.status] : ["Days remaining", stats.daysRemaining >= 0 ? `${stats.daysRemaining}` : "Overdue"],
    ["Usage", `${Math.round(stats.usage)}%`]
  ];
  return (
    <>
      <MetricGrid metrics={metrics} />
      <div className="project-progress">
        <Progress value={stats.usage} />
      </div>
    </>
  );
}

function Progress({ value }) {
  return <div className="progress"><span style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div>;
}

function BarPair({ credit, debit }) {
  const max = Math.max(credit, debit, 1);
  return (
    <div className="bar-pair">
      <div><span>Credit</span><i style={{ width: `${(credit / max) * 100}%` }} /> <strong>{rupee.format(credit)}</strong></div>
      <div><span>Debit</span><i style={{ width: `${(debit / max) * 100}%` }} /> <strong>{rupee.format(debit)}</strong></div>
    </div>
  );
}

function Chart({ title, data, type = "bar" }) {
  const rawEntries = Object.entries(data).filter(([, value]) => amount(value) > 0);
  const entries = type === "line" ? rawEntries.sort((a, b) => String(a[0]).localeCompare(String(b[0]))) : rawEntries.sort((a, b) => b[1] - a[1]);
  const max = Math.max(...entries.map(([, value]) => value), 1);
  const total = entries.reduce((value, [, amountValue]) => value + amount(amountValue), 0);
  const colors = ["#d8ff8f", "#c5c8ff", "#ffe09a", "#ff9d92", "#f2e9ff", "#9dd6aa", "#ffd995"];
  const pieGradient = entries.reduce((parts, [, value], index) => {
    const start = parts.cursor;
    const size = total ? (amount(value) / total) * 100 : 0;
    const end = start + size;
    parts.segments.push(`${colors[index % colors.length]} ${start}% ${end}%`);
    parts.cursor = end;
    return parts;
  }, { cursor: 0, segments: [] }).segments.join(", ");
  const linePoints = entries.map(([, value], index) => {
    const x = entries.length === 1 ? 50 : (index / (entries.length - 1)) * 100;
    const y = 100 - (amount(value) / max) * 88 - 6;
    return `${x},${y}`;
  }).join(" ");
  return (
    <section className={`sub-panel chart-card chart-${type}`}>
      <SectionHeader title={title} action={<span className="chart-badge">{type}</span>} />
      {!entries.length ? <EmptyState text="Charts appear when you add real records." /> : type === "pie" ? (
        <div className="pie-chart-layout">
          <div className="pie-chart" style={{ background: `conic-gradient(${pieGradient})` }}>
            <span>{rupee.format(total)}</span>
          </div>
          <div className="chart-legend">
            {entries.map(([label, value], index) => (
              <p key={label}><i style={{ background: colors[index % colors.length] }} /> <span>{label}</span><strong>{rupee.format(value)}</strong></p>
            ))}
          </div>
        </div>
      ) : type === "line" ? (
        <div className="line-chart">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <polyline points={linePoints} />
          </svg>
          <div className="chart-legend compact">
            {entries.map(([label, value]) => <p key={label}><span>{label}</span><strong>{rupee.format(value)}</strong></p>)}
          </div>
        </div>
      ) : entries.map(([label, value]) => (
        <div className="chart-row" key={label}>
          <span>{label}</span>
          <i style={{ width: `${(value / max) * 100}%` }} />
          <strong>{rupee.format(value)}</strong>
        </div>
      ))}
    </section>
  );
}

function getInitialForm(kind, item, context = {}, state) {
  const baseDate = context.date || todayISO();
  const defaults = {
    loan: { title: "", bankName: "", totalAmount: "", monthlyPayment: "", totalMonths: "", completedMonths: 0, interestRate: "", interestPeriod: "Annually", emiDate: "", startDate: baseDate, status: "Active", notes: "", foreclosurePaidAmount: "", paidMonths: [] },
    task: { title: "", description: "", dueDate: baseDate, startTime: "", endTime: "", dueTime: nowTime(), todayOnly: false, priority: state.settings.defaultTaskPriority, category: "", status: "Pending", reminder: false, notes: "", subtasks: [] },
    reminder: { title: "", description: "", date: baseDate, time: state.settings.defaultReminderTime, repeat: "No repeat", priority: "Medium", notificationEnabled: true, status: "Active", isMoneyReceive: false, payerName: "", moneyAmount: "" },
    note: { title: "", content: "", date: baseDate, category: "", reminder: false, pinned: false },
    event: { title: "", description: "", startDate: baseDate, startTime: nowTime(), endDate: baseDate, endTime: "", location: "", category: "", reminderBefore: "", repeat: "No repeat", imported: false, status: "Scheduled" },
    expense: { title: "", amount: "", type: "Debit", category: "", date: baseDate, time: nowTime(), paymentMethod: "UPI", splitMode: "No split", paidBy: "", owedBy: "", participants: "", notes: "", reminder: false },
    bill: { title: "", amount: "", dueDate: baseDate, status: "Unpaid", reminderBefore: "1 day", category: "Bills", paymentMethod: "", notes: "", splits: [] },
    salary: { title: "Salary", amount: "", receivedDate: baseDate, month: baseDate.slice(0, 7), source: "", paymentMethod: "Bank transfer", notes: "", budgetPlan: "" },
    salaryExpense: { salaryId: context.salaryId || "", title: "", amount: "", type: "Debit", category: "", date: baseDate, paymentMethod: "UPI", notes: "" },
    project: { name: "", type: "Trip", description: "", startDate: baseDate, endDate: baseDate, budget: "", participants: "", newParticipant: "", status: "Active", notes: "", storageType: "Local", pin: "2002" },
    projectTransaction: { projectId: context.projectId || "", title: "", amount: "", type: "Debit", splitMode: "No split", category: "", date: baseDate, time: nowTime(), paidBy: "", owedBy: "", participants: "", paymentMethod: "UPI", notes: "" },
    category: { name: "", type: "Debit", color: "#f2b8a2", icon: "" },
    credential: { title: "", type: "Debit Card", url: "", username: "", accountNumber: "", cardNumber: "", expiry: "", cvv: "", cardPin: "", password: "", recovery: "", extraSecret: "", notes: "", pinned: false },
    profile: { ...state.profile },
    participants: { participants: (item?.participants || []).join(", "), newParticipant: "" }
  };
  const merged = { ...defaults[kind], ...(item || {}) };
  if (kind === "project" && Array.isArray(merged.participants)) merged.participants = merged.participants.join(", ");
  if (kind === "projectTransaction") {
    if (!item?.splitMode && Array.isArray(merged.participants) && merged.participants.length) merged.splitMode = "Equal split";
    if (Array.isArray(merged.participants)) merged.participants = merged.participants.join(", ");
  }
  if (kind === "expense") {
    if (!item?.splitMode && Array.isArray(merged.participants) && merged.participants.length) merged.splitMode = "Equal split";
    if (Array.isArray(merged.participants)) merged.participants = merged.participants.join(", ");
  }
  return merged;
}

function fieldsForKind(kind, state, form = {}) {
  const categoryOptions = [["", "Select category"], ...state.categories.map((category) => [category.name, category.name])];
  const projectOptions = [["", "Select project"], ...state.projects.map((project) => [project.id, project.name])];
  const salaryOptions = [["", "Select salary"], ...state.salaries.map((salary) => [salary.id, salary.title])];
  const selectedProject = state.projects.find((project) => project.id === form.projectId);
  const participantOptions = selectedProject?.participants?.length
    ? selectedProject.participants.map((name) => [name, name])
    : [...new Set(state.projects.flatMap((project) => project.participants || []))].map((name) => [name, name]);
  const allParticipantOptions = uniqueList(state.projects.flatMap((project) => project.participants || [])).map((name) => [name, name]);
  const commonMoney = [
    { name: "title", label: "Title", required: true },
    { name: "amount", label: "Amount", type: "number", min: 0, required: true },
    { name: "type", label: "Type", type: "select", options: ["Credit", "Debit"] },
    { name: "category", label: "Category", type: "select", options: categoryOptions },
    { name: "paymentMethod", label: "Payment method" },
    { name: "notes", label: "Notes", type: "textarea", wide: true }
  ];
  return {
    loan: [
      { name: "title", label: "Loan Name", required: true },
      { name: "bankName", label: "Bank / Lender Name" },
      { name: "totalAmount", label: "Total Loan Amount", type: "number", min: 0 },
      { name: "monthlyPayment", label: "Monthly EMI", type: "number", min: 0, required: true },
      { name: "totalMonths", label: "Total Duration (Months)", type: "number", min: 1, required: true },
      { name: "completedMonths", label: "EMIs Paid Till Now (Months)", type: "number", min: 0, required: true },
      { name: "interestRate", label: "Rate of Interest (%)", type: "number", min: 0, step: "any" },
      { name: "interestPeriod", label: "Interest Rate Period", type: "select", options: ["Annually", "Monthly"] },
      { name: "emiDate", label: "EMI Day of Month (Optional, 1-31)", type: "number", min: 1, max: 31 },
      { name: "startDate", label: "Start Date (Optional)", type: "date" },
      { name: "status", label: "Status", type: "select", options: ["Active", "Foreclosed", "Completed"] },
      { name: "notes", label: "Notes", type: "textarea", wide: true }
    ],
    task: [
      { name: "title", label: "Task title", required: true },
      { name: "description", label: "Description", type: "textarea", wide: true },
      { name: "dueDate", label: "Task date", type: "date", required: true },
      { name: "startTime", label: "Start time", type: "time" },
      { name: "endTime", label: "End time", type: "time" },
      { name: "dueTime", label: "Reminder time", type: "time" },
      { name: "todayOnly", label: "Only today", type: "checkbox" },
      { name: "priority", label: "Priority", type: "select", options: ["Low", "Medium", "High", "Urgent"] },
      { name: "category", label: "Category", type: "select", options: categoryOptions },
      { name: "status", label: "Status", type: "select", options: ["Pending", "In Progress", "Completed", "Cancelled", "Overdue"] },
      { name: "reminder", label: "Reminder option", type: "checkbox" },
      { name: "subtasks", label: "Subtasks (one per line)", type: "subtasks", wide: true },
      { name: "notes", label: "Notes", type: "textarea", wide: true }
    ],
    reminder: [
      { name: "title", label: "Reminder title", required: true },
      { name: "description", label: "Description", type: "textarea", wide: true },
      { name: "date", label: "Date", type: "date", required: true },
      { name: "time", label: "Time", type: "time" },
      { name: "repeat", label: "Repeat", type: "select", options: ["No repeat", "Daily", "Weekly", "Monthly", "Yearly", "Custom"] },
      { name: "priority", label: "Priority", type: "select", options: ["Low", "Medium", "High", "Urgent"] },
      { name: "notificationEnabled", label: "Notification enabled", type: "checkbox" },
      { name: "status", label: "Status", type: "select", options: ["Active", "Completed", "Expired", "Cancelled"] },
      { name: "isMoneyReceive", label: "Is Money Receivable?", type: "checkbox" },
      ...(form.isMoneyReceive
        ? [
            { name: "payerName", label: "From whom (Person Name)", required: true },
            { name: "moneyAmount", label: "Amount to receive", type: "number", min: 0, required: true }
          ]
        : [])
    ],
    note: [
      { name: "title", label: "Note title", required: true },
      { name: "content", label: "Note content", type: "textarea", wide: true, required: true },
      { name: "date", label: "Date", type: "date", required: true },
      { name: "category", label: "Category", type: "select", options: categoryOptions },
      { name: "reminder", label: "Optional reminder", type: "checkbox" },
      { name: "pinned", label: "Pinned", type: "checkbox" }
    ],
    event: [
      { name: "title", label: "Event title", required: true },
      { name: "description", label: "Description", type: "textarea", wide: true },
      { name: "startDate", label: "Start date", type: "date", required: true },
      { name: "startTime", label: "Start time", type: "time" },
      { name: "endDate", label: "End date", type: "date" },
      { name: "endTime", label: "End time", type: "time" },
      { name: "location", label: "Location" },
      { name: "category", label: "Category", type: "select", options: categoryOptions },
      { name: "reminderBefore", label: "Reminder before event" },
      { name: "repeat", label: "Repeat", type: "select", options: ["No repeat", "Daily", "Weekly", "Monthly", "Yearly", "Custom"] },
      { name: "status", label: "Status", type: "select", options: ["Scheduled", "Completed", "Cancelled"] }
    ],
    expense: [
      ...commonMoney.slice(0, 4),
      { name: "date", label: "Date", type: "date", required: true },
      { name: "time", label: "Time", type: "time" },
      { name: "splitMode", label: "Split mode", type: "select", options: ["No split", "Equal split", "Direct owed"] },
      { name: "paidBy", label: form.splitMode === "Direct owed" ? "Receiver / paid by" : "Paid by", type: allParticipantOptions.length ? "select" : "text", options: [["", "Select participant"], ...allParticipantOptions] },
      ...(form.splitMode === "Direct owed"
        ? [{ name: "owedBy", label: "Owed by", type: allParticipantOptions.length ? "select" : "text", options: [["", "Select participant"], ...allParticipantOptions] }]
        : []),
      ...(form.splitMode === "Equal split"
        ? [{ name: "participants", label: "Split between", type: "participantMultiCustom", options: allParticipantOptions, wide: true }]
        : []),
      ...commonMoney.slice(4),
      { name: "reminder", label: "Optional reminder", type: "checkbox" }
    ],
    bill: [
      { name: "title", label: "Bill name", required: true },
      { name: "amount", label: "Amount", type: "number", min: 0, required: true },
      { name: "dueDate", label: "Due date", type: "date", required: true },
      { name: "status", label: "Status", type: "select", options: ["Unpaid", "Paid"] },
      { name: "reminderBefore", label: "Reminder before due", type: "select", options: ["None", "Same day", "1 day", "2 days", "3 days", "1 week"] },
      { name: "category", label: "Category", type: "select", options: categoryOptions },
      { name: "paymentMethod", label: "Payment method" },
      { name: "splits", label: "Bill Split / Contributions", type: "billSplits", wide: true },
      { name: "notes", label: "Notes", type: "textarea", wide: true }
    ],
    salary: [
      { name: "title", label: "Salary title", required: true },
      { name: "amount", label: "Amount", type: "number", min: 0, required: true },
      { name: "receivedDate", label: "Received date", type: "date", required: true },
      { name: "month", label: "Month", type: "month", required: true },
      { name: "source", label: "Source/company name", required: true },
      { name: "paymentMethod", label: "Payment method" },
      { name: "budgetPlan", label: "Salary budget plan" },
      { name: "notes", label: "Notes", type: "textarea", wide: true }
    ],
    salaryExpense: [{ name: "salaryId", label: "Salary", type: "select", options: salaryOptions, required: true }, ...commonMoney.slice(0, 4), { name: "date", label: "Date", type: "date", required: true }, ...commonMoney.slice(4)],
    project: [
      { name: "name", label: "Project name", required: true },
      { name: "storageType", label: "Project Storage Type", type: "select", options: ["Local", "Cloud Shared"] },
      ...(form.storageType === "Cloud Shared" ? [
        { name: "pin", label: "PIN", type: "password", placeholder: "Default 2002" }
      ] : []),
      { name: "type", label: "Project type", type: "select", options: ["Trip", "Home Renovation", "Wedding", "College Event", "Room Setup", "Shopping Plan", "Business Purchase", "Family Function", "Custom"] },
      { name: "description", label: "Description", type: "textarea", wide: true },
      { name: "startDate", label: "Start date", type: "date", required: true },
      { name: "endDate", label: "End date", type: "date", required: true },
      { name: "budget", label: "Budget amount", type: "number", min: 0, required: true },
      { name: "participants", label: "Project participants", type: "participantMultiCustom", options: allParticipantOptions, wide: true },
      { name: "status", label: "Project status", type: "select", options: ["Active", "Paused", "Completed", "Cancelled", "Archived"] },
      { name: "notes", label: "Notes", type: "textarea", wide: true }
    ],
    projectTransaction: [
      { name: "projectId", label: "Project", type: "select", options: projectOptions, required: true },
      ...commonMoney.slice(0, 3),
      { name: "splitMode", label: "Split mode", type: "select", options: ["No split", "Equal split", "Direct owed"] },
      commonMoney[3],
      { name: "date", label: "Date", type: "date", required: true },
      { name: "time", label: "Time", type: "time" },
      { name: "paidBy", label: form.splitMode === "Direct owed" ? "Receiver / paid by" : "Paid by", type: participantOptions.length ? "select" : "text", options: [["", "Select participant"], ...participantOptions] },
      ...(form.splitMode === "Direct owed"
        ? [{ name: "owedBy", label: "Owed by", type: participantOptions.length ? "select" : "text", options: [["", "Select participant"], ...participantOptions] }]
        : []),
      ...(form.splitMode === "Equal split"
        ? [{ name: "participants", label: "Split between", type: participantOptions.length ? "participantMulti" : "text", options: participantOptions }]
        : []),
      ...commonMoney.slice(4)
    ],
    category: [
      { name: "name", label: "Category name", required: true },
      { name: "type", label: "Category type", type: "select", options: ["Credit", "Debit", "Both"] },
      { name: "icon", label: "Icon name" },
      { name: "color", label: "Color", type: "color" }
    ],
    credential: [
      { name: "title", label: "Credential name", required: true },
      { name: "type", label: "Credential type", type: "select", options: ["Debit Card", "Credit Card", "Bank Account", "Social Media", "Email", "UPI", "Website", "Custom"] },
      { name: "url", label: "URL / bank website" },
      { name: "username", label: "Username / customer ID" },
      { name: "accountNumber", label: "Account number", type: "password" },
      { name: "cardNumber", label: "Card number", type: "password" },
      { name: "expiry", label: "Expiry" },
      { name: "cvv", label: "CVV", type: "password" },
      { name: "cardPin", label: "Card PIN", type: "password" },
      { name: "password", label: "Password", type: "password" },
      { name: "recovery", label: "Recovery code / backup", type: "password", wide: true },
      { name: "extraSecret", label: "Other private details", type: "textarea", wide: true },
      { name: "notes", label: "Public notes", type: "textarea", wide: true },
      { name: "pinned", label: "Pin in vault", type: "checkbox" }
    ],
    profile: [
      { name: "image", label: "Profile image", type: "file", wide: true },
      { name: "name", label: "Name", required: true },
      { name: "dob", label: "Date of birth", type: "date", required: true },
      { name: "address", label: "Address" },
      { name: "bio", label: "Short bio", type: "textarea", wide: true },
      { name: "monthlySalary", label: "Monthly salary amount", type: "number", min: 0 },
      { name: "monthlyBudget", label: "Monthly budget goal", type: "number", min: 0 }
    ],
    participants: [
      { name: "participants", label: "Participants", type: "participantMultiCustom", options: allParticipantOptions, wide: true }
    ]
  }[kind];
}

function validateForm(kind, form) {
  if (["task", "reminder", "note", "event", "expense", "bill", "salary", "salaryExpense", "projectTransaction", "loan"].includes(kind) && !form.title?.trim()) return "Title is required.";
  if (kind === "loan" && amount(form.monthlyPayment) <= 0) return "Monthly payment must be greater than zero.";
  if (kind === "loan" && Number(form.totalMonths || 0) <= 0) return "Total months must be greater than zero.";
  if (kind === "project" && !form.name?.trim()) return "Project name is required.";
  if (kind === "category" && !form.name?.trim()) return "Category name is required.";
  if (kind === "credential" && !form.title?.trim()) return "Credential name is required.";
  if (kind === "profile" && (!form.name?.trim() || !form.dob)) return "Name and date of birth are required.";
  if (["expense", "bill", "salary", "salaryExpense", "projectTransaction"].includes(kind) && amount(form.amount) <= 0) return "Amount must be greater than zero.";
  if (kind === "expense" && form.type === "Debit" && form.splitMode === "Equal split" && !splitParticipants(form.participants).length) return "Select participants for equal split, or choose No split.";
  if (kind === "expense" && form.type === "Debit" && form.splitMode === "Direct owed" && (!form.paidBy || !form.owedBy)) return "Select receiver and owed by participant.";
  if (kind === "projectTransaction" && form.type === "Debit" && form.splitMode === "Equal split" && !splitParticipants(form.participants).length) return "Select participants for equal split, or choose No split.";
  if (kind === "projectTransaction" && form.type === "Debit" && form.splitMode === "Direct owed" && (!form.paidBy || !form.owedBy)) return "Select receiver and owed by participant.";
  if (kind === "reminder" && form.isMoneyReceive) {
    if (!form.payerName?.trim()) return "Payer name is required for money receivable.";
    if (amount(form.moneyAmount) <= 0) return "Money amount must be greater than zero.";
  }
  if (kind === "project" && amount(form.budget) < 0) return "Budget cannot be negative.";
  return "";
}

function normalizeForm(kind, form) {
  if (kind === "task") {
    return {
      ...form,
      dueDate: form.todayOnly ? todayISO() : form.dueDate,
      dueTime: form.dueTime || form.endTime || form.startTime || "",
      subtasks: normalizeSubtasks(form.subtasks)
    };
  }
  if (kind === "expense") {
    const mode = form.splitMode || (splitParticipants(form.participants).length ? "Equal split" : "No split");
    return {
      ...form,
      splitMode: mode,
      owedBy: mode === "Direct owed" ? form.owedBy : "",
      participants: mode === "Equal split" ? splitParticipants(form.participants) : []
    };
  }
  if (kind === "project") {
    const { newParticipant, ...rest } = form;
    const isCloud = form.storageType === "Cloud Shared";
    return {
      ...rest,
      isCloud,
      pin: isCloud ? (form.pin || "2002") : "",
      participants: splitParticipants(form.participants)
    };
  }
  if (kind === "projectTransaction") {
    const mode = form.splitMode || (splitParticipants(form.participants).length ? "Equal split" : "No split");
    return {
      ...form,
      splitMode: mode,
      owedBy: mode === "Direct owed" ? form.owedBy : "",
      participants: mode === "Equal split" ? splitParticipants(form.participants) : []
    };
  }
  if (kind === "bill") {
    return {
      ...form,
      splits: (Array.isArray(form.splits) ? form.splits : []).map(s => ({
        id: s.id || id("split"),
        name: String(s.name || "").trim(),
        amount: amount(s.amount)
      }))
    };
  }
  if (kind === "loan") {
    return {
      ...form,
      paidMonths: Array.isArray(form.paidMonths) ? form.paidMonths : []
    };
  }
  if (kind === "vehicle") {
    return {
      ...form,
      currentOdometer: Number(form.currentOdometer || 0)
    };
  }
  if (kind === "fuelLog") {
    return {
      ...form,
      pricePerLitre: Number(form.pricePerLitre || 0),
      amount: Number(form.amount || 0),
      litres: Number(form.litres || 0),
      odometer: Number(form.odometer || 0)
    };
  }
  if (kind === "serviceLog") {
    return {
      ...form,
      expense: Number(form.expense || 0),
      odometer: Number(form.odometer || 0)
    };
  }
  if (kind === "chargingLog") {
    return {
      ...form,
      amountSpent: Number(form.amountSpent || 0)
    };
  }
  if (kind === "vehicleReminder") {
    return {
      ...form,
      dueMileage: Number(form.dueMileage || 0),
      isMileageBased: Boolean(form.isMileageBased),
      isCompleted: Boolean(form.isCompleted)
    };
  }
  if (kind === "vehicleDocument") {
    return form;
  }
  return form;
}

function withAiDefaults(kind, data) {
  const date = todayISO();
  const defaults = {
    task: { title: "Task", description: "", dueDate: date, startTime: "", endTime: "", dueTime: "", todayOnly: false, priority: "Medium", category: "", status: "Pending", reminder: false, notes: "", subtasks: [] },
    reminder: { title: "Reminder", description: "", date, time: "", repeat: "No repeat", priority: "Medium", notificationEnabled: true, status: "Active", isMoneyReceive: false, payerName: "", moneyAmount: 0 },
    note: { title: "Note", content: "", date, category: "", reminder: false, pinned: false },
    event: { title: "Event", description: "", startDate: date, startTime: "", endDate: date, endTime: "", location: "", category: "", reminderBefore: "", repeat: "No repeat", status: "Scheduled", imported: false },
    expense: { title: "Expense", amount: 0, type: "Debit", category: "", date, time: nowTime(), paymentMethod: "UPI", splitMode: "No split", paidBy: "", owedBy: "", participants: [], notes: "", reminder: false },
    bill: { title: "Bill", amount: 0, dueDate: date, status: "Unpaid", reminderBefore: "1 day", category: "Bills", paymentMethod: "", notes: "", splits: [] },
    salary: { title: "Salary", amount: 0, receivedDate: date, month: date.slice(0, 7), source: "", paymentMethod: "Bank transfer", notes: "", budgetPlan: "" },
    salaryExpense: { salaryId: "", title: "Salary expense", amount: 0, type: "Debit", category: "", date, paymentMethod: "UPI", notes: "" },
    project: { name: "Project", type: "Custom", description: "", startDate: date, endDate: date, budget: 0, participants: [], status: "Active", notes: "" },
    projectTransaction: { projectId: "", title: "Project transaction", amount: 0, type: "Debit", splitMode: "No split", category: "", date, time: nowTime(), paidBy: "", owedBy: "", participants: [], paymentMethod: "UPI", notes: "" },
    category: { name: "Category", type: "Both", color: "#d8ff8f", icon: "spark" },
    loan: { title: "Loan", bankName: "", totalAmount: 0, monthlyPayment: 0, totalMonths: 1, completedMonths: 0, interestRate: 0, interestPeriod: "Annually", emiDate: null, startDate: date, status: "Active", notes: "", foreclosurePaidAmount: 0, paidMonths: [] },
    vehicle: { name: "", brand: "", model: "", type: "car", fuelType: "petrol", currentOdometer: 0 },
    fuelLog: { vehicleId: "", date: date + "T12:00", pricePerLitre: 100, amount: 0, litres: 0, odometer: 0, notes: "" },
    serviceLog: { vehicleId: "", date: date, expense: 0, serviceType: "General Service", odometer: 0, notes: "" },
    chargingLog: { vehicleId: "", date: date + "T12:00", amountSpent: 0, chargingType: "public", notes: "" },
    vehicleReminder: { vehicleId: "", type: "service", title: "General Service", dueDate: date, dueMileage: 0, isMileageBased: false, isCompleted: false },
    vehicleDocument: { vehicleId: "", type: "insurance", title: "Vehicle Insurance", expiryDate: date, link: "", notes: "" }
  };

  return { ...(defaults[kind] || {}), ...data };
}

function splitParticipants(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function normalizeSubtasks(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => typeof item === "string" ? { title: item } : item)
      .filter((item) => String(item?.title || "").trim())
      .map((item) => ({
        id: item.id || id("subtask"),
        title: String(item.title || "").trim(),
        note: item.note || "",
        status: item.status === "Completed" ? "Completed" : "Pending",
        updatedAt: item.updatedAt || ""
      }));
  }
  return String(value || "")
    .split(/\r?\n|,/)
    .map((title) => title.trim())
    .filter(Boolean)
    .map((title) => ({ id: id("subtask"), title, note: "", status: "Pending", updatedAt: "" }));
}

function uniqueList(items) {
  return [...new Set(items.map((item) => String(item || "").trim()).filter(Boolean))];
}

function collectionForKind(kind) {
  return {
    todo: "tasks",
    task: "tasks",
    reminder: "reminders",
    note: "notes",
    event: "events",
    expense: "expenses",
    bill: "bills",
    salary: "salaries",
    salaryExpense: "salaryExpenses",
    project: "projects",
    projectTransaction: "projectTransactions",
    projectSettlement: "projects",
    category: "categories",
    credential: "credentials",
    loan: "loans",
    vehicle: "vehicles",
    fuelLog: "fuelLogs",
    serviceLog: "serviceLogs",
    chargingLog: "chargingLogs",
    vehicleReminder: "vehicleReminders",
    vehicleDocument: "vehicleDocuments"
  }[kind];
}

function kindLabel(kind) {
  return {
    todo: "Todo",
    task: "Task",
    reminder: "Reminder",
    note: "Note",
    event: "Event",
    expense: "Daily Expense",
    bill: "Bill",
    salary: "Salary",
    salaryExpense: "Salary-Linked Expense",
    project: "Expense Project",
    projectTransaction: "Project Transaction",
    projectSettlement: "Project Settlement",
    category: "Category",
    credential: "Credential",
    profile: "Profile",
    participants: "Participants",
    loan: "EMI / Loan",
    vehicle: "Vehicle",
    fuelLog: "Fuel Log",
    serviceLog: "Service Log",
    chargingLog: "Charging Log",
    vehicleReminder: "Vehicle Reminder",
    vehicleDocument: "Vehicle Document"
  }[kind] || "Item";
}

function matchesQuery(item, query) {
  const text = JSON.stringify(item).toLowerCase();
  return text.includes(query.trim().toLowerCase());
}

function matchesListFilter(item, filter, dateField) {
  const date = item[dateField];
  if (filter === "All") return true;
  if (filter === "Today") return date === todayISO();
  if (filter === "Upcoming") return date >= todayISO();
  if (filter === "Past") return date < todayISO();
  if (filter === "Pinned") return item.pinned;
  if (filter === "Repeating") return item.repeat && item.repeat !== "No repeat";
  if (filter === "Imported") return item.imported;
  return item.status === filter;
}

function matchesMoneyFilter(item, filter) {
  if (filter === "All") return true;
  if (filter === "Credit" || filter === "Debit") return item.type === filter;
  const map = { "Today": "today", "This week": "week", "This month": "month", "Last month": "lastMonth" };
  return inRange(item.date, map[filter]);
}

function matchesBillFilter(item, filter) {
  if (filter === "All") return true;
  if (filter === "Unpaid" || filter === "Paid") return item.status === filter;
  if (filter === "Overdue") return item.status !== "Paid" && item.dueDate < todayISO();
  if (filter === "Due soon") return item.status !== "Paid" && item.dueDate >= todayISO() && item.dueDate <= addDaysISO(todayISO(), 7);
  if (filter === "This month") return inRange(item.dueDate, "month");
  return true;
}

function billReminderDate(bill) {
  const offsets = { "Same day": 0, "1 day": 1, "2 days": 2, "3 days": 3, "1 week": 7 };
  const offset = offsets[bill.reminderBefore] ?? 0;
  return addDaysISO(bill.dueDate || todayISO(), -offset);
}

function rangeOptions() {
  return [["today", "Today"], ["week", "This week"], ["month", "This month"], ["lastMonth", "Last month"], ["year", "This year"], ["all", "All time"]];
}

function markersForDate(state, date) {
  const markers = [];
  if (state.tasks.some((item) => item.dueDate === date)) markers.push("task");
  if (state.reminders.some((item) => item.date === date)) markers.push("reminder");
  if (state.notes.some((item) => item.date === date)) markers.push("note");
  if (state.events.some((item) => item.startDate === date)) markers.push("event");
  if (state.expenses.some((item) => item.date === date && item.type === "Debit")) markers.push("expense");
  if (state.bills.some((item) => item.dueDate === date && item.status !== "Paid")) markers.push("expense");
  if (state.expenses.some((item) => item.date === date && item.type === "Credit")) markers.push("credit");
  if (state.salaries.some((item) => item.receivedDate === date)) markers.push("salary");
  if (state.projectTransactions.some((item) => item.date === date)) markers.push("project");
  if (state.projects.some((item) => item.startDate === date || item.endDate === date)) markers.push("project");
  if (isBirthday(state.profile, date)) markers.push("birthday");
  
  const dayOfMonth = new Date(`${date}T12:00:00`).getDate();
  const yearMonth = date.slice(0, 7);
  if ((state.loans || []).some((loan) => 
    loan.status === "Active" && 
    Number(loan.emiDate) === dayOfMonth && 
    (!loan.startDate || date.slice(0, 7) >= loan.startDate.slice(0, 7)) &&
    !isLoanMonthPaid(loan, yearMonth)
  )) {
    markers.push("emi");
  }
  
  return markers;
}

function itemsForDate(state, date) {
  const dayOfMonth = new Date(`${date}T12:00:00`).getDate();
  const yearMonth = date.slice(0, 7);
  const loanEmis = (state.loans || [])
    .filter((loan) => 
      loan.status === "Active" && 
      Number(loan.emiDate) === dayOfMonth && 
      (!loan.startDate || date.slice(0, 7) >= loan.startDate.slice(0, 7))
    )
    .map((loan) => {
      const isPaid = isLoanMonthPaid(loan, yearMonth);
      return {
        ...loan,
        id: `${loan.id}-${yearMonth}`,
        loanId: loan.id,
        kind: "loan",
        title: `${loan.title} EMI`,
        amount: loan.monthlyPayment,
        date: date,
        status: isPaid ? "Paid" : "Pending"
      };
    });

  return {
    tasks: state.tasks.filter((item) => item.dueDate === date).map((item) => ({ ...item, kind: "task" })),
    reminders: state.reminders.filter((item) => item.date === date).map((item) => ({ ...item, kind: "reminder" })),
    events: state.events.filter((item) => item.startDate === date).map((item) => ({ ...item, kind: "event" })),
    notes: state.notes.filter((item) => item.date === date).map((item) => ({ ...item, kind: "note" })),
    dailyTransactions: state.expenses.filter((item) => item.date === date).map((item) => ({ ...item, kind: "expense" })),
    bills: state.bills.filter((item) => item.dueDate === date).map((item) => ({ ...item, title: item.title, date: item.dueDate, kind: "bill" })),
    loans: loanEmis,
    salaries: state.salaries.filter((item) => item.receivedDate === date).map((item) => ({ ...item, title: item.title, date: item.receivedDate, kind: "salary" })),
    salaryExpenses: state.salaryExpenses.filter((item) => item.date === date).map((item) => ({ ...item, kind: "salaryExpense" })),
    projectTransactions: state.projectTransactions.filter((item) => item.date === date).map((item) => ({ ...item, kind: "projectTransaction" })),
    projectDates: state.projects.filter((item) => item.startDate === date || item.endDate === date).map((item) => ({ ...item, title: item.name, kind: "project" }))
  };
}

function flatItemsForDate(state, date) {
  return Object.values(itemsForDate(state, date)).flat();
}

function sectionLabel(key) {
  return {
    tasks: "Tasks",
    reminders: "Reminders",
    events: "Events",
    notes: "Notes",
    dailyTransactions: "Daily Credit and Debit",
    bills: "Bills Due",
    loans: "EMI Payments Due",
    salaries: "Salary Credits",
    salaryExpenses: "Salary-Linked Expenses",
    projectTransactions: "Project Transactions",
    projectDates: "Project Start and End"
  }[key] || key;
}

function useMoneyStats(state) {
  return useMemo(() => {
    const dailyCredit = sum(state.expenses, (item) => item.type === "Credit");
    const dailyDebit = sum(state.expenses, (item) => item.type === "Debit");
    const unpaidBills = sum(state.bills, (item) => item.status !== "Paid");
    const salaryTotal = sum(state.salaries);
    const salarySpent = sum(state.salaryExpenses, (item) => item.type !== "Credit");
    const salaryCreditExpense = sum(state.salaryExpenses, (item) => item.type === "Credit");
    const projectCredit = sum(state.projectTransactions, (item) => item.type === "Credit");
    const projectDebit = sum(state.projectTransactions, (item) => item.type === "Debit");
    const activeBudget = state.projects
      .filter((project) => project.status === "Active" || project.status === "Paused")
      .reduce((total, project) => total + amount(project.budget), 0);
    const remainingBudget = state.projects.reduce((total, project) => total + projectStats(state, project).remaining, 0);
    const overspent = state.projects.reduce((total, project) => total + projectStats(state, project).overspent, 0);
    const monthDebit = sum(state.expenses, (item) => item.type === "Debit" && inRange(item.date, "month")) + sum(state.bills, (item) => item.status === "Paid" && inRange(item.dueDate, "month")) + sum(state.salaryExpenses, (item) => item.type === "Debit" && inRange(item.date, "month")) + sum(state.projectTransactions, (item) => item.type === "Debit" && inRange(item.date, "month"));
    const monthCredit = sum(state.expenses, (item) => item.type === "Credit" && inRange(item.date, "month")) + sum(state.salaries, (item) => inRange(item.receivedDate, "month")) + sum(state.projectTransactions, (item) => item.type === "Credit" && inRange(item.date, "month"));
    const totalCredit = dailyCredit + salaryTotal + salaryCreditExpense + projectCredit;
    const totalDebit = dailyDebit + salarySpent + projectDebit + sum(state.bills, (item) => item.status === "Paid");
    return { dailyCredit, dailyDebit, dailyExpense: dailyDebit, unpaidBills, salaryTotal, salarySpent, projectCredit, projectDebit, activeBudget, remainingBudget, overspent, monthDebit, monthCredit, totalCredit, totalDebit, balance: totalCredit - totalDebit };
  }, [state]);
}

function allTransactions(state) {
  const daily = state.expenses.map((item) => ({ ...item, source: "Daily Expense" }));
  const bills = state.bills.map((item) => ({ ...item, date: item.dueDate, type: item.status === "Paid" ? "Debit" : "Due", category: item.category || "Bills", source: "Bill Tracker" }));
  const salary = state.salaries.map((item) => ({ ...item, title: item.title, date: item.receivedDate, type: "Credit", category: "Salary", source: "Salary" }));
  const salaryLinked = state.salaryExpenses.map((item) => ({ ...item, source: "Salary-Linked Expense" }));
  const project = state.projectTransactions.map((item) => {
    const projectRecord = state.projects.find((entry) => entry.id === item.projectId);
    return { ...item, source: projectRecord ? `${projectRecord.name} Project` : "Project Expense" };
  });
  return [...daily, ...bills, ...salary, ...salaryLinked, ...project].sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function projectStats(state, project) {
  const transactions = state.projectTransactions.filter((item) => item.projectId === project.id);
  const credit = sum(transactions, (item) => item.type === "Credit");
  const debit = sum(transactions, (item) => item.type === "Debit");
  const budget = amount(project.budget);
  const remaining = Math.max(0, budget + credit - debit);
  const overspent = Math.max(0, debit - budget - credit);
  const usage = budget > 0 ? (debit / budget) * 100 : 0;
  const end = new Date(`${project.endDate}T12:00:00`);
  const today = new Date(`${todayISO()}T12:00:00`);
  const daysRemaining = Math.ceil((end - today) / 86400000);
  return { credit, debit, remaining, overspent, usage, daysRemaining };
}

function projectAlerts(state) {
  return state.projects.flatMap((project) => {
    const stats = projectStats(state, project);
    const alerts = [];
    if (stats.usage >= 100) alerts.push({ id: `${project.id}-100`, title: `Budget exceeded for ${project.name}`, message: `Budget ${rupee.format(amount(project.budget))}, spent ${rupee.format(stats.debit)}, overspent ${rupee.format(stats.overspent)}.`, level: "danger" });
    else if (stats.usage >= 90) alerts.push({ id: `${project.id}-90`, title: `${project.name} is at 90% budget`, message: "Please maintain your spending.", level: "warn" });
    else if (stats.usage >= 80) alerts.push({ id: `${project.id}-80`, title: `${project.name} is at 80% budget`, message: "You are close to your budget limit.", level: "warn" });
    else if (stats.usage >= 70) alerts.push({ id: `${project.id}-70`, title: `${project.name} is at 70% budget`, message: "Good time to review spending.", level: "soft" });
    if (["Active", "Paused"].includes(project.status) && [3, 1, 0].includes(stats.daysRemaining)) {
      alerts.push({ id: `${project.id}-end-${stats.daysRemaining}`, title: `${project.name} ending soon`, message: `${stats.daysRemaining === 0 ? "Ends today" : `${stats.daysRemaining} day(s) remaining`}.`, level: "soft" });
    }
    return alerts;
  });
}

function groupAmounts(items, key) {
  return items.reduce((acc, item) => {
    const label = item[key] || "Uncategorized";
    acc[label] = (acc[label] || 0) + amount(item.amount);
    return acc;
  }, {});
}

function groupByMonth(items) {
  return items.reduce((acc, item) => {
    const label = item.date?.slice(0, 7) || "No month";
    acc[label] = (acc[label] || 0) + amount(item.amount);
    return acc;
  }, {});
}

function groupByDate(items) {
  return items.reduce((acc, item) => {
    const label = item.dueDate || item.date || "No date";
    acc[label] = (acc[label] || 0) + amount(item.amount);
    return acc;
  }, {});
}

function groupParticipantBalances(state, projectId = "All") {
  return state.projects
    .filter((project) => projectId === "All" || project.id === projectId)
    .reduce((acc, project) => {
      const transactions = state.projectTransactions.filter((item) => item.projectId === project.id);
      const { stats } = projectSplitSummary(project, transactions);
      stats.forEach((row) => {
        acc[`${project.name}: ${row.name}`] = Math.round(Math.abs(row.balance || 0) * 100) / 100;
      });
      return acc;
    }, {});
}

function highestLabel(group) {
  const entries = Object.entries(group);
  if (!entries.length) return "No data";
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

function sortByDateDesc(a, b) {
  return `${b.date || b.receivedDate || ""} ${b.time || ""}`.localeCompare(`${a.date || a.receivedDate || ""} ${a.time || ""}`);
}

function sortByTimeDesc(a, b) {
  return String(b.time || "").localeCompare(String(a.time || ""));
}

function GmailRecordsView({ state, setState, setToast, fetchGmailTransactions, connectGmail, gmailSyncing, gmailSyncStatus }) {
  const [editingRecord, setEditingRecord] = useState(null);
  const [confirmingRecord, setConfirmingRecord] = useState(null);
  const [importDestination, setImportDestination] = useState("daily");
  const [targetProjectId, setTargetProjectId] = useState("");
  
  const [editTitle, setEditTitle] = useState("");
  const [editAmount, setEditAmount] = useState(0);
  const [editType, setEditType] = useState("Debit");
  const [editCategory, setEditCategory] = useState("Others");
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editPaymentMethod, setEditPaymentMethod] = useState("");
  const [editAccountReference, setEditAccountReference] = useState("");

  const openEdit = (record) => {
    setEditingRecord(record);
    setEditTitle(record.title);
    setEditAmount(record.amount);
    setEditType(record.type);
    setEditCategory(record.category);
    setEditDate(record.date);
    setEditTime(record.time);
    setEditNotes(record.notes);
    setEditPaymentMethod(record.paymentMethod || "UPI");
    setEditAccountReference(record.accountReference || "");
  };

  const saveEdit = () => {
    setState((current) => ({
      ...current,
      gmailRecords: (current.gmailRecords || []).map((r) =>
        r.id === editingRecord.id
          ? {
              ...r,
              title: editTitle,
              amount: Number(editAmount || 0),
              type: editType,
              category: editCategory,
              date: editDate,
              time: editTime,
              notes: editNotes,
              paymentMethod: editPaymentMethod,
              accountReference: editAccountReference
            }
          : r
      )
    }));
    setEditingRecord(null);
    setToast("Record updated");
  };

  const deleteRecord = (record) => {
    setState((current) => {
      const next = {
        ...current,
        gmailRecords: (current.gmailRecords || []).filter((r) => r.id !== record.id),
        settings: {
          ...current.settings,
          gmailProcessedEmailIds: [...(current.settings.gmailProcessedEmailIds || []), record.emailId]
        }
      };
      savePersistedState(STORE_KEY, next);
      return next;
    });
    setToast("Record ignored");
  };

  const openConfirm = (record) => {
    setConfirmingRecord(record);
    if (state.projects && state.projects.length) {
      setTargetProjectId(state.projects[0].id);
    } else {
      setImportDestination("daily");
    }
  };

  const handleImport = () => {
    const record = confirmingRecord;
    const timestamp = new Date().toISOString();
    
    if (importDestination === "daily") {
      const newExpense = {
        id: "exp-" + Math.random().toString(36).substring(2, 9),
        title: record.title,
        amount: record.amount,
        type: record.type,
        category: record.category,
        date: record.date,
        time: record.time || "12:00",
        paymentMethod: record.paymentMethod || "UPI",
        splitMode: "No split",
        notes: record.notes || `Imported from Gmail: ${record.subject}`,
        createdAt: timestamp,
        updatedAt: timestamp
      };

      setState((current) => {
        const next = {
          ...current,
          expenses: [...current.expenses, newExpense],
          gmailRecords: (current.gmailRecords || []).filter((r) => r.id !== record.id),
          settings: {
            ...current.settings,
            gmailProcessedEmailIds: [...(current.settings.gmailProcessedEmailIds || []), record.emailId]
          }
        };
        savePersistedState(STORE_KEY, next);
        return next;
      });
      setToast("Imported to Daily Expenses");
    } else {
      if (!targetProjectId) {
        setToast("Please select a project.");
        return;
      }
      const newProjTx = {
        id: "ptx-" + Math.random().toString(36).substring(2, 9),
        projectId: targetProjectId,
        title: record.title,
        amount: record.amount,
        type: record.type,
        category: record.category,
        date: record.date,
        time: record.time || "12:00",
        paidBy: state.profile?.name || "Me",
        splitMode: "No split",
        participants: [state.profile?.name || "Me"],
        paymentMethod: record.paymentMethod || "UPI",
        notes: record.notes || `Imported from Gmail: ${record.subject}`,
        createdAt: timestamp,
        updatedAt: timestamp
      };

      setState((current) => {
        const next = {
          ...current,
          projectTransactions: [...current.projectTransactions, newProjTx],
          gmailRecords: (current.gmailRecords || []).filter((r) => r.id !== record.id),
          settings: {
            ...current.settings,
            gmailProcessedEmailIds: [...(current.settings.gmailProcessedEmailIds || []), record.emailId]
          }
        };
        savePersistedState(STORE_KEY, next);
        return next;
      });
      setToast("Imported to Project Expenses");
    }

    setConfirmingRecord(null);
  };

  const isConnected = state.settings.gmailAccessToken && (state.settings.gmailTokenExpiry > Date.now());

  return (
    <div className="gmail-records-container">
      <section className="sub-panel gmail-records-header">
        <SectionHeader 
          title="Gmail Transaction Records" 
          action={
            isConnected && (
              <button 
                className={`primary tactile ${gmailSyncing ? "loading" : ""}`} 
                type="button" 
                onClick={fetchGmailTransactions}
                disabled={gmailSyncing}
              >
                {gmailSyncing ? "Syncing..." : "Sync Gmail"}
              </button>
            )
          }
        />
        
        {!state.settings.gmailClientId ? (
          <div className="gmail-onboarding-panel">
            <p>Connect your Google Account to automatically scan your emails for transactions and bills.</p>
            <div className="alert-box note">
              <strong>Redirect URI whitelisting required:</strong>
              <p>Go to Google Cloud Console and add this redirect URI: <code>{window.location.origin}</code></p>
            </div>
            <p className="helper-text">Configure your Client ID in Settings tab to start.</p>
          </div>
        ) : !isConnected ? (
          <div className="gmail-connect-panel">
            <p>Authorize LifePilot to securely scan transaction details from your inbox locally.</p>
            <button className="primary tactile spaced" type="button" onClick={connectGmail}>
              Authorize Google Gmail
            </button>
          </div>
        ) : (
          <div className="gmail-status-panel">
            <div className="cluster spaced">
              <div>
                <span className="gmail-badge connected">Connected</span>
                <span className="gmail-meta-text">Sync pulls recent emails matching: credit, debit, transaction, paid...</span>
              </div>
            </div>
            {(state.settings.gmailLastSyncAt || state.settings.gmailLastStatus || state.settings.gmailLastError) && (
              <div style={{ marginTop: "0.85rem", padding: "0.75rem", borderRadius: "12px", background: "rgba(17, 17, 17, 0.05)", border: "1px solid rgba(17, 17, 17, 0.15)", fontSize: "0.85rem", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                {state.settings.gmailLastSyncAt && (
                  <span>Last Checked: <strong>{new Date(state.settings.gmailLastSyncAt).toLocaleString("en-IN")}</strong></span>
                )}
                {state.settings.gmailLastStatus && (
                  <span>Sync Status: <strong>{state.settings.gmailLastStatus}</strong></span>
                )}
                {state.settings.gmailLastError && (
                  <span style={{ color: "#d93838" }}>Error: <strong style={{ textTransform: "none" }}>{state.settings.gmailLastError}</strong></span>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {gmailSyncing && (
        <div className="gmail-syncing-overlay">
          <div className="loading-orbit" />
          <p>{gmailSyncStatus}</p>
        </div>
      )}

      {isConnected && (
        <section className="panel gmail-records-list-panel">
          <SectionHeader title={`Extracted Pending Actions (${state.gmailRecords?.length || 0})`} />
          {!(state.gmailRecords && state.gmailRecords.length) ? (
            <EmptyState text="No pending transaction reviews. Click 'Sync Gmail' to scan your Inbox." />
          ) : (
            <div className="gmail-card-list">
              {state.gmailRecords.map((record) => (
                <div className="gmail-card" key={record.id}>
                  <div className="gmail-card-body">
                    <div className="cluster spaced">
                      <span className="gmail-card-category">{record.category}</span>
                      <span className="gmail-card-date">{record.date} {record.time}</span>
                    </div>
                    <h3 className="gmail-card-title">{record.title}</h3>
                    <div className="gmail-card-details">
                      <span className={`gmail-card-type ${record.type.toLowerCase()}`}>{record.type}</span>
                      <strong className="gmail-card-amount">{rupee.format(record.amount)}</strong>
                    </div>
                    {(record.paymentMethod || record.accountReference) && (
                      <div className="gmail-card-payment-info" style={{ fontSize: "0.8rem", color: "#665", margin: "0.25rem 0", display: "flex", gap: "0.25rem", alignItems: "center" }}>
                        <span>💳 {record.paymentMethod || "Payment"}{record.accountReference ? ` (${record.accountReference})` : ""}</span>
                      </div>
                    )}
                    {record.notes && <p className="gmail-card-notes">{record.notes}</p>}
                    <div className="gmail-source-badge">
                      <span>From: {record.sender}</span>
                      <span>Subject: {record.subject}</span>
                    </div>
                  </div>
                  <div className="gmail-card-actions cluster">
                    <button className="primary tactile" type="button" onClick={() => openConfirm(record)}>Move</button>
                    <button className="secondary tactile" type="button" onClick={() => openEdit(record)}>Edit</button>
                    <button className="secondary danger tactile" type="button" onClick={() => deleteRecord(record)}>Ignore</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Edit Modal */}
      {editingRecord && (
        <div className="modal-backdrop">
          <div className="modal gmail-editor-modal">
            <div className="modal-header">
              <h2>Edit Transaction Details</h2>
              <button className="icon-button tactile" onClick={() => setEditingRecord(null)}><X size={20} /></button>
            </div>
            <div className="modal-body form-grid">
              <label>Merchant / Title
                <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
              </label>
              <label>Amount
                <input type="number" step="any" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} />
              </label>
              <label>Type
                <Select value={editType} onChange={setEditType} options={[["Debit", "Debit"], ["Credit", "Credit"]]} />
              </label>
              <label>Category
                <Select 
                  value={editCategory} 
                  onChange={setEditCategory} 
                  options={state.categories.map((c) => [c.name, c.name])} 
                />
              </label>
              <label>Date
                <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
              </label>
              <label>Time
                <input type="time" value={editTime} onChange={(e) => setEditTime(e.target.value)} />
              </label>
              <label>Payment Method
                <input value={editPaymentMethod} onChange={(e) => setEditPaymentMethod(e.target.value)} placeholder="UPI, Credit Card, etc." />
              </label>
              <label>Account / Card Ref
                <input value={editAccountReference} onChange={(e) => setEditAccountReference(e.target.value)} placeholder="e.g. Card ending 1234" />
              </label>
              <label className="span-2">Notes
                <textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={2} />
              </label>
            </div>
            <div className="modal-footer cluster spaced">
              <button className="secondary tactile" onClick={() => setEditingRecord(null)}>Cancel</button>
              <button className="primary tactile" onClick={saveEdit}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Import Modal */}
      {confirmingRecord && (
        <div className="modal-backdrop">
          <div className="modal-content gmail-confirm-modal">
            <div className="modal-header">
              <h2>Import to Expenses</h2>
              <button className="icon-button tactile" onClick={() => setConfirmingRecord(null)}><X size={20} /></button>
            </div>
            <div className="modal-body form-grid">
              <p>Move <strong>{confirmingRecord.title} ({rupee.format(confirmingRecord.amount)})</strong> to your money diary:</p>
              
              <div className="radio-group-panel">
                <label className={`radio-label-card ${importDestination === "daily" ? "active" : ""}`}>
                  <input 
                    type="radio" 
                    name="importDest" 
                    value="daily" 
                    checked={importDestination === "daily"} 
                    onChange={() => setImportDestination("daily")} 
                  />
                  <div>
                    <strong>Daily Expenses</strong>
                    <small>Add to your standard personal diary</small>
                  </div>
                </label>

                {state.projects && state.projects.length > 0 && (
                  <label className={`radio-label-card ${importDestination === "project" ? "active" : ""}`}>
                    <input 
                      type="radio" 
                      name="importDest" 
                      value="project" 
                      checked={importDestination === "project"} 
                      onChange={() => setImportDestination("project")} 
                    />
                    <div>
                      <strong>Expense Project</strong>
                      <small>Add to a shared trip, event, or asset diary</small>
                    </div>
                  </label>
                )}
              </div>

              {importDestination === "project" && state.projects && state.projects.length > 0 && (
                <label>Select Project
                  <Select 
                    value={targetProjectId} 
                    onChange={setTargetProjectId} 
                    options={state.projects.map((p) => [p.id, p.name])} 
                  />
                </label>
              )}
            </div>
            <div className="modal-footer cluster spaced">
              <button className="secondary tactile" onClick={() => setConfirmingRecord(null)}>Cancel</button>
              <button className="primary tactile" onClick={handleImport}>Confirm & Move</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GmailInboxView({
  state,
  setState,
  setToast,
  fetchGmailInbox,
  connectGmail,
  gmailInboxSyncing,
  gmailInboxSyncStatus,
  ignoreGmailInbox,
  saveGmailInbox,
  deleteSavedGmail
}) {
  const [activeSubTab, setActiveSubTab] = useState("inbox"); // 'inbox' or 'saved'

  const isConnected = state.settings.gmailAccessToken && (state.settings.gmailTokenExpiry > Date.now());

  // Determine which records to display
  const records = activeSubTab === "inbox" ? (state.gmailInbox || []) : (state.savedGmailRecords || []);

  const groupEmailsByDate = (emails) => {
    const groups = {};
    const todayStr = todayISO();
    const yesterdayStr = addDaysISO(todayStr, -1);

    const sorted = [...emails].sort((a, b) => {
      return b.date.localeCompare(a.date) || b.emailDate.localeCompare(a.emailDate);
    });

    sorted.forEach((email) => {
      let key = email.date;
      if (key === todayStr) {
        key = "Today";
      } else if (key === yesterdayStr) {
        key = "Yesterday";
      } else {
        try {
          const d = new Date(email.date);
          if (!isNaN(d.getTime())) {
            key = d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
          }
        } catch (err) {
          // fallback
        }
      }
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(email);
    });
    return groups;
  };

  const grouped = groupEmailsByDate(records);

  const sortedGroupKeys = useMemo(() => {
    const uniqueKeys = [];
    const todayStr = todayISO();
    const yesterdayStr = addDaysISO(todayStr, -1);
    const sorted = [...records].sort((a, b) => b.date.localeCompare(a.date));
    sorted.forEach((email) => {
      let key = email.date;
      if (key === todayStr) key = "Today";
      else if (key === yesterdayStr) key = "Yesterday";
      else {
        try {
          const d = new Date(email.date);
          if (!isNaN(d.getTime())) {
            key = d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
          }
        } catch (err) {
          // fallback
        }
      }
      if (!uniqueKeys.includes(key)) {
        uniqueKeys.push(key);
      }
    });
    return uniqueKeys;
  }, [records]);

  return (
    <div className="gmail-inbox-container">
      <section className="sub-panel gmail-records-header">
        <SectionHeader 
          title="Gmail Inbox & AI Summaries" 
          action={
            isConnected && activeSubTab === "inbox" && (
              <button 
                className={`primary tactile ${gmailInboxSyncing ? "loading" : ""}`} 
                type="button" 
                onClick={() => fetchGmailInbox(false)}
                disabled={gmailInboxSyncing}
              >
                {gmailInboxSyncing ? "Syncing..." : "Sync Inbox"}
              </button>
            )
          }
        />
        
        {!state.settings.gmailClientId ? (
          <div className="gmail-onboarding-panel">
            <p>Connect your Google Account to automatically scan your emails and generate smart AI summaries.</p>
            <div className="alert-box note">
              <strong>Redirect URI whitelisting required:</strong>
              <p>Go to Google Cloud Console and add this redirect URI: <code>{window.location.origin}</code></p>
            </div>
            <p className="helper-text">Configure your Client ID in Settings tab to start.</p>
          </div>
        ) : !isConnected ? (
          <div className="gmail-connect-panel">
            <p>Authorize LifePilot to securely scan your inbox emails locally.</p>
            <button className="primary tactile spaced" type="button" onClick={connectGmail}>
              Authorize Google Gmail
            </button>
          </div>
        ) : (
          <div className="gmail-status-panel">
            <div className="cluster spaced">
              <div>
                <span className="gmail-badge connected">Connected</span>
                <span className="gmail-meta-text">View and manage non-transactional inbox emails.</span>
              </div>
            </div>
          </div>
        )}
      </section>

      {gmailInboxSyncing && (
        <div className="gmail-syncing-overlay">
          <div className="loading-orbit" />
          <p>{gmailInboxSyncStatus}</p>
        </div>
      )}

      {isConnected && (
        <>
          <div className="gmail-inbox-tabs">
            <button 
              className={activeSubTab === "inbox" ? "active" : ""} 
              onClick={() => setActiveSubTab("inbox")}
            >
              📥 Active Inbox ({state.gmailInbox?.length || 0})
            </button>
            <button 
              className={activeSubTab === "saved" ? "active" : ""} 
              onClick={() => setActiveSubTab("saved")}
            >
              ⭐ Saved ({state.savedGmailRecords?.length || 0})
            </button>
          </div>

          <section className="panel gmail-records-list-panel">
            {records.length === 0 ? (
              <EmptyState 
                text={
                  activeSubTab === "inbox" 
                    ? "No general emails found. Click 'Sync Inbox' to scan." 
                    : "No saved emails yet. Save important emails from your active inbox."
                } 
              />
            ) : (
              <div className="gmail-date-group">
                {sortedGroupKeys.map((groupKey) => (
                  <div key={groupKey}>
                    <h4 className="gmail-date-header">{groupKey}</h4>
                    <div className="gmail-card-list">
                      {(grouped[groupKey] || []).map((record) => (
                        <div 
                          className={`gmail-inbox-card ${record.isImportant ? "important" : ""} ${record.isSecure ? "secure" : ""}`} 
                          key={record.id}
                        >
                          <div className="gmail-card-body">
                            <div className="gmail-card-top-row">
                              <span className="gmail-card-date">
                                {new Date(record.emailDate).toLocaleTimeString("en-IN", { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              <div className="cluster" style={{ gap: "0.25rem" }}>
                                {record.isImportant && <span className="gmail-important-badge">⚠️ Important</span>}
                                {record.isSecure && <span className="gmail-secure-badge">🔒 Secure</span>}
                                {record.aiUnavailable && <span className="gmail-ai-unavailable-badge">AI Busy</span>}
                              </div>
                            </div>

                            <h3 className="gmail-card-title">{record.subject}</h3>
                            
                            <div className="gmail-source-badge">
                              <span>From: {record.sender}</span>
                            </div>

                            {record.isSecure ? (
                              <div className="gmail-secure-lockout">
                                <span className="gmail-secure-lockout-text">
                                  🔒 Secure Content Locked
                                </span>
                                <p style={{ fontSize: "0.8rem", color: "#27ae60", margin: 0 }}>
                                  {record.summary}
                                </p>
                              </div>
                            ) : (
                              <>
                                <div className="gmail-inbox-summary-box">
                                  <strong>AI Summary:</strong>
                                  <p style={{ margin: "0.25rem 0 0 0" }}>{record.summary}</p>
                                </div>
                                
                                {record.snippet && (
                                  <p className="gmail-inbox-snippet" title={record.snippet}>
                                    {record.snippet}
                                  </p>
                                )}

                                {record.urls && record.urls.length > 0 && (
                                  <div className="gmail-inbox-links-box">
                                    <strong style={{ fontSize: "0.78rem", color: "var(--muted)" }}>Action Links:</strong>
                                    {record.urls.map((url, idx) => (
                                      <a 
                                        href={url} 
                                        target="_blank" 
                                        rel="noopener noreferrer" 
                                        className="gmail-inbox-link-item" 
                                        key={idx}
                                      >
                                        🔗 {url.length > 50 ? url.substring(0, 50) + "..." : url}
                                      </a>
                                    ))}
                                  </div>
                                )}

                                {record.hasFiles && (
                                  <span className="gmail-attachment-badge">
                                    📎 Contains attachments
                                  </span>
                                )}
                              </>
                            )}
                          </div>

                          <div className="gmail-card-actions cluster">
                            <a 
                              href={`https://mail.google.com/mail/u/0/#inbox/${record.emailId}`} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="button secondary tactile"
                              style={{ display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none", fontSize: "0.85rem", flex: 1, padding: "0.5rem" }}
                            >
                              Open in Gmail
                            </a>
                            {activeSubTab === "inbox" ? (
                              <>
                                <button 
                                  className="primary tactile" 
                                  type="button" 
                                  onClick={() => saveGmailInbox(record.emailId)}
                                >
                                  Save
                                </button>
                                <button 
                                  className="secondary danger tactile" 
                                  type="button" 
                                  onClick={() => ignoreGmailInbox(record.emailId)}
                                >
                                  Ignore
                                </button>
                              </>
                            ) : (
                              <button 
                                className="secondary danger tactile" 
                                type="button" 
                                onClick={() => deleteSavedGmail(record.emailId)}
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function AutoTrackView({ state, setState, upsert, remove, setToast, setCarLoading }) {
  const [tab, setTab] = useState("overview");
  const [editor, setEditor] = useState(null); // { kind: 'vehicle'|'fuelLog'|'serviceLog'|'chargingLog'|'vehicleReminder'|'vehicleDocument', item: null|object }
  const [importText, setImportText] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [logFilterId, setLogFilterId] = useState("all");
  const [serviceFilterId, setServiceFilterId] = useState("all");

  // Mileage Calculator State
  const [calcVehicleId, setCalcVehicleId] = useState("");
  const [calcStartOdo, setCalcStartOdo] = useState("");
  const [calcEndOdo, setCalcEndOdo] = useState("");
  const [calcFuelFilled, setCalcFuelFilled] = useState("");
  const [calcResult, setCalcResult] = useState(null);

  const today = todayISO();
  const vehicles = state.vehicles || [];

  // Metrics
  const totalDistance = vehicles.reduce((sum, v) => sum + Number(v.currentOdometer || 0), 0);
  const electricDistance = vehicles.filter((v) => v.fuelType === "electric").reduce((sum, v) => sum + Number(v.currentOdometer || 0), 0);
  const fuelDistance = vehicles.filter((v) => v.fuelType === "petrol" || v.fuelType === "diesel").reduce((sum, v) => sum + Number(v.currentOdometer || 0), 0);

  // Per Vehicle Expenses
  const vehicleStats = vehicles.map((v) => {
    const fuelCost = (state.fuelLogs || []).filter((log) => log.vehicleId === v.id).reduce((sum, log) => sum + Number(log.amount || 0), 0);
    const serviceCost = (state.serviceLogs || []).filter((log) => log.vehicleId === v.id).reduce((sum, log) => sum + Number(log.expense || 0), 0);
    const chargingCost = (state.chargingLogs || []).filter((log) => log.vehicleId === v.id).reduce((sum, log) => sum + Number(log.amountSpent || 0), 0);
    const totalCost = fuelCost + serviceCost + chargingCost;

    // Auto Mileage Calculation
    const sortedFuelLogs = (state.fuelLogs || [])
      .filter((log) => log.vehicleId === v.id && log.odometer && log.litres)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    let autoMileage = null;
    if (sortedFuelLogs.length >= 2) {
      const dist = Number(sortedFuelLogs[sortedFuelLogs.length - 1].odometer) - Number(sortedFuelLogs[0].odometer);
      const litresConsumed = sortedFuelLogs.slice(1).reduce((sum, log) => sum + Number(log.litres || 0), 0);
      if (litresConsumed > 0) {
        autoMileage = (dist / litresConsumed).toFixed(2);
      }
    }

    return {
      ...v,
      fuelCost,
      serviceCost,
      chargingCost,
      totalCost,
      calculatedMileage: autoMileage,
    };
  });

  const getGroupedLogs = (logs, filterId) => {
    let filtered = logs || [];
    if (filterId !== "all") {
      filtered = filtered.filter(l => l.vehicleId === filterId);
    }
    filtered = [...filtered].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    
    const groups = {};
    filtered.forEach(l => {
      const d = new Date(l.date);
      const monthYear = isNaN(d) ? "Unknown Date" : d.toLocaleString('default', { month: 'long', year: 'numeric' });
      if (!groups[monthYear]) groups[monthYear] = [];
      groups[monthYear].push(l);
    });
    return groups;
  };

  // Calculate Interactive Mileage
  const handleCalculateMileage = (e) => {
    e.preventDefault();
    const start = Number(calcStartOdo);
    const end = Number(calcEndOdo);
    const fuel = Number(calcFuelFilled);

    if (end <= start) {
      setToast("End odometer must be greater than start odometer");
      return;
    }
    if (fuel <= 0) {
      setToast("Fuel filled must be greater than zero");
      return;
    }

    const mileage = (end - start) / fuel;
    setCalcResult(mileage.toFixed(2));
  };

  // Pre-fill fields for Interactive Calculator based on selected vehicle
  const handleCalcVehicleChange = (vId) => {
    setCalcVehicleId(vId);
    const vLogs = (state.fuelLogs || [])
      .filter((l) => l.vehicleId === vId && l.odometer)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    if (vLogs.length > 0) {
      setCalcStartOdo(vLogs[0].odometer);
      setCalcEndOdo(vLogs[vLogs.length - 1].odometer);
    } else {
      const vehicle = vehicles.find((v) => v.id === vId);
      if (vehicle) {
        setCalcStartOdo(0);
        setCalcEndOdo(vehicle.currentOdometer || 0);
      }
    }
  };

  // JSON Seeding
  const handleImportJson = () => {
    if (!importText.trim()) return;
    try {
      const parsed = JSON.parse(importText);
      const data = parsed.data || parsed;
      if (!data) throw new Error("Invalid schema wrapper");

      setCarLoading(true);
      setImportOpen(false);

      setTimeout(() => {
        setState((current) => {
          return {
            ...current,
            settings: {
              ...current.settings,
              defaultFuelPrice: data.defaultFuelPrice || current.settings.defaultFuelPrice || 102.98
            },
            vehicles: [...(data.vehicles || []), ...current.vehicles].filter((v, idx, self) => self.findIndex((x) => x.id === v.id) === idx),
            fuelLogs: [...(data.fuelLogs || []), ...current.fuelLogs].filter((v, idx, self) => self.findIndex((x) => x.id === v.id) === idx),
            serviceLogs: [...(data.serviceLogs || []), ...current.serviceLogs].filter((v, idx, self) => self.findIndex((x) => x.id === v.id) === idx),
            chargingLogs: [...(data.chargingLogs || []), ...current.chargingLogs].filter((v, idx, self) => self.findIndex((x) => x.id === v.id) === idx),
            vehicleReminders: [...(data.reminders || []), ...current.vehicleReminders || []].filter((v, idx, self) => self.findIndex((x) => x.id === v.id) === idx),
            vehicleDocuments: [...(data.documents || []), ...current.vehicleDocuments || []].filter((v, idx, self) => self.findIndex((x) => x.id === v.id) === idx)
          };
        });
        setToast("AutoTrack data loaded");
        setCarLoading(false);
      }, 1500);
    } catch (err) {
      setToast("Failed to parse JSON: " + err.message);
    }
  };

  // Editor Save
  const handleEditorSave = (itemData) => {
    upsert(collectionForKind(editor.kind), itemData, editor.kind);
    
    // Automatically update currentOdometer on vehicle if a fuel/service/charging log has a higher odometer reading
    if (["fuelLog", "serviceLog"].includes(editor.kind) && itemData.odometer && itemData.vehicleId) {
      const odo = Number(itemData.odometer);
      const vehicle = vehicles.find((v) => v.id === itemData.vehicleId);
      if (vehicle && odo > Number(vehicle.currentOdometer || 0)) {
        upsert("vehicles", { ...vehicle, currentOdometer: odo }, "vehicle");
      }
    }
    
    setEditor(null);
  };

  return (
    <div className="autotrack-dashboard page-grid">
      {/* Tab Navigation header */}
      <div className="autotrack-tabs panel span-2">
        <div className="autotrack-nav-container">
          <div className="autotrack-tab-list">
            {[
              ["overview", "Overview & Insights"],
              ["vehicles", "Vehicles"],
              ["logs", "Refuel & Charge"],
              ["service", "Service Logs"],
              ["reminders", "Reminders & Docs"]
            ].map(([k, label]) => (
              <button
                key={k}
                className={`secondary tactile ${tab === k ? "active-tab" : ""}`}
                onClick={() => setTab(k)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* OVERVIEW & INSIGHTS TAB */}
      {tab === "overview" && (
        <>
          {/* Stats Cards */}
          <div className="overview-stats span-2">
            <div className="metric-card panel tactile">
              <div className="due-badge" style={{ background: "var(--lavender)" }}>Distance</div>
              <h3>{totalDistance.toLocaleString()} km</h3>
              <span>Total Across All Vehicles</span>
            </div>
            <div className="metric-card panel tactile">
              <div className="due-badge" style={{ background: "var(--yellow)" }}>Petrol/Diesel</div>
              <h3>{fuelDistance.toLocaleString()} km</h3>
              <span>Combustion Engine Vehicles</span>
            </div>
            <div className="metric-card panel tactile">
              <div className="due-badge" style={{ background: "var(--blue)" }}>Electric</div>
              <h3>{electricDistance.toLocaleString()} km</h3>
              <span>Electric Vehicle Mileage</span>
            </div>
          </div>

          {/* Expenses Breakdown */}
          <div className="panel span-2">
            <SectionHeader title="Vehicle Expenses Summary" />
            <div className="autotrack-table-container">
              <table className="autotrack-table">
                <thead>
                  <tr>
                    <th>Vehicle</th>
                    <th>Type</th>
                    <th>Fuel Costs</th>
                    <th>Charging Costs</th>
                    <th>Service Costs</th>
                    <th>Total Expenses</th>
                    <th>Calculated Mileage</th>
                  </tr>
                </thead>
                <tbody>
                  {vehicleStats.length === 0 ? (
                    <tr>
                      <td colSpan="7" style={{ textAlign: "center", padding: "1.5rem", color: "var(--muted)" }}>
                        No vehicles added yet. Use the Vehicles tab or import JSON to get started.
                      </td>
                    </tr>
                  ) : (
                    vehicleStats.map((v) => (
                      <tr key={v.id}>
                        <td><strong>{v.name}</strong><br /><small>{v.brand} {v.model}</small></td>
                        <td><span className="badge-tag">{v.type} ({v.fuelType})</span></td>
                        <td>₹{v.fuelCost.toLocaleString()}</td>
                        <td>₹{v.chargingCost.toLocaleString()}</td>
                        <td>₹{v.serviceCost.toLocaleString()}</td>
                        <td><strong>₹{v.totalCost.toLocaleString()}</strong></td>
                        <td>
                          {v.fuelType === "electric" ? (
                            <span style={{ color: "var(--muted)" }}>N/A (EV)</span>
                          ) : v.autoMileage ? (
                            <strong>{v.autoMileage} km/L</strong>
                          ) : (
                            <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>Needs 2+ refuels</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mileage Calculator Form */}
          <div className="panel">
            <SectionHeader title="Mileage Efficiency Calculator" />
            <form onSubmit={handleCalculateMileage} className="form-grid">
              <label className="wide">Select Vehicle
                <Select
                  value={calcVehicleId}
                  onChange={handleCalcVehicleChange}
                  options={[
                    ["", "Choose petrol/diesel vehicle"],
                    ...vehicles.filter((v) => v.fuelType !== "electric").map((v) => [v.id, `${v.brand} ${v.model} (${v.name})`])
                  ]}
                />
              </label>
              <label>Start Odometer (km)
                <input
                  type="number"
                  min="0"
                  value={calcStartOdo}
                  onChange={(e) => setCalcStartOdo(e.target.value)}
                  required
                />
              </label>
              <label>End Odometer (km)
                <input
                  type="number"
                  min="0"
                  value={calcEndOdo}
                  onChange={(e) => setCalcEndOdo(e.target.value)}
                  required
                />
              </label>
              <label className="wide">Fuel Filled (Litres)
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={calcFuelFilled}
                  onChange={(e) => setCalcFuelFilled(e.target.value)}
                  required
                />
              </label>
              <button className="primary tactile wide" type="submit">Calculate Mileage</button>
            </form>
            {calcResult !== null && (
              <div className="calculator-result" style={{ marginTop: "1rem", padding: "1rem", border: "2px solid var(--ink)", borderRadius: "8px", background: "var(--paper)" }}>
                <p style={{ margin: 0, fontSize: "1.1rem" }}>Calculated Mileage: <strong>{calcResult} km/L</strong></p>
                <p className="helper-text" style={{ margin: "0.5rem 0 0 0", color: "var(--muted)" }}>
                  ⚠️ <em>Results will vary based on driving conditions, road conditions, traffic, vehicle health, and driving style.</em>
                </p>
              </div>
            )}
          </div>

          {/* Quick Info / Tips */}
          <div className="panel">
            <SectionHeader title="Maintenance & Efficiency Tips" />
            <ul style={{ paddingLeft: "1.2rem", margin: 0, display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <li><strong>Tire Pressure</strong>: Keep tires properly inflated to improve fuel economy by up to 3%.</li>
              <li><strong>Regular Service</strong>: Changing air filters, spark plugs, and engine oil on time keeps the engine running efficiently.</li>
              <li><strong>Smooth Driving</strong>: Avoid sudden acceleration and braking. Gradual speed changes conserve energy.</li>
              <li><strong>EV Charging</strong>: For electric vehicles, charging between 20% and 80% extends battery health.</li>
            </ul>
          </div>
        </>
      )}

      {/* VEHICLES CRUD TAB */}
      {tab === "vehicles" && (
        <div className="span-2 panel">
          <SectionHeader
            title="Registered Vehicles"
            action={<button className="primary tactile" onClick={() => setEditor({ kind: "vehicle", item: null })}>+ Add Vehicle</button>}
          />
          <div className="vehicles-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1rem", marginTop: "1rem" }}>
            {vehicles.length === 0 ? (
              <p style={{ gridColumn: "1/-1", textAlign: "center", color: "var(--muted)", padding: "2rem" }}>No vehicles registered yet.</p>
            ) : (
              vehicles.map((v) => (
                <div key={v.id} className="vehicle-card panel tactile" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  <div className="autotrack-flex-row spaced" style={{ margin: "0.65rem 0" }}>
                    <span className="badge-tag" style={{ background: v.fuelType === "electric" ? "var(--blue)" : "var(--yellow)" }}>
                      {v.type} ({v.fuelType})
                    </span>
                    <strong style={{ fontSize: "1.1rem" }}>{v.name}</strong>
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: "1.2rem" }}>{v.brand} {v.model}</h4>
                    <p style={{ margin: "0.25rem 0 0 0", color: "var(--muted)" }}>Odometer: <strong>{v.currentOdometer.toLocaleString()} km</strong></p>
                  </div>
                  <div className="autotrack-flex-row" style={{ marginTop: "auto", borderTop: "1px solid var(--line)", paddingTop: "0.75rem", gap: "0.50rem" }}>
                    <button className="secondary tactile" style={{ flex: 1 }} onClick={() => setEditor({ kind: "vehicle", item: v })}>Edit</button>
                    <button className="secondary danger tactile" onClick={() => remove("vehicles", v.id, "vehicle")}>Delete</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* REFUEL & CHARGE TAB */}
      {tab === "logs" && (
        <>
          <div className="autotrack-nav-container" style={{ marginBottom: "1rem", justifyContent: "flex-end" }}>
             <select value={logFilterId} onChange={(e) => setLogFilterId(e.target.value)} style={{ width: "auto", minWidth: "150px" }}>
               <option value="all">All Vehicles</option>
               {vehicles.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
             </select>
          </div>

          {/* Refuel Logs (Petrol/Diesel) */}
          <div className="panel" style={{ marginBottom: "1.5rem" }}>
            <SectionHeader
              title="Fuel Refill Logs (Combustion)"
              action={<button className="primary tactile" onClick={() => setEditor({ kind: "fuelLog", item: null })}>+ Add Fuel Log</button>}
            />
            {Object.entries(getGroupedLogs(state.fuelLogs, logFilterId)).length === 0 ? (
              <p style={{ textAlign: "center", color: "var(--muted)", padding: "1.5rem" }}>No refuel logs recorded yet.</p>
            ) : (
              Object.entries(getGroupedLogs(state.fuelLogs, logFilterId)).map(([month, logs]) => (
                <div key={month} style={{ marginTop: "1rem" }}>
                  <h4 style={{ margin: "0 0 0.5rem 0", color: "var(--muted)", textTransform: "uppercase", fontSize: "0.85rem", letterSpacing: "0.5px" }}>{month}</h4>
                  <div className="autotrack-table-container">
                    <table className="autotrack-table">
                      <thead>
                        <tr>
                          <th>Vehicle</th>
                          <th>Date</th>
                          <th>Odometer</th>
                          <th>Litres</th>
                          <th>Price/L</th>
                          <th>Amount</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {logs.map((log) => {
                          const v = vehicles.find((x) => x.id === log.vehicleId);
                          return (
                            <tr key={log.id}>
                              <td data-label="Vehicle"><strong>{v ? v.name : "Unknown"}</strong></td>
                              <td data-label="Date">{formatDate(log.date?.slice(0, 10))} <small>{log.date?.slice(11)}</small></td>
                              <td data-label="Odometer">{log.odometer ? `${log.odometer.toLocaleString()} km` : "-"}</td>
                              <td data-label="Litres">{log.litres} L</td>
                              <td data-label="Price/L">₹{log.pricePerLitre}</td>
                              <td data-label="Amount"><strong>₹{log.amount}</strong></td>
                              <td data-label="Actions">
                                <div className="autotrack-flex-row" style={{ gap: "0.25rem", flexWrap: "nowrap" }}>
                                  <button className="icon-button tactile" onClick={() => setEditor({ kind: "fuelLog", item: log })}><Edit3 size={15} /></button>
                                  <button className="icon-button tactile danger" onClick={() => remove("fuelLogs", log.id, "fuel log")}><Trash2 size={15} /></button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Charging Logs (Electric) */}
          <div className="panel">
            <SectionHeader
              title="EV Charging Logs (Electric)"
              action={<button className="primary tactile" onClick={() => setEditor({ kind: "chargingLog", item: null })}>+ Add Charging Log</button>}
            />
            {Object.entries(getGroupedLogs(state.chargingLogs, logFilterId)).length === 0 ? (
              <p style={{ textAlign: "center", color: "var(--muted)", padding: "1.5rem" }}>No charging logs recorded yet.</p>
            ) : (
              Object.entries(getGroupedLogs(state.chargingLogs, logFilterId)).map(([month, logs]) => (
                <div key={month} style={{ marginTop: "1rem" }}>
                  <h4 style={{ margin: "0 0 0.5rem 0", color: "var(--muted)", textTransform: "uppercase", fontSize: "0.85rem", letterSpacing: "0.5px" }}>{month}</h4>
                  <div className="autotrack-table-container">
                    <table className="autotrack-table">
                      <thead>
                        <tr>
                          <th>Vehicle</th>
                          <th>Date</th>
                          <th>Location/Type</th>
                          <th>Cost</th>
                          <th>Notes</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {logs.map((log) => {
                          const v = vehicles.find((x) => x.id === log.vehicleId);
                          return (
                            <tr key={log.id}>
                              <td data-label="Vehicle"><strong>{v ? v.name : "Unknown"}</strong></td>
                              <td data-label="Date">{formatDate(log.date?.slice(0, 10))} <small>{log.date?.slice(11)}</small></td>
                              <td data-label="Location/Type"><span className="badge-tag">{log.chargingType}</span></td>
                              <td data-label="Cost"><strong>₹{log.amountSpent}</strong></td>
                              <td data-label="Notes" style={{ maxWidth: "150px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={log.notes}>{log.notes || "-"}</td>
                              <td data-label="Actions">
                                <div className="autotrack-flex-row" style={{ gap: "0.25rem", flexWrap: "nowrap" }}>
                                  <button className="icon-button tactile" onClick={() => setEditor({ kind: "chargingLog", item: log })}><Edit3 size={15} /></button>
                                  <button className="icon-button tactile danger" onClick={() => remove("chargingLogs", log.id, "charging log")}><Trash2 size={15} /></button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* SERVICE LOGS TAB */}
      {tab === "service" && (
        <div className="panel span-2">
          <div className="autotrack-nav-container" style={{ marginBottom: "1rem", justifyContent: "space-between", alignItems: "flex-end" }}>
            <SectionHeader
              title="Service & Repair History"
              action={<button className="primary tactile" onClick={() => setEditor({ kind: "serviceLog", item: null })}>+ Add Service Record</button>}
            />
            <select value={serviceFilterId} onChange={(e) => setServiceFilterId(e.target.value)} style={{ width: "auto", minWidth: "150px", marginBottom: "0.5rem" }}>
              <option value="all">All Vehicles</option>
              {vehicles.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          {Object.entries(getGroupedLogs(state.serviceLogs, serviceFilterId)).length === 0 ? (
            <p style={{ textAlign: "center", color: "var(--muted)", padding: "2rem" }}>No service records found.</p>
          ) : (
            Object.entries(getGroupedLogs(state.serviceLogs, serviceFilterId)).map(([month, logs]) => (
              <div key={month} style={{ marginTop: "1.5rem" }}>
                <h4 style={{ margin: "0 0 0.5rem 0", color: "var(--muted)", textTransform: "uppercase", fontSize: "0.85rem", letterSpacing: "0.5px" }}>{month}</h4>
                <div className="autotrack-table-container">
                  <table className="autotrack-table">
                    <thead>
                      <tr>
                        <th>Vehicle</th>
                        <th>Date</th>
                        <th>Service Type</th>
                        <th>Odometer Reading</th>
                        <th>Expense Amount</th>
                        <th>Work Summary / Notes</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((log) => {
                        const v = vehicles.find((x) => x.id === log.vehicleId);
                        return (
                          <tr key={log.id}>
                            <td data-label="Vehicle"><strong>{v ? v.name : "Unknown"}</strong></td>
                            <td data-label="Date">{formatDate(log.date)}</td>
                            <td data-label="Service Type"><span className="badge-tag" style={{ background: "var(--lavender)" }}>{log.serviceType}</span></td>
                            <td data-label="Odometer">{log.odometer ? `${log.odometer.toLocaleString()} km` : "-"}</td>
                            <td data-label="Expense"><strong>₹{log.expense.toLocaleString()}</strong></td>
                            <td data-label="Notes" style={{ fontSize: "0.85rem", maxWidth: "250px" }}>{log.notes || "-"}</td>
                            <td data-label="Actions">
                              <div className="autotrack-flex-row" style={{ gap: "0.25rem", flexWrap: "nowrap" }}>
                                <button className="icon-button tactile" onClick={() => setEditor({ kind: "serviceLog", item: log })}><Edit3 size={15} /></button>
                                <button className="icon-button tactile danger" onClick={() => remove("serviceLogs", log.id, "service record")}><Trash2 size={15} /></button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* REMINDERS & DOCUMENTS TAB */}
      {tab === "reminders" && (
        <>
          {/* Reminders list */}
          <div className="panel">
            <SectionHeader
              title="Maintenance Reminders"
              action={<button className="primary tactile" onClick={() => setEditor({ kind: "vehicleReminder", item: null })}>+ Add Reminder</button>}
            />
            <div className="vehicle-reminders-list" style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "1rem" }}>
              {(state.vehicleReminders || []).length === 0 ? (
                <p style={{ textAlign: "center", color: "var(--muted)", padding: "1.5rem" }}>No reminders created.</p>
              ) : (
                (state.vehicleReminders || []).map((rem) => {
                  const v = vehicles.find((x) => x.id === rem.vehicleId);
                  
                  let isOverdue = false;
                  let subtitle = "";
                  if (rem.isMileageBased) {
                    const diff = Number(rem.dueMileage || 0) - Number(v?.currentOdometer || 0);
                    isOverdue = diff <= 0;
                    subtitle = `Due at: ${rem.dueMileage?.toLocaleString()} km (${isOverdue ? "Overdue" : `${diff.toLocaleString()} km left`})`;
                  } else if (rem.dueDate) {
                    isOverdue = rem.dueDate < today;
                    subtitle = `Due date: ${formatDate(rem.dueDate)} ${isOverdue ? "(Overdue)" : ""}`;
                  }

                  return (
                    <div key={rem.id} className={`vehicle-reminder-card panel tactile ${rem.isCompleted ? "done" : isOverdue ? "overdue" : ""}`} style={{ padding: "0.75rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div className="autotrack-flex-row" style={{ gap: "0.5rem" }}>
                          <input
                            type="checkbox"
                            checked={rem.isCompleted}
                            onChange={(e) => upsert("vehicleReminders", { ...rem, isCompleted: e.target.checked }, "vehicleReminder")}
                          />
                          <strong style={{ textDecoration: rem.isCompleted ? "line-through" : "none" }}>{rem.title}</strong>
                        </div>
                        <p style={{ margin: "0.25rem 0 0 1.5rem", fontSize: "0.85rem", color: "var(--muted)" }}>
                          {v ? `${v.brand} ${v.model} (${v.name})` : "Vehicle"} | {subtitle}
                        </p>
                        {rem.notes && <p style={{ margin: "0.25rem 0 0 1.5rem", fontSize: "0.8rem", color: "var(--muted)" }}>{rem.notes}</p>}
                      </div>
                      <div className="autotrack-flex-row" style={{ gap: "0.25rem" }}>
                        <button className="icon-button tactile" onClick={() => setEditor({ kind: "vehicleReminder", item: rem })}><Edit3 size={14} /></button>
                        <button className="icon-button tactile danger" onClick={() => remove("vehicleReminders", rem.id, "reminder")}><Trash2 size={14} /></button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Documents list */}
          <div className="panel">
            <SectionHeader
              title="Official Documents"
              action={<button className="primary tactile" onClick={() => setEditor({ kind: "vehicleDocument", item: null })}>+ Add Document</button>}
            />
            <div className="vehicle-docs-list" style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "1rem" }}>
              {(state.vehicleDocuments || []).length === 0 ? (
                <p style={{ textAlign: "center", color: "var(--muted)", padding: "1.5rem" }}>No documents saved.</p>
              ) : (
                (state.vehicleDocuments || []).map((doc) => {
                  const v = vehicles.find((x) => x.id === doc.vehicleId);
                  const isExpired = doc.expiryDate && doc.expiryDate < today;
                  const docBadgeClass = /insurance/i.test(doc.type || doc.title)
                    ? "insurance-badge"
                    : /(registration|rc)/i.test(doc.type || doc.title)
                    ? "rc-badge"
                    : /puc/i.test(doc.type || doc.title)
                    ? "puc-badge"
                    : "";

                  return (
                    <div key={doc.id} className={`vehicle-reminder-card panel tactile ${isExpired ? "overdue" : ""}`} style={{ padding: "0.75rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div className="autotrack-flex-row" style={{ gap: "0.5rem" }}>
                          <strong>{doc.title}</strong> <span className={`badge-tag ${docBadgeClass}`}>{doc.type}</span>
                        </div>
                        <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.85rem", color: "var(--muted)" }}>
                          {v ? `${v.brand} ${v.model} (${v.name})` : "Vehicle"} | Expiry: {doc.expiryDate ? `${formatDate(doc.expiryDate)} ${isExpired ? "(Expired)" : ""}` : "No expiry"}
                        </p>
                        {doc.notes && <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.8rem", color: "var(--muted)" }}>{doc.notes}</p>}
                        {doc.link && <a href={doc.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.8rem", color: "var(--ink)", textDecoration: "underline", display: "inline-block", marginTop: "0.25rem" }}>View File Link</a>}
                      </div>
                      <div className="autotrack-flex-row" style={{ gap: "0.25rem" }}>
                        <button className="icon-button tactile" onClick={() => setEditor({ kind: "vehicleDocument", item: doc })}><Edit3 size={14} /></button>
                        <button className="icon-button tactile danger" onClick={() => remove("vehicleDocuments", doc.id, "document")}><Trash2 size={14} /></button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}

      {/* JSON IMPORT DIALOG */}
      {importOpen && (
        <div className="autotrack-modal-overlay">
          <div className="autotrack-modal panel tactile">
            <div className="modal-header autotrack-flex-row spaced" style={{ borderBottom: "2px solid var(--ink)", paddingBottom: "0.75rem", marginBottom: "1rem" }}>
              <h2 style={{ margin: 0 }}>Import AutoTrack JSON</h2>
              <button className="icon-button tactile" onClick={() => setImportOpen(false)}><X size={20} /></button>
            </div>
            <p className="helper-text" style={{ marginBottom: "1rem" }}>Paste your AUTOTRACKPRO_v1 export JSON block below to load your vehicles and logs.</p>
            <textarea
              style={{ width: "100%", height: "250px", fontFamily: "monospace", padding: "0.5rem", borderRadius: "6px", border: "2px solid var(--ink)" }}
              placeholder='{ "key": "AUTOTRACKPRO_v1", "data": { ... } }'
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
            />
            <div className="autotrack-flex-row" style={{ justifyContent: "flex-end", marginTop: "1rem", gap: "0.5rem" }}>
              <button className="secondary tactile" onClick={() => setImportOpen(false)}>Cancel</button>
              <button className="primary tactile" onClick={handleImportJson}>Import & Seed</button>
            </div>
          </div>
        </div>
      )}

      {/* CRUD FORM EDITOR DIALOG */}
      {editor && (
        <AutotrackFormEditor
          editor={editor}
          vehicles={vehicles}
          defaultFuelPrice={state.settings.defaultFuelPrice !== undefined ? state.settings.defaultFuelPrice : 102.98}
          close={() => setEditor(null)}
          save={handleEditorSave}
        />
      )}
    </div>
  );
}

// Separate component for CRUD editor forms
function AutotrackFormEditor({ editor, vehicles, defaultFuelPrice, close, save }) {
  const isEdit = Boolean(editor.item?.id);
  const [formVal, setFormVal] = useState(() => {
    if (editor.item) return { ...editor.item };
    
    const dateStr = todayISO();
    if (editor.kind === "vehicle") {
      return { name: "", brand: "", model: "", type: "car", fuelType: "petrol", currentOdometer: "" };
    }
    if (editor.kind === "fuelLog") {
      return { vehicleId: vehicles.filter((v) => v.fuelType !== "electric")[0]?.id || "", date: dateStr + "T12:00", pricePerLitre: defaultFuelPrice, amount: "", litres: "", odometer: "", notes: "" };
    }
    if (editor.kind === "chargingLog") {
      return { vehicleId: vehicles.filter((v) => v.fuelType === "electric")[0]?.id || "", date: dateStr + "T12:00", amountSpent: "", chargingType: "public", notes: "" };
    }
    if (editor.kind === "serviceLog") {
      return { vehicleId: vehicles[0]?.id || "", date: dateStr, expense: "", serviceType: "General Service", odometer: "", notes: "" };
    }
    if (editor.kind === "vehicleReminder") {
      return { vehicleId: vehicles[0]?.id || "", type: "service", title: "", dueDate: dateStr, dueMileage: "", isMileageBased: false, isCompleted: false };
    }
    if (editor.kind === "vehicleDocument") {
      return { vehicleId: vehicles[0]?.id || "", type: "insurance", title: "", expiryDate: dateStr, link: "", notes: "" };
    }
    return {};
  });

  // Bidirectional calculations for Fuel Log Form
  const handlePriceChange = (val) => {
    const p = Number(val);
    setFormVal(prev => {
      const next = { ...prev, pricePerLitre: val };
      if (next.litres && p > 0) {
        next.amount = (Number(next.litres) * p).toFixed(2);
      } else if (next.amount && p > 0) {
        next.litres = (Number(next.amount) / p).toFixed(2);
      }
      return next;
    });
  };

  const handleLitresChange = (val) => {
    const l = Number(val);
    setFormVal(prev => {
      const next = { ...prev, litres: val };
      if (next.pricePerLitre && l > 0) {
        next.amount = (l * Number(next.pricePerLitre)).toFixed(2);
      }
      return next;
    });
  };

  const handleAmountChange = (val) => {
    const amt = Number(val);
    setFormVal(prev => {
      const next = { ...prev, amount: val };
      if (next.pricePerLitre && amt > 0) {
        next.litres = (amt / Number(next.pricePerLitre)).toFixed(2);
      }
      return next;
    });
  };

  const setVal = (k, v) => setFormVal((prev) => ({ ...prev, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Validations
    if (editor.kind === "vehicle" && !formVal.name.trim()) return;
    if (["fuelLog", "serviceLog", "chargingLog", "vehicleReminder", "vehicleDocument"].includes(editor.kind) && !formVal.vehicleId) {
      alert("Please select a vehicle");
      return;
    }

    save(formVal);
  };

  return (
    <div className="autotrack-modal-overlay">
      <div className="autotrack-modal panel tactile">
        <div className="modal-header cluster spaced" style={{ borderBottom: "2px solid var(--ink)", paddingBottom: "0.75rem", marginBottom: "1rem" }}>
          <h2 style={{ margin: 0 }}>{isEdit ? "Edit" : "Add"} {kindLabel(editor.kind)}</h2>
          <button className="icon-button tactile" onClick={close}><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="form-grid">
          {/* VEHICLE FORM */}
          {editor.kind === "vehicle" && (
            <>
              <label>License Plate (Name)
                <input value={formVal.name} onChange={(e) => setVal("name", e.target.value)} placeholder="e.g. KA 03 KP 6885" required />
              </label>
              <label>Brand
                <input value={formVal.brand} onChange={(e) => setVal("brand", e.target.value)} placeholder="e.g. Honda, Ather" required />
              </label>
              <label>Model
                <input value={formVal.model} onChange={(e) => setVal("model", e.target.value)} placeholder="e.g. 450X, Unicorn" required />
              </label>
              <label>Vehicle Type
                <Select value={formVal.type} onChange={(val) => setVal("type", val)} options={[["car", "Car"], ["bike", "Bike"], ["scooty", "Scooty"]]} />
              </label>
              <label>Fuel Type
                <Select value={formVal.fuelType} onChange={(val) => setVal("fuelType", val)} options={[["petrol", "Petrol"], ["diesel", "Diesel"], ["electric", "Electric"]]} />
              </label>
              <label>Current Odometer (km)
                <input type="number" min="0" value={formVal.currentOdometer} onChange={(e) => setVal("currentOdometer", e.target.value)} required />
              </label>
            </>
          )}

          {/* FUEL LOG FORM */}
          {editor.kind === "fuelLog" && (
            <>
              <label className="wide">Select Petrol/Diesel Vehicle
                <Select value={formVal.vehicleId} onChange={(val) => setVal("vehicleId", val)} options={vehicles.filter((v) => v.fuelType !== "electric").map((v) => [v.id, `${v.brand} ${v.model} (${v.name})`])} />
              </label>
              <label>Date & Time
                <input type="datetime-local" value={formVal.date} onChange={(e) => setVal("date", e.target.value)} required />
              </label>
              <label>Odometer Reading (km)
                <input type="number" min="0" value={formVal.odometer} onChange={(e) => setVal("odometer", e.target.value)} required />
              </label>
              <label>Price per Litre (₹) <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>(Default: ₹{defaultFuelPrice})</span>
                <input type="number" step="0.01" min="0" value={formVal.pricePerLitre} onChange={(e) => handlePriceChange(e.target.value)} required />
              </label>
              <label>Fuel Quantity (Litres)
                <input type="number" step="0.01" min="0" value={formVal.litres} onChange={(e) => handleLitresChange(e.target.value)} required />
              </label>
              <label className="wide">Total Spent (₹) <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>(Autocalculated)</span>
                <input type="number" step="0.01" min="0" value={formVal.amount} onChange={(e) => handleAmountChange(e.target.value)} required />
              </label>
              <label className="wide">Notes
                <input value={formVal.notes || ""} onChange={(e) => setVal("notes", e.target.value)} placeholder="e.g. Full tank refill, bunk location" />
              </label>
            </>
          )}

          {/* CHARGING LOG FORM */}
          {editor.kind === "chargingLog" && (
            <>
              <label className="wide">Select EV Vehicle
                <Select value={formVal.vehicleId} onChange={(val) => setVal("vehicleId", val)} options={vehicles.filter((v) => v.fuelType === "electric").map((v) => [v.id, `${v.brand} ${v.model} (${v.name})`])} />
              </label>
              <label>Date & Time
                <input type="datetime-local" value={formVal.date} onChange={(e) => setVal("date", e.target.value)} required />
              </label>
              <label>Amount Spent (₹)
                <input type="number" step="0.01" min="0" value={formVal.amountSpent} onChange={(e) => setVal("amountSpent", e.target.value)} required />
              </label>
              <label>Charging Station Type
                <Select value={formVal.chargingType} onChange={(val) => setVal("chargingType", val)} options={[["public", "Public Charger"], ["home", "Home Charger"]]} />
              </label>
              <label className="wide">Notes / Location
                <input value={formVal.notes || ""} onChange={(e) => setVal("notes", e.target.value)} placeholder="e.g. Gopalan Signature Mall, Ather App" />
              </label>
            </>
          )}

          {/* SERVICE LOG FORM */}
          {editor.kind === "serviceLog" && (
            <>
              <label className="wide">Select Vehicle
                <Select value={formVal.vehicleId} onChange={(val) => setVal("vehicleId", val)} options={vehicles.map((v) => [v.id, `${v.brand} ${v.model} (${v.name})`])} />
              </label>
              <label>Date
                <input type="date" value={formVal.date} onChange={(e) => setVal("date", e.target.value)} required />
              </label>
              <label>Service Expense (₹)
                <input type="number" min="0" value={formVal.expense} onChange={(e) => setVal("expense", e.target.value)} required />
              </label>
              <label>Service Type
                <input value={formVal.serviceType} onChange={(e) => setVal("serviceType", e.target.value)} placeholder="e.g. General Service, Wheel alignment, Repairs" required />
              </label>
              <label>Odometer Reading (km)
                <input type="number" min="0" value={formVal.odometer || ""} onChange={(e) => setVal("odometer", e.target.value)} placeholder="Leave blank if unknown" />
              </label>
              <label className="wide">Service Details / Notes
                <textarea value={formVal.notes || ""} onChange={(e) => setVal("notes", e.target.value)} placeholder="e.g. Replaced brake pads, belt noise spray, oil change details" />
              </label>
            </>
          )}

          {/* REMINDER FORM */}
          {editor.kind === "vehicleReminder" && (
            <>
              <label className="wide">Select Vehicle
                <Select value={formVal.vehicleId} onChange={(val) => setVal("vehicleId", val)} options={vehicles.map((v) => [v.id, `${v.brand} ${v.model} (${v.name})`])} />
              </label>
              <label className="wide">Reminder Title
                <input value={formVal.title} onChange={(e) => setVal("title", e.target.value)} placeholder="e.g. General Service, Oil change" required />
              </label>
              <label className="wide toggle-row">
                <input type="checkbox" checked={formVal.isMileageBased} onChange={(e) => setVal("isMileageBased", e.target.checked)} />
                Mileage-based reminder? (otherwise date-based)
              </label>
              {formVal.isMileageBased ? (
                <label className="wide">Target Mileage (Odometer km)
                  <input type="number" min="0" value={formVal.dueMileage || ""} onChange={(e) => setVal("dueMileage", e.target.value)} required />
                </label>
              ) : (
                <label className="wide">Due Date
                  <input type="date" value={formVal.dueDate || ""} onChange={(e) => setVal("dueDate", e.target.value)} required />
                </label>
              )}
              <label className="wide">Notes / Description
                <input value={formVal.notes || ""} onChange={(e) => setVal("notes", e.target.value)} placeholder="e.g. Check belt noise, check engine light" />
              </label>
              {isEdit && (
                <label className="wide toggle-row">
                  <input type="checkbox" checked={formVal.isCompleted} onChange={(e) => setVal("isCompleted", e.target.checked)} />
                  Completed / Handled?
                </label>
              )}
            </>
          )}

          {/* DOCUMENT FORM */}
          {editor.kind === "vehicleDocument" && (
            <>
              <label className="wide">Select Vehicle
                <Select value={formVal.vehicleId} onChange={(val) => setVal("vehicleId", val)} options={vehicles.map((v) => [v.id, `${v.brand} ${v.model} (${v.name})`])} />
              </label>
              <label>Document Title
                <input value={formVal.title} onChange={(e) => setVal("title", e.target.value)} placeholder="e.g. Vehicle Insurance, RC Copy" required />
              </label>
              <label>Document Type
                <Select value={formVal.type} onChange={(val) => setVal("type", val)} options={[["insurance", "Insurance"], ["rc", "RC Book"], ["puc", "PUC Certificate"], ["other", "Other"]]} />
              </label>
              <label>Expiry Date
                <input type="date" value={formVal.expiryDate || ""} onChange={(e) => setVal("expiryDate", e.target.value)} />
              </label>
              <label>File/Cloud Link (URL)
                <input type="url" value={formVal.link || ""} onChange={(e) => setVal("link", e.target.value)} placeholder="e.g. Google Drive link, Ather dashboard link" />
              </label>
              <label className="wide">Notes / Registration Details
                <input value={formVal.notes || ""} onChange={(e) => setVal("notes", e.target.value)} placeholder="e.g. Policy number: D0904181..." />
              </label>
            </>
          )}

          <div className="form-actions wide cluster" style={{ justifyContent: "flex-end", borderTop: "1px solid var(--line)", paddingTop: "1rem", marginTop: "1rem", gap: "0.5rem" }}>
            <button className="secondary tactile" type="button" onClick={close}>Cancel</button>
            <button className="primary tactile" type="submit">Save</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==========================================
// SHARED PROJECT WORKSPACE (EXPENSE ROOM)
// ==========================================

function SkeletonLoader({ type = "list" }) {
  if (type === "dashboard") {
    return (
      <div className="skeleton-grid">
        <div className="skeleton-card shimmer"></div>
        <div className="skeleton-card shimmer"></div>
        <div className="skeleton-card shimmer"></div>
      </div>
    );
  }
  return (
    <div className="skeleton-list">
      <div className="skeleton-item shimmer"></div>
      <div className="skeleton-item shimmer"></div>
      <div className="skeleton-item shimmer"></div>
    </div>
  );
}

export function SharedProjectWorkspace({ projectId, setToast, globalTheme }) {
  const installPrompt = useInstallPrompt();
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    setIsStandalone(window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true);
  }, []);

  const [loadingMetadata, setLoadingMetadata] = useState(true);
  const [projectMetadata, setProjectMetadata] = useState(null);
  const [sharingDisabled, setSharingDisabled] = useState(false);
  const [projectError, setProjectError] = useState("");
  const [viewingImage, setViewingImage] = useState(null);

  const [joined, setJoined] = useState(() => {
    const isJoined = localStorage.getItem(`lifepilot.project.${projectId}.joined`) === "true";
    const loginTime = localStorage.getItem(`lifepilot.project.${projectId}.loginTime`);
    if (isJoined && loginTime) {
      const elapsed = Date.now() - Number(loginTime);
      if (elapsed < 12 * 60 * 60 * 1000) { // 12 hours
        return true;
      }
    }
    // Clean up if expired
    localStorage.removeItem(`lifepilot.project.${projectId}.joined`);
    localStorage.removeItem(`lifepilot.project.${projectId}.name`);
    localStorage.removeItem(`lifepilot.project.${projectId}.loginTime`);
    return false;
  });

  const [displayName, setDisplayName] = useState(() => {
    const isJoined = localStorage.getItem(`lifepilot.project.${projectId}.joined`) === "true";
    const loginTime = localStorage.getItem(`lifepilot.project.${projectId}.loginTime`);
    if (isJoined && loginTime) {
      const elapsed = Date.now() - Number(loginTime);
      if (elapsed < 12 * 60 * 60 * 1000) {
        return localStorage.getItem(`lifepilot.project.${projectId}.name`) || "";
      }
    }
    return "";
  });

  const [enteredPin, setEnteredPin] = useState(""); // empty by default
  const [enteredName, setEnteredName] = useState("");
  const [wrongPinAttempts, setWrongPinAttempts] = useState(0);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [authError, setAuthError] = useState("");

  const [roomParticipants, setRoomParticipants] = useState([]);
  const [showConfirmJoin, setShowConfirmJoin] = useState(false);
  const [showCustomNameInput, setShowCustomNameInput] = useState(false);
  const [joiningRoom, setJoiningRoom] = useState(false);

  // Supabase Room states
  const [project, setProject] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [messages, setMessages] = useState([]);
  const [activities, setActivities] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loadingData, setLoadingData] = useState(false);

  // Workspace navigation
  const [activeTab, setActiveTab] = useState("dashboard");
  const [dashboardFilter, setDashboardFilter] = useState("All");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [participantFilter, setParticipantFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");

  // Add Form Modals
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [showAddDoc, setShowAddDoc] = useState(false);
  const [editDoc, setEditDoc] = useState(null);

  // Loading indicator states
  const [savingExpense, setSavingExpense] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const [sharingDoc, setSharingDoc] = useState(false);

  // Welcome message banner
  const [welcomeMessage, setWelcomeMessage] = useState(null);

  // Confirm Dialog state
  const [confirmDialog, setConfirmDialog] = useState(null);

  // Chat state
  const [chatText, setChatText] = useState("");
  const chatEndRef = useRef(null);

  // Room settlement UI states
  const [customSettlementKey, setCustomSettlementKey] = useState("");
  const [customAmount, setCustomAmount] = useState("");
  const [expandedExpenses, setExpandedExpenses] = useState({});
  const settlementKey = (item) => `${item.from}__${item.to}`;

  const [uploadingExpenseImage, setUploadingExpenseImage] = useState(false);
  const [activeSettlementModal, setActiveSettlementModal] = useState(null);
  const [settlementMethod, setSettlementMethod] = useState("UPI");
  const [settlementImage, setSettlementImage] = useState("");
  const [uploadingSettlementImage, setUploadingSettlementImage] = useState(false);
  const [settlementWarningShown, setSettlementWarningShown] = useState(false);
  const [logSearchQuery, setLogSearchQuery] = useState("");
  const [replacingImageIndex, setReplacingImageIndex] = useState(null);

  // Local forms state
  const [expForm, setExpForm] = useState({
    title: "",
    amount: "",
    category: "Food",
    date: todayISO(),
    time: nowTime(),
    paidBy: "",
    splitMode: "No split",
    participants: [],
    owedBy: "",
    paymentMethod: "UPI",
    notes: "",
    imageUrls: []
  });

  const [taskForm, setTaskForm] = useState({
    title: "",
    dueDate: todayISO(),
    dueTime: "",
    priority: "Medium",
    notes: ""
  });

  const [docForm, setDocForm] = useState({
    title: "",
    url: ""
  });

  // Lockout check key
  const lockoutKey = `lifepilot.lockout.${projectId}`;

  // Check metadata and participants initially
  useEffect(() => {
    if (!projectId) return;
    setLoadingMetadata(true);
    Promise.all([
      getCloudProject(projectId),
      getCloudParticipants(projectId)
    ])
      .then(([data, parts]) => {
        setProjectMetadata(data);
        setRoomParticipants(parts || []);
        if (data && !data.sharing_enabled) {
          setSharingDisabled(true);
        }
      })
      .catch((err) => {
        console.error(err);
        setProjectError("Shared room does not exist, or connection failed.");
      })
      .finally(() => {
        setLoadingMetadata(false);
      });
  }, [projectId]);

  // Check lockout cooldown on load
  useEffect(() => {
    const lockoutTime = Number(localStorage.getItem(lockoutKey) || 0);
    if (lockoutTime > Date.now()) {
      const diff = Math.ceil((lockoutTime - Date.now()) / 1000);
      setCooldownRemaining(diff);

      const timer = setInterval(() => {
        const currentLock = Number(localStorage.getItem(lockoutKey) || 0);
        if (currentLock <= Date.now()) {
          setCooldownRemaining(0);
          clearInterval(timer);
        } else {
          setCooldownRemaining(Math.ceil((currentLock - Date.now()) / 1000));
        }
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [projectId]);

  // Fetch project data once authenticated
  const fetchAllRoomData = async () => {
    if (!projectId) return;
    setLoadingData(true);
    try {
      const [pData, expData, partData, msgData, actData, taskData, docData] = await Promise.all([
        getCloudProject(projectId),
        getCloudExpenses(projectId),
        getCloudParticipants(projectId),
        getCloudMessages(projectId),
        getCloudActivities(projectId),
        getCloudTasks(projectId),
        getCloudDocuments(projectId)
      ]);
      setProject(pData);
      setExpenses(expData);
      setParticipants(partData);
      setMessages(msgData);
      setActivities(actData);
      setTasks(taskData);
      setDocuments(docData);
    } catch (err) {
      console.error("Failed to load room data", err);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (joined) {
      fetchAllRoomData();
    }
  }, [joined, projectId]);

  // Realtime Subscriptions
  useEffect(() => {
    if (!projectId || !joined || !supabase) return;

    const channel = supabase
      .channel(`room:${projectId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "cloud_projects", filter: `id=eq.${projectId}` }, (payload) => {
        if (payload.eventType === "DELETE") {
          setToast("This project has been closed/deleted by the owner.");
          handleLeave();
        } else {
          setProject(payload.new);
          if (!payload.new.sharing_enabled) {
            setToast("Sharing has been disabled by the owner.");
            handleLeave();
          }
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "cloud_participants", filter: `project_id=eq.${projectId}` }, (payload) => {
        if (payload.eventType === "INSERT") {
          setParticipants(prev => {
            if (prev.find(p => p.id === payload.new.id)) return prev;
            return [...prev, payload.new];
          });
        } else if (payload.eventType === "UPDATE") {
          setParticipants(prev => prev.map(p => p.id === payload.new.id ? payload.new : p));
        } else if (payload.eventType === "DELETE") {
          setParticipants(prev => prev.filter(p => p.id !== payload.old.id));
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "cloud_expenses", filter: `project_id=eq.${projectId}` }, (payload) => {
        if (payload.eventType === "INSERT") {
          setExpenses(prev => {
            if (prev.find(e => e.id === payload.new.id)) return prev;
            return [payload.new, ...prev];
          });
        } else if (payload.eventType === "UPDATE") {
          setExpenses(prev => prev.map(e => e.id === payload.new.id ? payload.new : e));
        } else if (payload.eventType === "DELETE") {
          setExpenses(prev => prev.filter(e => e.id !== payload.old.id));
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "cloud_messages", filter: `project_id=eq.${projectId}` }, (payload) => {
        if (payload.eventType === "INSERT") {
          setMessages(prev => {
            if (prev.find(m => m.id === payload.new.id)) return prev;
            return [...prev, payload.new];
          });
        } else if (payload.eventType === "UPDATE") {
          setMessages(prev => prev.map(m => m.id === payload.new.id ? payload.new : m));
        } else if (payload.eventType === "DELETE") {
          setMessages(prev => prev.filter(m => m.id !== payload.old.id));
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "cloud_activities", filter: `project_id=eq.${projectId}` }, (payload) => {
        if (payload.eventType === "INSERT") {
          setActivities(prev => {
            if (prev.find(a => a.id === payload.new.id)) return prev;
            return [payload.new, ...prev];
          });
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "cloud_tasks", filter: `project_id=eq.${projectId}` }, (payload) => {
        if (payload.eventType === "INSERT") {
          setTasks(prev => {
            if (prev.find(t => t.id === payload.new.id)) return prev;
            return [...prev, payload.new];
          });
        } else if (payload.eventType === "UPDATE") {
          setTasks(prev => prev.map(t => t.id === payload.new.id ? payload.new : t));
        } else if (payload.eventType === "DELETE") {
          setTasks(prev => prev.filter(t => t.id !== payload.old.id));
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "cloud_documents", filter: `project_id=eq.${projectId}` }, (payload) => {
        if (payload.eventType === "INSERT") {
          setDocuments(prev => {
            if (prev.find(d => d.id === payload.new.id)) return prev;
            return [payload.new, ...prev];
          });
        } else if (payload.eventType === "UPDATE") {
          setDocuments(prev => prev.map(d => d.id === payload.new.id ? payload.new : d));
        } else if (payload.eventType === "DELETE") {
          setDocuments(prev => prev.filter(d => d.id !== payload.old.id));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId, joined]);

  // Auto Scroll chat box
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeTab]);

  // Pre-join form submit (validation -> confirm dialog)
  const handlePreJoin = (e) => {
    e.preventDefault();
    setAuthError("");

    const currentLock = Number(localStorage.getItem(lockoutKey) || 0);
    if (currentLock > Date.now()) {
      setAuthError(`Too many incorrect attempts. Try again later.`);
      return;
    }

    if (!enteredName.trim()) {
      setAuthError("Please select or enter your name.");
      return;
    }
    if (!enteredPin.trim()) {
      setAuthError("PIN is required.");
      return;
    }
    
    setShowConfirmJoin(true);
  };

  // Authentication Flow (Join Room)
  const handleJoin = async () => {
    setShowConfirmJoin(false);
    setJoiningRoom(true);
    setAuthError("");

    // Check brute force
    const currentLock = Number(localStorage.getItem(lockoutKey) || 0);
    if (currentLock > Date.now()) {
      setAuthError(`Too many incorrect attempts. Try again later.`);
      setJoiningRoom(false);
      return;
    }

    try {
      // Fetch and verify PIN
      const prj = await getCloudProjectWithPIN(projectId, enteredPin.trim());
      
      if (!prj.sharing_enabled) {
        setAuthError("Sharing for this project has been disabled by the owner.");
        return;
      }

      const cleanName = enteredName.trim();
      
      // Add participant in DB if not already present
      await addCloudParticipant(projectId, cleanName, "participant");
      
      // Log join activity
      await addCloudActivity(projectId, "join", `${cleanName} joined the project room`, cleanName);

      // Store session for 12 hours
      localStorage.setItem(`lifepilot.project.${projectId}.joined`, "true");
      localStorage.setItem(`lifepilot.project.${projectId}.name`, cleanName);
      localStorage.setItem(`lifepilot.project.${projectId}.loginTime`, String(Date.now()));

      setDisplayName(cleanName);
      setJoined(true);
      setWelcomeMessage(`👋 Welcome, ${cleanName}! You've joined the room.`);
      setToast(`Joined project space!`);
    } catch (err) {
      console.error(err);
      const nextAttempts = wrongPinAttempts + 1;
      setWrongPinAttempts(nextAttempts);
      
      if (nextAttempts >= 3) {
        const cooldownTime = Date.now() + 30 * 1000; // 30 sec block
        localStorage.setItem(lockoutKey, String(cooldownTime));
        setCooldownRemaining(30);
        setWrongPinAttempts(0);
        setAuthError("Too many wrong attempts. Locked out for 30 seconds.");

        const timer = setInterval(() => {
          const currentLock = Number(localStorage.getItem(lockoutKey) || 0);
          if (currentLock <= Date.now()) {
            setCooldownRemaining(0);
            clearInterval(timer);
          } else {
            setCooldownRemaining(Math.ceil((currentLock - Date.now()) / 1000));
          }
        }, 1000);
      } else {
        setAuthError("Incorrect PIN. Please try again.");
      }
    } finally {
      setJoiningRoom(false);
    }
  };

  const handleLeave = () => {
    sessionStorage.removeItem(`lifepilot.project.${projectId}.joined`);
    sessionStorage.removeItem(`lifepilot.project.${projectId}.name`);
    localStorage.removeItem(`lifepilot.project.${projectId}.joined`);
    localStorage.removeItem(`lifepilot.project.${projectId}.name`);
    localStorage.removeItem(`lifepilot.project.${projectId}.loginTime`);
    setJoined(false);
    setDisplayName("");
    setProject(null);
  };

  const handleMarkSettlementPaid = (settlementItem, paidAmt, type = "Full", existingSettlementId = null) => {
    const safeAmount = Math.max(Number(paidAmt), 0);
    if (safeAmount <= 0) return;
    
    const openModal = () => {
      // Reset modal states
      setSettlementMethod("UPI");
      setSettlementImage("");
      setUploadingSettlementImage(false);
      setSettlementWarningShown(false);
      
      setActiveSettlementModal({
        settlementItem,
        paidAmt: safeAmount,
        type,
        existingSettlementId
      });
    };

    let isOwner = false;
    if (settlementItem.from === displayName || settlementItem.to === displayName) {
      isOwner = true;
    } else if (settlementItem.expenseId) {
      const parentExpense = expenses.find(e => String(e.id) === String(settlementItem.expenseId));
      if (parentExpense && (parentExpense.created_by === displayName || parentExpense.paid_by === displayName)) {
        isOwner = true;
      }
    }

    if (!isOwner) {
      setConfirmDialog({
        title: "Warning: Not Your Settlement",
        message: `This settlement belongs to ${settlementItem.from} and ${settlementItem.to}. Are you sure you want to mark it as paid?`,
        confirmLabel: "Skip & Continue",
        tone: "danger",
        onConfirm: openModal
      });
    } else {
      openModal();
    }
  };

  const executeSaveSettlement = async (settlementItem, paidAmt, type, existingSettlementId, paymentMethod, imageUrl, skipProof) => {
    const safeAmount = Number(paidAmt);
    try {
      let baseNotes = settlementItem.expenseId 
        ? `Settlement for expense ID: ${settlementItem.expenseId}` 
        : `Settlement payment from ${settlementItem.from} to ${settlementItem.to}`;

      let notesStr = baseNotes;
      if (paymentMethod === "UPI") {
        if (imageUrl) {
          notesStr = `${baseNotes}\n\n[Attachment: ${imageUrl}]`.trim();
        } else if (skipProof) {
          notesStr = `${baseNotes}\n\n[No payment proof provided]`.trim();
        }
      }

      if (existingSettlementId) {
        const existing = expenses.find(e => e.id === existingSettlementId);
        if (existing) {
          const targetExpenseId = settlementItem.expenseId || parseSettlementExpenseId(existing.notes);
          
          let updatedNotes = targetExpenseId && targetExpenseId !== "undefined" 
            ? `Settlement for expense ID: ${targetExpenseId}` 
            : `Settlement payment from ${settlementItem.from} to ${settlementItem.to}`;

          if (paymentMethod === "UPI") {
            if (imageUrl) {
              updatedNotes = `${updatedNotes}\n\n[Attachment: ${imageUrl}]`.trim();
            } else if (skipProof) {
              updatedNotes = `${updatedNotes}\n\n[No payment proof provided]`.trim();
            }
          }

          const updated = {
            ...existing,
            amount: safeAmount,
            payment_method: paymentMethod,
            notes: updatedNotes
          };
          setExpenses(prev => prev.map(e => e.id === existingSettlementId ? updated : e));
          
          await upsertCloudExpense(updated);
          await addCloudActivity(
            projectId,
            "edit_settlement",
            `${displayName} updated settlement payment from ${settlementItem.from} to ${settlementItem.to} to ₹${safeAmount} (${paymentMethod})`,
            displayName
          );
          setToast("Settlement payment updated!");
        }
      } else {
        const settlementId = "settlement-" + Math.random().toString(36).substring(2, 11);
        const newSettlement = {
          id: settlementId,
          project_id: projectId,
          title: `Settlement: ${settlementItem.from} paid ${settlementItem.to}`,
          amount: safeAmount,
          category: "Settlement",
          date: todayISO(),
          time: nowTime(),
          paid_by: settlementItem.from,
          owed_by: settlementItem.to,
          participants: [],
          payment_method: paymentMethod,
          notes: notesStr,
          created_by: displayName,
          created_at: new Date().toISOString()
        };

        setExpenses(prev => [newSettlement, ...prev]);

        await upsertCloudExpense(newSettlement);
        await addCloudActivity(
          projectId,
          "add_settlement",
          `${displayName} marked settlement of ₹${safeAmount} from ${settlementItem.from} to ${settlementItem.to} as paid (${paymentMethod})`,
          displayName
        );

        setToast("Settlement recorded!");
      }
      setCustomSettlementKey("");
      setCustomAmount("");
    } catch (err) {
      console.error(err);
      setToast("Failed to record settlement.");
      getCloudExpenses(projectId).then(setExpenses).catch(console.error);
    } finally {
      setActiveSettlementModal(null);
    }
  };

  const handleDeleteSettlementInline = async (settlement) => {
    setExpenses(prev => prev.filter(e => e.id !== settlement.id));
    try {
      await deleteCloudExpense(settlement.id);
      await addCloudActivity(
        projectId,
        "delete_settlement",
        `${displayName} deleted settlement payment of ₹${settlement.amount} from ${settlement.from} to ${settlement.to}`,
        displayName
      );
      setToast("Settlement payment deleted.");
    } catch (err) {
      console.error(err);
      setToast("Failed to delete settlement payment.");
      getCloudExpenses(projectId).then(setExpenses).catch(console.error);
    }
  };

  const handleDeleteSettlement = async (settlement) => {
    setConfirmDialog({
      title: "Delete Settlement Payment?",
      message: `${settlement.from} paid ${rupee.format(settlement.amount)} to ${settlement.to}. Deleting this will add the amount back to pending owes.`,
      confirmLabel: "Delete Payment",
      tone: "danger",
      onConfirm: async () => {
        try {
          await deleteCloudExpense(settlement.id);
          await addCloudActivity(
            projectId,
            "delete_settlement",
            `${displayName} deleted settlement payment of ₹${settlement.amount} from ${settlement.from} to ${settlement.to}`,
            displayName
          );
          setToast("Settlement deleted.");
        } catch (err) {
          console.error(err);
          setToast("Failed to delete settlement.");
        }
      }
    });
  };

  const handleImagesSelected = async (files) => {
    if (!files || files.length === 0) return;
    const currentCount = expForm.imageUrls ? expForm.imageUrls.length : 0;
    const incomingCount = files.length;
    if (currentCount + incomingCount > 5) {
      setToast("Maximum 5 images allowed per expense.");
      return;
    }

    setUploadingExpenseImage(true);
    const uploadedUrls = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const compressedBase64 = await compressImage(file, 600, 600, 0.5);
        let finalUrl = "";
        try {
          const blob = base64ToBlob(compressedBase64, "image/jpeg");
          const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", { type: "image/jpeg" });
          finalUrl = await uploadImageToSupabase(compressedFile);
        } catch (uploadErr) {
          console.warn("Supabase upload failed, falling back to base64", uploadErr);
          finalUrl = compressedBase64;
        }
        uploadedUrls.push(finalUrl);
      } catch (err) {
        console.error("Failed to process file:", file.name, err);
        setToast(`Error processing ${file.name}`);
      }
    }

    if (uploadedUrls.length > 0) {
      setExpForm(prev => ({
        ...prev,
        imageUrls: [...(prev.imageUrls || []), ...uploadedUrls]
      }));
      setToast(`Successfully attached ${uploadedUrls.length} image(s)!`);
    }
    setUploadingExpenseImage(false);
  };

  const handleImageReplace = async (file) => {
    if (!file || replacingImageIndex === null) return;
    setUploadingExpenseImage(true);
    try {
      const compressedBase64 = await compressImage(file, 600, 600, 0.5);
      let finalUrl = "";
      try {
        const blob = base64ToBlob(compressedBase64, "image/jpeg");
        const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", { type: "image/jpeg" });
        finalUrl = await uploadImageToSupabase(compressedFile);
      } catch (uploadErr) {
        console.warn("Supabase upload failed, falling back to base64", uploadErr);
        finalUrl = compressedBase64;
      }

      setExpForm(prev => {
        const nextUrls = [...(prev.imageUrls || [])];
        if (replacingImageIndex >= 0 && replacingImageIndex < nextUrls.length) {
          nextUrls[replacingImageIndex] = finalUrl;
        }
        return {
          ...prev,
          imageUrls: nextUrls
        };
      });
      setToast("Image replaced successfully!");
    } catch (err) {
      console.error("Failed to replace image:", err);
      setToast("Error replacing image.");
    } finally {
      setUploadingExpenseImage(false);
      setReplacingImageIndex(null);
    }
  };

  // Add transactions
  const handleAddExpenseSubmit = async (e) => {
    e.preventDefault();
    if (!expForm.title.trim() || Number(expForm.amount) <= 0) {
      setToast("Title and amount are required.");
      return;
    }
    if (expForm.splitMode === "Equal split" && (!expForm.participants || expForm.participants.length === 0)) {
      setToast("Please select participants for Equal split.");
      return;
    }
    if (expForm.splitMode === "Direct owed" && !expForm.owedBy) {
      setToast("Please select who owes the money for Direct owed.");
      return;
    }

    setSavingExpense(true);
    const isEdit = !!expForm.id;
    const expenseId = expForm.id || "projectTransaction-" + Math.random().toString(36).substring(2, 11);
    const finalPaidBy = expForm.paidBy || displayName;
    let notesStr = expForm.notes.trim();
    if (expForm.imageUrls && expForm.imageUrls.length > 0) {
      const attachmentsStr = expForm.imageUrls.map(url => `[Attachment: ${url}]`).join("\n");
      notesStr = `${notesStr}\n\n${attachmentsStr}`.trim();
    }
    const newExpense = {
      id: expenseId,
      project_id: projectId,
      title: expForm.title.trim(),
      amount: Number(expForm.amount),
      category: expForm.category,
      date: expForm.date,
      time: expForm.time || "",
      paid_by: finalPaidBy,
      owed_by: expForm.splitMode === "Direct owed" ? expForm.owedBy : "",
      participants: expForm.splitMode === "Equal split" ? expForm.participants : [],
      payment_method: expForm.paymentMethod || "UPI",
      notes: notesStr,
      created_by: expForm.created_by || displayName,
      created_at: expForm.created_at || new Date().toISOString()
    };

    // Optimistically update the UI immediately
    if (isEdit) {
      setExpenses(prev => prev.map(item => item.id === expenseId ? newExpense : item));
    } else {
      setExpenses(prev => [newExpense, ...prev]);
    }
    setShowAddExpense(false);

    try {
      await upsertCloudExpense(newExpense);
      
      const isOwner = !isEdit || expForm.created_by === displayName || expForm.paidBy === displayName;
      const activityAction = isEdit ? (isOwner ? "edit_expense" : "edit_expense_override") : "add_expense";
      const activityText = isEdit 
        ? (isOwner 
            ? `${displayName} edited expense "${expForm.title}" (amount: ₹${expForm.amount})`
            : `${displayName} edited ${expForm.created_by || expForm.paidBy}'s expense "${expForm.title}"`)
        : `${displayName} added expense "${expForm.title}" of ₹${expForm.amount}`;
        
      await addCloudActivity(
        projectId,
        activityAction,
        activityText,
        displayName
      );

      // Budget warning check
      const totalSpentNow = expenses.reduce((sum, item) => {
        if (isEdit && item.id === expenseId) return sum;
        return sum + Number(item.amount);
      }, 0) + Number(expForm.amount);
      
      if (project?.budget > 0) {
        const pct = (totalSpentNow / project.budget) * 100;
        const thresholdAlert = [100, 90, 80, 70].find(t => pct >= t && ((totalSpentNow - Number(expForm.amount)) / project.budget) * 100 < t);
        if (thresholdAlert) {
          await addCloudActivity(
            projectId,
            "budget_alert",
            `⚠️ Project budget has crossed ${thresholdAlert}% usage! (${rupee.format(totalSpentNow)} of ${rupee.format(project.budget)})`,
            "System"
          );
        }
      }

      setToast(isEdit ? "Expense updated!" : "Expense added!");
      setExpForm({
        title: "",
        amount: "",
        category: "Food",
        date: todayISO(),
        time: nowTime(),
        paidBy: displayName,
        splitMode: "No split",
        participants: [],
        paymentMethod: "UPI",
        notes: "",
        imageUrls: []
      });
    } catch (err) {
      setToast("Failed to add expense: " + err.message);
      // Re-fetch latest from database on failure
      getCloudExpenses(projectId).then(setExpenses).catch(console.error);
    } finally {
      setSavingExpense(false);
    }
  };

  const handleAddDocSubmit = async (e) => {
    e.preventDefault();
    if (!docForm.title.trim() || !docForm.url.trim()) {
      setToast("Title and URL are required.");
      return;
    }
    setSharingDoc(true);
    const isEdit = !!editDoc;
    const docId = isEdit ? editDoc.id : generateUUID();
    const newDoc = {
      id: docId,
      project_id: projectId,
      title: docForm.title.trim(),
      url: docForm.url.trim(),
      created_by: isEdit ? editDoc.created_by : displayName,
      created_at: isEdit ? editDoc.created_at : new Date().toISOString()
    };

    // Optimistic update
    if (isEdit) {
      setDocuments(prev => prev.map(d => d.id === docId ? newDoc : d));
    } else {
      setDocuments(prev => [...prev, newDoc]);
    }
    setShowAddDoc(false);
    setEditDoc(null);

    try {
      if (isEdit) {
        await updateCloudDocument(docId, docForm.title.trim(), docForm.url.trim());
      } else {
        await addCloudDocument(projectId, docForm.title.trim(), docForm.url.trim(), displayName, docId);
      }
      await addCloudActivity(
        projectId,
        isEdit ? "edit_doc" : "add_doc",
        `${displayName} ${isEdit ? "edited" : "shared"} drive document "${docForm.title.trim()}"`,
        displayName
      );
      setToast(isEdit ? "Document updated!" : "Document shared!");
      setDocForm({ title: "", url: "" });
    } catch (err) {
      setToast("Failed to share document: " + err.message);
      getCloudDocuments(projectId).then(setDocuments).catch(console.error);
    } finally {
      setSharingDoc(false);
    }
  };

  const handleAddTaskSubmit = async (e) => {
    e.preventDefault();
    if (!taskForm.title.trim() || !taskForm.dueDate) {
      setToast("Title and due date are required.");
      return;
    }
    setSavingTask(true);
    const isEdit = !!editTask;
    const taskId = isEdit ? editTask.id : "task-" + Math.random().toString(36).substring(2, 11);
    const newTask = {
      id: taskId,
      project_id: projectId,
      title: taskForm.title.trim(),
      due_date: taskForm.dueDate,
      due_time: taskForm.dueTime || "",
      status: isEdit ? editTask.status : "Pending",
      priority: taskForm.priority,
      notes: taskForm.notes || "",
      created_by: isEdit ? editTask.created_by : displayName,
      created_at: isEdit ? editTask.created_at : new Date().toISOString()
    };

    // Optimistic update
    if (isEdit) {
      setTasks(prev => prev.map(t => t.id === taskId ? newTask : t));
    } else {
      setTasks(prev => [...prev, newTask]);
    }
    setShowAddTask(false);
    setEditTask(null);

    try {
      await upsertCloudTask(newTask);
      await addCloudActivity(
        projectId,
        isEdit ? "edit_task" : "add_task",
        `${displayName} ${isEdit ? "edited" : "added"} task reminder: "${taskForm.title.trim()}"`,
        displayName
      );
      setToast(isEdit ? "Reminder task updated!" : "Reminder task added!");
      setTaskForm({ title: "", dueDate: todayISO(), dueTime: "", priority: "Medium", notes: "" });
    } catch (err) {
      setToast("Failed to add task: " + err.message);
      getCloudTasks(projectId).then(setTasks).catch(console.error);
    } finally {
      setSavingTask(false);
    }
  };

  const handleSendChat = async (e) => {
    e.preventDefault();
    if (!chatText.trim()) return;
    try {
      await addCloudMessage(projectId, displayName, chatText.trim());
      setChatText("");
    } catch (err) {
      setToast("Failed to send: " + err.message);
    }
  };

  const handleToggleTask = async (taskItem) => {
    const nextStatus = taskItem.status === "Completed" ? "Pending" : "Completed";
    const updatedTask = { ...taskItem, status: nextStatus };

    // Optimistic update
    setTasks(prev => prev.map(t => t.id === taskItem.id ? updatedTask : t));

    try {
      await upsertCloudTask(updatedTask);
      await addCloudActivity(
        projectId,
        "toggle_task",
        `${displayName} marked task "${taskItem.title}" as ${nextStatus.toLowerCase()}`,
        displayName
      );
      setToast(`Task marked as ${nextStatus}`);
    } catch (err) {
      setToast("Failed to update task: " + err.message);
      getCloudTasks(projectId).then(setTasks).catch(console.error);
    }
  };

  const handleDeleteTask = async (taskId, taskTitle) => {
    // Optimistic delete
    setTasks(prev => prev.filter(t => t.id !== taskId));
    try {
      await deleteCloudTask(taskId);
      await addCloudActivity(
        projectId,
        "delete_task",
        `${displayName} deleted task "${taskTitle}"`,
        displayName
      );
      setToast("Task deleted");
    } catch (err) {
      setToast("Failed to delete task: " + err.message);
      getCloudTasks(projectId).then(setTasks).catch(console.error);
    }
  };

  const handleDeleteDoc = async (docId, docTitle) => {
    // Optimistic delete
    setDocuments(prev => prev.filter(d => d.id !== docId));
    try {
      await deleteCloudDocument(docId);
      await addCloudActivity(
        projectId,
        "delete_doc",
        `${displayName} deleted document link "${docTitle}"`,
        displayName
      );
      setToast("Document link deleted");
    } catch (err) {
      setToast("Failed to delete document: " + err.message);
      getCloudDocuments(projectId).then(setDocuments).catch(console.error);
    }
  };

  const handleEditExpenseClick = (item) => {
    let mode = "No split";
    if (item.owed_by) mode = "Direct owed";
    else if (item.participants && item.participants.length > 0) mode = "Equal split";
    
    const { cleanNotes, urls } = extractAttachmentUrls(item.notes || "");

    const openEditModal = () => {
      setExpForm({
        id: item.id,
        title: item.title,
        amount: String(item.amount),
        category: item.category,
        date: item.date,
        time: item.time || "",
        paidBy: item.paid_by,
        splitMode: mode,
        participants: item.participants || [],
        owedBy: item.owed_by || "",
        paymentMethod: item.payment_method || "UPI",
        notes: cleanNotes,
        imageUrls: urls || [],
        created_by: item.created_by,
        created_at: item.created_at
      });
      setShowAddExpense(true);
    };

    const isOwner = item.created_by === displayName || item.paid_by === displayName;
    if (!isOwner) {
      setConfirmDialog({
        title: "Warning: Edit Other's Expense?",
        message: `This expense was added by ${item.paid_by || item.created_by}. Are you sure you want to edit it?`,
        confirmLabel: "Confirm & Edit",
        tone: "danger",
        onConfirm: openEditModal
      });
    } else {
      openEditModal();
    }
  };

  const handleDeleteExpense = async (expId, expTitle) => {
    const expenseToDelete = expenses.find(e => e.id === expId);
    const isOwner = !expenseToDelete || expenseToDelete.created_by === displayName || expenseToDelete.paid_by === displayName;
    
    const performDelete = async () => {
      // Get list of linked settlements to delete
      const linkedSettlements = expenses.filter(e => {
        if (e.category === "Settlement") {
          const linkedId = parseSettlementExpenseId(e.notes);
          return linkedId === expId;
        }
        return false;
      });

      // Optimistic delete of parent expense and all linked settlements
      setExpenses(prev => prev.filter(e => {
        if (e.id === expId) return false;
        if (e.category === "Settlement") {
          const linkedId = parseSettlementExpenseId(e.notes);
          if (linkedId === expId) return false;
        }
        return true;
      }));

      try {
        await deleteCloudExpense(expId);
        for (const s of linkedSettlements) {
          await deleteCloudExpense(s.id).catch(console.error);
        }
        await addCloudActivity(
          projectId,
          isOwner ? "delete_expense" : "delete_expense_override",
          isOwner 
            ? `${displayName} deleted expense "${expTitle}"`
            : `${displayName} deleted ${expenseToDelete.paid_by || expenseToDelete.created_by}'s expense "${expTitle}"`,
          displayName
        );
        setToast("Expense deleted");
      } catch (err) {
        setToast("Failed to delete: " + err.message);
        getCloudExpenses(projectId).then(setExpenses).catch(console.error);
      }
    };

    if (!isOwner) {
      setConfirmDialog({
        title: "Warning: Delete Other's Expense?",
        message: `This expense was added by ${expenseToDelete.paid_by || expenseToDelete.created_by}. Are you sure you want to delete it? This might affect their splits and pending balances.`,
        confirmLabel: "Confirm & Delete",
        tone: "danger",
        onConfirm: performDelete
      });
    } else {
      setConfirmDialog({
        title: "Delete Expense?",
        message: `Are you sure you want to delete "${expTitle}"? This might affect the splits and pending balances.`,
        confirmLabel: "Delete",
        tone: "danger",
        onConfirm: performDelete
      });
    }
  };

  // --- Calculations for UI ---
  // Separate out Settlements from normal expenses
  const normalExpenses = expenses.filter(e => e.category !== "Settlement");
  const settlementExpenses = expenses.filter(e => e.category === "Settlement");

  const totalSpent = normalExpenses.reduce((sum, item) => sum + Number(item.amount), 0);
  const budgetVal = project?.budget || 0;
  const remainingBudget = budgetVal - totalSpent;
  const isOverspent = totalSpent > budgetVal;
  const overspentAmt = totalSpent - budgetVal;
  const usagePercentage = budgetVal > 0 ? Math.min((totalSpent / budgetVal) * 100, 100) : 0;

  // Filtered expenses
  const filteredExpenses = normalExpenses
    .filter(item => categoryFilter === "All" || item.category === categoryFilter)
    .filter(item => participantFilter === "All" || item.paid_by === participantFilter)
    .filter(item => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        item.title.toLowerCase().includes(q) ||
        (item.notes || "").toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.paid_by.toLowerCase().includes(q)
      );
    });

  // Participant list mapping
  const participantNamesList = participants.map(p => p.name);

  // Calculate project split summary dynamically
  const mappedExpensesForSplit = normalExpenses.map(e => ({
    ...e,
    paidBy: e.paid_by,
    type: "Debit",
    splitMode: e.owed_by ? "Direct owed" : (e.participants && e.participants.length > 0 ? "Equal split" : "No split"),
    participants: e.participants || [],
    owedBy: e.owed_by || ""
  }));
  const mappedProjectForSplit = {
    participants: participantNamesList,
    paidSettlements: settlementExpenses.map(e => {
      const parsedId = parseSettlementExpenseId(e.notes);
      return {
        id: e.id,
        from: e.paid_by,
        to: e.owed_by,
        amount: Number(e.amount),
        paidAt: e.created_at,
        expenseId: parsedId === "undefined" ? null : parsedId,
        notes: e.notes || ""
      };
    })
  };
  const splitSummary = projectSplitSummary(mappedProjectForSplit, mappedExpensesForSplit);

  // Categories list
  const categoriesOptions = ["Food", "Travel", "Bills", "Health", "Shopping", "Entertainment", "Custom"];

  // Spending by participant for Analytics
  const participantSpendSummary = participants.map(p => {
    const spent = normalExpenses
      .filter(e => e.paid_by === p.name)
      .reduce((sum, e) => sum + Number(e.amount), 0);
    return { name: p.name, spent };
  });

  // Category-wise totals
  const categorySpendSummary = categoriesOptions.map(cat => {
    const spent = expenses
      .filter(e => e.category === cat)
      .reduce((sum, e) => sum + Number(e.amount), 0);
    return { name: cat, spent };
  }).filter(c => c.spent > 0);

  // LOADING METADATA VIEW
  if (loadingMetadata) {
    return (
      <div className="cloud-landing-container">
        <div className="cloud-landing-card">
          <SkeletonLoader type="list" />
          <p>Locating Shared Project Space...</p>
        </div>
      </div>
    );
  }

  // ERROR VIEW
  if (projectError) {
    return (
      <div className="cloud-landing-container">
        <div className="cloud-landing-card">
          <SectionHeader title="Access Denied" />
          <p className="validation">{projectError}</p>
          <button className="primary tactile" onClick={() => window.location.replace("/")}>Go to LifePilot App</button>
        </div>
      </div>
    );
  }

  // SHARING DISABLED VIEW
  if (sharingDisabled && !joined) {
    return (
      <div className="cloud-landing-container">
        <div className="cloud-landing-card">
          <SectionHeader title="Sharing Disabled" />
          <p className="warning">The owner has disabled sharing for this room. If you are already a member, please contact the owner to enable access.</p>
          <button className="primary tactile" onClick={() => window.location.replace("/")}>Go to LifePilot App</button>
        </div>
      </div>
    );
  }

  // JOIN GATE SCREEN
  if (!joined) {
    return (
      <div className="cloud-landing-container">
        <div className="cloud-landing-card">
          <div className="brand" style={{ justifyContent: "center", marginBottom: "1.25rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <img loading="lazy" src="/icons/icon.svg" alt="LifePilot" className="logo" style={{ width: "38px", height: "38px", borderRadius: "10px", boxShadow: "none" }} />
            <h1 style={{ fontSize: "1.8rem", fontWeight: 950, margin: 0, color: "var(--ink)" }}>LifePilot</h1>
          </div>
          <h2 style={{ fontSize: "1.3rem", fontWeight: "950", margin: "0 0 0.5rem 0", color: "var(--ink)", textAlign: "center" }}>Join Shared Room</h2>
          <p style={{ fontSize: "0.9rem", textAlign: "center", margin: "0 0 1.25rem 0", color: "#666" }}>
            You have been invited to collaborate in <strong>{projectMetadata?.name}</strong> room.
          </p>

          {cooldownRemaining > 0 ? (
            <div className="warning" style={{ textAlign: "center" }}>
              🔒 Locked out due to too many failed PIN entries. Try again in {cooldownRemaining}s.
            </div>
          ) : (
            <form onSubmit={handlePreJoin} className="cloud-landing-form">
              <div className="cloud-landing-input-group hide-label">
                <label>Room PIN</label>
                <input 
                  type="password" 
                  value={enteredPin} 
                  onChange={(e) => setEnteredPin(e.target.value)} 
                  placeholder="Enter Room PIN"
                  maxLength={8}
                  required
                />
              </div>
              
              <div className="cloud-landing-input-group" style={{ marginBottom: "1.25rem" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "800", fontSize: "0.85rem", color: "var(--ink)", textAlign: "left" }}>
                  Who are you? Select your name:
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: "0.6rem", maxHeight: "180px", overflowY: "auto", padding: "0.5rem", marginBottom: "0.5rem", border: "2px solid var(--line, #111111)", borderRadius: "16px", background: "var(--cream, #fffdf7)" }}>
                  {roomParticipants.map((p) => {
                    const isSel = enteredName === p.name && !showCustomNameInput;
                    const initials = p.name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase() || "?";
                    return (
                      <button
                        key={p.id}
                        type="button"
                        className={`secondary tactile ${isSel ? "active" : ""}`}
                        style={{
                          padding: "0.5rem 0.35rem",
                          fontSize: "0.82rem",
                          border: isSel ? "2px solid var(--brand, #6f68d8)" : "2px solid var(--line, #e2d9c2)",
                          background: isSel ? "rgba(111, 104, 216, 0.08)" : "var(--paper, #ffffff)",
                          color: "var(--ink)",
                          borderRadius: "12px",
                          fontWeight: isSel ? "800" : "600",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: "0.3rem",
                          transition: "all 0.15s ease",
                          cursor: "pointer"
                        }}
                        onClick={() => {
                          setEnteredName(p.name);
                          setShowCustomNameInput(false);
                        }}
                      >
                        <div style={{
                          width: "32px",
                          height: "32px",
                          borderRadius: "50%",
                          background: isSel ? "var(--brand, #6f68d8)" : "rgba(0,0,0,0.06)",
                          color: isSel ? "#ffffff" : "var(--ink)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: "800",
                          fontSize: "0.75rem",
                          border: "1px solid var(--line)"
                        }}>
                          {initials}
                        </div>
                        <span style={{ overflowWrap: "break-word", wordBreak: "break-word", whiteSpace: "normal", fontSize: "0.75rem", width: "100%", textAlign: "center", display: "block", lineHeight: "1.1" }}>
                          {p.name}
                        </span>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    className={`secondary tactile ${showCustomNameInput ? "active" : ""}`}
                    style={{
                      padding: "0.5rem 0.35rem",
                      fontSize: "0.82rem",
                      border: showCustomNameInput ? "2px solid var(--brand, #6f68d8)" : "2px solid var(--line, #e2d9c2)",
                      background: showCustomNameInput ? "rgba(111, 104, 216, 0.08)" : "var(--paper, #ffffff)",
                      color: "var(--ink)",
                      borderRadius: "12px",
                      fontWeight: showCustomNameInput ? "800" : "600",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "0.3rem",
                      transition: "all 0.15s ease",
                      cursor: "pointer"
                    }}
                    onClick={() => {
                      setEnteredName("");
                      setShowCustomNameInput(true);
                    }}
                  >
                    <div style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "50%",
                      background: showCustomNameInput ? "var(--brand, #6f68d8)" : "rgba(0,0,0,0.06)",
                      color: showCustomNameInput ? "#ffffff" : "var(--ink)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: "800",
                      fontSize: "1.1rem",
                      border: "1px solid var(--line)"
                    }}>
                      +
                    </div>
                    <span style={{ overflowWrap: "break-word", wordBreak: "break-word", whiteSpace: "normal", fontSize: "0.75rem", width: "100%", textAlign: "center", display: "block", lineHeight: "1.1" }}>Other</span>
                  </button>
                </div>
                {showCustomNameInput && (
                  <input 
                    type="text" 
                    value={enteredName} 
                    onChange={(e) => setEnteredName(e.target.value)} 
                    placeholder="Enter display name" 
                    maxLength={20}
                    required
                    style={{ marginTop: "0.35rem" }}
                  />
                )}
              </div>

              {authError && <div className="validation" style={{ marginBottom: "1rem" }}>{authError}</div>}
              <button 
                className="primary tactile wide" 
                type="submit" 
                disabled={joiningRoom}
                style={{ padding: "0.95rem", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}
              >
                {joiningRoom ? "Connecting..." : "Join Expense Room"}
              </button>
            </form>
          )}
        </div>

        {/* Confirmation Modal */}
        {showConfirmJoin && (
          <div className="modal-backdrop" style={{ zIndex: 100 }}>
            <div className="modal" style={{ maxWidth: "340px", textAlign: "center", padding: "1.5rem" }}>
              <img loading="lazy" src="/icons/icon.svg" alt="LifePilot" style={{ width: "42px", height: "42px", display: "block", margin: "0 auto 0.75rem auto", borderRadius: "10px" }} />
              <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "1.2rem", fontWeight: "950" }}>Confirm Identity</h3>
              <p style={{ fontSize: "0.95rem", color: "var(--ink)", margin: "0 0 1.25rem 0" }}>
                Are you sure you want to join this shared expense space as <strong>"{enteredName}"</strong>?
              </p>
              <div className="modal-actions" style={{ display: "flex", gap: "0.5rem", justifyContent: "center", marginTop: 0 }}>
                <button type="button" className="secondary tactile" onClick={() => setShowConfirmJoin(false)} style={{ flex: 1 }}>
                  Cancel
                </button>
                <button type="button" className="primary tactile" onClick={handleJoin} style={{ flex: 1 }}>
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ISOLATED WORKSPACE VIEW
  return (
    <div className={`cloud-room-shell ${globalTheme}`}>
      {!isStandalone && (installPrompt || isIOS) && (
        <div style={{ background: "var(--brand, #6f68d8)", color: "white", padding: "0.75rem 1rem", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.85rem", fontWeight: 600, borderBottom: "1px solid rgba(0,0,0,0.1)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <Download size={18} />
            <span style={{ lineHeight: "1.2" }}>
              {isIOS ? "Get the App: Tap Share then 'Add to Home Screen' for the best experience." : "Install this Room to your Home Screen"}
            </span>
          </div>
          {installPrompt && (
            <button className="tactile" style={{ background: "white", color: "var(--brand, #6f68d8)", padding: "6px 12px", borderRadius: "8px", fontSize: "0.8rem", fontWeight: 900, border: "none", cursor: "pointer", flexShrink: 0, marginLeft: "0.5rem" }} onClick={() => installPrompt.prompt()}>
              Install
            </button>
          )}
        </div>
      )}
      {/* HEADER */}
      <header className="cloud-room-header">
        <div>
          <h2>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
              <span className="status-dot" title="Live Sync active"></span>
              {project?.name || "Expense Room"}
            </span>
            <small className="creator-tag">{project?.type || "Trip"}</small>
          </h2>
        </div>
        <div className="cluster" style={{ gap: "0.85rem" }}>
          <span style={{ fontWeight: 800, fontSize: "0.9rem" }}>{displayName}</span>
          <button className="secondary tactile danger" onClick={handleLeave} style={{ padding: "0.4rem 0.8rem", fontSize: "0.85rem" }}>
            Leave Space
          </button>
        </div>
      </header>

      {/* MAIN WORKSPACE */}
      <main className="cloud-room-main">
        {/* WELCOME BANNER */}
        {welcomeMessage && (
          <div className="welcome-banner animate-fade-in">
            <div className="welcome-banner-text">{welcomeMessage}</div>
            <button className="icon-button tactile" onClick={() => setWelcomeMessage(null)}><X size={16} /></button>
          </div>
        )}

        {/* TABS NAVIGATION */}
        <div className="segmented" style={{ overflowX: "auto", whiteSpace: "nowrap", display: "flex" }}>
          {[
            ["dashboard", "Dashboard"],
            ["expenses", "Expenses"],
            ["tasks", "Reminders"],
            ["docs", "Documents"],
            ["chat", `Chat (${messages.length})`],
            ["analytics", "Analytics"],
            ["timeline", "Logs"]
          ].map(([key, label]) => (
            <button 
              key={key} 
              className={`segmented-button ${activeTab === key ? "active" : ""}`} 
              onClick={() => setActiveTab(key)}
              style={{ flex: "0 0 auto" }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* LOADING SKELETON */}
        {loadingData ? (
          <div>
            <SkeletonLoader type="dashboard" />
            <SkeletonLoader type="list" />
          </div>
        ) : (
          <>
            {/* 1. DASHBOARD TAB */}
            {activeTab === "dashboard" && (
              <div style={{ display: "grid", gap: "1rem" }}>
                {/* OVERSPENT BANNER */}
                {isOverspent && (
                   <div className="alert-row danger">
                     <strong>Over budget warning!</strong>
                     <span>You have exceeded the budget by <strong>{rupee.format(overspentAmt)}</strong>. Control spending!</span>
                   </div>
                )}

                {/* STAT CARDS */}
                <div className="insight-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
                  <article className="insight-card">
                    <span>Budget</span>
                    <strong>{rupee.format(budgetVal)}</strong>
                    <small>Trip target budget</small>
                  </article>
                  <article className={`insight-card ${isOverspent ? "warn" : "good"}`}>
                    <span>Spent</span>
                    <strong>{rupee.format(totalSpent)}</strong>
                    <small>{usagePercentage.toFixed(0)}% budget utilized</small>
                  </article>
                  <article className={`insight-card ${remainingBudget < 0 ? "warn" : "good"}`}>
                    <span>Remaining</span>
                    <strong>{rupee.format(remainingBudget)}</strong>
                    <small>{isOverspent ? "Overspent" : "Available balance"}</small>
                  </article>
                </div>

                {/* PROGRESS BAR */}
                <div className="panel" style={{ padding: "1.2rem" }}>
                  <SectionHeader title="Budget Usage" />
                  <div style={{ background: "rgba(0,0,0,0.06)", height: "24px", borderRadius: "12px", overflow: "hidden", position: "relative", marginTop: "0.5rem" }}>
                    <div 
                      style={{ 
                        background: isOverspent ? "var(--warn, #e74c3c)" : "var(--mint, #2ecc71)", 
                        width: `${usagePercentage}%`, 
                        height: "100%",
                        transition: "width 0.4s ease"
                      }}
                    />
                    <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 950, fontSize: "0.85rem", color: "#111111" }}>
                      {usagePercentage.toFixed(0)}% Used
                    </span>
                  </div>
                </div>

                {/* QUICK ADD ACTIONS */}
                <div className="cluster spaced">
                  <button className="primary tactile" onClick={() => {
                    setExpForm({
                      title: "",
                      amount: "",
                      category: "Food",
                      date: todayISO(),
                      time: nowTime(),
                      paidBy: displayName,
                      splitMode: "No split",
                      participants: [],
                      owedBy: "",
                      paymentMethod: "UPI",
                      notes: "",
                      imageUrls: []
                    });
                    setShowAddExpense(true);
                  }}><Plus size={18} />Add Expense</button>
                  <button className="secondary tactile" onClick={() => setShowAddTask(true)}><Plus size={18} />Add Reminder</button>
                  <button className="secondary tactile" onClick={() => setShowAddDoc(true)}><Plus size={18} />Share Drive Doc</button>
                </div>

                {/* RECENT TRANSACTIONS */}
                <div className="panel">
                  <SectionHeader title="Recent Transactions" action={
                    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                      <select 
                        value={dashboardFilter} 
                        onChange={(e) => setDashboardFilter(e.target.value)}
                        style={{ padding: "2px 6px", fontSize: "0.75rem", borderRadius: "6px", border: "1px solid var(--line)" }}
                      >
                        <option value="All">All</option>
                        <option value="Normal">Normal Payments</option>
                        <option value="Split">Splits</option>
                      </select>
                      <button className="secondary tactile" style={{ padding: "2px 8px", fontSize: "0.75rem" }} onClick={() => setActiveTab("expenses")}>View All</button>
                    </div>
                  } />
                  <div style={{ display: "grid", gap: "0", marginTop: "0.5rem" }}>
                    {expenses.filter(item => {
                      if (dashboardFilter === "Normal") return item.category !== "Settlement";
                      if (dashboardFilter === "Split") return item.category === "Settlement";
                      return true;
                    }).slice(0, 5).map(item => (
                      <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.7rem 0", borderBottom: "1px solid rgba(0,0,0,0.05)", minWidth: 0 }}>
                        <span style={{ fontWeight: 700, fontSize: "0.92rem", color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0, marginRight: "1rem", display: "block" }}>{item.title}</span>
                        <strong style={{ fontSize: "0.95rem", color: "var(--ink)", fontWeight: 900, flexShrink: 0 }}>{rupee.format(item.amount)}</strong>
                      </div>
                    ))}
                    {expenses.length === 0 && <EmptyState text="No expenses added yet." />}
                  </div>
                </div>

                {/* SETTLEMENTS & INSIGHTS */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "1rem" }}>
                  {/* Ledger */}
                  <div className="panel" style={{ padding: "1.2rem" }}>
                    <SectionHeader title="Owes & Settlement Ledger" />
                    <div style={{ display: "grid", gap: "0.80rem", marginTop: "0.55rem", maxHeight: "200px", overflowY: "auto" }}>
                      {splitSummary.stats.map(item => (
                        <div key={item.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.92rem", paddingBottom: "0.4rem", borderBottom: "1px dashed rgba(0,0,0,0.06)" }}>
                          <strong>{item.name}</strong>
                          <span className={item.balance >= 0 ? "credit" : "debit"} style={{ fontWeight: "800" }}>
                            {item.balance >= 0 ? "Gets" : "Owes"} {rupee.format(Math.abs(item.balance))}
                          </span>
                        </div>
                      ))}
                      {splitSummary.stats.length === 0 && <EmptyState text="Add project participants to calculate owes." small />}
                    </div>
                  </div>

                  {/* Who Pays Whom */}
                  <div className="panel" style={{ padding: "1.2rem" }}>
                    <SectionHeader title="Pending Payments" />
                    <div style={{ display: "grid", gap: "0.80rem", marginTop: "0.55rem", maxHeight: "250px", overflowY: "auto" }}>
                      {splitSummary.settlements.map((item, index) => (
                        <div key={`${item.from}-${item.to}-${index}`} style={{ display: "flex", flexDirection: "column", gap: "0.3rem", paddingBottom: "0.4rem", borderBottom: "1px dashed rgba(0,0,0,0.06)" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.92rem", flexWrap: "wrap", gap: "0.5rem" }}>
                            <span>{item.from} ➔ {item.to}</span>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                              <strong style={{ color: "var(--brand)" }}>pays {rupee.format(item.amount)}</strong>
                              <div style={{ display: "flex", gap: "0.3rem" }}>
                                <button className="secondary tactile" style={{ padding: "2px 6px", fontSize: "0.72rem" }} type="button" onClick={() => handleMarkSettlementPaid(item, item.amount, "Full")}>Fully Paid</button>
                                <button className={`secondary tactile ${customSettlementKey === settlementKey(item) ? "active" : ""}`} style={{ padding: "2px 6px", fontSize: "0.72rem" }} type="button" onClick={() => {
                                  setCustomSettlementKey(customSettlementKey === settlementKey(item) ? "" : settlementKey(item));
                                  setCustomAmount("");
                                }}>Custom</button>
                              </div>
                            </div>
                          </div>
                          {customSettlementKey === settlementKey(item) && (
                            <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", marginTop: "0.2rem", justifyContent: "flex-end" }}>
                              <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>Paid now:</span>
                              <input
                                value={customAmount}
                                onChange={(event) => setCustomAmount(event.target.value)}
                                type="number"
                                step="0.01"
                                min="0.01"
                                max={item.amount}
                                placeholder={`Max ${item.amount}`}
                                style={{ padding: "2px 6px", width: "80px", fontSize: "0.8rem", border: "1px solid var(--line)", borderRadius: "6px" }}
                              />
                              <button className="primary tactile" style={{ padding: "2px 8px", fontSize: "0.72rem" }} type="button" onClick={() => {
                                const safeAmt = Math.min(Math.max(Number(customAmount), 0), item.amount);
                                if (safeAmt > 0) {
                                  handleMarkSettlementPaid(item, safeAmt, "Custom");
                                  setCustomSettlementKey("");
                                  setCustomAmount("");
                                }
                              }}>Save</button>
                              <button className="secondary tactile" style={{ padding: "2px 6px", fontSize: "0.72rem" }} type="button" onClick={() => setCustomSettlementKey("")}>Cancel</button>
                            </div>
                          )}
                        </div>
                      ))}
                      {splitSummary.settlements.length === 0 && <EmptyState text="All settled up! No pending payments." small />}
                    </div>
                  </div>
                </div>

                {/* REMINDERS & DOCS WIDGETS */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "1rem" }}>
                  {/* Reminders */}
                  <div className="panel" style={{ padding: "1.2rem" }}>
                    <SectionHeader title="Trip Reminders" action={<button className="secondary tactile" style={{ padding: "2px 8px", fontSize: "0.75rem" }} onClick={() => setActiveTab("tasks")}>View All</button>} />
                    <div style={{ display: "grid", gap: "0.65rem", marginTop: "0.55rem" }}>
                      {tasks.filter(t => {
                        if (t.status === "Completed") return false;
                        const due = new Date(t.due_date).getTime();
                        const now = new Date(todayISO()).getTime();
                        const days = (due - now) / (1000 * 3600 * 24);
                        return days <= 3;
                      }).slice(0, 4).map(item => (
                        <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.88rem", paddingBottom: "0.45rem", borderBottom: "1px dashed rgba(0,0,0,0.06)" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flex: 1, minWidth: 0, marginRight: "0.5rem" }}>
                            <input 
                              type="checkbox" 
                              checked={false} 
                              onChange={() => handleToggleTask(item)}
                              style={{ width: "16px", height: "16px", cursor: "pointer", flexShrink: 0 }}
                            />
                            <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</span>
                          </div>
                          <span style={{ color: "var(--warn)", fontSize: "0.78rem", fontWeight: "bold", flexShrink: 0 }}>
                            {item.due_date === todayISO() ? "Today" : item.due_date}
                          </span>
                        </div>
                      ))}
                      {tasks.filter(t => t.status !== "Completed" && ((new Date(t.due_date).getTime() - new Date(todayISO()).getTime()) / (1000 * 3600 * 24) <= 3)).length === 0 && <EmptyState text="No upcoming reminders in the next 3 days." small />}
                    </div>
                  </div>

                  {/* Shared Docs */}
                  <div className="panel" style={{ padding: "1.2rem" }}>
                    <SectionHeader title="Shared Documents" action={<button className="secondary tactile" style={{ padding: "2px 8px", fontSize: "0.75rem" }} onClick={() => setActiveTab("docs")}>View All</button>} />
                    <div style={{ display: "grid", gap: "0.65rem", marginTop: "0.55rem" }}>
                      {documents.slice(0, 4).map(item => (
                        <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.88rem", paddingBottom: "0.45rem", borderBottom: "1px dashed rgba(0,0,0,0.06)" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flex: 1, minWidth: 0 }}>
                            <FileText size={14} style={{ color: "var(--brand)", flexShrink: 0 }} />
                            <a href={item.url.startsWith("http") ? item.url : `https://${item.url}`} target="_blank" rel="noopener noreferrer" style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {item.title}
                            </a>
                          </div>
                          <span style={{ color: "var(--muted)", fontSize: "0.78rem", flexShrink: 0, marginLeft: "0.5rem" }}>
                            {item.created_by}
                          </span>
                        </div>
                      ))}
                      {documents.length === 0 && <EmptyState text="No shared documents yet." small />}
                    </div>
                  </div>
                </div>

                {/* QUICK CHAT WIDGET & TIMELINE */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "1rem" }}>
                  {/* TIMELINE SUMMARY */}
                  <div className="panel" style={{ padding: "1.2rem" }}>
                    <SectionHeader 
                      title="Recent Room Activities" 
                      action={<button type="button" className="secondary tactile" style={{ padding: "2px 8px", fontSize: "0.75rem" }} onClick={() => setActiveTab("timeline")}>View Logs</button>} 
                    />
                    <div style={{ display: "grid", gap: "0.65rem", marginTop: "0.55rem" }}>
                      {activities.slice(0, 4).map(act => {
                        const isOverride = act.action_type && act.action_type.includes("_override");
                        return (
                        <div key={act.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.88rem", paddingBottom: "0.45rem", borderBottom: "1px dashed rgba(0,0,0,0.06)", color: isOverride ? "var(--danger, #ef4444)" : "inherit" }}>
                          <span>{act.description}</span>
                          <span style={{ color: isOverride ? "var(--danger, #ef4444)" : "var(--muted)", fontSize: "0.78rem" }}>
                            {new Date(act.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      )})}
                      {activities.length === 0 && <EmptyState text="No activities logged yet." />}
                    </div>
                  </div>

                  {/* MINI CHAT WIDGET */}
                  <div className="panel" style={{ padding: "1.2rem", display: "flex", flexDirection: "column", justifyItems: "space-between" }}>
                    <SectionHeader title="Quick Chat Room" action={<button className="secondary tactile" style={{ padding: "2px 8px", fontSize: "0.75rem" }} onClick={() => setActiveTab("chat")}>Open Chat</button>} />
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.5rem", maxHeight: "150px", overflowY: "auto", margin: "0.5rem 0", padding: "0.25rem", background: "var(--cream, #fffdf7)", borderRadius: "10px", border: "1px solid rgba(0,0,0,0.05)" }}>
                      {messages.slice(-3).map(msg => {
                        const isSelf = msg.sender_name === displayName;
                        return (
                          <div key={msg.id} style={{ fontSize: "0.85rem", padding: "0.35rem 0.5rem", borderRadius: "8px", background: isSelf ? "rgba(111,104,216,0.06)" : "#ffffff", border: "1px solid rgba(0,0,0,0.03)" }}>
                            <strong style={{ color: "var(--brand, #6f68d8)" }}>{isSelf ? "You" : msg.sender_name}: </strong>
                            <span>{msg.message}</span>
                          </div>
                        );
                      })}
                      {messages.length === 0 && <EmptyState text="No messages yet." small />}
                    </div>
                    <form onSubmit={handleSendChat} style={{ display: "flex", gap: "0.4rem" }}>
                      <input 
                        type="text" 
                        value={chatText} 
                        onChange={(e) => setChatText(e.target.value)} 
                        placeholder="Type message..." 
                        maxLength={200}
                        required
                        style={{ flex: 1, padding: "0.45rem 0.75rem", fontSize: "0.85rem", border: "2px solid var(--line)", borderRadius: "10px", background: "var(--cream)" }}
                      />
                      <button type="submit" className="primary icon-button tactile" style={{ padding: "0.45rem", borderRadius: "10px", background: "var(--brand, #6f68d8)", color: "#fff" }}>
                        <SendHorizontal size={14} />
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            )}

            {/* 2. EXPENSES TAB */}
            {activeTab === "expenses" && (
              <div style={{ display: "grid", gap: "1rem" }}>
                <div className="cluster spaced">
                  <h2>Expenses list ({filteredExpenses.length})</h2>
                  <button className="primary tactile" onClick={() => {
                    setExpForm({
                      title: "",
                      amount: "",
                      category: "Food",
                      date: todayISO(),
                      time: nowTime(),
                      paidBy: displayName,
                      splitMode: "No split",
                      participants: [],
                      owedBy: "",
                      paymentMethod: "UPI",
                      notes: "",
                      imageUrls: []
                    });
                    setShowAddExpense(true);
                  }}><Plus size={18} />Add Expense</button>
                </div>

                {/* SEARCH & FILTERS */}
                <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem", background: "var(--cream, #fffdf7)", padding: "1.2rem", borderRadius: "20px", border: "2px solid var(--line)" }}>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <input 
                      type="text" 
                      value={searchQuery} 
                      onChange={(e) => setSearchQuery(e.target.value)} 
                      placeholder="Search expenses by title, notes, category, or paid by..." 
                      style={{ flex: 1, padding: "0.75rem", border: "2px solid var(--line)", borderRadius: "12px", background: "var(--paper, #fff)" }}
                    />
                  </div>
                  <div className="filter-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.85rem" }}>
                    <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.85rem", fontWeight: "800" }}>Category
                      <Select 
                        value={categoryFilter} 
                        onChange={setCategoryFilter} 
                        options={["All", ...categoriesOptions]} 
                      />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.85rem", fontWeight: "800" }}>Paid By
                      <Select 
                        value={participantFilter} 
                        onChange={setParticipantFilter} 
                        options={["All", ...participantNamesList]} 
                      />
                    </label>
                  </div>
                </div>

                {/* LIST — grouped by date, progressive disclosure */}
                {(() => {
                  const categoryIcons = { Food: "🍔", Travel: "✈️", Bills: "⚡", Health: "🏥", Shopping: "🛍️", Entertainment: "🎬", Custom: "🏷️", Settlement: "🤝" };
                  const grouped = {};
                  filteredExpenses.forEach(item => {
                    const d = item.date || "Unknown";
                    if (!grouped[d]) grouped[d] = [];
                    grouped[d].push(item);
                  });
                  const dateKeys = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

                  if (filteredExpenses.length === 0) return <EmptyState text="No expenses match the filters." />;

                  return (
                    <div style={{ display: "grid", gap: "1.2rem" }}>
                      {dateKeys.map(date => {
                        const dateLabel = (() => {
                          const today = todayISO();
                          const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
                          if (date === today) return "Today";
                          if (date === yesterday) return "Yesterday";
                          return new Date(date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
                        })();
                        const dayTotal = grouped[date].reduce((s, e) => s + Number(e.amount), 0);

                        return (
                          <div key={date}>
                            {/* Date header */}
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem", padding: "0 0.2rem" }}>
                              <span style={{ fontWeight: 900, fontSize: "0.82rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{dateLabel}</span>
                              <span style={{ fontWeight: 800, fontSize: "0.8rem", color: "var(--muted)" }}>{rupee.format(dayTotal)}</span>
                            </div>

                            {/* Expenses for this date */}
                            <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
                              {grouped[date].map((item, idx) => {
                                const icon = categoryIcons[item.category] || "🏷️";
                                const isExpanded = expandedExpenses[item.id] === "details" || expandedExpenses[item.id] === "owes";
                                const isOwesOpen = expandedExpenses[item.id] === "owes";
                                const hasSplit = (item.participants && item.participants.length > 0) || item.owed_by;
                                const isSettlement = item.category === "Settlement";
                                const canDelete = item.created_by === displayName || isSettlement || participants.find(p => p.name === displayName)?.role === "owner";

                                return (
                                  <div key={item.id} style={{ borderBottom: idx < grouped[date].length - 1 ? "1px solid rgba(0,0,0,0.06)" : "none" }}>
                                    {/* Row 1: Icon + Title + Amount — always visible */}
                                    <div 
                                      style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.85rem 1rem", cursor: "pointer" }}
                                      onClick={() => setExpandedExpenses(prev => ({
                                        ...prev,
                                        [item.id]: prev[item.id] ? undefined : "details"
                                      }))}
                                    >
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 800, fontSize: "0.95rem", color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</div>
                                        <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.1rem" }}>{item.time || ""} · {item.category}</div>
                                      </div>
                                      <strong style={{ fontSize: "1.05rem", fontWeight: 950, color: "var(--ink)", flexShrink: 0 }}>{rupee.format(item.amount)}</strong>
                                      <span style={{ fontSize: "0.7rem", color: "var(--muted)", transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s", flexShrink: 0 }}>▼</span>
                                    </div>

                                    {/* Row 2: Expanded details — shown on first click */}
                                    {isExpanded && (
                                      <div style={{ padding: "0 1rem 0.8rem 1rem", background: "rgba(0,0,0,0.015)" }}>
                                        {/* Detail chips */}
                                        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", fontSize: "0.78rem", marginBottom: "0.5rem" }}>
                                          <span style={{ background: "rgba(0,0,0,0.04)", padding: "3px 10px", borderRadius: "8px", border: "1px solid rgba(0,0,0,0.06)" }}>Paid by: <strong>{item.paid_by}</strong></span>
                                          {item.participants && item.participants.length > 0 && (
                                            <span style={{ background: "rgba(111,104,216,0.08)", color: "var(--brand,#6f68d8)", padding: "3px 10px", borderRadius: "8px", border: "1px solid rgba(111,104,216,0.12)" }}>
                                              Split: {item.participants.join(", ")}
                                            </span>
                                          )}
                                          {item.owed_by && (
                                            <span style={{ background: "rgba(217,119,6,0.08)", color: "#d97706", padding: "3px 10px", borderRadius: "8px", border: "1px solid rgba(217,119,6,0.12)" }}>
                                              Owed by: <strong>{item.owed_by}</strong>
                                            </span>
                                          )}
                                          {(() => {
                                            const { cleanNotes, urls } = extractAttachmentUrls(item.notes || "");
                                            const hasNoProof = item.notes && item.notes.includes("[No payment proof provided]");
                                            return (
                                              <>
                                                {cleanNotes && <span style={{ fontStyle: "italic", opacity: 0.7 }}>"<Linkify>{cleanNotes}</Linkify>"</span>}
                                                {urls && urls.map((url, uidx) => (
                                                  <span key={uidx} style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", background: "rgba(16, 185, 129, 0.08)", color: "#10b981", padding: "2px 8px", borderRadius: "6px", border: "1px solid rgba(16, 185, 129, 0.12)", fontWeight: "bold" }}>
                                                    <a href={url} onClick={(e) => { e.preventDefault(); setViewingImage?.(url); }} style={{ color: "inherit", textDecoration: "none" }}>Receipt {urls.length > 1 ? `#${uidx + 1}` : ""}</a>
                                                  </span>
                                                ))}
                                                {hasNoProof && (
                                                  <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", background: "rgba(239, 68, 68, 0.08)", color: "#ef4444", padding: "2px 8px", borderRadius: "6px", border: "1px solid rgba(239, 68, 68, 0.12)", fontWeight: "bold" }}>
                                                    No payment proof provided
                                                  </span>
                                                )}
                                              </>
                                            );
                                          })()}
                                          <span style={{ color: "var(--muted)", opacity: 0.7, marginLeft: "auto" }}>by {item.created_by}</span>
                                        </div>

                                        {/* Action buttons */}
                                        <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap" }}>
                                          {!isSettlement && (
                                            <button className="secondary tactile" style={{ padding: "3px 10px", fontSize: "0.72rem" }} type="button" onClick={(e) => { e.stopPropagation(); handleEditExpenseClick(item); }}>
                                              <Pencil size={12} style={{ marginRight: "3px", verticalAlign: "-2px" }} />Edit
                                            </button>
                                          )}
                                          {canDelete && (
                                            <button className="secondary danger tactile" style={{ padding: "3px 10px", fontSize: "0.72rem" }} type="button" onClick={(e) => { e.stopPropagation(); handleDeleteExpense(item.id, item.title); }}>
                                              <Trash2 size={12} style={{ marginRight: "3px", verticalAlign: "-2px" }} />Delete
                                            </button>
                                          )}
                                          {hasSplit && !isSettlement && (
                                            <button 
                                              className="secondary tactile" 
                                              style={{ padding: "3px 10px", fontSize: "0.72rem", marginLeft: "auto", color: "var(--brand, #6f68d8)" }} 
                                              type="button" 
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setExpandedExpenses(prev => ({
                                                  ...prev,
                                                  [item.id]: prev[item.id] === "owes" ? "details" : "owes"
                                                }));
                                              }}
                                            >
                                              {isOwesOpen ? "Hide Owes ▲" : "Show Owes ▼"}
                                            </button>
                                          )}
                                        </div>

                                        {/* Row 3: Owes/split details — shown on second click */}
                                        {isOwesOpen && (
                                          <div style={{ marginTop: "0.5rem" }}>
                                            <ExpenseSplitInlineDetails 
                                              expense={item} 
                                              project={mappedProjectForSplit} 
                                              isCloud={true} 
                                              onMarkPaid={handleMarkSettlementPaid} 
                                              onDeletePaid={handleDeleteSettlementInline}
                                              setConfirmDialog={setConfirmDialog}
                                              setViewingImage={setViewingImage}
                                            />
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* 3. TASKS TAB */}
            {activeTab === "tasks" && (
              <div style={{ display: "grid", gap: "1rem" }}>
                <div className="cluster spaced">
                  <h2>Trip Reminders & Tasks</h2>
                  <button className="primary tactile" onClick={() => setShowAddTask(true)}><Plus size={18} />Add Reminder</button>
                </div>

                <div className="list-grid">
                  {tasks.map(item => (
                    <div key={item.id} className="panel" style={{ padding: "1rem", display: "flex", alignItems: "center", justifyItems: "space-between", gap: "1rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.85rem", flex: 1 }}>
                        <input 
                          type="checkbox" 
                          checked={item.status === "Completed"} 
                          onChange={() => handleToggleTask(item)}
                          style={{ width: "20px", height: "20px", cursor: "pointer" }}
                        />
                        <div>
                          <strong style={{ fontSize: "1.05rem", textDecoration: item.status === "Completed" ? "line-through" : "none", opacity: item.status === "Completed" ? 0.6 : 1 }}>
                            {item.title}
                          </strong>
                          <div style={{ fontSize: "0.82rem", color: "var(--muted)", marginTop: "0.2rem" }}>
                            Due: {item.due_date} {item.due_time} | Priority: <strong>{item.priority}</strong>
                            <span className="creator-tag">Created by {item.created_by}</span>
                          </div>
                          {item.notes && <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", color: "#666" }}><Linkify>{item.notes}</Linkify></p>}
                        </div>
                      </div>
                      {item.created_by === displayName && (
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                          <button 
                            className="icon-button tactile" 
                            onClick={() => {
                              setEditTask(item);
                              setTaskForm({ title: item.title, dueDate: item.due_date, dueTime: item.due_time || "", priority: item.priority || "Medium", notes: item.notes || "" });
                              setShowAddTask(true);
                            }}
                            title="Edit"
                          >
                            <Edit3 size={16} />
                          </button>
                          <button 
                            className="icon-button tactile danger" 
                            onClick={() => handleDeleteTask(item.id, item.title)}
                            title="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                  {tasks.length === 0 && <EmptyState text="No task reminders set for this trip." />}
                </div>
              </div>
            )}

            {/* 4. DOCUMENTS TAB */}
            {activeTab === "docs" && (
              <div style={{ display: "grid", gap: "1rem" }}>
                <div className="cluster spaced">
                  <h2>Google Drive & Shared Links</h2>
                  <button className="primary tactile" onClick={() => setShowAddDoc(true)}><Plus size={18} />Share Link</button>
                </div>

                <div className="cloud-docs-list">
                  {documents.map(item => (
                    <div key={item.id} className="cloud-doc-row">
                      <div className="cloud-doc-info">
                        <FileText size={20} style={{ color: "var(--brand)" }} />
                        <div>
                          <a href={item.url.startsWith("http") ? item.url : `https://${item.url}`} target="_blank" rel="noopener noreferrer">
                            {item.title}
                          </a>
                          <div style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
                            Shared by <strong>{item.created_by}</strong>
                          </div>
                        </div>
                      </div>

                      {item.created_by === displayName && (
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                          <button 
                            className="icon-button tactile" 
                            onClick={() => {
                              setEditDoc(item);
                              setDocForm({ title: item.title, url: item.url });
                              setShowAddDoc(true);
                            }}
                            title="Edit"
                          >
                            <Edit3 size={16} />
                          </button>
                          <button 
                            className="icon-button tactile danger" 
                            onClick={() => handleDeleteDoc(item.id, item.title)}
                            title="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                  {documents.length === 0 && <EmptyState text="No shared Google Drive or travel document links yet." />}
                </div>
              </div>
            )}

            {/* 5. CHAT BOX TAB */}
            {activeTab === "chat" && (
              <div className="cloud-chat-card">
                <div className="cloud-chat-messages">
                  {messages.map(msg => {
                    const isSelf = msg.sender_name === displayName;
                    return (
                      <div key={msg.id} className={`cloud-chat-message-bubble ${isSelf ? "self" : "other"}`}>
                        <span className="cloud-chat-msg-header">
                          {isSelf ? "You" : msg.sender_name}
                        </span>
                        <span className="cloud-chat-msg-text"><Linkify>{msg.message}</Linkify></span>
                        <span className="cloud-chat-msg-time">
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    );
                  })}
                  {messages.length === 0 && <EmptyState text="Start a discussion! Send a message below." />}
                  <div ref={chatEndRef} />
                </div>
                
                <form onSubmit={handleSendChat} className="cloud-chat-input-bar">
                  <input 
                    type="text" 
                    value={chatText} 
                    onChange={(e) => setChatText(e.target.value)} 
                    placeholder="Message room..." 
                    maxLength={200}
                    required
                  />
                  <button type="submit" className="primary icon-button tactile" style={{ background: "var(--brand, #6f68d8)", color: "#fff" }}>
                    <SendHorizontal size={18} />
                  </button>
                </form>
              </div>
            )}

            {/* 6. ANALYTICS TAB */}
            {activeTab === "analytics" && (
              <div style={{ display: "grid", gap: "1rem" }}>
                <h2>Cloud Analytics & Split Ledger</h2>

                {/* LEDGER GRID */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "1.2rem" }}>
                  {/* PARTICIPANT SPLITS */}
                  <div className="panel" style={{ padding: "1.2rem" }}>
                    <SectionHeader title="Spending by Participant" />
                    <div style={{ display: "grid", gap: "0.8rem", marginTop: "0.75rem" }}>
                      {participantSpendSummary.map(item => {
                        const maxSpent = Math.max(...participantSpendSummary.map(p => p.spent), 1);
                        const barWidth = (item.spent / maxSpent) * 100;
                        return (
                          <div key={item.name}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.9rem", fontWeight: 800 }}>
                              <span>{item.name}</span>
                              <strong>{rupee.format(item.spent)}</strong>
                            </div>
                            <div style={{ height: "12px", background: "rgba(0,0,0,0.06)", borderRadius: "6px", overflow: "hidden", marginTop: "0.25rem" }}>
                              <div style={{ background: "var(--brand, #6f68d8)", width: `${barWidth}%`, height: "100%", borderRadius: "6px" }}></div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* CATEGORY SPEND */}
                  <div className="panel" style={{ padding: "1.2rem" }}>
                    <SectionHeader title="Category Breakdown" />
                    <div style={{ display: "grid", gap: "0.8rem", marginTop: "0.75rem" }}>
                      {categorySpendSummary.map(item => {
                        const maxCat = Math.max(...categorySpendSummary.map(c => c.spent), 1);
                        const barWidth = (item.spent / maxCat) * 100;
                        return (
                          <div key={item.name}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.9rem", fontWeight: 800 }}>
                              <span>{item.name}</span>
                              <strong>{rupee.format(item.spent)}</strong>
                            </div>
                            <div style={{ height: "12px", background: "rgba(0,0,0,0.06)", borderRadius: "6px", overflow: "hidden", marginTop: "0.25rem" }}>
                              <div style={{ background: "var(--orange, #f4d06f)", width: `${barWidth}%`, height: "100%", borderRadius: "6px" }}></div>
                            </div>
                          </div>
                        );
                      })}
                      {categorySpendSummary.length === 0 && <EmptyState text="Add expenses to see categories." />}
                    </div>
                  </div>
                </div>

                {/* WHO PAYS WHOM INSIGHTS */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "1.2rem" }}>
                  <div className="panel" style={{ padding: "1.2rem" }}>
                    <SectionHeader title="Participant Net Balances (Owes / Gets)" />
                    <div style={{ display: "grid", gap: "0.75rem", marginTop: "0.75rem" }}>
                      {splitSummary.stats.map(item => (
                        <div key={item.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.92rem", paddingBottom: "0.4rem", borderBottom: "1px dashed rgba(0,0,0,0.06)" }}>
                          <strong>{item.name}</strong>
                          <span className={item.balance >= 0 ? "credit" : "debit"} style={{ fontWeight: "800" }}>
                            {item.balance >= 0 ? "Gets" : "Owes"} {rupee.format(Math.abs(item.balance))}
                          </span>
                        </div>
                      ))}
                      {splitSummary.stats.length === 0 && <EmptyState text="No participant data found." small />}
                    </div>
                  </div>

                  <div className="panel" style={{ padding: "1.2rem" }}>
                    <SectionHeader title="Suggested Debts Settlements" />
                    <div style={{ display: "grid", gap: "0.75rem", marginTop: "0.75rem" }}>
                      {splitSummary.settlements.map((item, index) => (
                        <div key={`${item.from}-${item.to}-${index}`} style={{ display: "flex", flexDirection: "column", gap: "0.3rem", paddingBottom: "0.4rem", borderBottom: "1px dashed rgba(0,0,0,0.06)" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.92rem", flexWrap: "wrap", gap: "0.5rem" }}>
                            <span>{item.from} ➔ {item.to}</span>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                              <strong style={{ color: "var(--brand)" }}>pays {rupee.format(item.amount)}</strong>
                              <div style={{ display: "flex", gap: "0.3rem" }}>
                                <button className="secondary tactile" style={{ padding: "2px 6px", fontSize: "0.72rem" }} type="button" onClick={() => handleMarkSettlementPaid(item, item.amount, "Full")}>Fully Paid</button>
                                <button className={`secondary tactile ${customSettlementKey === settlementKey(item) ? "active" : ""}`} style={{ padding: "2px 6px", fontSize: "0.72rem" }} type="button" onClick={() => {
                                  setCustomSettlementKey(customSettlementKey === settlementKey(item) ? "" : settlementKey(item));
                                  setCustomAmount("");
                                }}>Custom</button>
                              </div>
                            </div>
                          </div>
                          {customSettlementKey === settlementKey(item) && (
                            <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", marginTop: "0.2rem", justifyContent: "flex-end" }}>
                              <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>Paid now:</span>
                              <input
                                value={customAmount}
                                onChange={(event) => setCustomAmount(event.target.value)}
                                type="number"
                                step="0.01"
                                min="0.01"
                                max={item.amount}
                                placeholder={`Max ${item.amount}`}
                                style={{ padding: "2px 6px", width: "80px", fontSize: "0.8rem", border: "1px solid var(--line)", borderRadius: "6px" }}
                              />
                              <button className="primary tactile" style={{ padding: "2px 8px", fontSize: "0.72rem" }} type="button" onClick={() => {
                                const safeAmt = Math.min(Math.max(Number(customAmount), 0), item.amount);
                                if (safeAmt > 0) {
                                  handleMarkSettlementPaid(item, safeAmt, "Custom");
                                  setCustomSettlementKey("");
                                  setCustomAmount("");
                                }
                              }}>Save</button>
                              <button className="secondary tactile" style={{ padding: "2px 6px", fontSize: "0.72rem" }} type="button" onClick={() => setCustomSettlementKey("")}>Cancel</button>
                            </div>
                          )}
                        </div>
                      ))}
                      {splitSummary.settlements.length === 0 && <EmptyState text="Everything settled! No debts to pay." small />}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 7. ACTIVITY TIMELINE TAB */}
            {activeTab === "timeline" && (
              <div style={{ display: "grid", gap: "1rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
                  <h2 style={{ margin: 0 }}>Room Activity Logs</h2>
                  <input 
                    type="text" 
                    placeholder="Search logs by action, user or details..." 
                    value={logSearchQuery}
                    onChange={(e) => setLogSearchQuery(e.target.value)}
                    style={{ 
                      padding: "6px 12px", 
                      fontSize: "0.85rem", 
                      border: "1px solid var(--line)", 
                      borderRadius: "8px", 
                      width: "100%", 
                      maxWidth: "280px",
                      background: "var(--paper, #fff)"
                    }}
                  />
                </div>

                {(() => {
                  const query = logSearchQuery.toLowerCase().trim();
                  const filtered = activities.filter(act => {
                    if (!query) return true;
                    const desc = (act.description || "").toLowerCase();
                    const creator = (act.created_by || "").toLowerCase();
                    const type = (act.action_type || "").toLowerCase();
                    return desc.includes(query) || creator.includes(query) || type.includes(query);
                  });

                  // Group by date
                  const groups = {};
                  filtered.forEach(act => {
                    const d = new Date(act.created_at);
                    const dateStr = d.toLocaleDateString("en-IN", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      year: "numeric"
                    });
                    if (!groups[dateStr]) {
                      groups[dateStr] = [];
                    }
                    groups[dateStr].push(act);
                  });

                  const dateKeys = Object.keys(groups);

                  const getIcon = (type) => {
                    switch (type) {
                      case "join": return "👋";
                      case "create": return "🆕";
                      case "add_expense": return "💵";
                      case "edit_expense": return "✏️";
                      case "delete_expense": return "❌";
                      case "add_task": return "⏰";
                      case "edit_task": return "✏️";
                      case "delete_task": return "❌";
                      case "toggle_task": return "✅";
                      case "add_doc": return "📂";
                      case "edit_doc": return "✏️";
                      case "delete_doc": return "❌";
                      case "add_settlement": return "🤝";
                      case "edit_settlement": return "🤝";
                      case "delete_settlement": return "❌";
                      case "update_participants": return "👥";
                      case "clear_chat": return "🧹";
                      case "budget_alert": return "⚠️";
                      default: return "⚙️";
                    }
                  };

                  if (filtered.length === 0) {
                    return <EmptyState text={logSearchQuery ? "No logs match your search." : "No logs recorded yet."} />;
                  }

                  return (
                    <div style={{ display: "grid", gap: "1.2rem" }}>
                      {dateKeys.map(dateStr => (
                        <div key={dateStr}>
                          <div style={{ fontWeight: 900, fontSize: "0.80rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "0.5rem", padding: "0 0.2rem" }}>
                            {dateStr}
                          </div>
                          
                          <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
                            {groups[dateStr].map((act, idx) => {
                              const d = new Date(act.created_at);
                              const timeStr = d.toLocaleTimeString("en-IN", {
                                hour: "2-digit",
                                minute: "2-digit",
                                second: "2-digit",
                                hour12: true
                              });

                              return (
                                <div 
                                  key={act.id} 
                                  style={{ 
                                    display: "flex", 
                                    gap: "0.75rem", 
                                    alignItems: "center", 
                                    padding: "0.75rem 1rem", 
                                    borderBottom: idx < groups[dateStr].length - 1 ? "1px solid rgba(0,0,0,0.06)" : "none",
                                    backgroundColor: act.action_type && act.action_type.includes("_override") ? "rgba(239, 68, 68, 0.08)" : "transparent"
                                  }}
                                >
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ margin: 0, fontWeight: 700, fontSize: "0.92rem", color: act.action_type && act.action_type.includes("_override") ? "var(--danger, #ef4444)" : "var(--ink)" }}>{act.description}</p>
                                    <div style={{ display: "flex", gap: "0.4rem", fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.15rem" }}>
                                      <span>{timeStr}</span>
                                      <span>•</span>
                                      <span>by <strong>{act.created_by}</strong></span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
             )}
           </>
         )}
       </main>
 
       {/* ========================================== */}
       {/* MODAL: ADD EXPENSE */}
       {/* ========================================== */}
       {showAddExpense && (
         <div className="modal-backdrop">
           <form className="modal" onSubmit={handleAddExpenseSubmit}>
             <SectionHeader title={expForm.id ? "Edit Cloud Expense" : "Add Cloud Expense"} action={<button type="button" className="icon-button tactile" onClick={() => setShowAddExpense(false)}><X size={18} /></button>} />
             <div className="form-grid">
               <label className="wide">Title
                 <input 
                   value={expForm.title} 
                   onChange={(e) => setExpForm({ ...expForm, title: e.target.value })} 
                   placeholder="e.g. Lunch at beach" 
                   required 
                 />
               </label>
               <label>Amount (₹)
                 <input 
                   type="number" 
                   min="0.01" 
                   step="0.01"
                   value={expForm.amount} 
                   onChange={(e) => setExpForm({ ...expForm, amount: e.target.value })} 
                   placeholder="Amount spent" 
                   required 
                 />
               </label>
               <label>Category
                 <Select 
                   value={expForm.category} 
                   onChange={(val) => setExpForm({ ...expForm, category: val })} 
                   options={categoriesOptions} 
                 />
               </label>
               <label>Date
                 <input 
                   type="date" 
                   value={expForm.date} 
                   onChange={(e) => setExpForm({ ...expForm, date: e.target.value })} 
                   required 
                 />
               </label>
               <label>Time
                 <input 
                   type="time" 
                   value={expForm.time} 
                   onChange={(e) => setExpForm({ ...expForm, time: e.target.value })} 
                 />
               </label>
               <label>Paid By
                 <Select 
                   value={expForm.paidBy || displayName} 
                   onChange={(val) => setExpForm({ ...expForm, paidBy: val })} 
                   options={participantNamesList.map(n => [n, n])} 
                 />
               </label>
               <label>Split Mode
                 <Select 
                   value={expForm.splitMode} 
                   onChange={(val) => setExpForm({ 
                     ...expForm, 
                     splitMode: val, 
                     participants: val === "Equal split" ? participantNamesList : [],
                     owedBy: "" 
                   })} 
                   options={[["No split", "No split"], ["Equal split", "Equal split"], ["Direct owed", "Direct owed"]]} 
                 />
               </label>

               {expForm.splitMode === "Direct owed" && (
                 <label>Owed By
                   <Select 
                     value={expForm.owedBy} 
                     onChange={(val) => setExpForm({ ...expForm, owedBy: val })} 
                     options={[["", "Select debtor"], ...participantNamesList.filter(n => n !== (expForm.paidBy || displayName)).map(n => [n, n])]} 
                   />
                 </label>
               )}
 
               {expForm.splitMode === "Equal split" && (
                 <div className="wide panel" style={{ padding: "0.85rem", marginTop: "0.5rem" }}>
                   <strong>Split Between:</strong>
                   <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: "0.5rem", marginTop: "0.45rem" }}>
                     {participantNamesList.map(name => {
                       const isChecked = expForm.participants.includes(name);
                       return (
                         <label key={name} className="toggle-row" style={{ minHeight: 0 }}>
                           <input 
                             type="checkbox" 
                             checked={isChecked} 
                             onChange={(e) => {
                               const next = e.target.checked 
                                 ? [...expForm.participants, name]
                                 : expForm.participants.filter(n => n !== name);
                               setExpForm({ ...expForm, participants: next });
                             }}
                           />
                           {name}
                         </label>
                       );
                     })}
                   </div>
                 </div>
               )}
 
               <label className="wide">Notes
                 <input 
                   value={expForm.notes} 
                   onChange={(e) => setExpForm({ ...expForm, notes: e.target.value })} 
                   placeholder="e.g. split equally, shared cab bill" 
                 />
               </label>

                <div className="wide" style={{ marginTop: '0.50rem' }}>
                   <label style={{ fontWeight: '800', fontSize: '0.85rem', display: 'block', marginBottom: '0.35rem' }}>
                     Attach Invoice/Receipt Images (Up to 5)
                   </label>
                   
                   {/* File inputs */}
                   <input 
                     type="file" 
                     accept="image/*" 
                     capture="environment" 
                     id="expense-camera-upload"
                     style={{ display: 'none' }}
                     onChange={(e) => handleImagesSelected(e.target.files)}
                   />
                   <input 
                     type="file" 
                     accept="image/*" 
                     multiple 
                     id="expense-gallery-upload"
                     style={{ display: 'none' }}
                     onChange={(e) => handleImagesSelected(e.target.files)}
                   />
                   <input 
                     type="file" 
                     accept="image/*" 
                     id="expense-replace-upload"
                     style={{ display: 'none' }}
                     onChange={(e) => {
                       if (e.target.files && e.target.files[0]) {
                         handleImageReplace(e.target.files[0]);
                       }
                     }}
                   />

                   <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                     <button 
                       type="button" 
                       className="secondary tactile" 
                       disabled={uploadingExpenseImage || (expForm.imageUrls || []).length >= 5}
                       style={{ padding: "6px 12px", fontSize: "0.82rem", display: "inline-flex", alignItems: "center", gap: "4px" }}
                       onClick={() => document.getElementById("expense-camera-upload").click()}
                     >
                       Take Photo
                     </button>
                     <button 
                       type="button" 
                       className="secondary tactile" 
                       disabled={uploadingExpenseImage || (expForm.imageUrls || []).length >= 5}
                       style={{ padding: "6px 12px", fontSize: "0.82rem", display: "inline-flex", alignItems: "center", gap: "4px" }}
                       onClick={() => document.getElementById("expense-gallery-upload").click()}
                     >
                       Upload Gallery
                     </button>
                     
                     <span style={{ fontSize: "0.80rem", color: "var(--muted)", fontWeight: "bold" }}>
                       ({(expForm.imageUrls || []).length}/5 images)
                     </span>
                     
                     {uploadingExpenseImage && (
                       <span style={{ fontSize: "0.80rem", color: "var(--brand)", fontWeight: "bold" }}>
                         Optimizing & Uploading...
                       </span>
                     )}
                   </div>

                   {/* Thumbnail Previews */}
                   {expForm.imageUrls && expForm.imageUrls.length > 0 && (
                     <div style={{ display: "flex", gap: "0.65rem", flexWrap: "wrap", background: "rgba(0,0,0,0.03)", padding: "0.6rem", borderRadius: "10px", border: "1px dashed rgba(0,0,0,0.1)" }}>
                       {expForm.imageUrls.map((url, index) => (
                         <div key={index} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.25rem", background: "white", padding: "4px", borderRadius: "8px", border: "1px solid var(--line)" }}>
                           <div style={{ position: "relative", width: "55px", height: "55px", borderRadius: "4px", overflow: "hidden" }}>
                             <img loading="lazy" 
                               src={url} 
                               alt={`Receipt ${index + 1}`} 
                               style={{ width: "100%", height: "100%", objectFit: "cover" }} 
                             />
                           </div>
                           <div style={{ display: "flex", gap: "2px" }}>
                             <button
                               type="button"
                               className="tactile"
                               style={{ 
                                 fontSize: "9px", 
                                 padding: "2px 4px", 
                                 background: "var(--line, #e2e8f0)", 
                                 color: "var(--ink, #1e293b)", 
                                 border: "none", 
                                 borderRadius: "4px",
                                 fontWeight: "600",
                                 cursor: "pointer"
                               }}
                               onClick={() => {
                                 setReplacingImageIndex(index);
                                 document.getElementById("expense-replace-upload").click();
                               }}
                             >
                               Replace
                             </button>
                             <button
                               type="button"
                               className="tactile danger"
                               style={{ 
                                 fontSize: "9px", 
                                 padding: "2px 4px", 
                                 background: "rgba(239, 68, 68, 0.1)", 
                                 color: "#ef4444", 
                                 border: "1px solid rgba(239, 68, 68, 0.15)", 
                                 borderRadius: "4px",
                                 fontWeight: "600",
                                 cursor: "pointer"
                               }}
                               onClick={() => {
                                 setExpForm(prev => ({
                                   ...prev,
                                   imageUrls: prev.imageUrls.filter((_, idx) => idx !== index)
                                 }));
                               }}
                             >
                               Delete
                             </button>
                           </div>
                         </div>
                       ))}
                     </div>
                   )}
                 </div>
             </div>
             <div className="modal-actions">
               <button type="button" className="secondary tactile" onClick={() => setShowAddExpense(false)} disabled={savingExpense}>Cancel</button>
               <button className="primary tactile" type="submit" disabled={savingExpense}>
                 {savingExpense ? "Syncing..." : (expForm.id ? "Save Changes" : "Submit Expense")}
               </button>
             </div>
           </form>
         </div>
       )}

       {/* ========================================== */}
       {/* MODAL: SETTLEMENT PROOF CONFIRMATION */}
       {/* ========================================== */}
       {activeSettlementModal && (
         <div className="modal-backdrop">
           <div className="modal" style={{ maxWidth: "450px" }}>
             <SectionHeader 
               title="Confirm Settlement Payment" 
               action={<button type="button" className="icon-button tactile" onClick={() => setActiveSettlementModal(null)}><X size={18} /></button>} 
             />
             
             <div style={{ margin: "1rem 0", padding: "0.85rem", background: "rgba(111, 104, 216, 0.05)", borderRadius: "12px", border: "1px solid rgba(111, 104, 216, 0.1)" }}>
               <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.3rem" }}>
                 <span style={{ fontSize: "0.9rem", color: "var(--muted)" }}>From:</span>
                 <strong style={{ fontSize: "0.95rem" }}>{activeSettlementModal.settlementItem.from}</strong>
               </div>
               <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.3rem" }}>
                 <span style={{ fontSize: "0.9rem", color: "var(--muted)" }}>To:</span>
                 <strong style={{ fontSize: "0.95rem" }}>{activeSettlementModal.settlementItem.to}</strong>
               </div>
               <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px dashed rgba(0,0,0,0.08)", paddingTop: "0.4rem", marginTop: "0.4rem" }}>
                 <span style={{ fontSize: "0.9rem", fontWeight: "bold" }}>Amount:</span>
                 <strong style={{ fontSize: "1.1rem", color: "var(--brand)" }}>{rupee.format(activeSettlementModal.paidAmt)}</strong>
               </div>
             </div>
 
             {settlementWarningShown ? (
               <div className="panel" style={{ background: "rgba(245, 158, 11, 0.08)", borderColor: "rgba(245, 158, 11, 0.2)", padding: "1rem", marginBottom: "1rem" }}>
                 <div style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start" }}>
                   <div>
                     <strong style={{ color: "#d97706", display: "block", marginBottom: "0.25rem" }}>Transparency Warning</strong>
                     <span style={{ fontSize: "0.85rem", color: "#b45309", lineHeight: "1.4" }}>
                       Please upload a UPI payment proof for transparency during split payments. This helps ensure all room members can verify the transaction.
                     </span>
                   </div>
                 </div>
                 <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem", justifyContent: "flex-end" }}>
                   <button 
                     type="button" 
                     className="secondary tactile" 
                     style={{ fontSize: "0.8rem", padding: "4px 12px" }}
                     onClick={() => setSettlementWarningShown(false)}
                   >
                     Go Back & Upload
                   </button>
                   <button 
                     type="button" 
                     className="primary tactile" 
                     style={{ fontSize: "0.8rem", padding: "4px 12px", background: "#d97706", borderColor: "#d97706" }}
                     onClick={() => {
                       executeSaveSettlement(
                         activeSettlementModal.settlementItem,
                         activeSettlementModal.paidAmt,
                         activeSettlementModal.type,
                         activeSettlementModal.existingSettlementId,
                         "UPI",
                         "",
                         true
                       );
                     }}
                   >
                     Skip & Confirm
                   </button>
                 </div>
               </div>
             ) : (
               <>
                 <div className="form-grid" style={{ gap: "1rem" }}>
                   <div className="wide">
                     <label style={{ fontWeight: "bold", display: "block", marginBottom: "0.4rem" }}>Payment Method</label>
                     <div style={{ display: "flex", gap: "0.5rem" }}>
                       <label className="toggle-row" style={{ flex: 1, justifyContent: "center", padding: "0.6rem", border: "1px solid var(--line)", borderRadius: "8px", cursor: "pointer", background: settlementMethod === "UPI" ? "rgba(111, 104, 216, 0.08)" : "transparent", borderColor: settlementMethod === "UPI" ? "var(--brand)" : "var(--line)" }}>
                         <input 
                           type="radio" 
                           name="settlementMethod" 
                           checked={settlementMethod === "UPI"} 
                           onChange={() => setSettlementMethod("UPI")} 
                           style={{ marginRight: "0.4rem" }} 
                         />
                         UPI
                       </label>
                       <label className="toggle-row" style={{ flex: 1, justifyContent: "center", padding: "0.6rem", border: "1px solid var(--line)", borderRadius: "8px", cursor: "pointer", background: settlementMethod === "Cash" ? "rgba(111, 104, 216, 0.08)" : "transparent", borderColor: settlementMethod === "Cash" ? "var(--brand)" : "var(--line)" }}>
                         <input 
                           type="radio" 
                           name="settlementMethod" 
                           checked={settlementMethod === "Cash"} 
                           onChange={() => setSettlementMethod("Cash")} 
                           style={{ marginRight: "0.4rem" }} 
                         />
                         Cash
                       </label>
                     </div>
                   </div>

                   {settlementMethod === "UPI" && (
                     <div className="wide">
                       <label style={{ fontWeight: "bold", display: "block", marginBottom: "0.4rem" }}>Upload UPI Payment Proof (Optional)</label>
                       <div style={{ display: "flex", gap: "0.8rem", alignItems: "center", flexWrap: "wrap" }}>
                         <input 
                           type="file" 
                           accept="image/*" 
                           id="settlement-image-upload" 
                           style={{ display: "none" }} 
                           onChange={async (e) => {
                             const file = e.target.files[0];
                             if (file) {
                               setUploadingSettlementImage(true);
                               try {
                                 const compressedBase64 = await compressImage(file, 600, 600, 0.5);
                                 let finalUrl = "";
                                 try {
                                   const blob = base64ToBlob(compressedBase64, "image/jpeg");
                                   const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", { type: "image/jpeg" });
                                   finalUrl = await uploadImageToSupabase(compressedFile);
                                 } catch (uploadErr) {
                                   console.warn("Supabase upload failed, falling back to base64", uploadErr);
                                   finalUrl = compressedBase64;
                                 }
                                 setSettlementImage(finalUrl);
                                 setToast("Payment proof attached!");
                               } catch (err) {
                                 console.error(err);
                                 setToast("Failed to attach proof.");
                               } finally {
                                 setUploadingSettlementImage(false);
                               }
                             }
                           }} 
                         />
                         <button 
                           type="button" 
                           className="secondary tactile" 
                           disabled={uploadingSettlementImage}
                           onClick={() => document.getElementById("settlement-image-upload").click()}
                         >
                           {uploadingSettlementImage ? "Uploading..." : "Upload Screenshot"}
                         </button>
                         {settlementImage && (
                           <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                             <a 
                               href={settlementImage} 
                               target="_blank" 
                               rel="noreferrer" 
                               style={{ fontSize: "0.85rem", color: "var(--brand)", textDecoration: "underline" }}
                             >
                               Preview Proof
                             </a>
                             <button 
                               type="button" 
                               className="tactile" 
                               style={{ fontSize: "11px", padding: "3px 8px", background: "var(--line, #e2e8f0)", color: "var(--ink, #1e293b)", border: "none", borderRadius: "4px", fontWeight: "600", cursor: "pointer" }}
                               onClick={() => document.getElementById("settlement-image-upload").click()}
                             >
                               Replace
                             </button>
                             <button 
                               type="button" 
                               className="tactile danger" 
                               style={{ fontSize: "11px", padding: "3px 8px", background: "rgba(239, 68, 68, 0.1)", color: "#ef4444", border: "1px solid rgba(239, 68, 68, 0.15)", borderRadius: "4px", fontWeight: "600", cursor: "pointer" }}
                               onClick={() => setSettlementImage("")}
                             >
                               Delete
                             </button>
                           </div>
                         )}
                       </div>
                     </div>
                   )}
                 </div>

                 <div className="modal-actions" style={{ marginTop: "1.5rem" }}>
                   <button 
                     type="button" 
                     className="secondary tactile" 
                     onClick={() => setActiveSettlementModal(null)}
                   >
                     Cancel
                   </button>
                   <button 
                     type="button" 
                     className="primary tactile" 
                     disabled={uploadingSettlementImage}
                     onClick={() => {
                       if (settlementMethod === "UPI" && !settlementImage) {
                         setSettlementWarningShown(true);
                       } else {
                         executeSaveSettlement(
                           activeSettlementModal.settlementItem,
                           activeSettlementModal.paidAmt,
                           activeSettlementModal.type,
                           activeSettlementModal.existingSettlementId,
                           settlementMethod,
                           settlementImage,
                           false
                         );
                       }
                     }}
                   >
                     Confirm Payment
                   </button>
                 </div>
               </>
             )}
           </div>
         </div>
       )}
 
       {/* ========================================== */}
       {/* MODAL: ADD DOCUMENT */}
       {/* ========================================== */}
       {showAddDoc && (
         <div className="modal-backdrop">
           <form className="modal" onSubmit={handleAddDocSubmit}>
             <SectionHeader title="Share Travel Document / Google Drive Link" action={<button type="button" className="icon-button tactile" onClick={() => setShowAddDoc(false)}><X size={18} /></button>} />
             <div className="form-grid">
               <label className="wide">Document Title
                 <input 
                   value={docForm.title} 
                   onChange={(e) => setDocForm({ ...docForm, title: e.target.value })} 
                   placeholder="e.g. Flight Tickets, Hotel Booking PDF" 
                   required 
                 />
               </label>
               <label className="wide">Google Drive / Cloud Link (URL)
                 <input 
                   type="url" 
                   value={docForm.url} 
                   onChange={(e) => setDocForm({ ...docForm, url: e.target.value })} 
                   placeholder="https://drive.google.com/..." 
                   required 
                 />
               </label>
             </div>
             <div className="modal-actions">
               <button type="button" className="secondary tactile" onClick={() => setShowAddDoc(false)} disabled={sharingDoc}>Cancel</button>
               <button className="primary tactile" type="submit" disabled={sharingDoc}>
                 {sharingDoc ? "Sharing..." : "Share Link"}
               </button>
             </div>
           </form>
         </div>
       )}
 
       {/* ========================================== */}
       {/* MODAL: ADD REMINDER TASK */}
       {/* ========================================== */}
       {showAddTask && (
         <div className="modal-backdrop">
           <form className="modal" onSubmit={handleAddTaskSubmit}>
             <SectionHeader title="Add Trip Task / Reminder" action={<button type="button" className="icon-button tactile" onClick={() => setShowAddTask(false)}><X size={18} /></button>} />
             <div className="form-grid">
               <label className="wide">Reminder Title
                 <input 
                   value={taskForm.title} 
                   onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} 
                   placeholder="e.g. Pack swimming costume, checkin flights" 
                   required 
                 />
               </label>
               <label>Due Date
                 <input 
                   type="date" 
                   value={taskForm.dueDate} 
                   onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })} 
                   required 
                 />
               </label>
               <label>Time
                 <input 
                   type="time" 
                   value={taskForm.dueTime} 
                   onChange={(e) => setTaskForm({ ...taskForm, dueTime: e.target.value })} 
                 />
               </label>
               <label className="wide">Priority
                 <Select 
                   value={taskForm.priority} 
                   onChange={(val) => setTaskForm({ ...taskForm, priority: val })} 
                   options={["Low", "Medium", "High", "Urgent"]} 
                 />
               </label>
               <label className="wide">Description / Notes
                 <input 
                   value={taskForm.notes} 
                   onChange={(e) => setTaskForm({ ...taskForm, notes: e.target.value })} 
                   placeholder="e.g. carry physical copy, print tickets" 
                 />
               </label>
             </div>
             <div className="modal-actions">
               <button type="button" className="secondary tactile" onClick={() => setShowAddTask(false)} disabled={savingTask}>Cancel</button>
               <button className="primary tactile" type="submit" disabled={savingTask}>
                 {savingTask ? "Saving..." : "Add Task"}
               </button>
             </div>
           </form>
         </div>
       )}
       {viewingImage && (
         <div className="modal-backdrop" style={{ zIndex: 99999, padding: "1rem", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setViewingImage(null)}>
           <div className="modal" style={{ maxWidth: "100%", maxHeight: "100%", background: "transparent", border: "none", boxShadow: "none", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", position: "relative", padding: 0 }} onClick={e => e.stopPropagation()}>
             <button
               type="button"
               onClick={() => setViewingImage(null)}
               style={{ position: "absolute", top: "10px", right: "10px", background: "rgba(0,0,0,0.6)", color: "#fff", border: "none", borderRadius: "50%", width: "36px", height: "36px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10, backdropFilter: "blur(4px)" }}
             >
               <X size={20} />
             </button>
             <img src={viewingImage} alt="Full screen proof" style={{ maxWidth: "100%", maxHeight: "85vh", borderRadius: "8px", objectFit: "contain", background: "transparent" }} loading="lazy" />
           </div>
         </div>
       )}
       {confirmDialog && (
         <ConfirmModal
           dialog={confirmDialog}
           close={() => setConfirmDialog(null)}
         />
       )}
    </div>
  );
}
