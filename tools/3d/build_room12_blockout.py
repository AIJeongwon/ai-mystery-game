# 목원고 12시험실 블록아웃 — Blender에서 실행한다 (Blender MCP의 execute_blender_code, 또는 Scripting 탭).
#   exec(open(r"D:\ai-mystery-game\tools\3d\build_room12_blockout.py", encoding="utf-8").read())
# 회색 상자로 방·가구·충돌 면을 짜고, 게임이 읽는 자리를 빈 오브젝트로 놓는다.
# 결과: 컬렉션 room12 (arch / furniture / colliders / markers).
import bpy, math, os, sys, importlib

HERE = r"D:\ai-mystery-game\tools\3d"
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import room12_layout as L
importlib.reload(L)

def coll(name, parent=None):
    c = bpy.data.collections.get(name)
    if c is None:
        c = bpy.data.collections.new(name)
        (parent or bpy.context.scene.collection).children.link(c)
    return c

def wipe(c):
    for o in list(c.objects):
        bpy.data.objects.remove(o, do_unlink=True)

# R12_SHARED_ONLY = True 로 두고 실행하면 충돌 면과 자리만 만든다 (사실 버전 파일에서 쓴다).
SHARED_ONLY = bool(globals().get("R12_SHARED_ONLY"))
if not SHARED_ONLY and bpy.data.collections.get("room12_real"):
    raise RuntimeError("이 파일에는 사실 버전이 있다. 블록아웃은 빈 파일에서 짓는다 (이름이 겹친다).")
ROOT = coll("room12")
ARCH, FURN, COLS, MARK = (coll(n, ROOT) for n in ("arch", "furniture", "colliders", "markers"))
for c in (ARCH, FURN, COLS, MARK):
    wipe(c)

def mat(name, rgb, rough=0.8):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough
    m.diffuse_color = (*rgb, 1)
    return m

M = {
    "wall": mat("bo_wall", (0.72, 0.74, 0.70)),
    "floor": mat("bo_floor", (0.45, 0.42, 0.38)),
    "ceil": mat("bo_ceiling", (0.85, 0.85, 0.83)),
    "hole": mat("bo_hole", (0.01, 0.01, 0.012)),
    "furn": mat("bo_furniture", (0.55, 0.50, 0.42)),
    "accent": mat("bo_accent", (0.16, 0.32, 0.24)),
    "glass": mat("bo_glass", (0.55, 0.70, 0.80), 0.1),
    "key": mat("bo_key", (0.80, 0.30, 0.22)),
    "col": mat("bo_collider", (0.9, 0.1, 0.9)),
}

def box(name, lo, hi, material, c):
    """lo, hi: 마주 보는 두 모서리. 원점은 상자의 중심."""
    if SHARED_ONLY and c is not COLS:
        return None
    size = [abs(hi[i] - lo[i]) for i in range(3)]
    loc = [(hi[i] + lo[i]) / 2 for i in range(3)]
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.append(material)
    for uc in list(o.users_collection):
        uc.objects.unlink(o)
    c.objects.link(o)
    return o

def collider(name, lo, hi):
    o = box("col_" + name, lo, hi, M["col"], COLS)
    o.display_type = "WIRE"
    o.hide_render = True
    return o

HX, HY, HZ, T = L.HX, L.HY, L.ROOM_Z, L.WALL_T

# ── 바닥, 천장 ──
box("floor", (-HX, -HY, -0.1), (HX, HY, 0), M["floor"], ARCH)
box("ceiling", (-HX, -HY, HZ), (HX, HY, HZ + 0.02), M["ceil"], ARCH)
# 장치가 올라간 텍스 한 장은 따로 떼어 둔다 (밀어 올리는 연출)
tx, ty = L.TILE24
box("tile24", (tx - L.TILE / 2, ty - L.TILE / 2, HZ - 0.012), (tx + L.TILE / 2, ty + L.TILE / 2, HZ), M["key"], ARCH)
# 텍스를 밀어 올리면 드러나는 어둠 (게임에서는 빛을 받지 않는 검은 면으로 그린다)
box("hole24", (tx - L.TILE / 2 + 0.02, ty - L.TILE / 2 + 0.02, HZ - 0.004), (tx + L.TILE / 2 - 0.02, ty + L.TILE / 2 - 0.02, HZ - 0.001), M["hole"], ARCH)

