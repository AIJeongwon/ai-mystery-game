# 프롤로그 네 장소의 블록아웃 — Blender에서 실행한다 (Blender MCP의 execute_blender_code, 또는 Scripting 탭).
#   exec(open(r"D:\ai-mystery-game\tools\3d\build_prologue_blockout.py", encoding="utf-8").read())
#   build_all(); export_all()
# 장소마다 컬렉션 하나(rooftop / apt / academy / gate). 넷 다 원점에 지으므로 화면에서는 겹쳐 보인다(show("apt")로 하나만 본다).
import bpy, sys, os, importlib

HERE = r"D:\ai-mystery-game\tools\3d"
OUT = r"D:\ai-mystery-game\public\assets\3d\sites"
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import blockout_lib, prologue_layout as L
importlib.reload(blockout_lib)
importlib.reload(L)
from blockout_lib import Blockout

DOOR = 2.05   # 문 머리 높이


def build_rooftop():
    B = Blockout("rooftop")
    x0, y0, x1, y1 = L.ROOFTOP["room"]
    h = L.ROOFTOP["h"]
    sx0, sy0, sx1, sy1 = L.ROOFTOP["slab"]
    B.box("slab", (sx0, sy0, -0.3), (sx1, sy1, -0.08), "ground", arch=True)
    # 방: 남쪽 벽에 책상 위 창, 북쪽 벽에 옥상으로 나가는 문
    B.room("room", x0, y0, x1, y1, h, gaps={"s": [(-1.6, -0.2, 0.95, 1.95)], "n": [(0.9, 1.8, 0, DOOR)], "w": [], "e": [(-0.6, 0.4, 1.2, 1.9)]}, lamps=[(0.0, 0.0)])
    B.box("roof_cap", (x0 - 0.3, y0 - 0.3, h + 0.06), (x1 + 0.3, y1 + 0.3, h + 0.16), "dark", arch=True)
    # 책상과 노트북, 스탠드
    B.solid("desk", (-1.7, -1.62, 0.69), (-0.1, -1.0, 0.72))
    B.box("desk_legs", (-1.65, -1.6, 0), (-0.15, -1.05, 0.69), "furn")
    B.box("laptop_base", (-1.08, -1.42, 0.72), (-0.72, -1.17, 0.74), "dark")
    B.box("laptop_screen", (-1.08, -1.45, 0.74), (-0.72, -1.43, 0.97), "glass")
    B.box("lamp_desk", (-1.55, -1.5, 1.05), (-1.4, -1.35, 1.1), "yellow")
    B.box("stand_pole", (-1.49, -1.44, 0.72), (-1.46, -1.41, 1.05), "metal")
    B.solid("chair", (-1.1, -0.95, 0), (-0.7, -0.55, 0.45))
    # 침대, 선반, 벽의 증거판, 택배 상자
    B.solid("bed", (0.95, -1.62, 0), (2.12, 0.35, 0.42), "blue")
    B.box("pillow", (1.2, -1.55, 0.42), (1.9, -1.15, 0.52), "paper")
    B.solid("shelf", (-2.12, 1.0, 0), (-1.6, 1.62, 1.2))
    B.box("wall_board", (-2.12, -1.0, 0.85), (-2.09, 1.0, 1.95), "accent")
    for i, (by, bz) in enumerate(((-0.6, 1.55), (-0.1, 1.5), (0.45, 1.6), (-0.4, 1.15), (0.3, 1.1))):
        B.box(f"board_card{i}", (-2.09, by - 0.12, bz - 0.09), (-2.08, by + 0.12, bz + 0.09), "paper")
    B.box("parcel_box", (0.05, 1.0, 0), (0.45, 1.3, 0.26), "key")
    B.box("door_leaf", (1.8, 1.7, 0), (1.84, 2.55, DOOR), "furn")   # 열려 있는 문짝
    # 옥상: 난간, 평상, 물탱크, 빨랫줄, 계단실
    p = L.ROOFTOP["parapet"]
    B.wall("parapet_s", (sx0, sy0), (sx1, sy0), p, 0.2)
    B.wall("parapet_n", (sx0, sy1), (sx1, sy1), p, 0.2)
    B.wall("parapet_w", (sx0, sy0), (sx0, sy1), p, 0.2)
    B.wall("parapet_e", (sx1, sy0), (sx1, sy1), p, 0.2)
    B.solid("pyeongsang", (-4.2, 4.5, 0.3), (-2.2, 6.3, 0.4))
    B.box("pyeongsang_legs", (-4.1, 4.6, 0), (-2.3, 6.2, 0.3), "dark")
    B.solid("tank_stand", (3.0, 6.2, 0), (4.4, 7.6, 0.6), "metal")
    B.box("water_tank", (3.05, 6.25, 0.6), (4.35, 7.55, 2.0), "yellow")
    for i, lx in enumerate((-3.6, 0.6)):
        B.solid(f"line_pole{i}", (lx - 0.04, 6.9, 0), (lx + 0.04, 6.98, 1.9), "metal", pad=0.05)
    B.box("laundry_line", (-3.6, 6.93, 1.84), (0.6, 6.95, 1.86), "dark")
    B.box("laundry0", (-2.6, 6.92, 1.2), (-1.9, 6.96, 1.84), "paper")
    B.box("laundry1", (-1.3, 6.92, 1.35), (-0.8, 6.96, 1.84), "blue")
    # 계단실: 서쪽으로 문이 나 있다. 안으로는 들어가지 않는다 (이동의 문)
    B.solid("stair_house", (2.9, 2.0, 0), (4.9, 4.3, 2.3), "wall", pad=0.0)
    B.box("stair_door", (2.86, 2.7, 0), (2.9, 3.6, DOOR), "dark")
    B.box("ac_unit", (-4.6, 0.4, 0), (-3.9, 0.75, 0.6), "metal")
    B.collider("ac_unit", (-4.62, 0.38, 0), (-3.88, 0.77, 0.6))
    B.markers(L.ROOFTOP_MARKERS)
    return B.report()


