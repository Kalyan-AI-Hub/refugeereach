"""
Generate a synthetic Arabic passport image for demo purposes.
Fields are in Arabic; Gemma 4 vision will extract them into English.
SYNTHETIC DEMO DOCUMENT — NOT REAL
"""
from PIL import Image, ImageDraw, ImageFont
import arabic_reshaper
from bidi.algorithm import get_display
import os

OUT_PATH = os.path.join(os.path.dirname(__file__), "../data/sample_documents/synthetic_arabic_passport.jpg")

W, H = 900, 640
DARK_BLUE = (13, 51, 99)
MID_BLUE = (24, 90, 157)
LIGHT_GRAY = (240, 244, 250)
WHITE = (255, 255, 255)
GOLD = (196, 160, 60)
TEXT_DARK = (30, 30, 60)
RED_STAMP = (160, 30, 30)
MRZ_BG = (220, 228, 240)

def arabic(text):
    return get_display(arabic_reshaper.reshape(text))

def get_font(size, bold=False):
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
        "/System/Library/Fonts/Supplemental/GeezaPro.ttc",
        "/System/Library/Fonts/Supplemental/GeezaPro-Bold.ttc",
        "/Library/Fonts/Arial Unicode MS.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()

img = Image.new("RGB", (W, H), LIGHT_GRAY)
draw = ImageDraw.Draw(img)

# Header band
draw.rectangle([(0, 0), (W, 90)], fill=DARK_BLUE)
# Sub-band
draw.rectangle([(0, 90), (W, 110)], fill=GOLD)

# Title: Syrian Arab Republic in Arabic
title_ar = arabic("الجمهورية العربية السورية")
sub_ar = arabic("جواز سفر")
f_title = get_font(32)
f_sub = get_font(22)
f_label = get_font(15)
f_value = get_font(17)
f_mrz = get_font(14)
f_small = get_font(12)

tw = draw.textlength(title_ar, font=f_title)
draw.text(((W - tw) / 2, 18), title_ar, font=f_title, fill=WHITE)
sw = draw.textlength(sub_ar, font=f_sub)
draw.text(((W - sw) / 2, 58), sub_ar, font=f_sub, fill=GOLD)

# Divider label below gold band
passport_type_ar = arabic("نوع الوثيقة: جواز سفر عادي  |  رمز الدولة: SYR")
ptw = draw.textlength(passport_type_ar, font=f_small)
draw.text(((W - ptw) / 2, 114), passport_type_ar, font=f_small, fill=TEXT_DARK)

# Photo box
draw.rectangle([(40, 130), (200, 310)], fill=(200, 205, 215), outline=(150, 155, 165), width=2)
draw.text((85, 210), "PHOTO", font=f_label, fill=(120, 120, 140))

# Fields — Arabic labels on the right side (RTL layout), values on the left
fields = [
    ("اللقب",            "HASSAN"),
    ("الاسم",            "AMIRA FATIMA"),
    ("الجنسية",          "SYRIAN / سورية"),
    ("تاريخ الميلاد",    "14 MAR 1988"),
    ("محل الميلاد",      "ALEPPO / حلب"),
    ("الجنس",            "أنثى / F"),
    ("رقم الوثيقة",      "SY-A1234567"),
    ("تاريخ الانتهاء",   "13 MAR 2028"),
]

y = 138
row_h = 20
for label_ar_raw, value in fields:
    label_rtl = arabic(label_ar_raw)
    # Draw label (Arabic, right-aligned visually)
    lw = draw.textlength(label_rtl, font=f_label)
    draw.text((W - 40 - lw, y), label_rtl, font=f_label, fill=MID_BLUE)
    # Draw value (Latin, left side after photo)
    draw.text((220, y), value, font=f_value, fill=TEXT_DARK)
    # Thin separator
    draw.line([(220, y + row_h + 2), (W - 40, y + row_h + 2)], fill=(200, 208, 220), width=1)
    y += row_h + 10

# Stamp circle
stamp_x, stamp_y, stamp_r = 150, 380, 52
draw.ellipse([(stamp_x - stamp_r, stamp_y - stamp_r), (stamp_x + stamp_r, stamp_y + stamp_r)],
             outline=RED_STAMP, width=3)
inner = 40
draw.ellipse([(stamp_x - inner, stamp_y - inner), (stamp_x + inner, stamp_y + inner)],
             outline=RED_STAMP, width=1)
stamp_text = arabic("طابع رسمي")
stw = draw.textlength(stamp_text, font=f_small)
draw.text((stamp_x - stw / 2, stamp_y - 8), stamp_text, font=f_small, fill=RED_STAMP)

# Issuing authority line
auth_ar = arabic("وزارة الداخلية — مديرية الجوازات والهجرة والجنسية")
aw = draw.textlength(auth_ar, font=f_small)
draw.text(((W - aw) / 2, 460), auth_ar, font=f_small, fill=TEXT_DARK)

# MRZ band
draw.rectangle([(0, H - 100), (W, H - 60)], fill=MRZ_BG)
draw.rectangle([(0, H - 60), (W, H)], fill=MRZ_BG)
mrz1 = "P<SYRHASSANE<<AMIRA<FATIMA<<<<<<<<<<<<<<<<<<"
mrz2 = "SYA1234567<3SYR8803142F2803133<<<<<<<<<<<4"
draw.text((20, H - 96), mrz1, font=f_mrz, fill=(60, 70, 100))
draw.text((20, H - 72), mrz2, font=f_mrz, fill=(60, 70, 100))

# Watermark
wm = "SYNTHETIC ‖ DEMO DOCUMENT ‖ NOT REAL"
wmw = draw.textlength(wm, font=f_small)
draw.text(((W - wmw) / 2, H - 18), wm, font=f_small, fill=(160, 165, 180))

img.save(OUT_PATH, "JPEG", quality=92)
print(f"Saved: {OUT_PATH}")
