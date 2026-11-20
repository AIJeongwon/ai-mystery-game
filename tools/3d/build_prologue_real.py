# 프롤로그 네 장소의 사실화 — Blender에서 실행한다. 장소마다 .blend 하나를 쓴다(조명을 구울 때 다른 장소가 섞이지 않게).
#   exec(open(r"D:\ai-mystery-game\tools\3d\build_prologue_real.py", encoding="utf-8").read(), globals())
#   build("rooftop")            파일을 비우고 → 블록아웃(충돌 면과 자리) → 사실화 → 붙박이 묶기와 조명 UV
#   bake_one("rooftop", "lamp") 조명 한 장 (lamp / sky / sun 을 따로 부른다)
#   export("rooftop")           public/assets/3d/sites/prologue_rooftop.glb
#   save("rooftop")             tools/_raw/3d/blend/prologue_rooftop.blend
# 방과 붙박이, 글자가 든 것, 단서가 되는 것은 여기서 손으로 짓는다. 가구와 차, 나무는 Tripo가 만든 glb(tools/_raw/3d/tripo)를 놓는다.
# Tripo 파일이 아직 없으면 그 자리는 단순한 상자로 채운다(다시 build하면 바뀐다).
# 해의 방향·색·세기와 range는 public/js/data/sites/prologue.js의 light, lightmap과 같아야 한다 (three.js의 (x, y, z) = Blender의 (x, z, -y)).
import bpy, sys, os, importlib, math, random
import numpy as np

HERE = r"D:\ai-mystery-game\tools\3d"
SITES_OUT = r"D:\ai-mystery-game\public\assets\3d\sites"
BLEND = r"D:\ai-mystery-game\tools\_raw\3d\blend"
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import blockout_lib, prologue_layout as L, real_lib, build_prologue_blockout as BO
for m in (blockout_lib, L, real_lib, BO):
    importlib.reload(m)
from real_lib import Real, common_materials, PI

DOOR = 2.05

# 굽기 설정. sun_dir은 Blender 좌표(장소에서 해를 향한다).
BAKE = {
    "rooftop": dict(out="prologue_rooftop", sun_dir=(0.55, -0.72, 0.42), sun_color=(1.0, 0.86, 0.68), sun_strength=3.2, sky_color=(0.70, 0.80, 0.94), sky_strength=0.6, lamp=5.0,
                    range={"lamp": 0.8, "sky": 0.8, "sun": 0.45}),
    "apt": dict(out="prologue_apt", sun_dir=(0.7, -0.6, 0.45), sun_color=(0.92, 0.94, 0.96), sun_strength=2.2, sky_color=(0.80, 0.84, 0.88), sky_strength=0.6, lamp=1.6,
                range={"lamp": 0.8, "sky": 0.8, "sun": 0.45}),
    "academy": dict(out="prologue_academy", sun_dir=(0.8, -0.25, 0.5), sun_color=(0.96, 0.93, 0.88), sun_strength=2.4, sky_color=(0.80, 0.84, 0.88), sky_strength=0.9, lamp=1.0,
                    range={"lamp": 0.8, "sky": 0.8, "sun": 0.45}),
    "gate": dict(out="prologue_gate", sun_dir=(-0.6, -0.7, 0.5), sun_color=(1.0, 0.85, 0.66), sun_strength=3.2, sky_color=(0.70, 0.80, 0.94), sky_strength=0.6, lamp=1.5,
                 range={"lamp": 0.8, "sky": 0.8, "sun": 0.45}),
}


def reset():
    """파일을 비운다 (read_homefile을 쓰지 않는다: 문맥이 낡아 뒤의 연산이 실패한다)."""
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)
    for blk in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.curves, bpy.data.lights):
        for d in list(blk):
            blk.remove(d)


def begin(site, seed=7):
    reset()
    BO.BUILDERS[site]()                                  # 충돌 면과 자리
    for n in ("arch", "furniture"):                       # 회색 상자는 치운다 (블록아웃 glb는 따로 남아 있다)
        c = bpy.data.collections["%s_%s" % (site, n)]
        for o in list(c.objects):
            bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.collections.remove(c)
    R = Real(site, seed)
    common_materials(R)
    return R


def far_town(R, center, inner, outer, ground_z, n=90, roofs=("far_green", "far_grey", "far_grey2"), tall=0.10, hmin=5.0, hmax=11.5, own=None):
    """담 너머의 동네: 낮은 건물의 지붕들. 조명을 굽지 않는 먼 것들이라 한 덩어리로 묶어 둔다."""
    objs = []
    cx, cy = center
    objs.append(R.box("far_ground", (cx - outer - 12, cy - outer - 12, ground_z - 0.2), (cx + outer + 12, cy + outer + 12, ground_z), "far_road", R.DYN, uv=6))
    if own:
        objs.append(R.box("far_own", (own[0], own[1], ground_z), (own[2], own[3], own[4]), "far_wall", R.DYN, uv=3))
    placed = []
    tries = 0
    while len(placed) < n and tries < n * 30:
        tries += 1
        a, d = R.rng.uniform(0, 2 * PI), R.rng.uniform(inner, outer)
        w, dp = R.rng.uniform(6, 13), R.rng.uniform(6, 12)
        x, y = cx + math.cos(a) * d, cy + math.sin(a) * d
        if own and (own[0] - 2.5 < x + w / 2 and x - w / 2 < own[2] + 2.5 and own[1] - 2.5 < y + dp / 2 and y - dp / 2 < own[3] + 2.5):
            continue
        if any(abs(x - px) < (w + pw) / 2 + 1.2 and abs(y - py) < (dp + pd) / 2 + 1.2 for px, py, pw, pd in placed):
            continue
        placed.append((x, y, w, dp))
        h = R.rng.uniform(hmin, hmax) if (R.rng.random() > tall or d < inner + 16) else R.rng.uniform(hmax + 3, hmax + 16)   # 높은 건물은 멀리에만
        i = len(placed)
        objs.append(R.box("far_b%d" % i, (x - w / 2, y - dp / 2, ground_z), (x + w / 2, y + dp / 2, ground_z + h), R.rng.choice(("far_wall", "far_wall2", "far_brick")), R.DYN, uv=3))
        objs.append(R.box("far_r%d" % i, (x - w / 2 - 0.15, y - dp / 2 - 0.15, ground_z + h), (x + w / 2 + 0.15, y + dp / 2 + 0.15, ground_z + h + 0.25), R.rng.choice(roofs), R.DYN, uv=3))
        k = R.rng.random()
        if k < 0.5:      # 옥상의 물탱크나 옥탑
            tx, ty = x + R.rng.uniform(-w / 4, w / 4), y + R.rng.uniform(-dp / 4, dp / 4)
            if k < 0.25:
                objs.append(R.cyl("far_t%d" % i, (tx, ty, ground_z + h + 0.25), 0.7, 1.5, "tank", R.DYN, seg=10))
            else:
                objs.append(R.box("far_t%d" % i, (tx - 1.6, ty - 1.3, ground_z + h + 0.25), (tx + 1.6, ty + 1.3, ground_z + h + 2.5), "far_wall2", R.DYN, uv=3))
    far = R.join(objs, "far")
    far.visible_shadow = False
    return far


def far_materials(R):
    R.pbr("far_green", R.tex_speckle("fargreen", (0.20, 0.40, 0.29), 0.10, S=256, stain=0.4), 0.8)
    R.pbr("far_grey", R.tex_speckle("fargrey", (0.50, 0.50, 0.48), 0.10, S=256, stain=0.4), 0.85)
    R.pbr("far_grey2", R.tex_speckle("fargrey2", (0.40, 0.33, 0.30), 0.10, S=256, stain=0.3), 0.85)
    R.pbr("far_wall", R.tex_speckle("farwall", (0.74, 0.71, 0.65), 0.07, S=256, stain=0.3), 0.9)
    R.pbr("far_wall2", R.tex_speckle("farwall2", (0.62, 0.60, 0.57), 0.07, S=256, stain=0.3), 0.9)
    R.pbr("far_brick", R.tex_tiles("farbrick", 8, 24, (0.50, 0.26, 0.20), (0.62, 0.60, 0.56), S=256, gap=2, brick=True), 0.9)
    R.pbr("far_road", R.tex_speckle("farroad", (0.22, 0.22, 0.23), 0.08, S=256), 0.9)
    R.pbr("tank", R.tex_stripes("tank", (0.86, 0.64, 0.08), (0.66, 0.47, 0.05), n=14, vertical=False), 0.55)


def sky(R, top, horizon, haze, strength=1.0, **kw):
    R.pbr("sky", (0, 0, 0), 1.0, emit=R.tex_panorama("sky", top, horizon, haze, **kw), emit_strength=strength, bake_emit=0.0)
    return R.sky_dome("sky")


def furn(R, file, key, name, lo, hi, yaw=0.0, mat="wood", fit=True, rot_z=0.0, decimate=1.0, c=None):
    """Tripo 가구를 상자 (lo, hi) 자리에 놓는다. 파일이 없으면 그만 한 상자."""
    sx, sy, sz = hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]
    quarter = abs(math.sin(yaw)) > 0.7                    # 90도 돌려 놓으면 가로세로가 바뀐다
    size = (sy, sx, sz) if quarter else (sx, sy, sz)
    me = R.tripo(file, key, size if fit else None, rot_z, decimate, None if fit else sz)
    ctr = ((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2])
    if me is None:
        return R.box(name, lo, hi, mat, c or R.FURN)
    return R.place(name, me, ctr, yaw, c)