def build_apt():
    B = Blockout("apt")
    yx0, yy0, yx1, yy1 = L.APT["yard"]
    lx0, ly0, lx1, ly1 = L.APT["lobby"]
    h = L.APT["h"]
    B.box("yard", (yx0, yy0, -0.3), (yx1, yy1, -0.08), "ground", arch=True)
    B.box("walk", (-1.2, yy0, -0.08), (1.2, yy1, -0.06), "floor", arch=True)
    # 단지 담: 남쪽에 드나드는 문
    B.wall("fence_s", (yx0, yy0), (yx1, yy0), 1.4, 0.2, gaps=[(-1.5, 1.5, 0, 9)])
    B.collider("gate_stop", (-1.5, yy0 - 0.3, 0), (1.5, yy0 - 0.1, 2))
    B.wall("fence_w", (yx0, yy0), (yx0, yy1), 1.4, 0.2)
    B.wall("fence_e", (yx1, yy0), (yx1, yy1), 1.4, 0.2)
    B.box("gate_post0", (-1.75, yy0 - 0.15, 0), (-1.5, yy0 + 0.15, 1.9), "wall", arch=True)
    B.box("gate_post1", (1.5, yy0 - 0.15, 0), (1.75, yy0 + 0.15, 1.9), "wall", arch=True)
    # 107동: 1층 정면과 그 위의 층들 (올려다보면 베란다 줄)
    B.wall("facade", (yx0, yy1), (yx1, yy1), h, 0.2, gaps=[(-0.8, 0.8, 0, 2.2)])
    B.box("tower", (yx0, yy1 - 0.1, h), (yx1, yy1 + 6.0, 16.0), "wall", arch=True)
    for f in range(4):
        B.box(f"veranda{f}", (yx0 + 0.4, yy1 - 0.16, h + 0.9 + f * 2.8), (yx1 - 0.4, yy1 - 0.1, h + 2.2 + f * 2.8), "glass", arch=True)
    B.box("canopy", (-1.6, yy1 - 1.4, 2.3), (1.6, yy1, 2.42), "dark", arch=True)
    B.box("dong_sign", (-0.5, yy1 - 0.12, 2.75), (0.5, yy1 - 0.1, 3.15), "blue", arch=True)
    # 로비: 우편함, 게시판, 승강기, 103호
    B.room("lobby", lx0, ly0, lx1, ly1, h, gaps={"n": [], "w": [], "e": []}, lamps=[(0.0, 4.6), (0.0, 6.8)])
    B.box("mailboxes", (lx0 + 0.075, 4.1, 0.9), (lx0 + 0.3, 6.4, 1.6), "metal")
    B.box("lobby_board", (lx1 - 0.1, 4.5, 1.1), (lx1 - 0.075, 5.9, 1.9), "accent")
    B.box("elevator", (-1.7, ly1 - 0.1, 0), (-0.3, ly1 - 0.075, 2.1), "metal")
    B.box("door103", (0.85, ly1 - 0.11, 0), (1.75, ly1 - 0.075, DOOR), "furn")
    B.box("door103_plate", (1.85, ly1 - 0.1, 1.5), (2.1, ly1 - 0.075, 1.62), "paper")
    # 경비실: 동쪽 문, 남쪽 창. 안쪽 서쪽 벽에 분실물 선반
    bx0, by0, bx1, by1 = L.APT["booth"]
    B.room("booth", bx0, by0, bx1, by1, 2.4, gaps={"s": [(-6.0, -4.4, 1.0, 1.9)], "n": [], "w": [], "e": [(0.0, 0.9, 0, DOOR)]}, lamps=[(-5.15, 0.3)])
    B.solid("booth_desk", (-6.0, -0.9, 0.7), (-4.4, -0.4, 0.74))
    B.box("lost_shelf", (bx0 + 0.075, -0.2, 1.05), (bx0 + 0.35, 0.9, 1.09), "furn")
    B.box("lost_shelf2", (bx0 + 0.075, -0.2, 1.5), (bx0 + 0.35, 0.9, 1.54), "furn")
    B.box("pencil_case", (bx0 + 0.1, 0.2, 1.09), (bx0 + 0.3, 0.42, 1.14), "key")
    B.box("lost_umbrella", (bx0 + 0.12, 0.6, 1.09), (bx0 + 0.2, 0.85, 1.13), "dark")
    B.box("broom", (-3.5, -0.2, 0), (-3.45, -0.15, 1.3), "furn")
    # 분리수거장: 낮은 담 세 면, 수거함 넷, 지붕
    rx0, ry0, rx1, ry1 = L.APT["bins"]
    B.wall("bins_s", (rx0, ry0), (rx1, ry0), 1.2, 0.15)
    B.wall("bins_n", (rx0, ry1), (rx1, ry1), 1.2, 0.15)
    B.wall("bins_e", (rx1, ry0), (rx1, ry1), 1.2, 0.15)
    B.box("bins_roof", (rx0 - 0.2, ry0 - 0.2, 2.3), (rx1 + 0.2, ry1 + 0.2, 2.38), "metal", arch=True)
    for i, m in enumerate(("blue", "yellow", "green", "metal")):
        cy = ry0 + 0.55 + i * 0.68
        B.solid(f"bin{i}", (7.4, cy - 0.3, 0), (8.2, cy + 0.3, 0.9), m)
    B.box("bin_note", (7.38, ry0 + 0.55 + 1 * 0.68 - 0.1, 0.6), (7.4, ry0 + 0.55 + 1 * 0.68 + 0.1, 0.85), "paper")
    B.solid("bag_pile", (5.0, -5.2, 0), (5.9, -4.5, 0.5), "dark")
    # 마당의 것들
    B.solid("car0", (-8.3, -6.2, 0), (-6.3, -2.2, 1.4), "metal")
    B.solid("car1", (2.6, 0.2, 0), (6.6, 2.1, 1.4), "blue")
    B.solid("bench", (-2.6, -3.6, 0), (-1.5, -3.1, 0.45))
    for i, (tx, ty) in enumerate(((-7.6, 1.8), (7.8, 1.6), (-3.2, -5.6), (3.2, -6.2))):
        B.solid(f"tree{i}_trunk", (tx - 0.12, ty - 0.12, 0), (tx + 0.12, ty + 0.12, 2.2), "furn", pad=0.1)
        B.box(f"tree{i}_crown", (tx - 0.9, ty - 0.9, 2.2), (tx + 0.9, ty + 0.9, 3.8), "green")
    # 사실화에서 생기는 것들(화단, 가로등, 경비실 문짝)의 충돌 면
    B.collider("bed_w", (-8.9, 2.2, 0), (-1.95, 2.9, 0.9))
    B.collider("bed_e", (1.95, 2.2, 0), (8.9, 2.9, 0.9))
    B.collider("lamp_post", (-3.0, -2.7, 0), (-2.8, -2.5, 3.0))
    B.collider("booth_door", (-3.8, 0.88, 0), (-2.9, 0.96, 2.05))
    B.markers(L.APT_MARKERS)
    return B.report()


