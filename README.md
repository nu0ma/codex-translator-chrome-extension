# Codex Translator (Chrome Extension)

Translate selected text on any web page using a [`codex app-server`](https://developers.openai.com/codex/app-server) running on your own machine. No API key required if you signed in to codex with ChatGPT; everything else stays on `localhost`.

- TypeScript (strict), Manifest V3
- Streaming translation: chunks render as they arrive
- Cancellable per-request; supersedes the previous in-flight on a new selection
- Tested protocol client (Vitest + fake WebSocket)
- Build with esbuild → `dist/` (loadable as unpacked, or zipped for the Web Store)

## Project layout

```
public/                static assets copied verbatim into dist/
  manifest.json
  options.html / options.css
  content.css
src/
  background/          service worker + JSON-RPC CodexClient
    codex-client.ts
    index.ts
  content/             page-world UI (selection, button, streaming card)
    index.ts
    selection.ts
    ui.ts
  options/             options page logic
    index.ts
  shared/              cross-context utilities (types, settings, logger)
    constants.ts
    logger.ts
    messages.ts
    settings.ts
    types.ts
scripts/
  build.mjs            esbuild bundler + static copy
  package.mjs          zip dist/ for distribution
tests/
  codex-client.test.ts
```

## Prerequisites

- **Node.js ≥ 24 LTS**
- **pnpm 10.x** (declared in `packageManager`; use [Corepack](https://nodejs.org/api/corepack.html) or install directly)
- **codex CLI** with the `app-server` subcommand. See the [official docs](https://developers.openai.com/codex/app-server). Either `codex login` (ChatGPT) or `OPENAI_API_KEY` must be configured.

## Build

```bash
pnpm install
pnpm build           # writes dist/
pnpm dev             # rebuild on change
pnpm verify          # typecheck + lint + test + build
pnpm package         # zip dist/ into codex-translator-<version>.zip
```

## Use

1. Start the server:

   ```bash
   codex app-server --listen ws://127.0.0.1:4500
   ```

   Sanity-check: `curl http://127.0.0.1:4500/healthz`

2. Load the extension:
   1. Open `chrome://extensions`
   2. Enable **Developer mode** (top right)
   3. **Load unpacked** → select the `dist/` directory

3. (Optional) Click the extension icon to open settings and adjust:

   | Field           | Default               | Notes                                                     |
   | --------------- | --------------------- | --------------------------------------------------------- |
   | WebSocket URL   | `ws://127.0.0.1:4500` | Must match the `--listen` flag                            |
   | Model           | _(empty)_             | Optional; passed to `thread/start`. Empty → codex default |
   | Target language | `Japanese`            | Embedded in the translation prompt                        |
   | Timeout (ms)    | `60000`               | Per-request hard limit                                    |

4. On any page, select text. A **Translate** button appears at the end of the selection — click it. The result streams into a card. Cancel anytime with the button or `Esc`. Right-click → **Translate with Codex** also works.

## Architecture

```
content script ──port──▶ background SW ──WebSocket──▶ codex-app-server (localhost)
      ▲                     │                            │
      │                     │  CodexClient (typed        │
      │                     │  JSON-RPC + streaming)     │
      └─── delta/done ──────┘                            │
                                                          ▼
                                                   thread/turn lifecycle
```

- The content script opens a long-lived `chrome.runtime.Port` for streaming.
- The background spawns a fresh `CodexClient` per turn for simplicity (the client itself is reusable; multi-turn use is left to future work).
- `CodexClient` does the JSON-RPC handshake (`initialize` → `initialized` → `thread/start` → `turn/start`), aggregates `item/agentMessage/delta`, and resolves on `turn/completed`.
- A `WebSocketFactory` is injected so the protocol can be unit-tested without a real socket.

## Security & privacy

- All traffic stays on `127.0.0.1`; no third-party endpoints.
- Selected text is sent to your local codex-app-server only when you explicitly click Translate (or trigger the context menu).
- Service worker logs use a tagged structured logger; `__DEV__` is stripped at build time so production bundles drop debug logs.

## Development tips

- After changing files, the watcher (`pnpm dev`) rewrites `dist/` — but Chrome won't auto-reload the extension. Click the **reload** icon on `chrome://extensions`.
- Background errors: open `chrome://extensions`, find the card, click **Service worker** to attach DevTools.
- Content-script errors: open the page DevTools.

## Limitations

- A small number of pages (e.g. `chrome://`, the Chrome Web Store) deny content scripts; the extension simply does nothing there.
- Long inputs (>8 000 chars) are rejected client-side to avoid context-window failures. Tune `MAX_INPUT_CHARS` if needed.
- This codebase does not currently persist a chat session — every translation is a fresh thread.

## License

MIT — see `LICENSE`.
