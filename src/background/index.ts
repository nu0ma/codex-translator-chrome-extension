import { CONTEXT_MENU_ID, MAX_INPUT_CHARS, PORT_NAME } from "../shared/constants.js";
import { log } from "../shared/logger.js";
import type { PortRequest, PortResponse, RuntimeMessage } from "../shared/messages.js";
import { loadSettings } from "../shared/settings.js";
import { CodexError, translateOnce } from "./codex-client.js";

const logger = log.child("background");

interface InFlight {
  controller: AbortController;
  port: chrome.runtime.Port;
  requestId: string;
}

const inflightByPort = new WeakMap<chrome.runtime.Port, InFlight>();

function postSafe(port: chrome.runtime.Port, msg: PortResponse): void {
  try {
    port.postMessage(msg);
  } catch (err) {
    logger.debug("postMessage failed (port likely disconnected)", err);
  }
}

async function handleStart(
  port: chrome.runtime.Port,
  requestId: string,
  text: string,
): Promise<void> {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    postSafe(port, { type: "error", requestId, message: "Empty selection" });
    return;
  }
  if (trimmed.length > MAX_INPUT_CHARS) {
    postSafe(port, {
      type: "error",
      requestId,
      message: `Selection is too long (${trimmed.length} chars; limit is ${MAX_INPUT_CHARS}).`,
    });
    return;
  }

  // Cancel any in-flight on this port; the user just superseded it.
  const previous = inflightByPort.get(port);
  if (previous) previous.controller.abort();

  const controller = new AbortController();
  inflightByPort.set(port, { controller, port, requestId });

  try {
    const settings = await loadSettings();
    const finalText = await translateOnce({
      text: trimmed,
      url: settings.wsUrl,
      model: settings.model,
      targetLang: settings.targetLang,
      timeoutMs: settings.timeoutMs,
      signal: controller.signal,
      onDelta: (chunk) => postSafe(port, { type: "delta", requestId, text: chunk }),
    });
    if (controller.signal.aborted) {
      postSafe(port, { type: "cancelled", requestId });
      return;
    }
    postSafe(port, { type: "done", requestId, text: finalText });
  } catch (err) {
    if (controller.signal.aborted) {
      postSafe(port, { type: "cancelled", requestId });
      return;
    }
    const message =
      err instanceof CodexError ? err.message : err instanceof Error ? err.message : String(err);
    logger.error("translation failed", err);
    postSafe(port, { type: "error", requestId, message });
  } finally {
    if (inflightByPort.get(port)?.requestId === requestId) {
      inflightByPort.delete(port);
    }
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_NAME) return;
  logger.debug("port connected");

  port.onMessage.addListener((raw: PortRequest) => {
    if (raw.type === "start") {
      void handleStart(port, raw.requestId, raw.text);
    } else if (raw.type === "cancel") {
      const current = inflightByPort.get(port);
      if (current && current.requestId === raw.requestId) {
        current.controller.abort();
      }
    }
  });

  port.onDisconnect.addListener(() => {
    const current = inflightByPort.get(port);
    if (current) current.controller.abort();
    inflightByPort.delete(port);
    logger.debug("port disconnected");
  });
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create(
    {
      id: CONTEXT_MENU_ID,
      title: "Translate with Codex",
      contexts: ["selection"],
    },
    () => {
      const err = chrome.runtime.lastError;
      if (err) logger.warn("contextMenus.create reported", err.message);
    },
  );
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID || !tab?.id) return;
  const text = info.selectionText ?? "";
  const message: RuntimeMessage = { type: "context-menu-translate", text };
  chrome.tabs.sendMessage(tab.id, message).catch((err) => {
    logger.warn("Could not deliver context-menu message", err);
  });
});

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage().catch((err) => logger.warn("openOptionsPage failed", err));
});
