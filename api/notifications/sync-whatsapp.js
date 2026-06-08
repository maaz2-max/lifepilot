import { handleNotificationSync } from "../../server/whatsappNotifications.js";

export default async function handler(req, res) {
  return handleNotificationSync(req, res);
}
