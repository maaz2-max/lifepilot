import { handleTelegramSendCustom } from "../../server/telegramNotifications.js";

export default async function handler(req, res) {
  return handleTelegramSendCustom(req, res);
}
