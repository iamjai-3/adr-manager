import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile, copyFile, mkdir } from "fs/promises";

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@anthropic-ai/sdk",
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "openai",
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
  "passport",
  "passport-local",
  "pg",
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

  // connect-pg-simple reads table.sql from disk at runtime.
  // Copy it next to the bundled output so it can be found in production.
  await copyFile(
    "node_modules/connect-pg-simple/table.sql",
    "dist/table.sql",
  );
  console.log("copied connect-pg-simple/table.sql → dist/table.sql");

  // ── Vercel serverless bundle ───────────────────────────────────────────────
  // Bundle api/server.ts into a self-contained ESM file so Vercel doesn't
  // need to resolve TypeScript source files or path aliases at runtime.
  console.log("building vercel serverless bundle...");
  await mkdir("api", { recursive: true });
  await esbuild({
    entryPoints: ["server/vercel-handler.ts"],
    platform: "node",
    bundle: true,
    format: "esm",
    outfile: "api/server.js",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    // Inject a CJS compatibility shim so that bundled CommonJS dependencies
    // (express, pg, etc.) can call require() inside an ESM module.
    banner: {
      js: `import{createRequire}from"module";const require=createRequire(import.meta.url);`,
    },
    external: ["pg-native"],
    logLevel: "info",
  });

  // copy table.sql next to the vercel bundle too
  await copyFile(
    "node_modules/connect-pg-simple/table.sql",
    "api/table.sql",
  );
  console.log("copied connect-pg-simple/table.sql → api/table.sql");
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
