const { methodNotAllowed, readJsonBody, sendAudio, sendJson, synthesizeSpeech } = require("./_shared");

module.exports = async function handler(request, response) {
  console.log(`[vercel] ${request.method} /api/tts`);
  if (request.method !== "POST") {
    methodNotAllowed(response, request.method);
    return;
  }

  try {
    const body = await readJsonBody(request);
    const text = String(body.text || "").trim().slice(0, 900);
    console.log(`[vercel] tts request chars=${text.length}`);

    if (!text) {
      sendJson(response, 400, { message: "Text is required" });
      return;
    }

    const audio = await synthesizeSpeech(text);
    console.log(`[vercel] tts ok bytes=${audio.length}`);
    sendAudio(response, audio);
  } catch (error) {
    console.error("[vercel] tts error", error);
    sendJson(response, 500, { message: error.message });
  }
};
