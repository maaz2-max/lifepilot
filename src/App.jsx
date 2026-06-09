import {
  Bell,
  Bot,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  Braces,
  CloudSun,
  Copy,
  Download,
  Edit3,
  Eye,
  FileUp,
  Filter,
  Home,
  IndianRupee,
  KeyRound,
  LayoutDashboard,
  ListPlus,
  NotebookPen,
  Plus,
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
  Mail
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  clearPersistedState,
  estimateStorage,
  loadPersistedState,
  requestPersistentStorage,
  savePersistedState
} from "./storage.js";
import { AI_JSON_REFERENCE, askGeminiAssistant, FREE_GEMINI_MODELS } from "./ai.js";

const STORE_KEY = "lifepilot.state.v1";
const PIN_SESSION_KEY = "lifepilot.pin.validUntil";
const APP_PIN_HASH = "cc41d80b1697c04d19330fba23a82cfc68fb086e3445691578bfae3a3d6f3e57";
const rupee = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0
});

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
  aiMessages: [],
  gmailRecords: [],
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
    weatherEnabled: false,
    weatherLocation: ""
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
  { kind: "salary", label: "Add Salary", icon: CircleDollarSign },
  { kind: "project", label: "Add Expense Project", icon: BriefcaseBusiness },
  { kind: "credential", label: "Add Secure Credential", icon: KeyRound }
];

const dashboardNavigationItems = [
  { key: "todo", label: "Todo List", icon: CheckCircle2 },
  { key: "calendar", label: "Calendar", icon: CalendarDays },
  { key: "expenses", label: "Money & Expenses", icon: WalletCards },
  { key: "gmail", label: "Gmail Records", icon: Mail },
  { key: "vault", label: "Secure Vault", icon: KeyRound },
  { key: "tasks", label: "Tasks Manager", icon: ClipboardCheck },
  { key: "reminders", label: "Reminders", icon: Bell },
  { key: "notes", label: "Notes & Diary", icon: NotebookPen }
];

