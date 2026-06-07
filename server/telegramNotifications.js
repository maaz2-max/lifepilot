import { hasSupabase, supabaseRequest } from "./supabaseRest.js";

const USER_KEY = "default";

function jsonResponse(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function telegramConfig(env = process.env) {
  return {
    token: env.TELEGRAM_BOT_TOKEN,
    chatId: env.TELEGRAM_CHAT_ID,
    userKey: env.LIFEPILOT_USER_KEY || USER_KEY
  };
}

async function sendTelegramMessage(text, env = process.env) {
  const { token, chatId } = telegramConfig(env);
  if (!token || !chatId) throw new Error("Telegram bot token or chat id is missing");

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.description || "Telegram send failed");
  return data;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function notificationText(item) {
  const title = escapeHtml(item.title || "LifePilot notification");
  const type = escapeHtml(item.type || "notification");
  const body = escapeHtml(item.body || "");
  const due = item.due_at ? new Date(item.due_at).toLocaleString("en-IN", { timeZone: item.timezone || "Asia/Kolkata" }) : "";
  return [
    `🔔 <b>${title}</b>`,
    `Type: ${type}`,
    due ? `Time: ${escapeHtml(due)}` : "",
    body ? `\n${body}` : ""
  ].filter(Boolean).join("\n");
}

function nextRepeatDate(dueAt, repeat) {
  if (!repeat || repeat === "No repeat") return "";
  const date = new Date(dueAt);
  if (Number.isNaN(date.getTime())) return "";
  if (repeat === "Daily") date.setDate(date.getDate() + 1);
  else if (repeat === "Weekly") date.setDate(date.getDate() + 7);
  else if (repeat === "Monthly") date.setMonth(date.getMonth() + 1);
  else if (repeat === "Yearly") date.setFullYear(date.getFullYear() + 1);
  else return "";
  return date.toISOString();
}

function ensureCronAuthorized(req, env = process.env) {
  const secret = env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.authorization || req.headers.Authorization || "";
  const querySecret = new URL(req.url, "http://localhost").searchParams.get("secret");
  return auth === `Bearer ${secret}` || querySecret === secret;
}

export async function handleNotificationSync(req, res, env = process.env) {
  if (req.method !== "POST") {
    jsonResponse(res, 405, { error: "Method not allowed" });
    return;
  }
  if (!hasSupabase(env)) {
    jsonResponse(res, 503, { error: "Supabase is not configured" });
    return;
  }

  let body;
  try {
    body = await readBody(req);
  } catch {
    jsonResponse(res, 400, { error: "Invalid JSON body" });
    return;
  }

  const { userKey } = telegramConfig(env);
  const items = Array.isArray(body.items) ? body.items : [];
  const rows = items
    .filter((item) => item.localId && item.type && item.title && item.dueAt)
    .slice(0, 500)
    .map((item) => ({
      user_key: userKey,
      local_id: String(item.localId),
      type: String(item.type),
      title: String(item.title).slice(0, 180),
      body: String(item.body || "").slice(0, 900),
      due_at: item.dueAt,
      repeat: item.repeat || "No repeat",
      status: item.status || "active",
      priority: item.priority || "Medium",
      timezone: item.timezone || "Asia/Kolkata",
      source_updated_at: item.updatedAt || new Date().toISOString(),
      enabled: item.enabled !== false
    }));

  try {
    if (rows.length) {
      await supabaseRequest("notification_items?on_conflict=user_key,local_id,type", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates" },
        body: rows
      }, env);
    }
    await supabaseRequest(`telegram_settings?on_conflict=user_key`, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: [{
        user_key: userKey,
        chat_id: env.TELEGRAM_CHAT_ID || "",
        enabled: Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID),
        categories: body.categories || {},
        quiet_hours: body.quietHours || {},
        timezone: body.timezone || "Asia/Kolkata",
        last_sync_at: new Date().toISOString()
      }]
    }, env);
    jsonResponse(res, 200, { synced: rows.length });
  } catch (error) {
    jsonResponse(res, 502, { error: error.message || "Notification sync failed" });
  }
}

export async function handleTelegramTest(req, res, env = process.env) {
  if (req.method !== "POST") {
    jsonResponse(res, 405, { error: "Method not allowed" });
    return;
  }
  try {
    await sendTelegramMessage("✅ LifePilot Telegram notifications are connected.", env);
    jsonResponse(res, 200, { ok: true });
  } catch (error) {
    jsonResponse(res, 502, { error: error.message || "Telegram test failed" });
  }
}

export async function handleTelegramCron(req, res, env = process.env) {
  if (!["GET", "POST"].includes(req.method)) {
    jsonResponse(res, 405, { error: "Method not allowed" });
    return;
  }
  if (!ensureCronAuthorized(req, env)) {
    jsonResponse(res, 401, { error: "Unauthorized cron request" });
    return;
  }
  if (!hasSupabase(env)) {
    jsonResponse(res, 503, { error: "Supabase is not configured" });
    return;
  }

  const now = new Date().toISOString();
  try {
    const { userKey } = telegramConfig(env);
    const items = await supabaseRequest(
      `notification_items?user_key=eq.${encodeURIComponent(userKey)}&enabled=eq.true&status=eq.active&due_at=lte.${encodeURIComponent(now)}&select=*`,
      {},
      env
    );
    let sent = 0;
    const errors = [];

    for (const item of items || []) {
      const sendKey = `${item.local_id}:${item.type}:${item.due_at}`;
      if (item.last_sent_key === sendKey) continue;
      try {
        await sendTelegramMessage(notificationText(item), env);
        sent += 1;
        const nextDue = nextRepeatDate(item.due_at, item.repeat);
        await supabaseRequest(`notification_items?id=eq.${encodeURIComponent(item.id)}`, {
          method: "PATCH",
          body: {
            last_sent_key: sendKey,
            last_sent_at: new Date().toISOString(),
            due_at: nextDue || item.due_at,
            status: nextDue ? "active" : item.status
          }
        }, env);
        await supabaseRequest("notification_deliveries", {
          method: "POST",
          body: [{
            item_id: item.id,
            user_key: item.user_key,
            scheduled_for: item.due_at,
            sent_at: new Date().toISOString(),
            channel: "telegram",
            status: "sent"
          }]
        }, env);
      } catch (error) {
        errors.push({ id: item.id, error: error.message });
      }
    }

    jsonResponse(res, errors.length ? 207 : 200, { checked: items?.length || 0, sent, errors });
  } catch (error) {
    jsonResponse(res, 502, { error: error.message || "Telegram cron failed" });
  }
}
