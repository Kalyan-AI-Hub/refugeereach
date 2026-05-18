"""
Seed ChromaDB with opportunity catalog and referral directory.
Run once before the demo (from repo root, with backend venv active):
  python scripts/seed_demo_data.py

Requires nomic-embed-text to be available in Ollama:
  ollama pull nomic-embed-text
"""

import json
import os
import sys
from pathlib import Path

_BACKEND = Path(__file__).resolve().parent.parent / "app" / "backend"
_REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_BACKEND))

import chromadb
import httpx

OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
EMBED_MODEL = "nomic-embed-text"

CHROMA_PATH = str(_BACKEND / "db" / "chroma")
OPPORTUNITIES_PATH = str(_REPO_ROOT / "data" / "opportunity_catalog" / "opportunities.json")
REFERRALS_PATH = str(_REPO_ROOT / "data" / "referral_catalog" / "referrals.json")


def embed(text: str) -> list[float]:
    try:
        resp = httpx.post(
            f"{OLLAMA_HOST}/api/embeddings",
            json={"model": EMBED_MODEL, "prompt": text},
            timeout=30.0,
        )
        resp.raise_for_status()
        return resp.json()["embedding"]
    except Exception as e:
        print(f"  WARNING: embedding failed — {e}")
        return [0.0] * 768


def seed_collection(client, name: str, items: list, doc_key: str, meta_keys: list, force: bool = False):
    if force:
        try:
            client.delete_collection(name)
            print(f"  {name}: deleted existing collection (--force).")
        except Exception:
            pass
    col = client.get_or_create_collection(name)
    if col.count() > 0 and not force:
        print(f"  {name}: already seeded ({col.count()} items), skipping. Use --force to re-seed.")
        return
    print(f"  {name}: embedding {len(items)} items via nomic-embed-text…")
    embeddings = [embed(item[doc_key]) for item in items]
    col.add(
        embeddings=embeddings,
        documents=[item[doc_key] for item in items],
        metadatas=[{k: item.get(k, "") for k in meta_keys} for item in items],
        ids=[str(i) for i in range(len(items))],
    )
    print(f"  {name}: seeded {len(items)} items.")


def main():
    force = "--force" in sys.argv
    print("Seeding RefugeeReach demo data…" + (" (force re-seed)" if force else ""))
    print(f"  ChromaDB path: {CHROMA_PATH}")
    os.makedirs(CHROMA_PATH, exist_ok=True)
    client = chromadb.PersistentClient(path=CHROMA_PATH)

    with open(OPPORTUNITIES_PATH) as f:
        opportunities = json.load(f)
    seed_collection(client, "opportunities", opportunities, "description", ["title", "location"], force=force)

    with open(REFERRALS_PATH) as f:
        referrals = json.load(f)
    seed_collection(client, "referrals", referrals, "description", ["service", "location", "contact"], force=force)

    print("Done. ChromaDB is ready for skills matching.")


if __name__ == "__main__":
    main()
