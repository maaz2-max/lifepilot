import { handleTelegramCron } from "../../server/telegramNotifications.js";

export default async function handler(req, res) {
  return handleTelegramCron(req, res);
}
