import os
import sys
import time
import signal
import logging
import subprocess
from contextlib import asynccontextmanager
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from elsai_prompts.prompt_manager import PromptManager

load_dotenv(override=True)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

ELSAI_PROMPT_API_KEY = os.environ["ELSAI_PROMPT_API_KEY"]
PROJECT_ID = os.environ["PROJECT_ID"]
CACHE_TTL = int(os.environ.get("CACHE_TTL_SECONDS", "60"))
PORT = int(os.environ.get("PORT", "8000"))

_cache: dict[str, tuple[str, float]] = {}

prompt_manager = PromptManager(
    api_key=ELSAI_PROMPT_API_KEY,
    project_id=PROJECT_ID,
)


def _kill_port(port: int) -> None:
    """Kill any process already listening on the given port (Windows only)."""
    if sys.platform != "win32":
        return
    try:
        result = subprocess.run(
            ["netstat", "-ano"],
            capture_output=True, text=True, timeout=5,
        )
        my_pid = os.getpid()
        for line in result.stdout.splitlines():
            if f":{port}" in line and "LISTENING" in line:
                pid = int(line.strip().split()[-1])
                if pid != my_pid and pid != 0:
                    logger.info("Killing stale process %d on port %d", pid, port)
                    subprocess.run(["taskkill", "/F", "/PID", str(pid)],
                                   capture_output=True, timeout=5)
    except Exception as exc:
        logger.warning("Could not clean port %d: %s", port, exc)


@asynccontextmanager
async def lifespan(app: FastAPI) -> Any:
    logger.info("Prompt service ready (SaaS) — project_id=%s", PROJECT_ID)
    yield
    logger.info("Prompt service shutting down")


app = FastAPI(title="ADR Manager Prompt Service", version="0.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"], allow_headers=["*"])


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "project_id": PROJECT_ID}


@app.get("/prompts/{prompt_name}")
def get_prompt(prompt_name: str) -> dict[str, str]:
    now = time.monotonic()
    cached = _cache.get(prompt_name)
    if cached and now < cached[1]:
        return {"name": prompt_name, "content": cached[0]}

    try:
        response = prompt_manager.get_active_prompt_version(prompt_name=prompt_name)
    except Exception as exc:
        logger.error("Error fetching prompt '%s': %s", prompt_name, exc)
        raise HTTPException(status_code=502, detail=f"Elsai error for '{prompt_name}': {exc}") from exc

    if not response:
        raise HTTPException(status_code=404, detail=f"Prompt '{prompt_name}' not found")

    # SaaS version returns the prompt text as a plain string directly
    content: str = response

    _cache[prompt_name] = (content, now + CACHE_TTL)
    logger.info("Fetched prompt '%s' from Elsai SaaS (cached %ds)", prompt_name, CACHE_TTL)
    return {"name": prompt_name, "content": content}


@app.delete("/prompts/{prompt_name}/cache")
def bust_one(prompt_name: str) -> dict[str, str]:
    _cache.pop(prompt_name, None)
    return {"message": f"Cache cleared for '{prompt_name}'"}


@app.delete("/prompts/cache")
def bust_all() -> dict[str, str]:
    _cache.clear()
    return {"message": "All caches cleared"}


if __name__ == "__main__":
    import uvicorn

    _kill_port(PORT)

    server = uvicorn.Server(uvicorn.Config(
        "main:app", host="0.0.0.0", port=PORT,
        reload=os.environ.get("DEV", "").lower() in ("1", "true"),
    ))

    def _shutdown(sig: int, _frame: Any) -> None:
        logger.info("Received signal %s — shutting down", signal.Signals(sig).name)
        server.should_exit = True

    signal.signal(signal.SIGINT, _shutdown)
    signal.signal(signal.SIGTERM, _shutdown)

    server.run()
