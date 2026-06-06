import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { handleAiRequest } from "./server/geminiProxy.js";

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
          server.middlewares.use("/api/ai", async (req, res) => {
            await handleAiRequest(req, res, env);
          });
        }
      }
    ]
  };
});
