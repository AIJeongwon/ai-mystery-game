# 목원고 12시험실의 치수와 자리 — 블록아웃과 사실화 스크립트가 함께 읽는다.
# Blender 좌표: Z가 위, 1단위 = 1m. 칠판은 -X 벽, 창은 -Y 벽, 복도는 +Y 벽.
# 게임은 glb 안의 이름(spot_*, spawn_*, npc_*, view_*, col_*)에서 자리를 읽으므로,
# 여기 이름을 바꾸면 public/js/data/sites/mokwon.js도 같이 바꾼다.

ROOM_X = 9.0   # 칠판 벽 ~ 뒷벽
ROOM_Y = 7.2   # 창 ~ 복도
ROOM_Z = 2.7   # 바닥 ~ 텍스 천장
WALL_T = 0.2
HX, HY = ROOM_X / 2, ROOM_Y / 2
TILE = 0.6     # 천장 텍스 한 장

# 책상: 여섯 줄(앞→뒤) × 네 열(복도→창). 수험번호는 복도 쪽 앞자리가 1번, 창 쪽 맨 뒤가 24번.
ROW_X = [-2.4, -1.3, -0.2, 0.9, 2.0, 3.1]
COL_Y = [2.25, 0.75, -0.75, -2.25]
DESK = (0.45, 0.65, 0.72)    # 깊이(X), 너비(Y), 높이
CHAIR_DX = 0.48              # 책상 중심에서 의자 중심까지 (뒤쪽 +X)

# 24번 책상은 전날 밤 창 쪽으로 텍스 한 장만큼 옮겨졌다.
DESK24_OLD = (3.1, -2.25)
DESK24 = (3.1, -2.85)
TILE24 = (3.0, -2.7)         # 장치가 올라간 텍스의 중심
LADDER = (3.0, -2.05)        # 그날 밤 사다리가 섰던 자리 (책상 줄 사이). 발 간격 0.56 x 0.8
LADDER_FEET = [(LADDER[0] + sx * 0.28, LADDER[1] + sy * 0.4) for sx in (-1, 1) for sy in (-1, 1)]
IR_HOLE = (TILE24[0] + 0.17, TILE24[1] + 0.12)   # 빛 신호가 새는 텍스 구멍

WINDOWS_X = [-3.0, 0.0, 3.0]  # 창 세 칸의 중심, 너비 2.4, 턱 0.9 ~ 2.3
DOORS_X = [-3.6, 3.6]         # 복도 쪽 앞문·뒷문의 중심, 너비 0.9, 높이 2.1

def seats():
    """[(번호, x, y)] — 24번은 옮겨진 자리로."""
    out = []
    n = 1
    for cy in COL_Y:
        for rx in ROW_X:
            x, y = (DESK24 if n == 24 else (rx, cy))
            out.append((n, x, y))
            n += 1
    return out

# 게임이 읽는 자리. (이름, (x, y, z), 바라보는 방향 도 — Z축 회전, 0이면 +X)
MARKERS = [
    ("spawn_room12", (-3.6, 2.7, 0.0), -60),
    ("npc_bae_front", (-3.9, -1.2, 0.0), 15),   # 교탁의 창 쪽, 칠판 앞. 앞줄 통로는 막지 않는다
    ("spot_desk24_top", (DESK24[0], DESK24[1], 0.74), 0),
    ("spot_desk24_under", (DESK24[0] + 0.05, DESK24[1], 0.62), 0),
    ("spot_desk23_top", (2.0, -2.25, 0.74), 0),
    ("spot_floor_ladder", (LADDER[0], LADDER[1], 0.02), 0),
    ("spot_floor_old", (DESK24_OLD[0], DESK24_OLD[1], 0.02), 0),
    ("spot_ceiling24", (TILE24[0], TILE24[1], ROOM_Z - 0.02), 0),
    ("spot_tile24", (TILE24[0], TILE24[1], ROOM_Z - 0.03), 0),
    ("spot_ladder", (4.05, 1.55, 0.9), 0),
    ("spot_ladder_place", (LADDER[0], LADDER[1], 0.0), 0),
    ("spot_ladder_climb", (LADDER[0], LADDER[1], 1.0), 0),
    ("view_ladder_top", (LADDER[0], LADDER[1] - 0.22, 2.1), -90),
    ("fx_ir_point", (IR_HOLE[0], IR_HOLE[1], ROOM_Z - 0.013), 0),
    ("spot_blackboard", (-HX + 0.08, 0.0, 1.5), 0),
    ("spot_clock", (-HX + 0.08, 0.0, 2.4), 0),
    ("spot_speaker", (-HX + 0.15, 3.0, 2.45), 0),
    ("spot_window", (0.0, -HY + 0.1, 1.5), 0),
    ("spot_notice", (HX - 0.08, -1.2, 1.5), 0),
]
