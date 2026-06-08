import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { handleAiRequest } from "./server/geminiProxy.js";
import { handleWeatherRequest } from "./server/weatherProxy.js";
import {
  handleNotificationSync as handleTelegramSync,
  handleTelegramTest,
  handleTelegramWebhook,
  handleTelegramCron
} from "./server/telegramNotifications.js";
import {
  handleNotificationSync as handleWhatsappSync,
  handleWhatsappTest,
  handleWhatsappWebhook,
  handleWhatsappCron
} from "./server/whatsappNotifications.js";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      react(),
      {
        name: "lifepilot-local-ai-api",
        configureServer(server) {
          server.middlewares.use("/api/time", (req, res) => {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ iso: new Date().toISOString() }));
          });
          server.middlewares.use("/api/weather", async (req, res) => {
            await handleWeatherRequest(req, res);
          });
          server.middlewares.use("/api/ai", async (req, res) => {
            await handleAiRequest(req, res, env);
          });
          
          // Telegram
          server.middlewares.use("/api/notifications/sync", async (req, res) => {
            await handleTelegramSync(req, res, env);
          });
          server.middlewares.use("/api/notifications/test-telegram", async (req, res) => {
            await handleTelegramTest(req, res, env);
          });
          server.middlewares.use("/api/bot/telegram-webhook", async (req, res) => {
            await handleTelegramWebhook(req, res, env);
          });
          server.middlewares.use("/api/cron/telegram-notifications", async (req, res) => {
            await handleTelegramCron(req, res, env);
          });

          // WhatsApp
          server.middlewares.use("/api/notifications/sync-whatsapp", async (req, res) => {
            await handleWhatsappSync(req, res, env);
          });
          server.middlewares.use("/api/notifications/test-whatsapp", async (req, res) => {
            await handleWhatsappTest(req, res, env);
          });
          server.middlewares.use("/api/bot/whatsapp-webhook", async (req, res) => {
            await handleWhatsappWebhook(req, res, env);
          });
          server.middlewares.use("/api/cron/whatsapp-notifications", async (req, res) => {
            await handleWhatsappCron(req, res, env);
          });
        }
      }
    ]
  };
});

