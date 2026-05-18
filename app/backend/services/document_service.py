import json
from db.database import AsyncSessionLocal
from db.models import DocumentRecord


async def extract_fields(document_id: str) -> dict:
    async with AsyncSessionLocal() as db:
        doc = await db.get(DocumentRecord, document_id)
        if not doc:
            return {"error": f"Document {document_id} not found"}
        try:
            return json.loads(doc.extracted_fields or "{}")
        except json.JSONDecodeError:
            return {}
