import { defineConfig } from "deepsec/config";

export default defineConfig({
  projects: [
    { id: "codex-translator-chrome-extension", root: ".." },
    // <deepsec:projects-insert-above>
  ],
});