# ═══════════ 옥탑방 ═══════════
def build_rooftop():
    R = begin("rooftop", 11)
    far_materials(R)
    x0, y0, x1, y1 = L.ROOFTOP["room"]
    h = L.ROOFTOP["h"]
    sx0, sy0, sx1, sy1 = L.ROOFTOP["slab"]
    p = L.ROOFTOP["parapet"]
    T = 0.15
    # 재질
    green = R.tex_speckle("roofgreen", (0.16, 0.36, 0.26), 0.10, stain=0.45, rough=(0.5, 0.9))
    R.pbr("roof_green", green[0], green[1])
    R.pbr("concrete", R.tex_speckle("concrete", (0.60, 0.59, 0.56), 0.09, stain=0.4), 0.9)
    R.pbr("stucco", R.tex_speckle("stucco", (0.82, 0.79, 0.72), 0.06, fine=0.8, stain=0.3), 0.92)
    R.pbr("wallpaper", R.tex_stripes("wallpaper", (0.90, 0.88, 0.82), (0.86, 0.84, 0.78), n=30, soft=0.4), 0.9)
    jp = R.tex_planks("jangpan", 8, (0.74, 0.62, 0.43), cuts=1, var=0.05, rough=(0.22, 0.42))
    R.pbr("jangpan", jp[0], jp[1])
    R.pbr("ceil", R.tex_speckle("ceil", (0.90, 0.90, 0.87), 0.03, S=256), 0.95)
    R.pbr("wood", R.tex_grain("wood", (0.56, 0.41, 0.27)), 0.5)
    R.pbr("wood_dark", R.tex_grain("wooddark", (0.30, 0.21, 0.14)), 0.55)
    pl = R.tex_planks("plank", 10, (0.50, 0.38, 0.27), cuts=1, var=0.10, rough=(0.7, 0.92))
    R.pbr("plank", pl[0], pl[1])
    R.pbr("cork", R.tex_speckle("cork", (0.62, 0.45, 0.28), 0.22, S=256, fine=1.2, coarse=8), 0.95)
    R.pbr("cardboard", R.tex_speckle("cardboard", (0.63, 0.49, 0.33), 0.06, S=256), 0.85)
    R.pbr("tape", (0.76, 0.66, 0.42), 0.3)
    R.pbr("door_green", (0.16, 0.27, 0.24), 0.5, 0.2)
    R.pbr("door_room", R.tex_grain("doorroom", (0.62, 0.52, 0.40)), 0.5)
    R.pbr("cloth_white", (0.88, 0.87, 0.84), 0.95)
    R.pbr("cloth_blue", (0.20, 0.30, 0.48), 0.95)
    R.pbr("cloth_navy", (0.07, 0.09, 0.14), 0.95)
    R.pbr("cloth_grey", (0.46, 0.46, 0.48), 0.95)
    R.pbr("cloth_red", (0.55, 0.16, 0.14), 0.95)
    R.pbr("styro", R.tex_speckle("styro", (0.90, 0.90, 0.88), 0.04, S=256), 0.9)
    R.pbr("soil", (0.16, 0.12, 0.09), 1.0)
    R.pbr("leaf", (0.20, 0.42, 0.16), 0.7)
    R.pbr("pipe_yellow", (0.80, 0.66, 0.12), 0.5, 0.2)
    R.pbr("screen", (0, 0, 0), 0.3, emit=R.picture("pl_laptop.png"), emit_strength=1.3, bake_emit=3.0)
    R.pbr("warm", (1, 1, 1), 0.4, emit=(1.0, 0.72, 0.42), emit_strength=18.0, bake_emit=60.0)
    R.pbr("lamp", (1, 1, 1), 0.4, emit=(1.0, 0.95, 0.86), emit_strength=8.0, bake_emit=7.0)
    R.pbr("pic_news", R.picture("pl_news.png"), 0.85)
    R.pbr("pic_calendar", R.picture("pl_calendar.png"), 0.8)
    R.pbr("pic_label", R.picture("pl_parcel_label.png"), 0.7)
    R.pbr("mug", (0.82, 0.80, 0.74), 0.3)

    # ── 옥상 바닥과 난간 ──
    R.box("slab", (sx0, sy0, -0.3), (sx1, sy1, 0), "roof_green", uv=3.0)
    for nm, a, b in (("s", (sx0, sy0), (sx1, sy0)), ("n", (sx0, sy1), (sx1, sy1)), ("w", (sx0, sy0), (sx0, sy1)), ("e", (sx1, sy0), (sx1, sy1))):
        R.wall("parapet_" + nm, a, b, p, 0.2, mat="concrete", uv=2.0)
        along = 0 if nm in "sn" else 1
        lo, hi = [a[0] - 0.13, a[1] - 0.13, p], [b[0] + 0.13, b[1] + 0.13, p + 0.05]
        R.box("parapet_cap_" + nm, lo, hi, "concrete", uv=2.0)
    R.cyl("drain", (sx0 + 0.5, sy1 - 0.5, 0.001), 0.09, 0.012, "steel", seg=12)
    R.cyl("drain2", (sx1 - 0.6, sy0 + 0.5, 0.001), 0.09, 0.012, "steel", seg=12)

    # ── 방 ──
    R.box("room_floor", (x0, y0, 0), (x1, y1, 0.02), "jangpan", uv=1.6)
    R.box("room_ceiling", (x0 - T / 2, y0 - T / 2, h), (x1 + T / 2, y1 + T / 2, h + 0.06), "ceil")
    R.box("roof_cap", (x0 - 0.35, y0 - 0.35, h + 0.06), (x1 + 0.35, y1 + 0.35, h + 0.18), "concrete", uv=2.0)
    # 벽은 두 겹: 안쪽은 벽지, 바깥쪽은 미장. 한 장으로 지으면 안팎이 같은 재질이 된다.
    def wall2(nm, a, b, gaps, inside_sign, axis):
        off = 0.04
        ai, bi = list(a), list(b)
        ao, bo = list(a), list(b)
        ai[axis] += inside_sign * off; bi[axis] += inside_sign * off
        ao[axis] -= inside_sign * off; bo[axis] -= inside_sign * off
        R.wall(nm + "_in", ai, bi, h, 0.075, gaps=gaps, mat="wallpaper", frame=None, glass=None, base="base", inside=inside_sign, uv=0.6)
        R.wall(nm + "_out", ao, bo, h, 0.075, gaps=gaps, mat="stucco", frame="sash", glass="glass", inside=inside_sign, sill="sill", door="sash_dark", uv=2.0)
    wall2("room_ws", (x0, y0), (x1, y0), [(-1.6, -0.2, 0.95, 1.95)], +1, 1)
    wall2("room_wn", (x0, y1), (x1, y1), [(0.9, 1.8, 0, DOOR)], -1, 1)
    wall2("room_ww", (x0, y0), (x0, y1), [], +1, 0)
    wall2("room_we", (x1, y0), (x1, y1), [(-0.6, 0.4, 1.2, 1.9)], -1, 0)
    # 열려 있는 문짝 (바깥으로 젖혀 있다)
    R.box("door_leaf", (1.8, 1.72, 0.01), (1.84, 2.58, DOOR), "door_room")
    R.box("door_knob", (1.775, 2.45, 0.95), (1.8, 2.5, 1.0), "alu")
    R.box("door_knob2", (1.84, 2.45, 0.95), (1.865, 2.5, 1.0), "alu")
    R.box("door_step", (0.85, 1.775, 0), (1.85, 2.1, 0.05), "concrete", uv=2.0)
    # 천장 등, 스위치, 콘센트
    R.cyl("ceil_lamp_body", (0.0, 0.0, h - 0.035), 0.24, 0.035, "lamp_body", seg=24)
    R.cyl("ceil_lamp", (0.0, 0.0, h - 0.085), 0.21, 0.05, "lamp", R.LAMPS, seg=24)
    R.box("switch", (0.74, y1 - 0.09, 1.15), (0.82, y1 - 0.078, 1.27), "white")
    R.box("outlet", (-1.9, y0 + 0.078, 0.28), (-1.82, y0 + 0.09, 0.36), "white")
    # 커튼 (동쪽 창, 반쯤 걷었다)
    for i in range(7):
        yy = -0.66 + i * 0.07
        R.box("curtain%d" % i, (x1 - 0.14 - (i % 2) * 0.025, yy, 1.12), (x1 - 0.125 - (i % 2) * 0.025, yy + 0.075, 1.98), "cloth_grey")
    R.box("curtain_rod", (x1 - 0.15, -0.75, 1.985), (x1 - 0.12, 0.55, 2.0), "alu")

    # ── 책상 ──
    R.box("desk_top", (-1.7, -1.62, 0.69), (-0.1, -1.0, 0.72), "wood", uv=0.9)
    for i, (lx, ly) in enumerate(((-1.67, -1.59), (-0.16, -1.59), (-1.67, -1.06), (-0.16, -1.06))):
        R.box("desk_leg%d" % i, (lx, ly, 0.02), (lx + 0.035, ly + 0.035, 0.69), "black")
    R.box("desk_drawer", (-0.56, -1.6, 0.36), (-0.14, -1.04, 0.69), "wood", uv=0.9)
    R.box("desk_drawer_gap", (-0.555, -1.035, 0.52), (-0.145, -1.033, 0.526), "black")
    # 노트북: 받침과 화면
    R.box("laptop_base", (-1.08, -1.42, 0.72), (-0.72, -1.17, 0.735), "steel")
    R.box("laptop_keys", (-1.05, -1.38, 0.735), (-0.75, -1.24, 0.737), "black")
    lid = R.box("laptop_lid", (-1.08, -1.445, 0.735), (-0.72, -1.43, 0.965), "steel")
    scr = R.quad("laptop_screen", (-0.9, -1.4285, 0.852), 0.33, 0.205, "screen", R.LAMPS, normal="+y")
    # 스탠드: 받침, 대, 갓, 전구
    R.cyl("stand_base", (-1.48, -1.42, 0.72), 0.075, 0.015, "black", seg=16)
    R.cyl("stand_pole", (-1.48, -1.42, 0.735), 0.008, 0.33, "alu", seg=8)
    R.cyl("stand_shade", (-1.44, -1.40, 1.04), 0.085, 0.09, "black", seg=16, r2=0.04)
    R.cyl("stand_bulb", (-1.44, -1.40, 1.03), 0.045, 0.012, "warm", R.LAMPS, seg=12)
    # 책상 위의 것들: 머그잔, 수첩, 신문 더미
    R.cyl("mug", (-0.42, -1.32, 0.72), 0.04, 0.09, "mug", seg=14)
    R.box("notebook", (-0.64, -1.22, 0.72), (-0.50, -1.02, 0.735), "black", rot=0.2)
    for i in range(4):
        R.box("papers%d" % i, (-1.34 + i * 0.006, -1.26 - i * 0.004, 0.72 + i * 0.004), (-1.13 + i * 0.006, -1.02 - i * 0.004, 0.724 + i * 0.004), "paper", rot=0.05 * (i - 1.5))
    R.box("pen0", (-0.62, -1.3, 0.735), (-0.5, -1.292, 0.743), "ink", rot=-0.4)

    # ── 벽의 증거판: 코르크판에 스크랩, 달력 ──
    wx = x0 + 0.0775
    R.box("wallboard_frame", (wx, -1.03, 0.82), (wx + 0.02, 1.03, 1.98), "wood_dark")
    R.box("wallboard", (wx + 0.02, -1.0, 0.85), (wx + 0.028, 1.0, 1.95), "cork", uv=0.5)
    px = wx + 0.031
    for i, (by, bz, w_, h_, mat) in enumerate(((-0.62, 1.52, 0.30, 0.42, "pic_news"), (-0.12, 1.55, 0.21, 0.28, "paper"), (0.42, 1.58, 0.26, 0.19, "paper"),
                                                 (-0.38, 1.10, 0.22, 0.16, "paper"), (0.28, 1.12, 0.2, 0.28, "paper"), (0.72, 1.18, 0.15, 0.1, "paper"))):
        q = R.quad("board_paper%d" % i, (px + i * 0.0006, by, bz), w_, h_, mat, normal="+x")
        q.rotation_euler.rotate_axis("Z", R.rng.uniform(-0.05, 0.05))
        R.cyl("board_pin%d" % i, (px, by, bz + h_ / 2 - 0.02), 0.008, 0.012, "red", R.DECAL, seg=8, axis="x")
    R.quad("calendar", (wx + 0.004, 1.38, 1.5), 0.34, 0.3, "pic_calendar", normal="+x")

    # ── 택배 상자 ──
    R.box("parcel_box", (0.05, 1.0, 0.02), (0.45, 1.3, 0.28), "cardboard", uv=0.5)
    R.box("parcel_tape", (0.05, 1.12, 0.2805), (0.45, 1.18, 0.2815), "tape")
    R.quad("parcel_label", (0.3, 1.22, 0.2822), 0.15, 0.095, "pic_label", rot=0.08)

    # ── 벽에 붙는 것들 ──
    R.box("hook_rail", (-0.9, y1 - 0.09, 1.62), (-0.1, y1 - 0.078, 1.66), "wood_dark")
    R.blob("coat", (-0.62, y1 - 0.15, 1.2), 0.2, "cloth_navy", squash=(0.95, 0.3, 2.2), bump=0.2)
    R.box("coat_hanger", (-0.64, y1 - 0.16, 1.6), (-0.6, y1 - 0.09, 1.66), "alu")
    R.blob("bag", (-0.28, y1 - 0.17, 1.38), 0.15, "cloth_grey", squash=(1.0, 0.5, 1.5))
    R.cyl("wall_clock", (wx + 0.001, -1.35, 2.05), 0.13, 0.03, "black", seg=20, axis="x")
    R.cyl("wall_clock_face", (wx + 0.032, -1.35, 2.05), 0.115, 0.002, "white", seg=20, axis="x")
    R.box("door_mat", (0.95, 1.2, 0.02), (1.7, 1.6, 0.03), "cloth_red", uv=0.3)

    # ── Tripo 가구: 의자, 침대, 선반 ──
    # Tripo 가구의 앞: 의자와 선반은 -Y를 본다. 침대는 머리가 +Y, 차는 앞이 -Y.
    furn(R, "office_chair.glb", "chair", "chair", (-1.21, -1.06, 0.02), (-0.59, -0.44, 0.97), yaw=0.35, mat="black")
    bed = furn(R, "single_bed.glb", "bed", "bed", (0.95, -1.62, 0.02), (2.12, 0.35, 0.80), yaw=PI, mat="cloth_blue")
    if R._tripo.get("bed") is None:
        R.blob("pillow", (1.55, -1.35, 0.68), 0.22, "cloth_white", R.FURN, squash=(1.5, 1.0, 0.4))
    furn(R, "bookshelf.glb", "shelf", "shelf", (-2.12, 1.02, 0.02), (-1.80, 1.62, 1.17), yaw=PI / 2, mat="wood")

    # ── 옥상: 계단실, 물탱크, 평상, 빨랫줄, 실외기, 화분 ──
    R.box("stair_house", (2.9, 2.0, 0), (4.9, 4.3, 2.3), "stucco", uv=2.0)
    R.box("stair_roof", (2.75, 1.85, 2.3), (5.05, 4.45, 2.4), "concrete", uv=2.0)
    R.box("stair_door", (2.86, 2.7, 0), (2.9, 3.6, DOOR), "door_green")
    R.box("stair_door_frame_t", (2.85, 2.66, DOOR), (2.9, 3.64, DOOR + 0.05), "sash_dark")
    R.box("stair_door_frame_l", (2.85, 2.66, 0), (2.9, 2.7, DOOR), "sash_dark")
    R.box("stair_door_frame_r", (2.85, 3.6, 0), (2.9, 3.64, DOOR), "sash_dark")
    R.box("stair_door_handle", (2.83, 3.45, 0.95), (2.86, 3.5, 1.1), "alu")
    R.cyl("stair_light", (2.84, 3.15, 2.16), 0.06, 0.07, "lamp", R.LAMPS, seg=10, axis="x")
    # 노란 물탱크: 받침대 위의 골진 통
    R.box("tank_stand_top", (3.0, 6.2, 0.52), (4.4, 7.6, 0.6), "steel")
    for i, (lx, ly) in enumerate(((3.02, 6.22), (4.3, 6.22), (3.02, 7.5), (4.3, 7.5))):
        R.box("tank_leg%d" % i, (lx, ly, 0), (lx + 0.08, ly + 0.08, 0.52), "steel")
    R.cyl("water_tank", (3.7, 6.9, 0.6), 0.64, 1.3, "tank", seg=28)
    R.cyl("water_tank_top", (3.7, 6.9, 1.9), 0.64, 0.18, "tank", seg=28, r2=0.3)
    R.cyl("water_tank_lid", (3.7, 6.9, 2.08), 0.3, 0.05, "tank", seg=20)
    R.cyl("tank_pipe", (3.0, 6.9, 0.2), 0.025, 0.8, "pipe_yellow", seg=8)
    R.cyl("tank_pipe2", (3.0, 6.9, 0.2), 0.025, 3.6, "pipe_yellow", seg=8, axis="y")
    # 평상
    R.box("pyeongsang", (-4.2, 4.5, 0.32), (-2.2, 6.3, 0.4), "plank", uv=1.2)
    for i, (lx, ly) in enumerate(((-4.12, 4.58), (-2.36, 4.58), (-4.12, 6.14), (-2.36, 6.14), (-3.24, 5.36))):
        R.box("pyeongsang_leg%d" % i, (lx, ly, 0), (lx + 0.08, ly + 0.08, 0.32), "wood_dark")
    R.box("pyeongsang_apron0", (-4.2, 4.5, 0.24), (-2.2, 4.54, 0.32), "wood_dark")
    R.box("pyeongsang_apron1", (-4.2, 6.26, 0.24), (-2.2, 6.3, 0.32), "wood_dark")
    R.blob("cushion", (-3.6, 5.9, 0.44), 0.2, "cloth_red", squash=(1.2, 1.2, 0.25))
    # 빨랫줄
    for i, lx in enumerate((-3.6, 0.6)):
        R.cyl("line_pole%d" % i, (lx, 6.94, 0), 0.025, 1.9, "steel", seg=8)
        R.box("line_foot%d" % i, (lx - 0.15, 6.79, 0), (lx + 0.15, 7.09, 0.08), "concrete")
    R.box("laundry_line", (-3.6, 6.937, 1.842), (0.6, 6.943, 1.848), "black")
    for i, (lx, w_, drop, mat) in enumerate(((-2.6, 0.7, 0.62, "cloth_white"), (-1.5, 0.5, 0.48, "cloth_blue"), (-0.6, 0.42, 0.7, "cloth_grey"))):
        R.box("laundry%d" % i, (lx, 6.925, 1.842 - drop), (lx + w_, 6.955, 1.846), mat)
        R.box("laundry_pin%d" % i, (lx + 0.05, 6.92, 1.83), (lx + 0.07, 6.96, 1.87), "red")
    # 실외기
    R.box("ac_unit", (-4.6, 0.4, 0.06), (-3.9, 0.75, 0.6), "white")
    R.cyl("ac_fan", (-4.25, 0.751, 0.33), 0.2, 0.004, "black", seg=20, axis="y")
    R.box("ac_feet", (-4.55, 0.42, 0), (-3.95, 0.73, 0.06), "black")
    # 스티로폼 상자 화분 (파)
    for i, (px_, py_) in enumerate(((-4.5, 2.2), (-4.5, 2.95), (-4.5, 3.7))):
        R.box("planter%d" % i, (px_ - 0.25, py_ - 0.3, 0), (px_ + 0.25, py_ + 0.3, 0.26), "styro", uv=0.5)
        R.box("planter_soil%d" % i, (px_ - 0.22, py_ - 0.27, 0.2), (px_ + 0.22, py_ + 0.27, 0.262), "soil")
        for k in range(7):
            gx, gy = px_ + R.rng.uniform(-0.16, 0.16), py_ + R.rng.uniform(-0.22, 0.22)
            R.cyl("leek%d_%d" % (i, k), (gx, gy, 0.26), 0.008, R.rng.uniform(0.18, 0.34), "leaf", seg=5, r2=0.003)
    # 가스 배관과 방 밖의 것들
    R.cyl("gas_pipe", (x0 - 0.1, y0 + 0.3, 0.05), 0.016, 1.5, "pipe_yellow", seg=8)
    R.cyl("gas_pipe2", (x0 - 0.1, y0 + 0.3, 1.55), 0.016, 2.6, "pipe_yellow", seg=8, axis="y")
    R.box("slippers", (1.0, 1.85, 0.05), (1.22, 2.08, 0.08), "rubber")
    R.cyl("bucket", (0.4, 2.1, 0), 0.14, 0.26, "plastic_grey", seg=14, r2=0.17)

    # ── 먼 동네와 하늘 ──
    far_town(R, (0, 3), 12, 56, -12.0, n=110, own=(sx0, sy0, sx1, sy1, -0.3))
    sky(R, (0.36, 0.55, 0.83), (0.84, 0.88, 0.92), (0.78, 0.80, 0.82), strength=1.0)
    return R.finish()


BUILDERS = {"rooftop": build_rooftop}


def build(site):
    out = BUILDERS[site]()
    exec(open(os.path.join(HERE, "bake_site.py"), encoding="utf-8").read(), globals())
    light(BAKE[site], show=True)
    return out


def bake_one(site, kind, size=2048, spp=256):
    exec(open(os.path.join(HERE, "bake_site.py"), encoding="utf-8").read(), globals())
    return bake(BAKE[site], kind, size, spp)


def export(site):
    exec(open(os.path.join(HERE, "export_glb.py"), encoding="utf-8").read(), globals())
    return export_collection(site + "_real", os.path.join(SITES_OUT, "prologue_%s.glb" % site), draco=True, apply=False, webp=82)


def save(site):
    path = os.path.join(BLEND, "prologue_%s.blend" % site)
    bpy.ops.wm.save_as_mainfile(filepath=path)
    return path


# ═══════════ 함께 쓰는 조각 ═══════════
def interior_materials(R):
    """학원과 학교 안: 천장 텍스, 타일, 장판, 사무 가구."""
    R.pbr("ceil_tile", R.tex_tiles("ceiltile", 2, 2, (0.86, 0.86, 0.83), (0.70, 0.70, 0.68), S=256, gap=2, jitter=0.012), 0.95)
    ft = R.tex_tiles("floortile", 2, 2, (0.70, 0.69, 0.66), (0.42, 0.42, 0.41), S=512, gap=3, jitter=0.03, rough=(0.18, 0.6))
    R.pbr("floor_tile", ft[0], ft[1])
    R.pbr("lino", *R.tex_speckle("lino", (0.52, 0.55, 0.56), 0.05, fine=0.7, coarse=50, stain=0.15, rough=(0.3, 0.55)))
    wd = R.tex_planks("woodfloor", 12, (0.60, 0.46, 0.30), cuts=2, var=0.06, rough=(0.3, 0.5))
    R.pbr("wood_floor", wd[0], wd[1])
    R.pbr("wall_white", R.tex_speckle("wallwhite", (0.88, 0.87, 0.83), 0.025, S=256, fine=0.8, stain=0.08), 0.9)
    R.pbr("wall_grey", R.tex_speckle("wallgrey", (0.78, 0.79, 0.78), 0.025, S=256, fine=0.8, stain=0.08), 0.9)
    R.pbr("laminate", R.tex_grain("laminate", (0.80, 0.72, 0.58), strength=0.035), 0.45)
    R.pbr("laminate_white", (0.88, 0.88, 0.86), 0.45)
    R.pbr("laminate_grey", (0.62, 0.64, 0.66), 0.5)
    R.pbr("navy", (0.08, 0.14, 0.30), 0.5)
    R.pbr("cork", R.tex_speckle("cork", (0.62, 0.45, 0.28), 0.22, S=256, fine=1.2, coarse=8), 0.95)
    R.pbr("board_green", R.tex_speckle("boardgreen", (0.12, 0.30, 0.22), 0.06, S=256), 0.9)
    R.pbr("wood", R.tex_grain("wood", (0.56, 0.41, 0.27)), 0.5)
    R.pbr("wood_dark", R.tex_grain("wooddark", (0.30, 0.21, 0.14)), 0.55)
    R.pbr("blind", (0.84, 0.83, 0.78), 0.6)
    R.pbr("leaf", (0.18, 0.38, 0.16), 0.7)
    R.pbr("pot", (0.55, 0.30, 0.20), 0.8)
    for k, c in (("book_red", (0.46, 0.17, 0.15)), ("book_blue", (0.17, 0.24, 0.40)), ("book_green", (0.20, 0.33, 0.24)), ("book_yellow", (0.70, 0.60, 0.30)), ("book_grey", (0.42, 0.43, 0.45))):
        R.pbr(k, c, 0.75)