# ── 벽 ──
box("wall_front", (-HX - T, -HY - T, 0), (-HX, HY + T, HZ), M["wall"], ARCH)   # 칠판 벽
box("wall_back", (HX, -HY - T, 0), (HX + T, HY + T, HZ), M["wall"], ARCH)
# 창 벽(-Y): 턱, 상인방, 기둥
box("wall_win_sill", (-HX, -HY - T, 0), (HX, -HY, 0.9), M["wall"], ARCH)
box("wall_win_head", (-HX, -HY - T, 2.3), (HX, -HY, HZ), M["wall"], ARCH)
edges = [-HX] + [v for cx in L.WINDOWS_X for v in (cx - 1.2, cx + 1.2)] + [HX]
for i in range(0, len(edges), 2):
    if edges[i + 1] - edges[i] > 0.01:
        box(f"wall_win_pier{i // 2}", (edges[i], -HY - T, 0.9), (edges[i + 1], -HY, 2.3), M["wall"], ARCH)
for i, cx in enumerate(L.WINDOWS_X):
    box(f"window{i}_glass", (cx - 1.2, -HY - T / 2 - 0.005, 0.9), (cx + 1.2, -HY - T / 2 + 0.005, 2.3), M["glass"], ARCH)
# 복도 벽(+Y): 문 두 개
dedges = [-HX] + [v for cx in L.DOORS_X for v in (cx - 0.45, cx + 0.45)] + [HX]
for i in range(0, len(dedges), 2):
    box(f"wall_cor_seg{i // 2}", (dedges[i], HY, 0), (dedges[i + 1], HY + T, HZ), M["wall"], ARCH)
for i, cx in enumerate(L.DOORS_X):
    box(f"wall_cor_head{i}", (cx - 0.45, HY, 2.1), (cx + 0.45, HY + T, HZ), M["wall"], ARCH)
    box(f"door{i}", (cx - 0.45, HY + 0.08, 0), (cx + 0.45, HY + 0.12, 2.1), M["furn"], ARCH)

# ── 칠판, 시계, 스피커, 게시판 ──
box("blackboard", (-HX, -1.8, 0.9), (-HX + 0.04, 1.8, 2.1), M["accent"], FURN)
box("clock", (-HX, -0.15, 2.25), (-HX + 0.05, 0.15, 2.55), M["furn"], FURN)
box("speaker", (-HX, 2.85, 2.3), (-HX + 0.18, 3.15, 2.6), M["furn"], FURN)
box("notice_board", (HX - 0.03, -2.1, 1.0), (HX, -0.3, 2.0), M["accent"], FURN)

# ── 교탁 ──
box("podium", (-4.0, -0.45, 0), (-3.5, 0.45, 1.1), M["furn"], FURN)   # 앞줄과 1m 가까이 띄운다 (앞을 가로질러 걸을 수 있게)
collider("podium", (-4.02, -0.47, 0), (-3.48, 0.47, 1.2))

# ── 책상과 의자 ──
dx, dy, dz = L.DESK
for n, x, y in L.seats():
    m = M["key"] if n == 24 else M["furn"]
    box(f"desk{n:02d}", (x - dx / 2, y - dy / 2, dz - 0.03), (x + dx / 2, y + dy / 2, dz), m, FURN)       # 상판
    box(f"desk{n:02d}_frame", (x - dx / 2 + 0.03, y - dy / 2 + 0.03, 0), (x + dx / 2 - 0.03, y + dy / 2 - 0.03, dz - 0.03), m, FURN)
    cx = x + L.CHAIR_DX
    box(f"chair{n:02d}", (cx - 0.2, y - 0.2, 0), (cx + 0.2, y + 0.2, 0.44), m, FURN)
    box(f"chair{n:02d}_back", (cx + 0.17, y - 0.2, 0.44), (cx + 0.2, y + 0.2, 0.8), m, FURN)
    collider(f"seat{n:02d}", (x - dx / 2, y - dy / 2, 0), (cx + 0.22, y + dy / 2, 0.8))

