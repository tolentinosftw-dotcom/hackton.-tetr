const productGrid = document.querySelector("#product-grid");
const resultSummary = document.querySelector("#result-summary");
const searchForm = document.querySelector("#search-form");
const searchInput = document.querySelector("#search-input");
const categoryTabs = document.querySelector("#category-tabs");
const voiceDemoButton = document.querySelector("#voice-demo-button");
const clearButton = document.querySelector("#clear-button");
const cartCount = document.querySelector("#cart-count");
const cartTotal = document.querySelector("#cart-total");
const chatForm = document.querySelector("#chat-form");
const chatInput = document.querySelector("#chat-input");
const chatMessages = document.querySelector("#chat-messages");
const assistantOrb = document.querySelector("#assistant-orb");
const assistantImage = document.querySelector("#assistant-image");
const assistantState = document.querySelector("#assistant-state");
const assistantMessage = document.querySelector("#assistant-message");
const elevenlabsWidget = document.querySelector("#elevenlabs-widget");

const stateAssets = {
  idle: {
    image: "4.png",
    label: "Ready",
    alt: "Genie assistant ready",
  },
  listening: {
    image: "1.png",
    label: "Listening",
    alt: "Assistant listening",
  },
  thinking: {
    image: "2.png",
    label: "Thinking",
    alt: "Assistant thinking",
  },
  speaking: {
    image: "3.png",
    label: "Answering",
    alt: "Assistant answering",
  },
};

let products = [];
let activeCategory = "All";
let activeQuery = "";
let cart = [];
let conversationHistory = [];

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

function normalize(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function setAssistant(mode, message) {
  const asset = stateAssets[mode] ?? stateAssets.idle;
  assistantImage.src = asset.image;
  assistantImage.alt = asset.alt;
  assistantState.textContent = asset.label;
  assistantMessage.textContent = message;
}

function scoreProduct(product, query) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return 1;

  const searchableText = normalize(
    [
      product.name,
      product.category,
      product.description,
      ...(product.tags ?? []),
    ].join(" ")
  );

  const words = normalizedQuery.split(/\s+/).filter(Boolean);
  return words.reduce((score, word) => {
    if (normalize(product.name).includes(word)) return score + 5;
    if ((product.tags ?? []).some((tag) => normalize(tag).includes(word))) return score + 4;
    if (product.category && normalize(product.category).includes(word)) return score + 3;
    if (searchableText.includes(word)) return score + 1;
    return score;
  }, 0);
}

function getFilteredProducts(query = activeQuery, category = activeCategory) {
  const byCategory =
    category === "All" ? products : products.filter((product) => product.category === category);

  if (!query.trim()) return byCategory;

  return byCategory
    .map((product) => ({ product, score: scoreProduct(product, query) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.product);
}

function getCartSummary() {
  const total = cart.reduce((sum, product) => sum + product.price, 0);
  const categories = [...new Set(cart.map((product) => product.category))];

  return {
    count: cart.length,
    total,
    categories,
    items: cart.map((product) => ({
      id: product.id,
      name: product.name,
      category: product.category,
      price: product.price,
      description: product.description,
      tags: product.tags,
    })),
  };
}

function updateCartUi() {
  const summary = getCartSummary();
  cartCount.textContent = String(summary.count);
  cartTotal.textContent = money.format(summary.total);
}

function renderProducts(items) {
  productGrid.innerHTML = "";

  if (!items.length) {
    productGrid.innerHTML = '<div class="empty-state">No products matched that search.</div>';
    resultSummary.textContent = "No results";
    return;
  }

  const fragment = document.createDocumentFragment();

  items.forEach((product) => {
    const card = document.createElement("article");
    card.className = "product-card";
    card.innerHTML = `
      <img src="${product.image}" alt="${product.name}" loading="lazy" />
      <div class="product-info">
        <div>
          ${product.category ? `<p class="eyebrow">${product.category}</p>` : ""}
          <h3>${product.name}</h3>
        </div>
        <div class="product-meta">
          <span class="price">${money.format(product.price)}</span>
          <span class="stock">${product.stock} in stock</span>
        </div>
        <button class="add-button" type="button" data-product-id="${product.id}">
          Add to cart
        </button>
      </div>
    `;
    fragment.appendChild(card);
  });

  productGrid.appendChild(fragment);
  resultSummary.textContent = `${items.length} product${items.length === 1 ? "" : "s"}`;
}

function renderCategories() {
  const categories = [
    "All",
    ...new Set(products.map((product) => product.category).filter(Boolean)),
  ];
  categoryTabs.innerHTML = "";

  categories.forEach((category) => {
    const button = document.createElement("button");
    button.className = "tab-button";
    button.type = "button";
    button.textContent = category;
    button.setAttribute("aria-selected", String(category === activeCategory));
    button.addEventListener("click", () => {
      activeCategory = category;
      renderCategories();
      renderProducts(getFilteredProducts());
    });
    categoryTabs.appendChild(button);
  });
}

async function getAiProductSearch(query) {
  const response = await fetch("/api/product-search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      history: conversationHistory.slice(-8),
    }),
  });

  if (!response.ok) throw new Error("AI search failed");
  return response.json();
}

