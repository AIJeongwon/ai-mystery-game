# 프롤로그 네 장소에 붙는 글자 그림을 만든다 (Blender 밖에서, Pillow로). 결과는 tools/_raw/3d/tex/pl_*.png.
#   python tools/3d/make_prologue_textures.py
# 글은 사건 데이터(public/js/data/sites/prologue.js)의 문장과 같아야 한다: 게시판을 살펴보면 자막이 같은 내용을 읽어 준다.
# 사람, 학원, 업체, 학교의 이름은 모두 지어낸 것이다. 실제 문항이나 상표는 그리지 않는다.
import os, random
from PIL import Image, ImageDraw, ImageFont, ImageFilter

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


if __name__ == "__main__":
    laptop(); news(); calendar()
    rank("rank9", "9월 모의고사 성적 우수자"); rank("rank10", "10월 학원 모의고사 성적 우수자")
    banner_academy(); exam_banner(); schedule(); bin_note(); stair_sign(); flyer(); mailbox(); namecard()
    sheet("sheet_dohyeon", False); sheet("sheet_other", True); parcel_label(); elevator()
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
