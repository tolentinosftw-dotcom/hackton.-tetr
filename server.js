const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { URL } = require("node:url");
require("dotenv").config();

const root = __dirname;
const port = Number(process.env.PORT || 5173);

loadEnv(path.join(root, ".env"));

const openAiKey = process.env.OPENAI_API_KEY || process.env.openKey || process.env.OPENAI_KEY;
const openAiModel = process.env.OPENAI_MODEL || "gpt-5.4-mini";
const openAiTranscribeModel = process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe";
const elevenLabsKey =
  process.env.ELEVENLABS_API_KEY || process.env.elevenlabs || process.env.ELEVENLABS_KEY;
const elevenLabsVoiceId =
  process.env.ELEVENLABS_VOICE_ID || process.env.ELEVENLABS_VOICE_I || "JBFqnCBsd6RMkjVDRZzb";
const elevenLabsModelId = process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2";
const elevenLabsOutputFormat = process.env.ELEVENLABS_OUTPUT_FORMAT || "mp3_44100_128";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed
      .slice(separator + 1)
      .trim()
      .replace(/^["']|["']$/g, "");

    if (!process.env[key]) process.env[key] = value;
  }
}

function normalize(value = "") {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function scoreProduct(product, query) {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const searchable = normalize(
    [product.name, product.description, product.category, ...(product.tags || [])].join(" ")
  );

  return words.reduce((score, word) => {
    if (normalize(product.name).includes(word)) return score + 5;
    if ((product.tags || []).some((tag) => normalize(tag).includes(word))) return score + 3;
    if (searchable.includes(word)) return score + 1;
    return score;
  }, 0);
}

function getCandidateProducts(query, limit = 12) {
  const products = JSON.parse(fs.readFileSync(path.join(root, "products.json"), "utf8"));
  const scored = products
    .map((product) => ({ product, score: scoreProduct(product, query) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.product);

  return (scored.length ? scored : products).slice(0, limit);
}

function getAllProducts() {
  return JSON.parse(fs.readFileSync(path.join(root, "products.json"), "utf8"));
}

function getProductById(id) {
  return getAllProducts().find((product) => product.id === id);
}

function localAnswer(query, candidates) {
  const ideal = candidates[0];
  if (!ideal) {
    return {
      message: `I could not find an exact match for "${query}". What kind of product are you interested in today?`,
      productIds: [],
    };
  }

  return {
    message: `I found a good option: ${ideal.name}. It is ${formatCop(ideal.price)}. Would you like me to compare it with another option?`,
    productIds: candidates.slice(0, 8).map((product) => product.id),
  };
}

function formatCop(value) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

async function askOpenAi(query, candidates, history = []) {
  if (!openAiKey) {
    console.warn("[server] OpenAI key missing, using local product answer");
    return localAnswer(query, candidates);
  }

  const compactProducts = candidates.map((product) => ({
    id: product.id,
    name: product.name,
    price: product.price,
    description: product.description,
    tags: product.tags,
  }));

  console.log(
    `[server] OpenAI product request model=${openAiModel} query="${query}" candidates=${compactProducts.length}`
  );
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: openAiModel,
      input: [
        {
          role: "system",
          content:
            "You are a warm voice shopping assistant for an e-commerce site. Understand Spanish and English. Reply in the customer's language when possible, but keep the wording short and easy to speak with ElevenLabs. Sound conversational, not robotic: use simple phrases like 'Sure, I can help with that' or 'Perfect, I found this option for you.' Recommend only from the provided product JSON. Ask one useful clarifying question only when needed. Do not oversell, do not pressure the customer, and do not invent products. Keep replies to 1-3 short sentences. Return only valid JSON.",
        },
        {
          role: "user",
          content: JSON.stringify({
            conversation_history: history.slice(-8),
            customer_request: query,
            products: compactProducts,
            expected_json_shape: {
              message: "short conversational answer in Spanish or English, 1-3 speakable sentences",
              productIds: ["recommended product id first; can be empty if asking a clarifying question"],
              intent: "greeting | clarify | recommend | compare | cart_help | checkout_help",
            },
          }),
        },
      ],
      text: {
        format: {
          type: "json_object",
        },
      },
    }),
  });

  const data = await response.json();
  console.log(`[server] OpenAI product response status=${response.status} ok=${response.ok}`);
  if (!response.ok) {
    console.error("[server] OpenAI product error body", data);
    throw new Error(data.error?.message || "OpenAI request failed");
  }

  const outputText =
    data.output_text ||
    data.output
      ?.flatMap((item) => item.content || [])
      .map((content) => content.text)
      .filter(Boolean)
      .join("\n");

  const parsed = JSON.parse(outputText || "{}");
  console.log("[server] OpenAI product parsed", parsed);
  return {
    message: parsed.message || localAnswer(query, candidates).message,
    productIds: Array.isArray(parsed.productIds) ? parsed.productIds : [],
    intent: parsed.intent || "recommend",
  };
}

