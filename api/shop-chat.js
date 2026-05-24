const { askShoppingAssistant, methodNotAllowed, readJsonBody, sendJson } = require("./_shared");

module.exports = async function handler(request, response) {
  console.log(`[vercel] ${request.method} /api/shop-chat`);
  if (request.method !== "POST") {
    methodNotAllowed(response, request.method);
    return;
  }

  try {
    const body = await readJsonBody(request);
    const message = String(body.message || "").trim();
    const cart = Array.isArray(body.cart) ? body.cart : [];
    const history = Array.isArray(body.history) ? body.history : [];
    console.log(`[vercel] shop-chat message="${message}" cart=${cart.length} history=${history.length}`);

    if (!message) {
      sendJson(response, 400, { message: "Message is required", productIds: [] });
      return;
    }

    const answer = await askShoppingAssistant(message, cart, history);
    sendJson(response, 200, answer);
  } catch (error) {
    console.error("[vercel] shop-chat error", error);
    sendJson(response, 500, {
      message: error.message,
      productIds: [],
    });
  }
};
