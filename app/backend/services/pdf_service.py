import json
import os
from datetime import datetime
from typing import Optional
from fpdf import FPDF
from sqlalchemy.ext.asyncio import AsyncSession
from db.models import CaseRecord, MedicalHandoff, SkillsProfile

_LANG_NAMES = {
    "ar": "Arabic", "uk": "Ukrainian", "fa": "Dari (Farsi)",
    "fr": "French", "en": "English",
}

# Arial Unicode covers Arabic, Cyrillic, CJK — ships with macOS
_UNICODE_FONT_PATHS = [
    "/Library/Fonts/Arial Unicode.ttf",
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
]
_UNICODE_FONT = next((p for p in _UNICODE_FONT_PATHS if os.path.exists(p)), None)


def _safe(text) -> str:
    """Encode to Latin-1, replacing characters the Helvetica core font can't handle.
    Pre-replace common Unicode punctuation so they don't become '?'."""
    if text is None:
        return ""
    s = str(text)
    # Replace Unicode punctuation that has clean ASCII equivalents
    s = s.replace("—", "-").replace("–", "-").replace("’", "'").replace("“", '"').replace("”", '"')
    return s.encode("latin-1", errors="replace").decode("latin-1")


def _unicode_text(pdf: FPDF, text: str, lang: str = "en") -> str:
    """
    Prepare text for rendering with a Unicode font.
    For Arabic/RTL languages, apply reshaping and bidi reordering so characters
    connect properly and display left-to-right in the PDF cell.
    """
    if lang == "ar" or lang == "fa":
        try:
            import arabic_reshaper
            from bidi.algorithm import get_display
            reshaped = arabic_reshaper.reshape(text)
            return get_display(reshaped)
        except Exception:
            return text
    return text


def _build_pdf(case, medical, skills, client_message: str = "") -> bytes:
    pdf = FPDF()
    pdf.add_page()
    pdf.set_margins(20, 20, 20)

    # Register Unicode font if available (used only for client copy page)
    has_unicode = _UNICODE_FONT is not None
    if has_unicode:
        pdf.add_font("ArialUni", "", _UNICODE_FONT, uni=True)

    # ── Page header ───────────────────────────────────────────────────────────
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(192, 0, 0)
    pdf.cell(0, 6, "CONFIDENTIAL - STAFF USE ONLY", ln=True)
    pdf.ln(2)

    pdf.set_font("Helvetica", "B", 16)
    pdf.set_text_color(44, 95, 138)
    pdf.cell(0, 10, "RefugeeReach Intake Summary", ln=True)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(100, 100, 100)
    pdf.cell(0, 5, f"Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}   Case ID: {case.case_id}", ln=True)
    pdf.ln(4)

    def section(title):
        pdf.set_font("Helvetica", "B", 12)
        pdf.set_text_color(44, 95, 138)
        pdf.set_x(pdf.l_margin)
        pdf.cell(0, 8, _safe(title), ln=True)
        pdf.set_draw_color(44, 95, 138)
        pdf.line(20, pdf.get_y(), 190, pdf.get_y())
        pdf.ln(2)

    def row(label, value):
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_text_color(80, 80, 80)
        pdf.set_x(pdf.l_margin)
        pdf.cell(55, 6, _safe(label), ln=False)
        pdf.set_font("Helvetica", "", 9)
        pdf.set_text_color(30, 30, 30)
        pdf.cell(0, 6, _safe(value) or "-", ln=True)

    # ── Registration Details ──────────────────────────────────────────────────
    section("Registration Details")
    row("Name", case.person_name)
    row("Date of Birth", case.date_of_birth)
    row("Gender", case.gender)
    row("Nationality", case.nationality)
    row("Family Size", case.family_size)
    row("Location", case.current_location)
    row("Preferred Language", _LANG_NAMES.get(case.preferred_language or "en", case.preferred_language or "-"))
    flags = ", ".join(json.loads(case.vulnerability_flags or "[]")) or "None"
    row("Vulnerability Flags", flags)
    pdf.ln(4)

    # ── Medical Handoff ───────────────────────────────────────────────────────
    urgency = (medical.urgency_level if medical else "routine") or "routine"
    section(f"Medical Handoff  [{urgency.upper()}]")
    summary = medical.summary_for_staff if medical else "No medical information recorded."
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(30, 30, 30)
    pdf.set_x(pdf.l_margin)
    pdf.multi_cell(0, 5, _safe(summary) or "-")
    pdf.ln(4)

    # ── Skills & Opportunities ────────────────────────────────────────────────
    section("Skills & Opportunities")

    try:
        prior_roles = json.loads(skills.prior_roles) if skills and skills.prior_roles else []
        prior = ", ".join(prior_roles) if prior_roles else "-"
    except (json.JSONDecodeError, TypeError):
        prior = _safe(str(skills.prior_roles)) if skills else "-"
    row("Prior Roles", prior)
    pdf.ln(2)

    try:
        opportunities = json.loads(skills.opportunity_matches) if skills and skills.opportunity_matches else []
    except (json.JSONDecodeError, TypeError):
        opportunities = []

    if opportunities:
        for o in opportunities:
            title = _safe(o.get("title", ""))
            desc = _safe(o.get("description", ""))
            # Reset to left margin — multi_cell can leave x at an arbitrary position
            pdf.set_x(pdf.l_margin)
            pdf.set_font("Helvetica", "B", 9)
            pdf.set_text_color(30, 30, 30)
            pdf.multi_cell(0, 5, f"- {title}")
            pdf.set_x(pdf.l_margin)
            pdf.set_font("Helvetica", "", 9)
            pdf.set_text_color(80, 80, 80)
            pdf.multi_cell(0, 5, f"  {desc}")
            pdf.ln(1)
    else:
        pdf.set_x(pdf.l_margin)
        pdf.set_font("Helvetica", "", 9)
        pdf.cell(0, 5, "None identified", ln=True)

    if client_message:
        # ── Client copy page (only included when next-steps message is provided) ──
        pdf.ln(6)
        pdf.add_page()

        pdf.set_font("Helvetica", "B", 14)
        pdf.set_text_color(0, 130, 110)
        pdf.cell(0, 10, "CLIENT COPY - What happens next", ln=True)
        pdf.set_draw_color(0, 130, 110)
        pdf.line(20, pdf.get_y(), 190, pdf.get_y())
        pdf.ln(4)

        lang = case.preferred_language or "en" if case else "en"
        if has_unicode:
            prepared = _unicode_text(pdf, client_message, lang)
            pdf.set_font("ArialUni", "", 11)
            pdf.set_text_color(30, 30, 30)
            pdf.set_x(pdf.l_margin)
            pdf.multi_cell(0, 7, prepared)
        else:
            pdf.set_font("Helvetica", "", 10)
            pdf.set_text_color(30, 30, 30)
            pdf.set_x(pdf.l_margin)
            pdf.multi_cell(0, 6, _safe(client_message))
        pdf.ln(4)

        pdf.set_x(pdf.l_margin)
        pdf.set_font("Helvetica", "I", 8)
        pdf.set_text_color(120, 120, 120)
        pdf.multi_cell(0, 4,
            "Note: This message has been prepared in your preferred language "
            "and is available on the RefugeeReach kiosk screen. "
            "Please ask a staff member if you need help reading it."
        )
        pdf.ln(6)
        pdf.set_x(pdf.l_margin)
        pdf.set_font("Helvetica", "I", 7)
        pdf.set_text_color(160, 160, 160)
        pdf.multi_cell(0, 4, "Generated by RefugeeReach (Gemma 4, local inference). All information requires staff verification before official use.")

    return bytes(pdf.output())


