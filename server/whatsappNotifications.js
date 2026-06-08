import crypto from "crypto";
import { hasSupabase, supabaseRequest } from "./supabaseRest.js";

const USER_KEY = "default";

function jsonResponse(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

async function readRawAndJson(req) {
  if (req.body && typeof req.body === "object") {
    return { raw: JSON.stringify(req.body), json: req.body };
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  const json = raw ? JSON.parse(raw) : {};
  return { raw, json };
}

function whatsappConfig(env = process.env) {
  return {
    apiUrl: String(env.WHATSAPP_API_URL || "http://127.0.0.1:2785").replace(/\/$/, ""),
    apiKey: env.WHATSAPP_API_KEY || "",
    sessionId: env.WHATSAPP_SESSION_ID || "default",
    phoneNumber: env.WHATSAPP_PHONE_NUMBER || "",
    webhookSecret: env.WHATSAPP_WEBHOOK_SECRET || "",
    userKey: env.LIFEPILOT_USER_KEY || USER_KEY
  };
}

async function sendWhatsappMessage(text, env = process.env) {
  const { phoneNumber } = whatsappConfig(env);
  if (!phoneNumber) throw new Error("WhatsApp phone number is missing in configuration");
  return sendWhatsappMessageTo(phoneNumber, text, env);
}

async function sendWhatsappMessageTo(chatId, text, env = process.env) {
  const { apiUrl, apiKey, sessionId } = whatsappConfig(env);
  if (!apiUrl) throw new Error("WhatsApp API URL is missing");

  let targetChatId = String(chatId || "").trim();
  if (targetChatId && !targetChatId.endsWith("@c.us") && !targetChatId.endsWith("@g.us")) {
    targetChatId = `${targetChatId}@c.us`;
  }

  const url = `${apiUrl}/api/sessions/${sessionId}/messages/send-text`;
  const headers = { "Content-Type": "application/json" };
  if (apiKey) {
    headers["X-API-Key"] = apiKey;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      chatId: targetChatId,
      text
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || data.error || `WhatsApp send failed with status ${response.status}`);
  }
  return data;
}

function whatsappNotificationText(item) {
  const title = item.title || "LifePilot notification";
  const type = item.type || "notification";
  const body = item.body || "";
  const due = item.due_at ? new Date(item.due_at).toLocaleString("en-IN", { timeZone: item.timezone || "Asia/Kolkata" }) : "";
  return [
    `*${title}*`,
    `Type: ${type}`,
    due ? `Time: ${due}` : "",
    body ? `\n${body}` : ""
  ].filter(Boolean).join("\n");
}

function formatBotDate(value, timezone = "Asia/Kolkata") {
  if (!value) return "";
  return new Date(value).toLocaleString("en-IN", {
    timeZone: timezone,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function commandHelp() {
  return [
    "*LifePilot Bot Commands*",
    "/start - Connect and show help",
    "/help - Show commands",
    "/test - Send a test reply",
    "/status - Show synced reminder count",
    "/today - Show items due today",
    "/due - Show next 7 days",
    "/bills - Show unpaid synced bills"
  ].join("\n");
}

function listItems(title, items, limit = 10) {
  if (!items.length) return `*${title}*\nNo synced items found.`;
  const rows = items.slice(0, limit).map((item, index) => {
    const due = formatBotDate(item.due_at, item.timezone || "Asia/Kolkata");
    return `${index + 1}. ${item.title}\n   ${item.type} - ${due}`;
  });
  const more = items.length > limit ? `\n+${items.length - limit} more` : "";
  return [`*${title}*`, ...rows, more].filter(Boolean).join("\n");
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

function verifyWebhookSignature(req, rawBody, secret) {
  if (!secret) return true;
  const signature = req.headers["x-openwa-signature"] || req.headers["x-webhook-signature"] || "";
  if (!signature) return false;

  const actualHash = signature.startsWith("sha256=") ? signature.slice(7) : signature;
  const hmac = crypto.createHmac("sha256", secret);
  const expectedHash = hmac.update(rawBody).digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(actualHash, "hex"),
      Buffer.from(expectedHash, "hex")
    );
  } catch {
    return false;
  }
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
    const parsed = await readRawAndJson(req);
    body = parsed.json;
  } catch {
    jsonResponse(res, 400, { error: "Invalid JSON body" });
    return;
  }

  const { userKey, phoneNumber } = whatsappConfig(env);
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
    await supabaseRequest("whatsapp_settings?on_conflict=user_key", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: [{
        user_key: userKey,
        phone_number: phoneNumber,
        enabled: Boolean(phoneNumber),
        categories: body.categories || {},
        quiet_hours: body.quietHours || {},
        timezone: body.timezone || "Asia/Kolkata",
        last_sync_at: new Date().toISOString()
      }]
    }, env);

    // Automatically register webhook with OpenWA
    try {
      const { apiUrl, apiKey, sessionId, webhookSecret } = whatsappConfig(env);
      if (apiUrl && webhookSecret) {
        const registerUrl = `${apiUrl}/api/sessions/${sessionId}/webhooks`;
        const headers = { "Content-Type": "application/json" };
        if (apiKey) {
          headers["X-API-Key"] = apiKey;
        }

        const host = req.headers.host || "localhost:5173";
        const proto = req.headers["x-forwarded-proto"] || (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
        const webhookUrl = `${proto}://${host}/api/bot/whatsapp-webhook`;

        fetch(registerUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({
            url: webhookUrl,
            events: ["message.received"],
            secret: webhookSecret
          })
        }).catch(() => {
          // Ignore failures if OpenWA is not running yet
        });
      }
    } catch {
      // Ignore failures
    }

    jsonResponse(res, 200, { synced: rows.length });
  } catch (error) {
    jsonResponse(res, 502, { error: error.message || "Notification sync failed" });
  }
}

