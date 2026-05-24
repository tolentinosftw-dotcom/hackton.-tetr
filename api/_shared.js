const fs = require("node:fs");
const path = require("node:path");
require("dotenv").config();

const root = path.join(__dirname, "..");
const openAiKey = process.env.OPENAI_API_KEY || process.env.openKey || process.env.OPENAI_KEY;
const openAiModel = process.env.OPENAI_MODEL || "gpt-5.4-mini";
const elevenLabsKey =
  process.env.ELEVENLABS_API_KEY || process.env.elevenlabs || process.env.ELEVENLABS_KEY;
const elevenLabsVoiceId =
  process.env.ELEVENLABS_VOICE_ID || process.env.ELEVENLABS_VOICE_I || "JBFqnCBsd6RMkjVDRZzb";
const elevenLabsModelId = process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2";
const elevenLabsOutputFormat = process.env.ELEVENLABS_OUTPUT_FORMAT || "mp3_44100_128";

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

function getAllProducts() {
  return JSON.parse(fs.readFileSync(path.join(root, "products.json"), "utf8"));
}

function getProductById(id) {
  return getAllProducts().find((product) => product.id === id);
}

function getCandidateProducts(query, limit = 12) {
  const products = getAllProducts();
  const scored = products
    .map((product) => ({ product, score: scoreProduct(product, query) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.product);

  return (scored.length ? scored : products).slice(0, limit);
}

function formatCop(value) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value || 0);
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

async function askOpenAi(query, candidates, history = []) {
  if (!openAiKey) {
    console.warn("[vercel] OpenAI key missing, using local product answer");
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
    `[vercel] OpenAI product request model=${openAiModel} query="${query}" candidates=${compactProducts.length}`
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
  console.log(`[vercel] OpenAI product response status=${response.status} ok=${response.ok}`);
  if (!response.ok) {
    console.error("[vercel] OpenAI product error body", data);
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
  console.log("[vercel] OpenAI product parsed", parsed);
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
    console.warn("[vercel] OpenAI key missing, using local cart answer");
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
    `[vercel] OpenAI chat request model=${openAiModel} message="${message}" cart=${cart.length} candidates=${candidates.length}`
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
  console.log(`[vercel] OpenAI chat response status=${response.status} ok=${response.ok}`);
  if (!response.ok) {
    console.error("[vercel] OpenAI chat error body", data);
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
  console.log("[vercel] OpenAI chat parsed", parsed);
  return {
    message: parsed.message || "What are you shopping for today?",
    productIds: Array.isArray(parsed.productIds) ? parsed.productIds : [],
    intent: parsed.intent || "cart_help",
  };
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
    console.error("[vercel] ElevenLabs key missing");
    throw new Error("Missing ELEVENLABS_API_KEY or elevenlabs");
  }

  console.log(
    `[vercel] ElevenLabs convert start voice=${elevenLabsVoiceId} model=${elevenLabsModelId} format=${elevenLabsOutputFormat}`
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

  console.log("[vercel] ElevenLabs convert returned audio response");
  return streamToBuffer(audio);
}

async function readJsonBody(request) {
  if (request.body && typeof request.body === "object") return request.body;
  if (typeof request.body === "string") return JSON.parse(request.body || "{}");

  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function sendJson(response, status, data) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(data));
}

function sendAudio(response, buffer) {
  response.statusCode = 200;
  response.setHeader("Content-Type", "audio/mpeg");
  response.setHeader("Content-Length", buffer.length);
  response.setHeader("Cache-Control", "no-store");
  response.end(buffer);
}

function methodNotAllowed(response, method) {
  sendJson(response, 405, { message: `${method} is not allowed` });
}

module.exports = {
  askOpenAi,
  askShoppingAssistant,
  elevenLabsKey,
  elevenLabsVoiceId,
  getCandidateProducts,
  getProductById,
  localAnswer,
  methodNotAllowed,
  openAiKey,
  readJsonBody,
  sendAudio,
  sendJson,
  synthesizeSpeech,
};