async function getAiShoppingReply(message) {
  const response = await fetch("/api/shop-chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message,
      cart: getCartSummary().items,
      history: conversationHistory.slice(-8),
    }),
  });

  if (!response.ok) throw new Error("AI chat failed");
  return response.json();
}

function orderProductsByIds(items, ids = []) {
  const idOrder = new Map(ids.map((id, index) => [id, index]));
  const matched = items
    .filter((product) => idOrder.has(product.id))
    .sort((a, b) => idOrder.get(a.id) - idOrder.get(b.id));
  const rest = items.filter((product) => !idOrder.has(product.id));
  return [...matched, ...rest];
}

async function runSearch(query, source = "manual") {
  activeQuery = query.trim();
  searchInput.value = activeQuery;
  setAssistant("thinking", activeQuery ? `Thinking about: ${activeQuery}` : "Showing the full catalog.");

  const results = getFilteredProducts();
  renderProducts(results);
  const idealProduct = results[0];

  let answer = activeQuery
    ? idealProduct
      ? `I found a good option: ${idealProduct.name}.`
      : `I could not find products for "${activeQuery}".`
    : "Here are all products.";

  let finalResults = results;

  if (activeQuery) {
    try {
      const aiAnswer = await getAiProductSearch(activeQuery);
      answer = aiAnswer.message || answer;
      finalResults = orderProductsByIds(results.length ? results : products, aiAnswer.productIds || []);
      renderProducts(finalResults);
      conversationHistory.push({ role: "user", content: activeQuery });
      conversationHistory.push({ role: "assistant", content: answer });
      conversationHistory = conversationHistory.slice(-10);
    } catch (error) {
      answer = `${answer} I could not connect to the AI, so I used local search.`;
    }
  }

  window.setTimeout(() => {
    setAssistant(finalResults.length ? "speaking" : "idle", answer);
    if (activeQuery) speak(answer);
  }, 350);

  window.setTimeout(() => {
    setAssistant("idle", "Click the genie and tell me what you are shopping for.");
  }, 3600);

  return {
    query: activeQuery,
    count: finalResults.length,
    results: finalResults.slice(0, 5).map((product) => ({
      id: product.id,
      name: product.name,
      category: product.category,
      price: product.price,
      stock: product.stock,
      description: product.description,
    })),
    message: answer,
  };
}

function speakWithBrowser(text) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  speechSynthesis.speak(utterance);
}

async function speak(text) {
  try {
    const response = await fetch("/api/tts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) throw new Error("TTS failed");
    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    audio.addEventListener("ended", () => URL.revokeObjectURL(audioUrl), { once: true });
    await audio.play();
  } catch (error) {
    speakWithBrowser(text);
  }
}

function startVoiceDemo() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    setAssistant("idle", "Your browser does not support speech recognition. Use the ElevenLabs widget.");
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.addEventListener("start", () => {
    setAssistant("listening", "I am listening. What are you shopping for today?");
  });

  recognition.addEventListener("result", (event) => {
    const transcript = event.results[0][0].transcript;
    runSearch(transcript, "voice-demo");
  });

  recognition.addEventListener("error", () => {
    setAssistant("idle", "I could not hear clearly. Click the genie and try again.");
  });

  recognition.start();
}

