"""
Generate synthetic sample documents and audio files for demo and evaluation.
Creates realistic-looking but entirely fictional documents.
Run once: python scripts/generate_synthetic_docs.py

Output: data/sample_documents/
  - synthetic_syrian_passport.jpg  (also copied as passport_sample.jpg)
  - synthetic_id_card.jpg          (also copied as id_card_sample.jpg)
  - synthetic_vaccination_record.jpg
  - synthetic_eviction_notice.jpg
  - synthetic_medical_note.jpg
  - arabic_sample.wav
  - ukrainian_sample.wav
  - dari_sample.wav
  - french_sample.wav
  - english_sample.wav
"""

import os
import shutil
import tempfile
from PIL import Image, ImageDraw, ImageFont

OUTPUT_DIR = "data/sample_documents"
os.makedirs(OUTPUT_DIR, exist_ok=True)

W, H = 800, 560


def _base_card(bg_color=(245, 245, 240)):
    img = Image.new("RGB", (W, H), bg_color)
    draw = ImageDraw.Draw(img)
    return img, draw


def _watermark(draw):
    draw.text((W // 2 - 140, H - 30), "SYNTHETIC — DEMO DOCUMENT — NOT REAL",
              fill=(200, 200, 200), anchor="lm")


def _save(img, name):
    path = os.path.join(OUTPUT_DIR, name)
    img.save(path, "JPEG", quality=92)
    print(f"  Created: {path}")


def make_passport():
    img, draw = _base_card((230, 235, 245))

    # Header bar
    draw.rectangle([0, 0, W, 80], fill=(30, 60, 120))
    draw.text((W // 2, 40), "SYRIAN ARAB REPUBLIC — PASSPORT", fill="white", anchor="mm")

    # Photo placeholder
    draw.rectangle([40, 110, 200, 280], fill=(180, 180, 180), outline=(100, 100, 100), width=2)
    draw.text((120, 195), "PHOTO", fill=(80, 80, 80), anchor="mm")

    # Fields
    fields = [
        ("Surname / Nom", "HASSAN"),
        ("Given names", "AMIRA FATIMA"),
        ("Nationality", "SYRIAN"),
        ("Date of birth", "14 MAR 1988"),
        ("Place of birth", "ALEPPO"),
        ("Sex", "F"),
        ("Document No.", "SY-A1234567"),
        ("Expiry date", "13 MAR 2028"),
    ]
    y = 110
    for label, value in fields:
        draw.text((220, y), label, fill=(80, 80, 80))
        draw.text((420, y), value, fill=(10, 10, 10))
        y += 28

    # MRZ strip
    draw.rectangle([0, H - 70, W, H - 40], fill=(220, 220, 220))
    draw.text((20, H - 60), "P<SYRHASSANE<<AMIRA<FATIMA<<<<<<<<<<<<<<<<<<", fill=(40, 40, 40))
    draw.text((20, H - 45), "SYA1234567<3SYR8803142F2803133<<<<<<<<<<<<4", fill=(40, 40, 40))

    _watermark(draw)
    _save(img, "synthetic_syrian_passport.jpg")


def make_vaccination_record():
    img, draw = _base_card((250, 255, 250))

    draw.rectangle([0, 0, W, 70], fill=(0, 120, 60))
    draw.text((W // 2, 35), "VACCINATION RECORD / CARNET DE VACCINATION", fill="white", anchor="mm")

    draw.text((40, 90), "Patient name:", fill=(80, 80, 80))
    draw.text((200, 90), "Lina Hassan (D.O.B: 12/06/2019)", fill=(10, 10, 10))

    headers = ["Vaccine", "Date", "Batch No.", "Clinic", "Next due"]
    col_x = [40, 200, 340, 450, 610]
    y = 130
    for i, h in enumerate(headers):
        draw.text((col_x[i], y), h, fill=(0, 100, 50))
    draw.line([40, y + 18, W - 40, y + 18], fill=(180, 180, 180))

    rows = [
        ["MMR", "05/2021", "MM2021-04", "UNHCR Clinic A", "05/2025"],
        ["Polio (OPV)", "08/2021", "OV2021-11", "UNHCR Clinic A", "08/2025"],
        ["Hep B", "10/2021", "HB2021-09", "IRC Medical", "Complete"],
        ["BCG", "12/2019", "BCG19-77", "Damascus GH", "N/A"],
    ]
    y = 160
    for row in rows:
        for i, cell in enumerate(row):
            draw.text((col_x[i], y), cell, fill=(30, 30, 30))
        y += 30

    draw.text((40, y + 20), "Notes:", fill=(80, 80, 80))
    draw.text((120, y + 20), "Child in good health. No adverse reactions recorded.", fill=(30, 30, 30))
    draw.text((40, y + 45), "Issuing officer:", fill=(80, 80, 80))
    draw.text((180, y + 45), "Dr. M. Khalil — UNHCR Medical Unit, Athens", fill=(30, 30, 30))

    _watermark(draw)
    _save(img, "synthetic_vaccination_record.jpg")


def make_eviction_notice():
    img, draw = _base_card((255, 252, 245))

    draw.rectangle([0, 0, W, 70], fill=(180, 40, 40))
    draw.text((W // 2, 35), "NOTICE OF EVICTION / AVIS D'EXPULSION", fill="white", anchor="mm")

    lines = [
        ("Reference:", "GRE-2024-ATH-00812"),
        ("Issued to:", "Amira Fatima Hassan"),
        ("Property address:", "23 Omonia Square, Athens, Greece"),
        ("Issue date:", "15 October 2024"),
        ("Vacate by:", "30 October 2024"),
        ("Issuing authority:", "Athens Municipal Housing Authority"),
        ("Reason:", "Non-payment of temporary accommodation fees (Ref. TEMP-ATH-2024)"),
        ("Right to appeal:", "Submit appeal to housing@athens.gr within 7 days of this notice."),
    ]
    y = 95
    for label, value in lines:
        draw.text((40, y), label, fill=(100, 60, 60))
        draw.text((220, y), value, fill=(30, 30, 30))
        y += 32

    draw.text((40, y + 10), "This is an official legal notice. Failure to comply may result in enforcement action.",
              fill=(120, 0, 0))

    _watermark(draw)
    _save(img, "synthetic_eviction_notice.jpg")


def make_medical_note():
    img, draw = _base_card((255, 255, 250))

    draw.rectangle([0, 0, W, 70], fill=(0, 100, 160))
    draw.text((W // 2, 35), "MEDICAL CONSULTATION NOTE", fill="white", anchor="mm")

    fields = [
        ("Patient:", "Amira F. Hassan, F, DOB 14/03/1988"),
        ("Date:", "22 Oct 2024"),
        ("Clinic:", "IRC Reception Health Post, Athens"),
        ("Presenting complaint:", "Persistent lower back pain (3 weeks), fatigue, mild headaches"),
        ("Medications:", "Ibuprofen 400mg PRN - prescribed 10/10/2024"),
        ("Allergies:", "Penicillin (anaphylaxis - documented 2019)"),
        ("BP:", "118/76 mmHg"),
        ("Temp:", "36.8 C"),
        ("Assessment:", "Likely musculoskeletal pain, stress-related fatigue"),
        ("Plan:", "Rest, analgesia continued, follow-up in 2 weeks. Refer if worsens."),
        ("Clinician:", "Dr. A. Petridis - IRC Medical Volunteer"),
    ]
    y = 90
    for label, value in fields:
        draw.text((40, y), label, fill=(0, 80, 140))
        draw.text((230, y), value, fill=(20, 20, 20))
        draw.line([40, y + 22, W - 40, y + 22], fill=(230, 230, 230))
        y += 28

    _watermark(draw)
    _save(img, "synthetic_medical_note.jpg")


def make_id_card():
    img, draw = _base_card((235, 245, 255))

    draw.rectangle([0, 0, W, 70], fill=(20, 80, 160))
    draw.text((W // 2, 35), "HELLENIC POLICE — ASYLUM SEEKER REGISTRATION CARD", fill="white", anchor="mm")

    draw.rectangle([40, 100, 180, 250], fill=(190, 190, 190), outline=(100, 100, 100), width=2)
    draw.text((110, 175), "PHOTO", fill=(80, 80, 80), anchor="mm")

    fields = [
        ("Surname:", "HASSAN"),
        ("First name:", "AMIRA FATIMA"),
        ("Date of birth:", "14/03/1988"),
        ("Nationality:", "SYRIAN"),
        ("Sex:", "F"),
        ("Card No.:", "GRC-2024-ATH-00182"),
        ("Issue date:", "18 NOV 2024"),
        ("Valid until:", "17 NOV 2025"),
        ("Issuing office:", "Athens RIC — EASO"),
    ]
    y = 100
    for label, value in fields:
        draw.text((200, y), label, fill=(60, 80, 120))
        draw.text((360, y), value, fill=(10, 10, 10))
        y += 26

    draw.rectangle([0, H - 55, W, H - 25], fill=(220, 225, 240))
    draw.text((20, H - 45), "GRC2024ATH00182<HASSAN<<AMIRA<FATIMA<<<<<<<14/03/1988", fill=(40, 40, 80))

    _watermark(draw)
    _save(img, "synthetic_id_card.jpg")


_AUDIO_PHRASES = {
    "en": ("english_sample.wav", "My name is Amira Hassan. I am thirty five years old. I am from Syria. I need help with registration."),
    # macOS voices for Arabic/Ukrainian/Dari use phonetic Latin fallback when native script unsupported
    "ar": ("arabic_sample.wav", "Ismi Amira Hassan. Umri khamsa wa thalathun sana. Ana min Souriya. Ahtaj musaeada fi al-tasjeel."),
    "uk": ("ukrainian_sample.wav", "Mene zvaty Amira Hassan. Meni tridtsyat pyat rokiv. Ya z Syriyi. Meni potribna dopomoha z reyestratsiyu."),
    "fa": ("dari_sample.wav", "Naam-e man Amira Hassan ast. Si o panj sal daram. Man az Souriya hastam. Be komak dar sabt-e naam niyaz daram."),
    "fr": ("french_sample.wav", "Je m appelle Amira Hassan. J ai trente cinq ans. Je viens de Syrie. J ai besoin d aide pour l enregistrement."),
}

_LANG_VOICE_HINTS = {
    "ar": ["aru", "arabic", "tarik", "laila", "maged"],
    "uk": ["ukrainian", "kateryna"],
    "fa": ["persian", "farsi"],
    "fr": ["thomas", "amelie", "aurelie", "french"],
    "en": ["samantha", "daniel", "karen", "alex"],
}


_PYTTSX3_WORKER = """
import sys, pyttsx3
text, out_path, hint = sys.argv[1], sys.argv[2], sys.argv[3]
hints = {
    "en": ["samantha", "daniel", "karen", "alex"],
    "fr": ["thomas", "amelie", "aurelie", "french"],
}
engine = pyttsx3.init()
voices = engine.getProperty("voices")
picked = None
for h in hints.get(hint, hints["en"]):
    for v in voices:
        if h in v.name.lower() or h in v.id.lower():
            picked = v.id
            break
    if picked:
        break
if not picked and voices:
    picked = voices[0].id
if picked:
    engine.setProperty("voice", picked)
engine.setProperty("rate", 150)
engine.save_to_file(text, out_path)
engine.runAndWait()
"""


def make_audio_samples():
    import subprocess
    import sys

    for lang, (filename, phrase) in _AUDIO_PHRASES.items():
        path = os.path.join(OUTPUT_DIR, filename)
        try:
            result = subprocess.run(
                [sys.executable, "-c", _PYTTSX3_WORKER, phrase, path, lang],
                timeout=30,
                capture_output=True,
                text=True,
            )
            if result.returncode != 0:
                raise RuntimeError(result.stderr.strip())
            size_kb = os.path.getsize(path) // 1024 if os.path.exists(path) else 0
            print(f"  Created: {path} ({size_kb} KB)")
        except Exception as e:
            print(f"  Audio skipped for {lang}: {e}")


if __name__ == "__main__":
    print("Generating synthetic sample documents...")
    make_passport()
    make_id_card()
    make_vaccination_record()
    make_eviction_notice()
    make_medical_note()

    # Create eval-expected aliases
    shutil.copy(
        os.path.join(OUTPUT_DIR, "synthetic_syrian_passport.jpg"),
        os.path.join(OUTPUT_DIR, "passport_sample.jpg"),
    )
    shutil.copy(
        os.path.join(OUTPUT_DIR, "synthetic_id_card.jpg"),
        os.path.join(OUTPUT_DIR, "id_card_sample.jpg"),
    )
    print("  Copied: passport_sample.jpg, id_card_sample.jpg (eval aliases)")

    print("\nGenerating multilingual audio samples...")
    make_audio_samples()

    doc_count = len([f for f in os.listdir(OUTPUT_DIR) if not f.endswith(".md")])
    print(f"\nDone. {doc_count} files in {OUTPUT_DIR}/")
    print("\nNote: These are synthetic documents for demo and evaluation only.")
    print("Label them clearly in the demo video: 'SYNTHETIC -- DEMO DOCUMENT -- NOT REAL'")
