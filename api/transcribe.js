const { methodNotAllowed, sendJson, transcribeAudioBuffer } = require("./_shared");

async function readRawBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

module.exports = async function handler(request, response) {
  console.log(`[vercel] ${request.method} /api/transcribe`);
  if (request.method !== "POST") {
    methodNotAllowed(response, request.method);
    return;
  }

  try {
    const buffer = await readRawBody(request);
    const mimeType = request.headers["content-type"] || "audio/webm";
    console.log(`[vercel] transcribe request bytes=${buffer.length} type=${mimeType}`);

    if (!buffer.length) {
      sendJson(response, 400, { message: "Audio is required", text: "" });
      return;
    }

    const text = await transcribeAudioBuffer(buffer, mimeType);
    sendJson(response, 200, { text });
  } catch (error) {
    console.error("[vercel] transcribe error", error);
    sendJson(response, 500, {
      message: error.message,
      text: "",
    });
  }
};
