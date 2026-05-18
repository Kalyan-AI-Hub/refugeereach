import uuid
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from db.database import get_db
from db.models import SkillsProfile
from services.opportunity_service import lookup

router = APIRouter()


class SkillsRequest(BaseModel):
    case_id: str
    prior_roles: list
    certifications: list = []
    languages_spoken: list = []
    education_level: str = ""
    location: str = ""
    preferred_language: str = "en"   # forwarded so Gemma 4 writes match_reason in person's language


@router.post("/match")
async def match_skills(req: SkillsRequest, db: AsyncSession = Depends(get_db)):
    matches = await lookup(req.prior_roles + req.certifications, req.location, req.preferred_language)

    import json
    profile = SkillsProfile(
        id=str(uuid.uuid4()),
        case_id=req.case_id,
        prior_roles=json.dumps(req.prior_roles),
        certifications=json.dumps(req.certifications),
        languages_spoken=json.dumps(req.languages_spoken),
        education_level=req.education_level,
        opportunity_matches=json.dumps(matches),
    )
    db.add(profile)
    await db.commit()
    return {"profile_id": profile.id, "matches": matches}
