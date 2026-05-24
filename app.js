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
const assistantVoiceButton = document.querySelector("#assistant-voice-button");
const aiOrb = document.querySelector("#ai-orb");
const assistantState = document.querySelector("#assistant-state");
const assistantMessage = document.querySelector("#assistant-message");
const assistantStatus = document.querySelector("#assistant-status");
const elevenlabsWidget = document.querySelector("#elevenlabs-widget");
const assistantStage = document.querySelector("#assistant-stage");
const stageClose = document.querySelector("#stage-close");
const stageAiOrb = document.querySelector("#stage-ai-orb");
const stageLabel = document.querySelector("#stage-label");
const stageMessage = document.querySelector("#stage-message");
const stageTranscript = document.querySelector("#stage-transcript");
const productDialog = document.querySelector("#product-dialog");
const dialogClose = document.querySelector("#dialog-close");
const productDetail = document.querySelector("#product-detail");
const checkoutDialog = document.querySelector("#checkout-dialog");
const checkoutClose = document.querySelector("#checkout-close");
const checkoutForm = document.querySelector("#checkout-form");
const checkoutSummary = document.querySelector("#checkout-summary");
const checkoutNameInput = document.querySelector("#checkout-name");
const checkoutAddressInput = document.querySelector("#checkout-address");
const checkoutCityInput = document.querySelector("#checkout-city");
const defaultChatPlaceholder = chatInput?.getAttribute("placeholder") || "Ask about your cart";

const assistantStates = {
  idle: {
    label: "Ready",
    button: "Talk to AI",
    message: "Search, buy, or talk to AI.",
  },
  listening: {
    label: "Listening...",
    button: "Listening...",
    message: "Listening...",
  },
  thinking: {
    label: "Thinking...",
    button: "Thinking...",
    message: "Thinking...",
  },
  speaking: {
    label: "Speaking...",
    button: "Speaking...",
    message: "Speaking...",
  },
  error: {
    label: "Try again",
    button: "Try again",
    message: "I couldn't hear you. Try again.",
  },
};

const checkoutAwaitingLabels = {
  name: "Answer by voice, or type your name in the chat.",
  address: "Answer by voice, or type your delivery address.",
  city: "Answer by voice, or type your city.",
  confirmation: "Answer by voice, or type yes to confirm.",
};

const writtenCheckoutLabels = {
  name: "Type your name in the chat.",
  address: "Type your delivery address in the chat.",
  city: "Type your city in the chat.",
  confirmation: "Type yes to confirm, or no to change.",
};

let products = [];
let activeCategory = "All";
let activeQuery = "";
let cart = [];
let conversationHistory = [];
let currentRecommendation = null;
let checkoutState = createEmptyCheckout();
let currentAudio = null;
let currentAudioUrl = null;
let lastSpokenText = "";
let assistantStateTimeout = null;
let currentAssistantState = "idle";
let activeMediaRecorder = null;
let activeMediaStream = null;
let activeRecordingTimer = null;

const whatsappNumber = "573108853158";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

function logClient(step, data = null) {
  if (data === null || typeof data === "undefined") {
    console.log(`[client] ${step}`);
    return;
  }
  console.log(`[client] ${step}`, data);
}

function logClientError(step, error) {
  console.error(`[client] ${step}`, error);
}