def pic(R, name, file, center, w, h, normal, rough=0.8, c=None):
    """그림 한 장 (게시물, 간판). 재질은 파일마다 하나."""
    key = "pic_" + file.split(".")[0]
    if key not in R.M:
        R.pbr(key, R.picture(file), rough)
    return R.quad(name, center, w, h, key, c, normal=normal)


def shell(R, name, x0, y0, x1, y1, h, floor, ceil="ceil_tile", floor_uv=1.2, ceil_uv=1.2):
    R.box(name + "_floor", (x0, y0, -0.08), (x1, y1, 0), floor, uv=floor_uv)
    R.box(name + "_ceiling", (x0, y0, h), (x1, y1, h + 0.06), ceil, uv=ceil_uv)


def books(R, name, x0, x1, y0, y1, z, axis=0, hmin=0.2, hmax=0.3):
    """책이나 서류철이 꽂힌 한 줄. axis: 줄이 달리는 축."""
    u = x0 if axis == 0 else y0
    end = x1 if axis == 0 else y1
    i = 0
    while u < end - 0.02:
        w = R.rng.uniform(0.025, 0.06)
        hh = R.rng.uniform(hmin, hmax)
        m = R.rng.choice(("book_red", "book_blue", "book_green", "book_yellow", "book_grey", "paper"))
        if axis == 0:
            R.box("%s_%d" % (name, i), (u, y0, z), (min(u + w, end), y1, z + hh), m)
        else:
            R.box("%s_%d" % (name, i), (x0, u, z), (x1, min(u + w, end), z + hh), m)
        u += w + 0.003
        i += 1
        if R.rng.random() < 0.12:
            u += R.rng.uniform(0.03, 0.12)


def plant(R, name, x, y, h=1.1):
    R.cyl(name + "_pot", (x, y, 0), 0.16, 0.3, "pot", seg=12, r2=0.2)
    R.cyl(name + "_trunk", (x, y, 0.3), 0.018, h - 0.5, "wood_dark", seg=6)
    for k in range(11):
        a, r = k * 2.4, 0.07 + 0.012 * k
        R.blob("%s_leaf%d" % (name, k), (x + math.cos(a) * r, y + math.sin(a) * r, h - 0.42 + k * 0.045), 0.12 + 0.004 * (k % 4), "leaf", squash=(1, 1, 0.6), sub=2, bump=0.22)


def blinds(R, name, a, b, z0, z1, fixed, along, gap=0.06, tilt=0.03):
    """창 안쪽의 가로 블라인드. along: 창이 달리는 축(0: x, 1: y). fixed: 블라인드가 놓이는 자리(창에 수직인 축의 좌표)."""
    z = z0
    i = 0
    while z < z1:
        lo, hi = [0, 0, z], [0, 0, z + 0.004]
        lo[along], hi[along] = a, b
        lo[1 - along], hi[1 - along] = fixed - tilt, fixed + tilt
        R.box("%s_%d" % (name, i), lo, hi, "blind")
        z += gap
        i += 1


def shelf_unit(R, name, lo, hi, open_dir, n, mat, t=0.02, back=True, kick=0.06, c=None):
    """칸이 n개인 선반장(책장, 신발장, 진열장)을 판으로 짠다. open_dir: 열린 쪽 (-x, +x, -y, +y). 선반 윗면의 높이들을 돌려준다."""
    (x0, y0, z0), (x1, y1, z1) = lo, hi
    if open_dir[1] == "x":
        R.box(name + "_side0", (x0, y0, z0), (x1, y0 + t, z1), mat, c)
        R.box(name + "_side1", (x0, y1 - t, z0), (x1, y1, z1), mat, c)
        if back:
            bx = (x1 - t, x1) if open_dir[0] == "-" else (x0, x0 + t)
            R.box(name + "_back", (bx[0], y0 + t, z0), (bx[1], y1 - t, z1), mat, c)
    else:
        R.box(name + "_side0", (x0, y0, z0), (x0 + t, y1, z1), mat, c)
        R.box(name + "_side1", (x1 - t, y0, z0), (x1, y1, z1), mat, c)
        if back:
            by = (y1 - t, y1) if open_dir[0] == "-" else (y0, y0 + t)
            R.box(name + "_back", (x0 + t, by[0], z0), (x1 - t, by[1], z1), mat, c)
    R.box(name + "_top", (x0, y0, z1 - t), (x1, y1, z1), mat, c)
    out = []
    for k in range(n):
        z = z0 + kick + (z1 - z0 - kick - t) * k / n
        R.box("%s_shelf%d" % (name, k), (x0 + (t if open_dir[1] == "y" else 0), y0 + (t if open_dir[1] == "x" else 0), z), (x1 - (t if open_dir[1] == "y" else 0), y1 - (t if open_dir[1] == "x" else 0), z + t), mat, c)
        out.append(z + t)
    if kick:
        R.box(name + "_kick", (x0 + 0.02, y0 + 0.02, z0), (x1 - 0.02, y1 - 0.02, z0 + kick), mat, c)
    return out


def ceiling_lamps(R, name, pts, h, w=1.2, d=0.3):
    for i, (lx, ly) in enumerate(pts):
        R.lamp("lamp_%s%d" % (name, i), lx, ly, h, w, d)


def clock(R, name, x, y, z, normal):
    """벽시계. (x, y)는 벽면, normal은 시계가 보는 쪽 (+x, -x, +y, -y)."""
    ax, s = normal[1], (1 if normal[0] == "+" else -1)

    def base(off, th):
        d = off if s > 0 else -(off + th)
        return (x + d, y, z) if ax == "x" else (x, y + d, z)
    R.cyl(name, base(0, 0.03), 0.15, 0.03, "black", seg=20, axis=ax)
    R.cyl(name + "_face", base(0.03, 0.002), 0.135, 0.002, "white", seg=20, axis=ax)


# ═══════════ 서로재수학원 ═══════════
def build_academy():
    R = begin("academy", 23)
    far_materials(R)
    interior_materials(R)
    h = L.ACADEMY["h"]
    lx0, ly0, lx1, ly1 = L.ACADEMY["lobby"]
    sx0, sy0, sx1, sy1 = L.ACADEMY["study"]
    ox0, oy0, ox1, oy1 = L.ACADEMY["office"]
    R.pbr("lamp", (1, 1, 1), 0.4, emit=(1.0, 0.97, 0.92), emit_strength=9.0, bake_emit=9.0)
    R.pbr("carpet", R.tex_speckle("carpet", (0.30, 0.33, 0.38), 0.10, fine=0.7, coarse=6), 0.98)
    R.pbr("panel", (0.86, 0.86, 0.83), 0.55)
    R.pbr("panel_edge", (0.50, 0.52, 0.55), 0.5)
    R.pbr("elev", R.picture("pl_elevator.png"), 0.35, 0.6)
    WK = dict(base="base", frame="sash", glass="glass", sill="sill", door="wood_dark", uv=1.5)

    # ── 로비 ──
    shell(R, "lobby", lx0, ly0, lx1, ly1, h, "floor_tile")
    R.wall("lobby_ws", (lx0, ly0), (lx1, ly0), h, gaps=[(-0.7, 0.7, 0, DOOR)], mat="wall_white", inside=+1, **WK)
    R.wall("lobby_ww", (lx0, ly0), (lx0, ly1), h, mat="wall_white", inside=+1, **WK)
    R.wall("lobby_we", (lx1, ly0), (lx1, ly1), h, gaps=[(-3.2, -1.0, 1.0, 2.1)], mat="wall_white", inside=-1, **WK)
    R.wall("lobby_wn", (lx0, ly1), (lx1, ly1), h, gaps=[(-2.1, -1.2, 0, DOOR), (2.0, 2.9, 0, DOOR)], mat="wall_white", inside=-1, **WK)
    ceiling_lamps(R, "lobby", [(-1.8, -2.0), (1.8, -2.0)], h)
    blinds(R, "lobby_blind", -3.15, -1.05, 1.55, 2.08, lx1 - 0.11, 1)
    # 승강기 홀: 문밖으로 한 걸음, 승강기 문이 보인다
    R.box("hall_floor", (-1.6, ly0 - 1.6, -0.08), (1.6, ly0, 0), "floor_tile", uv=1.2)
    R.box("hall_ceiling", (-1.6, ly0 - 1.6, h), (1.6, ly0, h + 0.06), "ceil_tile", uv=1.2)
    R.box("hall_w", (-1.68, ly0 - 1.6, 0), (-1.6, ly0, h), "wall_grey", uv=1.5)
    R.box("hall_e", (1.6, ly0 - 1.6, 0), (1.68, ly0, h), "wall_grey", uv=1.5)
    R.box("hall_s", (-1.68, ly0 - 1.68, 0), (1.68, ly0 - 1.6, h), "wall_grey", uv=1.5)
    R.quad("elevator_door", (0.0, ly0 - 1.595, 1.1), 1.4, 2.2, "elev", R.STATIC, normal="+y")
    R.lamp("lamp_hall", 0.0, ly0 - 0.8, h, 0.6, 0.3)
    R.box("hall_button", (0.85, ly0 - 1.6, 1.05), (0.93, ly0 - 1.585, 1.25), "alu")
    # 유리문 (열어 젖혀 둔 것)
    R.box("glass_door_leaf", (-0.7, ly0 + 0.1, 0.02), (-0.66, ly0 + 0.78, DOOR), "glass", R.DYN)
    R.box("door_bar", (-0.72, ly0 + 0.4, 0.9), (-0.64, ly0 + 0.44, 1.2), "alu")
    # 접수대
    R.box("reception_body", (1.6, -2.3, 0), (3.6, -1.7, 1.02), "laminate_white", uv=1.0)
    R.box("reception_top", (1.56, -2.34, 1.02), (3.64, -1.66, 1.06), "laminate", uv=1.0)
    R.box("reception_band", (1.6, -2.305, 0.08), (3.6, -2.3, 0.3), "navy")
    pic(R, "reception_sign", "pl_sign_academy.png", (2.6, -2.307, 0.66), 1.5, 0.375, "-y")
    R.box("reception_monitor", (2.9, -1.95, 1.06), (3.3, -1.93, 1.36), "black")
    R.box("reception_monitor_foot", (3.05, -1.99, 1.06), (3.15, -1.9, 1.08), "black")
    books(R, "reception_files", 1.75, 2.3, -1.95, -1.76, 1.06, hmin=0.22, hmax=0.3)
    R.cyl("reception_bell", (2.55, -2.15, 1.06), 0.04, 0.035, "gold", seg=12, r2=0.01)
    # 성적 게시판
    wx = lx0 + 0.075
    R.box("rank_frame", (wx, -3.14, 0.96), (wx + 0.018, -0.86, 2.04), "alu")
    R.box("rank_board", (wx + 0.018, -3.1, 1.0), (wx + 0.026, -0.9, 2.0), "board_green", uv=0.6)
    pic(R, "rank_sheet0", "pl_rank9.png", (wx + 0.028, -2.62, 1.52), 0.56, 0.78, "+x")
    pic(R, "rank_sheet1", "pl_rank10.png", (wx + 0.028, -1.98, 1.52), 0.56, 0.78, "+x")
    pic(R, "rank_sheet2", "pl_ac_rules.png", (wx + 0.028, -1.34, 1.52), 0.5, 0.67, "+x")
    R.text("rank_title", "성적 게시판", 0.11, (wx + 0.003, -2.0, 2.2), "navy", normal="+x")
    # 현수막 (북쪽 벽, 들어오면 정면)
    pic(R, "banner", "pl_banner_academy.png", (0.2, ly1 - 0.079, 1.95), 2.2, 0.7, "-y", rough=0.6)
    for i, bx in enumerate((-0.86, 1.26)):
        R.cyl("banner_tie%d" % i, (bx, ly1 - 0.082, 2.3), 0.006, 0.26, "white", seg=5)
    pic(R, "sign_study", "pl_door_study.png", (-1.65, ly1 - 0.079, 2.22), 0.42, 0.14, "-y")
    pic(R, "sign_consult", "pl_door_consult.png", (2.45, ly1 - 0.079, 2.22), 0.42, 0.14, "-y")
    # 소파, 정수기, 화분, 우산꽂이
    furn(R, "sofa.glb", "sofa", "sofa", (-3.7, -3.85, 0), (-1.6, -3.15, 0.8), yaw=PI, mat="navy")
    furn(R, "water_dispenser.glb", "water", "water", (3.55, -0.47, 0), (3.85, -0.10, 1.25), yaw=0.0, mat="white")
    plant(R, "plant_lobby", -3.55, -0.45, 1.3)
    R.cyl("umbrella_stand", (1.15, -3.72, 0), 0.13, 0.5, "steel", seg=12)
    R.box("door_mat", (-0.65, -3.85, 0.0), (0.65, -3.1, 0.012), "carpet", uv=0.5)

    # ── 자습실 ──
    shell(R, "study", sx0, sy0, sx1, sy1, h, "carpet", floor_uv=0.8)
    R.wall("study_wn", (sx0, sy1), (sx1, sy1), h, gaps=[(-3.4, -0.4, 1.0, 2.1)], mat="wall_grey", inside=-1, **WK)
    R.wall("study_ww", (sx0, sy0), (sx0, sy1), h, mat="wall_grey", inside=+1, **WK)
    R.wall("study_we", (sx1, sy0), (sx1, sy1), h, mat="wall_grey", inside=-1, **WK)
    ceiling_lamps(R, "study", [(-1.5, 1.8), (-1.5, 4.0), (-1.5, 6.2), (-3.2, 3.0), (0.2, 3.0), (-3.2, 5.6), (0.2, 5.6)], h)
    blinds(R, "study_blind", -3.35, -0.45, 1.2, 2.08, sy1 - 0.11, 0)
    CHAIR = R.tripo("school_chair.glb", "chair", (0.43, 0.40, 0.76), -PI / 2, decimate=0.5)     # 앉는 사람이 -X를 본다
    for ci, cx in enumerate(L.STUDY_COLS):
        for ri, cy in enumerate(L.STUDY_ROWS):
            n = "%d%d" % (ci, ri)
            mine = (cx, cy) == L.DOHYEON_SEAT
            R.box("carrel%s_top" % n, (cx - 0.45, cy - 0.3, 0.72), (cx + 0.45, cy + 0.3, 0.75), "laminate", uv=0.8)
            R.box("carrel%s_back" % n, (cx - 0.46, cy + 0.3, 0), (cx + 0.46, cy + 0.33, 1.25), "panel")
            R.box("carrel%s_l" % n, (cx - 0.475, cy - 0.3, 0), (cx - 0.45, cy + 0.3, 1.25), "panel")
            R.box("carrel%s_r" % n, (cx + 0.45, cy - 0.3, 0), (cx + 0.475, cy + 0.3, 1.25), "panel")
            R.box("carrel%s_shelf" % n, (cx - 0.45, cy + 0.1, 1.05), (cx + 0.45, cy + 0.3, 1.07), "panel")
            R.box("carrel%s_cap" % n, (cx - 0.478, cy + 0.298, 1.25), (cx + 0.478, cy + 0.333, 1.262), "panel_edge")
            R.box("carrel%s_led" % n, (cx - 0.4, cy + 0.12, 1.035), (cx + 0.4, cy + 0.16, 1.05), "white")
            if CHAIR:
                R.place("stool%s" % n, CHAIR, (cx + R.rng.uniform(-0.03, 0.03), cy - 0.56 - R.rng.choice((0, 0, 0.05)), 0), -PI / 2 + R.rng.uniform(-0.15, 0.15))
            else:
                R.box("stool%s" % n, (cx - 0.2, cy - 0.75, 0), (cx + 0.2, cy - 0.4, 0.45), "black", R.FURN)
            if not mine and (cx, cy) != (-2.5, 5.1) and R.rng.random() < 0.7:      # 남들의 자리: 책 몇 권
                books(R, "carrel%s_books" % n, cx - 0.4, cx - 0.4 + R.rng.uniform(0.2, 0.6), cy + 0.12, cy + 0.28, 1.07, hmin=0.12, hmax=0.17)
                if R.rng.random() < 0.5:
                    R.box("carrel%s_note" % n, (cx - 0.1, cy - 0.15, 0.75), (cx + 0.12, cy + 0.14, 0.762), R.rng.choice(("book_blue", "book_grey", "paper")), rot=R.rng.uniform(-0.2, 0.2))
    dx, dy = L.DOHYEON_SEAT
    pic(R, "practice_sheet", "pl_sheet_dohyeon.png", (dx - 0.04, dy + 0.01, 0.752), 0.3, 0.42, "+z")
    R.box("dohyeon_pencil", (dx + 0.2, dy - 0.12, 0.75), (dx + 0.21, dy + 0.05, 0.758), "book_yellow", rot=0.3)
    pic(R, "name_card", "pl_namecard.png", (dx + 0.449, dy + 0.1, 1.15), 0.16, 0.06, "-x")
    R.box("gap_card", (dx + 0.4505, dy + 0.06, 0.725), (dx + 0.452, dy + 0.15, 0.78), "paper", R.DECAL)     # 책상과 칸막이 사이에 낀 명함
    pic(R, "other_sheet", "pl_sheet_other.png", (-2.5 - 0.04, 5.1 + 0.01, 0.752), 0.3, 0.42, "+z")
    R.box("other_eraser", (-2.3, 5.0, 0.75), (-2.26, 5.03, 0.762), "white")
    clock(R, "study_clock", sx0 + 0.076, 3.75, 2.15, "+x")
    pic(R, "study_rules", "pl_ac_rules.png", (sx1 - 0.079, 0.9, 1.6), 0.45, 0.6, "-x")

    # ── 상담실 ──
    shell(R, "office", ox0, oy0, ox1, oy1, h, "wood_floor", floor_uv=1.6)
    R.wall("office_wn", (ox0, oy1), (ox1, oy1), h, mat="wall_white", inside=-1, **WK)
    R.wall("office_we", (ox1, oy0), (ox1, oy1), h, gaps=[(1.0, 3.0, 1.0, 2.1)], mat="wall_white", inside=-1, **WK)
    R.box("office_ww_skin", (ox0 + 0.075, oy0 + 0.075, 0), (ox0 + 0.085, oy1 - 0.075, h), "wall_white", uv=1.5)   # 자습실과 맞닿은 벽의 상담실 쪽
    ceiling_lamps(R, "office", [(2.5, 2.0)], h)
    blinds(R, "office_blind", 1.05, 2.95, 1.6, 2.08, ox1 - 0.11, 1)
    R.box("consult_top", (1.9, 1.9, 0.7), (3.1, 2.6, 0.74), "laminate", uv=0.9)
    for i, (tx, ty) in enumerate(((1.95, 1.95), (3.0, 1.95), (1.95, 2.5), (3.0, 2.5))):
        R.box("consult_leg%d" % i, (tx, ty, 0), (tx + 0.05, ty + 0.05, 0.7), "steel")
    seat(R, "consult_chair", 2.5, 1.3, "+y")
    seat(R, "consult_chair2", 2.55, 3.55, "-y")
    R.box("grade_file", (2.2, 2.1, 0.74), (2.5, 2.5, 0.765), "book_blue")
    R.box("grade_sheet", (2.56, 2.14, 0.74), (2.78, 2.44, 0.743), "paper", rot=0.12)
    R.cyl("consult_cup", (2.95, 2.4, 0.74), 0.035, 0.08, "white", seg=12)
    R.box("tissue", (1.98, 2.28, 0.74), (2.1, 2.5, 0.82), "book_grey")
    # 책장: 서류철
    for k, z in enumerate(shelf_unit(R, "bookcase", (3.55, 3.0, 0), (3.92, 3.92, 1.9), "-x", 5, "laminate")):
        books(R, "bookcase_row%d" % k, 3.6, 3.86, 3.04, 3.88, z, axis=1, hmin=0.24, hmax=0.31)
    plant(R, "plant_office", 1.35, 3.6, 1.0)
    for i, (fy, fz) in enumerate(((0.9, 1.7), (1.5, 1.72))):    # 벽의 상장 액자 (글은 읽히지 않는다)
        R.box("frame%d" % i, (ox0 + 0.085, fy - 0.2, fz - 0.15), (ox0 + 0.099, fy + 0.2, fz + 0.15), "wood_dark")
        R.box("frame_paper%d" % i, (ox0 + 0.099, fy - 0.17, fz - 0.12), (ox0 + 0.101, fy + 0.17, fz + 0.12), "paper")

    # ── 창밖: 학원가의 건물들과 하늘 ──
    far_town(R, (0, 2), 13, 56, -13.0, n=90, tall=0.3, hmin=8, hmax=16, own=(-4.3, -5.8, 4.3, 7.8, -0.2))
    sky(R, (0.52, 0.62, 0.76), (0.84, 0.86, 0.88), (0.76, 0.78, 0.80), strength=1.0)

    def cull(c, n):
        return ((c.x < lx0 - 0.06 and n.x < -0.5) or (c.x > lx1 + 0.06 and n.x > 0.5) or (c.y > sy1 + 0.06 and n.y > 0.5) or (c.y < ly0 - 1.62 and n.y < -0.5)
                or (c.z > h + 0.05 and n.z > 0.5) or (c.y > oy1 + 0.06 and c.x > sx1 + 0.08 and n.y > 0.5) or (c.x > sx1 + 0.06 and c.y > oy1 + 0.08 and n.x > 0.5)
                or (c.y < ly0 - 0.08 and abs(c.x) > 1.65 and abs(n.x) > 0.5))
    return R.finish(cull=cull)


