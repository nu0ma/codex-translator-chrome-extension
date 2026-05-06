import { DEFAULT_SETTINGS } from "../shared/constants.js";
import { loadSettings, saveSettings, validateSettings } from "../shared/settings.js";
import type { Settings } from "../shared/types.js";

const FIELDS = ["wsUrl", "model", "targetLang", "timeoutMs"] as const;

function $<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element #${id} missing`);
  return el as T;
}

function setStatus(msg: string, kind: "info" | "error" = "info"): void {
  const el = $<HTMLSpanElement>("status");
  el.textContent = msg;
  el.dataset.kind = kind;
  if (msg.length === 0) return;
  setTimeout(() => {
    if (el.textContent === msg) {
      el.textContent = "";
      delete el.dataset.kind;
    }
  }, 2_500);
}

function readForm(): Settings {
  return {
    wsUrl: $<HTMLInputElement>("wsUrl").value.trim(),
    model: $<HTMLInputElement>("model").value.trim(),
    targetLang: $<HTMLInputElement>("targetLang").value.trim(),
    timeoutMs: Number($<HTMLInputElement>("timeoutMs").value),
  };
}

function writeForm(values: Settings): void {
  $<HTMLInputElement>("wsUrl").value = values.wsUrl;
  $<HTMLInputElement>("model").value = values.model;
  $<HTMLInputElement>("targetLang").value = values.targetLang;
  $<HTMLInputElement>("timeoutMs").value = String(values.timeoutMs);
}

async function onSave(): Promise<void> {
  const candidate = readForm();
  const errors = validateSettings(candidate);
  if (errors.length > 0) {
    setStatus(errors.map((e) => `${e.field}: ${e.message}`).join(" / "), "error");
    return;
  }
  try {
    await saveSettings(candidate);
    setStatus("Saved.");
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err), "error");
  }
}

async function onReset(): Promise<void> {
  await saveSettings({ ...DEFAULT_SETTINGS });
  writeForm({ ...DEFAULT_SETTINGS });
  setStatus("Reset to defaults.");
}

async function init(): Promise<void> {
  for (const f of FIELDS) {
    const el = document.getElementById(f);
    if (!el) throw new Error(`Field #${f} missing`);
  }
  writeForm(await loadSettings());
  $<HTMLButtonElement>("save").addEventListener("click", () => {
    void onSave();
  });
  $<HTMLButtonElement>("reset").addEventListener("click", () => {
    void onReset();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  void init();
});
