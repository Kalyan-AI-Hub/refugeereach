import json
import logging
from fastapi import APIRouter, UploadFile, File, Form, Request
from pydantic import BaseModel
from typing import Optional, List
from services import stt, tts
from agents.intake_agent import run_turn

router = APIRouter()
logger = logging.getLogger("refugeereach.guardrails")

# ── Responsible AI: input guardrails ─────────────────────────────────────────
# Checked before any message reaches Gemma 4.

_CRISIS_TRIGGERS = [
    "hurt myself", "end my life", "suicidal", "kill myself",
    "want to die", "no reason to live", "harm myself",
]
_HARMFUL_TRIGGERS = [
    "make a weapon", "build a bomb", "explosive", "attack people",
    "how to poison", "smuggle",
]
_LEGAL_OVERRIDE_TRIGGERS = [
    "will i be deported", "am i going to be deported",
    "guarantee my asylum", "promise i can stay",
]

_CRISIS_RESPONSE = (
    "I hear you, and I want you to know you are not alone. "
    "Please speak with a staff member right now — they are here to help. "
    "You are safe here."
)
_HARMFUL_RESPONSE = (
    "I can't help with that. Please speak with a staff member."
)
_LEGAL_DISCLAIMER = (
    "I'm not able to make legal predictions or guarantees — that's for your caseworker. "
    "What I can do is make sure your registration is complete and accurate. "
    "Shall we continue?"
)


def _check_guardrails(message: str) -> Optional[dict]:
    """
    Returns a guardrail response dict if the message needs non-AI handling,
    or None to allow normal agent processing.
    """
    lower = message.lower()
    if any(t in lower for t in _CRISIS_TRIGGERS):
        return {"type": "crisis_escalation", "override_reply": _CRISIS_RESPONSE}
    if any(t in lower for t in _HARMFUL_TRIGGERS):
        return {"type": "harmful_content", "override_reply": _HARMFUL_RESPONSE}
    if any(t in lower for t in _LEGAL_OVERRIDE_TRIGGERS):
        return {"type": "legal_disclaimer", "override_reply": _LEGAL_DISCLAIMER}
    return None


class TextTurnRequest(BaseModel):
    case_id: str
    case_state: dict
    message: str
    language: str = "en"
    history: Optional[List[dict]] = None   # conversation history for multi-turn context


@router.post("/transcribe")
async def transcribe_audio(
    audio: UploadFile = File(...),
    hint_language: str = Form(None),
):
    audio_bytes = await audio.read()
    result = stt.transcribe(audio_bytes, hint_language)
    return result


@router.post("/turn")
async def agent_turn(req: TextTurnRequest, request: Request):
    trace_id = getattr(request.state, "trace_id", None)

    # Responsible AI: check guardrails before anything reaches Gemma 4
    guardrail = _check_guardrails(req.message)
    if guardrail:
        logger.info(json.dumps({
            "event": "guardrail_triggered",
            "trace_id": trace_id,
            "case_id": req.case_id,
            "guardrail_type": guardrail["type"],
        }))
        try:
            from db.database import AsyncSessionLocal
            from db.models import AuditLog
            async with AsyncSessionLocal() as db:
                db.add(AuditLog(
                    case_id=req.case_id,
                    action="guardrail_block",
                    detail=guardrail["type"],
                    trace_id=trace_id,
                ))
                await db.commit()
        except Exception:
            pass
        return {
            "reply": guardrail["override_reply"],
            "tool_calls": [],
            "updated_case": req.case_state,
            "guardrail": guardrail["type"],
            "trace_id": trace_id,
        }

    # ── ReAct loop ────────────────────────────────────────────────────────────
    # Gemma 4 can call tools and then need another turn to produce a user-facing
    # reply (observe → act → observe again). We loop up to MAX_INNER_TURNS times.
    # The loop stops when:
    #   (a) a user-facing reply is produced, or
    #   (b) intake_status is "complete", or
    #   (c) no tools were called (agent is done reasoning), or
    #   (d) MAX_INNER_TURNS is reached (safety cap).
    MAX_INNER_TURNS = 2
    user_message = req.message
    case_state = req.case_state
    all_tool_calls = []
    result = None

    for inner_turn in range(MAX_INNER_TURNS):
        result = await run_turn(case_state, user_message, req.language, trace_id=trace_id)
        case_state = result["updated_case"]
        all_tool_calls.extend(result.get("tool_calls", []))

        has_reply = bool(result.get("reply", "").strip())
        intake_done = case_state.get("intake_status") == "complete"
        tools_called = bool(result.get("tool_calls"))

        if has_reply or intake_done:
            break

        if tools_called and not has_reply:
            # Agent called tools but gave no reply yet — loop again with a continue signal
            user_message = "Please continue and respond to the person."
            logger.info(json.dumps({
                "event": "react_loop_continue",
                "trace_id": trace_id,
                "inner_turn": inner_turn + 1,
                "tools_called": [t["tool"] for t in result["tool_calls"]],
            }))
            continue

        break  # no tools called, no reply — agent is stuck, exit cleanly

    result["tool_calls"] = all_tool_calls   # return full tool call history across all inner turns
    return result


@router.post("/speak")
async def speak_text(text: str = Form(...), language: str = Form("en")):
    from fastapi.responses import Response
    audio_bytes = tts.synthesize(text, language)
    return Response(content=audio_bytes, media_type="audio/wav")
