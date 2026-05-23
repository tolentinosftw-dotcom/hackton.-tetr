const fs = require("node:fs");
const https = require("node:https");

const DEFAULT_URL =
  "https://www.mercadolibre.com.co/ofertas#c_id=/home/promotions-recommendations&c_uid=d181903c-522c-4afe-8bca-c70f65c871f6";

const source = process.argv[2] ?? DEFAULT_URL;
const outputPath = process.argv[3] ?? "products.json";

function decodeHtml(value = "") {
  const decoded = value
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return repairMojibake(decoded);
}

function repairMojibake(value) {
  if (!/[ÃÂ]/.test(value)) return value;

  try {
    return Buffer.from(value, "latin1").toString("utf8");
  } catch {
    return value;
  }
}

function stripTags(value = "") {
  return decodeHtml(value.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " "));
}

function getAttribute(html, name) {
  const match = html.match(new RegExp(`${name}=["']([^"']+)["']`, "i"));
  return match ? decodeHtml(match[1]) : "";
}

function firstRawMatch(html, patterns) {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1];
  }

  return "";
}

function firstText(html, patterns) {
  return stripTags(firstRawMatch(html, patterns));
}

function cleanPrice(value) {
  const match = value.replace(/[^\d]/g, "");
  return match ? Number(match) : 0;
}

function slugify(value) {
  return decodeHtml(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        {
          headers: {
            "User-Agent": "Mozilla/5.0",
            Accept: "text/html,application/xhtml+xml",
          },
        },
        (response) => {
          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(`MercadoLibre responded with HTTP ${response.statusCode}`));
            response.resume();
            return;
          }

          let data = "";
          response.setEncoding("utf8");
          response.on("data", (chunk) => {
            data += chunk;
          });
          response.on("end", () => resolve(data));
        }
      )
      .on("error", reject);
  });
}

async function readSource(input) {
  if (/^https?:\/\//i.test(input)) return fetchHtml(input);
  if (!fs.existsSync(input)) throw new Error(`Input file not found: ${input}`);
  return fs.readFileSync(input, "utf8");
}

function splitCards(html) {
  const cards = [];
  const pattern =
    /<div\b[^>]*class=["'][^"']*\bandes-card\b[^"']*\bpoly-card\b[^"']*["'][\s\S]*?(?=<div\b[^>]*class=["'][^"']*\bandes-card\b[^"']*\bpoly-card\b[^"']*["']|<\/main>|<\/body>|$)/gi;
  let match;

  while ((match = pattern.exec(html))) {
    const cardHtml = match[0];
    if (cardHtml.includes("poly-component__title") && cardHtml.includes("poly-component__picture")) {
      cards.push(cardHtml);
    }
  }

  return cards;
}

function productFromCard(cardHtml, index) {
  const title = firstText(cardHtml, [
    /<a[^>]*class=["'][^"']*poly-component__title[^"']*["'][^>]*>([\s\S]*?)<\/a>/i,
    /<img[^>]+alt=["']([^"']+)["'][^>]*>/i,
  ]);
  const linkTag = firstRawMatch(cardHtml, [/(<a[^>]*class=["'][^"']*poly-component__title[^"']*["'][^>]*>)/i]);
  const imageTag = firstRawMatch(cardHtml, [/(<img[^>]*class=["'][^"']*poly-component__picture[^"']*["'][^>]*>)/i]);
  const priceText = firstRawMatch(cardHtml, [
    /aria-label=["']Ahora:\s*([^"']+)["'][^>]*data-andes-money-amount/i,
    /aria-label=["']([^"']*pesos colombianos)["'][^>]*data-andes-money-amount/i,
  ]);
  const discount = firstText(cardHtml, [
    /<span[^>]*class=["'][^"']*poly-price__disc_label[^"']*["'][^>]*>([\s\S]*?)<\/span>/i,
  ]);
  const seller = firstText(cardHtml, [
    /<span[^>]*class=["'][^"']*poly-component__seller[^"']*["'][^>]*>([\s\S]*?)<\/span>/i,
  ]);

  const url = getAttribute(linkTag, "href");
  const image = getAttribute(imageTag, "src");
  if (!title || !url || !image) return null;

  const idMatch = url.match(/(?:wid=|\/)(MCO\d+)/i);
  const id = idMatch ? idMatch[1].toLowerCase() : `meli-${index + 1}-${slugify(title)}`;

  return {
    id: `mercadolibre-${id}`,
    source_id: id.toUpperCase(),
    name: title,
    category: "MercadoLibre Deals",
    price: cleanPrice(priceText),
    stock: 1,
    tags: ["mercadolibre", "deal", "ofertas", discount].filter(Boolean),
    description: [title, seller, discount].filter(Boolean).join(" - "),
    image,
    url,
  };
}

function uniqueById(products) {
  const seen = new Set();
  return products.filter((product) => {
    if (seen.has(product.id)) return false;
    seen.add(product.id);
    return true;
  });
}

async function main() {
  const html = await readSource(source);
  const products = uniqueById(splitCards(html).map(productFromCard).filter(Boolean)).slice(0, 60);
  const mercadoLibreProducts = products.filter((product) => !/amazon/i.test(`${product.name} ${product.description} ${product.url}`));

  if (!mercadoLibreProducts.length) {
    throw new Error("No MercadoLibre products were found. The page markup may have changed.");
  }

  fs.writeFileSync(outputPath, `${JSON.stringify(mercadoLibreProducts, null, 2)}\n`, "utf8");
  console.log(`Imported ${mercadoLibreProducts.length} MercadoLibre products into ${outputPath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
