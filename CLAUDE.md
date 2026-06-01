# Project: ADR Manager (Architecture Decision Record management platform)

A full-stack web app for creating, managing, reviewing, and versioning Architecture Decision Records (ADRs) with AI-assisted authoring, multi-provider AI support, role-based access control, file attachments, audit logs, and diagram editing.

## Stack

- **Runtime:** Node.js (ESM — `"type": "module"`)
- **Language:** TypeScript 5.6.3
- **Frontend:** React 18 + Vite 7 + Tailwind CSS 3 + shadcn/ui (Radix UI primitives)
- **Backend:** Express 5 + Passport.js (session-based auth)
- **Database:** PostgreSQL via Drizzle ORM 0.39
- **File Storage:** MinIO (S3-compatible)
- **AI Providers:** Anthropic Claude, OpenAI, Google Generative AI
- **Package Manager:** npm (never use pnpm, yarn, or bun)
- **Deployment:** Vercel (vercel.json), Docker Compose available

## Commands

```
dev:        npm run dev         # tsx server/index.ts (with dotenv)
build:      npm run build       # tsx script/build.ts
start:      npm run start       # production (node dist/index.cjs)
typecheck:  npm run check       # tsc
db:push:    npm run db:push     # drizzle-kit push — applies schema to DB
db:seed:    npm run db:seed     # tsx server/seed.ts
```

No test framework is configured. Do not run `npm test`.

## Architecture

```
client/src/         React SPA
  pages/            Route-level page components
  components/       Shared UI components (ui/ = shadcn primitives)
  hooks/            Custom React hooks
  lib/              Utilities (queryClient.ts, utils.ts, sanitize.ts)

server/             Express backend
  index.ts          Entry point
  routes.ts         All API route handlers
  storage.ts        DB access layer (all Drizzle queries)
  auth.ts           Passport.js setup, requireAuth middleware
  audit.ts          Audit logging
  notifications.ts  In-app notification system
  ai/               Multi-provider AI integration
    index.ts        Provider factory + parseAIJson
    providers/      anthropic.ts, openai.ts, google.ts
    types.ts        AI request/response types
  file-storage.ts   MinIO file upload/download

shared/
  schema.ts         Drizzle table definitions + Zod insert schemas (source of truth)
```

## Patterns

- **Shared types live in `shared/schema.ts`** — all table definitions, enums, and Zod insert schemas are here. Import using the `@shared/` alias.
- **All DB queries go through `server/storage.ts`** — route handlers call `storage.*` methods, never query the DB directly in `routes.ts`.
- **Frontend data fetching uses TanStack Query** — no raw `fetch()` calls in components. Use `useQuery` / `useMutation` from `@tanstack/react-query`.
- **UI styling is Tailwind-only** — no inline styles, CSS Modules, or external CSS frameworks. Use `cn()` from `client/src/lib/utils.ts` for conditional classes.
- **shadcn/ui covers all UI components** — use existing primitives in `client/src/components/ui/`. Never install new UI libraries.
- **Server logging uses `server/logger.ts`** — never use `console.log` on the server; use `logger.info`, `logger.error`, etc.
- **Auth middleware pattern:** All protected routes use `requireAuth` from `server/auth.ts`. Project-level routes use `requireProjectAccess(minRole?)`.
- **Input sanitization:** User-generated HTML content must be sanitized with `client/src/lib/sanitize.ts` (DOMPurify) before rendering.
- **AI provider selection:** Always go through `getAIProvider()` in `server/ai/index.ts` — never instantiate provider SDKs directly in routes.
- **Module system is ESM** — always use `import`/`export`, never `require()`.

## Don't

- Never add new UI component libraries — shadcn/Radix covers all UI needs.
- Never modify `shared/schema.ts` without also running `npm run db:push` to keep the database in sync.
- Never store API keys or secrets in source code — use `.env` only (never commit `.env`).
- Never use the `any` type — use `unknown` with type guards, or proper Drizzle/Zod inferred types.
- Never use `console.log` on the server — use `logger` from `server/logger.ts`.
- Never bypass `requireAuth` or `requireProjectAccess` on protected routes.
- Never make direct DB queries in `routes.ts` — all queries go through `server/storage.ts`.
- Never use `require()` — this project is ESM.
- Never call AI provider SDKs directly — use `getAIProvider()` from `server/ai/index.ts`.

## Important Files

- `shared/schema.ts` — Single source of truth for all DB tables, enums, and Zod schemas
- `server/routes.ts` — All API route definitions (~1600 lines — search before adding routes)
- `server/storage.ts` — All database access methods
- `server/auth.ts` — Passport.js config, `requireAuth`, `requireRole`, `hashPassword`
- `server/ai/index.ts` — `getAIProvider()`, `isAIConfigured()`, `parseAIJson()`
- `server/file-storage.ts` — MinIO upload/download helpers
- `client/src/lib/queryClient.ts` — TanStack Query client config + `apiRequest()` helper
- `drizzle.config.ts` — Points to `shared/schema.ts`, outputs to `./migrations`
- `.env` — All secrets and config (DATABASE_URL, SESSION_SECRET, AI keys, MINIO_*)
- `vercel.json` — Vercel deployment config
- `docker-compose.yml` — Local dev infra (PostgreSQL + MinIO)

## Commit Style

Use Conventional Commits: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`, `perf:`

Examples:
- `feat: add AI review panel for ADR draft suggestions`
- `fix: correct role hierarchy check in requireProjectAccess`
- `chore: bump drizzle-orm to 0.40.0`