# ── 뒷벽: 사물함, 청소 도구함, 빌려 온 사다리 ──
box("lockers", (HX - 0.45, -HY + 0.2, 0), (HX, -2.3, 1.2), M["furn"], FURN)
collider("lockers", (HX - 0.5, -HY, 0), (HX, -2.25, 1.3))
box("broom_cabinet", (HX - 0.5, 2.6, 0), (HX, 3.3, 1.8), M["furn"], FURN)
collider("broom_cabinet", (HX - 0.55, 2.55, 0), (HX, 3.35, 1.9))
box("ladder_folded", (HX - 0.18, 1.25, 0), (HX - 0.04, 1.85, 1.8), M["key"], FURN)

# 펼친 사다리 (게임이 놓을 때 보이게 한다)
lx0, ly0 = L.LADDER
box("ladder_open", (lx0 - 0.28, ly0 - 0.4, 0), (lx0 + 0.28, ly0 + 0.4, 1.8), M["key"], FURN)
collider("ladder_open", (lx0 - 0.3, ly0 - 0.42, 0), (lx0 + 0.3, ly0 + 0.42, 1.8))

# ── 흔적 (사실화 때 데칼로 바꾼다) ──
d24x, d24y = L.DESK24
box("trace_dust", (d24x - 0.1, d24y - 0.12, dz), (d24x + 0.1, d24y + 0.12, dz + 0.004), M["ceil"], FURN)
box("trace_tape", (d24x - 0.02, d24y - 0.09, dz - 0.034), (d24x + 0.02, d24y + 0.09, dz - 0.03), M["glass"], FURN)
for i, (fx, fy) in enumerate(L.LADDER_FEET):
    box(f"trace_ladder_mark{i}", (fx - 0.035, fy - 0.035, 0), (fx + 0.035, fy + 0.035, 0.004), M["accent"], FURN)
ox, oy = L.DESK24_OLD
for i, (sx, sy) in enumerate(((-1, -1), (-1, 1), (1, -1), (1, 1))):
    px, py = ox + sx * (dx / 2 - 0.04), oy + sy * (dy / 2 - 0.04)
    box(f"trace_old_mark{i}", (px - 0.015, py - 0.015, 0), (px + 0.015, py + 0.015, 0.004), M["wall"], FURN)

# ── 조명 자리 (형광등 여섯) ──
for i, lx in enumerate((-2.7, 0.3, 3.3)):
    for j, ly in enumerate((-1.8, 1.8)):
        box(f"lamp{i}{j}", (lx - 0.6, ly - 0.15, HZ - 0.03), (lx + 0.6, ly + 0.15, HZ - 0.005), M["glass"], ARCH)

# ── 벽 충돌 (문과 창으로도 나가지 못한다) ──
collider("wall_front", (-HX - T, -HY - T, 0), (-HX, HY + T, HZ))
collider("wall_back", (HX, -HY - T, 0), (HX + T, HY + T, HZ))
collider("wall_window", (-HX, -HY - T, 0), (HX, -HY, HZ))
collider("wall_corridor", (-HX, HY, 0), (HX, HY + T, HZ))

# ── 게임이 읽는 자리 ──
for name, loc, yaw in L.MARKERS:
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = "ARROWS" if name.startswith(("spawn", "npc", "view")) else "SPHERE"
    e.empty_display_size = 0.25 if name.startswith(("spawn", "npc", "view")) else 0.12
    e.location = loc
    e.rotation_euler = (0, 0, math.radians(yaw))
    MARK.objects.link(e)

print("room12 blockout:", len(ARCH.objects), "arch,", len(FURN.objects), "furniture,", len(COLS.objects), "colliders,", len(MARK.objects), "markers")
