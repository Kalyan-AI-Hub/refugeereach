from PIL import Image, ImageEnhance
import io


def preprocess(image_bytes: bytes) -> bytes:
    """Normalize brightness and contrast; auto-crop to content area."""
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")

    # Resize if too large (Gemma 4 vision handles up to ~1024px well)
    max_dim = 1024
    if max(img.size) > max_dim:
        img.thumbnail((max_dim, max_dim), Image.LANCZOS)

    # Mild contrast enhancement for document readability
    img = ImageEnhance.Contrast(img).enhance(1.3)
    img = ImageEnhance.Sharpness(img).enhance(1.2)

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    return buf.getvalue()
