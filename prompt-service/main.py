import os
import time
import logging
from contextlib import asynccontextmanager
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from elsai_prompts.prompt_manager import PromptManager

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

ELSAI_API_KEY = os.environ["ELSAI_API_KEY"]
ELSAI_PROJECT_ID = os.environ["ELSAI_PROJECT_ID"]
ELSAI_BASE_URL = os.environ.get("ELSAI_BASE_URL", "https://core.elsaifoundry.ai")
CACHE_TTL = int(os.environ.get("CACHE_TTL_SECONDS", "60"))

_prompt_manager: PromptManager | None = None

# Simple in-memory TTL cache: { prompt_name: (content, expires_at) }
_cache: dict[str, tuple[str, float]] = {}


def get_prompt_manager() -> PromptManager:
    global _prompt_manager
    if _prompt_manager is None:
        _prompt_manager = PromptManager(
            api_key=ELSAI_API_KEY,
            project_id=ELSAI_PROJECT_ID,
            base_url=ELSAI_BASE_URL,
        )
    return _prompt_manager


@asynccontextmanager
async def lifespan(app: FastAPI) -> Any:
    logger.info("Prompt service starting — project_id=%s base_url=%s", ELSAI_PROJECT_ID, ELSAI_BASE_URL)
    get_prompt_manager()
    logger.info("PromptManager initialised successfully")
    yield
    logger.info("Prompt service shutting down")


app = FastAPI(
    title="ADR Manager Prompt Service",
    description="Serves system prompts from Elsai Prompt Manager for the ADR Manager application",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "project_id": ELSAI_PROJECT_ID}


@app.get("/prompts/{prompt_name}")
def get_prompt(prompt_name: str) -> dict[str, str]:
    """
    Return the active version of a named prompt from Elsai Prompt Manager.
    Results are cached in-memory for CACHE_TTL seconds to reduce remote calls.
    """
    now = time.monotonic()
    cached = _cache.get(prompt_name)
    if cached and now < cached[1]:
        logger.debug("Cache hit for prompt '%s'", prompt_name)
        return {"name": prompt_name, "content": cached[0]}

    try:
        manager = get_prompt_manager()
        content = manager.get_active_prompt_version(prompt_name=prompt_name)
        if content is None:
            raise HTTPException(status_code=404, detail=f"Prompt '{prompt_name}' not found")
        _cache[prompt_name] = (content, now + CACHE_TTL)
        logger.info("Fetched prompt '%s' from Elsai (cached for %ds)", prompt_name, CACHE_TTL)
        return {"name": prompt_name, "content": content}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Failed to fetch prompt '%s': %s", prompt_name, exc)
        raise HTTPException(status_code=502, detail=f"Failed to retrieve prompt '{prompt_name}': {exc}") from exc


@app.delete("/prompts/{prompt_name}/cache")
def invalidate_cache(prompt_name: str) -> dict[str, str]:
    """Evict a single prompt from the local cache so the next request re-fetches from Elsai."""
    _cache.pop(prompt_name, None)
    return {"message": f"Cache cleared for '{prompt_name}'"}


@app.delete("/prompts/cache")
def invalidate_all_cache() -> dict[str, str]:
    """Evict all prompts from the local cache."""
    _cache.clear()
    return {"message": "All prompt caches cleared"}


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