async function askShoppingAssistant(message, cart = [], history = []) {
  const query = `${message} ${cart.map((product) => product.name).join(" ")}`.trim();
  const candidates = getCandidateProducts(query || message, 10);

  if (!openAiKey) {
    console.warn("[server] OpenAI key missing, using local cart answer");
    return {
      message:
        cart.length > 0
          ? `You have ${cart.length} item${cart.length === 1 ? "" : "s"} in your cart. Would you like me to compare them or help you choose one?`
          : "What are you shopping for today? I can help you compare options, prices, and features.",
      productIds: [],
      intent: "cart_help",
    };
  }

  console.log(
    `[server] OpenAI chat request model=${openAiModel} message="${message}" cart=${cart.length} candidates=${candidates.length}`
  );
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: openAiModel,
      input: [
        {
          role: "system",
          content:
            "You are a friendly personal shopping assistant for a voice-commerce site. Understand Spanish and English. Reply in the customer's language when possible. Help naturally: understand needs, compare products, explain tradeoffs, and guide next steps without overselling. The frontend collects checkout details, so do not ask for name, address, or city unless the user clearly wants to buy or checkout. Use only the provided product and cart data. Keep answers natural, concise, and TTS-friendly, usually 1-3 short sentences. Return only valid JSON.",
        },
        {
          role: "user",
          content: JSON.stringify({
            conversation_history: history.slice(-8),
            customer_message: message,
            cart,
            candidate_products: candidates.map((product) => ({
              id: product.id,
              name: product.name,
              price: product.price,
              description: product.description,
              tags: product.tags,
            })),
            expected_json_shape: {
              message: "short conversational answer in Spanish or English, 1-3 speakable sentences",
              productIds: ["optional suggested product ids"],
              intent: "greeting | clarify | recommend | compare | cart_help | checkout_help",
            },
          }),
        },
      ],
      text: {
        format: {
          type: "json_object",
        },
      },
    }),
  });

  const data = await response.json();
  console.log(`[server] OpenAI chat response status=${response.status} ok=${response.ok}`);
  if (!response.ok) {
    console.error("[server] OpenAI chat error body", data);
    throw new Error(data.error?.message || "OpenAI chat request failed");
  }

  const outputText =
    data.output_text ||
    data.output
      ?.flatMap((item) => item.content || [])
      .map((content) => content.text)
      .filter(Boolean)
      .join("\n");

  const parsed = JSON.parse(outputText || "{}");
  console.log("[server] OpenAI chat parsed", parsed);
  return {
    message: parsed.message || "What are you shopping for today?",
    productIds: Array.isArray(parsed.productIds) ? parsed.productIds : [],
    intent: parsed.intent || "cart_help",
  };
}

function sendJson(response, status, data) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data));
}

