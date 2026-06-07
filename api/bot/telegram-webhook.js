import { handleTelegramWebhook } from "../../server/telegramNotifications.js";

export default async function handler(req, res) {
  return handleTelegramWebhook(req, res);
}
