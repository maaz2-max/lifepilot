import { handleWhatsappTest } from "../../server/whatsappNotifications.js";

export default async function handler(req, res) {
  return handleWhatsappTest(req, res);
}