async function streamToBuffer(audio) {
  if (Buffer.isBuffer(audio)) return audio;
  if (audio instanceof ArrayBuffer) return Buffer.from(audio);
  if (audio instanceof Uint8Array) return Buffer.from(audio);

  if (audio?.getReader) {
    const reader = audio.getReader();
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  }

  if (audio?.[Symbol.asyncIterator]) {
    const chunks = [];
    for await (const chunk of audio) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  if (audio?.arrayBuffer) return Buffer.from(await audio.arrayBuffer());
  throw new Error("Unsupported ElevenLabs audio response");
}

async function synthesizeSpeech(text) {
  if (!elevenLabsKey) {
    console.error("[server] ElevenLabs key missing");
    throw new Error("Missing ELEVENLABS_API_KEY or elevenlabs in .env");
  }

  console.log(
    `[server] ElevenLabs convert start voice=${elevenLabsVoiceId} model=${elevenLabsModelId} format=${elevenLabsOutputFormat}`
  );
  const { ElevenLabsClient } = await import("@elevenlabs/elevenlabs-js");
  const elevenlabs = new ElevenLabsClient({
    apiKey: elevenLabsKey,
  });

  const audio = await elevenlabs.textToSpeech.convert(elevenLabsVoiceId, {
    text,
    modelId: elevenLabsModelId,
    outputFormat: elevenLabsOutputFormat,
  });

  console.log("[server] ElevenLabs convert returned audio response");
  return streamToBuffer(audio);
}

async function transcribeAudioBuffer(buffer, mimeType = "audio/webm") {
  if (!openAiKey) {
    console.error("[server] OpenAI key missing for transcription");
    throw new Error("Missing OPENAI_API_KEY or openKey in .env");
  }

  console.log(`[server] OpenAI transcription start model=${openAiTranscribeModel} bytes=${buffer.length}`);
  const extension = mimeType.includes("mp4")
    ? "mp4"
    : mimeType.includes("mpeg")
      ? "mp3"
      : mimeType.includes("ogg")
        ? "ogg"
        : "webm";
  const form = new FormData();
  form.append("model", openAiTranscribeModel);
  form.append("file", new Blob([buffer], { type: mimeType }), `voice.${extension}`);

  const openAiResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiKey}`,
    },
    body: form,
  });

  const data = await openAiResponse.json();
  console.log(`[server] OpenAI transcription response status=${openAiResponse.status} ok=${openAiResponse.ok}`);
  if (!openAiResponse.ok) {
    console.error("[server] OpenAI transcription error body", data);
    throw new Error(data.error?.message || "OpenAI transcription failed");
  }

  return String(data.text || "").trim();
}

function sendAudio(response, buffer) {
  response.writeHead(200, {
    "Content-Type": "audio/mpeg",
    "Content-Length": buffer.length,
    "Cache-Control": "no-store",
  });
  response.end(buffer);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request too large"));
        request.destroy();
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function readBinaryBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    request.on("data", (chunk) => {
      total += chunk.length;
      if (total > 10_000_000) {
        reject(new Error("Audio request too large"));
        request.destroy();
        return;
      }
      chunks.push(Buffer.from(chunk));
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = path
    .normalize(decodeURIComponent(requestedPath))
    .replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(root, safePath);

  if (!filePath.startsWith(root) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    console.warn(`[server] static not found url=${request.url} path=${filePath}`);
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
  });
  fs.createReadStream(filePath).pipe(response);
}

const server = http.createServer(async (request, response) => {
  console.log(`[server] ${request.method} ${request.url}`);
  try {
    if (request.method === "GET" && request.url === "/api/health") {
      console.log("[server] health check ok");
      sendJson(response, 200, {
        ok: true,
        openAiKeyLoaded: Boolean(openAiKey),
        elevenLabsKeyLoaded: Boolean(elevenLabsKey),
        elevenLabsVoiceId,
      });
      return;
    }

    if (request.method === "GET" && request.url.startsWith("/api/products/")) {
      const id = decodeURIComponent(request.url.replace("/api/products/", ""));
      console.log(`[server] product detail request id=${id}`);
      const product = getProductById(id);
      if (!product) {
        console.warn(`[server] product not found id=${id}`);
        sendJson(response, 404, { message: "Product not found" });
        return;
      }
      console.log(`[server] product detail ok id=${id}`);
      sendJson(response, 200, product);
      return;
    }

    if (request.method === "POST" && request.url === "/api/product-search") {
      const body = JSON.parse(await readBody(request));
      const query = String(body.query || "").trim();
      const history = Array.isArray(body.history) ? body.history : [];
      console.log(`[server] product-search query="${query}" history=${history.length}`);
      if (!query) {
        sendJson(response, 400, { message: "Query is required", productIds: [] });
        return;
      }

      const candidates = getCandidateProducts(query);
      console.log(`[server] product-search candidates=${candidates.length}`);
      const answer = await askOpenAi(query, candidates, history);
      const fallback = localAnswer(query, candidates);
      const answerProductIds = Array.isArray(answer.productIds) ? answer.productIds : [];
      const canUseFallbackProducts = !["clarify", "greeting"].includes(answer.intent);
      console.log(
        `[server] product-search answer intent=${answer.intent || "none"} productIds=${(answer.productIds || []).join(",")}`
      );
      sendJson(response, 200, {
        message: answer.message || fallback.message,
        productIds: answerProductIds.length
          ? answerProductIds
          : canUseFallbackProducts
            ? fallback.productIds
            : [],
        intent: answer.intent || "recommend",
      });
      return;
    }

    if (request.method === "POST" && request.url === "/api/tts") {
      const body = JSON.parse(await readBody(request));
      const text = String(body.text || "").trim().slice(0, 900);
      console.log(`[server] tts request chars=${text.length} voice=${elevenLabsVoiceId}`);
      if (!text) {
        sendJson(response, 400, { message: "Text is required" });
        return;
      }

      const audio = await synthesizeSpeech(text);
      console.log(`[server] tts ok bytes=${audio.length}`);
      sendAudio(response, audio);
      return;
    }

    if (request.method === "POST" && request.url === "/api/transcribe") {
      const audio = await readBinaryBody(request);
      const mimeType = request.headers["content-type"] || "audio/webm";
      console.log(`[server] transcribe request bytes=${audio.length} type=${mimeType}`);
      if (!audio.length) {
        sendJson(response, 400, { message: "Audio is required", text: "" });
        return;
      }

      const text = await transcribeAudioBuffer(audio, mimeType);
      sendJson(response, 200, { text });
      return;
    }

    if (request.method === "POST" && request.url === "/api/shop-chat") {
      const body = JSON.parse(await readBody(request));
      const message = String(body.message || "").trim();
      const cart = Array.isArray(body.cart) ? body.cart : [];
      const history = Array.isArray(body.history) ? body.history : [];
      console.log(`[server] shop-chat message="${message}" cart=${cart.length} history=${history.length}`);
      if (!message) {
        sendJson(response, 400, { message: "Message is required", productIds: [] });
        return;
      }

      const answer = await askShoppingAssistant(message, cart, history);
      console.log(
        `[server] shop-chat answer intent=${answer.intent || "none"} productIds=${(answer.productIds || []).join(",")}`
      );
      sendJson(response, 200, answer);
      return;
    }

    serveStatic(request, response);
  } catch (error) {
    console.error(`[server] error on ${request.method} ${request.url}:`, error);
    sendJson(response, 500, {
      message: error.message,
      productIds: [],
    });
  }
});

server.on("error", (error) => {
  console.error(`[server] failed to start on port ${port}`, error);
  if (error.code === "EADDRINUSE") {
    console.error(
      `[server] port ${port} is already in use. Stop the other process or run with another port: $env:PORT=5174; node server.js`
    );
  }
  process.exit(1);
});

server.listen(port, () => {
  console.log(`VozMarket running on http://localhost:${port}`);
  console.log("[server] debug routes ready: POST /api/product-search, POST /api/shop-chat, POST /api/tts");
  console.log("[server] OpenAI key loaded:", Boolean(openAiKey));
  console.log("[server] ElevenLabs key loaded:", Boolean(elevenLabsKey));
  console.log("[server] ElevenLabs voice:", elevenLabsVoiceId);
});