function normalize(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function createEmptyCheckout() {
  return {
    selectedProduct: null,
    selectedProducts: [],
    customerName: "",
    address: "",
    city: "",
    awaiting: null,
    readyToConfirm: false,
    voiceEnabled: false,
  };
}

function detectLanguage(value = "") {
  const normalizedValue = normalize(value);
  if (/\b(hola|claro|si|quiero|comprar|direccion|ciudad|nombre|confirmar|correcto|envialo|ayuda|celular|telefono|gracias|carrito|pedido)\b/.test(normalizedValue)) {
    return "es";
  }
  return "en";
}

function phrase(key, language = "en", details = {}) {
  const naturalCopy = {
    askName: {
      en: "Sure, I can help with that. Before I send this to WhatsApp, can you tell me your name?",
      es: "Claro, te ayudo con eso. Antes de enviarlo a WhatsApp, dime tu nombre.",
    },
    askAddress: {
      en: "Great. What delivery address should we use?",
      es: "Genial. Cual es la direccion de entrega?",
    },
    askCity: {
      en: "Perfect. What city should we send it to?",
      es: "Perfecto. A que ciudad debemos enviarlo?",
    },
    decline: {
      en: "No problem. Tell me what you would like to compare or change.",
      es: "Sin problema. Dime que quieres comparar o cambiar.",
    },
    confirm: {
      en: `Perfect. Please confirm if everything is correct and I will open WhatsApp for you.${details.summary ? `\n\n${details.summary}` : ""}`,
      es: `Perfecto. Confirmame si todo esta correcto y abro WhatsApp.${details.summary ? `\n\n${details.summary}` : ""}`,
    },
    openedWhatsapp: {
      en: "Done. I am opening WhatsApp with your order now.",
      es: "Listo. Estoy abriendo WhatsApp con tu pedido.",
    },
    needConfirmation: {
      en: "Please confirm if everything is correct and I will open WhatsApp.",
      es: "Confirmame si todo esta correcto y abro WhatsApp.",
    },
    selectedProduct: {
      en: "Would you like to buy it?",
      es: "Quieres comprarla?",
    },
    cartCheckout: {
      en: "Sure, I can help check out the products in your cart. Before I send this to WhatsApp, can you tell me your name?",
      es: "Claro, te ayudo a comprar los productos del carrito. Antes de enviarlo a WhatsApp, dime tu nombre.",
    },
  };
  return naturalCopy[key]?.[language] || naturalCopy[key]?.en || "";
}

function clearAssistantTimeout() {
  if (!assistantStateTimeout) return;
  window.clearTimeout(assistantStateTimeout);
  assistantStateTimeout = null;
}

function setAssistantState(state = "idle", label = "") {
  const nextState = assistantStates[state] ? state : "idle";
  const config = assistantStates[nextState];
  const message = label || config.message;

  logClient("assistant state", { state: nextState, message });
  clearAssistantTimeout();
  currentAssistantState = nextState;

  [assistantOrb, aiOrb, stageAiOrb].forEach((element) => {
    if (!element) return;
    element.classList.remove("idle", "listening", "thinking", "speaking", "error");
    element.classList.add(nextState);
  });

  assistantState.textContent = config.label;
  assistantMessage.textContent = message;
  assistantStatus.textContent = config.label;
  stageLabel.textContent = config.label;
  stageMessage.textContent = message;
  if (assistantVoiceButton) {
    assistantVoiceButton.setAttribute("aria-label", config.button);
    assistantVoiceButton.dataset.label = config.button;
  }
  if (voiceDemoButton) voiceDemoButton.textContent = config.button;

  if (nextState === "thinking") {
    assistantStateTimeout = window.setTimeout(() => {
      const timeoutMessage = "This is taking longer than expected. Please try again.";
      console.error("[error] assistant thinking timeout");
      setAssistantState("error", timeoutMessage);
      stageTranscript.textContent = timeoutMessage;
      window.setTimeout(() => setAssistantState("idle"), 2600);
    }, 12000);
  }
}

function setAssistant(mode, message) {
  setAssistantState(mode, message);
}

function getCheckoutAwaitingMessage() {
  return checkoutAwaitingLabels[checkoutState.awaiting] || "Answer by voice, or type in the chat.";
}

function getWrittenCheckoutMessage() {
  return writtenCheckoutLabels[checkoutState.awaiting] || "Type your answer in the chat.";
}

function isVoiceSource(source = "") {
  return source === "voice-demo" || source === "elevenlabs";
}

function resetChatInputPlaceholder() {
  if (!chatInput) return;
  chatInput.placeholder = defaultChatPlaceholder;
}

function focusCheckoutInput() {
  if (!chatInput) return;
  chatInput.placeholder = getWrittenCheckoutMessage();
  chatInput.focus({ preventScroll: true });
}

async function speakAndWaitForCheckoutAnswer(answer, awaiting, language = "en") {
  checkoutState.awaiting = awaiting;
  const afterMessage = getCheckoutAwaitingMessage();
  await speakAndShow(answer, {
    afterMode: "idle",
    afterMessage,
  });
}

async function promptCheckoutAnswer(answer, awaiting, language = "en") {
  checkoutState.awaiting = awaiting;

  if (checkoutState.voiceEnabled) {
    await speakAndWaitForCheckoutAnswer(answer, awaiting, language);
    return;
  }

  const afterMessage = getWrittenCheckoutMessage();
  stageTranscript.textContent = answer;
  setAssistantState("idle", afterMessage);
  focusCheckoutInput();
}

async function respondCheckoutMessage(answer, language = "en") {
  if (checkoutState.voiceEnabled) {
    await speakAndShow(answer);
    return;
  }

  stageTranscript.textContent = answer;
  setAssistantState("idle", checkoutState.awaiting ? getWrittenCheckoutMessage() : "Checkout updated.");
  focusCheckoutInput();
}

function showAssistantText(text, label = "Ready") {
  logClient("assistant text only", { chars: text.length, label });
  stageTranscript.textContent = text;
  setAssistantState("idle", label);
}

function withResponseTimeout(promise, label = "AI request") {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error(`${label} timed out after 12 seconds`)), 12000);
    }),
  ]);
}

function openAssistantStage(transcript = "") {
  logClient("assistant stage open", { transcript });
  assistantStage.classList.add("is-open");
  assistantStage.setAttribute("aria-hidden", "false");
  if (transcript) stageTranscript.textContent = transcript;
}

function closeAssistantStage() {
  logClient("assistant stage close");
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
        <button class="buy-button" type="button" data-buy-now="${product.id}">
          Buy Now
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
  console.log("[ai] request started", { endpoint: "product-search", query });
  logClient("api product-search request", {
    query,
    history: conversationHistory.slice(-8).length,
  });
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

  logClient("api product-search response", {
    status: response.status,
    ok: response.ok,
    contentType: response.headers.get("content-type"),
  });
  if (!response.ok) {
    const errorText = await response.text();
    logClient("api product-search error body", errorText);
    throw new Error(`AI search failed with ${response.status}`);
  }
  const data = await response.json();
  console.log("[ai] response received", { endpoint: "product-search", data });
  logClient("api product-search data", data);
  return data;
}

