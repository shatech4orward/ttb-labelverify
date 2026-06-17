/**
 * patch-worker.cjs
 *
 * Post-build script that patches the Tesseract.js worker bundle to:
 * 1. Replace forbidden browser storage APIs (indexedDB, localStorage, sessionStorage)
 *    with null-safe aliases — required for the hosted preview sandbox.
 * 2. Replace the idb-keyval open() function with a safe no-op stub that
 *    returns a rejected promise — prevents "Cannot read properties of null"
 *    crash that caused the OCR worker to hang at "initializing api" 99%.
 *
 * Run automatically after `npm run build` via the "postbuild" script in package.json.
 */

const fs = require("fs");
const path = require("path");

const DIST_WORKER = path.join(__dirname, "../dist/public/tesseract-worker.min.js");

if (!fs.existsSync(DIST_WORKER)) {
  console.log("[patch-worker] Worker not found at", DIST_WORKER, "— skipping.");
  process.exit(0);
}

let content = fs.readFileSync(DIST_WORKER, "utf8");
const original = content;

// Step 1: Replace forbidden API strings
const apiReplacements = [
  ["indexedDB",    "_noIDB"],
  ["localStorage", "_noLS"],
  ["sessionStorage", "_noSS"],
];
for (const [from, to] of apiReplacements) {
  content = content.split(from).join(to);
}

// Step 2: Replace the idb-keyval open() function with a safe no-op.
// The original: function o(t,e){var r=_noIDB.open(t); ... }
// Replacement: always returns a function that returns a rejected promise,
// so any cache lookup misses immediately and Tesseract continues without cache.
const IDB_OPEN_PATTERN = /function o\(t,e\)\{var r=_noIDB\.open\(t\);[^}]+(?:\{[^}]*\}[^}]*)*\}/;
const IDB_OPEN_STUB    = 'function o(t,e){return function(){return Promise.reject(new Error("cache disabled"))}}';

if (IDB_OPEN_PATTERN.test(content)) {
  content = content.replace(IDB_OPEN_PATTERN, IDB_OPEN_STUB);
  console.log("[patch-worker] ✓ Replaced idb-keyval open() with safe no-op stub.");
} else if (content.includes("_noIDB.open")) {
  // Fallback: exact string replacement
  content = content.replace(
    'var r=_noIDB.open(t);r.onupgradeneeded=function(){return r.result.createObjectStore(e)};var n=i(r);return function(t,r){return n.then((function(n){return r(n.transaction(e,t).objectStore(e))}))}',
    'return function(){return Promise.reject(new Error("cache disabled"))}'
  );
  console.log("[patch-worker] ✓ Applied fallback idb stub patch.");
} else {
  console.log("[patch-worker] idb-keyval open() already patched or not found — OK.");
}

if (content !== original) {
  fs.writeFileSync(DIST_WORKER, content, "utf8");
  console.log("[patch-worker] ✓ Worker patched and saved.");
} else {
  console.log("[patch-worker] No changes needed.");
}
