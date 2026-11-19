# 프롤로그 네 장소에 붙는 글자 그림을 만든다 (Blender 밖에서, Pillow로). 결과는 tools/_raw/3d/tex/pl_*.png.
#   python tools/3d/make_prologue_textures.py
# 글은 사건 데이터(public/js/data/sites/prologue.js)의 문장과 같아야 한다: 게시판을 살펴보면 자막이 같은 내용을 읽어 준다.
# 사람, 학원, 업체, 학교의 이름은 모두 지어낸 것이다. 실제 문항이나 상표는 그리지 않는다.
import json, math, os, random
from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageFilter

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "_raw", "3d", "tex")
os.makedirs(OUT, exist_ok=True)
FONT, BOLD = r"C:\Windows\Fonts\malgun.ttf", r"C:\Windows\Fonts\malgunbd.ttf"
HAND = next((p for p in (r"C:\Windows\Fonts\HMKMAMI.TTF", r"C:\Windows\Fonts\H2PORM.TTF", FONT) if os.path.exists(p)), FONT)
f = lambda size, bold=False: ImageFont.truetype(BOLD if bold else FONT, size)
hand = lambda size: ImageFont.truetype(HAND, size)
rnd = random.Random(1114)
INK, GREY, RED, NAVY = (26, 27, 32), (110, 112, 120), (190, 44, 34), (24, 44, 92)


def new(w, h, color=(246, 245, 240)):
    im = Image.new("RGB", (w, h), color)
    return im, ImageDraw.Draw(im)


def save(im, name, soften=0.0):
    if soften:
        im = im.filter(ImageFilter.GaussianBlur(soften))
    im.save(os.path.join(OUT, "pl_%s.png" % name))


def center(d, xy, text, font, fill=INK):
    d.text(xy, text, font=font, fill=fill, anchor="mm")


def lines(d, x0, x1, y0, n, gap, fill=(150, 152, 158), short=0.35, h=4):
    """읽을 수 없는 본문: 길이가 다른 회색 줄."""
    for i in range(n):
        w = (x1 - x0) * (1 - rnd.random() * short)
        d.rectangle((x0, y0 + i * gap, x0 + w, y0 + i * gap + h), fill=fill)


def laptop():
    """노트북 화면: 밤사이 메신저에 쌓인 두 마디."""
    im, d = new(960, 600, (22, 26, 34))
    d.rectangle((0, 0, 960, 44), fill=(34, 40, 52))
    d.text((18, 9), "메신저 · 사회부", font=f(22, True), fill=(210, 214, 222))
    d.rectangle((0, 44, 250, 600), fill=(28, 33, 43))
    for i, name in enumerate(("사회부 데스크", "제보 채널", "윤 선배", "교육 담당")):
        d.rectangle((0, 60 + i * 64, 250, 118 + i * 64), fill=(40, 48, 64) if i == 0 else (28, 33, 43))
        d.ellipse((16, 72 + i * 64, 50, 106 + i * 64), fill=(70, 84, 110))
        d.text((64, 76 + i * 64), name, font=f(20), fill=(200, 205, 214))
    for y, who, msg, t in ((120, "데스크", "「전부 검거」 — 교육청 보도자료 떴다. 확인해.", "어젯밤 11:42"), (260, "제보 채널", "「기적의 재수」 — 목동 학원 블로그. 이거 좀 이상함.", "오늘 01:17")):
        d.text((290, y - 30), who + "  ·  " + t, font=f(17), fill=(130, 138, 152))
        d.rounded_rectangle((286, y, 900, y + 78), 14, fill=(52, 62, 82))
        d.text((306, y + 22), msg, font=f(24), fill=(236, 238, 242))
    d.rounded_rectangle((286, 520, 930, 568), 10, fill=(36, 42, 54))
    d.text((304, 532), "메시지 입력", font=f(20), fill=(100, 108, 122))
    save(im, "laptop")


def news():
    """벽의 판에 붙인 신문 스크랩 (읽히지 않는 본문)."""
    im, d = new(420, 600, (232, 228, 214))
    d.rectangle((24, 24, 396, 30), fill=INK)
    d.text((24, 40), "일간 세한", font=f(30, True), fill=INK)
    d.text((24, 92), "수능 부정행위 일당", font=f(34, True), fill=INK)
    d.text((24, 136), "「전부 검거」", font=f(34, True), fill=INK)
    d.rectangle((24, 190, 200, 300), fill=(150, 150, 146))
    lines(d, 214, 396, 192, 10, 11)
    for c in range(2):
        lines(d, 24 + c * 190, 200 + c * 190, 320, 22, 11)
    save(im, "news", 0.4)


def calendar():
    im, d = new(480, 420, (250, 249, 245))
    d.rectangle((0, 0, 480, 70), fill=(176, 40, 34))
    d.text((24, 12), "11", font=f(44, True), fill=(255, 255, 255))
    d.text((90, 30), "NOVEMBER", font=f(20), fill=(255, 230, 226))
    for i, w in enumerate("일월화수목금토"):
        center(d, (40 + i * 66, 96), w, f(20, True), RED if i == 0 else (NAVY if i == 6 else INK))
    day, col = 1, 5                                    # 1일이 금요일
    row = 0
    while day <= 30:
        x, y = 40 + col * 66, 140 + row * 54
        center(d, (x, y), str(day), f(22), RED if col == 0 else INK)
        if day == 14:
            d.ellipse((x - 24, y - 22, x + 24, y + 22), outline=RED, width=4)
            d.text((x - 20, y + 22), "수능", font=hand(18), fill=RED)
        day += 1
        col += 1
        if col == 7:
            col, row = 0, row + 1
    save(im, "calendar")


