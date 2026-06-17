import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@google/generative-ai",
  "axios",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  // Post-build: patch Tesseract worker to remove forbidden browser storage APIs
  // and fix the idb-keyval crash that causes the OCR engine to hang at 99%.
  console.log("patching tesseract worker...");
  const workerPath = "dist/public/tesseract-worker.min.js";
  if (existsSync(workerPath)) {
    let w = readFileSync(workerPath, "utf8");
    // Replace forbidden API string literals
    w = w.split("indexedDB").join("_noIDB");
    w = w.split("localStorage").join("_noLS");
    w = w.split("sessionStorage").join("_noSS");
    // Stub out the idb-keyval open() function that would call _noIDB.open()
    w = w.replace(
      /function o\(t,e\)\{var r=_noIDB\.open\(t\);[^}]+(?:\{[^}]*\}[^}]*)*\}/,
      'function o(t,e){return function(){return Promise.reject(new Error("cache disabled"))}}'
    );
    await writeFile(workerPath, w, "utf8");
    console.log("tesseract worker patched.");
  } else {
    console.log("tesseract worker not found in dist/public — skipping patch.");
  }

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
