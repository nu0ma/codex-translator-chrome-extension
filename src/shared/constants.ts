export const CLIENT_INFO = {
  name: "codex-translator-extension",
  title: "Codex Translator",
  version: "0.1.0",
} as const;

export const DEFAULT_SETTINGS = {
  wsUrl: "ws://127.0.0.1:4500",
  model: "",
  targetLang: "Japanese",
  timeoutMs: 60_000,
} as const;

export const SETTINGS_KEY = "codex-translator-settings" as const;

export const MAX_INPUT_CHARS = 8_000;

export const PORT_NAME = "codex-translator-stream" as const;

export const CONTEXT_MENU_ID = "codex-translate-selection" as const;
