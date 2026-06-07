import { handleTelegramTest } from "../../server/telegramNotifications.js";

export default async function handler(req, res) {
  return handleTelegramTest(req, res);
}
