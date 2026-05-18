import uuid
import json
import logging
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from pydantic import BaseModel
from db.database import get_db
from db.models import CaseRecord, DocumentRecord, MedicalHandoff, SkillsProfile, AuditLog
from services.ollama_client import chat

router = APIRouter()
logger = logging.getLogger("refugeereach.cases")

_LANG_NAMES = {
    "ar": "Arabic", "uk": "Ukrainian", "fa": "Dari (Farsi)",
    "fr": "French", "en": "English",
}


class CreateCaseRequest(BaseModel):
    preferred_language: Optional[str] = None
    intake_staff_id: Optional[str] = None
    consent_given: bool = False   # Responsible AI: must be True before case is created


@router.post("/")
async def create_case(req: CreateCaseRequest, request: Request, db: AsyncSession = Depends(get_db)):
    if not req.consent_given:
        raise HTTPException(
            status_code=422,
            detail="Informed consent is required before a case record can be created.",
        )
    trace_id = getattr(request.state, "trace_id", None)
    case = CaseRecord(
        case_id=str(uuid.uuid4()),
        preferred_language=req.preferred_language,
        intake_staff_id=req.intake_staff_id,
        consent_given=True,
        consent_timestamp=datetime.utcnow(),
        consent_language=req.preferred_language or "en",
    )
    db.add(case)
    db.add(AuditLog(
        case_id=case.case_id,
        action="consent",
        detail=f"Informed consent recorded in language: {req.preferred_language or 'en'}",
        trace_id=trace_id,
    ))
    await db.commit()
    await db.refresh(case)
    logger.info(json.dumps({
        "event": "case_created",
        "trace_id": trace_id,
        "case_id": case.case_id,
        "language": req.preferred_language,
        "consent": True,
    }))
    return {"case_id": case.case_id, "status": case.intake_status}


@router.get("/{case_id}")
async def get_case(case_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    trace_id = getattr(request.state, "trace_id", None)
    case = await db.get(CaseRecord, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    db.add(AuditLog(case_id=case_id, action="read", trace_id=trace_id))
    await db.commit()
    return case


@router.get("/{case_id}/next-steps")
async def get_next_steps(case_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Gemma 4 generates a warm, personalised 'what happens next' message in the person's language."""
    trace_id = getattr(request.state, "trace_id", None)
    case = await db.get(CaseRecord, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    lang = case.preferred_language or "en"
    lang_name = _LANG_NAMES.get(lang, "English")
    name = case.person_name or ""
    greeting = f"for {name}" if name else ""

    prompt = (
        f"You are a kind humanitarian caseworker writing a short message {greeting}.\n\n"
        f"Write a warm, reassuring 'What happens next' message in {lang_name}. "
        f"Use simple, clear language. Include:\n"
        f"1. Confirmation that their registration is now complete\n"
        f"2. The immediate next step: go to the reception desk to collect a registration card\n"
        f"3. That they can return to this kiosk any time if they need more help\n"
        f"4. One sentence acknowledging their journey has been difficult and that they are now safe\n\n"
        f"Write ONLY the message in {lang_name}. 4 sentences maximum. No headings or bullet points."
    )

    result = await chat([{"role": "user", "content": prompt}], trace_id=trace_id)
    message = result.get("message", {}).get("content", "").strip()
    return {"message": message, "language": lang, "case_id": case_id}


@router.delete("/{case_id}")
async def delete_case(case_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    """
    Right to erasure — hard-deletes all records for a case across all tables.
    Required for humanitarian data governance (UNHCR data protection policy).
    """
    trace_id = getattr(request.state, "trace_id", None)
    case = await db.get(CaseRecord, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    # Delete child records first (no FK constraints in SQLite, but correct practice)
    await db.execute(delete(MedicalHandoff).where(MedicalHandoff.case_id == case_id))
    await db.execute(delete(SkillsProfile).where(SkillsProfile.case_id == case_id))
    await db.execute(delete(DocumentRecord).where(DocumentRecord.case_id == case_id))
    await db.delete(case)

    # Audit the deletion (keep the log even after case is gone)
    db.add(AuditLog(
        case_id=case_id,
        action="delete",
        detail="Full erasure — all case data deleted on request",
        trace_id=trace_id,
    ))
    await db.commit()

    logger.info(json.dumps({
        "event": "case_deleted",
        "trace_id": trace_id,
        "case_id": case_id,
    }))
    return {"deleted": True, "case_id": case_id}
