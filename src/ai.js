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
  "bill",
  "salary",
  "salaryExpense",
  "project",
  "projectTransaction",
  "projectSettlement",
  "category",
  "loan"
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
        "startTime": "",
        "endTime": "",
        "dueTime": "18:00",
        "todayOnly": true,
        "priority": "Medium",
        "category": "",
        "status": "Pending",
        "reminder": true,
        "subtasks": ["Read chapter", "Write answers"],
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
        "splitMode": "No split",
        "paidBy": "",
        "owedBy": "",
        "participants": [],
        "notes": "",
        "reminder": false
      }
    },
    {
      "operation": "create",
      "type": "bill",
      "summary": "Create bill reminder",
      "data": {
        "title": "Electricity bill",
        "amount": 2200,
        "dueDate": "2026-06-06",
        "status": "Unpaid",
        "reminderBefore": "1 day",
        "category": "Bills",
        "paymentMethod": "UPI",
        "notes": ""
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
        "splitMode": "Equal split",
        "owedBy": "",
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
      "operation": "create",
      "type": "loan",
      "summary": "Add home loan EMI info",
      "data": {
        "title": "Home Loan",
        "bankName": "SBI Bank",
        "totalAmount": 5000000,
        "monthlyPayment": 35000,
        "totalMonths": 240,
        "completedMonths": 12,
        "emiDate": 5,
        "startDate": "2025-06-01",
        "status": "Active",
        "notes": "SBI Maxgain home loan account"
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
    preferences: {
      defaultPaymentMethod: state.aiMemory?.defaultPaymentMethod || "",
      commonParticipants: state.aiMemory?.commonParticipants || [],
      frequentMerchants: state.aiMemory?.frequentMerchants || []
    },
    tasks: take(state.tasks, ["id", "title", "dueDate", "startTime", "endTime", "dueTime", "todayOnly", "status", "priority", "category", "subtasks"]),
    reminders: take(state.reminders, ["id", "title", "date", "time", "repeat", "status", "isMoneyReceive", "payerName", "moneyAmount"]),
    notes: take(state.notes, ["id", "title", "date", "category", "pinned"]),
    events: take(state.events, ["id", "title", "startDate", "startTime", "endDate", "location"]),
    expenses: take(state.expenses, ["id", "title", "amount", "type", "category", "date", "time", "paymentMethod", "splitMode", "paidBy", "owedBy", "participants", "notes"]),
    bills: take(state.bills || [], ["id", "title", "amount", "dueDate", "status", "reminderBefore", "category", "paymentMethod", "notes"]),
    salaries: take(state.salaries, ["id", "title", "amount", "receivedDate", "month", "source"]),
    projects: state.projects.map((project) => ({
      id: project.id,
      name: project.name,
      budget: project.budget,
      status: project.status,
      startDate: project.startDate,
      endDate: project.endDate,
      participants: project.participants,
      paidSettlements: (project.paidSettlements || []).map((item) => ({
        id: item.id,
        from: item.from,
        to: item.to,
        amount: item.amount,
        paymentType: item.paymentType,
        paidAt: item.paidAt,
        updatedAt: item.updatedAt
      }))
    })),
    salaryExpenses: take(state.salaryExpenses, ["id", "salaryId", "title", "amount", "type", "category", "date", "paymentMethod"]),
    projectTransactions: take(state.projectTransactions, ["id", "projectId", "title", "amount", "type", "category", "date", "time", "paidBy", "owedBy", "splitMode", "participants", "paymentMethod"]),
    gmailRecords: take(state.gmailRecords || [], ["id", "subject", "title", "amount", "type", "category", "date", "time", "paymentMethod", "notes", "accountReference"]),
    loans: take(state.loans || [], ["id", "title", "bankName", "totalAmount", "monthlyPayment", "totalMonths", "completedMonths", "emiDate", "startDate", "status", "notes", "paidMonths", "foreclosurePaidAmount", "interestRate", "interestPeriod", "customPayments"]),
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

function addDaysISO(iso, days) {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toLocaleDateString("en-CA");
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
    .filter((item) => item.type === "Debit" && item.paidBy && (splitModeOf(item) === "Direct owed" ? item.owedBy : item.participants?.length))
    .map((item) => {
      if (splitModeOf(item) === "Direct owed") {
        return {
          id: item.id,
          title: item.title,
          paidBy: item.paidBy,
          owedBy: item.owedBy,
          splitMode: "Direct owed",
          amount: moneyAmount(item.amount),
          splitBetween: [],
          rows: [{ from: item.owedBy, to: item.paidBy, amount: Math.round(moneyAmount(item.amount)) }]
        };
      }
      const share = moneyAmount(item.amount) / item.participants.length;
      return {
        id: item.id,
        title: item.title,
        paidBy: item.paidBy,
        splitMode: "Equal split",
        amount: moneyAmount(item.amount),
        splitBetween: item.participants,
        rows: item.participants
          .filter((name) => name !== item.paidBy)
          .map((name) => ({ from: name, to: item.paidBy, amount: Math.round(share) }))
      };
    })
    .filter((item) => item.rows.length);
}

function splitModeOf(item) {
  if (item.splitMode) return item.splitMode;
  return item.participants?.length ? "Equal split" : "No split";
}

function buildInsights(state) {
  const today = state.__today || new Date().toLocaleDateString("en-CA");
  const month = today.slice(0, 7);
  const weekEnd = addDaysISO(today, 7);
  const projectById = Object.fromEntries(state.projects.map((project) => [project.id, project]));
  const monthlyDaily = state.expenses.filter((expense) => monthOf(expense.date) === month);
  const monthlySalaryExpenses = state.salaryExpenses.filter((expense) => monthOf(expense.date) === month);
  const monthlyBills = (state.bills || []).filter((bill) => monthOf(bill.dueDate) === month);
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
  const totalPaidBills = monthlyBills.filter((bill) => bill.status === "Paid").reduce((total, bill) => total + moneyAmount(bill.amount), 0);
  const totalUnpaidBills = monthlyBills.filter((bill) => bill.status !== "Paid").reduce((total, bill) => total + moneyAmount(bill.amount), 0);
  const allMoneyRows = [
    ...state.expenses.map((item) => ({ ...item, source: "Daily Expense", date: item.date })),
    ...(state.bills || []).map((item) => ({ ...item, source: "Bill Tracker", date: item.dueDate, type: item.status === "Paid" ? "Debit" : "Due" })),
    ...state.salaryExpenses.map((item) => ({ ...item, source: "Salary-Linked Expense", date: item.date })),
    ...state.projectTransactions.map((item) => ({ ...item, source: "Project Expense", date: item.date, projectName: projectById[item.projectId]?.name || "" }))
  ];
  const dueBillsThisWeek = (state.bills || [])
    .filter((bill) => bill.status !== "Paid" && bill.dueDate >= today && bill.dueDate <= weekEnd)
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
  const overdue = {
    tasks: state.tasks.filter((task) => !["Completed", "Cancelled"].includes(task.status) && task.dueDate < today),
    reminders: state.reminders.filter((reminder) => reminder.status === "Active" && reminder.date < today),
    bills: (state.bills || []).filter((bill) => bill.status !== "Paid" && bill.dueDate < today)
  };
  const upcomingReminders = state.reminders
    .filter((reminder) => reminder.status === "Active" && reminder.date >= today && reminder.date <= weekEnd)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  return {
    month,
    currentMonth: {
      dailyCredit: totalDailyCredit,
      dailyDebit: totalDailyDebit,
      salaryReceived: totalSalaryReceived,
      salarySpent: totalSalarySpent,
      paidBills: totalPaidBills,
      unpaidBills: totalUnpaidBills,
      projectDebit: totalProjectDebit,
      totalDebit: totalDailyDebit + totalSalarySpent + totalProjectDebit + totalPaidBills,
      totalCredit: totalDailyCredit + totalSalaryReceived,
      balance: totalDailyCredit + totalSalaryReceived - totalDailyDebit - totalSalarySpent - totalProjectDebit,
      dailyDebitByCategory,
      projectDebitByCategory,
      highestDailyCategory: highestEntry(dailyDebitByCategory),
      highestProjectCategory: highestEntry(projectDebitByCategory)
    },
    thisWeek: {
      start: today,
      end: weekEnd,
      dueBills: dueBillsThisWeek,
      dueBillTotal: dueBillsThisWeek.reduce((total, bill) => total + moneyAmount(bill.amount), 0)
    },
    overdue,
    monthEndReview: {
      unpaidBills: monthlyBills.filter((bill) => bill.status !== "Paid").sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate))),
      upcomingReminders,
      overdueCounts: {
        tasks: overdue.tasks.length,
        reminders: overdue.reminders.length,
        bills: overdue.bills.length
      }
    },
    moneyTables: {
      currentMonth: allMoneyRows
        .filter((item) => monthOf(item.date) === month)
        .sort((a, b) => String(b.date).localeCompare(String(a.date))),
      thisWeek: allMoneyRows
        .filter((item) => item.date >= today && item.date <= weekEnd)
        .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    },
    projects: state.projects.map((project) => {
      const transactions = state.projectTransactions.filter((item) => item.projectId === project.id);
      const debit = transactions.filter((item) => item.type === "Debit").reduce((total, item) => total + moneyAmount(item.amount), 0);
      const credit = transactions.filter((item) => item.type === "Credit").reduce((total, item) => total + moneyAmount(item.amount), 0);
      const categoryDebit = transactions.filter((item) => item.type === "Debit").reduce((acc, item) => addGroup(acc, item.category, item.amount), {});
      const participantNames = uniqueNames([...(project.participants || []), ...transactions.flatMap((item) => [item.paidBy, item.owedBy, ...(item.participants || [])])]);
      const paidSettlements = (project.paidSettlements || []).filter((item) => item.from && item.to && moneyAmount(item.amount) > 0);
      const rawParticipantSpend = participantNames.reduce((acc, name) => {
        const paid = transactions.filter((item) => item.type === "Debit" && item.paidBy === name).reduce((total, item) => {
          const mode = splitModeOf(item);
          const hasEqualSplit = mode === "Equal split" && (item.participants || []).filter(Boolean).length > 0;
          const hasDirectOwed = mode === "Direct owed" && item.owedBy;
          return hasEqualSplit || hasDirectOwed ? total + moneyAmount(item.amount) : total;
        }, 0);
        const share = transactions.filter((item) => item.type === "Debit").reduce((total, item) => {
          const mode = splitModeOf(item);
          if (mode === "Direct owed") return item.owedBy === name ? total + moneyAmount(item.amount) : total;
          if (mode !== "Equal split") return total;
          const splitMembers = (item.participants || []).filter(Boolean);
          return splitMembers.includes(name) ? total + moneyAmount(item.amount) / Math.max(splitMembers.length, 1) : total;
        }, 0);
        const credit = 0;
        acc[name] = { paid, share, credit, balance: paid + credit - share };
        return acc;
      }, {});
      const participantSpend = Object.fromEntries(Object.entries(rawParticipantSpend).map(([name, value]) => {
        const paidOut = paidSettlements.filter((item) => item.from === name).reduce((total, item) => total + moneyAmount(item.amount), 0);
        const received = paidSettlements.filter((item) => item.to === name).reduce((total, item) => total + moneyAmount(item.amount), 0);
        return [name, { ...value, settledPaid: paidOut, settledReceived: received, balance: value.balance + paidOut - received }];
      }));
      const splitSettlements = settlementRows(participantSpend);
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
        splitSettlements,
        paidSettlements,
        settlementStatus: splitSettlements.length ? "pending" : paidSettlements.length ? "settled" : "none",
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
- Return only valid JSON. The "reply" field MUST contain clean markdown tables, structured bullet lists, clear headers, and professional emojis to ensure a premium, highly realistic assistant appearance.
- ALWAYS use a markdown table when listing multiple tasks, reminders, events, notes, bills, or transactions (with columns like Type, Title, Time/Date, Status, Priority, Amount, etc.).
- When replying with any money amounts, lists, budgets, cashflow summaries, or comparative insights, prefer a markdown table so the app renders it in our premium financial UI skin.
- Do not invent existing records. Use the compact app data.
- If the user asks to create, edit, or delete something, propose an action. Do not claim it is already saved.
- Ask for user confirmation in the reply before any action is applied.
- You may search all compact app data by title, amount, category, date, payment method, status, project, participant, notes, or source.
- If the user asks whether any task/reminder/note/event/expense exists, list all matching records in a markdown table. If they ask "any task available", list every task with ID, title, date, time, status, priority in a table.
- Treat todo, to-do, and task as the same LifePilot task records. For todo create/edit/delete requests, output action type "task".
- For todo/task actions, put multiple child steps in task.subtasks as an array of short strings or objects with title/status.
- If the user asks for a specific day transaction list, reply with a markdown table only in the reply field. Include Source, Title, Type, Amount, Category, Time, Payment Method, ID when available.
- For listing tasks/reminders/events/notes, use a markdown table when useful.
- For insight questions, use the provided insights object first. Answer with exact totals from insights and tables.
- If user asks "highest usage/spending this month", compare currentMonth daily, salary, and project debit plus category breakdowns.
- If user asks for this week bills, overdue work, cashflow, or a month expense table, use insights.thisWeek, insights.overdue, insights.currentMonth, and insights.moneyTables before reading raw lists.
- If user asks for daily digest or month-end review, cover unpaid bills, overspending/budget alerts, project balances, upcoming reminders, overdue items, and cashflow.
- If user asks for a specific project summary, use insights.projects and include budget, debit, credit, remaining, overspent, highest category, and recent transactions.
- If user asks about project splits, who owes whom, or participant balances, use insights.projects[].participantSpend and splitSettlements. Reply with a clear table showing payer, receiver, and amount.
- If a project's settlementStatus is "settled" or splitSettlements is empty after paidSettlements, say the relevant people are settled/cleared and do not claim money is still owed.
- If user says a project split/owe was paid, output type "projectSettlement". Use operation create for a new payment, edit for changing an existing paidSettlements id, and delete for removing a paid settlement. Use paymentType "Full" when the whole pending amount is paid and "Custom" for partial payments.
- For partial project settlement payments, data.amount is only the amount paid now. The remaining owed amount is recalculated by the app from paidSettlements.
- When replying with any money amounts, prefer a markdown table so the app can render a premium table.
- For expense-specific split questions, use insights.projects[].expenseSplits. Each expense split is isolated to that transaction's selected participants only.
- If user asks for daily expense summary, use only expenses, not salary/project transactions, unless they explicitly ask combined money.
- If the user asks about bills, use bills and show title, amount, dueDate, status, reminderBefore.
- If user gives a bank/SMS transaction message, extract amount, debit/credit, merchant/title, date, time, account hint, and payment method. If any core field is uncertain, ask a short clarification before proposing actions.
- For parsed bank debit/credit messages, ask whether to save it as daily expense, project expense, or bill tracker before final saving. You can propose a draft action after destination is clear.
- Use the transaction date or due date written in the pasted message. Do not default to today when a date is present in formats like 06/06/2026, 06-Jun-26, 6 Jun 2026, Jun 6, or due on 10 June.
- If the pasted message is a bill reminder, create/propose a bill action with dueDate from the message, status "Unpaid", amount from amount due/minimum/total due, and reminderBefore "1 day" unless the user says otherwise.
- Use Indian Rupees only for money.
- Convert natural dates like today/tomorrow into YYYY-MM-DD using the current app date.
- Convert times like 6pm into HH:mm.
- For task/todo actions, include startTime and endTime when the user gives a time range. If the user says "today only", set todayOnly true and use today's date.
- Prefer compact app data preferences.defaultPaymentMethod, preferences.commonParticipants, and preferences.frequentMerchants as local defaults when the user does not specify payment method, participant, or merchant.
- For daily expenses, output type "expense".
- Daily expenses can also use splitMode, paidBy, owedBy, and participants just like project transactions when the user asks for normal daily split/owes.
- For expenses inside a named project, find the exact project id by name and output type "projectTransaction".
- For project transactions, always set paidBy to one participant from that project when clear and set participants to the involved participant names. If unclear, ask which project participants were involved.
- For project split expenses, participants means the people sharing/splitting that payment, not only people present in the project.
- Do not assume all project participants are splitting an expense. Only names in projectTransaction.participants split that specific expense.
- Project transaction splitMode must be one of "No split", "Equal split", or "Direct owed".
- Use splitMode "No split" when the expense belongs only to the payer and nobody owes anyone.
- Use splitMode "Equal split" when the amount should be divided equally among projectTransaction.participants.
- Use splitMode "Direct owed" when one participant owes the full amount to another; put receiver in paidBy and debtor in owedBy. Do not set participants for Direct owed.
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
- If user asks about extracted Gmail transactions, read the 'gmailRecords' array. These are un-imported transactions. You can suggest creating daily/project expenses from them.
- You have access to recent conversation history in this prompt, including the status of any actions you previously proposed (e.g. 'applied', 'cancelled', or 'Pending'). If the user confirmed or cancelled an action, acknowledge it accurately.
- For loan and EMI actions, output type "loan". You can create, edit, delete active loans, record monthly EMI payments, or mark a loan foreclosed or completed.
- If the user asks about their running loans or EMIs, look at the "loans" array, calculate paid/outstanding amounts, status, and summarize them.
- Salary records are automatically synced as credit transactions in the daily expenses (expenses) list under the "Salary" category. You can query and summarize salary usage, compare current salary with the previous month's salary and spending, and calculate how much is saved.
- Reminders can be marked as money receivable (by setting isMoneyReceive to true). If isMoneyReceive is true, you must provide the payerName (name of the person to receive money from) and moneyAmount (amount to receive). When a money receivable reminder is marked completed, it automatically gets synced as a Credit transaction under category "Salary" in Daily Expenses.


Allowed action types:
${ACTION_TYPES.join(", ")}

Action data schemas:
task: { title, description, dueDate, startTime, endTime, dueTime, todayOnly, priority, category, status, reminder, subtasks, notes }
reminder: { title, description, date, time, repeat, priority, notificationEnabled, status, isMoneyReceive, payerName, moneyAmount }
note: { title, content, date, category, reminder, pinned }
event: { title, description, startDate, startTime, endDate, endTime, location, category, reminderBefore, repeat, status }
expense: { title, amount, type, category, date, time, paymentMethod, splitMode, paidBy, owedBy, participants, notes, reminder }
bill: { title, amount, dueDate, status, reminderBefore, category, paymentMethod, notes }
salary: { title, amount, receivedDate, month, source, paymentMethod, notes, budgetPlan }
salaryExpense: { salaryId, title, amount, type, category, date, paymentMethod, notes }
project: { name, type, description, startDate, endDate, budget, participants, status, notes }
projectTransaction: { projectId, title, amount, type, category, date, time, paidBy, splitMode, owedBy, participants, paymentMethod, notes }
projectSettlement: { projectId, projectName, from, to, amount, paymentType, paidAt }
category: { name, type, color, icon }
loan: { title, bankName, totalAmount, monthlyPayment, totalMonths, completedMonths, emiDate, startDate, status, notes, foreclosurePaidAmount }

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
    return data.response || "";
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

export async function askGeminiAssistant({ state, model, message }) {
  const selectedModel = FREE_GEMINI_MODELS.some((entry) => entry.id === model)
    ? model
    : FREE_GEMINI_MODELS[0].id;

  const recentHistory = (state.aiMessages || [])
    .slice(-8)
    .map((msg) => {
      let text = `${msg.role === "user" ? "User" : "Assistant"}: ${msg.text}`;
      if (msg.actions && msg.actions.length > 0) {
        text += `\n[Proposed Actions: ` + msg.actions.map(a => `{"summary": "${a.summary}", "status": "${a.status || 'Pending'}"}`).join(", ") + `]`;
      }
      return text;
    })
    .join("\n\n");

  const promptBody = recentHistory
    ? `${systemPrompt(state)}\n\n--- Recent Conversation History ---\n${recentHistory}\n\nUser message: ${message}`
    : `${systemPrompt(state)}\n\nUser message: ${message}`;

  if (state.settings?.localLlmEnabled) {
    try {
      const responseText = await callLocalLlm({
        url: state.settings.localLlmUrl,
        model: state.settings.localModelName,
        prompt: promptBody
      });
      const parsed = extractJson(responseText);
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
    } catch (err) {
      console.warn("Local LLM failed for assistant chat, falling back to Gemini...", err);
    }
  }

  const response = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: selectedModel,
      prompt: promptBody
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
