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

## Repository Posture

Audited with [`microsoft/ghqr`](https://github.com/microsoft/ghqr). Active controls:

- **Branch protection** on `main`: linear history required, force-push and deletion blocked, status check (`typecheck + lint + test + build`) required for PR merges, branches must be up to date before merging.
- **CodeQL** weekly + on every push/PR, `security-and-quality` query suite.
- **Dependency review** on PRs (fails on `high` severity).
- **Dependabot** version updates for `npm` and `github-actions` weekly; **Dependabot security updates** auto-open patches for vulnerable deps.
- **Secret scanning** + push protection (GitHub default for public repos).
- **All third-party Actions pinned to commit SHA** with version comment.
- **Workflow `permissions:` defaults to `contents: read`**; jobs grant only what they need.
- **`automated-security-fixes`, `vulnerability-alerts`, `delete_branch_on_merge`** all enabled.

Intentional gaps for this project (single-maintainer, public, no enterprise org):

- PR-required + code-owner-review + dismiss-stale-reviews are **not** enforced — would block solo direct-pushes; the maintainer reviews their own work before push and uses signed CI as the safety net.
- Required commit signing is **not** enforced — would force GPG/SSH key setup for every contributor with no proportional benefit at this scale.

If the project gains additional maintainers, all three should be enabled.