const aiQuickChips = [
  { label: "Add todo", prompt: "Add a todo task" },
  { label: "Add expense", prompt: "Add daily expense" },
  { label: "Analyze month", prompt: "Analyze this month spending, cashflow, bills, and project balances" },
  { label: "Find overdue", prompt: "Find all overdue tasks, reminders, bills, and unpaid items" },
  { label: "Split project", prompt: "Show project split balances and who owes whom" },
  { label: "Parse bank message", prompt: "Paste bank SMS or bill reminder here: " }
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
    bills: parsed?.bills || []
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
    const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
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

async function parseEmailWithGemini({ model, subject, from, date, body }) {
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
  "notes": "Short summary of transaction description"
}

Email Subject: ${subject}
Sender (From): ${from}
Email Date: ${date}
Email Snippet/Body:
${body.substring(0, 1500)}

Return ONLY the raw JSON object. Do not include markdown code block formatting (like \`\`\`json).`;

  const response = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: selectedModel,
      prompt
    })
  });

  if (!response.ok) {
    throw new Error("Gemini API call failed");
  }

  const result = await response.json();
  const data = result.data || result;
  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "{}";
  const cleanText = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  return JSON.parse(cleanText);
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
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [expenseTab, setExpenseTab] = useState("command");
  const [selectedSalary, setSelectedSalary] = useState("");
  const [selectedProject, setSelectedProject] = useState("");
  const installPrompt = useInstallPrompt();
  const notified = useRef(new Set());
  const telegramSyncSignature = useRef("");

  const [gmailSyncing, setGmailSyncing] = useState(false);
  const [gmailSyncStatus, setGmailSyncStatus] = useState("");

  const fetchGmailTransactions = async () => {
    const token = state.settings.gmailAccessToken;
    const expiry = state.settings.gmailTokenExpiry;
    if (!token || (expiry && expiry < Date.now())) {
      setToast("Gmail connection expired. Please reconnect.");
      return;
    }

    setGmailSyncing(true);
    setGmailSyncStatus("Querying Google Inbox...");

    try {
      const query = encodeURIComponent("label:INBOX (debit OR credit OR transaction OR payment OR spent OR UPI OR bank)");
      const listRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=10`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!listRes.ok) {
        throw new Error("Failed to fetch message list from Gmail API");
      }

      const listData = await listRes.json();
      const messages = listData.messages || [];

      if (!messages.length) {
        setGmailSyncStatus("No new messages found matching transaction keywords.");
        setTimeout(() => setGmailSyncing(false), 2000);
        return;
      }

      const existingEmailIds = new Set([
        ...(state.settings.gmailProcessedEmailIds || []),
        ...(state.gmailRecords || []).map((r) => r.emailId)
      ]);

      const unprocessedMessages = messages.filter((msg) => !existingEmailIds.has(msg.id));

      if (!unprocessedMessages.length) {
        setGmailSyncStatus("No new unprocessed transaction emails in Inbox.");
        setTimeout(() => setGmailSyncing(false), 2000);
        return;
      }

      setGmailSyncStatus(`Found ${unprocessedMessages.length} new message(s). Processing...`);
      const newRecords = [];

      for (let i = 0; i < unprocessedMessages.length; i++) {
        const msg = unprocessedMessages[i];
        setGmailSyncStatus(`Fetching email ${i + 1} of ${unprocessedMessages.length}...`);

        const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (!msgRes.ok) continue;

        const msgData = await msgRes.json();
        const payload = msgData.payload || {};
        const headers = payload.headers || [];

        const subject = headers.find((h) => h.name.toLowerCase() === "subject")?.value || "";
        const from = headers.find((h) => h.name.toLowerCase() === "from")?.value || "";
        const dateHeader = headers.find((h) => h.name.toLowerCase() === "date")?.value || "";

        const snippet = msgData.snippet || "";
        const bodyText = getGmailMessageBody(payload) || snippet;

        setGmailSyncStatus(`Analyzing email ${i + 1} with Gemini...`);

        try {
          const parsed = await parseEmailWithGemini({
            model: state.settings.aiModel,
            subject,
            from,
            date: dateHeader,
            body: bodyText
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
              subject,
              sender: from,
              emailDate: dateHeader
            });
          } else {
            setState((current) => ({
              ...current,
              settings: {
                ...current.settings,
                gmailProcessedEmailIds: [...(current.settings.gmailProcessedEmailIds || []), msg.id]
              }
            }));
          }
        } catch (err) {
          console.error(`Error parsing email ${msg.id} with Gemini`, err);
        }
      }

      if (newRecords.length) {
        setState((current) => ({
          ...current,
          gmailRecords: [...(current.gmailRecords || []), ...newRecords]
        }));
        setToast(`Fetched ${newRecords.length} transaction(s)!`);
      } else {
        setToast("No new transaction records found in emails.");
      }
    } catch (err) {
      console.error("Gmail sync failed", err);
      setToast("Gmail synchronization failed.");
    } finally {
      setGmailSyncing(false);
      setGmailSyncStatus("");
    }
  };

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
      [...dueTasks, ...dueReminders, ...dueBills].forEach((item) => {
        const key = `${item.id}-${today}-${hhmm.slice(0, 2)}`;
        if (notified.current.has(key)) return;
        notified.current.add(key);
        new Notification(item.title, { body: item.dueDate ? `Bill due ${formatDate(item.dueDate)}.` : "LifePilot reminder for today.", icon: "/icons/icon.svg" });
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
      const exists = Boolean(item.id);
      const record = { ...item, id: item.id || id(prefix), updatedAt: new Date().toISOString() };
      return {
        ...current,
        [collection]: exists
          ? current[collection].map((entry) => (entry.id === item.id ? record : entry))
          : [record, ...current[collection]]
      };
    }, item.id ? "Changes saved" : "Added");
  };

  const requestConfirm = ({ title, message, confirmLabel = "Confirm", tone = "danger", onConfirm }) => {
    setConfirmDialog({ title, message, confirmLabel, tone, onConfirm });
  };

  const remove = (collection, itemId, label = "item", options = {}) => {
    requestConfirm({
      title: options.title || `Delete ${label}?`,
      message: options.message || `Are you sure you want to delete this ${label}? This action cannot be undone.`,
      confirmLabel: options.confirmLabel || "Delete",
      tone: "danger",
      onConfirm: () => {
        if (options.apply) {
          updateState(options.apply, "Deleted");
          return;
        }
        updateState((current) => ({ ...current, [collection]: current[collection].filter((item) => item.id !== itemId) }), "Deleted");
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
    setActive(key);
  };

  useEffect(() => {
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
  }, [setState]);

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
      {toast && <div className="toast"><CheckCircle2 size={18} />{toast}</div>}
    </div>
  );
}

function Brand() {
  return (
    <div className="brand">
      <img src="/icons/icon.svg" alt="" />
      <div>
        <strong>LifePilot</strong>
        <span>Planner and money diary</span>
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
        <button className="icon-button tactile" title="Notifications" onClick={requestNotifications}>
          <Bell size={19} />
        </button>
        <button className="profile-chip tactile" onClick={() => setActive("settings")}>
          {state.profile?.image ? <img src={state.profile.image} alt="" /> : <UserRound size={19} />}
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
        <img src="/characters/lumi.png" alt="Lumi AI helper" />
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
              <h3>{item.title}</h3>
              <p>{item.description || item.content || item.notes || "No extra notes."}</p>
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
                        ) : <span>{subtask.title}</span>}
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

function ExpenseView({ state, expenseTab, setExpenseTab, selectedSalary, setSelectedSalary, selectedProject, setSelectedProject, openAdd, setModal, remove, upsert, requestConfirm, setToast }) {
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
      {expenseTab === "daily" && <DailyExpenses state={state} openAdd={openAdd} setModal={setModal} remove={remove} setToast={setToast} />}
      {expenseTab === "bills" && <BillsView state={state} openAdd={openAdd} setModal={setModal} remove={remove} upsert={upsert} />}
      {expenseTab === "salary" && <SalaryView state={state} selectedSalary={selectedSalary} setSelectedSalary={setSelectedSalary} openAdd={openAdd} setModal={setModal} remove={remove} />}
      {expenseTab === "projects" && <ProjectsView state={state} selectedProject={selectedProject} setSelectedProject={setSelectedProject} openAdd={openAdd} setModal={setModal} remove={remove} upsert={upsert} requestConfirm={requestConfirm} setToast={setToast} />}
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

function DailyExpenses({ state, openAdd, setModal, remove, setToast }) {
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
      <div className="money-action-row spaced">
        <button className="primary tactile" onClick={() => openAdd("expense")}><Plus size={18} />Add Entry</button>
        <button className="icon-button tactile pdf-tab-icon" type="button" title="Download daily PDF" aria-label="Download daily PDF" onClick={downloadDailyReport}><Download size={16} /></button>
      </div>
      <RecordTable list={list} type="expense" setModal={setModal} remove={(id) => remove("expenses", id, "daily expense")} />
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
  return (
    <div>
      <Toolbar query={query} setQuery={setQuery} filter={filter} setFilter={setFilter} options={["All", "Unpaid", "Paid", "Overdue", "Due soon", "This month"]} />
      <MetricGrid metrics={[["Unpaid bills", sum(unpaid)], ["Paid bills", sum(state.bills, (bill) => bill.status === "Paid")], ["Overdue", sum(overdue)], ["Due soon", sum(dueSoon)]]} />
      <button className="primary tactile spaced" onClick={() => openAdd("bill")}><Plus size={18} />Add Bill</button>
      <div className="record-table">
        {list.length ? list.map((bill) => (
          <div className="transaction-row" key={bill.id}>
            <div>
              <strong>{bill.title}</strong>
              <small>{bill.status} - due {formatDate(bill.dueDate)} - reminder {bill.reminderBefore || "None"}</small>
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

function SalaryView({ state, selectedSalary, setSelectedSalary, openAdd, setModal, remove }) {
  const active = state.salaries.find((salary) => salary.id === selectedSalary) || state.salaries[0];
  const linked = active ? state.salaryExpenses.filter((expense) => expense.salaryId === active.id) : [];
  const spent = sum(linked, (expense) => expense.type !== "Credit");
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
            <RecordTable list={linked} type="salaryExpense" setModal={setModal} remove={(id) => remove("salaryExpenses", id, "salary-linked expense")} />
            <button className="secondary danger tactile spaced" onClick={() => remove("salaries", active.id, "salary")}>Delete Salary</button>
          </>
        ) : <EmptyState text="Select or create a salary record." />}
      </div>
    </div>
  );
}

function ProjectsView({ state, selectedProject, setSelectedProject, openAdd, setModal, remove, upsert, requestConfirm, setToast }) {
  const active = state.projects.find((project) => project.id === selectedProject) || null;
  const transactions = active ? state.projectTransactions.filter((item) => item.projectId === active.id).sort(sortByDateDesc) : [];
  const [projectTab, setProjectTab] = useState("transactions");
  const shareText = active ? buildProjectShareText(active, transactions) : "";
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

  return (
    <div className="split-view">
      <div>
        <button className="primary tactile spaced" onClick={() => openAdd("project")}><Plus size={18} />Create Project</button>
        <div className="list-grid project-card-grid">
          {state.projects.length ? state.projects.map((project) => <ProjectCard key={project.id} state={state} project={project} active={active?.id === project.id} onClick={() => setSelectedProject(active?.id === project.id ? "" : project.id)} />) : <EmptyState text="No active expense projects. Create a trip, renovation, or custom project." />}
        </div>
      </div>
      <div className="sub-panel">
        {active ? (
          <>
            <SectionHeader title={active.name} action={<button className="secondary tactile" onClick={() => setModal({ kind: "project", item: active })}>Edit</button>} />
            <ProjectDashboard state={state} project={active} />
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
              <DateGroupedRecordTable list={transactions} type="projectTransaction" setModal={setModal} remove={(id) => remove("projectTransactions", id, "project transaction")} />
            ) : (
              <ProjectSplitView project={active} transactions={transactions} upsert={upsert} requestConfirm={requestConfirm} />
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
        <div className="profile-large">
          {state.profile?.image ? <img src={state.profile.image} alt="" /> : <UserRound size={42} />}
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
      upsert("projects", { ...modal.item, participants: splitParticipants(form.participants) }, "project");
      close();
      return;
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
        <SectionHeader title={modal.item ? `Edit ${kindLabel(modal.kind)}` : `Add ${kindLabel(modal.kind)}`} action={<button type="button" className="icon-button tactile" onClick={close}><X size={18} /></button>} />
        <div className="form-grid">
          {fieldsForKind(modal.kind, state, form).map((field) => <Field key={field.name} field={field} value={form[field.name]} set={set} />)}
          {error && <p className="validation wide">{error}</p>}
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary tactile" onClick={close}>Cancel</button>
          <button className="primary tactile" type="submit">{modal.item ? "Save Changes" : "Add"}</button>
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
      <section className={`confirm-modal ${dialog.tone || "danger"}`}>
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
  const [model, setModel] = useState(state.settings.aiModel || FREE_GEMINI_MODELS[0].id);
  const messagesEndRef = useRef(null);
  const messages = state.aiMessages || [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, loading, jsonToolsOpen]);

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

    const bankParse = parseBankMessage(text);
    if (bankParse) {
      addMessage({
        role: "ai",
        text: bankParse.needsReview
          ? "I found a bank-style message but need you to confirm the missing fields before saving."
          : "I parsed this bank message. Choose where to save it, review the fields, then confirm.",
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
            <p className="eyebrow">Free Gemini AI</p>
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
          <p className="ai-provider-note">MLVoca models use a public no-key endpoint. They can be slower and are best as a fallback when Gemini limits are busy.</p>
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
          <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="Paste bank SMS, bill reminder, or ask LifePilot AI" rows={2} />
          <button className="primary tactile" type="submit" disabled={loading}><SendHorizontal size={18} /></button>
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
    setState((current) => ({
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
    }));
  };

  const apply = () => {
    try {
      const data = JSON.parse(draft);
      setState((current) => resolveSingleAiAction(current, messageId, actionIndex, action, data));
      setToast(operation === "delete" ? "Deleted" : operation === "edit" ? "Changes saved" : "Added");
      setDone(true);
    } catch {
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
    <div className={`ai-action-card bank-parse-card ${saved ? "done" : ""}`}>
      <strong>{saved ? "Saved" : "Bank message parsed"}</strong>
      <small>Parsed confidence: {parsed.confidence}. Review before saving.</small>
      <div className="form-grid compact-form">
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
        <button className="primary tactile" type="button" onClick={save} disabled={saved}>{saved ? "Saved" : "Confirm & Save"}</button>
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

function renderMarkdownContent(rawText) {
  const lines = String(rawText || "").split("\n");
  const blocks = [];
  let currentList = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isBullet = /^[*-]\s+(.*)/.test(line.trim());

    if (isBullet) {
      const content = line.trim().replace(/^[*-]\s+/, "");
      if (!currentList) {
        currentList = [];
      }
      currentList.push(content);
    } else {
      if (currentList) {
        blocks.push({ type: "list", items: currentList });
        currentList = null;
      }
      if (line.trim() !== "") {
        if (blocks.length > 0 && blocks[blocks.length - 1].type === "paragraph" && lines[i - 1]?.trim() !== "") {
          blocks[blocks.length - 1].text += " " + line.trim();
        } else {
          blocks.push({ type: "paragraph", text: line.trim() });
        }
      }
    }
  }
  if (currentList) {
    blocks.push({ type: "list", items: currentList });
  }

  const formatText = (str) => {
    const parts = str.split(/(\*\*.*?\*\*)/);
    return parts.map((part, idx) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={idx}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  return blocks.map((block, idx) => {
    if (block.type === "list") {
      return (
        <ul key={idx} className="ai-list">
          {block.items.map((item, itemIdx) => (
            <li key={itemIdx}>{formatText(item)}</li>
          ))}
        </ul>
      );
    }
    return (
      <p key={idx} className="ai-paragraph">
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
          <tr>{parsed.table.headers.map((header) => <th key={header}>{header}</th>)}</tr>
        </thead>
        <tbody>
          {parsed.table.rows.map((row, index) => (
            <tr key={index}>{row.map((cell, cellIndex) => <td className={hasMoney(cell) ? "money-cell" : ""} key={`${index}-${cellIndex}`}>{cell}</td>)}</tr>
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
          <img src="/icons/icon.svg" alt="" />
          <div>
            <h1>${escapeHtml(reportTitle)}</h1>
            <div class="meta">Generated ${new Date().toLocaleString("en-IN")} - ${transactions.length} records</div>
          </div>
          <button class="back-button" type="button" onclick="if (window.opener) window.opener.focus(); window.close();">Back to app</button>
        </header>
        <img class="watermark-logo" src="/icons/icon.svg" alt="" />
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
  return null;
}

function parseBankMessage(text) {
  const raw = String(text || "").trim();
  const lower = raw.toLowerCase();
  const bankWords = /(bill|due|statement|minimum amount|min amt|payment reminder|debited|credited|debit|credit|spent|withdrawn|received|deposited|transaction|upi|imps|neft|rtgs|a\/c|acct|account|card|available balance|avl bal|inr|rs\.?|\u20b9)/i;
  if (!bankWords.test(raw)) return null;
  const amountMatch = raw.match(/(?:inr|rs\.?|\u20b9)\s*([\d,]+(?:\.\d{1,2})?)/i) || raw.match(/([\d,]+(?:\.\d{1,2})?)\s*(?:inr|rs\.?|\u20b9)/i);
  if (!amountMatch) return null;
  const amountValue = Number(String(amountMatch[1]).replace(/,/g, ""));
  if (!amountValue || Number.isNaN(amountValue)) return null;
  const isBillReminder = /(bill|due date|due on|pay by|payment due|minimum amount|min amt|statement|outstanding|total amount due|amount due)/i.test(lower);
  const debit = /(debited|debit|spent|paid|withdrawn|purchase|\bdr\b|sent)/i.test(lower);
  const credit = /(credited|received|deposited|refund|\bcr\b)/i.test(lower);
  const merchantMatch = raw.match(/\b(?:to|at|for|towards|from|by|biller|merchant)\s+([A-Z0-9][A-Z0-9 ._&-]{2,40})/i);
  const accountMatch = raw.match(/(?:a\/c|acct|account|card)\s*(?:xx|x+|\*)?(\d{3,6})/i);
  const extractedDate = extractMessageDate(raw, isBillReminder ? "due" : "transaction");
  const timeMatch = raw.match(/\b(\d{1,2}):(\d{2})(?:\s?([ap]m))?\b/i);
  const parsedDate = extractedDate || todayISO();
  const parsedTime = timeMatch ? normalizeSmsTime(timeMatch) : nowTime();
  const paymentMethod = /(upi)/i.test(raw) ? "UPI" : /(card)/i.test(raw) ? "Card" : /(imps|neft|rtgs)/i.test(raw) ? "Bank transfer" : "Bank";
  const type = isBillReminder ? "Debit" : debit && !credit ? "Debit" : credit && !debit ? "Credit" : "";
  const titleBase = merchantMatch?.[1]?.replace(/\s+(on|dt|date|ref|utr|a\/c|acct|account|card|rs|inr).*$/i, "").trim();
  const questions = [];
  if (!type) questions.push("Debit or credit");
  if (!titleBase && !isBillReminder) questions.push("merchant/title");
  if (!extractedDate) questions.push(isBillReminder ? "due date" : "transaction date");
  return {
    amount: amountValue,
    type: type || "Debit",
    title: titleBase || (isBillReminder ? "Bill reminder" : type === "Credit" ? "Bank credit" : "Bank transaction"),
    date: parsedDate,
    time: parsedTime,
    destination: isBillReminder ? "bill" : "daily",
    billStatus: isBillReminder ? "Unpaid" : "Paid",
    reminderBefore: isBillReminder ? "1 day" : "None",
    paymentMethod,
    confidence: type && (titleBase || isBillReminder) && extractedDate ? "High" : "Review needed",
    needsReview: !type || (!titleBase && !isBillReminder) || !extractedDate,
    questions,
    notes: [`Parsed from ${isBillReminder ? "bill reminder" : "bank message"}`, accountMatch ? `Account/card ending ${accountMatch[1]}` : "", raw].filter(Boolean).join("\n")
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
    return {
      ...current,
      [collection]: current[collection].map((item) =>
        item.id === action.id
          ? { ...item, ...normalizeForm(action.type, data), id: item.id, updatedAt: new Date().toISOString() }
          : item
      )
    };
  }

  const record = {
    ...normalizeForm(action.type, withAiDefaults(action.type, data)),
    id: id(action.type),
    updatedAt: new Date().toISOString()
  };
  return { ...current, [collection]: [record, ...current[collection]] };
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
  return data;
}

function applyAiDelete(current, collection, action) {
  const next = { ...current, [collection]: current[collection].filter((item) => item.id !== action.id) };
  if (action.type === "project") {
    next.projectTransactions = current.projectTransactions.filter((item) => item.projectId !== action.id);
  }
  if (action.type === "salary") {
    next.salaryExpenses = current.salaryExpenses.filter((item) => item.salaryId !== action.id);
  }
  return next;
}

function operationLabel(operation) {
  return { create: "Create", edit: "Save Edit", delete: "Delete" }[operation] || "Apply";
}

function actionDoneLabel(operation) {
  return { create: "Created", edit: "Updated", delete: "Deleted", created: "Created", updated: "Updated", deleted: "Deleted", cancelled: "Cancelled" }[operation] || "Done";
}

function Field({ field, value, set }) {
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
  const normalizedType = field.type === "date" || field.type === "month" ? "text" : field.type || "text";
  const placeholder = field.type === "date" ? "YYYY-MM-DD" : field.type === "month" ? "YYYY-MM" : "";
  const pattern = field.type === "date" ? "\\d{4}-\\d{2}-\\d{2}" : field.type === "month" ? "\\d{4}-\\d{2}" : undefined;
  return <label className={field.wide ? "wide" : ""}>{field.label}<input type={normalizedType} inputMode={field.type === "date" || field.type === "month" ? "numeric" : undefined} placeholder={placeholder} pattern={pattern} min={field.min} value={value || ""} onChange={(e) => set(field.name, e.target.value)} required={field.required} /></label>;
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

function EmptyState({ text, small = false }) {
  return <div className={`empty-state ${small ? "small" : ""}`}><NotebookPen size={small ? 18 : 28} /><p>{text}</p></div>;
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

function RecordTable({ list, type, setModal, remove }) {
  return (
    <div className="record-table">
      {list.length ? list.map((item) => (
        <div className="transaction-row" key={item.id}>
          <div>
            <strong>{item.title}</strong>
            <small>{item.category || item.source} - {formatDate(item.date || item.receivedDate)}</small>
          </div>
          <span className={item.type === "Credit" ? "credit" : "debit"}>{item.amount ? rupee.format(amount(item.amount)) : item.status}</span>
          <button className="icon-button tactile" onClick={() => setModal({ kind: type, item })}><Edit3 size={16} /></button>
          <button className="icon-button tactile danger" onClick={() => remove(item.id)}><Trash2 size={16} /></button>
        </div>
      )) : <EmptyState text="No records match this view." />}
    </div>
  );
}

function DateGroupedRecordTable({ list, type, setModal, remove }) {
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
          <RecordTable list={groups[date].sort(sortByTimeDesc)} type={type} setModal={setModal} remove={remove} />
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

function ProjectSplitView({ project, transactions, upsert, requestConfirm }) {
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
      amount: Math.round(safeAmount),
      paymentType,
      paidAt: new Date().toISOString()
    };
    upsert("projects", { ...project, paidSettlements: [paid, ...(project.paidSettlements || [])] }, "project");
    setCustomSettlementKey("");
    setCustomAmount("");
  };
  const deleteSettlementPaid = (settlement) => {
    const applyDelete = () => {
      upsert("projects", { ...project, paidSettlements: (project.paidSettlements || []).filter((item) => item.id !== settlement.id) }, "project");
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
    upsert("projects", {
      ...project,
      paidSettlements: (project.paidSettlements || []).map((item) =>
        item.id === settlement.id
          ? { ...item, amount: Math.round(safeAmount), paymentType: safeAmount >= max ? "Full" : "Custom", updatedAt: new Date().toISOString() }
          : item
      )
    }, "project");
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
            <span>Paid {rupee.format(item.paid)}</span>
            <span>Share {rupee.format(item.share)}</span>
            <b className={item.balance >= 0 ? "credit" : "debit"}>{item.balance >= 0 ? "Should receive" : "Should pay"} {rupee.format(Math.abs(item.balance))}</b>
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
                    min="1"
                    max={Math.round(item.amount)}
                    placeholder={`Max ${Math.round(item.amount)}`}
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
                  setEditingAmount(String(Math.round(amount(item.amount))));
                }}>Edit</button>
                <button className="secondary danger tactile" type="button" onClick={() => deleteSettlementPaid(item)}>Delete</button>
              </div>
            </div>
            <small className="settlement-meta">{item.paidAt ? new Date(item.paidAt).toLocaleString("en-IN") : ""}{item.updatedAt ? ` - edited ${new Date(item.updatedAt).toLocaleString("en-IN")}` : ""}</small>
            {editingSettlementId === item.id && (
              <div className="settlement-edit-row">
                <label>Edit paid amount
                  <input
                    value={editingAmount}
                    onChange={(event) => setEditingAmount(event.target.value)}
                    type="number"
                    min="1"
                    max={Math.round(editableMax(item))}
                    placeholder={`Max ${Math.round(editableMax(item))}`}
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
  const rawStats = names.map((name) => {
    const paid = debitTransactions.reduce((total, item) => {
      const mode = splitModeOf(item);
      const hasEqualSplit = mode === "Equal split" && (item.participants || []).filter(Boolean).length > 0;
      const hasDirectOwed = mode === "Direct owed" && item.owedBy;
      return item.paidBy === name && (hasEqualSplit || hasDirectOwed) ? total + amount(item.amount) : total;
    }, 0);
    const share = debitTransactions.reduce((total, item) => {
      const mode = splitModeOf(item);
      if (mode === "Direct owed") return item.owedBy === name ? total + amount(item.amount) : total;
      if (mode !== "Equal split") return total;
      const splitMembers = (item.participants || []).filter(Boolean);
      return splitMembers.includes(name) ? total + amount(item.amount) / Math.max(splitMembers.length, 1) : total;
    }, 0);
    const credit = 0;
    return { name, paid, share, credit, balance: paid + credit - share };
  });
  const stats = rawStats.map((row) => {
    const paidOut = paidSettlements.filter((item) => item.from === row.name).reduce((total, item) => total + amount(item.amount), 0);
    const received = paidSettlements.filter((item) => item.to === row.name).reduce((total, item) => total + amount(item.amount), 0);
    return { ...row, settledPaid: paidOut, settledReceived: received, balance: row.balance + paidOut - received };
  });
  const activeSplitTransactions = debitTransactions.filter((item) =>
    (splitModeOf(item) === "Equal split" && (item.participants || []).filter(Boolean).length > 0) ||
    (splitModeOf(item) === "Direct owed" && item.paidBy && item.owedBy)
  );
  const expenseSplits = buildExpenseSplits(activeSplitTransactions);
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
          rows: [{ from: item.owedBy, to: item.paidBy, amount: Math.round(amount(item.amount)), label: "owes" }]
        };
      }
      const splitMembers = (item.participants || []).filter(Boolean);
      if (!item.paidBy || !splitMembers.length) return null;
      const share = amount(item.amount) / splitMembers.length;
      const rows = splitMembers
        .filter((name) => name !== item.paidBy)
        .map((name) => ({ from: name, to: item.paidBy, amount: Math.round(share), label: "owes" }));
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
    .filter((item) => item.balance < -0.5)
    .map((item) => ({ name: item.name, amount: Math.abs(item.balance) }))
    .sort((a, b) => b.amount - a.amount);
  const creditors = stats
    .filter((item) => item.balance > 0.5)
    .map((item) => ({ name: item.name, amount: item.balance }))
    .sort((a, b) => b.amount - a.amount);
  const settlements = [];
  let d = 0;
  let c = 0;
  while (d < debtors.length && c < creditors.length) {
    const amountToSettle = Math.min(debtors[d].amount, creditors[c].amount);
    if (amountToSettle > 0.5) {
      settlements.push({ from: debtors[d].name, to: creditors[c].name, amount: Math.round(amountToSettle) });
    }
    debtors[d].amount -= amountToSettle;
    creditors[c].amount -= amountToSettle;
    if (debtors[d].amount <= 0.5) d += 1;
    if (creditors[c].amount <= 0.5) c += 1;
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
    `INR ${Math.round(item.paid)}`,
    `INR ${Math.round(item.share)}`,
    item.balance >= 0 ? "Gets" : "Owes",
    `INR ${Math.round(Math.abs(item.balance))}`
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
  return (
    <div className="project-row">
      <div>
        <strong>{project.name}</strong>
        <small>{project.status} - {stats.daysRemaining} days remaining</small>
      </div>
      <Progress value={stats.usage} />
      <span>{Math.round(stats.usage)}%</span>
    </div>
  );
}

function ProjectDashboard({ state, project }) {
  const stats = projectStats(state, project);
  return (
    <>
      <MetricGrid metrics={[["Budget", amount(project.budget)], ["Total credit", stats.credit], ["Total debit", stats.debit], ["Remaining", stats.remaining], ["Overspent", stats.overspent], ["Participants", `${project.participants?.length || 0}`], ["Days remaining", `${stats.daysRemaining}`], ["Usage", `${Math.round(stats.usage)}%`]]} />
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
    task: { title: "", description: "", dueDate: baseDate, startTime: "", endTime: "", dueTime: nowTime(), todayOnly: false, priority: state.settings.defaultTaskPriority, category: "", status: "Pending", reminder: false, notes: "", subtasks: [] },
    reminder: { title: "", description: "", date: baseDate, time: state.settings.defaultReminderTime, repeat: "No repeat", priority: "Medium", notificationEnabled: true, status: "Active" },
    note: { title: "", content: "", date: baseDate, category: "", reminder: false, pinned: false },
    event: { title: "", description: "", startDate: baseDate, startTime: nowTime(), endDate: baseDate, endTime: "", location: "", category: "", reminderBefore: "", repeat: "No repeat", imported: false, status: "Scheduled" },
    expense: { title: "", amount: "", type: "Debit", category: "", date: baseDate, time: nowTime(), paymentMethod: "UPI", splitMode: "No split", paidBy: "", owedBy: "", participants: "", notes: "", reminder: false },
    bill: { title: "", amount: "", dueDate: baseDate, status: "Unpaid", reminderBefore: "1 day", category: "Bills", paymentMethod: "", notes: "" },
    salary: { title: "Salary", amount: "", receivedDate: baseDate, month: baseDate.slice(0, 7), source: "", paymentMethod: "Bank transfer", notes: "", budgetPlan: "" },
    salaryExpense: { salaryId: context.salaryId || "", title: "", amount: "", type: "Debit", category: "", date: baseDate, paymentMethod: "UPI", notes: "" },
    project: { name: "", type: "Trip", description: "", startDate: baseDate, endDate: baseDate, budget: "", participants: "", newParticipant: "", status: "Active", notes: "" },
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
      { name: "status", label: "Status", type: "select", options: ["Active", "Completed", "Expired", "Cancelled"] }
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
  if (["task", "reminder", "note", "event", "expense", "bill", "salary", "salaryExpense", "projectTransaction"].includes(kind) && !form.title?.trim()) return "Title is required.";
  if (kind === "project" && !form.name?.trim()) return "Project name is required.";
  if (kind === "category" && !form.name?.trim()) return "Category name is required.";
  if (kind === "credential" && !form.title?.trim()) return "Credential name is required.";
  if (kind === "profile" && (!form.name?.trim() || !form.dob)) return "Name and date of birth are required.";
  if (["expense", "bill", "salary", "salaryExpense", "projectTransaction"].includes(kind) && amount(form.amount) <= 0) return "Amount must be greater than zero.";
  if (kind === "expense" && form.type === "Debit" && form.splitMode === "Equal split" && !splitParticipants(form.participants).length) return "Select participants for equal split, or choose No split.";
  if (kind === "expense" && form.type === "Debit" && form.splitMode === "Direct owed" && (!form.paidBy || !form.owedBy)) return "Select receiver and owed by participant.";
  if (kind === "projectTransaction" && form.type === "Debit" && form.splitMode === "Equal split" && !splitParticipants(form.participants).length) return "Select participants for equal split, or choose No split.";
  if (kind === "projectTransaction" && form.type === "Debit" && form.splitMode === "Direct owed" && (!form.paidBy || !form.owedBy)) return "Select receiver and owed by participant.";
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
    return { ...rest, participants: splitParticipants(form.participants) };
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
  return form;
}

function withAiDefaults(kind, data) {
  const date = todayISO();
  const defaults = {
    task: { title: "Task", description: "", dueDate: date, startTime: "", endTime: "", dueTime: "", todayOnly: false, priority: "Medium", category: "", status: "Pending", reminder: false, notes: "", subtasks: [] },
    reminder: { title: "Reminder", description: "", date, time: "", repeat: "No repeat", priority: "Medium", notificationEnabled: true, status: "Active" },
    note: { title: "Note", content: "", date, category: "", reminder: false, pinned: false },
    event: { title: "Event", description: "", startDate: date, startTime: "", endDate: date, endTime: "", location: "", category: "", reminderBefore: "", repeat: "No repeat", status: "Scheduled", imported: false },
    expense: { title: "Expense", amount: 0, type: "Debit", category: "", date, time: nowTime(), paymentMethod: "UPI", splitMode: "No split", paidBy: "", owedBy: "", participants: [], notes: "", reminder: false },
    bill: { title: "Bill", amount: 0, dueDate: date, status: "Unpaid", reminderBefore: "1 day", category: "Bills", paymentMethod: "", notes: "" },
    salary: { title: "Salary", amount: 0, receivedDate: date, month: date.slice(0, 7), source: "", paymentMethod: "Bank transfer", notes: "", budgetPlan: "" },
    salaryExpense: { salaryId: "", title: "Salary expense", amount: 0, type: "Debit", category: "", date, paymentMethod: "UPI", notes: "" },
    project: { name: "Project", type: "Custom", description: "", startDate: date, endDate: date, budget: 0, participants: [], status: "Active", notes: "" },
    projectTransaction: { projectId: "", title: "Project transaction", amount: 0, type: "Debit", splitMode: "No split", category: "", date, time: nowTime(), paidBy: "", owedBy: "", participants: [], paymentMethod: "UPI", notes: "" },
    category: { name: "Category", type: "Both", color: "#d8ff8f", icon: "spark" }
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
    credential: "credentials"
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
    participants: "Participants"
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
  return markers;
}

function itemsForDate(state, date) {
  return {
    tasks: state.tasks.filter((item) => item.dueDate === date).map((item) => ({ ...item, kind: "task" })),
    reminders: state.reminders.filter((item) => item.date === date).map((item) => ({ ...item, kind: "reminder" })),
    events: state.events.filter((item) => item.startDate === date).map((item) => ({ ...item, kind: "event" })),
    notes: state.notes.filter((item) => item.date === date).map((item) => ({ ...item, kind: "note" })),
    dailyTransactions: state.expenses.filter((item) => item.date === date).map((item) => ({ ...item, kind: "expense" })),
    bills: state.bills.filter((item) => item.dueDate === date).map((item) => ({ ...item, title: item.title, date: item.dueDate, kind: "bill" })),
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
    if ([3, 1, 0].includes(stats.daysRemaining)) alerts.push({ id: `${project.id}-end-${stats.daysRemaining}`, title: `${project.name} ending soon`, message: `${stats.daysRemaining === 0 ? "Ends today" : `${stats.daysRemaining} day(s) remaining`}.`, level: "soft" });
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
        acc[`${project.name}: ${row.name}`] = Math.round(Math.abs(row.balance || 0));
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

  const openEdit = (record) => {
    setEditingRecord(record);
    setEditTitle(record.title);
    setEditAmount(record.amount);
    setEditType(record.type);
    setEditCategory(record.category);
    setEditDate(record.date);
    setEditTime(record.time);
    setEditNotes(record.notes);
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
              notes: editNotes
            }
          : r
      )
    }));
    setEditingRecord(null);
    setToast("Record updated");
  };

  const deleteRecord = (record) => {
    setState((current) => ({
      ...current,
      gmailRecords: (current.gmailRecords || []).filter((r) => r.id !== record.id),
      settings: {
        ...current.settings,
        gmailProcessedEmailIds: [...(current.settings.gmailProcessedEmailIds || []), record.emailId]
      }
    }));
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
        paymentMethod: "UPI",
        splitMode: "No split",
        notes: record.notes || `Imported from Gmail: ${record.subject}`,
        createdAt: timestamp,
        updatedAt: timestamp
      };

      setState((current) => ({
        ...current,
        expenses: [...current.expenses, newExpense],
        gmailRecords: (current.gmailRecords || []).filter((r) => r.id !== record.id),
        settings: {
          ...current.settings,
          gmailProcessedEmailIds: [...(current.settings.gmailProcessedEmailIds || []), record.emailId]
        }
      }));
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
        paymentMethod: "UPI",
        notes: record.notes || `Imported from Gmail: ${record.subject}`,
        createdAt: timestamp,
        updatedAt: timestamp
      };

      setState((current) => ({
        ...current,
        projectTransactions: [...current.projectTransactions, newProjTx],
        gmailRecords: (current.gmailRecords || []).filter((r) => r.id !== record.id),
        settings: {
          ...current.settings,
          gmailProcessedEmailIds: [...(current.settings.gmailProcessedEmailIds || []), record.emailId]
        }
      }));
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
          <div className="modal-content gmail-editor-modal">
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