async def export(case_id: str, db: Optional[AsyncSession] = None) -> bytes:
    if db is None:
        from db.database import AsyncSessionLocal
        async with AsyncSessionLocal() as session:
            return await _export(case_id, session)
    return await _export(case_id, db)


async def _generate_client_message(case) -> str:
    """Gemma 4 writes a warm 'what happens next' message in the person's language."""
    from services.ollama_client import chat
    lang = case.preferred_language or "en"
    lang_name = _LANG_NAMES.get(lang, "English")
    name = case.person_name or ""
    greeting = f"for {name}" if name else ""
    prompt = (
        f"You are a kind humanitarian caseworker writing a short message {greeting}.\n\n"
        f"Write a warm, reassuring 'What happens next' message in {lang_name}. "
        f"Use simple language. Include: (1) registration is complete, "
        f"(2) go to the reception desk for your registration card, "
        f"(3) you can return to this kiosk for help, "
        f"(4) acknowledge their difficult journey and that they are safe here.\n\n"
        f"Write ONLY the message in {lang_name}. 4 sentences. No headings."
    )
    try:
        result = await chat([{"role": "user", "content": prompt}])
        return result.get("message", {}).get("content", "").strip()
    except Exception:
        return ""


async def _export(case_id: str, db: AsyncSession) -> bytes:
    from sqlalchemy import select
    case = await db.get(CaseRecord, case_id)
    if case is None:
        raise ValueError(f"Case {case_id} not found")
    r = await db.execute(select(MedicalHandoff).where(MedicalHandoff.case_id == case_id))
    medical = r.scalars().first()
    r = await db.execute(select(SkillsProfile).where(SkillsProfile.case_id == case_id))
    skills = r.scalars().first()
    # client_message is intentionally empty here — the "What happens next" card
    # is generated separately via GET /api/cases/{id}/next-steps and shown in the UI.
    return _build_pdf(case, medical, skills, "")
