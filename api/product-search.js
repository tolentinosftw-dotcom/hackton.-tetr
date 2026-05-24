const {
  askOpenAi,
  getCandidateProducts,
  localAnswer,
  methodNotAllowed,
  readJsonBody,
  sendJson,
} = require("./_shared");

module.exports = async function handler(request, response) {
  console.log(`[vercel] ${request.method} /api/product-search`);
  if (request.method !== "POST") {
    methodNotAllowed(response, request.method);
    return;
  }

  try {
    const body = await readJsonBody(request);
    const query = String(body.query || "").trim();
    const history = Array.isArray(body.history) ? body.history : [];
    console.log(`[vercel] product-search query="${query}" history=${history.length}`);

    if (!query) {
      sendJson(response, 400, { message: "Query is required", productIds: [] });
      return;
    }

    const candidates = getCandidateProducts(query);
    console.log(`[vercel] product-search candidates=${candidates.length}`);
    const answer = await askOpenAi(query, candidates, history);
    const fallback = localAnswer(query, candidates);
    const answerProductIds = Array.isArray(answer.productIds) ? answer.productIds : [];
    const canUseFallbackProducts = !["clarify", "greeting"].includes(answer.intent);

    sendJson(response, 200, {
      message: answer.message || fallback.message,
      productIds: answerProductIds.length
        ? answerProductIds
        : canUseFallbackProducts
          ? fallback.productIds
          : [],
      intent: answer.intent || "recommend",
    });
  } catch (error) {
    console.error("[vercel] product-search error", error);
    sendJson(response, 500, {
      message: error.message,
      productIds: [],
    });
  }
};
