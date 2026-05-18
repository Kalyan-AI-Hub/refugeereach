import uuid
import json
from pathlib import Path
from db.database import AsyncSessionLocal
from db.models import MedicalHandoff
from services.ollama_client import chat

_PROMPT_DIR = Path(__file__).resolve().parent.parent.parent.parent / "models" / "prompts"


async def generate_handoff(args: dict) -> dict:
    case_id = args.get("case_id", "")
    symptoms = args.get("symptoms", "")
    existing_conditions = args.get("existing_conditions", "")
    medications = args.get("medications", "")

    with open(_PROMPT_DIR / "medical_handoff.md") as f:
        prompt_template = f.read()

    prompt = (
        prompt_template
        .replace("{symptoms}", symptoms)
        .replace("{existing_conditions}", existing_conditions)
        .replace("{medications}", medications)
    )
    result = await chat([{"role": "user", "content": prompt}])
    content = result.get("message", {}).get("content", "")

    def _strip_fences(s):
        s = s.strip()
        if s.startswith("```"):
            lines = s.splitlines()
            inner = lines[1:]
            if inner and inner[-1].strip() == "```":
                inner = inner[:-1]
            s = "\n".join(inner).strip()
        return s

    try:
        parsed = json.loads(_strip_fences(content))
    except json.JSONDecodeError:
        parsed = {"summary_for_staff": content, "urgency_level": "routine"}

    async with AsyncSessionLocal() as db:
        record = MedicalHandoff(
            id=str(uuid.uuid4()),
            case_id=case_id,
            symptoms=symptoms,
            existing_conditions=existing_conditions,
            medications_seen=medications,
            summary_for_staff=parsed.get("summary_for_staff", content),
            urgency_level=parsed.get("urgency_level", "routine"),
        )
        db.add(record)
        await db.commit()
        return {"handoff_id": record.id, "summary": parsed}