SURNAMES = "김이박최정강조윤장임한오서신권황안송"
GIVEN = "준우현서지민수연태윤하은도진예린승호"


def rank(name, title):
    """성적 우수자 서른 명. 한도현은 없다 (이름 가운데 글자를 가렸으므로 '한○현'이 없어야 한다)."""
    im, d = new(600, 840)
    d.rectangle((0, 0, 600, 96), fill=NAVY)
    center(d, (300, 34), "서로재수학원", f(22), (200, 210, 235))
    center(d, (300, 68), title, f(30, True), (255, 255, 255))
    d.text((40, 112), "석차", font=f(18, True), fill=GREY)
    d.text((120, 112), "이름", font=f(18, True), fill=GREY)
    d.text((250, 112), "반", font=f(18, True), fill=GREY)
    d.text((340, 112), "국 · 수 · 영 등급", font=f(18, True), fill=GREY)
    d.line((30, 140, 570, 140), fill=INK, width=2)
    used = set()
    for i in range(30):
        while True:
            nm = rnd.choice(SURNAMES) + "○" + rnd.choice(GIVEN)
            if nm not in used and nm != "한○현":
                used.add(nm)
                break
        y = 150 + i * 22.4
        if i % 2:
            d.rectangle((30, y - 1, 570, y + 21), fill=(236, 236, 230))
        d.text((48, y), "%2d" % (i + 1), font=f(17), fill=INK)
        d.text((120, y), nm, font=f(17), fill=INK)
        d.text((250, y), rnd.choice("ABCD") + "반", font=f(17), fill=INK)
        g = [1, 1, 1] if i < 12 else [rnd.choice((1, 2)) for _ in range(3)]
        d.text((360, y), " · ".join(map(str, g)), font=f(17), fill=INK)
    d.text((40, 826 - 14), "※ 개인정보 보호를 위해 이름 가운데 글자를 가렸습니다.", font=f(13), fill=GREY)
    save(im, name)


def banner_academy():
    im, d = new(1408, 448, (196, 30, 26))
    d.rectangle((0, 0, 1408, 16), fill=(250, 214, 60))
    d.rectangle((0, 432, 1408, 448), fill=(250, 214, 60))
    center(d, (704, 120), "기적의 재수!", f(120, True), (255, 236, 90))
    center(d, (704, 262), "5·6·5·4·5  →  전 과목 1등급", f(84, True), (255, 255, 255))
    center(d, (704, 372), "서로재수학원 재원생  ·  올해 수능 가채점", f(40), (255, 220, 214))
    save(im, "banner_academy")


def plate(name, text, w, h, bg, fg, size, sub=None, radius=0, border=None):
    im, d = new(w, h, bg)
    if border:
        d.rectangle((4, 4, w - 5, h - 5), outline=border, width=4)
    center(d, (w / 2, h / 2 - (size * 0.3 if sub else 0)), text, f(size, True), fg)
    if sub:
        center(d, (w / 2, h / 2 + size * 0.62), sub, f(int(size * 0.34)), fg)
    save(im, name)


def plate_vertical(name, text, w, h, bg, fg, size):
    im, d = new(w, h, bg)
    d.rectangle((6, 6, w - 7, h - 7), outline=(60, 44, 20), width=5)
    step = (h - 80) / len(text)
    for i, ch in enumerate(text):
        center(d, (w / 2, 40 + step * (i + 0.5)), ch, f(size, True), fg)
    save(im, name)


def exam_banner():
    im, d = new(2080, 280, (250, 250, 248))
    d.rectangle((0, 0, 2080, 10), fill=NAVY)
    d.rectangle((0, 270, 2080, 280), fill=NAVY)
    center(d, (1040, 140), "대학수학능력시험 시험장  ·  목원고등학교", f(104, True), INK)
    save(im, "exam_banner")


def schedule():
    """행정실 게시판의 시설 점검 일정 — 카드 P13이 되는 것. 두 줄이 3층이다."""
    im, d = new(600, 800)
    d.rectangle((0, 0, 600, 90), fill=(52, 56, 62))
    center(d, (300, 46), "시설 점검 일정 (용역)", f(36, True), (255, 255, 255))
    d.text((36, 108), "목원고등학교 행정실  ·  11월 둘째 주", font=f(18), fill=GREY)
    rows = [("화", "14:00", "소방 펌프 점검", "지하"), ("수", "21:00", "화재감지기 점검", "3층"), ("목", "—", "대학수학능력시험 (점검 없음)", ""),
            ("금", "16:00", "방송 설비 회수", "전 층"), ("토", "05:00", "화재감지기 재점검", "3층"), ("토", "10:00", "승강기 정기 점검", "본관")]
    d.line((30, 150, 570, 150), fill=INK, width=3)
    for i, (day, t, what, where) in enumerate(rows):
        y = 164 + i * 84
        hot = where == "3층"
        if hot:
            d.rectangle((30, y - 8, 570, y + 62), fill=(250, 238, 200))
        d.text((44, y), day, font=f(32, True), fill=RED if hot else INK)
        d.text((100, y + 2), t, font=f(30, True), fill=INK)
        d.text((220, y + 4), what, font=f(26, hot), fill=INK)
        d.text((500, y + 4), where, font=f(26, True), fill=RED if hot else GREY)
        d.line((30, y + 66, 570, y + 66), fill=(190, 190, 186), width=1)
    d.text((36, 690), "※ 점검 인원은 용역 업체가 정합니다.", font=f(20), fill=GREY)
    d.text((36, 722), "※ 야간·새벽 점검은 당직실에 열쇠를 반납합니다.", font=f(20), fill=GREY)
    d.ellipse((440, 690, 540, 790), outline=(196, 60, 50), width=5)
    center(d, (490, 740), "행정실", f(22, True), (196, 60, 50))
    save(im, "schedule")