BUILDERS["academy"] = build_academy


# ═══════════ 바깥에서 함께 쓰는 조각 ═══════════
def outdoor_materials(R):
    a = R.tex_speckle("asphalt", (0.27, 0.27, 0.28), 0.10, fine=1.0, coarse=60, stain=0.35, rough=(0.75, 0.95))
    R.pbr("asphalt", a[0], a[1])
    pv = R.tex_tiles("paver", 8, 16, (0.60, 0.50, 0.45), (0.40, 0.38, 0.36), S=512, gap=3, jitter=0.07, brick=True, rough=(0.7, 0.92))
    R.pbr("paver", pv[0], pv[1])
    R.pbr("concrete", R.tex_speckle("concrete", (0.60, 0.59, 0.56), 0.09, stain=0.4), 0.9)
    R.pbr("curb", R.tex_speckle("curb", (0.66, 0.65, 0.62), 0.07, S=256, stain=0.3), 0.9)
    R.pbr("block_wall", R.tex_tiles("blockwall", 4, 8, (0.62, 0.61, 0.58), (0.48, 0.47, 0.45), S=256, gap=2, jitter=0.05, brick=True), 0.92)
    R.pbr("fence_wall", R.tex_speckle("fencewall", (0.74, 0.72, 0.66), 0.07, stain=0.45), 0.92)
    R.pbr("line_white", (0.82, 0.82, 0.78), 0.8)
    R.pbr("soil", (0.15, 0.11, 0.08), 1.0)
    R.pbr("bark", R.tex_speckle("bark", (0.26, 0.21, 0.17), 0.18, S=256, fine=1.4, coarse=6), 0.95)
    R.pbr("leaf", (0.10, 0.20, 0.09), 0.8)
    R.pbr("leaf_gold", (0.72, 0.54, 0.10), 0.8)
    R.pbr("hedge", R.tex_speckle("hedge", (0.115, 0.235, 0.085), 0.42, S=256, fine=1.8, coarse=5), 0.86)
    R.pbr("win_dark", (0.09, 0.12, 0.15), 0.08)
    R.pbr("steel_green", (0.16, 0.30, 0.24), 0.5, 0.3)
    R.pbr("plank", *R.tex_planks("plank", 10, (0.46, 0.34, 0.24), cuts=1, var=0.10, rough=(0.7, 0.92)))
    R.pbr("cardboard", R.tex_speckle("cardboard", (0.63, 0.49, 0.33), 0.06, S=256), 0.85)
    R.pbr("cone", (0.85, 0.30, 0.06), 0.6)
    R.pbr("globe", (1, 1, 1), 0.4, emit=(1.0, 0.93, 0.80), emit_strength=5.0, bake_emit=40.0)
    R.pbr("downlight", (1, 1, 1), 0.4, emit=(1.0, 0.95, 0.86), emit_strength=6.0, bake_emit=30.0)


def tree(R, name, x, y, h=5.6, crown="leaf_gold", pit=True, leaves=40, spread=2.6):
    """나무 한 그루와 그 밑의 흙, 떨어진 잎. Tripo 나무가 없으면 줄기와 잎 덩어리로 짓는다."""
    if pit:
        R.box(name + "_soil", (x - 0.55, y - 0.55, 0), (x + 0.55, y + 0.55, 0.03), "soil")
        for i, (a, b) in enumerate((((x - 0.63, y - 0.63), (x + 0.63, y - 0.55)), ((x - 0.63, y + 0.55), (x + 0.63, y + 0.63)),
                                    ((x - 0.63, y - 0.55), (x - 0.55, y + 0.55)), ((x + 0.55, y - 0.55), (x + 0.63, y + 0.55)))):
            R.box("%s_curb%d" % (name, i), (a[0], a[1], 0), (b[0], b[1], 0.09), "curb")
    for k in range(leaves):
        a, d = R.rng.uniform(0, 2 * PI), abs(R.rng.gauss(0, spread * 0.5))
        R.quad("%s_fallen%d" % (name, k), (x + math.cos(a) * d, y + math.sin(a) * d, 0.016), 0.075, 0.055, "leaf_gold", rot=R.rng.uniform(0, PI))
    me = R.tripo("tree.glb", "tree", None, 0.0, height=1.0)   # 가는 줄기에 잎이 성긴 어린 은행나무. 잎이 높이의 0.3부터 달린다
    if me:
        k = h * R.rng.uniform(0.97, 1.05)
        return R.place(name, me, (x, y, -0.012 * k), R.rng.uniform(0, 2 * PI), scale=k)   # 밑동의 낙엽 더미는 흙에 묻는다
    base = max(h * 0.58, 3.15)                              # 잎은 이 높이부터 (낮은 지붕에 닿지 않게)
    objs = [R.cyl(name + "_trunk", (x, y, 0), 0.14, base + 0.2, "bark", R.FURN, seg=8, r2=0.08)]
    for k in range(3):
        a = k * 2.1 + R.rng.uniform(0, 1)
        objs.append(R.cyl("%s_bough%d" % (name, k), (x + math.cos(a) * 0.12, y + math.sin(a) * 0.12, base - 0.4), 0.06, (h - base) * 0.6, "bark", R.FURN, seg=6, r2=0.03))
    for k in range(22):
        a, lift = k * 2.4, (k % 7) / 6
        r = (0.35 + 0.95 * math.sin(PI * (0.15 + 0.8 * lift))) * R.rng.uniform(0.75, 1.0)
        objs.append(R.blob("%s_crown%d" % (name, k), (x + math.cos(a) * r, y + math.sin(a) * r, base + lift * (h - base)), R.rng.uniform(0.36, 0.52), crown, R.FURN,
                           squash=(1, 1, 0.85), sub=2, bump=0.3))
    return R.join(objs, name)


def hedge(R, name, x0, x1, y0, y1, h=0.75):
    """화단: 흙과 경계석, 그 위에 반듯하게 깎은 회양목 줄."""
    import bmesh
    from mathutils import Vector, noise
    R.box(name + "_soil", (x0, y0, 0), (x1, y1, 0.08), "soil")
    R.box(name + "_curb", (x0 - 0.08, y0 - 0.08, 0), (x1 + 0.08, y0, 0.12), "curb")
    m, step = 0.05, 0.13
    lo, hi = Vector((x0 + m, y0 + m, 0.05)), Vector((x1 - m, y1 - m, h))
    d, ctr = hi - lo, (lo + hi) / 2
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=d, verts=bm.verts)
    bmesh.ops.translate(bm, vec=ctr, verts=bm.verts)
    for ax in range(3):                                    # 한 뼘마다 썰어 둔다 (울퉁불퉁하게 밀 점들)
        no = [0, 0, 0]
        no[ax] = 1
        for k in range(1, int(d[ax] / step)):
            co = [0, 0, 0]
            co[ax] = lo[ax] + d[ax] * k / int(d[ax] / step)
            bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=co, plane_no=no)
    seed = Vector((R.rng.uniform(0, 50), R.rng.uniform(0, 50), R.rng.uniform(0, 50)))
    for v in bm.verts:
        t = (v.co.z - lo.z) / d.z
        if t < 0.02:
            continue
        q = v.co * 2.3 + seed
        big = Vector((noise.noise(q), noise.noise(q + Vector((7.1, 3.3, 1.7))), noise.noise(q + Vector((1.9, 9.2, 4.4))))) * 0.07
        q2 = v.co * 11.0 + seed
        fine = Vector((noise.noise(q2), noise.noise(q2 + Vector((5.5, 2.1, 8.8))), noise.noise(q2 + Vector((3.4, 6.6, 0.9))))) * 0.022
        ey = abs(v.co.y - ctr.y) / (d.y / 2)                # 윗모서리는 둥글게 깎였다
        ex = abs(v.co.x - ctr.x) / (d.x / 2)
        if t > 0.8:
            v.co.z -= 0.09 * max(ey, ex) ** 3 * (t - 0.8) / 0.2
        if t > 0.5:
            v.co.y -= (v.co.y - ctr.y) * 0.10 * (t - 0.5) / 0.5
        v.co += (big + fine) * min(1.0, t * 4)
    uvl = bm.loops.layers.uv.new("uv")
    for f in bm.faces:
        f.smooth = True
        a = max(range(3), key=lambda i: abs(f.normal[i]))
        for l in f.loops:
            c = l.vert.co
            l[uvl].uv = ((c.y, c.z), (c.x, c.z), (c.x, c.y))[a]
    me = bpy.data.meshes.new(R.px + name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(R.mat("hedge"))
    return R._obj(name, me, R.FURN)


def car(R, name, lo, hi, color, tint=None, front="+x"):
    """주차된 승용차. 긴 쪽이 앞뒤, front가 앞머리가 보는 쪽. Tripo 차가 없으면 상자로 짓는다."""
    along = 0 if (hi[0] - lo[0]) >= (hi[1] - lo[1]) else 1
    ctr = ((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, 0)
    Lc, Wc = (hi[along] - lo[along]), (hi[1 - along] - lo[1 - along])
    me = R.tripo("sedan.glb", "car", (4.0, 1.78, 1.3), PI / 2, decimate=0.5)      # 돌려서 앞이 +X를 보게 한다
    if me:
        if tint:
            me = R.tint(me, "car_" + name, tint)
        return R.place(name, me, ctr, {"+x": 0.0, "-x": PI, "+y": PI / 2, "-y": -PI / 2}[front])

    def B(nm, u0, u1, w0, w1, z0, z1, mat):
        a, b = [0, 0, z0], [0, 0, z1]
        a[along], b[along] = lo[along] + u0, lo[along] + u1
        a[1 - along], b[1 - along] = lo[1 - along] + w0, lo[1 - along] + w1
        return R.box("%s_%s" % (name, nm), a, b, mat, R.FURN)
    objs = [B("body", 0, Lc, 0, Wc, 0.28, 0.82, color), B("cabin", Lc * 0.24, Lc * 0.80, 0.09, Wc - 0.09, 0.82, 1.34, "win_dark"),
            B("roof", Lc * 0.27, Lc * 0.77, 0.07, Wc - 0.07, 1.34, 1.40, color), B("bumper0", -0.03, 0.05, 0.05, Wc - 0.05, 0.28, 0.5, "black"),
            B("bumper1", Lc - 0.05, Lc + 0.03, 0.05, Wc - 0.05, 0.28, 0.5, "black")]
    for i, (u, w) in enumerate(((Lc * 0.18, 0.0), (Lc * 0.82, 0.0), (Lc * 0.18, Wc - 0.2), (Lc * 0.82, Wc - 0.2))):
        base = [0, 0, 0.31]
        base[along], base[1 - along] = lo[along] + u, lo[1 - along] + w
        objs.append(R.cyl("%s_wheel%d" % (name, i), base, 0.31, 0.2, "rubber", R.FURN, seg=14, axis="y" if along == 0 else "x"))
    return R.join(objs, name)


def no_bottom(o):
    """위층 덩어리의 밑면을 떼어 낸다. 1층 천장과 같은 높이라 겹쳐서 깜빡인다."""
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.normal.z < -0.9], context="FACES")
    bm.to_mesh(o.data)
    bm.free()


def far_slab(R, name, x0, y0, x1, y1, hh, z0=-0.05):
    """단지의 다른 동: 몸통과 층마다의 베란다 띠 (긴 두 면에)."""
    out = [R.box(name, (x0, y0, z0), (x1, y1, hh), "apt_paint", R.DYN, uv=3.0)]
    long_x = (x1 - x0) >= (y1 - y0)
    f = 0
    while 3.5 + f * 2.8 + 1.4 < hh - 1.0:
        z = 3.5 + f * 2.8
        for s, side in enumerate((0, 1)):
            if long_x:
                yy = y0 if side == 0 else y1
                out.append(R.box("%s_v%d_%d" % (name, f, s), (x0 + 0.6, yy - 0.06, z), (x1 - 0.6, yy + 0.06, z + 1.35), "win_dark", R.DYN))
                out.append(R.box("%s_r%d_%d" % (name, f, s), (x0 + 0.4, yy - 0.1, z - 0.5), (x1 - 0.4, yy + 0.1, z), "apt_band", R.DYN, uv=1.5))
            else:
                xx = x0 if side == 0 else x1
                out.append(R.box("%s_v%d_%d" % (name, f, s), (xx - 0.06, y0 + 0.6, z), (xx + 0.06, y1 - 0.6, z + 1.35), "win_dark", R.DYN))
                out.append(R.box("%s_r%d_%d" % (name, f, s), (xx - 0.1, y0 + 0.4, z - 0.5), (xx + 0.1, y1 - 0.4, z), "apt_band", R.DYN, uv=1.5))
        f += 1
    return out


