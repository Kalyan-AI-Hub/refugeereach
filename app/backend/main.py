import os
import time
import uuid
import logging
import json
import traceback
from dotenv import load_dotenv
load_dotenv()
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from db.database import init_db
from routes import cases, documents, intake, medical, skills, export

# ── Structured JSON logging ───────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(message)s",   # JSON lines — each log entry is a self-contained JSON object
)
logger = logging.getLogger("refugeereach")


app = FastAPI(title="RefugeeReach API", version="0.1.0")


# ── Request tracing middleware ────────────────────────────────────────────────
@app.middleware("http")
async def trace_middleware(request: Request, call_next):
    trace_id = str(uuid.uuid4())[:8]
    request.state.trace_id = trace_id
    t0 = time.monotonic()
    response = await call_next(request)
    elapsed_ms = round((time.monotonic() - t0) * 1000)
    logger.info(json.dumps({
        "event": "http_request",
        "trace_id": trace_id,
        "method": request.method,
        "path": request.url.path,
        "status": response.status_code,
        "latency_ms": elapsed_ms,
    }))
    return response


# ── Safe exception handler — never expose tracebacks or file paths to clients ─
@app.exception_handler(Exception)
async def safe_exception_handler(request: Request, exc: Exception):
    trace_id = getattr(request.state, "trace_id", "unknown")
    logger.error(json.dumps({
        "event": "unhandled_exception",
        "trace_id": trace_id,
        "path": request.url.path,
        "error_type": type(exc).__name__,
        "detail": traceback.format_exc(),   # logged server-side only
    }))
    return JSONResponse(
        status_code=500,
        content={"error": "An internal error occurred.", "trace_id": trace_id},
    )


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(cases.router, prefix="/api/cases", tags=["cases"])
app.include_router(documents.router, prefix="/api/documents", tags=["documents"])
app.include_router(intake.router, prefix="/api/intake", tags=["intake"])
app.include_router(medical.router, prefix="/api/medical", tags=["medical"])
app.include_router(skills.router, prefix="/api/skills", tags=["skills"])
app.include_router(export.router, prefix="/api/export", tags=["export"])


@app.on_event("startup")
async def startup():
    await init_db()
    logger.info(json.dumps({"event": "startup", "model": os.getenv("MODEL_NAME", "gemma4:e4b")}))


@app.get("/health")
async def health():
    return {"status": "ok", "model": os.getenv("MODEL_NAME", "gemma4:e4b")}
