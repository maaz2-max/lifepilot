import { handleNotificationSync } from "../../server/telegramNotifications.js";

export default async function handler(req, res) {
  return handleNotificationSync(req, res);
}