def fake_window(R, name, a, b, z0, z1, y, normal_sign=-1):
    """들여다보이지 않는 창 (남의 집). 벽 바깥에 붙인다. y: 벽면, normal_sign: 창이 보는 쪽(-1이면 -y)."""
    s = normal_sign
    R.box(name + "_pane", (a, y, z0), (b, y + s * 0.02, z1), "win_dark")
    for nm, (u0, u1, w0, w1) in (("l", (a - 0.05, a, z0 - 0.05, z1 + 0.05)), ("r", (b, b + 0.05, z0 - 0.05, z1 + 0.05)), ("t", (a, b, z1, z1 + 0.05)), ("b", (a, b, z0 - 0.05, z0)),
                                 ("m", ((a + b) / 2 - 0.025, (a + b) / 2 + 0.025, z0, z1))):
        R.box("%s_%s" % (name, nm), (u0, y, w0), (u1, y + s * 0.045, w1), "sash")
    R.box(name + "_sill", (a - 0.1, y, z0 - 0.09), (b + 0.1, y + s * 0.09, z0 - 0.05), "sill")


# ═══════════ 가람아파트 107동 ═══════════
def build_apt():
    R = begin("apt", 31)
    far_materials(R)
    interior_materials(R)
    outdoor_materials(R)
    yx0, yy0, yx1, yy1 = L.APT["yard"]
    lx0, ly0, lx1, ly1 = L.APT["lobby"]
    bx0, by0, bx1, by1 = L.APT["booth"]
    rx0, ry0, rx1, ry1 = L.APT["bins"]
    h = L.APT["h"]
    R.pbr("apt_paint", R.tex_speckle("aptpaint", (0.80, 0.77, 0.68), 0.05, stain=0.4), 0.92)
    R.pbr("apt_band", R.tex_speckle("aptband", (0.58, 0.40, 0.30), 0.06, S=256, stain=0.3), 0.9)
    R.pbr("apt_far", R.tex_tiles("aptfar", 4, 4, (0.24, 0.28, 0.32), (0.76, 0.74, 0.68), S=256, gap=22, jitter=0.10, bevel=False), 0.7)
    st = R.tex_tiles("stonefloor", 2, 2, (0.62, 0.60, 0.56), (0.36, 0.35, 0.34), S=512, gap=2, jitter=0.04, rough=(0.16, 0.5))
    R.pbr("stone_floor", st[0], st[1])
    R.pbr("dado_tile", R.tex_tiles("dadotile", 4, 4, (0.80, 0.77, 0.70), (0.58, 0.56, 0.52), S=256, gap=2, jitter=0.03), 0.35)
    R.pbr("booth_wall", R.tex_speckle("boothwall", (0.84, 0.83, 0.78), 0.04, S=256, stain=0.3), 0.9)
    R.pbr("ceil", R.tex_speckle("ceil", (0.90, 0.90, 0.87), 0.03, S=256), 0.95)
    R.pbr("door_steel", (0.30, 0.36, 0.40), 0.45, 0.3)
    R.pbr("roof_sheet", R.tex_stripes("roofsheet", (0.36, 0.44, 0.50), (0.26, 0.33, 0.39), n=24, soft=0.5), 0.5, 0.3)
    R.pbr("elev", R.picture("pl_elevator.png"), 0.35, 0.6)
    R.pbr("lamp", (1, 1, 1), 0.4, emit=(1.0, 0.96, 0.88), emit_strength=9.0, bake_emit=14.0)
    R.pbr("case_blue", (0.10, 0.18, 0.42), 0.45)
    R.pbr("bag_white", (0.84, 0.84, 0.82), 0.5)
    R.pbr("bag_blue", (0.25, 0.42, 0.62), 0.5)
    R.pbr("cloth_grey", (0.46, 0.46, 0.48), 0.95)
    R.pbr("monitor", (0, 0, 0), 0.3, emit=(0.10, 0.13, 0.15), emit_strength=1.0, bake_emit=0.0)
    for k, c in (("bin_blue", (0.12, 0.28, 0.55)), ("bin_yellow", (0.80, 0.62, 0.10)), ("bin_green", (0.14, 0.40, 0.22)), ("bin_grey", (0.42, 0.44, 0.46)), ("car_silver", (0.62, 0.64, 0.66)), ("car_navy", (0.10, 0.14, 0.24))):
        R.pbr(k, c, 0.4, 0.2 if k.startswith("car") else 0.0)

    # ── 마당: 아스팔트, 가운데의 보도, 주차선 ──
    R.box("yard", (yx0, yy0, -0.3), (yx1, yy1, 0), "asphalt", uv=4.0)
    R.box("walk", (-1.2, yy0, 0), (1.2, yy1, 0.012), "paver", uv=1.6)
    for i, wx in enumerate((-1.28, 1.2)):
        R.box("walk_curb%d" % i, (wx, yy0 + 0.1, 0), (wx + 0.08, 1.5, 0.03), "curb", uv=1.0)
    R.box("line_w", (-6.12, -6.6, 0), (-6.0, -1.6, 0.004), "line_white")
    for i, ly in enumerate((-6.6, -1.72)):
        R.box("line_w_t%d" % i, (-8.7, ly, 0), (-6.0, ly + 0.12, 0.004), "line_white")
    R.box("line_e", (2.2, 0.0, 0), (7.0, 0.12, 0.004), "line_white")
    for i, lx in enumerate((2.2, 6.88)):
        R.box("line_e_t%d" % i, (lx, 0.0, 0), (lx + 0.12, 2.2, 0.004), "line_white")
    R.cyl("manhole", (3.6, -3.2, 0), 0.33, 0.006, "steel", seg=20)
    R.box("drain", (-1.9, -6.7, 0), (-1.4, -6.4, 0.006), "sash_dark")

    # ── 단지 담과 정문 ──
    FK = dict(mat="fence_wall", frame=None, glass=None, uv=2.0)
    R.wall("fence_s", (yx0, yy0), (yx1, yy0), 1.4, 0.2, gaps=[(-1.5, 1.5, 0, 9)], **FK)
    R.wall("fence_w", (yx0, yy0), (yx0, yy1), 1.4, 0.2, **FK)
    R.wall("fence_e", (yx1, yy0), (yx1, yy1), 1.4, 0.2, **FK)
    R.box("fence_cap_s0", (yx0 - 0.14, yy0 - 0.14, 1.4), (-1.75, yy0 + 0.14, 1.46), "concrete", uv=2.0)
    R.box("fence_cap_s1", (1.75, yy0 - 0.14, 1.4), (yx1 + 0.14, yy0 + 0.14, 1.46), "concrete", uv=2.0)
    R.box("fence_cap_w", (yx0 - 0.14, yy0 + 0.14, 1.4), (yx0 + 0.14, yy1 - 0.1, 1.46), "concrete", uv=2.0)
    R.box("fence_cap_e", (yx1 - 0.14, yy0 + 0.14, 1.4), (yx1 + 0.14, yy1 - 0.1, 1.46), "concrete", uv=2.0)
    for i, px in enumerate((-1.75, 1.5)):
        R.box("gate_post%d" % i, (px, yy0 - 0.15, 0), (px + 0.25, yy0 + 0.15, 1.9), "apt_band", uv=1.0)
        R.box("gate_post_cap%d" % i, (px - 0.04, yy0 - 0.19, 1.9), (px + 0.29, yy0 + 0.19, 1.97), "concrete", uv=2.0)
        R.cyl("gate_lamp%d" % i, (px + 0.125, yy0, 1.97), 0.1, 0.16, "globe", R.LAMPS, seg=12)
    R.box("gate_rail", (1.75, yy0 - 0.03, 0.04), (4.6, yy0 + 0.03, 0.08), "steel")      # 밀어 둔 철문
    for k in range(15):
        gx = 1.8 + k * 0.19
        R.box("gate_bar%d" % k, (gx, yy0 + 0.13, 0.1), (gx + 0.025, yy0 + 0.155, 1.3), "steel_green")
    R.box("gate_bar_top", (1.78, yy0 + 0.125, 1.3), (4.5, yy0 + 0.16, 1.34), "steel_green")
    R.box("gate_bar_bot", (1.78, yy0 + 0.125, 0.08), (4.5, yy0 + 0.16, 0.12), "steel_green")

    # ── 107동: 1층 정면, 현관, 그 위의 층들 ──
    R.wall("facade", (yx0, yy1), (yx1, yy1), h, 0.2, gaps=[(-0.8, 0.8, 0, 2.2)], mat="apt_paint", frame="sash", glass=None, door="sash_dark", uv=2.5)
    R.box("facade_plinth", (yx0, yy1 - 0.13, 0), (-0.84, yy1 - 0.1, 0.45), "apt_band", uv=1.5)
    R.box("facade_plinth2", (0.84, yy1 - 0.13, 0), (yx1, yy1 - 0.1, 0.45), "apt_band", uv=1.5)
    for i, (a, b) in enumerate(((-8.4, -6.0), (-5.2, -3.0), (3.0, 5.4), (6.0, 8.4))):
        fake_window(R, "flat_win%d" % i, a, b, 1.0, 2.2, yy1 - 0.1)
    R.box("canopy", (-1.6, yy1 - 1.5, 2.3), (1.6, yy1 - 0.1, 2.42), "concrete", uv=2.0)
    R.box("canopy_edge", (-1.64, yy1 - 1.54, 2.26), (1.64, yy1 - 1.5, 2.46), "apt_band", uv=1.5)
    R.box("canopy_light", (-0.25, yy1 - 0.95, 2.27), (0.25, yy1 - 0.75, 2.3), "downlight", R.LAMPS)
    R.box("door_glass_l", (-0.8, yy1 + 0.1, 0.02), (-0.76, yy1 + 0.85, 2.15), "glass", R.DYN)        # 열어 둔 유리문 두 짝
    R.box("door_glass_r", (0.76, yy1 + 0.1, 0.02), (0.8, yy1 + 0.85, 2.15), "glass", R.DYN)
    R.box("door_handle_l", (-0.75, yy1 + 0.7, 0.9), (-0.73, yy1 + 0.74, 1.25), "alu")
    R.box("door_handle_r", (0.73, yy1 + 0.7, 0.9), (0.75, yy1 + 0.74, 1.25), "alu")
    R.box("step", (-1.1, yy1 - 0.45, 0), (1.1, yy1 - 0.1, 0.02), "concrete", uv=2.0)
    tower = [R.box("tower", (yx0, yy1 - 0.1, h), (yx1, yy1 + 6.0, 38.0), "apt_paint", R.DYN, uv=3.0),
             R.box("tower_base_band", (yx0, yy1 - 0.13, h), (yx1, yy1 - 0.1, h + 0.5), "apt_band", R.DYN, uv=1.5)]
    for f in range(12):
        z0 = h + 0.95 + f * 2.8
        tower.append(R.box("veranda%d" % f, (yx0 + 0.4, yy1 - 0.14, z0), (yx1 - 0.4, yy1 - 0.1, z0 + 1.35), "win_dark", R.DYN))
        tower.append(R.box("veranda_rail%d" % f, (yx0 + 0.3, yy1 - 0.17, z0 - 0.5), (yx1 - 0.3, yy1 - 0.1, z0), "apt_band", R.DYN, uv=1.5))
        for k in range(13):
            mx = yx0 + 0.4 + (yx1 - yx0 - 0.8) * k / 12
            tower.append(R.box("veranda%d_m%d" % (f, k), (mx - 0.03, yy1 - 0.165, z0), (mx + 0.03, yy1 - 0.1, z0 + 1.35), "sash", R.DYN))
    no_bottom(tower[0])
    tw = R.join(tower, "tower")
    tw.visible_shadow = False
    pic(R, "dong_sign", "pl_dong.png", (0.0, yy1 - 0.135, 2.8), 0.9, 0.45, "-y", rough=0.5)

    # ── 로비: 우편함, 게시판, 승강기, 103호 ──
    shell(R, "lobby", lx0, ly0, lx1, ly1, h, "stone_floor", ceil="ceil", floor_uv=1.2, ceil_uv=2.0)
    LK = dict(mat="wall_white", dado=(1.2, "dado_tile"), base="base", uv=1.2)
    R.wall("lobby_ww", (lx0, ly0), (lx0, ly1), h, inside=+1, **LK)
    R.wall("lobby_we", (lx1, ly0), (lx1, ly1), h, inside=-1, **LK)
    R.wall("lobby_wn", (lx0, ly1), (lx1, ly1), h, inside=-1, **LK)
    R.box("lobby_ws_l", (lx0, ly0 + 0.1, 0), (-0.84, ly0 + 0.11, h), "wall_white", uv=1.2)       # 정면 벽의 안쪽
    R.box("lobby_ws_r", (0.84, ly0 + 0.1, 0), (lx1, ly0 + 0.11, h), "wall_white", uv=1.2)
    R.box("lobby_ws_t", (-0.84, ly0 + 0.1, 2.24), (0.84, ly0 + 0.11, h), "wall_white", uv=1.2)
    for i, ly in enumerate((4.6, 6.8)):
        R.lamp("lamp_lobby%d" % i, 0.0, ly, h, 0.6, 0.6)
    mx = lx0 + 0.075
    R.box("mailbox_body", (mx, 4.1, 0.9), (mx + 0.22, 6.4, 1.6), "steel")
    pic(R, "mailbox_front", "pl_mailbox.png", (mx + 0.222, 5.25, 1.25), 2.3, 0.7, "+x", rough=0.45)
    R.box("mailbox_flyer0", (mx + 0.2, 4.62, 1.24), (mx + 0.27, 4.76, 1.243), "paper", R.DECAL)      # 103호 칸에서 삐져나온 전단
    R.box("mailbox_flyer1", (mx + 0.2, 4.64, 1.25), (mx + 0.25, 4.74, 1.253), "book_yellow", R.DECAL)
    for i in range(3):
        R.box("floor_flyer%d" % i, (mx + 0.35 + i * 0.07, 4.3 + i * 0.21, 0.0), (mx + 0.56 + i * 0.07, 4.6 + i * 0.21, 0.003), "paper", R.DECAL, rot=0.4 * i - 0.3)
    ex = lx1 - 0.075
    R.box("lobby_board_frame", (ex - 0.018, 4.46, 1.06), (ex, 5.94, 1.94), "alu")
    R.box("lobby_board", (ex - 0.026, 4.5, 1.1), (ex - 0.018, 5.9, 1.9), "board_green", uv=0.6)
    pic(R, "lobby_notice", "pl_apt_office.png", (ex - 0.028, 4.85, 1.5), 0.45, 0.6, "-x")
    pic(R, "lobby_recycle", "pl_apt_recycle.png", (ex - 0.028, 5.37, 1.5), 0.45, 0.6, "-x")
    pic(R, "lobby_flyer", "pl_flyer.png", (ex - 0.028, 5.74, 1.42), 0.21, 0.297, "-x")
    ny = ly1 - 0.075
    R.quad("elevator_door", (-1.0, ny - 0.004, 1.05), 1.4, 2.1, "elev", R.STATIC, normal="-y")
    for nm, (a, b, z0, z1) in (("l", (-1.76, -1.7, 0, 2.16)), ("r", (-0.3, -0.24, 0, 2.16)), ("t", (-1.76, -0.24, 2.1, 2.16))):
        R.box("elevator_frame_" + nm, (a, ny - 0.03, z0), (b, ny, z1), "alu")
    R.box("elevator_button", (-0.14, ny - 0.012, 1.05), (-0.06, ny, 1.25), "alu")
    R.box("elevator_ind", (-1.15, ny - 0.012, 2.22), (-0.85, ny, 2.32), "black")
    R.box("door103", (0.85, ny - 0.035, 0), (1.75, ny, DOOR), "door_steel")
    for nm, (a, b, z0, z1) in (("l", (0.8, 0.85, 0, DOOR + 0.05)), ("r", (1.75, 1.8, 0, DOOR + 0.05)), ("t", (0.8, 1.8, DOOR, DOOR + 0.05))):
        R.box("door103_frame_" + nm, (a, ny - 0.045, z0), (b, ny, z1), "sash_dark")
    R.box("door103_handle", (0.93, ny - 0.07, 0.95), (1.07, ny - 0.035, 0.99), "alu")
    R.cyl("door103_eye", (1.3, ny - 0.04, 1.5), 0.012, 0.006, "black", seg=8, axis="y")
    pic(R, "door103_plate", "pl_door103.png", (1.975, ny - 0.004, 1.56), 0.25, 0.125, "-y")
    R.box("door103_bell", (1.93, ny - 0.02, 1.25), (2.02, ny, 1.37), "white")
    R.box("door103_milk", (0.88, ny - 0.16, 0), (1.12, ny - 0.045, 0.22), "bag_blue")              # 문 앞의 우유 주머니
    R.cyl("extinguisher", (-2.25, 7.7, 0), 0.07, 0.42, "red", seg=10)
    R.cyl("extinguisher_top", (-2.25, 7.7, 0.42), 0.025, 0.1, "black", seg=8)
    R.box("lobby_mat", (-0.7, ly0 + 0.3, 0), (0.7, ly0 + 1.2, 0.012), "rubber", uv=0.5)
    R.box("parcel0", (2.0, 3.3, 0), (2.38, 3.7, 0.3), "cardboard", uv=0.5)
    R.box("parcel1", (2.05, 3.34, 0.3), (2.33, 3.62, 0.48), "cardboard", uv=0.5, rot=0.2)

    # ── 경비실 ──
    R.box("booth_floor", (bx0, by0, 0), (bx1, by1, 0.02), "lino", uv=1.2)
    BK = dict(mat="booth_wall", frame="sash", glass="glass", sill="sill", base="base", door="sash_dark", uv=1.5)
    R.wall("booth_ws", (bx0, by0), (bx1, by0), 2.4, gaps=[(-6.0, -4.4, 1.0, 1.9)], inside=+1, **BK)
    R.wall("booth_wn", (bx0, by1), (bx1, by1), 2.4, inside=-1, **BK)
    R.wall("booth_ww", (bx0, by0), (bx0, by1), 2.4, inside=+1, **BK)
    R.wall("booth_we", (bx1, by0), (bx1, by1), 2.4, gaps=[(0.0, 0.9, 0, DOOR)], inside=-1, **BK)
    R.box("booth_ceiling", (bx0, by0, 2.4), (bx1, by1, 2.46), "ceil")
    R.box("booth_roof", (bx0 - 0.3, by0 - 0.3, 2.46), (bx1 + 0.3, by1 + 0.3, 2.6), "concrete", uv=2.0)
    R.box("booth_band", (bx0 - 0.08, by0 - 0.08, 0), (bx1 + 0.08, by0 - 0.075, 0.4), "apt_band", uv=1.5)
    R.box("booth_door_leaf", (bx1 + 0.02, 0.9, 0.02), (bx1 + 0.88, 0.94, DOOR), "door_steel")
    R.box("booth_door_win", (bx1 + 0.2, 0.895, 1.1), (bx1 + 0.7, 0.945, 1.8), "win_dark")
    pic(R, "booth_sign", "pl_door_guard.png", (bx1 + 0.078, -0.45, 1.75), 0.45, 0.15, "+x")
    R.lamp("lamp_booth", -5.15, 0.3, 2.4, 0.6, 0.2)
    R.box("booth_desk_top", (-6.0, -0.9, 0.7), (-4.4, -0.4, 0.74), "laminate", uv=0.9)
    R.box("booth_desk_side0", (-6.0, -0.9, 0), (-5.97, -0.4, 0.7), "laminate_grey")
    R.box("booth_desk_side1", (-4.43, -0.9, 0), (-4.4, -0.4, 0.7), "laminate_grey")
    R.box("booth_desk_drawer", (-4.85, -0.88, 0.3), (-4.43, -0.42, 0.7), "laminate_grey")
    R.box("cctv", (-5.75, -0.88, 0.74), (-5.25, -0.84, 1.08), "black")
    R.quad("cctv_screen", (-5.5, -0.838, 0.92), 0.44, 0.27, "monitor", R.LAMPS, normal="+y")
    R.box("cctv_foot", (-5.58, -0.9, 0.74), (-5.42, -0.78, 0.76), "black")
    R.box("logbook", (-5.1, -0.75, 0.74), (-4.8, -0.52, 0.765), "book_grey", rot=0.1)
    R.box("log_pen", (-4.95, -0.5, 0.765), (-4.82, -0.49, 0.773), "ink", rot=0.6)
    R.cyl("kettle", (-4.58, -0.62, 0.74), 0.07, 0.17, "steel", seg=12, r2=0.055)
    R.cyl("paper_cup", (-4.72, -0.5, 0.74), 0.03, 0.07, "paper", seg=10, r2=0.036)
    seat(R, "booth_chair", -5.3, -0.05, "-y", z=0.02)
    wx = bx0 + 0.075
    for i, z in enumerate((1.05, 1.5)):                     # 분실물 선반
        R.box("lost_shelf%d" % i, (wx, -0.2, z), (wx + 0.28, 0.9, z + 0.03), "wood", uv=0.9)
        for k, sy in enumerate((-0.12, 0.82)):
            R.box("lost_bracket%d%d" % (i, k), (wx, sy - 0.012, z - 0.16), (wx + 0.2, sy + 0.012, z), "steel")
    R.text("lost_label", "분실물", 0.075, (wx + 0.003, 0.35, 1.78), "ink", normal="+x")
    R.box("pencil_case", (wx + 0.04, 0.2, 1.08), (wx + 0.24, 0.42, 1.13), "case_blue", R.FURN)       # 도현이 버린 새 필통
    R.box("pencil_case_zip", (wx + 0.045, 0.3, 1.13), (wx + 0.235, 0.308, 1.132), "alu", R.FURN)
    R.cyl("lost_umbrella", (wx + 0.14, 0.56, 1.105), 0.022, 0.3, "black", seg=8, axis="y")
    R.blob("lost_glove", (wx + 0.14, -0.02, 1.1), 0.07, "cloth_grey", squash=(1.0, 1.4, 0.35), sub=1)
    R.box("lost_box", (wx + 0.03, -0.1, 1.53), (wx + 0.26, 0.25, 1.7), "cardboard", uv=0.5)
    R.cyl("lost_thermos", (wx + 0.14, 0.5, 1.53), 0.035, 0.22, "steel", seg=10)
    R.blob("lost_cap", (wx + 0.14, 0.74, 1.57), 0.09, "navy", squash=(1.0, 1.0, 0.5), sub=1)
    pic(R, "booth_calendar", "pl_calendar.png", (-4.6, by1 - 0.079, 1.55), 0.34, 0.3, "-y")
    R.box("key_box", (-5.6, by1 - 0.14, 1.3), (-5.2, by1 - 0.075, 1.75), "laminate_grey")
    R.box("heater", (-6.2, 1.0, 0.02), (-5.8, 1.3, 0.5), "white")
    R.cyl("broom", (-3.52, -0.22, 0), 0.014, 1.3, "wood", seg=6)
    R.box("broom_head", (-3.62, -0.26, 0), (-3.42, -0.18, 0.12), "book_green")

    # ── 분리수거장 ──
    for nm, a, b in (("s", (rx0, ry0), (rx1, ry0)), ("n", (rx0, ry1), (rx1, ry1)), ("e", (rx1, ry0), (rx1, ry1))):
        R.wall("bins_" + nm, a, b, 1.2, 0.15, mat="block_wall", frame=None, glass=None, uv=1.6)
    for i, (px, py) in enumerate(((rx0 + 0.02, ry0 + 0.02), (rx1 - 0.1, ry0 + 0.02), (rx0 + 0.02, ry1 - 0.1), (rx1 - 0.1, ry1 - 0.1))):
        R.box("bins_post%d" % i, (px, py, 0), (px + 0.08, py + 0.08, 2.3), "steel_green")
    R.box("bins_roof", (rx0 - 0.2, ry0 - 0.2, 2.3), (rx1 + 0.2, ry1 + 0.2, 2.36), "roof_sheet", uv=1.2)
    R.box("bins_light", (6.3, -4.1, 2.27), (6.9, -3.95, 2.3), "downlight", R.LAMPS)
    BIN = R.tripo("recycle_bin.glb", "bin", (0.56, 0.64, 0.95), -PI / 2, decimate=0.5)      # 돌려서 앞이 -X를 보게 한다
    fx = 7.52 if BIN else 7.4                                                                # 수거함 앞면
    labels = ("종이", "플라스틱", "캔 · 병", "비닐")
    for i, (mk, tint) in enumerate((("bin_blue", (0.45, 0.65, 1.0)), ("bin_yellow", (1.0, 0.85, 0.35)), ("bin_green", (0.5, 0.9, 0.6)), ("bin_grey", (0.8, 0.8, 0.8)))):
        cy = ry0 + 0.55 + i * 0.68
        if BIN:
            R.place("bin%d" % i, R.tint(BIN, "bin%d" % i, tint), (7.8, cy, 0), 0.0)
        else:
            body = R.box("bin%d" % i, (7.4, cy - 0.3, 0), (8.2, cy + 0.3, 0.82), mk, R.FURN)
            lid = R.box("bin%d_lid" % i, (7.37, cy - 0.32, 0.82), (8.22, cy + 0.32, 0.9), mk, R.FURN)
            slot = R.box("bin%d_slot" % i, (7.365, cy - 0.2, 0.84), (7.37, cy + 0.2, 0.88), "black", R.FURN)
            R.join([body, lid, slot], "bin%d" % i)
        R.box("bin_plate%d" % i, (fx - 0.008, cy - 0.2, 0.52), (fx, cy + 0.2, 0.68), "white", R.DECAL)
        R.text("bin_label%d" % i, labels[i], 0.085, (fx - 0.011, cy, 0.60), "ink", normal="-x")
    pic(R, "bin_note", "pl_bin_note.png", (fx - 0.01, ry0 + 0.55 + 0.68, 0.40), 0.26, 0.1625, "-x")
    R.box("bins_board", (5.05, ry1 - 0.09, 1.2), (5.75, ry1 - 0.075, 2.06), "alu")
    pic(R, "bins_notice", "pl_apt_recycle.png", (5.4, ry1 - 0.092, 1.63), 0.6, 0.8, "-y")
    for i, (bx, by, r, mk) in enumerate(((5.2, -5.0, 0.3, "bag_white"), (5.65, -4.75, 0.27, "bag_blue"), (5.4, -4.6, 0.24, "bag_white"), (5.75, -5.1, 0.22, "bag_white"))):
        R.blob("bag%d" % i, (bx, by, r * 0.8), r, mk, squash=(1, 1, 0.85), bump=0.2)
    for i in range(4):
        R.box("flat_box%d" % i, (6.3, -5.35, i * 0.02), (7.1, -4.75, i * 0.02 + 0.018), "cardboard", uv=0.6, rot=0.06 * (i - 1.5))

    # ── 마당의 것들: 차, 벤치, 가로등, 나무, 화단 ──
    car(R, "car0", (-8.3, -6.2, 0), (-6.3, -2.2, 1.4), "car_silver", front="-y")
    car(R, "car1", (2.6, 0.2, 0), (6.6, 2.1, 1.4), "car_navy", tint=(0.30, 0.33, 0.42), front="+x")
    for i in range(3):
        R.box("bench_slat%d" % i, (-2.6, -3.58 + i * 0.15, 0.42), (-1.5, -3.46 + i * 0.15, 0.45), "plank", uv=1.0)
    for i in range(2):
        R.box("bench_back%d" % i, (-2.6, -3.13, 0.6 + i * 0.16), (-1.5, -3.1, 0.72 + i * 0.16), "plank", uv=1.0)
    for i, bx in enumerate((-2.5, -1.66)):
        R.box("bench_leg%d" % i, (bx, -3.56, 0), (bx + 0.06, -3.14, 0.42), "sash_dark")
        R.box("bench_post%d" % i, (bx, -3.16, 0.42), (bx + 0.06, -3.1, 0.9), "sash_dark")
    R.cyl("lamp_post", (-2.9, -2.6, 0), 0.05, 3.1, "steel_green", seg=10, r2=0.035)
    R.cyl("lamp_post_base", (-2.9, -2.6, 0), 0.1, 0.25, "steel_green", seg=10)
    R.cyl("lamp_post_globe", (-2.9, -2.6, 3.1), 0.16, 0.24, "globe", R.LAMPS, seg=14, r2=0.1)
    R.cyl("lamp_post_cap", (-2.9, -2.6, 3.34), 0.19, 0.05, "steel_green", seg=14, r2=0.04)
    for i, (tx, ty) in enumerate(((-7.6, 1.8), (7.8, 1.6), (-3.2, -5.6), (3.2, -6.2))):
        tree(R, "tree%d" % i, tx, ty, h=(8.4 - 0.9 * (i % 2)) if R.tripo("tree.glb", "tree", None, 0.0, height=1.0) else 5.3 + 0.6 * (i % 2))   # 경비실 지붕(2.5m) 위로 잎이 달리게
    hedge(R, "bed_w", -8.8, -2.0, 2.3, 2.9)
    hedge(R, "bed_e", 2.0, 8.8, 2.3, 2.9)
    for i, (cx, cy) in enumerate(((-6.0, -6.55), (-6.0, -1.5))):
        R.cyl("cone%d" % i, (cx, cy, 0.03), 0.13, 0.5, "cone", seg=12, r2=0.03)
        R.box("cone_base%d" % i, (cx - 0.17, cy - 0.17, 0), (cx + 0.17, cy + 0.17, 0.03), "cone")

    # ── 단지의 다른 동들, 먼 동네, 하늘 ──
    slabs = []
    for i, (a, b, c, d, hh) in enumerate(((22, -28, 33, 12, 42), (-35, -24, -24, 16, 39), (-28, -42, 6, -32, 42), (14, -40, 36, -31, 36))):
        slabs += far_slab(R, "far_apt%d" % i, a, b, c, d, hh)
    R.join(slabs, "far_apts").visible_shadow = False
    far_town(R, (0, -2), 38, 54, -0.05, n=26, tall=0.5, hmin=10, hmax=20, own=(yx0, yy0, yx1, yy1 + 6.0, -0.04))
    sky(R, (0.50, 0.60, 0.74), (0.82, 0.85, 0.88), (0.74, 0.77, 0.80), strength=1.0)

    def cull(c, n):
        return ((c.y > yy1 + 0.09 and n.y > 0.5 and (abs(c.x) > lx1 + 0.06 or c.y > ly1 + 0.06))
                or (c.y > yy1 + 0.2 and abs(c.x) > lx1 + 0.06 and abs(n.x) > 0.5)
                or (c.z > h + 0.05 and n.z > 0.5 and c.y > yy1 + 0.1)
                or (c.y < yy0 - 0.09 and n.y < -0.5 and abs(c.x) > 1.8) or (c.x < yx0 - 0.09 and n.x < -0.5) or (c.x > yx1 + 0.09 and n.x > 0.5))
    return R.finish(cull=cull)


