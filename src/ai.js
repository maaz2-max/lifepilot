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

  const insights = buildInsights(state);

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
    projectTransactions: take(state.projectTransactions, ["id", "projectId", "title", "amount", "type", "category", "date", "time", "paidBy", "participants", "paymentMethod"]),
    credentials: (state.credentials || []).map((credential) => ({
      id: credential.id,
      title: credential.title,
      type: credential.type,
      url: credential.url,
      fieldNames: credential.fieldNames || []
    })),
    pendingAiActions: (state.aiMessages || []).flatMap((message) =>
      (message.actions || [])
        .map((action, index) => ({
          messageId: message.id,
          actionIndex: index,
          operation: action.operation || "create",
          type: action.type,
          id: action.id,
          summary: action.summary,
          data: action.data,
          status: action.status || ""
        }))
        .filter((action) => !action.status)
    ),
    insights
  };
}

function moneyAmount(value) {
  return Number(value || 0);
}

function monthOf(date) {
  return String(date || "").slice(0, 7);
}

function addGroup(acc, key, value) {
  const label = key || "Uncategorized";
  acc[label] = (acc[label] || 0) + moneyAmount(value);
  return acc;
}

function highestEntry(group) {
  const entries = Object.entries(group);
  if (!entries.length) return null;
  const [label, amount] = entries.sort((a, b) => b[1] - a[1])[0];
  return { label, amount };
}

function uniqueNames(items) {
  return [...new Set(items.map((item) => String(item || "").trim()).filter(Boolean))];
}

function settlementRows(stats) {
  const debtors = Object.entries(stats)
    .filter(([, value]) => value.balance < -0.5)
    .map(([name, value]) => ({ name, amount: Math.abs(value.balance) }))
    .sort((a, b) => b.amount - a.amount);
  const creditors = Object.entries(stats)
    .filter(([, value]) => value.balance > 0.5)
    .map(([name, value]) => ({ name, amount: value.balance }))
    .sort((a, b) => b.amount - a.amount);
  const rows = [];
  let d = 0;
  let c = 0;
  while (d < debtors.length && c < creditors.length) {
    const amount = Math.min(debtors[d].amount, creditors[c].amount);
    if (amount > 0.5) rows.push({ from: debtors[d].name, to: creditors[c].name, amount: Math.round(amount) });
    debtors[d].amount -= amount;
    creditors[c].amount -= amount;
    if (debtors[d].amount <= 0.5) d += 1;
    if (creditors[c].amount <= 0.5) c += 1;
  }
  return rows;
}

function expenseSplitRows(transactions) {
  return transactions
    .filter((item) => item.type === "Debit" && item.paidBy && item.participants?.length)
    .map((item) => {
      const share = moneyAmount(item.amount) / item.participants.length;
      return {
        id: item.id,
        title: item.title,
        paidBy: item.paidBy,
        amount: moneyAmount(item.amount),
        splitBetween: item.participants,
        rows: item.participants
          .filter((name) => name !== item.paidBy)
          .map((name) => ({ from: name, to: item.paidBy, amount: Math.round(share) }))
      };
    })
    .filter((item) => item.rows.length);
}

