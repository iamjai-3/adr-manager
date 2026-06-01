# Deploy Skill — ADR Manager

Automates the deployment workflow for ADR Manager to Vercel.

## When to Use

Use this skill when the user asks to:
- Deploy to Vercel (production or preview)
- Check deployment status
- Roll back a deployment
- Manage environment variables on Vercel
- Troubleshoot a failed deployment

---

## Deployment Overview

ADR Manager deploys to **Vercel** using the configuration in `vercel.json`.

The app is a full-stack Express + React app. The Express server runs as a Vercel serverless function via `server/vercel-handler.ts`.

Key files:
- `vercel.json` — Vercel routing and build config
- `server/vercel-handler.ts` — Serverless function entry point
- `script/build.ts` — Build script (`npm run build`)

---

## Pre-Deployment Checklist

Before deploying, verify:

1. **TypeScript compiles cleanly:**
   ```bash
   npm run check
   ```

2. **Build succeeds locally:**
   ```bash
   npm run build
   ```

3. **All required env vars are set on Vercel:**
   ```
   DATABASE_URL
   SESSION_SECRET
   AI_PROVIDER
   ANTHROPIC_API_KEY / OPENAI_API_KEY / GOOGLE_AI_API_KEY
   MINIO_ENDPOINT
   MINIO_ACCESS_KEY
   MINIO_SECRET_KEY
   MINIO_BUCKET
   NODE_ENV=production
   ```

4. **Database is migrated:**
   - Vercel does not run `db:push` automatically
   - Run `npm run db:push` manually against the production DB before deploying breaking schema changes

---

## Deploy to Vercel

### Using Vercel CLI

```bash
# Install Vercel CLI (if not installed)
npm i -g vercel

# Deploy to preview
vercel

# Deploy to production
vercel --prod
```

### Using GitHub Integration

If the repo is connected to Vercel:
- Push to `main` → automatic production deployment
- Push to any other branch → preview deployment

### Check Deployment Status

```bash
vercel ls              # List recent deployments
vercel inspect <url>   # Inspect a specific deployment
```

---

## Rollback

```bash
vercel rollback        # Roll back to previous deployment
```

---

## Troubleshooting

### Build fails on Vercel

1. Check build logs in the Vercel dashboard
2. Reproduce locally: `npm run build`
3. Check for TypeScript errors: `npm run check`
4. Verify all dependencies are in `dependencies` (not `devDependencies`) if needed at runtime

### "DATABASE_URL must be set" error

- The env var is missing on Vercel — add it via `vercel env add DATABASE_URL`

### Static assets not found

- Check `vercel.json` routes — the SPA fallback should serve `index.html` for all unmatched routes

### AI not working in production

- Verify `AI_PROVIDER` env var matches one of: `anthropic`, `openai`, `google`
- Verify the corresponding API key env var is set

---

## Environment Variables Management

```bash
# List all env vars
vercel env ls

# Add an env var (prompts for value)
vercel env add DATABASE_URL production

# Pull env vars to local .env
vercel env pull .env.local
```
