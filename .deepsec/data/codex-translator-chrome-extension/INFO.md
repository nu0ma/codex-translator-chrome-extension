# codex-translator-chrome-extension

## What this codebase does

A Manifest V3 Chrome extension that translates selected page text by talking
to a **locally running** `codex app-server` over WebSocket. Traffic shape:
`content script → background SW (chrome.runtime.Port) → ws://127.0.0.1:4500
(Node proxy in tools/codex-proxy.mjs) → ws://127.0.0.1:4501 (codex)`. The
proxy strips the `Origin` header that codex rejects. Streaming JSON-RPC
deltas are rendered into a floating card injected into the page. No
third-party network endpoints. End users: local devs / ChatGPT-logged-in
codex users.

## Auth shape

There is **no extension-level auth** — the threat model assumes the local
machine is trusted. The interesting primitives:

- `tools/codex-proxy.mjs` — listens on `127.0.0.1:4500` by default; accepts
  any local TCP connection and forwards to upstream codex. No origin/host
  check beyond `host` flag. Equivalent to "anyone with code execution on the
  box can talk to codex via this proxy".
- `validateSettings` (`src/shared/settings.ts`) — `WS_URL_RE = /^wss?:\/\/[^\s]+$/i`.
  Only enforces scheme; **does not pin to localhost**.
- `loadSettings` / `saveSettings` use `chrome.storage.sync`, so settings
  (incl. `wsUrl`) round-trip through the user's Google account.

## Threat model

1. **Hostile web page exfiltrating selection / hijacking the card.** Content
   script runs on `<all_urls>` (`public/manifest.json`). The page DOM is
   attacker-controlled.
2. **Hostile local process talking to the proxy.** Anything on the host that
   can open a localhost socket can drive codex through `ws://127.0.0.1:4500`
   with `Origin` stripped.
3. **Settings tampering** routing `wsUrl` to a non-localhost server →
   selection text leaves the box. Chrome storage.sync is the entry point.
4. **LLM output rendered into the page.** Translation deltas are written
   into the floating card; if anything ever switches to `innerHTML`/`insertAdjacentHTML`,
   a crafted translation could XSS the host page.

## Project-specific patterns to flag

- **DOM sink for LLM output.** Currently `card.appendText` uses
  `body.append(chunk)` and `body.textContent = …` (`src/content/ui.ts`).
  Any change to `innerHTML`, `insertAdjacentHTML`, `outerHTML`, or
  `Range.createContextualFragment` on translation/error text is a finding.
- **WS URL not pinned to loopback.** `WS_URL_RE` accepts any host. Combined
  with `chrome.storage.sync`, a malicious actor with sync-account access
  could redirect text to an external server. Flag any path where `wsUrl`
  flows into `new WebSocket(...)` without a loopback/`isLocalhost(...)` check.
- **Proxy lacks origin/auth/CSRF check.** `tools/codex-proxy.mjs`
  `wss.on("connection", ...)` accepts any client; no token, no `Sec-WebSocket-Protocol`
  check, no localhost-only assertion (relies on `host=127.0.0.1` bind only).
  Flag if `--host` is documented as bindable to `0.0.0.0` or any non-loopback.
- **Selection text trust.** `info.selectionText` from
  `chrome.contextMenus.onClicked` is attacker-controlled (page can prefill
  selection). Currently length-checked (`MAX_INPUT_CHARS=8000`) and only
  used as prompt input + DOM text. Flag any new path that reflects it
  without escaping or that uses it in a shell/eval/regex source.
- **Arbitrary-host content scripts + `host_permissions: ["<all_urls>"]`.**
  Means any new `chrome.tabs.executeScript`-like dynamic code injection or
  `fetch()` from background to a settings-derived URL is high-risk.

## Known false-positives

- `host_permissions: ["http://127.0.0.1/*", "http://localhost/*", "<all_urls>"]`
  in `public/manifest.json` is intentional — `<all_urls>` is required for
  the page-context UI; the localhost host perms are deliberately scoped.
- `crypto.getRandomValues(new Uint32Array(2))` in `src/content/index.ts`
  generates a non-security request id; not a CSPRNG misuse.
- `tools/codex-proxy.mjs` spawning `codex` with `stdio: ["ignore", "inherit", "inherit"]`
  is intentional and `codexBin` is operator-controlled (CLI flag, not network).
- The proxy buffers messages before upstream `open` and flushes them — this
  is intentional for the connect race, not unbounded memory growth in
  practice (one upstream per client, short-lived turns).
- Service-worker logger drops debug logs via `__DEV__` strip at build
  (`scripts/build.mjs`); production bundles intentionally have no debug
  output.
