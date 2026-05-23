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
const assistantStage = document.querySelector("#assistant-stage");
const stageClose = document.querySelector("#stage-close");
const stageGenieImage = document.querySelector("#stage-genie-image");
const stageLabel = document.querySelector("#stage-label");
const stageMessage = document.querySelector("#stage-message");
const stageTranscript = document.querySelector("#stage-transcript");
const productDialog = document.querySelector("#product-dialog");
const dialogClose = document.querySelector("#dialog-close");
const productDetail = document.querySelector("#product-detail");

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
let currentRecommendation = null;
let checkoutState = "idle";
let currentAudio = null;
let lastSpokenText = "";

const whatsappNumber = "573108853158";

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
  stageGenieImage.src = asset.image;
  stageGenieImage.alt = asset.alt;
  stageLabel.textContent = asset.label;
  stageMessage.textContent = message;
}

function openAssistantStage(transcript = "") {
  assistantStage.classList.add("is-open");
  assistantStage.setAttribute("aria-hidden", "false");
  if (transcript) stageTranscript.textContent = transcript;
}

function closeAssistantStage() {
  assistantStage.classList.remove("is-open");
  assistantStage.setAttribute("aria-hidden", "true");
}

function remember(role, content) {
  conversationHistory.push({ role, content });
  conversationHistory = conversationHistory.slice(-10);
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
        <button class="detail-button" type="button" data-detail-id="${product.id}">
          View product
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

function findProduct(id) {
  return products.find((product) => product.id === id);
}

function highlightProduct(productId) {
  document
    .querySelectorAll(".product-card.is-recommended")
    .forEach((card) => card.classList.remove("is-recommended"));

  const button = document.querySelector(`[data-product-id="${productId}"]`);
  const card = button?.closest(".product-card");
  if (!card) return;

  card.classList.add("is-recommended");
  card.scrollIntoView({ behavior: "smooth", block: "center" });
}

function showProductDetail(product) {
  if (!product) return;

  productDetail.innerHTML = `
    <div class="product-detail">
      <img src="${product.image}" alt="${product.name}" />
      <div>
        <p class="eyebrow">Recommended product</p>
        <h2>${product.name}</h2>
        <p>${product.description || product.name}</p>
        <p class="price">${money.format(product.price)}</p>
        <div class="product-detail-actions">
          <button class="primary-button" type="button" data-buy-now="${product.id}">Buy this</button>
          <button class="secondary-button" type="button" data-add-from-detail="${product.id}">Add to cart</button>
        </div>
      </div>
    </div>
  `;

  if (!productDialog.open) productDialog.showModal();
}

function isYes(value) {
  return /\b(yes|yeah|yep|sure|ok|okay|buy|purchase|si|sí|claro|dale|comprar)\b/i.test(value);
}

function isNo(value) {
  return /\b(no|not now|cancel|nope|later|despues|después)\b/i.test(value);
}

function buildWhatsappUrl(product, address) {
  const message = `El cliente quiere comprar ${product.name} por ${money.format(product.price)} y debe ser enviado a ${address}.`;
  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
}

function addToCart(product) {
  cart.push(product);
  updateCartUi();
  addChatMessage("ai", `${product.name} is now in your cart.`);
}

async function speakAndShow(text) {
  setAssistant("speaking", text);
  stageTranscript.textContent = text;
  openAssistantStage(text);
  await speak(text);
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
      finalResults = aiAnswer.productIds?.length
        ? orderProductsByIds(products, aiAnswer.productIds).slice(0, 12)
        : results;
      renderProducts(finalResults);
      remember("user", activeQuery);
      remember("assistant", answer);

      const recommendedId = aiAnswer.productIds?.[0] || finalResults[0]?.id;
      currentRecommendation = recommendedId ? findProduct(recommendedId) : finalResults[0] || null;
      if (currentRecommendation) {
        checkoutState = "confirming";
        highlightProduct(currentRecommendation.id);
        showProductDetail(currentRecommendation);
        answer = `${answer} Would you like to buy this product?`;
      }
    } catch (error) {
      answer = `${answer} I could not connect to the AI, so I used local search.`;
    }
  }

  window.setTimeout(() => {
    setAssistant(finalResults.length ? "speaking" : "idle", answer);
    if (activeQuery) addChatMessage("ai", answer);
    if (activeQuery) speakAndShow(answer);
  }, 350);

  window.setTimeout(() => {
    if (!assistantStage.classList.contains("is-open")) {
      setAssistant("idle", "Click the genie and tell me what you are shopping for.");
    }
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
  lastSpokenText = text;
  try {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }
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
    currentAudio = audio;
    audio.addEventListener("ended", () => URL.revokeObjectURL(audioUrl), { once: true });
    await audio.play();
  } catch (error) {
    speakWithBrowser(text);
  }
}