BUILDERS["apt"] = build_apt


# ═══════════ 사무실에서 함께 쓰는 조각 ═══════════
def desk_mesh(R):
    """Tripo 책상에서 윗판 위에 얹힌 것(모니터, 자판, 화분, 서류함)을 걷어 낸 몸통. 1 x 1 x 1 크기로 맞춰 둔다. 윗판과 책상 위의 것은 따로 짓는다."""
    if "odesk_cut" in R._tripo:
        return R._tripo["odesk_cut"]
    me = R.tripo("office_desk.glb", "odesk", None, 0.0)       # 앞(서랍, 앉는 쪽)이 -Y
    if me is not None:
        import bmesh
        me = me.copy()
        me.name = "tripo_odesk_cut"
        bm = bmesh.new()
        bm.from_mesh(me)
        cut = max(v.co.z for v in bm.verts) * 0.627 + 0.004    # 윗판의 높이 (받은 모델에서 잰 값)
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z > cut], context="VERTS")
        lo = [min(v.co[i] for v in bm.verts) for i in range(3)]
        hi = [max(v.co[i] for v in bm.verts) for i in range(3)]
        for v in bm.verts:
            v.co.x = (v.co.x - (lo[0] + hi[0]) / 2) / (hi[0] - lo[0])
            v.co.y = (v.co.y - (lo[1] + hi[1]) / 2) / (hi[1] - lo[1])
            v.co.z = (v.co.z - lo[2]) / (hi[2] - lo[2])
        bm.to_mesh(me)
        bm.free()
    R._tripo["odesk_cut"] = me
    return me


