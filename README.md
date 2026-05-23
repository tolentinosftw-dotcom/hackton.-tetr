# hackton.-tetr

Voice-commerce prototype with:

- MercadoLibre products loaded from `products.json`
- Fast dynamic product cards
- Voice product search
- Floating genie assistant states:
  - `4.png`: initial state before the user clicks
  - `1.png`: listening after the user clicks the genie
  - `2.png`: thinking
  - `3.png`: ideal product found
- Cart chat for asking about products added to the cart

## ElevenLabs

1. Create an agent in ElevenLabs.
2. Keep the widget public if you want to use the simple embed.
3. Replace `REEMPLAZA_CON_TU_AGENT_ID` in `index.html` with your real `agent-id`.
4. Add these Client Tools to the ElevenLabs agent:
   - `searchProducts`
     - `query`: required string
     - `category`: optional string
   - `showAllProducts`
   - `getCart`
   - `askCart`
     - `question`: required string
5. Enable "Wait for response" on tools that need product or cart data.

## Run locally

```powershell
node server.js
```

Open `http://localhost:5173`.

Create a local `.env` file with one of these names:

```text
OPENAI_API_KEY=your_key_here
```

or:

```text
openKey=your_key_here
```

The key is read only by `server.js`; it is not exposed to the browser.

For ElevenLabs speech, add:

```text
ELEVENLABS_API_KEY=your_elevenlabs_key_here
ELEVENLABS_VOICE_ID=JBFqnCBsd6RMkjVDRZzb
```

The project also supports your current names:

```text
elevenlabs=your_elevenlabs_key_here
ELEVENLABS_VOICE_I=JBFqnCBsd6RMkjVDRZzb
```

## Import MercadoLibre Offers

The importer reads a saved MercadoLibre offers HTML file and writes `products.json`:

```powershell
node tools/import-mercadolibre-offers.js data/mercadolibre-offers.html products.json
```

The current catalog was generated from MercadoLibre Colombia offers.
