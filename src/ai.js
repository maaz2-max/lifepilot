export const FREE_GEMINI_MODELS = [
  { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", limit: "10 RPM / 20 RPD" },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", limit: "5 RPM / 20 RPD" },
  { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite", limit: "15 RPM / 500 RPD" },
  { id: "gemini-3-flash", label: "Gemini 3 Flash", limit: "5 RPM / 20 RPD" },
  { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash", limit: "5 RPM / 20 RPD" },
  { id: "mlvoca:tinyllama", label: "MLVoca TinyLlama", limit: "No key / public hosted" },
  { id: "mlvoca:deepseek-r1:1.5b", label: "MLVoca DeepSeek R1 1.5B", limit: "No key / public hosted" }
];

const ACTION_TYPES = [
  "task",
  "reminder",
  "note",
  "event",
  "expense",
  "salary",
  "salaryExpense",
  "project",
  "projectTransaction",
  "category"
];

export const AI_JSON_REFERENCE = `{
  "reply": "I prepared these LifePilot actions. Please confirm before applying.",
  "actions": [
    {
      "operation": "create",
      "type": "task",
      "summary": "Create task: Homework today at 6 PM",
      "data": {
        "title": "Homework",
        "description": "",
        "dueDate": "2026-06-06",
        "dueTime": "18:00",
        "priority": "Medium",
        "category": "",
        "status": "Pending",
        "reminder": true,
        "notes": ""
      }
    },
    {
      "operation": "create",
      "type": "reminder",
      "summary": "Create reminder",
      "data": {
        "title": "Pay rent",
        "description": "",
        "date": "2026-06-06",
        "time": "18:00",
        "repeat": "No repeat",
        "priority": "Medium",
        "notificationEnabled": true,
        "status": "Active"
      }
    },
    {
      "operation": "create",
      "type": "note",
      "summary": "Create note",
      "data": {
        "title": "Idea",
        "content": "Write note content here",
        "date": "2026-06-06",
        "category": "",
        "reminder": false,
        "pinned": false
      }
    },
    {
      "operation": "create",
      "type": "event",
      "summary": "Create event",
      "data": {
        "title": "Meeting",
        "description": "",
        "startDate": "2026-06-06",
        "startTime": "18:00",
        "endDate": "2026-06-06",
        "endTime": "19:00",
        "location": "",
        "category": "",
        "reminderBefore": "15 minutes",
        "repeat": "No repeat",
        "status": "Scheduled"
      }
    },
    {
      "operation": "create",
      "type": "expense",
      "summary": "Create daily expense",
      "data": {
        "title": "Swiggy dinner",
        "amount": 450,
        "type": "Debit",
        "category": "Food",
        "date": "2026-06-06",
        "time": "20:00",
        "paymentMethod": "UPI",
        "notes": "",
        "reminder": false
      }
    },
    {
      "operation": "create",
      "type": "salary",
      "summary": "Create salary",
      "data": {
        "title": "June Salary",
        "amount": 90000,
        "receivedDate": "2026-06-06",
        "month": "2026-06",
        "source": "Company",
        "paymentMethod": "Bank transfer",
        "notes": "",
        "budgetPlan": ""
      }
    },
    {
      "operation": "create",
      "type": "salaryExpense",
      "summary": "Create salary-linked expense",
      "data": {
        "salaryId": "salary-id-here",
        "title": "Rent",
        "amount": 15000,
        "type": "Debit",
        "category": "Bills",
        "date": "2026-06-06",
        "paymentMethod": "UPI",
        "notes": ""
      }
    },
    {
      "operation": "create",
      "type": "project",
      "summary": "Create expense project",
      "data": {
        "name": "Goa Trip",
        "type": "Trip",
        "description": "",
        "startDate": "2026-06-06",
        "endDate": "2026-06-10",
        "budget": 25000,
        "participants": ["Maaz"],
        "status": "Active",
        "notes": ""
      }
    },
    {
      "operation": "create",
      "type": "projectTransaction",
      "summary": "Create project transaction",
      "data": {
        "projectId": "project-id-here",
        "title": "Hotel booking",
        "amount": 7000,
        "type": "Debit",
        "category": "Travel",
        "date": "2026-06-06",
        "time": "12:00",
        "paidBy": "Maaz",
        "participants": ["Maaz"],
        "paymentMethod": "UPI",
        "notes": ""
      }
    },
    {
      "operation": "create",
      "type": "category",
      "summary": "Create category",
      "data": {
        "name": "Education",
        "type": "Debit",
        "color": "#d8ff8f",
        "icon": "book"
      }
    },
    {
      "operation": "edit",
      "type": "expense",
      "id": "expense-id-here",
      "summary": "Change expense category",
      "data": {
        "category": "Food"
      }
    },
    {
      "operation": "delete",
      "type": "reminder",
      "id": "reminder-id-here",
      "summary": "Delete reminder"
    }
  ]
}`;

function compactState(state) {
  const take = (items, fields) => items.map((item) =>
    fields.reduce((acc, field) => ({ ...acc, [field]: item[field] }), {})
  );

  return {
    profile: state.profile ? { name: state.profile.name, dob: state.profile.dob } : null,
    today: state.__today || new Date().toLocaleDateString("en-CA"),
    currentTime: new Date().toTimeString().slice(0, 5),
    categories: state.categories.map((category) => category.name),
    tasks: take(state.tasks, ["id", "title", "dueDate", "dueTime", "status", "priority", "category"]),
    reminders: take(state.reminders, ["id", "title", "date", "time", "repeat", "status"]),
    notes: take(state.notes, ["id", "title", "date", "category", "pinned"]),
    events: take(state.events, ["id", "title", "startDate", "startTime", "endDate", "location"]),
    expenses: take(state.expenses, ["id", "title", "amount", "type", "category", "date", "time", "paymentMethod", "notes"]),
    salaries: take(state.salaries, ["id", "title", "amount", "receivedDate", "month", "source"]),
    projects: state.projects.map((project) => ({
      id: project.id,
      name: project.name,
      budget: project.budget,
      status: project.status,
      startDate: project.startDate,
      endDate: project.endDate,
      participants: project.participants
    })),
    salaryExpenses: take(state.salaryExpenses, ["id", "salaryId", "title", "amount", "type", "category", "date", "paymentMethod"]),
    projectTransactions: take(state.projectTransactions, ["id", "projectId", "title", "amount", "type", "category", "date", "time", "paidBy", "paymentMethod"])
  };
}

function systemPrompt(state) {
  return `
You are LifePilot AI inside a local-first personal assistant PWA.
You can answer questions about the user's existing local data and propose app actions.

Current compact app data:
${JSON.stringify(compactState(state))}

Rules:
- Return only valid JSON. The reply field may contain a markdown table when the user asks for a list/table.
- Do not invent existing records. Use the compact app data.
- If the user asks to create, edit, or delete something, propose an action. Do not claim it is already saved.
- Ask for user confirmation in the reply before any action is applied.
- You may search all compact app data by title, amount, category, date, payment method, status, project, participant, notes, or source.
- If the user asks whether any task/reminder/note/event/expense exists, list all matching records. If they ask "any task available", list every task with ID, title, date, time, status, priority.
- If the user asks for a specific day transaction list, reply with a markdown table only in the reply field. Include Source, Title, Type, Amount, Category, Time, Payment Method, ID when available.
- For listing tasks/reminders/events/notes, use a markdown table when useful.
- Use Indian Rupees only for money.
- Convert natural dates like today/tomorrow into YYYY-MM-DD using the current app date.
- Convert times like 6pm into HH:mm.
- For expenses default type is Debit unless user says credit/income.
- For salary-linked expense or project transaction, include salaryId/projectId only when clear from existing data.
- If information is missing, make a reasonable draft and mention what can be edited before confirming.

Allowed action types:
${ACTION_TYPES.join(", ")}

Action data schemas:
task: { title, description, dueDate, dueTime, priority, category, status, reminder, notes }
reminder: { title, description, date, time, repeat, priority, notificationEnabled, status }
note: { title, content, date, category, reminder, pinned }
event: { title, description, startDate, startTime, endDate, endTime, location, category, reminderBefore, repeat, status }
expense: { title, amount, type, category, date, time, paymentMethod, notes, reminder }
salary: { title, amount, receivedDate, month, source, paymentMethod, notes, budgetPlan }
salaryExpense: { salaryId, title, amount, type, category, date, paymentMethod, notes }
project: { name, type, description, startDate, endDate, budget, participants, status, notes }
projectTransaction: { projectId, title, amount, type, category, date, time, paidBy, participants, paymentMethod, notes }
category: { name, type, color, icon }

Output JSON shape:
{
  "reply": "short helpful answer",
  "actions": [
    {
      "operation": "create",
      "type": "task",
      "id": "existing-id-only-for-edit-or-delete",
      "summary": "Create task: Homework today at 6:00 PM",
      "data": {}
    }
  ]
}
Operation rules:
- create: omit id and include full data.
- edit: include id of the existing record and only changed fields in data.
- delete: include id and no data is required.
- If no action is needed, use "actions": [].
`;
}

function extractJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("AI response was not JSON");
    return JSON.parse(match[0]);
  }
}

export async function askGeminiAssistant({ state, model, message }) {
  const selectedModel = FREE_GEMINI_MODELS.some((entry) => entry.id === model)
    ? model
    : FREE_GEMINI_MODELS[0].id;

  const response = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: selectedModel,
      prompt: `${systemPrompt(state)}\n\nUser message: ${message}`
    })
  });

  if (!response.ok) {
    const busy = [429, 500, 502, 503, 504].includes(response.status);
    const error = new Error(busy ? "Server busy. Please try after some time." : "AI request failed.");
    error.busy = busy;
    throw error;
  }

  const proxyJson = await response.json();
  const json = proxyJson.data || proxyJson;
  const text = json.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "{}";
  const parsed = extractJson(text);

  return {
    reply: parsed.reply || "I prepared a response.",
    actions: Array.isArray(parsed.actions)
      ? parsed.actions.filter((action) =>
          ACTION_TYPES.includes(action.type) &&
          ["create", "edit", "delete"].includes(action.operation || "create") &&
          ((action.operation || "create") === "delete" ? action.id : action.data)
        )
      : []
  };
}
