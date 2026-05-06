#!/usr/bin/env node
/**
 * Local launcher for the Codex Translator extension.
 *
 *   1. Spawns `codex app-server --listen ws://127.0.0.1:<UPSTREAM_PORT>` as a
 *      child process.
 *   2. Listens on ws://127.0.0.1:<PROXY_PORT> and forwards every connection
 *      to the upstream — without the `Origin` header.
 *
 * Why a proxy?  The extension's WebSocket calls go through Chrome's network
 * stack, which always attaches `Origin: chrome-extension://<id>`. codex-app-
 * server explicitly rejects WebSocket upgrades that carry an `Origin` header.
 * Chrome's `declarativeNetRequest` cannot remove `Origin` on extension-
 * initiated WebSocket upgrades, so we route through this Node-side proxy that
 * uses Node's built-in `WebSocket` client (no `Origin` header sent).
 *
 *   pnpm serve                       # default ports: proxy 4500, upstream 4501
 *   pnpm serve -- --port=4600        # change proxy port
 *   pnpm serve -- --upstream-port=...
 *   pnpm serve -- --no-spawn         # do not spawn codex; assume it's already up
 *
 * Configure the extension's "WebSocket URL" to point at the proxy port
 * (default ws://127.0.0.1:4500).
 */

import { spawn } from "node:child_process";
import { WebSocketServer } from "ws";
import { parseArgs } from "node:util";

// Node 22+ ships a global WebSocket client that — unlike the browser one —
// does not attach an Origin header by default. That's exactly what we need.
if (typeof globalThis.WebSocket !== "function") {
  console.error("[codex-proxy] requires Node ≥ 22 (built-in WebSocket).");
  process.exit(2);
}
const ClientWS = globalThis.WebSocket;

const { values } = parseArgs({
  options: {
    port: { type: "string", default: "4500" },
    "upstream-port": { type: "string", default: "4501" },
    host: { type: "string", default: "127.0.0.1" },
    "no-spawn": { type: "boolean", default: false },
    "codex-bin": { type: "string", default: "codex" },
  },
});

const proxyPort = Number(values.port);
const upstreamPort = Number(values["upstream-port"]);
const host = String(values.host);
const noSpawn = Boolean(values["no-spawn"]);
const codexBin = String(values["codex-bin"]);
const upstreamUrl = `ws://${host}:${upstreamPort}`;

if (!Number.isFinite(proxyPort) || !Number.isFinite(upstreamPort)) {
  console.error("[codex-proxy] invalid port(s)");
  process.exit(2);
}
if (proxyPort === upstreamPort) {
  console.error("[codex-proxy] proxy and upstream ports must differ");
  process.exit(2);
}

let codexChild = null;

function startCodex() {
  if (noSpawn) {
    console.log(`[codex-proxy] --no-spawn: assuming codex is already at ${upstreamUrl}`);
    return;
  }
  console.log(`[codex-proxy] spawning: ${codexBin} app-server --listen ${upstreamUrl}`);
  codexChild = spawn(codexBin, ["app-server", "--listen", upstreamUrl], {
    stdio: ["ignore", "inherit", "inherit"],
  });
  codexChild.on("exit", (code, signal) => {
    console.error(`[codex-proxy] codex exited (code=${code} signal=${signal})`);
    shutdown(1);
  });
  codexChild.on("error", (err) => {
    console.error("[codex-proxy] failed to spawn codex:", err.message);
    shutdown(2);
  });
}

function startProxy() {
  const wss = new WebSocketServer({ host, port: proxyPort });
  wss.on("listening", () => {
    console.log(`[codex-proxy] listening on ws://${host}:${proxyPort} → ${upstreamUrl}`);
    console.log(`[codex-proxy] point the extension's WebSocket URL at ws://${host}:${proxyPort}`);
  });
  wss.on("error", (err) => {
    console.error("[codex-proxy] server error:", err.message);
    shutdown(2);
  });

  wss.on("connection", (client, req) => {
    const id = `${req.socket.remoteAddress}:${req.socket.remotePort}`;
    console.log(`[codex-proxy] (${id}) client connected`);

    const upstream = new ClientWS(upstreamUrl);
    const buffer = [];
    let upstreamOpen = false;

    upstream.addEventListener("open", () => {
      upstreamOpen = true;
      for (const m of buffer) upstream.send(m);
      buffer.length = 0;
    });
    upstream.addEventListener("message", (ev) => {
      if (client.readyState === client.OPEN) client.send(ev.data);
    });
    upstream.addEventListener("close", (ev) => {
      console.log(`[codex-proxy] (${id}) upstream closed (code=${ev.code})`);
      try {
        client.close(ev.code, ev.reason);
      } catch {}
    });
    upstream.addEventListener("error", (err) => {
      console.error(`[codex-proxy] (${id}) upstream error`, err?.message ?? err);
      try {
        client.close(1011, "upstream error");
      } catch {}
    });

    client.on("message", (data, isBinary) => {
      const payload = isBinary ? data : data.toString("utf8");
      if (upstreamOpen) upstream.send(payload);
      else buffer.push(payload);
    });
    client.on("close", (code, reason) => {
      console.log(`[codex-proxy] (${id}) client closed (code=${code})`);
      try {
        upstream.close(code, reason?.toString());
      } catch {}
    });
    client.on("error", (err) => {
      console.error(`[codex-proxy] (${id}) client error`, err.message);
      try {
        upstream.close(1011, "client error");
      } catch {}
    });
  });
}

let shuttingDown = false;
function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("[codex-proxy] shutting down…");
  if (codexChild && codexChild.exitCode === null) {
    try {
      codexChild.kill("SIGTERM");
    } catch {}
  }
  setTimeout(() => process.exit(code), 200).unref();
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

startCodex();
startProxy();