function buildInsights(state) {
  const today = state.__today || new Date().toLocaleDateString("en-CA");
  const month = today.slice(0, 7);
  const projectById = Object.fromEntries(state.projects.map((project) => [project.id, project]));
  const monthlyDaily = state.expenses.filter((expense) => monthOf(expense.date) === month);
  const monthlySalaryExpenses = state.salaryExpenses.filter((expense) => monthOf(expense.date) === month);
  const monthlyProjects = state.projectTransactions.filter((expense) => monthOf(expense.date) === month);
  const dailyDebitByCategory = monthlyDaily
    .filter((expense) => expense.type === "Debit")
    .reduce((acc, expense) => addGroup(acc, expense.category, expense.amount), {});
  const projectDebitByCategory = monthlyProjects
    .filter((expense) => expense.type === "Debit")
    .reduce((acc, expense) => addGroup(acc, expense.category, expense.amount), {});
  const totalDailyCredit = monthlyDaily.filter((expense) => expense.type === "Credit").reduce((total, expense) => total + moneyAmount(expense.amount), 0);
  const totalDailyDebit = monthlyDaily.filter((expense) => expense.type === "Debit").reduce((total, expense) => total + moneyAmount(expense.amount), 0);
  const totalSalaryReceived = state.salaries.filter((salary) => monthOf(salary.receivedDate) === month).reduce((total, salary) => total + moneyAmount(salary.amount), 0);
  const totalSalarySpent = monthlySalaryExpenses.filter((expense) => expense.type !== "Credit").reduce((total, expense) => total + moneyAmount(expense.amount), 0);
  const totalProjectDebit = monthlyProjects.filter((expense) => expense.type === "Debit").reduce((total, expense) => total + moneyAmount(expense.amount), 0);

  return {
    month,
    currentMonth: {
      dailyCredit: totalDailyCredit,
      dailyDebit: totalDailyDebit,
      salaryReceived: totalSalaryReceived,
      salarySpent: totalSalarySpent,
      projectDebit: totalProjectDebit,
      totalDebit: totalDailyDebit + totalSalarySpent + totalProjectDebit,
      totalCredit: totalDailyCredit + totalSalaryReceived,
      balance: totalDailyCredit + totalSalaryReceived - totalDailyDebit - totalSalarySpent - totalProjectDebit,
      dailyDebitByCategory,
      projectDebitByCategory,
      highestDailyCategory: highestEntry(dailyDebitByCategory),
      highestProjectCategory: highestEntry(projectDebitByCategory)
    },
    projects: state.projects.map((project) => {
      const transactions = state.projectTransactions.filter((item) => item.projectId === project.id);
      const debit = transactions.filter((item) => item.type === "Debit").reduce((total, item) => total + moneyAmount(item.amount), 0);
      const credit = transactions.filter((item) => item.type === "Credit").reduce((total, item) => total + moneyAmount(item.amount), 0);
      const categoryDebit = transactions.filter((item) => item.type === "Debit").reduce((acc, item) => addGroup(acc, item.category, item.amount), {});
      const participantNames = uniqueNames([...(project.participants || []), ...transactions.flatMap((item) => [item.paidBy, ...(item.participants || [])])]);
      const participantSpend = participantNames.reduce((acc, name) => {
        const paid = transactions.filter((item) => item.type === "Debit" && item.paidBy === name).reduce((total, item) => total + moneyAmount(item.amount), 0);
        const share = transactions.filter((item) => item.type === "Debit").reduce((total, item) => {
          const splitMembers = (item.participants || []).filter(Boolean);
          return splitMembers.includes(name) ? total + moneyAmount(item.amount) / Math.max(splitMembers.length, 1) : total;
        }, 0);
        const credit = transactions.filter((item) => item.type === "Credit" && item.paidBy === name).reduce((total, item) => total + moneyAmount(item.amount), 0);
        acc[name] = { paid, share, credit, balance: paid + credit - share };
        return acc;
      }, {});
      return {
        id: project.id,
        name: project.name,
        budget: moneyAmount(project.budget),
        debit,
        credit,
        remaining: Math.max(0, moneyAmount(project.budget) + credit - debit),
        overspent: Math.max(0, debit - moneyAmount(project.budget) - credit),
        categoryDebit,
        highestCategory: highestEntry(categoryDebit),
        participantSpend,
        splitSettlements: settlementRows(participantSpend),
        expenseSplits: expenseSplitRows(transactions),
        transactions: transactions.map((item) => ({ ...item, projectName: projectById[item.projectId]?.name || "" }))
      };
    })
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
- For insight questions, use the provided insights object first. Answer with exact totals from insights and tables when useful.
- If user asks "highest usage/spending this month", compare currentMonth daily, salary, and project debit plus category breakdowns.
- If user asks for a specific project summary, use insights.projects and include budget, debit, credit, remaining, overspent, highest category, and recent transactions.
- If user asks about project splits, who owes whom, or participant balances, use insights.projects[].participantSpend and splitSettlements. Reply with a clear table showing payer, receiver, and amount.
- For expense-specific split questions, use insights.projects[].expenseSplits. Each expense split is isolated to that transaction's selected participants only.
- If user asks for daily expense summary, use only expenses, not salary/project transactions, unless they explicitly ask combined money.
- Use Indian Rupees only for money.
- Convert natural dates like today/tomorrow into YYYY-MM-DD using the current app date.
- Convert times like 6pm into HH:mm.
- For daily expenses, output type "expense".
- For expenses inside a named project, find the exact project id by name and output type "projectTransaction".
- For project transactions, always set paidBy to one participant from that project when clear and set participants to the involved participant names. If unclear, ask which project participants were involved.
- For project split expenses, participants means the people sharing/splitting that payment, not only people present in the project.
- Do not assume all project participants are splitting an expense. Only names in projectTransaction.participants split that specific expense.
- If the user asks to create an expense project but does not include transaction details, output only a project create action and ask in reply if they want to add expenses inside it after confirmation.
- If the user asks to create a new project and also gives project expenses in the same prompt, output the project create action first, then projectTransaction actions with data.projectName equal to the project name. The app can resolve it after creation.
- If a project expense references a project name that does not exist, output a project create action first if enough project details are known; otherwise ask for the missing project budget/date before creating.
- If user says "delete this expense project full", output a delete action for the matching project id. Project delete removes its transactions too.
- If user asks to delete multiple matching records, output multiple delete actions and make reply ask for one confirmation for all.
- If user asks to confirm/apply/add all pending actions, reply that the app can do it with the Confirm all control; do not create duplicate actions.
- If user asks to cancel/delete pending AI draft actions, reply that the app can do it with Cancel all; do not delete real app records unless the user names real records.
- If user asks to change a pending draft, return a fresh corrected action and mention they should cancel the older pending draft.
- For recurring reminders, set repeat to Daily, Weekly, Monthly, or Yearly when the user says every day/week/month/year.
- Credential records are local encrypted vault metadata only. Never ask the user to paste card numbers, CVV, PIN, passwords, or bank secrets into AI chat. If asked for credential details, say the local Secure Vault will ask PIN before showing them.
- For expenses default type is Debit unless user says credit/income.
- For salary-linked expense or project transaction, include salaryId/projectId when clear from existing data.
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
