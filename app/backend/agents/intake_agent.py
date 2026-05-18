"""
Intake agent: Gemma 4 as a tool-calling planner.

The agent receives the current case state and a list of available tools.
On each turn it decides which tool to call next based on what fields are
still missing. The loop runs until the case is complete or staff_handoff
is triggered.
"""

import json
import time
import logging
from typing import Optional
from pathlib import Path
from services.ollama_client import chat
from agents.tools import TOOL_DEFINITIONS, dispatch_tool

_PROMPT_DIR = Path(__file__).resolve().parent.parent.parent.parent / "models" / "prompts"

logger = logging.getLogger("refugeereach.agent")

_CASE_FIELDS = {
    "person_name", "date_of_birth", "gender", "nationality",
    "family_size", "current_location", "preferred_language",
    "vulnerability_flags", "notes", "intake_status",
}

# Fields required before intake_status can be set to "complete"
_REQUIRED_FIELDS = {"person_name", "nationality", "family_size", "current_location"}

# Server-side conversation memory: case_id → rolling message history (no frontend changes needed)
_conversation_histories: dict = {}
_HISTORY_MAX_MESSAGES = 20   # keep last 10 turns (user+assistant pairs)


def get_history(case_id: str) -> list:
    return list(_conversation_histories.get(case_id, []))


def _save_history(case_id: str, messages: list) -> None:
    # Keep only non-system messages in the stored history
    history = [m for m in messages if m["role"] != "system"]
    _conversation_histories[case_id] = history[-_HISTORY_MAX_MESSAGES:]


def clear_history(case_id: str) -> None:
    _conversation_histories.pop(case_id, None)


_EXTRACTABLE_FIELDS = {"person_name", "date_of_birth", "nationality", "gender", "family_size", "current_location"}


async def _try_extract_fields(user_message: str) -> dict:
    """
    Fallback field extraction via a fast Gemma 4 JSON call.
    Only called when the main agent turn didn't invoke save_case_summary.
    """
    prompt = (
        "Extract any person registration fields explicitly mentioned in the message below. "
        "Return ONLY a JSON object. Omit fields not mentioned. "
        "Fields: person_name (string), date_of_birth (string), nationality (string), "
        "gender (string), family_size (integer, number of people), current_location (string).\n\n"
        f"Message: \"{user_message}\"\n\n"
        "Example output: {\"person_name\": \"Amira Hassan\", \"nationality\": \"Syrian\"}"
    )
    try:
        result = await chat([{"role": "user", "content": prompt}], json_mode=True)
        content = result.get("message", {}).get("content", "{}")
        extracted = json.loads(content)
        return {
            k: v for k, v in extracted.items()
            if k in _EXTRACTABLE_FIELDS and v is not None and v != "" and str(v) != "null"
        }
    except Exception:
        return {}


def _load_system_prompt() -> str:
    try:
        with open(_PROMPT_DIR / "intake_agent_system.md") as f:
            return f.read()
    except FileNotFoundError:
        return "You are a compassionate multilingual intake assistant for displaced people."


async def run_turn(
    case_state: dict,
    user_message: str,
    language: str = "en",
    trace_id: Optional[str] = None,
) -> dict:
    """
    Run one agent turn with rolling conversation memory.
    History is stored server-side per case_id — no client changes required.
    Returns {"reply": str, "tool_calls": list, "updated_case": dict, "trace_id": str}
    """
    t_start = time.monotonic()
    case_id = case_state.get("case_id", "")
    system_prompt = _load_system_prompt()

    # Build messages: system + rolling history + current user turn
    prior_history = get_history(case_id)
    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(prior_history)
    user_content = f"Current case state: {json.dumps(case_state)}\n\nUser ({language}): {user_message}"
    messages.append({"role": "user", "content": user_content})

    response = await chat(messages, tools=TOOL_DEFINITIONS, trace_id=trace_id)
    message = response.get("message", {})
    tool_calls = message.get("tool_calls", [])
    reply = message.get("content", "")

    updated_case = dict(case_state)
    tool_results = []

    for call in tool_calls:
        fn_name = call.get("function", {}).get("name")
        fn_args = call.get("function", {}).get("arguments", {})
        t_tool = time.monotonic()
        result = await dispatch_tool(fn_name, fn_args, updated_case)
        tool_latency = round((time.monotonic() - t_tool) * 1000)
        tool_results.append({"tool": fn_name, "result": result})
        logger.info(json.dumps({
            "event": "tool_dispatch",
            "trace_id": trace_id,
            "case_id": case_state.get("case_id"),
            "tool": fn_name,
            "args_keys": list(fn_args.keys()),
            "latency_ms": tool_latency,
            "success": "error" not in (result or {}),
        }))
        if isinstance(result, dict):
            updated_case.update(result)

    # Fallback: if save_case_summary wasn't called, try extracting fields from the user message.
    # This handles cases where Gemma 4 responded conversationally without calling the tool.
    save_was_called = any(t.get("tool") == "save_case_summary" for t in tool_results)
    if not save_was_called and user_message and len(user_message.strip()) > 3:
        extracted = await _try_extract_fields(user_message)
        for k, v in extracted.items():
            if k in _CASE_FIELDS and v:
                updated_case[k] = v

    # Always persist whatever case fields are now in updated_case — Gemma 4 doesn't
    # reliably call save_case_summary, so we guarantee persistence on every turn.
    case_id = updated_case.get("case_id") or case_state.get("case_id")
    fields_to_save = {k: v for k, v in updated_case.items() if k in _CASE_FIELDS and v is not None and v != ""}

    # Mark intake complete once all required fields are populated
    if _REQUIRED_FIELDS.issubset({k for k, v in updated_case.items() if v}):
        fields_to_save["intake_status"] = "complete"
        updated_case["intake_status"] = "complete"

    if fields_to_save and case_id:
        try:
            from services.case_service import update_case
            saved = await update_case(case_id, fields_to_save)
            # Merge saved values back so frontend receives populated fields
            if isinstance(saved, dict):
                updated_case.update({k: v for k, v in saved.items() if k in _CASE_FIELDS})
        except Exception:
            pass

    # Persist conversation history server-side (user turn + assistant reply)
    messages.append({"role": "assistant", "content": reply or ""})
    _save_history(case_id, messages)

    total_ms = round((time.monotonic() - t_start) * 1000)
    logger.info(json.dumps({
        "event": "agent_turn",
        "trace_id": trace_id,
        "case_id": case_id,
        "language": language,
        "history_depth": len(get_history(case_id)),
        "tool_calls": [t["tool"] for t in tool_results],
        "fields_saved": list(fields_to_save.keys()),
        "intake_status": updated_case.get("intake_status"),
        "total_ms": total_ms,
    }))

    return {"reply": reply, "tool_calls": tool_results, "updated_case": updated_case, "trace_id": trace_id}
