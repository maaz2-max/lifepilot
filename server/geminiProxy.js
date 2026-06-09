export const FREE_GEMINI_MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-3-flash",
  "gemini-3.5-flash"
];

const FREE_MLVOCA_MODELS = ["mlvoca:tinyllama", "mlvoca:deepseek-r1:1.5b"];
const MLVOCA_MODEL_MAP = {
  "mlvoca:tinyllama": "tinyllama",
  "mlvoca:deepseek-r1:1.5b": "deepseek-r1:1.5b"
};

let nextKeyIndex = 0;

function getKeys(env = process.env) {
  const keys = [
    ...(env.GEMINI_API_KEYS || "").split(","),
    env.GEMINI_API_KEY,
    env.GEMINI_API_KEY_BACKUP
  ]
    .map((key) => String(key || "").trim())
    .filter(Boolean);
  return [...new Set(keys)];
}

function jsonResponse(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function callGemini({ key, model, prompt }) {
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json"
      }
    })
  });
}

async function callMlvoca({ model, prompt }) {
  return fetch("https://mlvoca.com/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MLVOCA_MODEL_MAP[model] || "tinyllama",
      prompt,
      stream: false,
      format: "json",
      options: { temperature: 0.2 }
    })
  });
}

function normalizeMlvocaResponse(data) {
  return {
    candidates: [
      {
        content: {
          parts: [{ text: data.response || "{}" }]
        }
      }
    ]
  };
}

export async function handleAiRequest(req, res, env = process.env) {
  if (req.method !== "POST") {
    jsonResponse(res, 405, { error: "Method not allowed" });
    return;
  }

  let body;
  try {
    body = await readBody(req);
  } catch {
    jsonResponse(res, 400, { error: "Invalid JSON body" });
    return;
  }

  const keys = getKeys(env);
  const selectedModel = [...FREE_GEMINI_MODELS, ...FREE_MLVOCA_MODELS].includes(body.model) ? body.model : FREE_GEMINI_MODELS[0];
  if (!body.prompt || typeof body.prompt !== "string") {
    jsonResponse(res, 400, { error: "Missing prompt" });
    return;
  }

  if (FREE_MLVOCA_MODELS.includes(selectedModel)) {
    try {
      const mlvocaResponse = await callMlvoca({ model: selectedModel, prompt: body.prompt });
      if (mlvocaResponse.ok) {
        jsonResponse(res, 200, {
          data: normalizeMlvocaResponse(await mlvocaResponse.json()),
          model: selectedModel,
          provider: "mlvoca"
        });
        return;
      }
    } catch {
      // Fall back to Gemini below when keys are available.
    }
  }

  if (!keys.length) {
    jsonResponse(res, 503, { error: "Server busy. Please try after some time.", busy: true });
    return;
  }

  const errors = [];
  const startIndex = nextKeyIndex % keys.length;

  for (let attempt = 0; attempt < keys.length; attempt += 1) {
    const keyIndex = (startIndex + attempt) % keys.length;
    const key = keys[keyIndex];

    try {
      const response = await callGemini({ key, model: FREE_GEMINI_MODELS.includes(selectedModel) ? selectedModel : FREE_GEMINI_MODELS[0], prompt: body.prompt });
      if (response.ok) {
        nextKeyIndex = keyIndex;
        const data = await response.json();
        jsonResponse(res, 200, { data, model: selectedModel, keyIndex, provider: "gemini" });
        return;
      }

      const busy = [429, 500, 502, 503, 504].includes(response.status);
      const errorText = await response.text();
      errors.push({ keyIndex, status: response.status, busy });

      if (!busy && errors.length >= keys.length) {
        jsonResponse(res, response.status, { error: "AI request failed", detail: errorText, keyIndex });
        return;
      }
    } catch (error) {
      errors.push({ keyIndex, status: 503, busy: true, message: error.message });
    }
  }

  nextKeyIndex = (startIndex + 1) % keys.length;
  if (!FREE_MLVOCA_MODELS.includes(selectedModel)) {
    try {
      const fallbackResponse = await callMlvoca({ model: "mlvoca:deepseek-r1:1.5b", prompt: body.prompt });
      if (fallbackResponse.ok) {
        jsonResponse(res, 200, {
          data: normalizeMlvocaResponse(await fallbackResponse.json()),
          model: "mlvoca:deepseek-r1:1.5b",
          provider: "mlvoca-fallback-deepseek"
        });
        return;
      }
    } catch {
      // Try next fallback
    }

    try {
      const fallbackResponse2 = await callMlvoca({ model: "mlvoca:tinyllama", prompt: body.prompt });
      if (fallbackResponse2.ok) {
        jsonResponse(res, 200, {
          data: normalizeMlvocaResponse(await fallbackResponse2.json()),
          model: "mlvoca:tinyllama",
          provider: "mlvoca-fallback-tinyllama"
        });
        return;
      }
    } catch {
      // Return the Gemini failure below.
    }
  }
  const allBusy = errors.every((error) => error.busy);
  jsonResponse(res, allBusy ? 503 : 502, {
    error: allBusy ? "Server busy. Please try after some time." : "AI request failed with all configured keys.",
    busy: allBusy,
    attempts: errors
  });
}
