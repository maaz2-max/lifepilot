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
  Copy,
  Download,
  Edit3,
  FileUp,
  Filter,
  Home,
  IndianRupee,
  LayoutDashboard,
  ListPlus,
  NotebookPen,
  Plus,
  Search,
  SendHorizontal,
  Settings,
  Sparkles,
  Tag,
  Trash2,
  Upload,
  UserRound,
  WalletCards,
  X
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
  salaries: [],
  salaryExpenses: [],
  projects: [],
  projectTransactions: [],
  aiMessages: [],
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
    aiTaskBreakdown: true
  }
};

const navItems = [
  { key: "home", label: "Home", icon: Home },
  { key: "calendar", label: "Calendar", icon: CalendarDays },
  { key: "tasks", label: "Tasks", icon: ClipboardCheck },
  { key: "reminders", label: "Reminders", icon: Bell },
  { key: "notes", label: "Notes", icon: NotebookPen },
  { key: "events", label: "Events", icon: Sparkles },
  { key: "expenses", label: "Expenses", icon: WalletCards },
  { key: "settings", label: "Settings", icon: Settings }
];

const quickActions = [
  { kind: "task", label: "Add Task", icon: ClipboardCheck },
  { kind: "reminder", label: "Add Reminder", icon: Bell },
  { kind: "note", label: "Add Note", icon: NotebookPen },
  { kind: "event", label: "Add Event", icon: Sparkles },
  { kind: "expense", label: "Add Daily Expense", icon: IndianRupee },
  { kind: "salary", label: "Add Salary", icon: CircleDollarSign },
  { kind: "project", label: "Add Expense Project", icon: BriefcaseBusiness }
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function nowTime() {
  return new Date().toTimeString().slice(0, 5);
}

function id(prefix) {
  return `${prefix}-${crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)}`;
}

function mergeState(parsed) {
  return {
    ...emptyState,
    ...(parsed || {}),
    settings: { ...emptyState.settings, ...(parsed?.settings || {}) },
    categories: parsed?.categories?.length ? parsed.categories : DEFAULT_CATEGORIES
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
  return date.toISOString().slice(0, 10);
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
      const dueTasks = state.tasks.filter((task) => task.dueDate === today && task.dueTime <= hhmm && !["Completed", "Cancelled"].includes(task.status));
      const dueReminders = state.reminders.filter((reminder) => reminder.date === today && reminder.time <= hhmm && reminder.status === "Active" && reminder.notificationEnabled);
      [...dueTasks, ...dueReminders].forEach((item) => {
        const key = `${item.id}-${today}-${hhmm.slice(0, 2)}`;
        if (notified.current.has(key)) return;
        notified.current.add(key);
        new Notification(item.title, { body: "LifePilot reminder for today.", icon: "/icons/icon.svg" });
      });
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
        reminder.status === "Active" && reminder.date < today ? { ...reminder, status: "Expired" } : reminder
      )
    }));
  }, [setState, storageReady]);

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
    setActive(key);
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

  if (!state.onboarded) {
    return <Onboarding state={state} setState={setState} setToast={setToast} />;
  }

  return (
    <div className="app-shell">
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

        {active === "home" && <HomeView state={state} openAdd={openAdd} setActive={setActive} />}
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
        {active === "tasks" && <WorkList type="task" state={state} openAdd={openAdd} setModal={setModal} remove={remove} upsert={upsert} />}
        {active === "reminders" && <WorkList type="reminder" state={state} openAdd={openAdd} setModal={setModal} remove={remove} upsert={upsert} />}
        {active === "notes" && <WorkList type="note" state={state} openAdd={openAdd} setModal={setModal} remove={remove} upsert={upsert} />}
        {active === "events" && <WorkList type="event" state={state} openAdd={openAdd} setModal={setModal} remove={remove} upsert={upsert} />}
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
        <button className={active === "settings" ? "active" : ""} onClick={() => showView("settings")}><Settings size={21} /><span>Settings</span></button>
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

function LoadingScreen() {
  return (
    <main className="onboarding">
      <section className="onboarding-panel loading-panel">
        <Brand />
        <div className="loading-orbit" />
        <h1>Preparing your offline workspace</h1>
        <p>Opening local storage and getting LifePilot ready.</p>
      </section>
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
          <button className="tactile" key={action.kind} onClick={() => openAdd(action.kind)}>
            <Icon size={18} />
            <span>{action.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function HomeView({ state, openAdd, setActive }) {
  const [range, setRange] = useState("today");
  const today = todayISO();
  const todayTasks = state.tasks.filter((task) => task.dueDate === today && (state.settings.showCompletedOnDashboard || task.status !== "Completed"));
  const todayReminders = state.reminders.filter((reminder) => reminder.date === today);
  const todayEvents = state.events.filter((event) => event.startDate === today);
  const todayNotes = state.notes.filter((note) => note.date === today);
  const money = useMoneyStats(state);
  const filteredExpenses = state.expenses.filter((expense) => inRange(expense.date, range));
  const budgetAlerts = projectAlerts(state);

  return (
    <section className="page-grid">
      <div className="hero-panel raised">
        <div>
          <p className="eyebrow">Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}</p>
          <h2>{state.profile?.name}, your day is ready.</h2>
          <p>{todayTasks.length} tasks, {todayReminders.length} reminders, {todayEvents.length} events, and {rupee.format(sum(filteredExpenses, (e) => e.type === "Debit"))} spending in view.</p>
        </div>
        {isBirthday(state.profile, today) && <div className="birthday-card">Happy Birthday, {state.profile.name}!</div>}
      </div>

      <section className="panel">
        <SectionHeader title="Quick Add" action={<Select value={range} onChange={setRange} options={rangeOptions()} />} />
        <div className="quick-grid">
          {quickActions.slice(0, 7).map((action) => {
            const Icon = action.icon;
            return <button className="quick-card tactile" key={action.kind} onClick={() => openAdd(action.kind)}><Icon size={22} />{action.label}</button>;
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
            <div className="cluster">
              <Segmented value={view} onChange={setView} options={[["month", "Month"], ["week", "Week"], ["day", "Day"]]} />
              <label className="icon-button tactile" title="Import calendar file">
                <FileUp size={18} />
                <input hidden type="file" accept=".ics,text/calendar" onChange={(e) => importFile(e.target.files?.[0])} />
              </label>
            </div>
          }
        />
        <div className="calendar-controls">
          <button className="icon-button tactile" onClick={() => setCursor(shiftCursor(cursor, view, -1))}><ChevronLeft /></button>
          <button className="secondary tactile" onClick={() => { setCursor(new Date()); setSelectedDate(todayISO()); }}>Today</button>
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
        {quickActions.slice(0, 7).map((action) => <button className="secondary tactile" key={action.kind} onClick={() => openAdd(action.kind, { date: selectedDate })}>{action.label.replace("Add ", "")}</button>)}
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

function WorkList({ type, state, openAdd, setModal, remove, upsert }) {
  const config = {
    task: { collection: "tasks", title: "Tasks", add: "task", date: "dueDate", status: ["All", "Today", "Upcoming", "Past", "Overdue", "Completed", "Pending", "In Progress", "Cancelled"] },
    reminder: { collection: "reminders", title: "Reminders", add: "reminder", date: "date", status: ["All", "Today", "Upcoming", "Past", "Expired", "Completed", "Repeating"] },
    note: { collection: "notes", title: "Notes", add: "note", date: "date", status: ["All", "Today", "Pinned"] },
    event: { collection: "events", title: "Events", add: "event", date: "startDate", status: ["All", "Today", "Upcoming", "Past", "Imported", "Completed"] }
  }[type];
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const list = state[config.collection]
    .filter((item) => matchesQuery(item, query))
    .filter((item) => matchesListFilter(item, filter, config.date));

  return (
    <section className="panel">
      <SectionHeader title={config.title} action={<button className="primary tactile" onClick={() => openAdd(config.add)}><Plus size={18} />Add</button>} />
      <Toolbar query={query} setQuery={setQuery} filter={filter} setFilter={setFilter} options={config.status} />
      <div className="list-grid">
        {list.length ? list.map((item) => (
          <article className={`record-card ${type}`} key={item.id}>
            <div>
              <p className="eyebrow">{item.category || item.priority || item.status || (item.imported ? "Imported" : "")}</p>
              <h3>{item.title}</h3>
              <p>{item.description || item.content || item.notes || "No extra notes."}</p>
              <small>{formatDate(item[config.date])} {item.time || item.dueTime || item.startTime || ""}</small>
            </div>
            <div className="record-actions">
              {(type === "task" || type === "reminder") && (
                <button className="icon-button tactile" title="Mark completed" onClick={() => upsert(config.collection, { ...item, status: "Completed" }, type)}>
                  <CheckCircle2 size={17} />
                </button>
              )}
              {type === "note" && (
                <button className="icon-button tactile" title="Pin note" onClick={() => upsert(config.collection, { ...item, pinned: !item.pinned }, type)}>
                  <Tag size={17} />
                </button>
              )}
              <button className="icon-button tactile" title="Edit" onClick={() => setModal({ kind: type, item })}><Edit3 size={17} /></button>
              <button className="icon-button danger tactile" title="Delete" onClick={() => remove(config.collection, item.id, type)}><Trash2 size={17} /></button>
            </div>
          </article>
        )) : <EmptyState text={`No ${config.title.toLowerCase()} match this view.`} />}
      </div>
    </section>
  );
}

function ExpenseView({ state, expenseTab, setExpenseTab, selectedSalary, setSelectedSalary, selectedProject, setSelectedProject, openAdd, setModal, remove, upsert, requestConfirm }) {
  const tabs = [["command", "Command"], ["daily", "Daily"], ["salary", "Salary"], ["projects", "Projects"], ["analytics", "Analytics"]];
  return (
    <section className="panel">
      <SectionHeader title="Money Command Center" action={<Segmented value={expenseTab} onChange={setExpenseTab} options={tabs} />} />
      {expenseTab === "command" && <MoneyCommand state={state} openAdd={openAdd} />}
      {expenseTab === "daily" && <DailyExpenses state={state} openAdd={openAdd} setModal={setModal} remove={remove} />}
      {expenseTab === "salary" && <SalaryView state={state} selectedSalary={selectedSalary} setSelectedSalary={setSelectedSalary} openAdd={openAdd} setModal={setModal} remove={remove} />}
      {expenseTab === "projects" && <ProjectsView state={state} selectedProject={selectedProject} setSelectedProject={setSelectedProject} openAdd={openAdd} setModal={setModal} remove={remove} upsert={upsert} requestConfirm={requestConfirm} />}
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

function DailyExpenses({ state, openAdd, setModal, remove }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("This month");
  const list = state.expenses.filter((item) => matchesQuery(item, query)).filter((item) => matchesMoneyFilter(item, filter));
  return (
    <div>
      <Toolbar query={query} setQuery={setQuery} filter={filter} setFilter={setFilter} options={["All", "Today", "This week", "This month", "Last month", "Credit", "Debit"]} />
      <MetricGrid metrics={[["Daily Credit", sum(list, (e) => e.type === "Credit")], ["Daily Debit", sum(list, (e) => e.type === "Debit")], ["Balance", sum(list, (e) => e.type === "Credit") - sum(list, (e) => e.type === "Debit")], ["Today's Spending", sum(state.expenses, (e) => e.date === todayISO() && e.type === "Debit")]]} />
      <button className="primary tactile spaced" onClick={() => openAdd("expense")}><Plus size={18} />Add Entry</button>
      <RecordTable list={list} type="expense" setModal={setModal} remove={(id) => remove("expenses", id, "daily expense")} />
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

function ProjectsView({ state, selectedProject, setSelectedProject, openAdd, setModal, remove, upsert }) {
  const active = state.projects.find((project) => project.id === selectedProject) || state.projects[0];
  const transactions = active ? state.projectTransactions.filter((item) => item.projectId === active.id) : [];
  return (
    <div className="split-view">
      <div>
        <button className="primary tactile spaced" onClick={() => openAdd("project")}><Plus size={18} />Create Project</button>
        <div className="list-grid">
          {state.projects.length ? state.projects.map((project) => <ProjectCard key={project.id} state={state} project={project} active={active?.id === project.id} onClick={() => setSelectedProject(project.id)} />) : <EmptyState text="No active expense projects. Create a trip, renovation, or custom project." />}
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
              {active.status === "Paused" ? <button className="secondary tactile" onClick={() => upsert("projects", { ...active, status: "Active" }, "project")}>Continue</button> : <button className="secondary tactile" onClick={() => upsert("projects", { ...active, status: "Paused" }, "project")}>Pause</button>}
              <button className="secondary tactile" onClick={() => upsert("projects", { ...active, status: "Completed" }, "project")}>End</button>
            </div>
            <RecordTable list={transactions} type="projectTransaction" setModal={setModal} remove={(id) => remove("projectTransactions", id, "project transaction")} />
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
        ) : <EmptyState text="Select or create a project." />}
      </div>
    </div>
  );
}

function Analytics({ state }) {
  const transactions = allTransactions(state);
  const byCategory = groupAmounts(transactions.filter((item) => item.type === "Debit"), "category");
  const byMonth = groupByMonth(transactions.filter((item) => item.type === "Debit"));
  const money = useMoneyStats(state);
  return (
    <div className="analytics-grid">
      <MetricGrid metrics={[["Total credit", money.totalCredit], ["Total debit", money.totalDebit], ["Balance", money.balance], ["Highest category", highestLabel(byCategory)]]} />
      <Chart title="Category-wise Spending" data={byCategory} />
      <Chart title="Monthly Spending Trend" data={byMonth} />
      <section className="sub-panel">
        <SectionHeader title="Project-wise Spending" />
        {state.projects.length ? state.projects.map((project) => <ProjectRow key={project.id} state={state} project={project} />) : <EmptyState text="No project analytics yet." />}
      </section>
    </div>
  );
}

function SettingsView({ state, setState, setToast, requestNotifications, setModal, remove, upsert, requestConfirm }) {
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
          ["birthdayNotification", "Birthday notification"]
        ].map(([key, label]) => <Toggle key={key} label={label} checked={state.settings[key]} onChange={(value) => setSetting(key, value)} />)}
        <label>Repeated notification frequency<input type="number" min="2" max="3" value={state.settings.repeatHours} onChange={(e) => setSetting("repeatHours", e.target.value)} /></label>
      </div>

      <div className="panel">
        <SectionHeader title="Preferences" />
        <Toggle label="Show salary in daily dashboard" checked={state.settings.showSalaryInDaily} onChange={(value) => setSetting("showSalaryInDaily", value)} />
        <Toggle label="Show completed tasks on dashboard" checked={state.settings.showCompletedOnDashboard} onChange={(value) => setSetting("showCompletedOnDashboard", value)} />
        <label>Calendar start day<Select value={state.settings.calendarStartDay} onChange={(value) => setSetting("calendarStartDay", value)} options={[["Sunday", "Sunday"], ["Monday", "Monday"]]} /></label>
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

function EntityModal({ state, modal, close, upsert, setState, setToast }) {
  const initial = getInitialForm(modal.kind, modal.item, modal.context, state);
  const [form, setForm] = useState(initial);
  const [error, setError] = useState("");
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const submit = (event) => {
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

  const send = async (event) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    addMessage({ role: "user", text });
    setLoading(true);

    try {
      setState((current) => ({
        ...current,
        settings: { ...current.settings, aiEnabled: true, aiModel: model }
      }));
      const result = await askGeminiAssistant({ state, model, message: text });
      addMessage({ role: "ai", text: result.reply, actions: normalizeAiActions(result) });
    } catch (error) {
      addMessage({ role: "ai", text: error.busy ? "Server busy. Please try after some time." : "AI is unavailable right now. Please try again later.", actions: [] });
    } finally {
      setLoading(false);
    }
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
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Add task Homework today at 6pm" />
          <button className="primary tactile" type="submit" disabled={loading}><SendHorizontal size={18} /></button>
        </form>
        <button className="secondary tactile clear-chat" onClick={clearChat} type="button">Clear recent chat</button>
      </section>
    </div>
  );
}

function AiMessage({ state, setState, message, copyMessage, upsert, setToast }) {
  return (
    <article className={`ai-message ${message.role}`}>
      <div className="ai-message-top">
        <strong>{message.role === "user" ? "You" : "LifePilot AI"}</strong>
        <button className="icon-button tactile" title="Copy message" onClick={() => copyMessage(message.text)}><Copy size={15} /></button>
      </div>
      <MessageBody text={message.text} />
      {message.actions?.length ? (
        <div className="ai-actions">
          {message.actions.map((action, index) => <AiActionCard key={`${message.id}-${index}`} state={state} setState={setState} action={action} upsert={upsert} setToast={setToast} />)}
        </div>
      ) : null}
    </article>
  );
}

function AiActionCard({ state, setState, action, upsert, setToast }) {
  const operation = action.operation || "create";
  const [draft, setDraft] = useState(JSON.stringify(action.data || {}, null, 2));
  const [done, setDone] = useState(false);

  const apply = () => {
    try {
      const collection = collectionForKind(action.type);
      if (!collection) {
        setToast("Unsupported AI action");
        return;
      }
      if (operation === "delete") {
        setState((current) => applyAiDelete(current, collection, action));
        setToast("Deleted");
        setDone(true);
        return;
      }
      const data = JSON.parse(draft);
      if (operation === "edit") {
        setState((current) => ({
          ...current,
          [collection]: current[collection].map((item) =>
            item.id === action.id
              ? { ...item, ...normalizeForm(action.type, data), id: item.id, updatedAt: new Date().toISOString() }
              : item
          )
        }));
        setToast("Changes saved");
        setDone(true);
        return;
      }
      upsert(collection, normalizeForm(action.type, withAiDefaults(action.type, data)), action.type);
      setDone(true);
    } catch {
      setToast("Fix the action JSON before confirming");
    }
  };

  return (
    <div className={`ai-action-card ${done ? "done" : ""}`}>
      <strong>{done ? actionDoneLabel(operation) : action.summary || `${operationLabel(operation)} ${kindLabel(action.type)}`}</strong>
      {operation !== "create" && action.id && <small>ID: {action.id}</small>}
      {operation !== "delete" && <textarea value={draft} onChange={(e) => setDraft(e.target.value)} disabled={done} />}
      <div className="cluster">
        <button className="primary tactile" type="button" onClick={apply} disabled={done}>{done ? "Done" : `Confirm & ${operationLabel(operation)}`}</button>
        <button className="secondary tactile" type="button" onClick={() => setDone(true)} disabled={done}>Cancel</button>
      </div>
    </div>
  );
}

function MessageBody({ text }) {
  const table = parseMarkdownTable(text);
  if (!table) return <p>{text}</p>;
  return (
    <div className="ai-table-wrap">
      <table className="ai-table">
        <thead>
          <tr>{table.headers.map((header) => <th key={header}>{header}</th>)}</tr>
        </thead>
        <tbody>
          {table.rows.map((row, index) => (
            <tr key={index}>{row.map((cell, cellIndex) => <td key={`${index}-${cellIndex}`}>{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
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

function normalizeAiActions(parsed) {
  const rawActions = Array.isArray(parsed) ? parsed : parsed.actions;
  if (!Array.isArray(rawActions)) return [];
  return rawActions
    .map((action) => ({
      operation: action.operation || "create",
      type: action.type,
      id: action.id || "",
      summary: action.summary || "",
      data: action.data || {}
    }))
    .filter((action) => {
      const validOperation = ["create", "edit", "delete"].includes(action.operation);
      const validType = Boolean(collectionForKind(action.type));
      const hasPayload = action.operation === "delete" ? Boolean(action.id) : Boolean(action.data);
      return validOperation && validType && hasPayload;
    });
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
  return { create: "Created", edit: "Updated", delete: "Deleted" }[operation] || "Done";
}

function Field({ field, value, set }) {
  if (field.type === "textarea") return <label className={field.wide ? "wide" : ""}>{field.label}<textarea value={value || ""} onChange={(e) => set(field.name, e.target.value)} required={field.required} /></label>;
  if (field.type === "select") return <label className={field.wide ? "wide" : ""}>{field.label}<Select value={value || ""} onChange={(next) => set(field.name, next)} options={field.options} /></label>;
  if (field.type === "checkbox") return <label className="toggle-row"><input type="checkbox" checked={Boolean(value)} onChange={(e) => set(field.name, e.target.checked)} />{field.label}</label>;
  if (field.type === "file") return <label className={field.wide ? "wide" : ""}>{field.label}<input type="file" accept="image/*" onChange={(e) => readImage(e.target.files?.[0], (image) => set(field.name, image))} /></label>;
  const normalizedType = field.type === "date" || field.type === "month" ? "text" : field.type || "text";
  const placeholder = field.type === "date" ? "YYYY-MM-DD" : field.type === "month" ? "YYYY-MM" : "";
  const pattern = field.type === "date" ? "\\d{4}-\\d{2}-\\d{2}" : field.type === "month" ? "\\d{4}-\\d{2}" : undefined;
  return <label className={field.wide ? "wide" : ""}>{field.label}<input type={normalizedType} inputMode={field.type === "date" || field.type === "month" ? "numeric" : undefined} placeholder={placeholder} pattern={pattern} min={field.min} value={value || ""} onChange={(e) => set(field.name, e.target.value)} required={field.required} /></label>;
}

function Select({ value, onChange, options }) {
  const normalized = options.map((option) => Array.isArray(option) ? option : [option, option]);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {normalized.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
    </select>
  );
}

function Segmented({ value, onChange, options }) {
  return (
    <div className="segmented">
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
      <div><strong>{item.title}</strong><small>{item.source} · {formatDate(item.date)}</small></div>
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
            <small>{item.category || item.source} · {formatDate(item.date || item.receivedDate)}</small>
          </div>
          <span className={item.type === "Credit" ? "credit" : "debit"}>{item.amount ? rupee.format(amount(item.amount)) : item.status}</span>
          <button className="icon-button tactile" onClick={() => setModal({ kind: type, item })}><Edit3 size={16} /></button>
          <button className="icon-button tactile danger" onClick={() => remove(item.id)}><Trash2 size={16} /></button>
        </div>
      )) : <EmptyState text="No records match this view." />}
    </div>
  );
}

function ProjectCard({ state, project, active, onClick }) {
  const stats = projectStats(state, project);
  return (
    <button className={`record-card tactile ${active ? "selected" : ""}`} onClick={onClick}>
      <h3>{project.name}</h3>
      <p>{project.type} · {project.status}</p>
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
        <small>{project.status} · {stats.daysRemaining} days remaining</small>
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
      <MetricGrid metrics={[["Budget", amount(project.budget)], ["Total credit", stats.credit], ["Total debit", stats.debit], ["Remaining", stats.remaining], ["Overspent", stats.overspent], ["Participants", project.participants?.length || 0], ["Days remaining", `${stats.daysRemaining}`], ["Usage", `${Math.round(stats.usage)}%`]]} />
      <Progress value={stats.usage} />
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

function Chart({ title, data }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...entries.map(([, value]) => value), 1);
  return (
    <section className="sub-panel">
      <SectionHeader title={title} />
      {entries.length ? entries.map(([label, value]) => (
        <div className="chart-row" key={label}>
          <span>{label}</span>
          <i style={{ width: `${(value / max) * 100}%` }} />
          <strong>{rupee.format(value)}</strong>
        </div>
      )) : <EmptyState text="Charts appear when you add real records." />}
    </section>
  );
}

function getInitialForm(kind, item, context = {}, state) {
  const baseDate = context.date || todayISO();
  const defaults = {
    task: { title: "", description: "", dueDate: baseDate, dueTime: nowTime(), priority: state.settings.defaultTaskPriority, category: "", status: "Pending", reminder: false, notes: "" },
    reminder: { title: "", description: "", date: baseDate, time: state.settings.defaultReminderTime, repeat: "No repeat", priority: "Medium", notificationEnabled: true, status: "Active" },
    note: { title: "", content: "", date: baseDate, category: "", reminder: false, pinned: false },
    event: { title: "", description: "", startDate: baseDate, startTime: nowTime(), endDate: baseDate, endTime: "", location: "", category: "", reminderBefore: "", repeat: "No repeat", imported: false, status: "Scheduled" },
    expense: { title: "", amount: "", type: "Debit", category: "", date: baseDate, time: nowTime(), paymentMethod: "UPI", notes: "", reminder: false },
    salary: { title: "Salary", amount: "", receivedDate: baseDate, month: baseDate.slice(0, 7), source: "", paymentMethod: "Bank transfer", notes: "", budgetPlan: "" },
    salaryExpense: { salaryId: context.salaryId || "", title: "", amount: "", type: "Debit", category: "", date: baseDate, paymentMethod: "UPI", notes: "" },
    project: { name: "", type: "Trip", description: "", startDate: baseDate, endDate: baseDate, budget: "", participants: "", status: "Active", notes: "" },
    projectTransaction: { projectId: context.projectId || "", title: "", amount: "", type: "Debit", category: "", date: baseDate, time: nowTime(), paidBy: "", participants: "", paymentMethod: "UPI", notes: "" },
    category: { name: "", type: "Debit", color: "#f2b8a2", icon: "" },
    profile: { ...state.profile },
    participants: { participants: (item?.participants || []).join(", ") }
  };
  const merged = { ...defaults[kind], ...(item || {}) };
  if (kind === "project" && Array.isArray(merged.participants)) merged.participants = merged.participants.join(", ");
  if (kind === "projectTransaction" && Array.isArray(merged.participants)) merged.participants = merged.participants.join(", ");
  return merged;
}

function fieldsForKind(kind, state) {
  const categoryOptions = [["", "Select category"], ...state.categories.map((category) => [category.name, category.name])];
  const projectOptions = [["", "Select project"], ...state.projects.map((project) => [project.id, project.name])];
  const salaryOptions = [["", "Select salary"], ...state.salaries.map((salary) => [salary.id, salary.title])];
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
      { name: "dueDate", label: "Due date", type: "date", required: true },
      { name: "dueTime", label: "Due time", type: "time" },
      { name: "priority", label: "Priority", type: "select", options: ["Low", "Medium", "High", "Urgent"] },
      { name: "category", label: "Category", type: "select", options: categoryOptions },
      { name: "status", label: "Status", type: "select", options: ["Pending", "In Progress", "Completed", "Cancelled", "Overdue"] },
      { name: "reminder", label: "Reminder option", type: "checkbox" },
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
    expense: [...commonMoney.slice(0, 4), { name: "date", label: "Date", type: "date", required: true }, { name: "time", label: "Time", type: "time" }, ...commonMoney.slice(4), { name: "reminder", label: "Optional reminder", type: "checkbox" }],
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
      { name: "participants", label: "Participants", wide: true },
      { name: "status", label: "Project status", type: "select", options: ["Active", "Paused", "Completed", "Cancelled", "Archived"] },
      { name: "notes", label: "Notes", type: "textarea", wide: true }
    ],
    projectTransaction: [{ name: "projectId", label: "Project", type: "select", options: projectOptions, required: true }, ...commonMoney.slice(0, 4), { name: "date", label: "Date", type: "date", required: true }, { name: "time", label: "Time", type: "time" }, { name: "paidBy", label: "Paid by" }, { name: "participants", label: "Participants involved" }, ...commonMoney.slice(4)],
    category: [
      { name: "name", label: "Category name", required: true },
      { name: "type", label: "Category type", type: "select", options: ["Credit", "Debit", "Both"] },
      { name: "icon", label: "Icon name" },
      { name: "color", label: "Color", type: "color" }
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
      { name: "participants", label: "Participants", wide: true }
    ]
  }[kind];
}

function validateForm(kind, form) {
  if (["task", "reminder", "note", "event", "expense", "salary", "salaryExpense", "projectTransaction"].includes(kind) && !form.title?.trim()) return "Title is required.";
  if (kind === "project" && !form.name?.trim()) return "Project name is required.";
  if (kind === "category" && !form.name?.trim()) return "Category name is required.";
  if (kind === "profile" && (!form.name?.trim() || !form.dob)) return "Name and date of birth are required.";
  if (["expense", "salary", "salaryExpense", "projectTransaction"].includes(kind) && amount(form.amount) <= 0) return "Amount must be greater than zero.";
  if (kind === "project" && amount(form.budget) < 0) return "Budget cannot be negative.";
  return "";
}

function normalizeForm(kind, form) {
  if (kind === "project") return { ...form, participants: splitParticipants(form.participants) };
  if (kind === "projectTransaction") return { ...form, participants: splitParticipants(form.participants) };
  return form;
}

function withAiDefaults(kind, data) {
  const date = todayISO();
  const defaults = {
    task: { title: "Task", description: "", dueDate: date, dueTime: "", priority: "Medium", category: "", status: "Pending", reminder: false, notes: "" },
    reminder: { title: "Reminder", description: "", date, time: "", repeat: "No repeat", priority: "Medium", notificationEnabled: true, status: "Active" },
    note: { title: "Note", content: "", date, category: "", reminder: false, pinned: false },
    event: { title: "Event", description: "", startDate: date, startTime: "", endDate: date, endTime: "", location: "", category: "", reminderBefore: "", repeat: "No repeat", status: "Scheduled", imported: false },
    expense: { title: "Expense", amount: 0, type: "Debit", category: "", date, time: nowTime(), paymentMethod: "UPI", notes: "", reminder: false },
    salary: { title: "Salary", amount: 0, receivedDate: date, month: date.slice(0, 7), source: "", paymentMethod: "Bank transfer", notes: "", budgetPlan: "" },
    salaryExpense: { salaryId: "", title: "Salary expense", amount: 0, type: "Debit", category: "", date, paymentMethod: "UPI", notes: "" },
    project: { name: "Project", type: "Custom", description: "", startDate: date, endDate: date, budget: 0, participants: [], status: "Active", notes: "" },
    projectTransaction: { projectId: "", title: "Project transaction", amount: 0, type: "Debit", category: "", date, time: nowTime(), paidBy: "", participants: [], paymentMethod: "UPI", notes: "" },
    category: { name: "Category", type: "Both", color: "#d8ff8f", icon: "spark" }
  };

  return { ...(defaults[kind] || {}), ...data };
}

function splitParticipants(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function collectionForKind(kind) {
  return {
    task: "tasks",
    reminder: "reminders",
    note: "notes",
    event: "events",
    expense: "expenses",
    salary: "salaries",
    salaryExpense: "salaryExpenses",
    project: "projects",
    projectTransaction: "projectTransactions",
    category: "categories"
  }[kind];
}

function kindLabel(kind) {
  return {
    task: "Task",
    reminder: "Reminder",
    note: "Note",
    event: "Event",
    expense: "Daily Expense",
    salary: "Salary",
    salaryExpense: "Salary-Linked Expense",
    project: "Expense Project",
    projectTransaction: "Project Transaction",
    category: "Category",
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
    const salaryTotal = sum(state.salaries);
    const salarySpent = sum(state.salaryExpenses, (item) => item.type !== "Credit");
    const salaryCreditExpense = sum(state.salaryExpenses, (item) => item.type === "Credit");
    const projectCredit = sum(state.projectTransactions, (item) => item.type === "Credit");
    const projectDebit = sum(state.projectTransactions, (item) => item.type === "Debit");
    const activeBudget = sum(state.projects, (project) => project.status === "Active" || project.status === "Paused") || 0;
    const remainingBudget = state.projects.reduce((total, project) => total + projectStats(state, project).remaining, 0);
    const overspent = state.projects.reduce((total, project) => total + projectStats(state, project).overspent, 0);
    const monthDebit = sum(state.expenses, (item) => item.type === "Debit" && inRange(item.date, "month")) + sum(state.salaryExpenses, (item) => item.type === "Debit" && inRange(item.date, "month")) + sum(state.projectTransactions, (item) => item.type === "Debit" && inRange(item.date, "month"));
    const monthCredit = sum(state.expenses, (item) => item.type === "Credit" && inRange(item.date, "month")) + sum(state.salaries, (item) => inRange(item.receivedDate, "month")) + sum(state.projectTransactions, (item) => item.type === "Credit" && inRange(item.date, "month"));
    const totalCredit = dailyCredit + salaryTotal + salaryCreditExpense + projectCredit;
    const totalDebit = dailyDebit + salarySpent + projectDebit;
    return { dailyCredit, dailyDebit, dailyExpense: dailyDebit, salaryTotal, salarySpent, projectCredit, projectDebit, activeBudget, remainingBudget, overspent, monthDebit, monthCredit, totalCredit, totalDebit, balance: totalCredit - totalDebit };
  }, [state]);
}

function allTransactions(state) {
  const daily = state.expenses.map((item) => ({ ...item, source: "Daily Expense" }));
  const salary = state.salaries.map((item) => ({ ...item, title: item.title, date: item.receivedDate, type: "Credit", category: "Salary", source: "Salary" }));
  const salaryLinked = state.salaryExpenses.map((item) => ({ ...item, source: "Salary-Linked Expense" }));
  const project = state.projectTransactions.map((item) => {
    const projectRecord = state.projects.find((entry) => entry.id === item.projectId);
    return { ...item, source: projectRecord ? `${projectRecord.name} Project` : "Project Expense" };
  });
  return [...daily, ...salary, ...salaryLinked, ...project].sort((a, b) => String(b.date).localeCompare(String(a.date)));
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

function highestLabel(group) {
  const entries = Object.entries(group);
  if (!entries.length) return "No data";
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}
