from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from db.database import get_db
from db.models import AuditLog
from services import pdf_service

router = APIRouter()


@router.get("/{case_id}/pdf")
async def export_pdf(case_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    trace_id = getattr(request.state, "trace_id", None)
    try:
        pdf_bytes = await pdf_service.export(case_id, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    db.add(AuditLog(case_id=case_id, action="export_pdf", trace_id=trace_id))
    await db.commit()
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=case_{case_id}.pdf"},
    )
