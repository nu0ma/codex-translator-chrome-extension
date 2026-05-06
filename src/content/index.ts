import { PORT_NAME } from "../shared/constants.js";
import { log } from "../shared/logger.js";
import type { PortRequest, PortResponse, RuntimeMessage } from "../shared/messages.js";
import { captureSelection, type SelectionInfo } from "./selection.js";
import {
  isOurElement,
  removeButton,
  removeCard,
  showButton,
  showCard,
  type CardController,
} from "./ui.js";

const logger = log.child("content");

let lastSelection: SelectionInfo | null = null;
let activeCard: CardController | null = null;
let activeRequestId: string | null = null;
let port: chrome.runtime.Port | null = null;

function ensurePort(): chrome.runtime.Port {
  if (port !== null) return port;
  const p = chrome.runtime.connect({ name: PORT_NAME });
  p.onMessage.addListener((msg: PortResponse) => {
    if (msg.requestId !== activeRequestId) return;
    if (!activeCard) return;
    switch (msg.type) {
      case "delta":
        activeCard.appendText(msg.text);
        break;
      case "done":
        activeCard.finalize(msg.text);
        activeRequestId = null;
        break;
      case "error":
        activeCard.setError(msg.message);
        activeRequestId = null;
        break;
      case "cancelled":
        activeCard.setCancelled();
        activeRequestId = null;
        break;
    }
  });
  p.onDisconnect.addListener(() => {
    port = null;
    if (activeCard !== null && activeRequestId !== null) {
      activeCard.setError("Background worker disconnected. Try again.");
      activeRequestId = null;
    }
  });
  port = p;
  return p;
}

function newRequestId(): string {
  const rand = crypto.getRandomValues(new Uint32Array(2));
  return `${Date.now().toString(36)}-${rand[0]!.toString(36)}${rand[1]!.toString(36)}`;
}

function startTranslation(text: string, rect: DOMRect | null): void {
  // Cancel previous in-flight (the background also dedupes per-port).
  if (activeRequestId !== null && port) {
    const cancel: PortRequest = { type: "cancel", requestId: activeRequestId };
    port.postMessage(cancel);
  }

  const card = showCard(rect);
  activeCard = card;
  const requestId = newRequestId();
  activeRequestId = requestId;

  card.onCancel(() => {
    if (activeRequestId !== requestId || !port) return;
    const cancel: PortRequest = { type: "cancel", requestId };
    port.postMessage(cancel);
  });

  try {
    const p = ensurePort();
    const start: PortRequest = { type: "start", text, requestId };
    p.postMessage(start);
  } catch (err) {
    logger.error("failed to send start request", err);
    card.setError(err instanceof Error ? err.message : String(err));
    activeRequestId = null;
  }
}

document.addEventListener("mouseup", () => {
  // Defer so the browser finalizes the selection.
  setTimeout(() => {
    const info = captureSelection();
    if (!info) {
      removeButton();
      return;
    }
    lastSelection = info;
    showButton(info.rect, () => {
      removeButton();
      startTranslation(info.text, info.rect);
    });
  }, 0);
});

document.addEventListener("mousedown", (e) => {
  if (isOurElement(e.target)) return;
  removeButton();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    removeButton();
    removeCard();
    activeCard = null;
  }
});

chrome.runtime.onMessage.addListener((raw: RuntimeMessage) => {
  if (raw.type === "context-menu-translate") {
    const text = raw.text.trim();
    if (text.length === 0) return;
    const rect = lastSelection?.rect ?? null;
    startTranslation(text, rect);
  }
});
