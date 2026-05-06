#!/usr/bin/env node
/**
 * Creates a distributable zip from dist/.
 * Run `pnpm build` first.
 *
 * Output: codex-translator-<version>.zip in the repo root.
 */
import { existsSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DIST = resolve(ROOT, "dist");

if (!existsSync(DIST)) {
  console.error("dist/ not found. Run `pnpm build` first.");
  process.exit(1);
}

const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
const out = join(ROOT, `codex-translator-${pkg.version}.zip`);

// Remove any stale archive (zip otherwise appends to it).
if (existsSync(out)) rmSync(out);

// Use the system `zip` for a deterministic, well-supported archive. Pass an
// absolute output path so it lands at the repo root regardless of cwd.
const result = spawnSync("zip", ["-r", "-9", out, "."], {
  cwd: DIST,
  stdio: "inherit",
});

if (result.status !== 0) {
  console.error("zip failed");
  process.exit(result.status ?? 1);
}

console.info(`[package] wrote ${out}`);