function addChatMessage(role, text) {
  const bubble = document.createElement("div");
  bubble.className = `chat-bubble ${role}`;
  bubble.textContent = text;
  chatMessages.appendChild(bubble);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function answerCartQuestion(question = "") {
  const summary = getCartSummary();
  const normalizedQuestion = normalize(question);

  if (!summary.count) {
    return {
      message: "Your cart is empty. Add a product first and I can compare, summarize, or recommend from it.",
      cart: summary,
    };
  }

  const itemNames = summary.items.map((item) => item.name).join(", ");
  const cheapest = summary.items.reduce((best, item) => (item.price < best.price ? item : best));
  const priciest = summary.items.reduce((best, item) => (item.price > best.price ? item : best));

  let message = `Your cart has ${summary.count} item${summary.count === 1 ? "" : "s"}: ${itemNames}. Total: ${money.format(summary.total)}.`;

  if (normalizedQuestion.includes("cheap") || normalizedQuestion.includes("lowest")) {
    message = `The lowest-priced item in your cart is ${cheapest.name} at ${money.format(cheapest.price)}.`;
  } else if (normalizedQuestion.includes("expensive") || normalizedQuestion.includes("highest")) {
    message = `The highest-priced item in your cart is ${priciest.name} at ${money.format(priciest.price)}.`;
  } else if (normalizedQuestion.includes("work") || normalizedQuestion.includes("office")) {
    const workItems = summary.items.filter((item) =>
      normalize([item.category, item.description, ...(item.tags ?? [])].join(" ")).match(/office|desk|keyboard|lamp|cable|laptop/)
    );
    message = workItems.length
      ? `For work, I would focus on ${workItems.map((item) => item.name).join(", ")}. They fit office or desk use best.`
      : "I do not see a clearly work-focused product in your cart yet.";
  } else if (normalizedQuestion.includes("recommend") || normalizedQuestion.includes("best")) {
    const recommended = summary.items.find((item) => item.stock > 15) ?? summary.items[0];
    message = `My pick from your cart is ${recommended.name}: ${recommended.description}`;
  }

  return {
    message,
    cart: summary,
  };
}

function registerElevenLabsTools() {
  if (!elevenlabsWidget) return;

  elevenlabsWidget.addEventListener("elevenlabs-convai:call", (event) => {
    event.detail.config.clientTools = {
      searchProducts: ({ query, category }) => {
        if (category && [...new Set(products.map((product) => product.category).filter(Boolean))].includes(category)) {
          activeCategory = category;
          renderCategories();
        }

        return runSearch(query ?? "", "elevenlabs");
      },
      showAllProducts: () => runSearch("", "elevenlabs"),
      getCart: () => getCartSummary(),
      askCart: ({ question }) => answerCartQuestion(question ?? ""),
    };
  });
}

async function loadProducts() {
  try {
    const response = await fetch("products.json");
    products = await response.json();
    renderCategories();
    renderProducts(products);
    updateCartUi();
    setAssistant("idle", "Click the genie and tell me what you are shopping for.");
  } catch (error) {
    resultSummary.textContent = "Catalog load error";
    productGrid.innerHTML = '<div class="empty-state">products.json could not be loaded.</div>';
    setAssistant("speaking", "I could not load the catalog.");
  }
}

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  runSearch(searchInput.value);
});

clearButton.addEventListener("click", () => {
  activeCategory = "All";
  renderCategories();
  runSearch("");
});

voiceDemoButton.addEventListener("click", startVoiceDemo);
assistantOrb.addEventListener("click", startVoiceDemo);
assistantOrb.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  startVoiceDemo();
});

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const question = chatInput.value.trim();
  if (!question) return;

  addChatMessage("user", question);
  chatInput.value = "";
  setAssistant("thinking", "Thinking about your shopping needs.");

  let answer = answerCartQuestion(question).message;
  try {
    const aiAnswer = await getAiShoppingReply(question);
    answer = aiAnswer.message || answer;
    const recommendedProducts = orderProductsByIds(products, aiAnswer.productIds || []).slice(0, 12);
    if (recommendedProducts.length) renderProducts(recommendedProducts);
  } catch (error) {
    answer = `${answer} I could not reach the shopping assistant, so I used cart basics.`;
  }

  conversationHistory.push({ role: "user", content: question });
  conversationHistory.push({ role: "assistant", content: answer });
  conversationHistory = conversationHistory.slice(-10);

  window.setTimeout(() => {
    addChatMessage("ai", answer);
    setAssistant("speaking", answer);
    speak(answer);
  }, 300);
});

productGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-product-id]");
  if (!button) return;

  const product = products.find((item) => item.id === button.dataset.productId);
  if (!product) return;

  cart.push(product);
  updateCartUi();
  setAssistant("speaking", `${product.name} added to your cart.`);
  addChatMessage("ai", `${product.name} is now in your cart. Ask me about it whenever you want.`);
});

registerElevenLabsTools();
loadProducts();
