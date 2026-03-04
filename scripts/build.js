#!/usr/bin/env node
/**
 * Bundle the server into dist/server.js using esbuild.
 *
 * - Marks playwright and node built-ins as external (not bundled)
 * - Outputs a single ESM file ready to run with `node dist/server.js`
 */
import { build } from "esbuild";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

console.log("[build] Bundling...");

await build({
  entryPoints: [path.join(root, "src/index.js")],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: path.join(root, "dist/server.js"),
  banner: {
    // Required so the ESM bundle can resolve __dirname at runtime
    js: `
import { createRequire } from "module";
import { fileURLToPath as _ftu } from "url";
import { dirname as _dn } from "path";
const __filename = _ftu(import.meta.url);
const __dirname = _dn(__filename);
const require = createRequire(import.meta.url);
`.trimStart(),
  },
  external: [
    // Native / Playwright — must be installed alongside the bundle
    "playwright",
    "playwright-core",
    "fs",
    "path",
    "url",
    "module",
    "os",
    "crypto",
    "events",
    "stream",
    "http",
    "https",
    "net",
    "tls",
    "zlib",
    "util",
    "buffer",
    "child_process",
    "worker_threads",
    "assert",
    "querystring",
    "string_decoder",
    "timers",
    "punycode",
  ],
  logLevel: "info",
});

console.log("[build] Done → dist/server.js");
