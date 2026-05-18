import json
from db.database import AsyncSessionLocal
from db.models import CaseRecord

_ALLOWED = {
    "person_name", "date_of_birth", "gender", "nationality",
    "family_size", "current_location", "preferred_language",
    "vulnerability_flags", "notes", "intake_status",
}


async def update_case(case_id: str, fields: dict) -> dict:
    async with AsyncSessionLocal() as db:
        case = await db.get(CaseRecord, case_id)
        if not case:
            return {"error": f"Case {case_id} not found"}
        for key, value in fields.items():
            if key not in _ALLOWED:
                continue
            if key == "vulnerability_flags" and isinstance(value, list):
                value = json.dumps(value)
            if key == "family_size" and isinstance(value, str):
                try:
                    value = int(value)
                except ValueError:
                    pass
            setattr(case, key, value)
        await db.commit()
        # Return the actual saved values so run_turn can merge them into updated_case
        # and the frontend receives the populated fields in the response.
        saved = {k: v for k, v in fields.items() if k in _ALLOWED}
        return {"case_id": case_id, **saved}
