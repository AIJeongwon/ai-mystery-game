# 프롤로그 「시험 전」 네 장소의 자리 — 블록아웃과 사실화 스크립트가 함께 읽는다.
# Blender 좌표: Z가 위, 1단위 = 1m. 게임(three.js)의 (x, y, z)는 Blender의 (x, z, -y).
# 게임은 glb 안의 이름(spot_*, spawn_*, npc_*)에서 자리를 읽으므로,
# 여기 이름을 바꾸면 public/js/data/sites/prologue.js도 같이 바꾼다. (tests/prologue.test.mjs가 맞는지 본다)
# (이름, (x, y, z), 바라보는 방향 도 — Z축 회전, 0이면 +X)

# ── 옥탑방: 방 하나와 옥상 ──
ROOFTOP = dict(room=(-2.2, -1.7, 2.2, 1.7), h=2.3, slab=(-5.0, -2.4, 5.0, 8.5), parapet=1.1)
ROOFTOP_MARKERS = [
    ("spawn_rooftop", (0.5, -0.1, 0.0), -140),          # 침대 곁에서 책상 쪽을 본다
    ("spawn_rooftop_stairs", (2.2, 3.15, 0.0), 180),    # 계단실에서 나와 옥상을 본다
    ("spot_laptop", (-0.9, -1.3, 0.80), 0),
    ("spot_board", (-2.12, 0.0, 1.4), 0),
    ("spot_parcel", (0.25, 1.15, 0.28), 0),
    ("spot_rail", (-1.0, 8.4, 1.1), 0),
    ("spot_stairs", (2.82, 3.15, 1.1), 0),
]

# ── 목동 가람아파트 107동: 마당(분리수거장, 경비실), 1층 로비, 103호 현관 ──
APT = dict(yard=(-9.0, -7.0, 9.0, 3.0), lobby=(-2.5, 3.0, 2.5, 8.0), h=2.6, booth=(-6.5, -1.0, -3.8, 1.6), bins=(4.5, -5.5, 8.5, -2.5))
APT_MARKERS = [
    ("spawn_apt", (0.0, -6.0, 0.0), 90),
    ("spot_apt_gate", (0.0, -6.85, 1.2), 0),
    ("npc_guard", (-3.0, -0.6, 0.0), -35),
    ("spot_guard_shelf", (-6.38, 0.3, 1.25), 0),
    ("spot_bins", (7.46, -4.27, 0.5), 0),
    ("spot_mailbox", (-2.42, 5.2, 1.2), 0),
    ("spot_lobby_board", (2.42, 5.2, 1.5), 0),
    ("spot_door103", (1.3, 7.9, 1.2), 0),
]

# ── 목동 서로재수학원: 로비, 자습실, 상담실 ──
ACADEMY = dict(lobby=(-4.0, -4.0, 4.0, 0.0), study=(-4.0, 0.0, 1.0, 7.5), office=(1.0, 0.0, 4.0, 4.0), h=2.6)
STUDY_COLS = [-3.45, -2.5, -0.8, 0.15]      # 칸막이 책상 네 열. 가운데(-1.65)가 통로
STUDY_ROWS = [1.2, 2.5, 3.8, 5.1, 6.4]
DOHYEON_SEAT = (-0.8, 5.1)                  # 통로 옆, 뒤에서 둘째 줄
ACADEMY_MARKERS = [
    ("spawn_academy", (0.0, -3.2, 0.0), 90),
    ("spot_academy_exit", (0.0, -3.9, 1.2), 0),
    ("spot_rank_board", (-3.93, -2.0, 1.5), 0),
    ("spot_banner", (0.2, -0.1, 1.95), 0),
    ("spot_dohyeon_desk", (DOHYEON_SEAT[0], DOHYEON_SEAT[1], 0.78), 0),
    ("spot_desk_gap", (DOHYEON_SEAT[0] + 0.42, DOHYEON_SEAT[1] + 0.1, 0.74), 0),
    ("spot_other_desk", (-2.5, 5.1, 0.78), 0),
    ("npc_tutor", (2.5, 3.1, 0.0), -90),
]

# ── 목원고 본관 1층: 교문 앞, 복도, 행정실, 교무실, 3층으로 가는 계단 ──
GATE = dict(yard=(-9.0, -9.0, 9.0, -2.6), hall=(-9.0, -2.6, 9.0, -0.2), admin=(-9.0, -0.2, -2.5, 5.0), staff=(-2.5, -0.2, 5.5, 5.0), stair=(5.5, -0.2, 9.0, 5.0), h=2.7)
GATE_MARKERS = [
    ("spawn_gate", (0.0, -8.0, 0.0), 90),
    ("spawn_gate_stairs", (7.2, -0.9, 0.0), 90),
    ("spot_school_gate", (0.0, -8.85, 1.2), 0),
    ("spot_gate_banner", (0.0, -4.4, 3.33), 0),          # 현관 지붕 난간에 걸린 현수막
    ("spot_office_board", (-8.9, 0.5, 1.5), 0),
    ("npc_chief", (-5.5, 2.3, 0.0), -90),
    ("npc_bae_office", (2.4, 2.3, 0.0), -90),
    ("spot_wait_bench", (3.0, -0.55, 0.5), 0),
    ("spot_stairs3", (7.2, 1.25, 1.2), 0),
]

MARKERS = {"rooftop": ROOFTOP_MARKERS, "apt": APT_MARKERS, "academy": ACADEMY_MARKERS, "gate": GATE_MARKERS}