def desk(R, name, lo, hi, front="-y", screen=None, clutter=True):
    """사무 책상. front: 앉는 사람이 있는 쪽. Tripo 책상이 없으면 판으로 짠다. screen: 모니터를 둘지(None이면 무작위)."""
    (x0, y0, z0), (x1, y1, z1) = lo, hi
    yaw = {"-y": 0.0, "+y": PI, "-x": -PI / 2, "+x": PI / 2}[front]
    me = desk_mesh(R)
    R.box(name + "_top", (x0, y0, z1 - 0.03), (x1, y1, z1), "laminate", uv=0.9)
    if me:
        wide, deep = ((x1 - x0), (y1 - y0)) if front[1] == "y" else ((y1 - y0), (x1 - x0))
        R.place(name, me, ((x0 + x1) / 2, (y0 + y1) / 2, z0), yaw, scale=(wide - 0.04, deep - 0.04, z1 - z0 - 0.028))
    else:
        if front[1] == "y":
            R.box(name + "_s0", (x0 + 0.02, y0 + 0.03, z0), (x0 + 0.045, y1 - 0.03, z1 - 0.03), "laminate_grey")
            R.box(name + "_s1", (x1 - 0.045, y0 + 0.03, z0), (x1 - 0.02, y1 - 0.03, z1 - 0.03), "laminate_grey")
            by = y1 - 0.06 if front == "-y" else y0 + 0.04
            R.box(name + "_back", (x0 + 0.045, by, z0 + 0.25), (x1 - 0.045, by + 0.02, z1 - 0.03), "laminate_grey")
            R.box(name + "_drawer", (x1 - 0.45, y0 + 0.05, z0 + 0.12), (x1 - 0.045, y1 - 0.08, z1 - 0.03), "laminate_grey")
        else:
            R.box(name + "_s0", (x0 + 0.03, y0 + 0.02, z0), (x1 - 0.03, y0 + 0.045, z1 - 0.03), "laminate_grey")
            R.box(name + "_s1", (x0 + 0.03, y1 - 0.045, z0), (x1 - 0.03, y1 - 0.02, z1 - 0.03), "laminate_grey")
            bx = x1 - 0.06 if front == "-x" else x0 + 0.04
            R.box(name + "_back", (bx, y0 + 0.045, z0 + 0.25), (bx + 0.02, y1 - 0.045, z1 - 0.03), "laminate_grey")
    if not clutter:
        return
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    if screen or (screen is None and R.rng.random() < 0.6):
        if front[1] == "y":
            s = 1 if front == "-y" else -1                 # 모니터는 책상 뒤쪽에, 화면이 앉는 쪽을 본다
            my = cy + s * (y1 - y0) * 0.28
            R.box(name + "_mon", (cx - 0.26, my - 0.015, z1 + 0.1), (cx + 0.26, my + 0.015, z1 + 0.43), "black")
            R.box(name + "_mon_foot", (cx - 0.1, my - 0.07, z1), (cx + 0.1, my + 0.07, z1 + 0.012), "black")
            R.box(name + "_mon_neck", (cx - 0.02, my - 0.01, z1), (cx + 0.02, my + 0.02, z1 + 0.12), "black")
            R.box(name + "_keys", (cx - 0.2, cy - s * 0.12, z1), (cx + 0.2, cy - s * 0.02, z1 + 0.015), "laminate_grey")
        else:
            s = 1 if front == "-x" else -1
            mx = cx + s * (x1 - x0) * 0.28
            R.box(name + "_mon", (mx - 0.015, cy - 0.26, z1 + 0.1), (mx + 0.015, cy + 0.26, z1 + 0.43), "black")
            R.box(name + "_mon_foot", (mx - 0.07, cy - 0.1, z1), (mx + 0.07, cy + 0.1, z1 + 0.012), "black")
            R.box(name + "_mon_neck", (mx - 0.01, cy - 0.02, z1), (mx + 0.02, cy + 0.02, z1 + 0.12), "black")
    if R.rng.random() < 0.8:                                # 책꽂이 한 줄과 서류
        if front[1] == "y":
            yb = (y1 - 0.2, y1 - 0.04) if front == "-y" else (y0 + 0.04, y0 + 0.2)
            books(R, name + "_books", x0 + 0.06, x0 + R.rng.uniform(0.3, 0.5), yb[0], yb[1], z1, hmin=0.2, hmax=0.3)
        else:
            xb = (x1 - 0.2, x1 - 0.04) if front == "-x" else (x0 + 0.04, x0 + 0.2)
            books(R, name + "_books", xb[0], xb[1], y0 + 0.06, y0 + R.rng.uniform(0.3, 0.5), z1, axis=1, hmin=0.2, hmax=0.3)
    if R.rng.random() < 0.7:
        R.box(name + "_paper", (x1 - 0.42, cy - 0.16, z1), (x1 - 0.2, cy + 0.14, z1 + 0.004 + 0.01 * R.rng.random()), "paper", rot=R.rng.uniform(-0.3, 0.3))
    if R.rng.random() < 0.5:
        R.cyl(name + "_cup", (x0 + 0.5 + R.rng.uniform(0, 0.2), cy + R.rng.uniform(-0.1, 0.1), z1), 0.035, 0.09, R.rng.choice(("white", "navy", "book_green")), seg=10)


def seat(R, name, x, y, face, z=0.0):
    """의자 하나. face: 앉은 사람이 보는 쪽 (+x, -x, +y, -y)."""
    me = R.tripo("office_chair.glb", "ochair", (0.6, 0.6, 0.95), -PI / 2, decimate=0.5)        # 돌려서 앉은 사람이 -X를 보게 한다
    if me is None:
        me = R.tripo("school_chair.glb", "schair", (0.43, 0.40, 0.76), -PI / 2, decimate=0.5)
    if me is None:
        return R.box(name, (x - 0.2, y - 0.2, z), (x + 0.2, y + 0.2, z + 0.45), "black", R.FURN)
    yaw = {"-x": 0.0, "+x": PI, "-y": PI / 2, "+y": -PI / 2}[face]
    return R.place(name, me, (x, y, z), yaw + R.rng.uniform(-0.2, 0.2))


def cabinet(R, name, lo, hi, front):
    """철제 캐비닛. Tripo 것이 없으면 상자에 문짝의 금을 긋는다."""
    (x0, y0, z0), (x1, y1, z1) = lo, hi
    along_y = front[1] == "x"
    W = (y1 - y0) if along_y else (x1 - x0)
    D = (x1 - x0) if along_y else (y1 - y0)
    me = R.tripo("locker_cabinet.glb", "locker", (0.5, 0.95, 1.9), -PI / 2)      # 돌려서 문이 -X를 보게 한다
    if me is not None:
        k = max(1, round(W / 0.95))
        yaw = {"-x": 0.0, "+x": PI, "-y": PI / 2, "+y": -PI / 2}[front]
        for i in range(k):
            u = (i + 0.5) * W / k
            loc = ((x0 + x1) / 2, y0 + u, z0) if along_y else (x0 + u, (y0 + y1) / 2, z0)
            R.place("%s%d" % (name, i), me, loc, yaw, scale=(D / 0.5, W / k / 0.95, (z1 - z0) / 1.9))
        return
    R.box(name, lo, hi, "laminate_grey", uv=1.0)
    n = max(1, round(((y1 - y0) if front[1] == "x" else (x1 - x0)) / 0.45))
    s = 1 if front[0] == "+" else -1
    for k in range(1, n):
        if front[1] == "x":
            fx = x1 if s > 0 else x0
            u = y0 + (y1 - y0) * k / n
            R.box("%s_gap%d" % (name, k), (fx, u - 0.004, z0 + 0.05), (fx + s * 0.002, u + 0.004, z1 - 0.03), "black")
            R.box("%s_h%d" % (name, k), (fx, u - 0.06, z0 + 1.0), (fx + s * 0.02, u - 0.04, z0 + 1.12), "alu")
        else:
            fy = y1 if s > 0 else y0
            u = x0 + (x1 - x0) * k / n
            R.box("%s_gap%d" % (name, k), (u - 0.004, fy, z0 + 0.05), (u + 0.004, fy + s * 0.002, z1 - 0.03), "black")
            R.box("%s_h%d" % (name, k), (u - 0.06, fy, z0 + 1.0), (u - 0.04, fy + s * 0.02, z0 + 1.12), "alu")


def wall2(R, name, a, b, h, gaps, inside, axis, inner, outer, dado=None, t=0.25, door="sash_dark", uv_in=1.5, uv_out=2.5):
    """안팎의 재질이 다른 바깥벽: 얇은 벽 두 장. inside: 안이 어느 쪽인가(+1/-1), axis: 벽에 수직인 축(0: x, 1: y)."""
    q = t / 4
    ai, bi, ao, bo = list(a), list(b), list(a), list(b)
    ai[axis] += inside * q; bi[axis] += inside * q
    ao[axis] -= inside * q; bo[axis] -= inside * q
    R.wall(name + "_in", ai, bi, h, t / 2, gaps=gaps, mat=inner, dado=dado, frame=None, glass=None, base="base", inside=inside, uv=uv_in)
    R.wall(name + "_out", ao, bo, h, t / 2, gaps=gaps, mat=outer, frame="sash", glass="glass", inside=inside, sill="sill", door=door, uv=uv_out)


