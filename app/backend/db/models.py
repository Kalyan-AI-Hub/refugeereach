import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import String, Integer, Float, Text, DateTime, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from db.database import Base


class CaseRecord(Base):
    __tablename__ = "cases"

    case_id: Mapped[str] = mapped_column(String, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    intake_staff_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    preferred_language: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    person_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    date_of_birth: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    gender: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    nationality: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    family_size: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    current_location: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    intake_status: Mapped[str] = mapped_column(String, default="pending")
    vulnerability_flags: Mapped[str] = mapped_column(Text, default="[]")
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Responsible AI: informed consent before any data is stored
    consent_given: Mapped[bool] = mapped_column(Boolean, default=False)
    consent_timestamp: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    consent_language: Mapped[Optional[str]] = mapped_column(String, nullable=True)


class DocumentRecord(Base):
    __tablename__ = "documents"

    document_id: Mapped[str] = mapped_column(String, primary_key=True)
    case_id: Mapped[str] = mapped_column(String, nullable=False)
    captured_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    document_type: Mapped[str] = mapped_column(String, default="other")
    extracted_fields: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    confidence_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    processing_status: Mapped[str] = mapped_column(String, default="pending")


class MedicalHandoff(Base):
    __tablename__ = "medical_handoffs"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    case_id: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    symptoms: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    existing_conditions: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    medications_seen: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    summary_for_staff: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    urgency_level: Mapped[str] = mapped_column(String, default="routine")
    source: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)


class SkillsProfile(Base):
    __tablename__ = "skills_profiles"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    case_id: Mapped[str] = mapped_column(String, nullable=False)
    prior_roles: Mapped[str] = mapped_column(Text, default="[]")
    certifications: Mapped[str] = mapped_column(Text, default="[]")
    languages_spoken: Mapped[str] = mapped_column(Text, default="[]")
    education_level: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    opportunity_matches: Mapped[str] = mapped_column(Text, default="[]")


class AuditLog(Base):
    """Immutable record of every action taken on a case. Required for humanitarian data governance."""
    __tablename__ = "audit_log"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    case_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    action: Mapped[str] = mapped_column(String, nullable=False)   # read|update|export_pdf|delete|consent|escalate|guardrail_block
    actor: Mapped[str] = mapped_column(String, default="kiosk")
    detail: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    trace_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
