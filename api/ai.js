import { handleAiRequest } from "../server/geminiProxy.js";

export default async function handler(req, res) {
  await handleAiRequest(req, res, process.env);
}

