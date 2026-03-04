#!/usr/bin/env node
/**
 * Preflight validation — runs before deploy / Docker build.
 *
 * Checks:
 *  1. All required env vars are present (or have defaults)
 *  2. Every jurisdiction in JURISDICTION_ADAPTERS implements the required methods
 *  3. No adapter is using the base-class stub (throws on call)
 *  4. Data output folder is writable
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import JURISDICTION_ADAPTERS from "../config/jurisdictions.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

let passed = 0;
let warned = 0;
let failed = 0;

function ok(msg)   { console.log(`  ✓ ${msg}`); passed++; }
function warn(msg) { console.warn(`  ⚠ ${msg}`); warned++; }
function fail(msg) { console.error(`  ✗ ${msg}`); failed++; }

// Adapters that are fully implemented — stubs in these are hard errors
const FULLY_IMPLEMENTED = new Set(["ee", "pl"]);

// ── 1. Env vars ──────────────────────────────────────────────────────────────
console.log("\n[preflight] 1. Environment variables");

const REQUIRED_ENV = [
  // These all have in-code defaults, but warn if .env is missing entirely
  { key: "PORT",             default: "3000" },
  { key: "BROWSER_HEADLESS", default: "true" },
  { key: "DATA_FOLDER",      default: "../data" },
];

for (const { key, default: def } of REQUIRED_ENV) {
  if (process.env[key]) {
    ok(`${key}=${process.env[key]}`);
  } else {
    ok(`${key} not set — will use default (${def})`);
  }
}

// ── 2. Adapter method coverage ───────────────────────────────────────────────
console.log("\n[preflight] 2. Jurisdiction adapters");

const REQUIRED_METHODS = [
  "extractSearchResults",
  "extractCompanyDetail",
  "extractCompanyResult",
  "extractAutocompleteSuggestions",
];

const REQUIRED_GETTERS = [
  "baseUrl",
  "searchUrl",
  "detailReadySelector",
];

for (const [code, adapter] of Object.entries(JURISDICTION_ADAPTERS)) {
  const name = adapter.constructor.name;

  // Check getters return non-empty strings
  for (const getter of REQUIRED_GETTERS) {
    try {
      const val = adapter[getter];
      if (typeof val === "string" && val.trim()) {
        ok(`[${code}] ${name}.${getter} = "${val}"`);
      } else {
        fail(`[${code}] ${name}.${getter} returned empty or non-string: ${JSON.stringify(val)}`);
      }
    } catch (e) {
      fail(`[${code}] ${name}.${getter} threw: ${e.message}`);
    }
  }

  // Check methods exist and are functions (not just inherited stubs)
  for (const method of REQUIRED_METHODS) {
    if (typeof adapter[method] !== "function") {
      fail(`[${code}] ${name}.${method} is not a function`);
      continue;
    }

    // Check it's overridden — base stubs throw "not implemented"
    // We detect this by checking if the method is own or inherited from base
    const proto = Object.getPrototypeOf(adapter);
    const isOwn = Object.prototype.hasOwnProperty.call(proto, method);

    if (isOwn) {
      ok(`[${code}] ${name}.${method} — implemented`);
    } else if (FULLY_IMPLEMENTED.has(code)) {
      fail(`[${code}] ${name}.${method} — NOT overridden (using base stub)`);
    } else {
      warn(`[${code}] ${name}.${method} — stub (TODO)`);
    }
  }
}

// ── 3. Selectors sanity check ─────────────────────────────────────────────────
console.log("\n[preflight] 3. Selectors");

for (const [code, adapter] of Object.entries(JURISDICTION_ADAPTERS)) {
  const { selectors } = adapter;
  if (selectors?.searchInput && selectors?.searchButton) {
    ok(`[${code}] searchInput="${selectors.searchInput}", searchButton="${selectors.searchButton}"`);
  } else {
    fail(`[${code}] Missing searchInput or searchButton selector`);
  }
}

// ── 4. Data folder writable ───────────────────────────────────────────────────
console.log("\n[preflight] 4. Data folder");

const dataFolder = process.env.DATA_FOLDER || path.join(root, "../data");
const resolvedData = path.resolve(root, dataFolder);

try {
  fs.mkdirSync(resolvedData, { recursive: true });
  const testFile = path.join(resolvedData, ".preflight-write-test");
  fs.writeFileSync(testFile, "ok");
  fs.unlinkSync(testFile);
  ok(`Data folder writable: ${resolvedData}`);
} catch (e) {
  fail(`Data folder not writable (${resolvedData}): ${e.message}`);
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n[preflight] ${passed} passed, ${warned} warnings, ${failed} failed\n`);

if (warned > 0) {
  console.warn(`[preflight] Warnings indicate stub adapters not yet implemented. These jurisdictions will throw at runtime if called.\n`);
}

if (failed > 0) {
  process.exit(1);
}
