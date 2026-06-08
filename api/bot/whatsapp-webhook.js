import { handleWhatsappWebhook } from "../../server/whatsappNotifications.js";

export default async function handler(req, res) {
  return handleWhatsappWebhook(req, res);
}
