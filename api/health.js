const { elevenLabsKey, elevenLabsVoiceId, methodNotAllowed, openAiKey, sendJson } = require("./_shared");

module.exports = function handler(request, response) {
  console.log(`[vercel] ${request.method} /api/health`);
  if (request.method !== "GET") {
    methodNotAllowed(response, request.method);
    return;
  }

  sendJson(response, 200, {
    ok: true,
    openAiKeyLoaded: Boolean(openAiKey),
    elevenLabsKeyLoaded: Boolean(elevenLabsKey),
    elevenLabsVoiceId,
  });
};
