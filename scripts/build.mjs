#!/usr/bin/env node
/**
 * Bundles the extension with esbuild and copies static assets to dist/.
 *
 * Entry points:
 *   - src/background/index.ts → dist/background.js (service worker, ESM)
 *   - src/content/index.ts    → dist/content.js    (IIFE; runs in page world)
 *   - src/options/index.ts    → dist/options.js    (ESM; loaded by options.html)
 *
 * Static files copied verbatim from public/: manifest.json, *.html, *.css.
 *
 * Pass --watch to keep rebuilding on file changes.
 */

import { context, build } from "esbuild";
import { cp, mkdir, readdir, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUT = resolve(ROOT, "dist");
const PUBLIC = resolve(ROOT, "public");

const watch = process.argv.includes("--watch");
const dev = watch || process.env.NODE_ENV === "development";

const sharedOptions = {
  bundle: true,
  sourcemap: dev ? "linked" : false,
  minify: !dev,
  target: ["chrome120"],
  logLevel: "info",
  define: {
    __DEV__: JSON.stringify(dev),
  },
  legalComments: "none",
};

const buildConfigs = [
  {
    name: "background",
    options: {
      ...sharedOptions,
      entryPoints: [resolve(ROOT, "src/background/index.ts")],
      outfile: resolve(OUT, "background.js"),
      format: "esm",
      platform: "browser",
    },
  },
  {
    name: "content",
    options: {
      ...sharedOptions,
      entryPoints: [resolve(ROOT, "src/content/index.ts")],
      outfile: resolve(OUT, "content.js"),
      format: "iife",
      platform: "browser",
    },
  },
  {
    name: "options",
    options: {
      ...sharedOptions,
      entryPoints: [resolve(ROOT, "src/options/index.ts")],
      outfile: resolve(OUT, "options.js"),
      format: "esm",
      platform: "browser",
    },
  },
];

async function copyStatic() {
  await mkdir(OUT, { recursive: true });
  if (!existsSync(PUBLIC)) return;
  const entries = await readdir(PUBLIC);
  for (const name of entries) {
    const src = join(PUBLIC, name);
    const dest = join(OUT, name);
    const st = await stat(src);
    if (st.isDirectory()) {
      await cp(src, dest, { recursive: true });
    } else {
      await cp(src, dest);
    }
  }
}

async function clean() {
  await rm(OUT, { recursive: true, force: true });
}

async function main() {
  await clean();
  await copyStatic();

  if (watch) {
    const ctxs = await Promise.all(buildConfigs.map((c) => context(c.options)));
    await Promise.all(ctxs.map((c) => c.watch()));
    console.info("[build] watching for changes…");
  } else {
    await Promise.all(buildConfigs.map((c) => build(c.options)));
    console.info(`[build] wrote ${OUT}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
