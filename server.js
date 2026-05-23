const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { URL } = require("node:url");

const root = __dirname;
const port = Number(process.env.PORT || 5173);

loadEnv(path.join(root, ".env"));

const openAiKey = process.env.OPENAI_API_KEY || process.env.openKey || process.env.OPENAI_KEY;
const openAiModel = process.env.OPENAI_MODEL || "gpt-5.4-mini";

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

function localAnswer(query, candidates) {
  const ideal = candidates[0];
  if (!ideal) {
    return {
      message: `No encontre productos para "${query}".`,
      productIds: [],
    };
  }

  return {
    message: `El producto ideal es ${ideal.name}. Su precio es ${formatCop(ideal.price)}.`,
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

async function askOpenAi(query, candidates) {
  if (!openAiKey) return localAnswer(query, candidates);

  const compactProducts = candidates.map((product) => ({
    id: product.id,
    name: product.name,
    price: product.price,
    description: product.description,
    tags: product.tags,
  }));

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
            "Eres un asistente de e-commerce por voz. Debes elegir productos solo del JSON entregado. Responde en espanol claro, corto y util. Devuelve exclusivamente JSON valido.",
        },
        {
          role: "user",
          content: JSON.stringify({
            customer_request: query,
            products: compactProducts,
            expected_json_shape: {
              message: "short spoken answer",
              productIds: ["best product id first"],
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
  if (!response.ok) {
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
  return {
    message: parsed.message || localAnswer(query, candidates).message,
    productIds: Array.isArray(parsed.productIds) ? parsed.productIds : [],
  };
}

function sendJson(response, status, data) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data));
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

function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const safePath = path
    .normalize(decodeURIComponent(url.pathname))
    .replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(root, safePath === "/" ? "index.html" : safePath);

  if (!filePath.startsWith(root) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
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
  try {
    if (request.method === "POST" && request.url === "/api/product-search") {
      const body = JSON.parse(await readBody(request));
      const query = String(body.query || "").trim();
      if (!query) {
        sendJson(response, 400, { message: "Query is required", productIds: [] });
        return;
      }

      const candidates = getCandidateProducts(query);
      const answer = await askOpenAi(query, candidates);
      const fallback = localAnswer(query, candidates);
      sendJson(response, 200, {
        message: answer.message || fallback.message,
        productIds: answer.productIds.length ? answer.productIds : fallback.productIds,
      });
      return;
    }

    serveStatic(request, response);
  } catch (error) {
    sendJson(response, 500, {
      message: error.message,
      productIds: [],
    });
  }
});

server.listen(port, () => {
  console.log(`VozMarket running on http://localhost:${port}`);
});