function startVoiceDemo() {
  openAssistantStage("Listening...");
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
    stageTranscript.textContent = "Listening...";
  });

  recognition.addEventListener("result", (event) => {
    const transcript = event.results[0][0].transcript;
    stageTranscript.textContent = transcript;
    handleCommerceConversation(transcript, "voice-demo");
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

async function handleCommerceConversation(message, source = "manual") {
  const cleanMessage = message.trim();
  if (!cleanMessage) return;

  openAssistantStage(cleanMessage);
  if (source !== "chat") addChatMessage("user", cleanMessage);

  if (checkoutState === "awaiting-address" && currentRecommendation) {
    const address = cleanMessage;
    const answer = `Perfect. I am opening WhatsApp with the order for ${currentRecommendation.name}.`;
    remember("user", address);
    remember("assistant", answer);
    addChatMessage("ai", answer);
    const whatsappUrl = buildWhatsappUrl(currentRecommendation, address);
    window.open(whatsappUrl, "_blank", "noopener");
    await speakAndShow(answer);
    checkoutState = "idle";
    return;
  }

  if (checkoutState === "confirming" && currentRecommendation) {
    if (isYes(cleanMessage)) {
      const answer = `Great. What address should we ship ${currentRecommendation.name} to?`;
      checkoutState = "awaiting-address";
      remember("user", cleanMessage);
      remember("assistant", answer);
      addChatMessage("ai", answer);
      await speakAndShow(answer);
      return;
    }

    if (isNo(cleanMessage)) {
      const answer = "No problem. Tell me what you would like to compare or change.";
      checkoutState = "idle";
      remember("user", cleanMessage);
      remember("assistant", answer);
      addChatMessage("ai", answer);
      await speakAndShow(answer);
      return;
    }
  }

  await runSearch(cleanMessage, source);
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
  handleCommerceConversation(searchInput.value);
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

  if (checkoutState !== "idle") {
    await handleCommerceConversation(question, "chat");
    return;
  }

  setAssistant("thinking", "Thinking about your shopping needs.");
  openAssistantStage(question);

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
    speakAndShow(answer);
  }, 300);
});

productGrid.addEventListener("click", (event) => {
  const detailButton = event.target.closest("[data-detail-id]");
  if (detailButton) {
    const product = findProduct(detailButton.dataset.detailId);
    if (product) {
      currentRecommendation = product;
      highlightProduct(product.id);
      showProductDetail(product);
    }
    return;
  }

  const button = event.target.closest("[data-product-id]");
  if (!button) return;

  const product = products.find((item) => item.id === button.dataset.productId);
  if (!product) return;

  addToCart(product);
  setAssistant("speaking", `${product.name} added to your cart.`);
});

productDetail.addEventListener("click", async (event) => {
  const buyButton = event.target.closest("[data-buy-now]");
  const addButton = event.target.closest("[data-add-from-detail]");

  if (addButton) {
    const product = findProduct(addButton.dataset.addFromDetail);
    if (!product) return;
    addToCart(product);
    return;
  }

  if (buyButton) {
    const product = findProduct(buyButton.dataset.buyNow);
    if (!product) return;
    currentRecommendation = product;
    checkoutState = "awaiting-address";
    const answer = `Great choice. What address should we ship ${product.name} to?`;
    productDialog.close();
    remember("assistant", answer);
    await speakAndShow(answer);
  }
});

dialogClose.addEventListener("click", () => productDialog.close());
stageClose.addEventListener("click", closeAssistantStage);

registerElevenLabsTools();
loadProducts();
