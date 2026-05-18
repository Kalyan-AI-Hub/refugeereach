import os
import time
import json
import logging
import base64
import httpx
from typing import Optional, List

OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
MODEL_NAME = os.getenv("MODEL_NAME", "gemma4:e4b")

logger = logging.getLogger("refugeereach.gemma4")


def _log_call(call_type: str, latency_ms: int, response: dict, tools: Optional[List] = None, trace_id: Optional[str] = None):
    message = response.get("message", {})
    tool_calls = message.get("tool_calls", [])
    logger.info(json.dumps({
        "event": "gemma4_call",
        "trace_id": trace_id,
        "call_type": call_type,          # "text" | "vision" | "text_with_tools"
        "model": MODEL_NAME,
        "latency_ms": latency_ms,
        "has_tools": tools is not None,
        "tool_calls": [c.get("function", {}).get("name") for c in tool_calls],
        "reply_chars": len(message.get("content", "") or ""),
        "done_reason": response.get("done_reason"),
        "eval_count": response.get("eval_count"),       # tokens generated
        "prompt_eval_count": response.get("prompt_eval_count"),  # prompt tokens
    }))


async def chat(
    messages: List[dict],
    tools: Optional[List[dict]] = None,
    trace_id: Optional[str] = None,
    json_mode: bool = False,
) -> dict:
    payload = {"model": MODEL_NAME, "messages": messages, "stream": False}
    if tools:
        payload["tools"] = tools
    if json_mode:
        payload["format"] = "json"   # forces Gemma 4 to return valid JSON — eliminates _strip_fences
    call_type = "text_with_tools" if tools else "text"
    t0 = time.monotonic()
    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(f"{OLLAMA_HOST}/api/chat", json=payload)
        response.raise_for_status()
    result = response.json()
    _log_call(call_type, round((time.monotonic() - t0) * 1000), result, tools, trace_id)
    return result


async def chat_with_image(
    prompt: str,
    image_bytes: bytes,
    tools: Optional[List[dict]] = None,
    trace_id: Optional[str] = None,
    json_mode: bool = False,
) -> dict:
    image_b64 = base64.b64encode(image_bytes).decode("utf-8")
    messages = [{"role": "user", "content": prompt, "images": [image_b64]}]
    t0 = time.monotonic()
    payload = {"model": MODEL_NAME, "messages": messages, "stream": False}
    if tools:
        payload["tools"] = tools
    if json_mode:
        payload["format"] = "json"
    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(f"{OLLAMA_HOST}/api/chat", json=payload)
        response.raise_for_status()
    result = response.json()
    _log_call("vision", round((time.monotonic() - t0) * 1000), result, tools, trace_id)
    return result


async def is_model_available() -> bool:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(f"{OLLAMA_HOST}/api/tags")
            models = [m["name"] for m in r.json().get("models", [])]
            return any(MODEL_NAME in m for m in models)
    except Exception:
        return False
