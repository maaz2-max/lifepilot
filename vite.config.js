import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { handleAiRequest } from "./server/geminiProxy.js";
import { handleWeatherRequest } from "./server/weatherProxy.js";
import {
  handleNotificationSync as handleTelegramSync,
  handleTelegramTest,
  handleTelegramWebhook,
  handleTelegramCron,
  handleTelegramSendCustom
} from "./server/telegramNotifications.js";


export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    define: {
      "process.env.SUPABASE_URL": JSON.stringify(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || env.VITE_SUPABASE_URL || ""),
      "process.env.SUPABASE_ANON_KEY": JSON.stringify(env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || "")
    },
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
          server.middlewares.use("/api/notifications/send-custom", async (req, res) => {
            await handleTelegramSendCustom(req, res, env);
          });
          server.middlewares.use("/api/bot/telegram-webhook", async (req, res) => {
            await handleTelegramWebhook(req, res, env);
          });
          server.middlewares.use("/api/cron/telegram-notifications", async (req, res) => {
            await handleTelegramCron(req, res, env);
          });

        }
      }
    ]
  };
});

