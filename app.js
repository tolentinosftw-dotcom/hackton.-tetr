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

function setAssistant(mode, message) {
  logClient("assistant state", { mode, message });
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
  logClient("api product-search data", data);
  return data;
}

async function getAiShoppingReply(message) {
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
  logClient("build whatsapp url", {
    productId: product?.id,
    productName: product?.name,
    price: product?.price,
    address,
  });
  const message = `El cliente quiere comprar ${product.name} por ${money.format(product.price)} y debe ser enviado a ${address}.`;
  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
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

async function speakAndShow(text) {
  logClient("speak and show", { chars: text.length, text });
  setAssistant("speaking", text);
  stageTranscript.textContent = text;
  openAssistantStage(text);
  await speak(text);
}

async function runSearch(query, source = "manual") {
  logClient("run search start", { query, source });
  activeQuery = query.trim();
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
      logClient("ai search applied", {
        answer,
        finalCount: finalResults.length,
        productIds: aiAnswer.productIds || [],
      });
      renderProducts(finalResults);
      remember("user", activeQuery);
      remember("assistant", answer);

      const recommendedId = aiAnswer.productIds?.[0] || finalResults[0]?.id;
      currentRecommendation = recommendedId ? findProduct(recommendedId) : finalResults[0] || null;
      logClient("current recommendation", currentRecommendation
        ? { id: currentRecommendation.id, name: currentRecommendation.name }
        : null);
      if (currentRecommendation) {
        checkoutState = "confirming";
        highlightProduct(currentRecommendation.id);
        showProductDetail(currentRecommendation);
        answer = `${answer} Would you like to buy this product?`;
      }
    } catch (error) {
      logClientError("run search ai failed", error);
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
  logClient("browser speech fallback", {
    available: "speechSynthesis" in window,
    chars: text.length,
  });
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  speechSynthesis.speak(utterance);
}

async function speak(text) {
  lastSpokenText = text;
  logClient("tts start", { chars: text.length, text });
  try {
    if (currentAudio) {
      logClient("tts stopping current audio");
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
    logClient("tts blob", {
      size: audioBlob.size,
      type: audioBlob.type,
    });
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    currentAudio = audio;
    audio.addEventListener("ended", () => {
      logClient("tts audio ended");
      URL.revokeObjectURL(audioUrl);
    }, { once: true });
    audio.addEventListener("error", () => {
      logClientError("tts audio element error", audio.error);
    });
    await audio.play();
    logClient("tts audio playing");
  } catch (error) {
    logClientError("tts failed, using browser fallback", error);
    speakWithBrowser(text);
  }
}

function startVoiceDemo() {
  logClient("voice start requested");
  openAssistantStage("Listening...");
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    logClient("voice unsupported");
    setAssistant("idle", "Your browser does not support speech recognition. Use the ElevenLabs widget.");
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.addEventListener("start", () => {
    logClient("voice recognition started");
    setAssistant("listening", "I am listening. What are you shopping for today?");
    stageTranscript.textContent = "Listening...";
  });

  recognition.addEventListener("result", (event) => {
    const transcript = event.results[0][0].transcript;
    logClient("voice recognition result", { transcript });
    stageTranscript.textContent = transcript;
    handleCommerceConversation(transcript, "voice-demo");
  });

  recognition.addEventListener("error", (event) => {
    logClientError("voice recognition error", event.error || event);
    setAssistant("idle", "I could not hear clearly. Click the genie and try again.");
  });

  try {
    recognition.start();
  } catch (error) {
    logClientError("voice recognition start failed", error);
    setAssistant("idle", "I could not start the microphone. Check browser permissions and try again.");
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
  logClient("commerce conversation", {
    message: cleanMessage,
    source,
    checkoutState,
    currentRecommendation: currentRecommendation?.id || null,
  });

  openAssistantStage(cleanMessage);
  if (source !== "chat") addChatMessage("user", cleanMessage);

  if (checkoutState === "awaiting-address" && currentRecommendation) {
    const address = cleanMessage;
    logClient("checkout address received", {
      productId: currentRecommendation.id,
      address,
    });
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
      logClient("checkout confirmed yes", { productId: currentRecommendation.id });
      const answer = `Great. What address should we ship ${currentRecommendation.name} to?`;
      checkoutState = "awaiting-address";
      remember("user", cleanMessage);
      remember("assistant", answer);
      addChatMessage("ai", answer);
      await speakAndShow(answer);
      return;
    }

    if (isNo(cleanMessage)) {
      logClient("checkout declined", { productId: currentRecommendation.id });
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
    setAssistant("idle", "Click the genie and tell me what you are shopping for.");
  } catch (error) {
    logClientError("load products failed", error);
    resultSummary.textContent = "Catalog load error";
    productGrid.innerHTML = '<div class="empty-state">products.json could not be loaded.</div>';
    setAssistant("speaking", "I could not load the catalog.");
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
  logClient("chat submit", {
    question,
    checkoutState,
    cartItems: cart.length,
  });

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
    logClient("chat ai applied", {
      answer,
      recommendedCount: recommendedProducts.length,
      productIds: aiAnswer.productIds || [],
    });
    if (recommendedProducts.length) renderProducts(recommendedProducts);
  } catch (error) {
    logClientError("chat ai failed", error);
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
    logClient("product detail clicked", { id: detailButton.dataset.detailId });
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
  logClient("product add clicked", { id: button.dataset.productId });

  const product = products.find((item) => item.id === button.dataset.productId);
  if (!product) return;

  addToCart(product);
  setAssistant("speaking", `${product.name} added to your cart.`);
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
    logClient("detail buy clicked", { id: buyButton.dataset.buyNow });
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

dialogClose.addEventListener("click", () => {
  logClient("product dialog close clicked");
  productDialog.close();
});
stageClose.addEventListener("click", closeAssistantStage);

registerElevenLabsTools();
loadProducts();
