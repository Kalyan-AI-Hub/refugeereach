import os
import sys
import subprocess
import tempfile

# macOS voice search hints — matched against voice.name (case-insensitive)
_LANG_HINTS = {
    "ar": ["aru", "arabic", "tarik", "laila", "maged"],
    "uk": ["ukrainian", "kateryna", "slavic"],
    "fa": ["persian", "farsi", "dari"],
    "fr": ["french", "thomas", "amelie", "aurelie"],
    "en": ["daniel", "samantha", "english", "karen", "alex"],
}

# Run each synthesis in a fresh subprocess to avoid pyttsx3 singleton issues
_WORKER = r"""
import sys, os, pyttsx3

text, out_path, language = sys.argv[1], sys.argv[2], sys.argv[3]

hints = {
    "ar": ["aru", "arabic", "tarik", "laila", "maged"],
    "uk": ["ukrainian", "kateryna", "slavic"],
    "fa": ["persian", "farsi", "dari"],
    "fr": ["french", "thomas", "amelie", "aurelie"],
    "en": ["daniel", "samantha", "english", "karen", "alex"],
}

try:
    engine = pyttsx3.init()
    voices = engine.getProperty("voices")
    lang_hints = hints.get(language, hints["en"])
    chosen = None
    for hint in lang_hints:
        for voice in voices:
            if hint in voice.name.lower() or hint in voice.id.lower():
                chosen = voice.id
                break
        if chosen:
            break
    if not chosen and voices:
        chosen = voices[0].id
    if chosen:
        engine.setProperty("voice", chosen)
    engine.setProperty("rate", 160)
    engine.save_to_file(text, out_path)
    engine.runAndWait()
except Exception as e:
    sys.exit(1)
"""


def _ffmpeg_exe() -> str:
    """Return a usable ffmpeg binary path."""
    import shutil
    return shutil.which("ffmpeg") or "ffmpeg"


def _to_pcm_wav(src_path: str) -> bytes:
    """Transcode any audio file (e.g. macOS AIFF-C) to 16-bit 44100 Hz PCM WAV."""
    out_path = src_path + "_pcm.wav"
    try:
        subprocess.run(
            [_ffmpeg_exe(), "-y", "-i", src_path,
             "-ar", "44100", "-ac", "1", "-sample_fmt", "s16",
             out_path],
            timeout=15,
            capture_output=True,
        )
        with open(out_path, "rb") as f:
            return f.read()
    finally:
        try:
            os.unlink(out_path)
        except OSError:
            pass


def synthesize(text: str, language: str = "en") -> bytes:
    """Returns PCM WAV bytes playable in any browser."""
    if not text or not text.strip():
        return b""
    try:
        with tempfile.NamedTemporaryFile(suffix=".aiff", delete=False) as f:
            tmp_path = f.name
        try:
            result = subprocess.run(
                [sys.executable, "-c", _WORKER, text[:500], tmp_path, language],
                timeout=20,
                capture_output=True,
                text=True,
            )
            if result.returncode != 0:
                return b""
            data = _to_pcm_wav(tmp_path)
            return data if len(data) > 1000 else b""
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
    except Exception:
        return b""
