"""
Tool definitions passed to Gemma 4 and the dispatch router.
Each tool maps to a real service call — nothing is mocked.
"""

import json
import logging

logger = logging.getLogger("refugeereach.tools")

TOOL_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "extract_identity_fields",
            "description": "Extract structured identity fields from a document image already captured in this session.",
            "parameters": {
                "type": "object",
                "properties": {
                    "document_id": {"type": "string", "description": "ID of the captured document record"}
                },
                "required": ["document_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "save_case_summary",
            "description": "Save collected registration fields to the database. Call this as soon as the person provides any field value. Pass only the fields you have — omit fields you do not have.",
            "parameters": {
                "type": "object",
                "properties": {
                    "case_id":          {"type": "string", "description": "The case ID from the case state"},
                    "person_name":      {"type": "string", "description": "Full name of the person"},
                    "date_of_birth":    {"type": "string", "description": "Date of birth, any format"},
                    "nationality":      {"type": "string", "description": "Nationality or country of origin"},
                    "gender":           {"type": "string", "description": "Gender"},
                    "family_size":      {"type": "integer", "description": "Number of people traveling together including this person"},
                    "current_location": {"type": "string", "description": "Current location or camp"},
                },
                "required": ["case_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "generate_medical_handoff",
            "description": "Generate a structured medical handoff summary from symptoms and document data.",
            "parameters": {
                "type": "object",
                "properties": {
                    "case_id": {"type": "string"},
                    "symptoms": {"type": "string"},
                    "existing_conditions": {"type": "string"},
                    "medications": {"type": "string"},
                },
                "required": ["case_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "lookup_opportunities",
            "description": "Find relevant roles, training, or referrals matching the person's skills and location.",
            "parameters": {
                "type": "object",
                "properties": {
                    "skills": {"type": "array", "items": {"type": "string"}},
                    "location": {"type": "string"},
                },
                "required": ["skills"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "export_pdf",
            "description": "Generate and save a printable PDF case summary for staff handoff.",
            "parameters": {
                "type": "object",
                "properties": {
                    "case_id": {"type": "string"}
                },
                "required": ["case_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "flag_vulnerability",
            "description": (
                "Assess the case information shared so far and flag any vulnerability indicators "
                "such as unaccompanied minor, pregnancy, disability, SGBV risk, statelessness, "
                "urgent medical need, or unaccompanied elderly person. "
                "Call this as soon as any vulnerability indicator is mentioned or implied."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "case_id": {"type": "string"},
                    "case_summary": {
                        "type": "string",
                        "description": "Plain-language summary of what the person has shared — used by Gemma 4 to assess vulnerability",
                    },
                },
                "required": ["case_id", "case_summary"],
            },
        },
    },
]


async def _assess_vulnerability(args: dict, case_state: dict) -> dict:
    """
    Gemma 4 reads the case summary and returns a structured list of
    vulnerability flags. Flags are stored in CaseRecord.vulnerability_flags.
    """
    from services.ollama_client import chat

    prompt = (
        f"You are a humanitarian vulnerability assessment specialist.\n"
        f"Read the following case summary and identify any vulnerability indicators.\n\n"
        f"Case summary: {args.get('case_summary', '')}\n\n"
        f"Vulnerability categories to check:\n"
        f"- unaccompanied_minor: person under 18 traveling without a parent or guardian\n"
        f"- pregnancy: person is pregnant or recently gave birth\n"
        f"- disability: physical or mental disability mentioned\n"
        f"- sgbv_risk: sexual or gender-based violence risk indicators\n"
        f"- urgent_medical: acute medical condition requiring immediate attention\n"
        f"- stateless: no nationality or documentation of any kind\n"
        f"- unaccompanied_elderly: elderly person traveling alone\n\n"
        f"Return ONLY a JSON object with a 'flags' array. "
        f"Include only the flags that are clearly indicated — do not infer or guess.\n"
        f'Example: {{"flags": ["urgent_medical", "unaccompanied_minor"]}}'
    )
    try:
        result = await chat([{"role": "user", "content": prompt}], json_mode=True)
        content = result.get("message", {}).get("content", "{}")
        parsed = json.loads(content)
        flags = parsed.get("flags", [])
    except Exception:
        flags = []

    if flags:
        logger.info(json.dumps({
            "event": "vulnerability_flagged",
            "case_id": args.get("case_id"),
            "flags": flags,
        }))
        # Persist flags to case record
        try:
            from services.case_service import update_case
            await update_case(args["case_id"], {"vulnerability_flags": flags})
        except Exception:
            pass

    return {"vulnerability_flags": flags, "case_id": args.get("case_id")}


async def dispatch_tool(name: str, args: dict, case_state: dict) -> dict:
    """Route tool calls to real service implementations."""
    if name == "extract_identity_fields":
        from services import document_service
        return await document_service.extract_fields(args["document_id"])

    if name == "save_case_summary":
        from services import case_service
        case_id = args.get("case_id") or case_state.get("case_id", "")
        fields = {k: v for k, v in args.items() if k != "case_id"}
        logger.info(json.dumps({"event": "save_case_summary", "case_id": case_id, "fields": list(fields.keys())}))
        return await case_service.update_case(case_id, fields)

    if name == "generate_medical_handoff":
        from services import medical_service
        return await medical_service.generate_handoff(args)

    if name == "lookup_opportunities":
        from services import opportunity_service
        return await opportunity_service.lookup(args["skills"], args.get("location", ""))

    if name == "export_pdf":
        from services import pdf_service
        return await pdf_service.export(args["case_id"])

    if name == "flag_vulnerability":
        return await _assess_vulnerability(args, case_state)

    return {"error": f"Unknown tool: {name}"}
