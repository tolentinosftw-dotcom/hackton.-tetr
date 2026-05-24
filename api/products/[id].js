const { getProductById, methodNotAllowed, sendJson } = require("../_shared");

module.exports = function handler(request, response) {
  console.log(`[vercel] ${request.method} /api/products/[id]`);
  if (request.method !== "GET") {
    methodNotAllowed(response, request.method);
    return;
  }

  const id = String(request.query.id || "");
  const product = getProductById(id);
  if (!product) {
    sendJson(response, 404, { message: "Product not found" });
    return;
  }

  sendJson(response, 200, product);
};