export async function handleWhatsappTest(req, res, env = process.env) {
  if (req.method !== "POST") {
    jsonResponse(res, 405, { error: "Method not allowed" });
    return;
  }
  try {
    await sendWhatsappMessage("[OK] LifePilot WhatsApp notifications are connected.", env);
    jsonResponse(res, 200, { ok: true });
  } catch (error) {
    jsonResponse(res, 502, { error: error.message || "WhatsApp test failed" });
  }
}

export async function handleWhatsappWebhook(req, res, env = process.env) {
  if (req.method !== "POST") {
    jsonResponse(res, 405, { error: "Method not allowed" });
    return;
  }

  let rawBody, body;
  try {
    const parsed = await readRawAndJson(req);
    rawBody = parsed.raw;
    body = parsed.json;
  } catch {
    jsonResponse(res, 400, { error: "Invalid JSON body" });
    return;
  }

  const { webhookSecret, phoneNumber, userKey } = whatsappConfig(env);
  if (!verifyWebhookSignature(req, rawBody, webhookSecret)) {
    jsonResponse(res, 401, { error: "Unauthorized webhook request" });
    return;
  }

  const message = body.data || {};
  const from = message.from || "";
  const text = String(message.body || "").trim();
  const fromMe = Boolean(message.fromMe);

  if (body.event !== "message.received" || fromMe || !chatIdMatches(from, phoneNumber) || !text) {
    jsonResponse(res, 200, { ok: true, ignored: true });
    return;
  }

  try {
    const command = text.split(/\s+/)[0].toLowerCase().split("@")[0];
    if (command === "/start" || command === "/help") {
      await sendWhatsappMessageTo(from, commandHelp(), env);
      jsonResponse(res, 200, { ok: true });
      return;
    }
    if (command === "/test") {
      await sendWhatsappMessageTo(from, "[OK] LifePilot bot command test works.", env);
      jsonResponse(res, 200, { ok: true });
      return;
    }

    if (!hasSupabase(env)) {
      await sendWhatsappMessageTo(from, "Supabase is not configured on the backend yet.", env);
      jsonResponse(res, 200, { ok: true });
      return;
    }

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() + 7);

    if (command === "/status") {
      const items = await supabaseRequest(
        `notification_items?user_key=eq.${encodeURIComponent(userKey)}&enabled=eq.true&status=eq.active&select=id,type,due_at`,
        {},
        env
      );
      const dueNow = (items || []).filter((item) => item.due_at <= now.toISOString()).length;
      await sendWhatsappMessageTo(from, [
        "*LifePilot Sync Status*",
        `Active synced items: ${items?.length || 0}`,
        `Due now: ${dueNow}`,
        "Cron checks every 5 minutes."
      ].join("\n"), env);
      jsonResponse(res, 200, { ok: true });
      return;
    }

    if (command === "/today") {
      const items = await supabaseRequest(
        `notification_items?user_key=eq.${encodeURIComponent(userKey)}&enabled=eq.true&status=eq.active&due_at=gte.${encodeURIComponent(todayStart.toISOString())}&due_at=lte.${encodeURIComponent(todayEnd.toISOString())}&order=due_at.asc&select=*`,
        {},
        env
      );
      await sendWhatsappMessageTo(from, listItems("Due Today", items || []), env);
      jsonResponse(res, 200, { ok: true });
      return;
    }

    if (command === "/due") {
      const items = await supabaseRequest(
        `notification_items?user_key=eq.${encodeURIComponent(userKey)}&enabled=eq.true&status=eq.active&due_at=gte.${encodeURIComponent(now.toISOString())}&due_at=lte.${encodeURIComponent(weekEnd.toISOString())}&order=due_at.asc&select=*`,
        {},
        env
      );
      await sendWhatsappMessageTo(from, listItems("Due Next 7 Days", items || []), env);
      jsonResponse(res, 200, { ok: true });
      return;
    }

    if (command === "/bills") {
      const items = await supabaseRequest(
        `notification_items?user_key=eq.${encodeURIComponent(userKey)}&enabled=eq.true&status=eq.active&type=eq.bill&order=due_at.asc&select=*`,
        {},
        env
      );
      await sendWhatsappMessageTo(from, listItems("Unpaid Bills", items || []), env);
      jsonResponse(res, 200, { ok: true });
      return;
    }

    await sendWhatsappMessageTo(from, commandHelp(), env);
    jsonResponse(res, 200, { ok: true });
  } catch (error) {
    try {
      await sendWhatsappMessageTo(from, `Command failed: ${error.message || "Unknown error"}`, env);
    } catch {
      // Ignore reply failures
    }
    jsonResponse(res, 200, { ok: true, error: error.message || "Command failed" });
  }
}

function chatIdMatches(chatId, configured) {
  if (!configured) return false;
  const c1 = String(chatId).split("@")[0];
  const c2 = String(configured).split("@")[0];
  return c1 === c2;
}

export async function handleWhatsappCron(req, res, env = process.env) {
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
    const { userKey } = whatsappConfig(env);
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
        await sendWhatsappMessage(whatsappNotificationText(item), env);
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
            channel: "whatsapp",
            status: "sent"
          }]
        }, env);
      } catch (error) {
        errors.push({ id: item.id, error: error.message });
      }
    }

    jsonResponse(res, errors.length ? 207 : 200, { checked: items?.length || 0, sent, errors });
  } catch (error) {
    jsonResponse(res, 502, { error: error.message || "WhatsApp cron failed" });
  }
}
