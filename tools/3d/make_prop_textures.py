# 소품에 붙는 글자 그림을 만든다 (Blender 밖에서, PIL로). 결과는 tools/_raw/3d/tex/ 에 둔다.
#   python tools/3d/make_prop_textures.py
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT = os.path.join(os.path.dirname(__file__), "..", "_raw", "3d", "tex")
os.makedirs(OUT, exist_ok=True)
FONT, BOLD = r"C:\Windows\Fonts\malgun.ttf", r"C:\Windows\Fonts\malgunbd.ttf"
f = lambda size, bold=False: ImageFont.truetype(BOLD if bold else FONT, size)

def pen_label():
    """사인펜 몸통을 한 바퀴 감는 라벨. 가로 = 펜 길이(95mm), 세로 = 둘레(34.5mm). 가운데 줄이 정면이다."""
    W, H = 1408, 512
    im = Image.new("RGB", (W, H), (242, 240, 234))
    d = ImageDraw.Draw(im)
    y0 = H // 2 - 70   # 정면 띠
    d.text((120, y0 + 6), "컴퓨터용 사인펜", font=f(64, True), fill=(24, 25, 30))
    d.text((124, y0 + 88), "OMR 답안지 전용 · 수성 · 흑색", font=f(30), fill=(60, 62, 70))
    d.rectangle((60, y0, 84, y0 + 128), fill=(196, 52, 40))                    # 붉은 띠
    d.rectangle((760, y0 + 8, 760 + 112, y0 + 120), fill=(8, 8, 10))           # 검은 네모: 인쇄처럼 보이는 화면
    for i, w in enumerate((300, 220, 260)):                                     # 바코드 자리의 가는 줄
        d.rectangle((930, y0 + 18 + i * 36, 930 + w, y0 + 30 + i * 36), fill=(30, 31, 36))
    d.text((930, y0 - 52), "시험장 지급품", font=f(28), fill=(110, 112, 120))
    for x in range(1270, 1380, 9):                                              # 바코드
        d.rectangle((x, y0 + 4, x + (3 if x % 2 else 5), y0 + 124), fill=(24, 25, 30))
    im.save(os.path.join(OUT, "pen_label.png"))

def check_sticker(extra):
    """화재감지기 점검표. 마지막 줄이 시험 전날 21:40 '오'. extra면 한 줄 더(장치를 거둬 간 새벽)."""
    W, H = 768, 512
    im = Image.new("RGB", (W, H), (236, 228, 196))
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, W, 86), fill=(176, 40, 34))
    d.text((24, 14), "소방시설 점검표", font=f(50, True), fill=(250, 244, 230))
    d.text((520, 34), "화재감지기 배관", font=f(26), fill=(250, 226, 210))
    cols = (24, 250, 470, 744)
    for i, name in enumerate(("점검일", "시각", "점검자")):
        d.text((cols[i] + 12, 100), name, font=f(30, True), fill=(60, 40, 30))
    rows = [("9월 정기", "10:20", "김"), ("10월 정기", "10:05", "김"), ("시험 전날", "21:40", "오")]
    if extra:
        rows.append(("재점검", "05:00", "오"))
    ys = [148 + i * 84 for i in range(5)]
    for y in ys:
        d.line((24, y, 744, y), fill=(120, 96, 70), width=3)
    for x in cols:
        d.line((x, 96, x, ys[-1]), fill=(120, 96, 70), width=3)
    pen = (28, 44, 120)   # 볼펜으로 눌러 쓴 글씨
    for i, row in enumerate(rows):
        for j, cell in enumerate(row):
            d.text((cols[j] + 16 + (i * 5) % 9, ys[i] + 14 + (j * 3) % 5), cell, font=f(46 if j else 40, True), fill=pen)
    im = im.filter(ImageFilter.GaussianBlur(0.6))
    im.save(os.path.join(OUT, "check_sticker_empty.png" if extra else "check_sticker.png"))

def display():
    """기판의 작은 화면: 가동 시간. 시험 날 05:40에 켜져 서른여섯 시간째 돌고 있다."""
    W, H = 256, 128
    im = Image.new("RGB", (W, H), (2, 4, 8))
    d = ImageDraw.Draw(im)
    mono = ImageFont.truetype(r"C:\Windows\Fonts\consolab.ttf", 30)
    small = ImageFont.truetype(r"C:\Windows\Fonts\consola.ttf", 20)
    d.text((12, 8), "UPTIME", font=small, fill=(90, 190, 255))
    d.text((150, 8), "REC \u25cf", font=small, fill=(255, 90, 80))
    d.text((12, 40), "36:14:09", font=ImageFont.truetype(r"C:\Windows\Fonts\consolab.ttf", 46), fill=(150, 220, 255))
    d.text((12, 96), "IR TX  OK   MIC OK", font=small, fill=(90, 190, 255))
    im.save(os.path.join(OUT, "device_display.png"))

pen_label(); check_sticker(False); check_sticker(True); display()
print(sorted(os.listdir(OUT)))