async function getAiShoppingReply(message) {
  console.log("[ai] request started", { endpoint: "shop-chat", message });
  logClient("api shop-chat request", {
    message,
    cartItems: getCartSummary().items.length,
    history: conversationHistory.slice(-8).length,
  });
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

  logClient("api shop-chat response", {
    status: response.status,
    ok: response.ok,
    contentType: response.headers.get("content-type"),
  });
  if (!response.ok) {
    const errorText = await response.text();
    logClient("api shop-chat error body", errorText);
    throw new Error(`AI chat failed with ${response.status}`);
  }
  const data = await response.json();
  console.log("[ai] response received", { endpoint: "shop-chat", data });
  logClient("api shop-chat data", data);
  return data;
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
  logClient("highlight product", { productId });
  document
    .querySelectorAll(".product-card.is-recommended")
    .forEach((card) => card.classList.remove("is-recommended"));

  const button = document.querySelector(`[data-product-id="${productId}"]`);
  const card = button?.closest(".product-card");
  if (!card) {
    logClient("highlight product card not found", { productId });
    return;
  }

  card.classList.add("is-recommended");
  card.scrollIntoView({ behavior: "smooth", block: "center" });
}

function showProductDetail(product) {
  if (!product) return;
  logClient("show product detail", {
    id: product.id,
    name: product.name,
    price: product.price,
  });

  productDetail.innerHTML = `
    <div class="product-detail">
      <img src="${product.image}" alt="${product.name}" />
      <div>
        <p class="eyebrow">Recommended product</p>
        <h2>${product.name}</h2>
        <p>${product.description || product.name}</p>
        <p class="price">${money.format(product.price)}</p>
        <div class="product-detail-actions">
          <button class="primary-button" type="button" data-buy-now="${product.id}">Buy Now</button>
          <button class="secondary-button" type="button" data-add-from-detail="${product.id}">Add to cart</button>
        </div>
      </div>
    </div>
  `;

  if (!productDialog.open) productDialog.showModal();
}

function isYes(value) {
  const normalizedValue = normalize(value);
  if (/\b(yes|yeah|yep|sure|ok|okay|confirm|confirmed|correct|buy|purchase|si|claro|dale|comprar|confirmar|confirmado|correcto|esta bien)\b/i.test(normalizedValue)) {
    return true;
  }
  return /\b(yes|yeah|yep|sure|ok|okay|buy|purchase|si|sí|claro|dale|comprar)\b/i.test(value);
}

function isNo(value) {
  const normalizedValue = normalize(value);
  if (/\b(no|not now|cancel|nope|later|despues|cancela|cancelar|luego|ahora no)\b/i.test(normalizedValue)) {
    return true;
  }
  return /\b(no|not now|cancel|nope|later|despues|después)\b/i.test(value);
}

