import { DEFAULT_SETTINGS, SETTINGS_KEY } from "./constants.js";
import type { Settings } from "./types.js";

export type SettingsValidationError = {
  field: keyof Settings;
  message: string;
};

const WS_URL_RE = /^wss?:\/\/[^\s]+$/i;

export function validateSettings(input: Partial<Settings>): SettingsValidationError[] {
  const errors: SettingsValidationError[] = [];

  if (input.wsUrl !== undefined) {
    if (typeof input.wsUrl !== "string" || !WS_URL_RE.test(input.wsUrl)) {
      errors.push({ field: "wsUrl", message: "wsUrl must start with ws:// or wss://" });
    }
  }

  if (input.targetLang !== undefined) {
    if (typeof input.targetLang !== "string" || input.targetLang.trim().length === 0) {
      errors.push({ field: "targetLang", message: "targetLang must not be empty" });
    }
  }

  if (input.timeoutMs !== undefined) {
    if (
      typeof input.timeoutMs !== "number" ||
      !Number.isFinite(input.timeoutMs) ||
      input.timeoutMs < 5_000 ||
      input.timeoutMs > 600_000
    ) {
      errors.push({
        field: "timeoutMs",
        message: "timeoutMs must be a number between 5000 and 600000",
      });
    }
  }

  if (input.model !== undefined && typeof input.model !== "string") {
    errors.push({
      field: "model",
      message: "model must be a string (use empty string for default)",
    });
  }

  return errors;
}

function coerce(stored: unknown): Settings {
  const merged: Settings = { ...DEFAULT_SETTINGS };
  if (typeof stored !== "object" || stored === null) return merged;
  const obj = stored as Partial<Record<keyof Settings, unknown>>;

  if (typeof obj.wsUrl === "string") merged.wsUrl = obj.wsUrl;
  if (typeof obj.model === "string") merged.model = obj.model;
  if (typeof obj.targetLang === "string" && obj.targetLang.trim().length > 0) {
    merged.targetLang = obj.targetLang;
  }
  if (typeof obj.timeoutMs === "number" && Number.isFinite(obj.timeoutMs)) {
    merged.timeoutMs = obj.timeoutMs;
  }
  return merged;
}

export async function loadSettings(): Promise<Settings> {
  const result = await chrome.storage.sync.get(SETTINGS_KEY);
  return coerce(result[SETTINGS_KEY]);
}

export async function saveSettings(settings: Settings): Promise<void> {
  const errors = validateSettings(settings);
  if (errors.length > 0) {
    throw new Error(errors.map((e) => `${e.field}: ${e.message}`).join("; "));
  }
  await chrome.storage.sync.set({ [SETTINGS_KEY]: settings });
}

export function onSettingsChanged(handler: (settings: Settings) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== "sync") return;
    const change = changes[SETTINGS_KEY];
    if (!change) return;
    handler(coerce(change.newValue));
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
