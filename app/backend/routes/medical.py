import uuid
import re
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, Form, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from db.database import get_db
from db.models import MedicalHandoff
from services.ollama_client import chat, chat_with_image

router = APIRouter()


def _strip_fences(s: str) -> str:
    s = s.strip()
    if s.startswith("```"):
        lines = s.splitlines()
        inner = lines[1:]
        if inner and inner[-1].strip() == "```":
            inner = inner[:-1]
        s = "\n".join(inner).strip()
    return s

_PROMPT_DIR = Path(__file__).resolve().parent.parent.parent.parent / "models" / "prompts"


class MedicalTextRequest(BaseModel):
    case_id: str
    symptoms: str
    existing_conditions: str = ""
    medications: str = ""


@router.post("/handoff-from-text")
async def handoff_from_text(req: MedicalTextRequest, db: AsyncSession = Depends(get_db)):
    with open(_PROMPT_DIR / "medical_handoff.md") as f:
        prompt_template = f.read()

    prompt = (
        prompt_template
        .replace("{symptoms}", req.symptoms)
        .replace("{existing_conditions}", req.existing_conditions)
        .replace("{medications}", req.medications)
    )
    messages = [{"role": "user", "content": prompt}]
    result = await chat(messages, json_mode=True)
    summary = result.get("message", {}).get("content", "")

    import json
    try:
        parsed = json.loads(_strip_fences(summary))
    except json.JSONDecodeError:
        parsed = {"summary_for_staff": summary, "urgency_level": "routine"}

    # Normalize urgency to lowercase so UI lookup always matches
    if isinstance(parsed.get("urgency_level"), str):
        parsed["urgency_level"] = parsed["urgency_level"].lower()

    record = MedicalHandoff(
        id=str(uuid.uuid4()),
        case_id=req.case_id,
        symptoms=req.symptoms,
        existing_conditions=req.existing_conditions,
        medications_seen=req.medications,
        summary_for_staff=parsed.get("summary_for_staff", summary),
        urgency_level=parsed.get("urgency_level", "routine"),
    )
    db.add(record)
    await db.commit()
    return {"handoff_id": record.id, "summary": parsed}


@router.post("/handoff-from-image")
async def handoff_from_image(
    case_id: str = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    image_bytes = await file.read()
    with open(_PROMPT_DIR / "medical_handoff_vision.md") as f:
        prompt = f.read()
    result = await chat_with_image(prompt, image_bytes, json_mode=True)
    content = result.get("message", {}).get("content", "")

    import json
    try:
        parsed = json.loads(_strip_fences(content))
    except json.JSONDecodeError:
        parsed = {"summary_for_staff": content, "urgency_level": "routine"}

    if isinstance(parsed.get("urgency_level"), str):
        parsed["urgency_level"] = parsed["urgency_level"].lower()

    record = MedicalHandoff(
        id=str(uuid.uuid4()),
        case_id=case_id,
        summary_for_staff=parsed.get("summary_for_staff", content),
        urgency_level=parsed.get("urgency_level", "routine"),
    )
    db.add(record)
    await db.commit()
    return {"handoff_id": record.id, "summary": parsed}