function buildWhatsappUrl(product, address) {
  const productsToBuy = product ? [product] : getCheckoutProducts();
  const details = {
    ...checkoutState,
    address: address || checkoutState.address,
    customerName: checkoutState.customerName || "-",
    city: checkoutState.city || "-",
  };
  const exactMessage = buildWhatsappMessage(productsToBuy, details);
  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(exactMessage)}`;
}

function wantsCheckout(value) {
  return /\b(buy|purchase|checkout|order|comprar|pagar|pedido|ordenar|whatsapp|carrito)\b/i.test(value);
}

function isCheckoutConfirmation(value) {
  return isYes(value) || /\b(confirm|confirmed|correct|confirmar|confirmado|correcto|esta bien|está bien)\b/i.test(value);
}

function getCheckoutProducts() {
  if (checkoutState.selectedProducts.length) return checkoutState.selectedProducts;
  if (checkoutState.selectedProduct) return [checkoutState.selectedProduct];
  if (currentRecommendation) return [currentRecommendation];
  return [];
}

function setCheckoutProducts(items) {
  const uniqueProducts = [...new Map(items.filter(Boolean).map((product) => [product.id, product])).values()];
  checkoutState.selectedProducts = uniqueProducts;
  checkoutState.selectedProduct = uniqueProducts[0] || null;
  currentRecommendation = checkoutState.selectedProduct;
  checkoutState.readyToConfirm = false;
}

function resetCheckout() {
  checkoutState = createEmptyCheckout();
  resetChatInputPlaceholder();
}

function isCheckoutActive() {
  return Boolean(
    checkoutState.awaiting ||
      checkoutState.readyToConfirm ||
      checkoutState.selectedProduct ||
      checkoutState.selectedProducts.length
  );
}

function summarizeCheckout(productsToBuy = getCheckoutProducts()) {
  const productLines =
    productsToBuy.length === 1
      ? `Product: ${productsToBuy[0].name}\nPrice: ${money.format(productsToBuy[0].price)}`
      : `Products:\n${productsToBuy
          .map((product, index) => `${index + 1}. ${product.name} - ${money.format(product.price)}`)
          .join("\n")}`;

  return `${productLines}\nName: ${checkoutState.customerName || "-"}\nAddress: ${checkoutState.address || "-"}\nCity: ${checkoutState.city || "-"}`;
}

function getCheckoutDetailsSnapshot() {
  return {
    customerName: checkoutState.customerName || "",
    address: checkoutState.address || "",
    city: checkoutState.city || "",
  };
}

function applyCheckoutDetails(details = {}) {
  checkoutState.customerName = String(details.customerName || "").trim();
  checkoutState.address = String(details.address || "").trim();
  checkoutState.city = String(details.city || "").trim();
}

function hasCompleteCheckoutDetails(details = checkoutState) {
  return Boolean(
    String(details.customerName || "").trim() &&
      String(details.address || "").trim() &&
      String(details.city || "").trim()
  );
}

function getNextMissingCheckoutField(details = checkoutState) {
  if (!String(details.customerName || "").trim()) return "name";
  if (!String(details.address || "").trim()) return "address";
  if (!String(details.city || "").trim()) return "city";
  return null;
}

function buildWhatsappMessage(productsToBuy, details) {
  const productLines =
    productsToBuy.length === 1
      ? `Producto: ${productsToBuy[0].name}\nPrecio: ${money.format(productsToBuy[0].price)}`
      : `Productos:\n${productsToBuy
          .map((product, index) => `${index + 1}. ${product.name} - ${money.format(product.price)}`)
          .join("\n")}`;

  return `Hola, quiero comprar:\n${productLines}\nDirección: ${details.address}\nCiudad: ${details.city}\nCliente: ${details.customerName}`;
}

function buildCheckoutWhatsappUrl(productsToBuy = getCheckoutProducts()) {
  logClient("build checkout whatsapp url", {
    productIds: productsToBuy.map((product) => product.id),
    customerName: checkoutState.customerName,
    address: checkoutState.address,
    city: checkoutState.city,
  });
  const message = buildWhatsappMessage(productsToBuy, checkoutState);
  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
}

function openCheckoutWhatsapp(productsToBuy = getCheckoutProducts(), language = "en") {
  const checkoutProducts = productsToBuy.filter(Boolean);
  if (!checkoutProducts.length) {
    const message = "Choose a product first, then I can open WhatsApp checkout.";
    addChatMessage("ai", message);
    showAssistantText(message, "Ready");
    return;
  }

  const whatsappUrl = buildCheckoutWhatsappUrl(checkoutProducts);
  console.log("[checkout] whatsapp opened", {
    productIds: checkoutProducts.map((product) => product.id),
  });
  logClient("checkout whatsapp opened", {
    productIds: checkoutProducts.map((product) => product.id),
  });
  window.open(whatsappUrl, "_blank", "noopener");

  const shouldSpeak = checkoutState.voiceEnabled;
  const answer = phrase("openedWhatsapp", language);
  remember("assistant", answer);
  addChatMessage("ai", answer);
  if (shouldSpeak) {
    speakAndShow(answer).catch((error) => {
      console.error("[error] checkout voice response failed", error);
      showAssistantText(answer, "Ready");
    }).finally(resetCheckout);
  } else {
    showAssistantText(answer, "Ready");
    resetCheckout();
  }
}

function openCheckoutForm(productsToBuy = getCheckoutProducts()) {
  checkoutState.awaiting = getNextMissingCheckoutField();
  checkoutState.readyToConfirm = false;
  checkoutState.voiceEnabled = false;
  if (chatInput && checkoutState.awaiting) chatInput.placeholder = getWrittenCheckoutMessage();

  if (!checkoutDialog || !checkoutForm) {
    const answer = "Type your name, delivery address, and city in the chat so I can open WhatsApp.";
    addChatMessage("ai", answer);
    showAssistantText(answer, "Ready");
    focusCheckoutInput();
    return;
  }

  checkoutSummary.textContent = summarizeCheckout(productsToBuy);
  checkoutNameInput.value = checkoutState.customerName || "";
  checkoutAddressInput.value = checkoutState.address || "";
  checkoutCityInput.value = checkoutState.city || "";
  if (!checkoutDialog.open) checkoutDialog.showModal();

  const firstEmptyInput = [checkoutNameInput, checkoutAddressInput, checkoutCityInput].find((input) => !input.value.trim());
  window.setTimeout(() => (firstEmptyInput || checkoutNameInput).focus(), 0);
  showAssistantText("Complete the checkout form and I will open WhatsApp.", "Ready");
}

function startBuyNowCheckout(product, language = "en") {
  if (!product) return;
  console.log("[checkout] buy now clicked", { productId: product.id });
  logClient("checkout buy now clicked", {
    id: product.id,
    name: product.name,
    price: product.price,
  });

  const existingDetails = getCheckoutDetailsSnapshot();
  resetCheckout();
  applyCheckoutDetails(existingDetails);
  setCheckoutProducts([product]);
  checkoutState.voiceEnabled = false;
  checkoutState.awaiting = null;
  checkoutState.readyToConfirm = false;
  currentRecommendation = product;

  if (hasCompleteCheckoutDetails()) {
    openCheckoutWhatsapp([product], language);
    return;
  }

  openCheckoutForm([product]);
}

function addToCart(product) {
  logClient("add to cart", {
    id: product.id,
    name: product.name,
    price: product.price,
  });
  cart.push(product);
  updateCartUi();
  addChatMessage("ai", `${product.name} is now in your cart.`);
}

function getSpeechText(text) {
  const compact = String(text)
    .replace(/\s+/g, " ")
    .replace(/\n+/g, " ")
    .trim();
  const sentences = compact.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [compact];
  return sentences.slice(0, 3).join(" ").slice(0, 320).trim();
}

async function speakAndShow(text, options = {}) {
  const spokenText = getSpeechText(options.spokenText || text);
  logClient("speak and show", { chars: spokenText.length, text, spokenText });
  stageTranscript.textContent = text;
  openAssistantStage(text);
  setAssistantState("speaking", spokenText);
  await speak(spokenText);

  if (options.afterMode) {
    setAssistant(options.afterMode, options.afterMessage || assistantStates.idle.message);
  } else {
    setAssistant("idle", "Ready. Press Talk to AI if you want voice help again.");
  }
}

async function runSearch(query, source = "manual") {
  logClient("run search start", { query, source });
  activeQuery = query.trim();
  const language = detectLanguage(activeQuery);
  resetCheckout();
  checkoutState.voiceEnabled = isVoiceSource(source);
  currentRecommendation = null;
  searchInput.value = activeQuery;
  setAssistant("thinking", activeQuery ? `Thinking about: ${activeQuery}` : "Showing the full catalog.");

  const results = getFilteredProducts();
  logClient("local search results", {
    count: results.length,
    firstIds: results.slice(0, 5).map((product) => product.id),
  });
  renderProducts(results);
  const idealProduct = results[0];

  let answer = activeQuery
    ? idealProduct
      ? language === "es"
        ? `Perfecto, encontré esta opción para ti: ${idealProduct.name}.`
        : `Perfect, I found this option for you: ${idealProduct.name}.`
      : language === "es"
        ? `No encontré productos para "${activeQuery}".`
        : `I could not find products for "${activeQuery}".`
    : language === "es"
      ? "Aquí tienes todos los productos."
      : "Here are all products.";

  let finalResults = results;

  if (activeQuery) {
    try {
      const aiAnswer = await withResponseTimeout(getAiProductSearch(activeQuery), "Product search");
      answer = aiAnswer.message || answer;
      finalResults = aiAnswer.productIds?.length
        ? orderProductsByIds(products, aiAnswer.productIds).slice(0, 12)
        : results;
      logClient("ai search applied", {
        answer,
        finalCount: finalResults.length,
        productIds: aiAnswer.productIds || [],
      });
      renderProducts(finalResults);
      remember("user", activeQuery);
      remember("assistant", answer);

      const aiProductIds = Array.isArray(aiAnswer.productIds) ? aiAnswer.productIds : [];
      const canRecommendFromIntent = !["clarify", "greeting", "cart_help"].includes(aiAnswer.intent);
      const recommendedId = aiProductIds[0] || (canRecommendFromIntent ? finalResults[0]?.id : null);
      currentRecommendation = recommendedId ? findProduct(recommendedId) : finalResults[0] || null;
      if (!recommendedId) currentRecommendation = null;
      logClient("current recommendation", currentRecommendation
        ? { id: currentRecommendation.id, name: currentRecommendation.name }
        : null);
      if (currentRecommendation) {
        setCheckoutProducts([currentRecommendation]);
        checkoutState.awaiting = null;
        checkoutState.readyToConfirm = false;
        highlightProduct(currentRecommendation.id);
        showProductDetail(currentRecommendation);
        answer = `${answer} ${phrase("selectedProduct", language)}`;
      }
    } catch (error) {
      console.error("[error] ai product search failed", error);
      setAssistantState("error", "This is taking longer than expected. Please try again.");
      logClientError("run search ai failed", error);
      answer = `${answer} I could not connect to the AI, so I used local search.`;
    }
  }

  if (activeQuery) {
    addChatMessage("ai", answer);
    if (isVoiceSource(source)) {
      speakAndShow(answer).catch((error) => {
        console.error("[error] voice response failed", error);
        setAssistantState("idle");
      });
    } else {
      showAssistantText(answer, "Product search ready.");
    }
  } else {
    setAssistantState("idle");
  }

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
  logClient("browser speech fallback", {
    available: "speechSynthesis" in window,
    chars: text.length,
  });
  if (!("speechSynthesis" in window)) return Promise.resolve();

  return new Promise((resolve) => {
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = detectLanguage(text) === "es" ? "es-CO" : "en-US";
    utterance.onend = resolve;
    utterance.onerror = resolve;
    speechSynthesis.speak(utterance);
  });
}

async function speak(text) {
  lastSpokenText = text;
  console.log("[tts] request started", { chars: text.length });
  logClient("tts start", { chars: text.length, text });
  try {
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    if (currentAudio) {
      console.log("[tts] stopping previous audio");
      logClient("tts stopping current audio");
      currentAudio.pause();
      currentAudio = null;
    }
    if (currentAudioUrl) {
      URL.revokeObjectURL(currentAudioUrl);
      currentAudioUrl = null;
    }
    const response = await fetch("/api/tts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });

    logClient("tts response", {
      status: response.status,
      ok: response.ok,
      contentType: response.headers.get("content-type"),
    });
    if (!response.ok) {
      const errorText = await response.text();
      logClient("tts error body", errorText);
      throw new Error(`TTS failed with ${response.status}`);
    }
    const audioBlob = await response.blob();
    console.log("[tts] audio received", { size: audioBlob.size, type: audioBlob.type });
    logClient("tts blob", {
      size: audioBlob.size,
      type: audioBlob.type,
    });
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    currentAudio = audio;
    currentAudioUrl = audioUrl;

    await new Promise((resolve, reject) => {
      audio.addEventListener(
        "ended",
        () => {
          console.log("[tts] playback ended");
          logClient("tts audio ended");
          URL.revokeObjectURL(audioUrl);
          currentAudioUrl = null;
          currentAudio = null;
          resolve();
        },
        { once: true }
      );
      audio.addEventListener(
        "error",
        () => {
          logClientError("tts audio element error", audio.error);
          URL.revokeObjectURL(audioUrl);
          currentAudioUrl = null;
          currentAudio = null;
          reject(audio.error || new Error("Audio playback failed"));
        },
        { once: true }
      );
      audio.play().then(() => {
        console.log("[tts] playback started");
        logClient("tts audio playing");
      }).catch(reject);
    });
  } catch (error) {
    console.error("[error] tts failed", error);
    if (currentAudioUrl) {
      URL.revokeObjectURL(currentAudioUrl);
      currentAudioUrl = null;
    }
    currentAudio = null;
    logClientError("tts failed, using browser fallback", error);
    await speakWithBrowser(text);
  }
}

async function startVoiceDemo() {
  console.log("[voice] button clicked");
  logClient("voice start requested");
  console.log("[voice] listening requested");
  openAssistantStage("Listening...");
  setAssistantState("listening", "Starting microphone...");
  startRecordedVoiceInput();
}

function getSupportedAudioMimeType() {
  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
    "audio/mp4",
  ];

  return types.find((type) => window.MediaRecorder?.isTypeSupported?.(type)) || "";
}

function stopActiveRecording() {
  if (activeRecordingTimer) {
    window.clearTimeout(activeRecordingTimer);
    activeRecordingTimer = null;
  }

  if (activeMediaRecorder && activeMediaRecorder.state !== "inactive") {
    activeMediaRecorder.stop();
  }
}

function cleanupRecording() {
  if (activeRecordingTimer) {
    window.clearTimeout(activeRecordingTimer);
    activeRecordingTimer = null;
  }
  if (activeMediaStream) {
    activeMediaStream.getTracks().forEach((track) => track.stop());
    activeMediaStream = null;
  }
  activeMediaRecorder = null;
}

async function transcribeAudioBlob(blob) {
  console.log("[voice] transcription request started", { size: blob.size, type: blob.type });
  const response = await fetch("/api/transcribe", {
    method: "POST",
    headers: {
      "Content-Type": blob.type || "audio/webm",
    },
    body: blob,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[error] transcription failed", response.status, errorText);
    throw new Error(`Transcription failed with ${response.status}`);
  }

  const data = await response.json();
  const transcript = String(data.text || "").trim();
  console.log("[voice] transcript received", { transcript });
  return transcript;
}

async function startRecordedVoiceInput() {
  if (activeMediaRecorder && activeMediaRecorder.state === "recording") {
    console.log("[voice] manual recording stop");
    setAssistantState("thinking", "Processing your voice...");
    stopActiveRecording();
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    console.warn("[voice] MediaRecorder unavailable, falling back to SpeechRecognition");
    beginVoiceRecognition();
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = getSupportedAudioMimeType();
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    const chunks = [];
    activeMediaStream = stream;
    activeMediaRecorder = recorder;

    recorder.addEventListener("dataavailable", (event) => {
      if (event.data?.size) chunks.push(event.data);
    });

    recorder.addEventListener("start", () => {
      console.log("[voice] listening started");
      setAssistantState("listening", "Listening... tap again when done.");
      stageTranscript.textContent = "Listening... speak now. Tap again when done.";
      activeRecordingTimer = window.setTimeout(() => {
        console.log("[voice] auto recording stop");
        stopActiveRecording();
      }, checkoutState.awaiting === "address" ? 9000 : 5200);
    });

    recorder.addEventListener("stop", async () => {
      try {
        cleanupRecording();
        if (!chunks.length) {
          await handleVoiceRecognitionFailure("I didn't catch that. Please try again.");
          return;
        }

        setAssistantState("thinking", "Thinking...");
        stageTranscript.textContent = "Processing your voice...";
        const audioBlob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        const transcript = await withResponseTimeout(transcribeAudioBlob(audioBlob), "Voice transcription");
        if (!transcript) {
          await handleVoiceRecognitionFailure("I didn't catch that. Please try again.");
          return;
        }

        stageTranscript.textContent = transcript;
        await handleCommerceConversation(transcript, "voice-demo");
      } catch (error) {
        console.error("[error] recorded voice flow failed", error);
        await handleVoiceRecognitionFailure("I couldn't understand the audio. Please try again or type your request.");
      }
    });

    recorder.addEventListener("error", async (event) => {
      console.error("[error] media recorder error", event.error || event);
      cleanupRecording();
      await handleVoiceRecognitionFailure("I couldn't record your voice. Please try again or type your request.");
    });

    recorder.start();
  } catch (error) {
    console.error("[error] microphone recording start failed", error);
    await handleVoiceRecognitionFailure(
      "Microphone permission is blocked. Please allow microphone access or type your request.",
      "Microphone permission is blocked. Please type your request."
    );
  }
}

async function handleVoiceRecognitionFailure(message, spokenText = message) {
  stageTranscript.textContent = message;
  addChatMessage("ai", message);
  setAssistantState("error", message);
  try {
    await speakAndShow(message, {
      spokenText,
      afterMode: "error",
      afterMessage: message,
    });
  } catch (error) {
    console.error("[error] voice failure message could not be spoken", error);
    setAssistantState("error", message);
  }
}

function beginVoiceRecognition() {
  logClient("voice recognition setup");
  openAssistantStage("Listening...");
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    logClient("voice unsupported");
    handleVoiceRecognitionFailure(
      "Microphone is not available in this browser. Please type your request in the search or chat box.",
      "Microphone is not available. Please type your request."
    );
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = navigator.language?.toLowerCase().startsWith("es") ? "es-CO" : "en-US";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.addEventListener("start", () => {
    console.log("[voice] listening started");
    logClient("voice recognition started");
    setAssistant("listening", "I am listening. What are you shopping for today?");
    stageTranscript.textContent = "Listening...";
  });

  recognition.addEventListener("result", (event) => {
    const transcript = event.results[0][0].transcript;
    console.log("[voice] transcript received", { transcript });
    logClient("voice recognition result", { transcript });
    stageTranscript.textContent = transcript;
    setAssistantState("thinking", "Thinking...");
    handleCommerceConversation(transcript, "voice-demo");
  });

  recognition.addEventListener("error", (event) => {
    console.error("[error] voice recognition error", event.error || event);
    logClientError("voice recognition error", event.error || event);
    const message =
      event.error === "not-allowed"
        ? "Microphone permission is blocked. Please allow microphone access."
        : event.error === "network"
          ? "Voice recognition had a network problem. Please try again or type your request."
          : "I didn't catch that. Please try again.";
    handleVoiceRecognitionFailure(message);
  });

  recognition.addEventListener("nomatch", () => {
    console.error("[error] voice recognition no match");
    handleVoiceRecognitionFailure("I didn't catch that. Please try again.");
  });

  recognition.addEventListener("end", () => {
    console.log("[voice] listening ended");
    if (currentAssistantState === "listening") {
      handleVoiceRecognitionFailure("I didn't catch that. Please try again.");
    }
  });

  try {
    recognition.start();
  } catch (error) {
    console.error("[error] voice recognition start failed", error);
    logClientError("voice recognition start failed", error);
    handleVoiceRecognitionFailure(
      "I could not start the microphone. Check browser permissions and try again.",
      "I could not start the microphone. Check browser permissions."
    );
  }
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
  const language = detectLanguage(cleanMessage);
  logClient("commerce conversation", {
    message: cleanMessage,
    source,
    checkoutState,
    currentRecommendation: currentRecommendation?.id || null,
  });

  if (!isVoiceSource(source) && isCheckoutActive()) {
    checkoutState.voiceEnabled = false;
    logClient("checkout switched to written mode", { source });
  }

  openAssistantStage(cleanMessage);
  if (source !== "chat") addChatMessage("user", cleanMessage);

  if (!checkoutState.selectedProducts.length && cart.length && wantsCheckout(cleanMessage)) {
    setCheckoutProducts(cart);
    checkoutState.voiceEnabled = isVoiceSource(source);
    const answer = phrase("cartCheckout", language);
    remember("user", cleanMessage);
    remember("assistant", answer);
    addChatMessage("ai", answer);
    await promptCheckoutAnswer(answer, "name", language);
    return;
  }

  if (checkoutState.selectedProduct && !checkoutState.awaiting && !checkoutState.readyToConfirm) {
    if (isYes(cleanMessage) || wantsCheckout(cleanMessage)) {
      checkoutState.voiceEnabled = isVoiceSource(source);
      const answer = phrase("askName", language);
      remember("user", cleanMessage);
      remember("assistant", answer);
      addChatMessage("ai", answer);
      await promptCheckoutAnswer(answer, "name", language);
      return;
    }

    if (isNo(cleanMessage)) {
      logClient("checkout declined", { productId: checkoutState.selectedProduct.id });
      const answer = phrase("decline", language);
      remember("user", cleanMessage);
      remember("assistant", answer);
      addChatMessage("ai", answer);
      await respondCheckoutMessage(answer, language);
      resetCheckout();
      return;
    }
  }

  if (checkoutState.awaiting === "name") {
    checkoutState.customerName = cleanMessage;
    const answer = phrase("askAddress", language);
    remember("user", cleanMessage);
    remember("assistant", answer);
    addChatMessage("ai", answer);
    await promptCheckoutAnswer(answer, "address", language);
    return;
  }

  if (checkoutState.awaiting === "address") {
    checkoutState.address = cleanMessage;
    const answer = phrase("askCity", language);
    remember("user", cleanMessage);
    remember("assistant", answer);
    addChatMessage("ai", answer);
    await promptCheckoutAnswer(answer, "city", language);
    return;
  }

  if (checkoutState.awaiting === "city") {
    checkoutState.city = cleanMessage;
    checkoutState.awaiting = "confirmation";
    checkoutState.readyToConfirm = true;
    const answer = phrase("confirm", language, {
      summary: summarizeCheckout(),
    });
    remember("user", cleanMessage);
    remember("assistant", answer);
    addChatMessage("ai", answer);
    await respondCheckoutMessage(answer, language);
    return;
  }

  if (checkoutState.awaiting === "confirmation" && checkoutState.readyToConfirm) {
    if (isCheckoutConfirmation(cleanMessage)) {
      const productsToBuy = getCheckoutProducts();
      remember("user", cleanMessage);
      openCheckoutWhatsapp(productsToBuy, language);
      return;
    }

    if (isNo(cleanMessage)) {
      const answer = phrase("decline", language);
      remember("user", cleanMessage);
      remember("assistant", answer);
      addChatMessage("ai", answer);
      await respondCheckoutMessage(answer, language);
      resetCheckout();
      return;
    }

    const answer = phrase("needConfirmation", language);
    addChatMessage("ai", answer);
    await respondCheckoutMessage(answer, language);
    return;
  }

  await runSearch(cleanMessage, source);
}

function registerElevenLabsTools() {
  if (!elevenlabsWidget) {
    logClient("elevenlabs widget not found");
    return;
  }
  logClient("elevenlabs widget listener registered");

  elevenlabsWidget.addEventListener("elevenlabs-convai:call", (event) => {
    logClient("elevenlabs convai call event", event.detail);
    event.detail.config.clientTools = {
      searchProducts: ({ query, category }) => {
        logClient("elevenlabs tool searchProducts", { query, category });
        if (category && [...new Set(products.map((product) => product.category).filter(Boolean))].includes(category)) {
          activeCategory = category;
          renderCategories();
        }

        return runSearch(query ?? "", "elevenlabs");
      },
      showAllProducts: () => {
        logClient("elevenlabs tool showAllProducts");
        return runSearch("", "elevenlabs");
      },
      getCart: () => {
        logClient("elevenlabs tool getCart");
        return getCartSummary();
      },
      askCart: ({ question }) => {
        logClient("elevenlabs tool askCart", { question });
        return answerCartQuestion(question ?? "");
      },
    };
  });
}

async function loadProducts() {
  try {
    logClient("load products request");
    const response = await fetch("products.json");
    logClient("load products response", {
      status: response.status,
      ok: response.ok,
      contentType: response.headers.get("content-type"),
    });
    if (!response.ok) throw new Error(`products.json failed with ${response.status}`);
    products = await response.json();
    logClient("load products ok", {
      count: products.length,
      firstIds: products.slice(0, 5).map((product) => product.id),
    });
    renderCategories();
    renderProducts(products);
    updateCartUi();
    setAssistant("idle", assistantStates.idle.message);
  } catch (error) {
    logClientError("load products failed", error);
    resultSummary.textContent = "Catalog load error";
    productGrid.innerHTML = '<div class="empty-state">products.json could not be loaded.</div>';
    setAssistant("error", "I could not load the catalog.");
  }
}

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  logClient("search form submit", { value: searchInput.value });
  handleCommerceConversation(searchInput.value);
});

clearButton.addEventListener("click", () => {
  logClient("clear search clicked");
  activeCategory = "All";
  renderCategories();
  runSearch("");
});

voiceDemoButton.addEventListener("click", startVoiceDemo);
assistantVoiceButton?.addEventListener("click", startVoiceDemo);

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const question = chatInput.value.trim();
  if (!question) return;
  logClient("chat submit", {
    question,
    checkoutState,
    cartItems: cart.length,
  });

  addChatMessage("user", question);
  chatInput.value = "";

  if (isCheckoutActive()) {
    await handleCommerceConversation(question, "chat");
    return;
  }

  setAssistant("thinking", "Thinking about your shopping needs.");
  openAssistantStage(question);

  let answer = answerCartQuestion(question).message;
  try {
    const aiAnswer = await withResponseTimeout(getAiShoppingReply(question), "Shopping chat");
    answer = aiAnswer.message || answer;
    const recommendedProducts = orderProductsByIds(products, aiAnswer.productIds || []).slice(0, 12);
    logClient("chat ai applied", {
      answer,
      recommendedCount: recommendedProducts.length,
      productIds: aiAnswer.productIds || [],
    });
    if (recommendedProducts.length) renderProducts(recommendedProducts);
  } catch (error) {
    console.error("[error] ai chat failed", error);
    setAssistantState("error", "This is taking longer than expected. Please try again.");
    logClientError("chat ai failed", error);
    answer = `${answer} I could not reach the shopping assistant, so I used cart basics.`;
  }

  conversationHistory.push({ role: "user", content: question });
  conversationHistory.push({ role: "assistant", content: answer });
  conversationHistory = conversationHistory.slice(-10);

  addChatMessage("ai", answer);
  showAssistantText(answer, "Reply ready.");
});

productGrid.addEventListener("click", (event) => {
  const buyNowButton = event.target.closest("[data-buy-now]");
  if (buyNowButton) {
    const product = findProduct(buyNowButton.dataset.buyNow);
    if (product) startBuyNowCheckout(product, "en");
    return;
  }

  const detailButton = event.target.closest("[data-detail-id]");
  if (detailButton) {
    logClient("product detail clicked", { id: detailButton.dataset.detailId });
    const product = findProduct(detailButton.dataset.detailId);
    if (product) {
      currentRecommendation = product;
      setCheckoutProducts([product]);
      highlightProduct(product.id);
      showProductDetail(product);
    }
    return;
  }

  const button = event.target.closest("[data-product-id]");
  if (!button) return;
  logClient("product add clicked", { id: button.dataset.productId });

  const product = products.find((item) => item.id === button.dataset.productId);
  if (!product) return;

  addToCart(product);
  setAssistant("idle", `${product.name} added to your cart.`);
});

productDetail.addEventListener("click", async (event) => {
  const buyButton = event.target.closest("[data-buy-now]");
  const addButton = event.target.closest("[data-add-from-detail]");

  if (addButton) {
    logClient("detail add clicked", { id: addButton.dataset.addFromDetail });
    const product = findProduct(addButton.dataset.addFromDetail);
    if (!product) return;
    addToCart(product);
    return;
  }

  if (buyButton) {
    const product = findProduct(buyButton.dataset.buyNow);
    if (!product) return;
    productDialog.close();
    startBuyNowCheckout(product, "en");
  }
});

dialogClose.addEventListener("click", () => {
  logClient("product dialog close clicked");
  productDialog.close();
});
checkoutClose?.addEventListener("click", () => {
  logClient("checkout dialog close clicked");
  checkoutDialog.close();
});
checkoutForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  applyCheckoutDetails({
    customerName: checkoutNameInput.value,
    address: checkoutAddressInput.value,
    city: checkoutCityInput.value,
  });

  const productsToBuy = getCheckoutProducts();
  checkoutDialog.close();
  openCheckoutWhatsapp(productsToBuy, detectLanguage(checkoutState.customerName));
});
stageClose.addEventListener("click", closeAssistantStage);

registerElevenLabsTools();
loadProducts();
