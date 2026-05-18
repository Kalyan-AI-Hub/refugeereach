import uuid
import json
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, Form, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from db.database import get_db
from db.models import DocumentRecord
from services.ollama_client import chat_with_image
from services import image_preprocessing

router = APIRouter()

_PROMPT_DIR = Path(__file__).resolve().parent.parent.parent.parent / "models" / "prompts"


def _strip_fences(content: str) -> str:
    """Strip markdown code fences that Gemma 4 sometimes wraps JSON in."""
    s = content.strip()
    if s.startswith("```"):
        lines = s.splitlines()
        # Drop first line (```json or ```) and last line (```)
        inner = lines[1:] if lines[-1].strip() == "```" else lines[1:]
        if inner and inner[-1].strip() == "```":
            inner = inner[:-1]
        s = "\n".join(inner).strip()
    return s


def _parse_extraction(content: str) -> dict:
    """Parse Gemma 4 response — handles markdown fences, structured, and legacy flat formats."""
    try:
        raw = json.loads(_strip_fences(content))
    except json.JSONDecodeError:
        return {"document_type": "other", "fields": {}, "summary": content, "overall_confidence": 0.0}

    # New structured format: {"document_type": ..., "fields": {...}, "summary": ..., "overall_confidence": ...}
    if "fields" in raw and isinstance(raw["fields"], dict):
        return raw

    # Legacy flat format: {"full_name": "...", "confidence": 0.9, ...}
    # Wrap it into the structured format
    skip = {"document_type", "confidence", "summary", "raw"}
    fields = {}
    overall = raw.get("confidence", 0.0)
    for k, v in raw.items():
        if k not in skip:
            fields[k] = {"value": str(v) if v is not None else None, "confidence": overall, "source_text": None}
    return {
        "document_type": raw.get("document_type", "other"),
        "fields": fields,
        "summary": raw.get("summary", ""),
        "overall_confidence": overall,
    }


_LANG_NAMES = {
    "ar": "Arabic", "uk": "Ukrainian", "fa": "Dari (Farsi)",
    "fr": "French", "en": "English",
}


@router.post("/translate")
async def translate_document(
    target_language: str = Form("en"),
    file: UploadFile = File(...),
):
    """Gemma 4 reads any document image and explains it in the person's language."""
    image_bytes = await file.read()
    image_bytes = image_preprocessing.preprocess(image_bytes)

    lang_name = _LANG_NAMES.get(target_language, "English")
    prompt = (
        f"You are a compassionate humanitarian interpreter. "
        f"A displaced person has handed you this document and cannot read it. "
        f"Read it carefully, then write a clear explanation entirely in {lang_name}.\n\n"
        f"Your response must cover:\n"
        f"1. What type of document this is (one sentence)\n"
        f"2. What the document says in plain, simple language — no legal jargon\n"
        f"3. What the person needs to do or know as a result\n"
        f"4. One warm, reassuring closing sentence\n\n"
        f"Write ONLY in {lang_name}. Be kind and simple — this person has had a very difficult journey."
    )

    result = await chat_with_image(prompt, image_bytes)
    explanation = result.get("message", {}).get("content", "").strip()
    return {"explanation": explanation, "language": target_language}


@router.post("/extract")
async def extract_document(
    case_id: str = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    image_bytes = await file.read()
    image_bytes = image_preprocessing.preprocess(image_bytes)

    with open(_PROMPT_DIR / "document_extraction.md") as f:
        prompt = f.read()

    result = await chat_with_image(prompt, image_bytes, json_mode=True)
    content = result.get("message", {}).get("content", "{}")
    extracted = _parse_extraction(content)

    doc = DocumentRecord(
        document_id=str(uuid.uuid4()),
        case_id=case_id,
        document_type=extracted.get("document_type", "other"),
        extracted_fields=json.dumps(extracted),
        summary=extracted.get("summary", ""),
        confidence_score=extracted.get("overall_confidence"),
        processing_status="extracted",
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return {"document_id": doc.document_id, "extracted": extracted}
