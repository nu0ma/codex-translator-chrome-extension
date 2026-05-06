# Security Policy

## Supported Versions

Only the latest release of `codex-translator-chrome-extension` receives security fixes.

| Version | Supported |
| ------- | --------- |
| 0.1.x   | ✅        |
| < 0.1.0 | ❌        |

## Reporting a Vulnerability

**Please do not open a public issue for security vulnerabilities.**

If you believe you have found a security vulnerability — for example a way for a malicious web page to exfiltrate data through the extension, an unauthenticated path that reaches `codex app-server`, or a supply-chain concern — report it privately:

- Use [**GitHub's private vulnerability reporting**](https://github.com/nu0ma/codex-translator-chrome-extension/security/advisories/new) for this repo (Security tab → Report a vulnerability), **or**
- Email the maintainer (see profile on GitHub).

Please include:

1. A clear description of the issue and its impact.
2. Steps to reproduce, ideally with a minimal proof of concept.
3. The version / commit you tested against.
4. Whether the issue requires a running `pnpm serve`, a malicious page, both, or neither.

You can expect:

- An acknowledgement within **3 business days**.
- A triage decision within **7 business days**.
- A fix or mitigation plan within **30 days** for high-severity issues. Lower-severity issues are fixed on a best-effort basis.

## Scope

In scope:

- The Chrome extension code under `src/` (background service worker, content script, options page).
- The local proxy under `tools/codex-proxy.mjs`.
- The build pipeline under `scripts/`.

Out of scope:

- Vulnerabilities in `codex-app-server` itself — please report those at <https://github.com/openai/codex>.
- Vulnerabilities in third-party host pages where the extension renders translations.
- Issues that require physical access to the user's machine.
