import json
import logging
import os
import httpx
import chromadb
from pathlib import Path
from typing import Optional

_REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
CHROMA_PATH = os.getenv("CHROMA_PATH", "./db/chroma")
CATALOG_PATH = os.getenv("CATALOG_PATH", str(_REPO_ROOT / "data" / "opportunity_catalog" / "opportunities.json"))
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
EMBED_MODEL = "nomic-embed-text"

logger = logging.getLogger("refugeereach.skills")

_client = None
_collection = None


def _embed(text: str) -> list:
    try:
        resp = httpx.post(
            f"{OLLAMA_HOST}/api/embeddings",
            json={"model": EMBED_MODEL, "prompt": text},
            timeout=30.0,
        )
        resp.raise_for_status()
        return resp.json()["embedding"]
    except Exception:
        return [0.0] * 768


def _get_collection():
    global _client, _collection
    if _collection is None:
        _client = chromadb.PersistentClient(path=CHROMA_PATH)
        _collection = _client.get_or_create_collection("opportunities")
    return _collection


async def _rerank_with_gemma(skills: list, location: str, candidates: list, language: str = "en") -> list:
    """
    Gemma 4 reasoning pass: given raw ChromaDB candidates, select and rank the
    top 3 by fit and add a plain-language explanation of why each matches.
    This replaces pure vector-distance ranking with LLM reasoning.
    """
    from services.ollama_client import chat

    lang_instruction = f"Write the match_reason in {language}." if language != "en" else ""
    prompt = (
        f"A displaced person has the following background:\n"
        f"Skills and roles: {', '.join(skills)}\n"
        f"Location: {location or 'not specified'}\n\n"
        f"Available humanitarian opportunities:\n"
        f"{json.dumps(candidates, indent=2)}\n\n"
        f"Select the top 3 opportunities that best match this person's background. "
        f"For each, write a concise match_reason (1-2 sentences) explaining the specific fit. "
        f"{lang_instruction}\n"
        f"Return ONLY a valid JSON array:\n"
        f'[{{"title":"...","description":"...","location":"...","match_reason":"..."}}]'
    )
    try:
        result = await chat([{"role": "user", "content": prompt}], json_mode=True)
        content = result.get("message", {}).get("content", "")
        ranked = json.loads(content)
        if isinstance(ranked, list):
            logger.info(json.dumps({
                "event": "skills_reranked",
                "candidates_in": len(candidates),
                "matches_out": len(ranked),
            }))
            return ranked[:3]
    except Exception as e:
        logger.warning(json.dumps({"event": "skills_rerank_failed", "error": str(e)}))
    # Fallback to raw ChromaDB order if Gemma 4 reranking fails
    return candidates[:3]


async def lookup(skills: list, location: str = "", language: str = "en") -> list:
    col = _get_collection()
    if col.count() == 0:
        return []

    query = ", ".join(skills)
    if location:
        query += f" in {location}"

    # Stage 1: ChromaDB vector retrieval (retrieve top 5 candidates)
    embedding = _embed(query)
    n_retrieve = min(5, col.count())
    results = col.query(query_embeddings=[embedding], n_results=n_retrieve)
    candidates = []
    for i, doc in enumerate(results.get("documents", [[]])[0]):
        meta = results.get("metadatas", [[]])[0][i] if results.get("metadatas") else {}
        candidates.append({
            "title": meta.get("title", "Opportunity"),
            "description": doc,
            "location": meta.get("location", ""),
        })

    if not candidates:
        return []

    # Stage 2: Gemma 4 reranking — adds reasoning and selects the true best 3
    return await _rerank_with_gemma(skills, location, candidates, language)


def seed_from_catalog():
    if not os.path.exists(CATALOG_PATH):
        return
    col = _get_collection()
    if col.count() > 0:
        return
    with open(CATALOG_PATH) as f:
        catalog = json.load(f)
    embeddings = [_embed(o["description"]) for o in catalog]
    col.add(
        embeddings=embeddings,
        documents=[o["description"] for o in catalog],
        metadatas=[{"title": o["title"], "location": o.get("location", "")} for o in catalog],
        ids=[str(i) for i in range(len(catalog))],
    )