# ═══════════ 목원고 본관 1층 ═══════════
def build_gate():
    R = begin("gate", 43)
    far_materials(R)
    interior_materials(R)
    outdoor_materials(R)
    h = L.GATE["h"]
    yx0, yy0, yx1, yy1 = L.GATE["yard"]
    hx0, hy0, hx1, hy1 = L.GATE["hall"]
    ax0, ay0, ax1, ay1 = L.GATE["admin"]
    tx0, ty0, tx1, ty1 = L.GATE["staff"]
    rx0, ry0, rx1, ry1 = L.GATE["stair"]
    R.pbr("sand", *R.tex_speckle("sand", (0.60, 0.54, 0.44), 0.07, fine=1.0, coarse=70, stain=0.25, rough=(0.85, 0.98)))
    R.pbr("school_wall", R.tex_speckle("schoolwall", (0.83, 0.79, 0.69), 0.05, stain=0.4), 0.92)
    R.pbr("brick", R.tex_tiles("brick", 6, 18, (0.50, 0.25, 0.19), (0.66, 0.63, 0.58), S=512, gap=3, jitter=0.10, brick=True), 0.9)
    R.pbr("dado_green", R.tex_speckle("dadogreen", (0.60, 0.70, 0.62), 0.03, S=256, stain=0.15), 0.55)
    tz = R.tex_speckle("terrazzo", (0.58, 0.60, 0.56), 0.16, fine=1.6, coarse=3, stain=0.1, rough=(0.2, 0.45))
    R.pbr("terrazzo", tz[0], tz[1])
    R.pbr("ceil", R.tex_speckle("ceil", (0.90, 0.90, 0.87), 0.03, S=256), 0.95)
    R.pbr("lamp", (1, 1, 1), 0.4, emit=(1.0, 0.97, 0.92), emit_strength=9.0, bake_emit=12.0)
    R.pbr("door_wood", R.tex_grain("doorwood", (0.52, 0.38, 0.26)), 0.5)
    R.pbr("hose_red", (0.60, 0.08, 0.06), 0.45)
    R.pbr("slipper_blue", (0.20, 0.32, 0.55), 0.7)
    R.pbr("monitor", (0, 0, 0), 0.3, emit=(0.10, 0.13, 0.15), emit_strength=1.0, bake_emit=0.0)
    R.pbr("car_white", (0.80, 0.80, 0.78), 0.4, 0.2)

    # ── 교문 앞마당 ──
    R.box("yard", (yx0, yy0, -0.3), (yx1, yy1 - 0.125, 0), "sand", uv=4.0)
    R.box("path", (-2.0, yy0, 0), (2.0, yy1 - 0.125, 0.012), "paver", uv=1.6)
    R.box("porch_step", (-1.9, hy0 - 1.75, 0.012), (1.9, hy0 - 0.125, 0.05), "concrete", uv=2.0)
    FK = dict(mat="brick", frame=None, glass=None, uv=1.5)
    R.wall("fence_s", (yx0, yy0), (yx1, yy0), 1.6, 0.25, gaps=[(-2.0, 2.0, 0, 9)], **FK)
    R.wall("fence_w", (yx0, yy0), (yx0, yy1 - 0.2), 1.6, 0.25, **FK)
    R.wall("fence_e", (yx1, yy0), (yx1, yy1 - 0.2), 1.6, 0.25, **FK)
    R.box("fence_cap_s0", (yx0 - 0.16, yy0 - 0.16, 1.6), (-2.4, yy0 + 0.16, 1.67), "concrete", uv=2.0)
    R.box("fence_cap_s1", (2.4, yy0 - 0.16, 1.6), (yx1 + 0.16, yy0 + 0.16, 1.67), "concrete", uv=2.0)
    R.box("fence_cap_w", (yx0 - 0.16, yy0 + 0.16, 1.6), (yx0 + 0.16, yy1 - 0.2, 1.67), "concrete", uv=2.0)
    R.box("fence_cap_e", (yx1 - 0.16, yy0 + 0.16, 1.6), (yx1 + 0.16, yy1 - 0.2, 1.67), "concrete", uv=2.0)
    for i, px in enumerate((-2.4, 2.0)):
        R.box("gate_post%d" % i, (px, yy0 - 0.25, 0), (px + 0.4, yy0 + 0.25, 2.4), "school_wall", uv=1.5)
        R.box("gate_post_cap%d" % i, (px - 0.05, yy0 - 0.3, 2.4), (px + 0.45, yy0 + 0.3, 2.5), "concrete", uv=2.0)
    pic(R, "school_plate", "pl_plate_school.png", (2.2, yy0 - 0.252, 1.62), 0.29, 0.95, "-y", rough=0.4)
    for k in range(14):                                      # 접어 둔 주름 철문
        gx = 2.5 + k * 0.1
        R.box("fold_gate%d" % k, (gx, yy0 + 0.2 + (k % 2) * 0.12, 0.06), (gx + 0.03, yy0 + 0.23 + (k % 2) * 0.12, 1.5), "steel")
    R.box("fold_gate_rail", (-2.0, yy0 + 0.24, 0), (3.9, yy0 + 0.3, 0.02), "steel")
    R.box("flag_stand", (-6.5, -4.2, 0), (-5.5, -3.6, 0.5), "concrete", uv=2.0)
    for i in range(3):
        R.cyl("flag_pole%d" % i, (-6.32 + i * 0.35, -3.92, 0.5), 0.03, 5.6, "alu", seg=8)
        R.blob("flag_ball%d" % i, (-6.32 + i * 0.35, -3.92, 6.14), 0.06, "gold", sub=1, bump=0.0)
    for i, tx in enumerate((-7.5, 6.0, 8.0)):
        tree(R, "tree%d" % i, tx, -6.5, h=(7.8 - 0.8 * (i % 2)) if R.tripo("tree.glb", "tree", None, 0.0, height=1.0) else 5.4 + 0.5 * (i % 2))
    hedge(R, "bed_w", -8.6, -2.3, -3.3, -2.76, h=0.7)
    hedge(R, "bed_e", 2.3, 8.6, -3.3, -2.76, h=0.7)
    car(R, "car0", (4.2, -5.4, 0), (8.2, -3.55, 1.4), "car_white", front="-x")
    # 시험장 안내 입간판
    R.box("sign_board", (2.3, -4.83, 0.45), (2.9, -4.8, 1.3), "alu")
    for i, sx in enumerate((2.32, 2.84)):
        R.box("sign_leg%d" % i, (sx, -4.83, 0), (sx + 0.04, -4.79, 0.45), "steel")
        R.box("sign_foot%d" % i, (sx - 0.02, -5.0, 0), (sx + 0.06, -4.6, 0.03), "steel")
    pic(R, "sign_notice", "pl_school_notice.png", (2.6, -4.832, 0.875), 0.56, 0.75, "-y")

    # ── 본관 정면: 벽 두 겹(바깥은 미장, 안은 복도의 허리 칠) ──
    FG = [(-7.5, -3.0, 1.0, 2.2), (-1.0, 1.0, 0, 2.3), (3.0, 7.5, 1.0, 2.2)]
    wall2(R, "facade", (hx0, hy0), (hx1, hy0), h, FG, +1, 1, "wall_white", "school_wall", dado=(1.1, "dado_green"))
    R.box("plinth_w", (hx0, hy0 - 0.15, 0), (-1.05, hy0 - 0.125, 0.9), "brick", uv=1.5)
    R.box("plinth_e", (1.05, hy0 - 0.15, 0), (hx1, hy0 - 0.125, 0.9), "brick", uv=1.5)
    R.box("porch", (-1.8, hy0 - 1.7, 3.1), (1.8, hy0 - 0.125, 3.25), "concrete", uv=2.0)
    R.box("porch_fascia", (-1.84, hy0 - 1.74, 3.05), (1.84, hy0 - 1.7, 3.62), "school_wall", uv=1.5)       # 현관 지붕의 난간: 현수막이 걸린다
    R.box("porch_fascia_w", (-1.84, hy0 - 1.7, 3.05), (-1.8, hy0 - 0.125, 3.62), "school_wall", uv=1.5)
    R.box("porch_fascia_e", (1.8, hy0 - 1.7, 3.05), (1.84, hy0 - 0.125, 3.62), "school_wall", uv=1.5)
    for i, cx in enumerate((-1.7, 1.7)):
        R.box("porch_col%d" % i, (cx - 0.12, -4.22, 0.05), (cx + 0.12, -3.98, 3.1), "school_wall", uv=1.5)
    R.box("porch_light", (-0.3, hy0 - 1.0, 3.07), (0.3, hy0 - 0.8, 3.1), "downlight", R.LAMPS)
    pic(R, "exam_banner", "pl_exam_banner.png", (0.0, hy0 - 1.745, 3.335), 3.56, 0.48, "-y", rough=0.6)
    R.box("door_glass_l", (-1.0, hy0 + 0.13, 0.02), (-0.96, hy0 + 1.05, 2.25), "glass", R.DYN)
    R.box("door_glass_r", (0.96, hy0 + 0.13, 0.02), (1.0, hy0 + 1.05, 2.25), "glass", R.DYN)
    R.box("door_bar_l", (-0.95, hy0 + 0.85, 0.9), (-0.93, hy0 + 0.89, 1.25), "alu")
    R.box("door_bar_r", (0.93, hy0 + 0.85, 0.9), (0.95, hy0 + 0.89, 1.25), "alu")
    R.box("hall_mat", (-0.9, hy0 + 0.2, 0), (0.9, hy0 + 1.1, 0.012), "rubber", uv=0.5)
    up = [R.box("upper", (hx0, hy0 - 0.13, h), (hx1, ay1 + 0.2, 10.6), "school_wall", R.DYN, uv=3.0),
          R.box("upper_cap", (hx0 - 0.1, hy0 - 0.23, 10.6), (hx1 + 0.1, ay1 + 0.3, 10.8), "concrete", R.DYN, uv=2.0)]
    no_bottom(up[0])
    for f in range(2):
        z0 = h + 1.25 + f * 3.3
        for s, (a, b) in enumerate(((-8.3, -1.6), (1.6, 8.3))):
            up.append(R.box("up_win%d_%d" % (f, s), (a, hy0 - 0.16, z0), (b, hy0 - 0.13, z0 + 1.45), "win_dark", R.DYN))
            up.append(R.box("up_sill%d_%d" % (f, s), (a - 0.1, hy0 - 0.22, z0 - 0.07), (b + 0.1, hy0 - 0.13, z0), "sill", R.DYN))
            for k in range(7):
                mx = a + (b - a) * k / 6
                up.append(R.box("up_m%d_%d_%d" % (f, s, k), (mx - 0.03, hy0 - 0.18, z0), (mx + 0.03, hy0 - 0.13, z0 + 1.45), "sash", R.DYN))
        up.append(R.box("up_winc%d" % f, (-1.0, hy0 - 0.16, z0), (1.0, hy0 - 0.13, z0 + 1.45), "win_dark", R.DYN))
        up.append(R.box("up_winc_m%d" % f, (-0.03, hy0 - 0.18, z0), (0.03, hy0 - 0.13, z0 + 1.45), "sash", R.DYN))
    up.append(R.cyl("school_clock", (0.0, hy0 - 0.19, 9.75), 0.5, 0.06, "black", R.DYN, seg=24, axis="y"))
    up.append(R.cyl("school_clock_face", (0.0, hy0 - 0.195, 9.75), 0.44, 0.006, "white", R.DYN, seg=24, axis="y"))
    R.join(up, "upper").visible_shadow = False
    R.text("school_name", "목원고등학교", 0.55, (0.0, hy0 - 0.14, 6.3), "sash_dark", normal="-y")

    # ── 복도 ──
    shell(R, "hall", hx0, hy0, hx1, hy1, h, "terrazzo", floor_uv=2.0)
    HK = dict(mat="wall_white", dado=(1.1, "dado_green"), base="base", frame="sash", glass="glass", sill="sill", door="door_wood", uv=1.5)
    R.wall("hall_ww", (hx0, hy0), (hx0, hy1), h, inside=+1, **HK)
    R.wall("hall_we", (hx1, hy0), (hx1, hy1), h, inside=-1, **HK)
    R.wall("hall_wn", (hx0, hy1), (hx1, hy1), h, gaps=[(-4.4, -3.5, 0, DOOR), (0.5, 1.4, 0, DOOR), (6.2, 8.2, 0, 2.4)], inside=-1, **HK)
    ceiling_lamps(R, "hall", [(-5.5, -1.4), (0.0, -1.4), (5.5, -1.4)], h)
    ny = hy1 - 0.075
    pic(R, "sign_admin", "pl_door_admin.png", (-3.95, ny - 0.004, 2.24), 0.42, 0.14, "-y")
    pic(R, "sign_minwon", "pl_door_minwon.png", (-2.95, ny - 0.004, 1.62), 0.48, 0.12, "-y")
    pic(R, "sign_staff", "pl_door_staff.png", (0.95, ny - 0.004, 2.24), 0.42, 0.14, "-y")
    R.box("admin_door_leaf", (-4.4, hy1 + 0.08, 0.01), (-4.36, hy1 + 0.95, DOOR), "door_wood")
    R.box("staff_door_leaf", (0.5, hy1 + 0.08, 0.01), (0.54, hy1 + 0.95, DOOR), "door_wood")
    for i in range(4):                                       # 긴 의자: 나무 살과 철 다리
        R.box("bench_slat%d" % i, (2.2, -0.74 + i * 0.1, 0.42), (3.8, -0.66 + i * 0.1, 0.45), "wood", uv=1.0)
    for i, bx in enumerate((2.3, 3.64)):
        R.box("bench_leg%d" % i, (bx, -0.74, 0), (bx + 0.05, -0.37, 0.42), "sash_dark")
    for k, z in enumerate(shelf_unit(R, "trophy", (-1.9, -0.45, 0), (-0.4, -0.277, 1.9), "-y", 4, "wood_dark", kick=0.5)):
        for j in range(4):
            tx = -1.72 + j * 0.38 + R.rng.uniform(-0.04, 0.04)
            if (k + j) % 3 == 0:
                R.box("plaque%d%d" % (k, j), (tx - 0.09, -0.34, z), (tx + 0.09, -0.32, z + 0.22), "wood")
                R.box("plaque_face%d%d" % (k, j), (tx - 0.07, -0.342, z + 0.03), (tx + 0.07, -0.34, z + 0.19), "gold")
            else:
                R.cyl("trophy_base%d%d" % (k, j), (tx, -0.37, z), 0.05, 0.04, "black", seg=10)
                R.cyl("trophy_stem%d%d" % (k, j), (tx, -0.37, z + 0.04), 0.012, 0.08, "gold", seg=6)
                R.cyl("trophy_cup%d%d" % (k, j), (tx, -0.37, z + 0.12), 0.02, 0.11, "gold", seg=10, r2=0.05)
    R.box("trophy_glass", (-1.88, -0.452, 0.5), (-0.42, -0.448, 1.88), "glass", R.DYN)
    for k, z in enumerate(shelf_unit(R, "shoe_rack", (-8.925, -2.4, 0), (-8.5, -0.5, 1.1), "+x", 4, "wood", kick=0.05)):
        for j in range(5):
            if R.rng.random() < 0.7:
                sy = -2.28 + j * 0.37
                for q in range(2):
                    R.box("slipper%d%d%d" % (k, j, q), (-8.78, sy + q * 0.11, z), (-8.54, sy + 0.09 + q * 0.11, z + 0.045), R.rng.choice(("white", "slipper_blue", "slipper_blue")))
    R.box("hall_board_frame", (4.2, ny - 0.02, 1.0), (5.5, ny, 1.95), "alu")
    R.box("hall_board", (4.24, ny - 0.028, 1.04), (5.46, ny - 0.02, 1.91), "board_green", uv=0.6)
    pic(R, "hall_notice", "pl_school_notice.png", (4.6, ny - 0.03, 1.5), 0.45, 0.6, "-y")
    R.box("hall_paper0", (5.0, ny - 0.03, 1.5), (5.21, ny - 0.028, 1.8), "paper", R.DECAL)
    R.box("hall_paper1", (5.05, ny - 0.03, 1.12), (5.35, ny - 0.028, 1.42), "paper", R.DECAL)
    R.box("hose_box", (hx1 - 0.2, -1.9, 0.5), (hx1 - 0.075, -1.25, 1.4), "hose_red")
    R.text("hose_label", "소화전", 0.09, (hx1 - 0.203, -1.575, 1.2), "white", normal="-x")
    clock(R, "hall_clock", -2.9, ny, 2.3, "-y")

    # ── 행정실 ──
    shell(R, "admin", ax0, ay0, ax1, ay1, h, "floor_tile")
    RK = dict(mat="wall_white", base="base", frame="sash", glass="glass", sill="sill", door="door_wood", uv=1.5)
    R.wall("admin_ww", (ax0, ay0), (ax0, ay1), h, inside=+1, **RK)
    R.wall("admin_wn", (ax0, ay1), (ax1, ay1), h, gaps=[(-8.0, -3.5, 1.0, 2.1)], inside=-1, **RK)
    R.wall("admin_we", (ax1, ay0), (ax1, ay1), h, inside=-1, **RK)
    ceiling_lamps(R, "admin", [(-5.7, 1.2), (-5.7, 3.6)], h)
    blinds(R, "admin_blind", -7.95, -3.55, 1.6, 2.08, ay1 - 0.11, 0)
    R.box("counter_body", (-8.92, 1.3, 0), (-2.58, 1.7, 1.02), "laminate_white", uv=1.0)
    R.box("counter_top", (-8.92, 1.25, 1.02), (-2.58, 1.75, 1.06), "laminate", uv=1.0)
    R.box("counter_band", (-8.92, 1.295, 0.08), (-2.58, 1.3, 0.3), "navy")
    R.box("counter_stand", (-5.85, 1.42, 1.06), (-5.15, 1.45, 1.26), "white")
    R.text("counter_label", "민원 창구", 0.09, (-5.5, 1.418, 1.16), "ink", normal="-y")
    R.box("visitor_log", (-4.7, 1.33, 1.06), (-4.35, 1.6, 1.075), "book_grey", rot=0.08)
    R.box("visitor_pen", (-4.3, 1.4, 1.06), (-4.17, 1.41, 1.068), "ink", rot=0.5)
    R.cyl("counter_bell", (-6.4, 1.45, 1.06), 0.04, 0.035, "gold", seg=12, r2=0.01)
    wx = ax0 + 0.075
    R.box("office_board_frame", (wx, -0.04, 0.96), (wx + 0.018, 1.09, 2.04), "alu")
    R.box("office_board", (wx + 0.018, 0.0, 1.0), (wx + 0.026, 1.05, 2.0), "cork", uv=0.5)
    pic(R, "schedule_sheet", "pl_schedule.png", (wx + 0.028, 0.5, 1.55), 0.45, 0.6, "+x")
    R.box("board_memo0", (wx + 0.026, 0.8, 1.6), (wx + 0.028, 0.98, 1.84), "paper", R.DECAL)
    R.box("board_memo1", (wx + 0.026, 0.06, 1.15), (wx + 0.028, 0.24, 1.3), "book_yellow", R.DECAL)
    desk(R, "admin_desk0", (-7.6, 2.9, 0), (-6.2, 3.6, 0.74), front="+y", screen=True)
    seat(R, "admin_chair0", -6.9, 4.1, "-y")
    desk(R, "admin_desk1", (-4.9, 3.3, 0), (-3.5, 4.0, 0.74), front="-y", screen=False)
    seat(R, "admin_chair1", -4.2, 2.85, "+y")
    R.box("terminal", (-4.4, 3.72, 0.84), (-4.0, 3.75, 1.1), "black")
    R.quad("terminal_screen", (-4.2, 3.718, 0.97), 0.36, 0.22, "monitor", R.LAMPS, normal="-y")
    R.box("terminal_foot", (-4.28, 3.66, 0.74), (-4.12, 3.8, 0.755), "black")
    R.box("terminal_neck", (-4.22, 3.74, 0.74), (-4.18, 3.77, 0.86), "black")
    cabinet(R, "cabinet", (-3.2, 3.6, 0), (-2.62, 4.9, 1.9), "-x")
    R.box("key_box", (ax1 - 0.14, 2.2, 1.3), (ax1 - 0.075, 2.7, 1.8), "laminate_grey")
    R.text("key_label", "열쇠함", 0.06, (ax1 - 0.143, 2.45, 1.72), "ink", normal="-x")
    R.box("copier", (-8.85, 4.0, 0), (-8.2, 4.7, 1.0), "white")
    R.box("copier_top", (-8.85, 4.0, 1.0), (-8.2, 4.7, 1.08), "laminate_grey")
    plant(R, "plant_admin", -2.95, 2.95, 1.2)
    clock(R, "admin_clock", -5.7, ay1 - 0.075, 2.35, "-y")

    # ── 교무실 ──
    shell(R, "staff", tx0, ty0, tx1, ty1, h, "lino", floor_uv=2.5)
    R.wall("staff_wn", (tx0, ty1), (tx1, ty1), h, gaps=[(-1.5, 4.5, 1.0, 2.1)], inside=-1, **RK)
    R.wall("staff_we", (tx1, ty0), (tx1, ty1), h, inside=-1, **RK)
    ceiling_lamps(R, "staff", [(-0.4, 1.4), (-0.4, 3.6), (3.4, 2.5)], h)
    blinds(R, "staff_blind", -1.45, 4.45, 1.7, 2.08, ty1 - 0.11, 0)
    for i, (dx, dy, fr) in enumerate(((-1.6, 3.4, "-y"), (-0.2, 3.4, "-y"), (-1.6, 4.1, "+y"), (-0.2, 4.1, "+y"), (3.2, 3.6, "+y"), (4.6, 3.6, "+y"))):
        desk(R, "staff_desk%d" % i, (dx - 0.65, dy - 0.33, 0), (dx + 0.65, dy + 0.33, 0.74), front=fr)
        seat(R, "staff_chair%d" % i, dx + R.rng.uniform(-0.1, 0.1), dy + (-0.62 if fr == "-y" else 0.62), "+y" if fr == "-y" else "-y")
    desk(R, "bae_desk", (1.75, 2.75, 0), (3.05, 3.25, 0.74), front="-y", screen=False, clutter=False)
    R.box("report_sheet", (2.2, 2.85, 0.74), (2.6, 3.2, 0.745), "paper")
    R.box("report_pen", (2.66, 2.95, 0.74), (2.8, 2.96, 0.748), "ink", rot=0.4)
    R.box("report_file", (1.85, 2.9, 0.74), (2.12, 3.28, 0.765), "book_blue", rot=-0.1)
    cabinet(R, "staff_locker", (4.9, 0.3, 0), (5.42, 2.2, 1.9), "-x")
    sx = tx0 + 0.075
    R.box("plan_board_frame", (sx, 1.4, 0.95), (sx + 0.02, 3.6, 2.05), "alu")
    R.box("plan_board", (sx + 0.02, 1.44, 0.99), (sx + 0.026, 3.56, 2.01), "board_green", uv=0.8)
    R.text("plan_title", "월중 행사", 0.11, (sx + 0.029, 2.5, 1.88), "white", normal="+x")
    for r in range(5):
        R.box("plan_line%d" % r, (sx + 0.026, 1.56, 1.7 - r * 0.15), (sx + 0.028, 3.44, 1.704 - r * 0.15), "white", R.DECAL)
    for c in range(6):
        R.box("plan_col%d" % c, (sx + 0.026, 1.56 + c * 0.376, 1.1), (sx + 0.028, 1.564 + c * 0.376, 1.7), "white", R.DECAL)
    R.box("tea_table", (-2.3, 0.2, 0), (-1.5, 0.75, 0.75), "laminate_white")
    R.cyl("tea_pot", (-2.05, 0.45, 0.75), 0.09, 0.22, "steel", seg=12, r2=0.07)
    for i in range(3):
        R.cyl("tea_cup%d" % i, (-1.78 + 0.07 * (i % 2), 0.32 + i * 0.12, 0.75), 0.03, 0.07, "paper", seg=10, r2=0.036)
    clock(R, "staff_clock", 1.5, ty0 + 0.075, 2.3, "+y")

    # ── 계단 홀: 3층으로 가는 길을 주름 철문이 막고 있다 ──
    shell(R, "stair", rx0, ry0, rx1, ry1, h, "terrazzo", floor_uv=2.0)
    R.wall("stair_wn", (rx0, ry1), (rx1, ry1), h, inside=-1, **RK)
    R.wall("stair_we", (rx1, ry0), (rx1, ry1), h, inside=-1, **RK)
    R.lamp("lamp_stair", 7.2, 0.6, h, 1.2, 0.3)
    R.box("stair_side_w", (rx0 + 0.075, 1.4, 0), (6.0, ry1 - 0.075, h), "wall_white", uv=1.5)
    R.box("stair_side_e", (8.6, 1.4, 0), (rx1 - 0.075, ry1 - 0.075, h), "wall_white", uv=1.5)
    for i in range(8):
        R.box("step%d" % i, (6.0, 1.7 + i * 0.3, 0), (8.6, 2.0 + i * 0.3, 0.17 * (i + 1)), "terrazzo", uv=2.0)
        R.box("step_nose%d" % i, (6.0, 1.695 + i * 0.3, 0.17 * (i + 1) - 0.012), (8.6, 1.73 + i * 0.3, 0.17 * (i + 1) + 0.002), "sash_dark")
    R.box("landing", (6.0, 4.1, 0), (8.6, ry1 - 0.075, 1.36), "terrazzo", uv=2.0)
    for k in range(23):                                      # 주름 철문: 세로 살과 가로대, 자물쇠
        gx = 6.02 + k * 0.117
        R.box("stair_gate%d" % k, (gx, 1.46 + (k % 2) * 0.02, 0.02), (gx + 0.02, 1.48 + (k % 2) * 0.02, 2.0), "steel")
    for i, gz in enumerate((0.25, 1.0, 1.9)):
        R.box("stair_gate_rail%d" % i, (6.0, 1.455, gz), (8.6, 1.475, gz + 0.03), "steel")
    R.box("stair_gate_top", (6.0, 1.44, 2.0), (8.6, 1.52, 2.06), "steel")
    R.box("stair_lock", (7.26, 1.43, 0.98), (7.34, 1.455, 1.08), "gold")
    R.box("stair_sign_plate", (6.6, 1.435, 1.3), (7.8, 1.45, 1.7), "white")
    pic(R, "stair_sign", "pl_stair_sign.png", (7.2, 1.433, 1.5), 1.2, 0.4, "-y")

    # ── 학교 둘레의 동네와 하늘 ──
    far_town(R, (0, -2), 24, 56, -0.05, n=80, tall=0.15, hmin=6, hmax=13, own=(yx0, yy0, hx1, ay1 + 0.2, -0.04))
    sky(R, (0.38, 0.52, 0.78), (0.90, 0.86, 0.80), (0.84, 0.80, 0.74), strength=1.0)

    def cull(c, n):
        return ((c.y > ay1 + 0.06 and n.y > 0.5) or (c.x < hx0 - 0.06 and n.x < -0.5) or (c.x > hx1 + 0.06 and n.x > 0.5)
                or (c.z > h + 0.05 and n.z > 0.5 and c.y > hy0 and c.z < 3.0)
                or (c.y < yy0 - 0.1 and n.y < -0.5 and abs(c.x) > 2.5))
    return R.finish(cull=cull)


BUILDERS["gate"] = build_gate
