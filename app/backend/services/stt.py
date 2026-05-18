import tempfile
import os

_model = None


def _ensure_ffmpeg():
    """Add imageio-ffmpeg binary dir to PATH if system ffmpeg is missing."""
    if os.environ.get("_FFMPEG_PATCHED"):
        return
    import shutil
    if shutil.which("ffmpeg"):
        os.environ["_FFMPEG_PATCHED"] = "1"
        return
    try:
        import imageio_ffmpeg
        ffmpeg_path = imageio_ffmpeg.get_ffmpeg_exe()
        bin_dir = os.path.dirname(ffmpeg_path)
        os.environ["PATH"] = bin_dir + os.pathsep + os.environ.get("PATH", "")
    except Exception:
        pass
    os.environ["_FFMPEG_PATCHED"] = "1"


def _get_model():
    global _model
    if _model is None:
        _ensure_ffmpeg()
        import whisper  # lazy — avoids torch CUDA hang at uvicorn startup
        _model = whisper.load_model("base")
    return _model


def transcribe(audio_bytes: bytes, hint_language=None) -> dict:
    """Returns {"text": str, "language": str, "confidence": float}"""
    model = _get_model()
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        f.write(audio_bytes)
        tmp_path = f.name
    try:
        options = {}
        if hint_language:
            options["language"] = hint_language
        result = model.transcribe(tmp_path, **options)
        return {
            "text": result["text"].strip(),
            "language": result.get("language", "unknown"),
            "confidence": _avg_confidence(result.get("segments", [])),
        }
    finally:
        os.unlink(tmp_path)


def _avg_confidence(segments: list) -> float:
    if not segments:
        return 0.0
    scores = [abs(s.get("avg_logprob", -1.0)) for s in segments]
    return round(1.0 - min(sum(scores) / len(scores), 1.0), 2)
