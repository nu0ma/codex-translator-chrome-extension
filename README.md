# Codex Translator

Translate selected text on any web page using a [`codex app-server`](https://developers.openai.com/codex/app-server) running on your own machine. No API key required if you signed in with `codex login`; nothing leaves `127.0.0.1`.

![demo](docs/demo.png)

## Install

1. Grab the latest zip from [Releases](https://github.com/nu0ma/codex-translator-chrome-extension/releases) and unzip it.
2. Open `chrome://extensions`, enable **Developer mode** (top right), click **Load unpacked**, and select the unzipped folder.

Or build from source:

```bash
pnpm install
pnpm build           # → dist/
```

## Run

The extension talks to codex through a tiny local proxy that strips Chrome's `Origin` header (codex-app-server rejects WS upgrades that carry one).

```bash
pnpm serve
# → spawns `codex app-server` on :4501
# → proxies ws://127.0.0.1:4500 → :4501
```

Then on any page: select text → click the floating **Translate** button (or right-click → **Translate with Codex**).

## Settings

Click the extension icon to open settings:

| Field           | Default                   |
| --------------- | ------------------------- |
| WebSocket URL   | `ws://127.0.0.1:4500`     |
| Model           | _(empty = codex default)_ |
| Target language | `Japanese`                |
| Timeout         | `60000` ms                |

## Develop

```bash
pnpm dev             # esbuild watch mode
pnpm verify          # typecheck + lint + test + build
pnpm package         # zip dist/ → codex-translator-<version>.zip
```

Reload the extension on `chrome://extensions` after a rebuild.

## How it works

```
content script ─port─▶ background SW ─WS─▶ codex-proxy (Node) ─WS─▶ codex-app-server
                                            strips Origin header
```

- **content/**: selection detection, floating button, streaming card
- **background/**: typed JSON-RPC `CodexClient` (connect → initialize → thread/start → turn/start → stream `item/agentMessage/delta` → `turn/completed`)
- **tools/codex-proxy.mjs**: spawns codex and forwards using Node's built-in `WebSocket` (no `Origin` header)

## License

MIT
