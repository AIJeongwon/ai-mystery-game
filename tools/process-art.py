# 원본 이미지(tools/_raw) → 웹용 에셋(public/assets):  python tools/process-art.py
import os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "_raw")
OUT = os.path.join(HERE, "..", "public", "assets")


def save(img, path, quality):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.convert("RGB").save(path, "JPEG", quality=quality, optimize=True, progressive=True)


count = 0
for name in sorted(os.listdir(os.path.join(RAW, "bg"))):
    img = Image.open(os.path.join(RAW, "bg", name))
    w, h = img.size
    if w > 1920:
        img = img.resize((1920, round(h * 1920 / w)), Image.LANCZOS)
    save(img, os.path.join(OUT, "bg", os.path.splitext(name)[0] + ".jpg"), 82)
    count += 1

for name in sorted(os.listdir(os.path.join(RAW, "portrait"))):
    img = Image.open(os.path.join(RAW, "portrait", name))
    w, h = img.size
    stem = os.path.splitext(name)[0]
    full = img.resize((600, round(h * 600 / w)), Image.LANCZOS)
    save(full, os.path.join(OUT, "portrait", stem + ".jpg"), 84)
    # 얼굴 중심 정사각 썸네일 (위쪽 62% 영역)
    side = min(w, round(h * 0.7))
    left = (w - side) // 2
    top = round(h * 0.04)
    thumb = img.crop((left, top, left + side, top + side)).resize((192, 192), Image.LANCZOS)
    save(thumb, os.path.join(OUT, "portrait", "thumb", stem + ".jpg"), 82)
    count += 1

print("처리 완료:", count, "장")
