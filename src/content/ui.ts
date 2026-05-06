/**
 * Lightweight DOM UI for the floating translate button and the streaming
 * result card. No external dependencies; CSS lives in `public/content.css`
 * and is injected by the manifest.
 */

const BUTTON_ID = "codex-translator-button";
const CARD_ID = "codex-translator-card";

export interface CardController {
  setLoading(): void;
  setError(message: string): void;
  appendText(chunk: string): void;
  finalize(text: string): void;
  setCancelled(): void;
  close(): void;
  onCancel(handler: () => void): void;
}

export function showButton(rect: DOMRect, onClick: () => void): void {
  removeButton();
  const btn = document.createElement("button");
  btn.id = BUTTON_ID;
  btn.type = "button";
  btn.textContent = "Translate";
  btn.title = "Translate selection with Codex";

  const top = window.scrollY + rect.bottom + 6;
  const left = window.scrollX + rect.right - 80;
  btn.style.top = `${Math.max(0, top)}px`;
  btn.style.left = `${Math.max(0, left)}px`;

  // Prevent the click from collapsing the page selection.
  btn.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });

  document.documentElement.appendChild(btn);
}

export function removeButton(): void {
  document.getElementById(BUTTON_ID)?.remove();
}

export function showCard(rect: DOMRect | null): CardController {
  removeCard();

  const card = document.createElement("div");
  card.id = CARD_ID;
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-live", "polite");

  if (rect) {
    const top = window.scrollY + rect.bottom + 6;
    const left = window.scrollX + Math.max(0, rect.left);
    card.style.top = `${Math.max(0, top)}px`;
    card.style.left = `${Math.max(0, left)}px`;
  } else {
    card.style.top = `${window.scrollY + 80}px`;
    card.style.left = `${window.scrollX + 80}px`;
  }

  const header = document.createElement("div");
  header.className = "codex-tr-card-header";

  const title = document.createElement("span");
  title.textContent = "Codex Translator";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "codex-tr-card-cancel";
  cancelBtn.textContent = "Cancel";
  cancelBtn.title = "Cancel translation";

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "codex-tr-card-close";
  closeBtn.textContent = "×";
  closeBtn.title = "Close";
  closeBtn.addEventListener("click", () => removeCard());

  header.appendChild(title);
  header.appendChild(cancelBtn);
  header.appendChild(closeBtn);

  const body = document.createElement("div");
  body.className = "codex-tr-card-body codex-tr-loading";
  body.textContent = "Translating…";

  card.appendChild(header);
  card.appendChild(body);
  document.documentElement.appendChild(card);

  let cancelHandler: (() => void) | null = null;
  let streaming = false;

  cancelBtn.addEventListener("click", () => {
    cancelHandler?.();
  });

  return {
    setLoading() {
      body.classList.remove("codex-tr-error", "codex-tr-final");
      body.classList.add("codex-tr-loading");
      body.textContent = "Translating…";
      cancelBtn.style.display = "";
    },
    appendText(chunk) {
      if (!streaming) {
        body.textContent = "";
        body.classList.remove("codex-tr-loading", "codex-tr-error");
        streaming = true;
      }
      body.append(chunk);
    },
    finalize(text) {
      body.classList.remove("codex-tr-loading", "codex-tr-error");
      body.classList.add("codex-tr-final");
      body.textContent = text;
      cancelBtn.style.display = "none";
    },
    setError(message) {
      body.classList.remove("codex-tr-loading", "codex-tr-final");
      body.classList.add("codex-tr-error");
      body.textContent = message;
      cancelBtn.style.display = "none";
    },
    setCancelled() {
      body.classList.remove("codex-tr-loading", "codex-tr-final");
      body.classList.add("codex-tr-error");
      body.textContent = "Cancelled.";
      cancelBtn.style.display = "none";
    },
    close() {
      removeCard();
    },
    onCancel(handler) {
      cancelHandler = handler;
    },
  };
}

export function removeCard(): void {
  document.getElementById(CARD_ID)?.remove();
}

export function isOurElement(node: EventTarget | null): boolean {
  if (!(node instanceof Element)) return false;
  if (node.id === BUTTON_ID) return true;
  return node.closest(`#${BUTTON_ID}, #${CARD_ID}`) !== null;
}
