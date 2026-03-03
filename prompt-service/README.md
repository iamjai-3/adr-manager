# Prompt Service

A lightweight FastAPI microservice that wraps the [Elsai Prompts SDK](https://core.elsaifoundry.ai/user-guide/elsai-prompts.html) and exposes ADR Manager system prompts as a simple REST API.

## Prerequisites

- [uv](https://docs.astral.sh/uv/) installed (`pip install uv` or `winget install astral-sh.uv`)
- Python 3.11+
- An Elsai Foundry account with prompts registered (see [`prompts-registry.md`](./prompts-registry.md))

## Setup

```bash
# From the prompt-service/ directory
cd prompt-service

# Install dependencies (uv resolves from both PyPI and the Elsai index)
uv sync

# Copy and fill in environment variables
cp .env.example .env
# Edit .env with your ELSAI_API_KEY and other values
```

## Running

```bash
# Development (auto-reload)
uv run python main.py

# Or via uvicorn directly
uv run uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

The service starts on `http://localhost:8000` by default.

## API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check — returns project ID |
| `GET` | `/prompts/{prompt_name}` | Fetch active prompt version by name |
| `DELETE` | `/prompts/{prompt_name}/cache` | Invalidate cache for one prompt |
| `DELETE` | `/prompts/cache` | Invalidate entire prompt cache |

### Example

```bash
curl http://localhost:8000/prompts/adr-generate-draft
# { "name": "adr-generate-draft", "content": "You are an expert software architect..." }
```

Interactive docs: `http://localhost:8000/docs`

## Registered Prompts

See [`prompts-registry.md`](./prompts-registry.md) for the exact text of all 4 prompts to register in the Elsai dashboard.

| Prompt Name | Used by |
|-------------|---------|
| `generateDraft` | `POST /api/ai/generate-draft` |
| `reviewAdr` | `POST /api/ai/review-adr` |
| `suggestAdrs` | `POST /api/ai/suggest-adrs` |
| `search` | `POST /api/ai/search` |

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ELSAI_API_KEY` | Yes | — | Elsai Foundry API key |
| `ELSAI_PROJECT_ID` | Yes | — | Elsai project ID |
| `ELSAI_BASE_URL` | No | `https://core.elsaifoundry.ai` | Elsai API base URL |
| `PORT` | No | `8000` | Port to bind to |
| `CACHE_TTL_SECONDS` | No | `60` | Prompt cache duration in seconds |