def build_academy():
    B = Blockout("academy")
    h = L.ACADEMY["h"]
    lx0, ly0, lx1, ly1 = L.ACADEMY["lobby"]
    sx0, sy0, sx1, sy1 = L.ACADEMY["study"]
    ox0, oy0, ox1, oy1 = L.ACADEMY["office"]
    # 로비: 남쪽이 승강기 홀로 나가는 문, 북쪽으로 자습실과 상담실
    B.room("lobby", lx0, ly0, lx1, ly1, h, gaps={"s": [(-0.7, 0.7, 0, DOOR)], "w": [], "e": [(-3.2, -1.0, 1.0, 2.1)]}, lamps=[(-1.8, -2.0), (1.8, -2.0)])
    B.collider("exit_stop", (-0.7, ly0 - 0.3, 0), (0.7, ly0 - 0.1, 2.2))
    B.wall("lobby_wn", (lx0, ly1), (lx1, ly1), h, gaps=[(-2.1, -1.2, 0, DOOR), (2.0, 2.9, 0, DOOR)])
    B.solid("reception", (1.6, -2.3, 0), (3.6, -1.7, 1.05))
    B.box("rank_board", (lx0 + 0.075, -3.1, 1.0), (lx0 + 0.1, -0.9, 2.0), "accent")
    for i in range(3):
        B.box(f"rank_sheet{i}", (lx0 + 0.1, -2.9 + i * 0.7, 1.15), (lx0 + 0.11, -2.35 + i * 0.7, 1.9), "paper")
    B.box("banner", (-0.9, ly1 - 0.1, 1.6), (1.3, ly1 - 0.08, 2.3), "key")
    B.solid("sofa", (-3.7, -3.8, 0), (-1.6, -3.2, 0.45), "blue")
    B.solid("water", (3.5, -0.6, 0), (3.9, -0.2, 1.2), "metal")
    # 자습실: 칸막이 책상 네 열 다섯 줄. 학생은 북쪽(창)을 보고 앉는다
    B.room("study", sx0, sy0, sx1, sy1, h, gaps={"n": [(-3.4, -0.4, 1.0, 2.1)], "w": [], "e": []}, lamps=[(-1.5, 1.8), (-1.5, 4.0), (-1.5, 6.2)])
    for ci, cx in enumerate(L.STUDY_COLS):
        for ri, cy in enumerate(L.STUDY_ROWS):
            n = f"{ci}{ri}"
            mine = (cx, cy) == L.DOHYEON_SEAT
            B.box(f"carrel{n}_top", (cx - 0.45, cy - 0.3, 0.72), (cx + 0.45, cy + 0.3, 0.75), "key" if mine else "furn")
            B.box(f"carrel{n}_back", (cx - 0.46, cy + 0.3, 0), (cx + 0.46, cy + 0.33, 1.25), "furn")
            B.box(f"carrel{n}_l", (cx - 0.475, cy - 0.3, 0), (cx - 0.45, cy + 0.3, 1.25), "furn")
            B.box(f"carrel{n}_r", (cx + 0.45, cy - 0.3, 0), (cx + 0.475, cy + 0.3, 1.25), "furn")
            B.box(f"stool{n}", (cx - 0.2, cy - 0.75, 0), (cx + 0.2, cy - 0.4, 0.45), "dark")
            B.collider(f"carrel{n}", (cx - 0.475, cy - 0.75, 0), (cx + 0.475, cy + 0.33, 1.25))
    dx, dy = L.DOHYEON_SEAT
    B.box("practice_sheet", (dx - 0.2, dy - 0.2, 0.75), (dx + 0.12, dy + 0.22, 0.756), "paper")
    B.box("name_card", (dx + 0.4, dy + 0.05, 0.7), (dx + 0.45, dy + 0.14, 0.75), "paper")
    B.box("other_sheet", (-2.5 - 0.2, 5.1 - 0.2, 0.75), (-2.5 + 0.12, 5.1 + 0.22, 0.756), "paper")
    # 상담실: 책상 하나, 의자 둘, 책장
    B.room("office", ox0, oy0, ox1, oy1, h, gaps={"n": [], "e": [(1.0, 3.0, 1.0, 2.1)]}, lamps=[(2.5, 2.0)])
    B.solid("consult_table", (1.9, 1.9, 0.7), (3.1, 2.6, 0.74))
    B.box("consult_legs", (1.95, 1.95, 0), (3.05, 2.55, 0.7), "furn")
    B.solid("consult_chair", (2.3, 1.1, 0), (2.7, 1.5, 0.45), "dark")
    B.solid("bookcase", (3.55, 3.0, 0), (3.92, 3.92, 1.9))
    B.box("grade_file", (2.2, 2.1, 0.74), (2.5, 2.5, 0.76), "paper")
    # 사실화에서 생기는 화분의 충돌 면
    B.collider("plant_lobby", (-3.78, -0.68, 0), (-3.32, -0.22, 1.3))
    B.collider("plant_office", (1.13, 3.38, 0), (1.57, 3.82, 1.0))
    B.markers(L.ACADEMY_MARKERS)
    return B.report()