def notice(name, title, body, accent=NAVY, big=None):
    im, d = new(600, 800)
    d.rectangle((0, 0, 600, 84), fill=accent)
    center(d, (300, 42), title, f(34, True), (255, 255, 255))
    y = 116
    if big:
        for ln in big:
            center(d, (300, y + 26), ln, f(44, True), INK)
            y += 70
        y += 16
    for ln in body:
        d.text((44, y), ln, font=f(22), fill=INK)
        y += 38
    lines(d, 44, 556, y + 18, max(0, (720 - y) // 20), 20)
    save(im, name)


def bin_note():
    im, d = new(640, 400, (252, 248, 214))
    for y, t in ((70, "새 필통 버리신 분,"), (160, "경비실에 보관 중."), (250, "수험표 들어 있음.")):
        d.text((44, y), t, font=hand(64), fill=(30, 40, 110))
    d.text((430, 330), "107동 경비", font=hand(36), fill=(30, 40, 110))
    d.rectangle((0, 0, 640, 26), fill=(214, 206, 160))          # 테이프
    save(im.rotate(-1.5, expand=False, fillcolor=(252, 248, 214)), "bin_note")


def stair_sign():
    im, d = new(960, 320, (250, 250, 246))
    d.rectangle((0, 0, 960, 320), outline=RED, width=14)
    center(d, (480, 80), "3층 시험실 구역", f(64, True), RED)
    center(d, (480, 170), "감독 보고서 확인 중", f(50, True), INK)
    center(d, (480, 250), "관계자 외 출입 금지", f(50, True), INK)
    save(im, "stair_sign")


def flyer():
    """우편함의 입시 컨설팅 전단. 업체 이름 자리만 손으로 뜯겨 있다."""
    im, d = new(420, 594, (255, 252, 240))
    d.rectangle((0, 0, 420, 150), fill=(20, 60, 120))
    d.polygon([(40, 30), (380, 22), (372, 118), (300, 126), (250, 108), (180, 128), (96, 112), (34, 124)], fill=(214, 206, 190))   # 뜯긴 자리(뒤의 우편함이 비친다)
    center(d, (210, 200), "두 달이면 충분합니다", f(34, True), (20, 60, 120))
    center(d, (210, 252), "1:1 입시 컨설팅", f(40, True), RED)
    for i, t in enumerate(("· 맞춤 학습 설계", "· 수능 직전 집중 관리", "· 상담은 추천 코드로만")):
        d.text((60, 310 + i * 46), t, font=f(26), fill=INK)
    lines(d, 60, 360, 470, 4, 20)
    save(im, "flyer")


def mailbox():
    """우편함 앞면: 두 줄 다섯 칸. 103호에 전단이 꽂혀 있다."""
    im, d = new(1150, 350, (150, 154, 158))
    for r in range(2):
        for c in range(5):
            x, y = 12 + c * 228, 10 + r * 170
            d.rectangle((x, y, x + 214, y + 156), fill=(176, 180, 184), outline=(96, 98, 102), width=3)
            d.rectangle((x + 30, y + 22, x + 184, y + 38), fill=(40, 42, 46))            # 투입구
            d.rectangle((x + 70, y + 104, x + 144, y + 140), fill=(236, 236, 230))
            no = "%d0%d" % (r + 1, c + 1)
            center(d, (x + 107, y + 122), no + "호", f(24, True), INK)
            if no == "103":
                d.polygon([(x + 40, y + 2), (x + 150, y + 0), (x + 152, y + 30), (x + 42, y + 30)], fill=(255, 252, 240))
                d.polygon([(x + 60, y + 6), (x + 176, y + 10), (x + 172, y + 30), (x + 58, y + 30)], fill=(20, 60, 120))
    save(im, "mailbox")


def namecard():
    im, d = new(256, 96, (250, 250, 246))
    d.rectangle((0, 0, 256, 96), outline=GREY, width=3)
    center(d, (128, 30), "B반 · 17번", f(18), GREY)
    center(d, (128, 64), "한 도 현", f(30, True), INK)
    save(im, "namecard")


def sheet(name, dense):
    """책상 위의 수학 연습지. 문제는 읽히지 않는 줄. dense면 여백에 풀이가 빽빽하다(건너편 자리)."""
    im, d = new(420, 594, (250, 249, 244))
    for q in range(5):
        y = 40 + q * 108
        d.text((26, y - 4), "%d." % (26 + q), font=f(18, True), fill=INK)
        lines(d, 60, 380, y, 3, 12, fill=(70, 72, 78), h=3)
        if dense:
            for k in range(26):
                x0, y0 = rnd.randint(60, 340), y + 42 + rnd.randint(0, 50)
                pts = [(x0 + i * 6, y0 + rnd.randint(-5, 5)) for i in range(rnd.randint(3, 10))]
                d.line(pts, fill=(70, 74, 96), width=1)
            d.line((70, y + 60, 200, y + 76), fill=(120, 120, 130), width=2)        # 지운 자국
        d.text((330, y + 70), "답 " + str(rnd.randint(2, 48)), font=hand(24), fill=(40, 44, 90))
    save(im, name, 0.3)


def parcel_label():
    im, d = new(512, 320, (250, 250, 246))
    d.rectangle((0, 0, 512, 320), outline=INK, width=3)
    d.text((20, 14), "보내는 분", font=f(20, True), fill=INK)
    d.rectangle((20, 46, 492, 108), outline=GREY, width=2)
    d.text((20, 122), "받는 분", font=f(20, True), fill=INK)
    d.text((28, 158), "서울 마포구 망원동 · 옥탑", font=f(24), fill=INK)
    for x in range(30, 300, 7):
        d.rectangle((x, 230, x + (2 if x % 3 else 4), 300), fill=INK)
    d.text((330, 248), "취급 주의", font=f(26, True), fill=RED)
    save(im, "parcel_label")


def elevator():
    im, d = new(512, 768, (150, 152, 154))
    d.rectangle((40, 60, 252, 760), fill=(176, 178, 180), outline=(90, 92, 94), width=3)
    d.rectangle((260, 60, 472, 760), fill=(176, 178, 180), outline=(90, 92, 94), width=3)
    d.rectangle((196, 12, 316, 48), fill=(16, 18, 20))
    center(d, (256, 30), "1", f(26, True), (255, 120, 40))
    save(im, "elevator", 0.6)


# ═══════════ 열람 소품의 그림 (가까이 들여다보는 것들: 크게 그린다) ═══════════
SERIF = r"C:\Windows\Fonts\batang.ttc"
TIMES, TIMES_I = r"C:\Windows\Fonts\times.ttf", r"C:\Windows\Fonts\timesi.ttf"
serif = lambda size: ImageFont.truetype(SERIF, size, index=0)


def grain(im, amount=5, blur=0.6, seed=7):
    """종이의 결: 고운 얼룩을 얹는다."""
    w, h = im.size
    n = Image.frombytes("L", (w // 2, h // 2), random.Random(seed).randbytes((w // 2) * (h // 2)))
    n = n.point(lambda v: 128 - amount + v * 2 * amount // 255).resize((w, h), Image.BILINEAR).filter(ImageFilter.GaussianBlur(blur))
    return Image.merge("RGB", [ImageChops.add(c, n, 1.0, -128) for c in im.split()])


def rich(d, x, y, text, size, fill=INK, draw=True):
    """수식이 섞인 한 줄. $...$ 안은 수식: 글자는 기울이고, ^{..}는 위첨자, _{..}는 아래첨자. 그린 너비를 돌려준다."""
    body, up, it = serif(size), ImageFont.truetype(TIMES, int(size * 1.06)), ImageFont.truetype(TIMES_I, int(size * 1.08))
    up_s, it_s = ImageFont.truetype(TIMES, int(size * 0.66)), ImageFont.truetype(TIMES_I, int(size * 0.68))
    x0, math, i = x, False, 0
    while i < len(text):
        ch = text[i]
        if ch == "$":
            math = not math
            i += 1
            continue
        if ch == "\\":                                           # \\{ 처럼 글자 그대로 쓸 것
            i += 1
            ch = text[i]
        elif math and ch in "^_" and text[i + 1] == "{":
            j = text.index("}", i)
            dy = -size * 0.34 if ch == "^" else size * 0.36
            for c2 in text[i + 2:j]:
                fnt = it_s if c2.isalpha() else up_s
                if draw:
                    d.text((x, y + dy + size * 0.30), c2, font=fnt, fill=fill)
                x += d.textlength(c2, font=fnt)
            x += size * 0.04
            i = j + 1
            continue
        if math:
            fnt = it if (ch.isalpha() and ch.isascii()) else up
            if ch in "=+-<>":
                x += size * 0.16
            if draw:
                d.text((x, y - size * 0.02), "−" if ch == "-" else ch, font=fnt, fill=fill)
            x += d.textlength("−" if ch == "-" else ch, font=fnt)
            if ch == "f":
                x += size * 0.12
            if ch in "=+-<>,":
                x += size * 0.16
        else:
            if draw:
                d.text((x, y), ch, font=body, fill=fill)
            x += d.textlength(ch, font=body)
        i += 1
    return x - x0


def ticket():
    """수험표. 필통 안에 들어 있다. 사진 자리는 빈 윤곽뿐이다(사람의 얼굴을 그리지 않는다)."""
    W, H = 1240, 700
    im, d = new(W, H, (248, 246, 238))
    d.rectangle((0, 0, W, 112), fill=(34, 52, 104))
    center(d, (W // 2, 58), "대학수학능력시험  수 험 표", f(54, True), (255, 255, 255))
    d.rectangle((14, 126, W - 14, H - 14), outline=(34, 52, 104), width=3)
    d.line((W // 2 - 1, 128, W // 2 - 1, H - 16), fill=(232, 229, 220), width=3)     # 접었던 자국 (글자보다 먼저)
    d.line((W // 2 + 2, 128, W // 2 + 2, H - 16), fill=(253, 252, 247), width=2)
    # 사진 자리
    d.rectangle((44, 160, 314, 500), fill=(214, 212, 204), outline=(120, 122, 128), width=2)
    d.ellipse((126, 214, 232, 330), fill=(176, 174, 168))
    d.pieslice((76, 340, 282, 620), 180, 360, fill=(176, 174, 168))
    d.rectangle((44, 500, 314, 502), fill=(120, 122, 128))
    rows = (("수험번호", "1104 - 1224"), ("성    명", "한 도 현"), ("시 험 장", "목원고등학교"), ("시 험 실", "제 12 시험실"), ("좌    석", "24 번"))
    for i, (k, v) in enumerate(rows):
        y = 150 + i * 72
        d.rectangle((350, y, 560, y + 62), fill=(228, 230, 238), outline=(120, 124, 140), width=2)
        d.rectangle((560, y, W - 44, y + 62), outline=(120, 124, 140), width=2)
        center(d, (455, y + 31), k, f(30, True), (34, 52, 104))
        d.text((590, y + 10), v, font=f(38, True) if i in (1, 4) else f(36), fill=INK)
    # 선택 영역 줄
    for i, t in enumerate(("국어", "수학", "영어", "한국사", "탐구")):
        x = 44 + i * 150
        d.rectangle((x, 540, x + 150, 590), fill=(228, 230, 238), outline=(120, 124, 140), width=2)
        d.rectangle((x, 590, x + 150, 650), outline=(120, 124, 140), width=2)
        center(d, (x + 75, 565), t, f(26, True), (34, 52, 104))
        center(d, (x + 75, 620), "응시", f(26), INK)
    # 확인 도장
    seal = Image.new("RGBA", (220, 220), (0, 0, 0, 0))
    sd = ImageDraw.Draw(seal)
    sd.ellipse((10, 10, 210, 210), outline=(186, 48, 38, 215), width=9)
    sd.ellipse((30, 30, 190, 190), outline=(186, 48, 38, 150), width=3)
    sd.text((110, 110), "확인", font=f(70, True), fill=(186, 48, 38, 205), anchor="mm")
    seal = seal.rotate(-11, resample=Image.BICUBIC)
    im.paste(seal, (W - 268, H - 262), seal)
    d.text((812, 660), "※ 시험 당일 반드시 지참", font=f(20), fill=GREY, anchor="lm")
    save(grain(im, 4, 0.7, 11), "ticket", 0.4)


def waybill():
    """택배 운송장. 보내는 분 칸이 비어 있다. 업체 이름은 그리지 않는다."""
    W, H = 1100, 620
    im, d = new(W, H, (250, 249, 244))
    d.rectangle((0, 0, W - 1, H - 1), outline=INK, width=5)
    d.rectangle((0, 0, W, 74), fill=(232, 226, 196))
    d.text((24, 16), "택배 운송장", font=f(40, True), fill=INK)
    d.text((W - 396, 22), "운송장번호  4107-2219-0835", font=f(26), fill=INK)
    for y, k in ((92, "보내는 분"), (262, "받는 분")):
        d.rectangle((20, y, W - 20, y + 152), outline=GREY, width=3)
        d.rectangle((20, y, 190, y + 152), fill=(238, 236, 228), outline=GREY, width=3)
        center(d, (105, y + 76), k, f(30, True), INK)
        for i, lab in enumerate(("성명", "주소", "전화")):
            d.text((206, y + 12 + i * 48), lab, font=f(22), fill=GREY)
            d.line((270, y + 44 + i * 48, W - 40, y + 44 + i * 48), fill=(196, 196, 190), width=2)
    d.text((282, 262 + 6), "기 * *", font=f(30, True), fill=INK)
    d.text((282, 262 + 56), "서울 마포구 망원동 ··· 옥탑", font=f(30, True), fill=INK)
    d.text((282, 262 + 104), "010 - **** - ****", font=f(26), fill=INK)
    # 품명과 바코드
    d.rectangle((20, 432, 420, 600), outline=GREY, width=3)
    d.text((36, 444), "품명", font=f(22), fill=GREY)
    d.text((36, 484), "잡화 · 1개", font=f(34, True), fill=INK)
    d.text((36, 546), "착불 아님 · 선불", font=f(22), fill=GREY)
    x = 450
    r = random.Random(4107)
    while x < 880:
        w = r.choice((3, 3, 5, 8))
        d.rectangle((x, 446, x + w, 560), fill=INK)
        x += w + r.choice((3, 4, 6))
    d.text((520, 566), "4107 2219 0835", font=f(26), fill=INK)
    d.rectangle((904, 446, W - 24, 596), outline=RED, width=5)
    center(d, (992, 496), "취급", f(40, True), RED)
    center(d, (992, 550), "주의", f(40, True), RED)
    # 도착 도장 (열흘 전)
    st = Image.new("RGBA", (300, 110), (0, 0, 0, 0))
    sd = ImageDraw.Draw(st)
    sd.rounded_rectangle((4, 4, 296, 106), 12, outline=(40, 60, 150, 190), width=5)
    sd.text((150, 55), "배송 완료 11. 03", font=f(30, True), fill=(40, 60, 150, 190), anchor="mm")
    st = st.rotate(7, resample=Image.BICUBIC, expand=True)
    im.paste(st, (730, 268), st)
    save(grain(im, 4, 0.7, 23), "waybill", 0.4)


def memo():
    """택배 상자 안의 쪽지. 손으로 쓴 두 줄. 한 번 접혀 있었다."""
    W, H = 900, 450
    im, d = new(W, H, (246, 240, 222))
    for y in range(74, H, 62):                                   # 편지지의 옅은 줄
        d.line((30, y, W - 30, y), fill=(222, 214, 192), width=2)
    d.line((W // 2 - 2, 0, W // 2 - 2, H), fill=(230, 222, 202), width=4)   # 접힌 자리
    d.line((W // 2 + 2, 0, W // 2 + 2, H), fill=(251, 247, 232), width=2)
    ink = (28, 40, 84)
    d.text((86, 86), "찍기 전에는", font=hand(118), fill=ink)
    d.text((150, 236), "세 번 읽어라", font=hand(118), fill=ink)
    d.line((640, 392, 800, 384), fill=ink, width=5)             # 서명 대신 그은 줄
    save(grain(im, 5, 0.8, 31), "memo", 0.5)


PRACTICE = [   # (번호, 줄들, 보기, 답, 답을 적는 방식) — 모두 이 게임을 위해 새로 지은 문제다. 실제 시험의 문항이 아니다.
    (15, ["수열 $\\{a_{n}\\}$은 첫째항이 자연수이고, 모든 자연수 $n$에 대하여",
          "        $a_{n+1} = a_{n} / 2$   ($a_{n}$이 짝수인 경우)",
          "        $a_{n+1} = a_{n} + 3$   ($a_{n}$이 홀수인 경우)",
          "를 만족시킨다. $a_{4} = 5$가 되도록 하는 모든 $a_{1}$의 값의 합은?  [4점]"],
     ["63", "67", "71", "75", "79"], 3, None),
    (21, ["최고차항의 계수가 1인 삼차함수 $f(x)$가",
          "        $f(0) = 0$,   $f'(1) = f'(3) = 0$",
          "을 만족시킨다. 곡선 $y = f(x)$와 $x$축으로 둘러싸인 부분의 넓이를",
          "$S$라 할 때, $4S$의 값을 구하시오.  [4점]"],
     None, None, "27"),
    (22, ["양수 $a$에 대하여 함수 $f(x) = |x^{2} - 2ax|$가 있다.",
          "방정식 $f(x) = 4$가 서로 다른 세 실근을 가질 때,",
          "이 세 실근의 제곱의 합을 구하시오.  [4점]"],
     None, None, "28"),
    (28, ["함수 $f(x) = xe^{x}$에 대하여 곡선 $y = f(x)$ 위의 점 $(t, f(t))$에서의",
          "접선의 $y$절편을 $g(t)$라 하자. 함수 $g(t)$의 극솟값은?  [4점]"],
     ["$-4/e^{2}$", "$-2/e^{2}$", "$-1/e^{2}$", "$-2/e$", "$-4/e$"], 1, None),
    (30, ["수열 $\\{a_{n}\\}$이 $a_{1} = 2$이고, 모든 자연수 $n$에 대하여",
          "        $a_{n+1} = a_{n} + 2n + 1$",
          "을 만족시킬 때, $a_{1} + a_{2} + a_{3} +$ … $+ a_{8}$의 값을 구하시오.  [4점]"],
     None, None, "212"),
]


def practice():
    """도현의 수학 연습지(A4). 문제는 인쇄, 풀이는 없고 답만 파란 볼펜으로.
    문제의 줄마다 무언가로 누르고 지나간 광택이 있다: 색이 아니라 거칠기 그림(pl_practice_rough.png)에만 남긴다.
    줄의 자리는 pl_practice.json에 적어 둔다(Blender가 볼 곳의 자리를 거기서 읽는다)."""
    W, H = 1448, 2048
    im, d = new(W, H, (244, 241, 232))
    M, S, LH = 120, 32, 52                                      # 왼쪽 여백, 글자 크기, 줄 간격
    d.text((M, 96), "수학 영역", font=ImageFont.truetype(SERIF, 58, index=0), fill=INK)
    d.text((M + 300, 118), "고난도 문항 연습  ⑫", font=serif(34), fill=INK)
    d.text((W - M - 420, 84), "서로재수학원  B반", font=f(26), fill=GREY)
    d.rectangle((W - M - 420, 122, W - M, 172), outline=GREY, width=2)
    d.text((W - M - 408, 130), "성명", font=f(24), fill=GREY)
    d.text((W - M - 290, 124), "한도현", font=hand(44), fill=(34, 50, 120))
    d.rectangle((M, 190, W - M, 195), fill=INK)
    d.rectangle((M, 201, W - M, 203), fill=INK)
    rows, y, r = [], 252, random.Random(2424)
    blue = (34, 54, 132)
    for no, text, opts, pick, ans in PRACTICE:
        d.text((M, y - 2), "%d." % no, font=ImageFont.truetype(TIMES.replace("times.ttf", "timesbd.ttf"), 40), fill=INK)
        top = y
        for line in text:
            ind = (len(line) - len(line.lstrip(" "))) * S * 0.42
            w = rich(d, M + 74 + ind, y, line.strip(), S)
            rows.append((M + 74 + ind, y + S * 0.56, w))
            y += LH
        if opts:
            y += 10
            x = M + 74
            for k, o in enumerate(opts):
                d.text((x, y), "①②③④⑤"[k], font=serif(S), fill=INK)
                w = rich(d, x + 46, y, o, S)
                if k + 1 == pick:                                # 고른 보기에 볼펜 동그라미
                    cx, cy = x + 18, y + S * 0.56
                    pts = []
                    for t in range(0, 400, 12):
                        a = math.radians(t - 60)
                        rr = 25 + 2.5 * math.sin(a * 2.3) + t * 0.01
                        pts.append((cx + math.cos(a) * rr * 1.08, cy + math.sin(a) * rr * 0.9))
                    d.line(pts, fill=blue, width=4, joint="curve")
                x += 228
            rows.append((M + 74, y + S * 0.56, 5 * 228 - 60))
            y += LH
        else:                                                    # 단답: 오른쪽 아래에 답만
            d.text((W - M - 250 + r.randint(-12, 12), y + 6 + r.randint(-6, 6)), ans, font=hand(88), fill=blue)
            d.line((W - M - 262, y + 110, W - M - 70, y + 104), fill=blue, width=4)
        y += 112 if opts else 168
    d.text((W // 2 - 20, H - 96), "- 3 -", font=serif(28), fill=GREY)
    im = grain(im, 4, 0.7, 41)
    save(im, "practice", 0.45)
    # 거칠기: 종이는 거칠고(밝다), 펜 뒤 끝이 눌러 지나간 줄만 매끈하다(어둡다). 줄의 양 끝은 조금씩 삐져나온다.
    rough = Image.new("L", (W // 2, H // 2), 240)
    rd = ImageDraw.Draw(rough)
    for x, cy, w in rows:
        a, b = (x - 14 - r.randint(0, 10)) / 2, (x + w + 12 + r.randint(0, 22)) / 2
        rd.rounded_rectangle((a, cy / 2 - 7, b, cy / 2 + 7), 7, fill=92)
        rd.rounded_rectangle((a + 6, cy / 2 - 3, b - 6, cy / 2 + 3), 3, fill=66)
    rough = rough.filter(ImageFilter.GaussianBlur(1.6))
    noise = Image.frombytes("L", rough.size, bytes(r.randrange(118, 138) for _ in range(rough.size[0] * rough.size[1]))).filter(ImageFilter.GaussianBlur(0.8))
    rough = ImageChops.add(rough, noise, scale=1.0, offset=-128)
    rough.save(os.path.join(OUT, "pl_practice_rough.png"))
    mid, first = rows[len(rows) // 2], rows[0]
    with open(os.path.join(OUT, "pl_practice.json"), "w", encoding="utf-8") as fp:
        json.dump({"size": [W, H], "rows": [[round(v, 1) for v in row] for row in rows],
                   "gloss": [round(mid[0] + mid[2] * 0.4, 1), round(mid[1], 1)], "margin": [W - M - 90, round(first[1] + 250, 1)]}, fp)


def _np():
    import numpy as np
    return np


def _noise(w, h, seed, blur=0.0, sw=None, sh=None):
    """0..1의 얼룩. sw, sh를 주면 그 크기로 만든 뒤 늘려서 결을 만든다."""
    np = _np()
    im = Image.frombytes("L", (sw or w, sh or h), random.Random(seed).randbytes((sw or w) * (sh or h)))
    if sw or sh:
        im = im.resize((w, h), Image.BICUBIC)
    if blur:
        im = im.filter(ImageFilter.GaussianBlur(blur))
    return np.asarray(im, np.float32) / 255.0


def _put(arr, name):
    np = _np()
    Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).save(os.path.join(OUT, "pl_%s.png" % name))


def cardboard():
    """골판지의 겉(25cm 타일)과 잘린 단면(3.2cm x 4mm 타일: 골 넷)."""
    np = _np()
    S = 1024
    fib = _noise(S, S, 51, 0.0, 48, S) - 0.5                    # 가로로 긴 섬유의 결
    fine = _noise(S, S, 52, 0.7) - 0.5
    blot = _noise(S, S, 53, 0.0, 12, 12) - 0.5                  # 큰 얼룩
    yy = np.arange(S, dtype=np.float32)[:, None]
    flute = np.sin(yy / S * 2 * np.pi * 31) * 0.5               # 속의 골이 비친다 (8mm 간격)
    v = 1.0 + fib * 0.16 + fine * 0.10 + blot * 0.10 + flute * 0.022
    _put(np.array((182, 143, 96), np.float32)[None, None, :] * v[..., None], "cardboard")
    W, H = 256, 32
    im, d = new(W, H, (74, 54, 34))
    d.rectangle((0, 0, W, 4), fill=(190, 152, 104))
    d.rectangle((0, H - 5, W, H), fill=(176, 138, 92))
    pts = [(x, H / 2 - 0.5 + math.cos(x / W * 2 * math.pi * 4) * (H / 2 - 6)) for x in range(-2, W + 3)]
    d.line(pts, fill=(168, 130, 86), width=4)
    save(im, "cardboard_edge", 0.5)


def stamp_textures():
    """도장: 손잡이의 나무(가로=둘레, 세로=길이. 아래가 새긴 면 쪽), 새긴 면, 인주."""
    np = _np()
    W, H = 256, 512
    streak = _noise(W, H, 61, 0.0, W, 10) - 0.5                 # 길이 방향의 나뭇결
    fine = _noise(W, H, 62, 0.6) - 0.5
    blot = _noise(W, H, 63, 0.0, 8, 14)
    v = (1.0 - np.arange(H, dtype=np.float32) / H)[:, None]     # 0 = 새긴 면, 1 = 손잡이 끝
    wood = np.array((118, 76, 42), np.float32)[None, None, :] * (1.0 + streak * 0.30 + fine * 0.10)[..., None]
    worn = np.clip((v - 0.62) / 0.2, 0, 1) * np.clip(blot * 1.6 - 0.15, 0, 1)             # 손이 닿아 닳은 손잡이: 밝고 맨들하다
    wood = wood * (1 - worn[..., None] * 0.55) + np.array((186, 142, 96), np.float32) * worn[..., None] * 0.55
    grime = np.exp(-((v - 0.33) / 0.05) ** 2) * 0.45                                        # 잘록한 목에 낀 때
    wood *= (1 - grime)[..., None]
    red = np.clip((0.13 + (blot - 0.5) * 0.10 - v) / 0.03, 0, 1)                            # 새긴 면에서 번져 올라온 인주
    wood = wood * (1 - red[..., None] * 0.85) + np.array((122, 22, 16), np.float32) * red[..., None] * 0.85
    _put(wood, "stamp_wood")
    # 새긴 면: 테두리와 네 칸의 획. 읽히는 글자가 아니다(무엇을 새겼는지는 아직 이야기에 없다).
    S = 256
    im, d = new(S, S, (150, 92, 70))                             # 파인 곳: 인주가 덜 묻은 나무
    ink = (112, 20, 15)
    d.ellipse((6, 6, S - 6, S - 6), outline=ink, width=13)
    r = random.Random(77)
    for cx, cy in ((84, 84), (172, 84), (84, 172), (172, 172)):
        for _ in range(5):
            x0, y0 = cx - 34 + r.randrange(0, 5) * 15, cy - 34 + r.randrange(0, 5) * 15
            if r.random() < 0.5:
                d.line((x0, y0, min(cx + 34, x0 + r.choice((30, 45, 68))), y0), fill=ink, width=9)
            else:
                d.line((x0, y0, x0, min(cy + 34, y0 + r.choice((30, 45, 68)))), fill=ink, width=9)
    a = np.asarray(im.filter(ImageFilter.GaussianBlur(1.1)), np.float32)
    a *= (0.86 + _noise(S, S, 64, 0.8) * 0.3)[..., None]
    yy, xx = np.mgrid[0:S, 0:S]
    a[((xx - S / 2) ** 2 + (yy - S / 2) ** 2) > (S / 2 - 2) ** 2] = (96, 30, 22)
    _put(a, "stamp_face")
    # 인주: 붉은 솜. 한쪽이 눌려 닳았다(반쯤 남았다).
    n1, n2 = _noise(S, S, 65, 0.9), _noise(S, S, 66, 0.0, 9, 9)
    pad = np.array((168, 26, 20), np.float32)[None, None, :] * (0.82 + n1 * 0.36)[..., None]
    used = np.clip((n2 - 0.5) * 1.3 + 1.1 - np.hypot(xx - S * 0.42, yy - S * 0.56) / (S * 0.30), 0, 1)
    pad = pad * (1 - used[..., None] * 0.55) + np.array((208, 150, 132), np.float32) * (0.9 + n1[..., None] * 0.2) * used[..., None] * 0.55
    _put(pad, "ink_pad")
    rough = 215 - used * 70 + (n1 - 0.5) * 40                    # 눌린 자리는 기름이 배어 번들거린다
    Image.fromarray(np.clip(rough, 0, 255).astype(np.uint8)).save(os.path.join(OUT, "pl_ink_pad_rough.png"))


def fabric():
    """필통의 천(2cm 타일, 평직). 색과 법선 그림."""
    np = _np()
    S, P = 512, 8                                                # 실 하나가 8화소
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    i, j = (xx // P).astype(int), (yy // P).astype(int)
    over = (i + j) % 2 == 0                                      # 날실이 위로 올라온 칸
    px, py = (xx % P) / P - 0.5, (yy % P) / P - 0.5
    warp = np.cos(px * np.pi) * (0.55 + 0.45 * np.cos(py * np.pi * 2) * 0.5 + 0.225)
    weft = np.cos(py * np.pi) * (0.55 + 0.45 * np.cos(px * np.pi * 2) * 0.5 + 0.225)
    h = np.where(over, warp, weft)
    rng = np.random.default_rng(71)
    tw, tf = rng.normal(1, 0.07, S // P)[i], rng.normal(1, 0.07, S // P)[j]             # 실마다 굵기와 색이 조금씩 다르다
    shade = (0.62 + 0.55 * h) * np.where(over, tw, tf) * (0.96 + _noise(S, S, 72, 0.5) * 0.08)
    _put(np.array((34, 50, 86), np.float32)[None, None, :] * shade[..., None], "fabric")
    hh = np.asarray(Image.fromarray((np.clip(h, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.0)), np.float32) / 255
    dx, dy = (np.roll(hh, -1, 1) - np.roll(hh, 1, 1)) * 2.2, (np.roll(hh, -1, 0) - np.roll(hh, 1, 0)) * 2.2
    n = np.stack([-dx, dy, np.ones_like(hh)], -1)                # 그림의 y는 아래로: 초록(+Y)을 뒤집는다
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    _put((n * 0.5 + 0.5) * 255, "fabric_n")


def inspect_props():
    ticket(); waybill(); memo(); practice(); cardboard(); stamp_textures(); fabric()


if __name__ == "__main__":
    laptop(); news(); calendar()
    rank("rank9", "9월 모의고사 성적 우수자"); rank("rank10", "10월 학원 모의고사 성적 우수자")
    banner_academy(); exam_banner(); schedule(); bin_note(); stair_sign(); flyer(); mailbox(); namecard()
    sheet("sheet_dohyeon", False); sheet("sheet_other", True); parcel_label(); elevator()
    inspect_props()
    plate("sign_academy", "서로재수학원", 1024, 256, NAVY, (255, 255, 255), 110, sub="SINCE 2009  ·  재수 종합반")
    plate("door_study", "자습실", 384, 128, (240, 240, 236), INK, 60, border=GREY)
    plate("door_consult", "상담실", 384, 128, (240, 240, 236), INK, 60, border=GREY)
    plate("door_admin", "행정실", 384, 128, (36, 60, 110), (255, 255, 255), 62)
    plate("door_staff", "교무실", 384, 128, (36, 60, 110), (255, 255, 255), 62)
    plate("door_minwon", "민원 창구", 512, 128, (250, 250, 246), INK, 60, border=NAVY)
    plate("door_guard", "경비실", 384, 128, (250, 250, 246), INK, 62, border=GREY)
    plate("dong", "107", 512, 256, (30, 70, 140), (255, 255, 255), 170)
    plate("door103", "103", 256, 128, (226, 222, 210), INK, 70, border=GREY)
    plate_vertical("plate_school", "목원고등학교", 256, 840, (150, 112, 52), (30, 22, 10), 96)
    notice("apt_recycle", "분리수거 안내", ["· 플라스틱, 캔, 종이는 따로 묶어 주세요.", "· 새벽 여섯 시에 내놓은 것부터 실어 갑니다.", "· 수거함 밖에 두면 과태료가 나옵니다."], accent=(30, 110, 70), big=["화 · 금", "06:00 ~ 09:00"])
    notice("apt_office", "관리사무소 알림", ["· 승강기 정기 점검: 다음 주 화요일", "· 겨울철 동파 방지 안내"], accent=(70, 74, 82))
    notice("ac_rules", "자습실 이용 수칙", ["· 자습 시간에는 자리를 뜨지 않습니다.", "· 전자기기는 사물함에 넣습니다.", "· 밤 11시 50분에 문을 잠급니다."], accent=NAVY)
    notice("school_notice", "가정통신문", ["· 수능 시험장 운영에 따른 안내", "· 금요일은 정상 수업입니다."], accent=(60, 96, 60))
    print("ok", len([n for n in os.listdir(OUT) if n.startswith("pl_")]), "files", HAND)
