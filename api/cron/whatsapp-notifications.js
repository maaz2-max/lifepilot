import { handleWhatsappCron } from "../../server/whatsappNotifications.js";

export default async function handler(req, res) {
  return handleWhatsappCron(req, res);
}