def build_gate():
    B = Blockout("gate")
    h = L.GATE["h"]
    yx0, yy0, yx1, yy1 = L.GATE["yard"]
    hx0, hy0, hx1, hy1 = L.GATE["hall"]
    ax0, ay0, ax1, ay1 = L.GATE["admin"]
    tx0, ty0, tx1, ty1 = L.GATE["staff"]
    rx0, ry0, rx1, ry1 = L.GATE["stair"]
    # 교문 앞마당
    B.box("yard", (yx0, yy0, -0.3), (yx1, yy1, -0.08), "ground", arch=True)
    B.wall("fence_s", (yx0, yy0), (yx1, yy0), 1.6, 0.25, gaps=[(-2.0, 2.0, 0, 9)])
    B.collider("gate_stop", (-2.0, yy0 - 0.3, 0), (2.0, yy0 - 0.1, 2))
    B.wall("fence_w", (yx0, yy0), (yx0, yy1), 1.6, 0.25)
    B.wall("fence_e", (yx1, yy0), (yx1, yy1), 1.6, 0.25)
    B.box("gate_post0", (-2.4, yy0 - 0.25, 0), (-2.0, yy0 + 0.25, 2.4), "wall", arch=True)
    B.box("gate_post1", (2.0, yy0 - 0.25, 0), (2.4, yy0 + 0.25, 2.4), "wall", arch=True)
    B.box("school_plate", (2.02, yy0 - 0.27, 1.2), (2.38, yy0 - 0.25, 2.1), "dark", arch=True)
    B.solid("flag_stand", (-6.5, -4.2, 0), (-5.5, -3.6, 0.5), "wall")
    for i in range(3):
        B.box(f"flag_pole{i}", (-6.35 + i * 0.35, -3.95, 0.5), (-6.29 + i * 0.35, -3.89, 6.0), "metal")
    for i, tx in enumerate((-7.5, 6.0, 8.0)):
        B.solid(f"tree{i}_trunk", (tx - 0.14, -6.5 - 0.14, 0), (tx + 0.14, -6.5 + 0.14, 2.4), "furn", pad=0.1)
        B.box(f"tree{i}_crown", (tx - 1.0, -7.5, 2.4), (tx + 1.0, -5.5, 4.2), "green")
    # 본관 정면: 현관 위에 시험장 현수막
    B.wall("facade", (hx0, hy0), (hx1, hy0), h, 0.25, gaps=[(-1.0, 1.0, 0, 2.3), (-7.5, -3.0, 1.0, 2.2), (3.0, 7.5, 1.0, 2.2)])
    B.box("upper", (hx0, hy0 - 0.12, h), (hx1, ay1 + 0.2, 10.5), "wall", arch=True)
    B.box("exam_banner", (-2.6, hy0 - 0.2, 2.35), (2.6, hy0 - 0.17, 3.05), "paper", arch=True)
    B.box("porch", (-1.8, hy0 - 1.6, 3.1), (1.8, hy0, 3.25), "dark", arch=True)
    # 복도
    B.room("hall", hx0, hy0, hx1, hy1, h, gaps={"w": [], "e": []}, lamps=[(-5.5, -1.4), (0.0, -1.4), (5.5, -1.4)])
    B.wall("hall_wn", (hx0, hy1), (hx1, hy1), h, gaps=[(-4.4, -3.5, 0, DOOR), (0.5, 1.4, 0, DOOR), (6.2, 8.2, 0, 2.4)])
    B.solid("bench", (2.2, -0.75, 0), (3.8, -0.35, 0.45))
    B.box("trophy_case", (-1.9, -0.45, 0), (-0.4, -0.28, 1.9), "glass")
    B.collider("trophy_case", (-1.92, -0.47, 0), (-0.38, -0.2, 1.9))
    B.box("shoe_rack", (-8.9, -2.4, 0), (-8.5, -0.5, 1.1), "furn")
    B.collider("shoe_rack", (-8.92, -2.42, 0), (-8.48, -0.48, 1.1))
    # 행정실: 민원 창구 뒤에 행정실장
    B.room("admin", ax0, ay0, ax1, ay1, h, gaps={"n": [(-8.0, -3.5, 1.0, 2.1)], "w": [], "e": []}, lamps=[(-5.7, 1.2), (-5.7, 3.6)])
    B.solid("counter", (-8.92, 1.25, 0), (-2.58, 1.75, 1.05))
    B.box("office_board", (ax0 + 0.075, 0.0, 1.0), (ax0 + 0.1, 1.05, 2.0), "accent")
    B.box("schedule_sheet", (ax0 + 0.1, 0.3, 1.25), (ax0 + 0.11, 0.75, 1.85), "paper")
    B.solid("admin_desk0", (-7.6, 2.9, 0), (-6.2, 3.6, 0.74))
    B.solid("admin_desk1", (-4.9, 3.3, 0), (-3.5, 4.0, 0.74))
    B.solid("cabinet", (-3.2, 3.6, 0), (-2.62, 4.9, 1.9), "metal")
    B.box("terminal", (-4.4, 3.5, 0.74), (-4.0, 3.85, 1.1), "dark")
    # 교무실: 책상 섬 둘. 배수정은 문 가까운 빈 자리에서 보고서를 쓴다
    B.room("staff", tx0, ty0, tx1, ty1, h, gaps={"n": [(-1.5, 4.5, 1.0, 2.1)], "e": []}, lamps=[(-0.4, 1.4), (-0.4, 3.6), (3.4, 2.5)])
    for i, (dx, dy) in enumerate(((-1.6, 3.4), (-0.2, 3.4), (-1.6, 4.1), (-0.2, 4.1), (3.2, 3.6), (4.6, 3.6))):
        B.solid(f"staff_desk{i}", (dx - 0.65, dy - 0.33, 0), (dx + 0.65, dy + 0.33, 0.74))
    B.solid("bae_desk", (1.75, 2.75, 0), (3.05, 3.4, 0.74))
    B.box("report_sheet", (2.2, 2.85, 0.74), (2.6, 3.2, 0.75), "paper")
    B.solid("staff_locker", (4.9, 0.3, 0), (5.42, 2.2, 1.9), "metal")
    # 계단 홀: 접이식 철문이 3층으로 가는 길을 막고 있다
    B.room("stair", rx0, ry0, rx1, ry1, h, gaps={"n": [], "e": []}, lamps=[(7.2, 0.6)])
    B.box("stair_gate", (6.0, 1.45, 0), (8.6, 1.5, 2.0), "metal")
    B.collider("stair_gate", (rx0, 1.4, 0), (rx1, 1.6, 2.2))
    for i in range(8):
        B.box(f"step{i}", (6.0, 1.7 + i * 0.3, 0), (8.6, 2.0 + i * 0.3, 0.17 * (i + 1)), "floor")
    B.box("stair_sign", (6.6, 1.43, 1.3), (7.8, 1.45, 1.7), "paper")
    # 사실화에서 생기는 것들(현관 기둥, 화단, 입간판, 차, 화분, 복사기, 차 탁자)의 충돌 면
    B.collider("porch_col0", (-1.85, -4.25, 0), (-1.55, -3.95, 3.1))
    B.collider("porch_col1", (1.55, -4.25, 0), (1.85, -3.95, 3.1))
    B.collider("bed_w", (-8.7, -3.4, 0), (-2.25, -2.7, 0.9))
    B.collider("bed_e", (2.25, -3.4, 0), (8.7, -2.7, 0.9))
    B.collider("exam_sign", (2.25, -5.05, 0), (2.95, -4.55, 1.4))
    B.collider("car0", (4.1, -5.5, 0), (8.3, -3.45, 1.4))
    B.collider("plant_admin", (-3.17, 2.73, 0), (-2.73, 3.17, 1.2))
    B.collider("copier", (-8.9, 3.95, 0), (-8.15, 4.75, 1.1))
    B.collider("tea_table", (-2.35, 0.15, 0), (-1.45, 0.8, 0.8))
    B.markers(L.GATE_MARKERS)
    return B.report()


BUILDERS = {"rooftop": build_rooftop, "apt": build_apt, "academy": build_academy, "gate": build_gate}


def build_all():
    return [fn() for fn in BUILDERS.values()]


def show(name=None):
    """하나만 보이게 한다. 이름이 없으면 모두."""
    top = bpy.context.view_layer.layer_collection.children
    for k in BUILDERS:
        if k in top:
            top[k].exclude = bool(name) and k != name


def export_all(only=None):
    exec(open(os.path.join(HERE, "export_glb.py"), encoding="utf-8").read(), globals())
    show()
    out = {}
    for k in BUILDERS:
        if only and k != only:
            continue
        out[k] = export_collection(k, os.path.join(OUT, f"prologue_{k}_blockout.glb"))
    return out
