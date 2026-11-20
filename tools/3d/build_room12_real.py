# 목원고 12시험실 사실 버전 — Blender에서 실행한다. 블록아웃(build_room12_blockout.py)을 먼저 지어 둔다.
#   exec(open(r"D:\ai-mystery-game\tools\3d\build_room12_real.py", encoding="utf-8").read())
# 방과 붙박이는 손으로(이 스크립트로) 짓고, 책걸상·교탁·사다리는 Tripo가 만든 glb(tools/_raw/3d/tripo)를 다듬어 놓는다.
# 단서가 되는 디테일(가루, 자국, 칠판 글씨, 깨진 텍스)은 생성에 맡기지 않고 여기서 만든다.
# 충돌 면과 게임이 읽는 자리는 블록아웃의 것을 그대로 쓴다: 블록아웃에서 걸어 본 동선이 바뀌지 않는다.
# 결과: 컬렉션 room12_real (static / lamps / furniture / dynamic / decals) + 블록아웃의 colliders, markers.
import bpy, bmesh, math, os, sys, importlib, random, io, contextlib, logging
import numpy as np
from mathutils import Vector, Matrix, Euler

HERE = r"D:\ai-mystery-game\tools\3d"
TRIPO = r"D:\ai-mystery-game\tools\_raw\3d\tripo"
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import room12_layout as L
importlib.reload(L)
HX, HY, HZ, T = L.HX, L.HY, L.ROOM_Z, L.WALL_T
rng = random.Random(12)
nrng = np.random.default_rng(12)

# ── 컬렉션 ──
def coll(name, parent=None):
    c = bpy.data.collections.get(name)
    if c is None:
        c = bpy.data.collections.new(name)
        (parent or bpy.context.scene.collection).children.link(c)
    return c
def wipe(c):
    for o in list(c.objects):
        bpy.data.objects.remove(o, do_unlink=True)
ROOT = coll("room12_real")
STATIC, LAMPS, FURN, DYN, DECAL = (coll("real_" + n, ROOT) for n in ("static", "lamps", "furniture", "dynamic", "decals"))
for c in (STATIC, LAMPS, FURN, DYN, DECAL):
    wipe(c)
# 블록아웃의 상자들은 이름이 겹치므로 이 파일에서 치운다 (블록아웃 .blend와 glb는 따로 남아 있다).
for name in ("arch", "furniture"):
    c = bpy.data.collections.get(name)
    if c:
        wipe(c)
        bpy.data.collections.remove(c)
if not bpy.data.collections.get("colliders") or not bpy.data.collections.get("markers"):
    R12_SHARED_ONLY = True
    exec(open(os.path.join(HERE, "build_room12_blockout.py"), encoding="utf-8").read())
for name in ("colliders", "markers"):  # 충돌 면과 자리는 블록아웃의 것을 그대로 묶는다
    c = bpy.data.collections[name]
    if c.name not in ROOT.children:
        ROOT.children.link(c)
    for o in c.objects:
        o.hide_render = True
for blk in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.curves):
    for d in list(blk):
        if d.users == 0 and d.name.startswith(("r12_", "tripo_")):
            blk.remove(d)

# ── 그림(텍스처)을 숫자로 만든다 ──
def blur(a, sigma):
    """가장자리가 이어지는(타일링) 흐림."""
    h, w = a.shape[:2]
    fy, fx = np.fft.fftfreq(h)[:, None], np.fft.fftfreq(w)[None, :]
    g = np.exp(-2 * (np.pi ** 2) * (sigma ** 2) * (fx ** 2 + fy ** 2))
    if a.ndim == 3:
        return np.stack([np.fft.ifft2(np.fft.fft2(a[..., i]) * g).real for i in range(a.shape[2])], -1)
    return np.fft.ifft2(np.fft.fft2(a) * g).real
def noise(h, w, sigma):
    n = blur(nrng.standard_normal((h, w)), sigma)
    return (n - n.min()) / (n.max() - n.min() + 1e-9)
def image(name, arr, data=False):
    """arr: (H, W, 3|4) 0~1, 위가 첫 줄. 색이면 sRGB 값."""
    arr = np.clip(np.asarray(arr, dtype=np.float32), 0, 1)
    h, w = arr.shape[:2]
    if arr.shape[2] == 3:
        arr = np.concatenate([arr, np.ones((h, w, 1), np.float32)], -1)
    old = bpy.data.images.get(name)
    if old:
        bpy.data.images.remove(old)
    im = bpy.data.images.new(name, w, h, alpha=True)
    im.colorspace_settings.name = "Non-Color" if data else "sRGB"
    im.pixels.foreach_set(arr[::-1].ravel())  # 8비트 그림의 pixels는 화면값(sRGB) 그대로다
    im.pack()
    return im
def rgb(a, color):
    return a[..., None] * np.array(color, np.float32)[None, None, :]

def tex_floor():
    # 좁은 마루널(폭 75mm), 2.4m 정사각을 1024로. 왁스를 먹여 반들거리고 사람 다닌 자리는 거칠다.
    S, strips = 1024, 32
    col = np.zeros((S, S, 3), np.float32)
    seam = np.zeros((S, S), np.float32)
    grain = blur(nrng.standard_normal((S, S)), 0.6)
    grain = blur(np.repeat(grain[:, ::16], 16, axis=1), 2.5)  # 길이 방향으로 늘인 결
    sw = S // strips
    for i in range(strips):
        y0 = i * sw
        cuts = sorted({int(rng.uniform(0, S)) for _ in range(2)}) + [S]
        x0 = 0
        for x1 in cuts:
            tone = rng.uniform(0.9, 1.08)
            warm = rng.uniform(-0.03, 0.03)
            col[y0:y0 + sw, x0:x1] = np.array([0.56 + warm, 0.40, 0.24 - warm * 0.5]) * tone
            seam[y0:y0 + sw, max(0, x1 - 1):x1] = 1
            x0 = x1
        seam[y0:y0 + 1, :] = 1
    g = (grain - grain.mean()) / (grain.std() + 1e-9)
    col *= (1 + 0.05 * g)[..., None]
    col *= (1 - 0.5 * blur(seam, 0.6).clip(0, 1)).clip(0.6, 1)[..., None]
    wear = noise(S, S, 60)
    rough = 0.30 + 0.22 * wear + 0.2 * blur(seam, 0.8).clip(0, 1) + 0.03 * g
    return image("r12_floor_col", col), image("r12_floor_rough", np.repeat(rough[..., None], 3, 2), data=True)

def tex_ceiling(chipped=False):
    # 텍스 한 장(600mm): 흰 섬유판에 바늘구멍과 잔금. 가장자리는 T바가 가린다.
    S = 256
    base = 0.82 + 0.04 * noise(S, S, 14) + 0.02 * nrng.standard_normal((S, S))
    holes = np.zeros((S, S), np.float32)
    for _ in range(420):
        x, y, r = nrng.integers(8, S - 8), nrng.integers(8, S - 8), nrng.choice([1, 1, 1, 2])
        holes[y:y + r, x:x + r] = nrng.uniform(0.45, 0.85)
    for _ in range(26):  # 벌레 먹은 듯한 잔금
        x, y, a = nrng.uniform(10, S - 10), nrng.uniform(10, S - 10), nrng.uniform(0, 3.14)
        for t in range(nrng.integers(5, 16)):
            holes[int(y) % S, int(x) % S] = 0.7
            x += math.cos(a); y += math.sin(a); a += nrng.uniform(-0.5, 0.5)
    c = base * (1 - 0.55 * blur(holes, 0.45).clip(0, 1))
    col = rgb(c, (1.0, 0.985, 0.95))
    b = 5  # T바: 흰 칠, 안쪽에 가는 그늘
    for sl in (np.s_[:b, :], np.s_[-b:, :], np.s_[:, :b], np.s_[:, -b:]):
        col[sl] = (0.88, 0.88, 0.86)
    for sl in (np.s_[b:b + 1, b:-b], np.s_[-b - 1:-b, b:-b], np.s_[b:-b, b:b + 1], np.s_[b:-b, -b - 1:-b]):
        col[sl] *= 0.62
    if chipped:
        # 모서리가 깨졌고, 코팅 장갑의 고무가 묻었다 (C6). 가까이서 보아야 보인다.
        yy, xx = np.mgrid[0:S, 0:S]
        chip = ((xx - (S - b)) ** 2 / 26 ** 2 + (yy - (S - b)) ** 2 / 14 ** 2) < 1
        chip &= (nrng.random((S, S)) < 0.93)
        col[chip] = (0.52, 0.50, 0.46)
        smear = np.zeros((S, S), np.float32)
        for k in range(4):
            x0, y0 = S - 60 + k * 9, S - 42
            for t in range(34):
                smear[y0 + t // 3, x0 + t - 10:x0 + t - 6] = 1
        m = blur(smear, 1.6).clip(0, 1)[..., None] * 0.55
        col = col * (1 - m) + np.array([0.12, 0.12, 0.13]) * m
    return image("r12_tile24_col" if chipped else "r12_ceiling_col", col)

def tex_board():
    W, H = 1024, 512
    n = noise(H, W, 40) * 0.6 + noise(H, W, 6) * 0.4
    wipe_ = blur(np.repeat(nrng.standard_normal((H // 8, W))[:, :], 8, axis=0), 6)
    wipe_ = (wipe_ - wipe_.min()) / (wipe_.max() - wipe_.min())
    dust = (0.10 * n + 0.07 * wipe_)
    col = np.array([0.075, 0.20, 0.155])[None, None, :] * (0.85 + 0.3 * n[..., None]) + dust[..., None] * np.array([0.9, 1.0, 0.95])
    return image("r12_board_col", col)

def tex_cork():
    S = 256
    n = noise(S, S, 1.2)
    col = np.array([0.62, 0.45, 0.28])[None, None, :] * (0.75 + 0.5 * n[..., None])
    return image("r12_cork_col", col)

def tex_sky():
    # 창밖: 해 질 녘 하늘과 운동장 건너 건물의 윤곽
    W, H = 1024, 512
    y = np.linspace(0, 1, H)[:, None]
    top, mid, low = np.array([0.36, 0.47, 0.66]), np.array([0.93, 0.70, 0.50]), np.array([1.0, 0.82, 0.55])
    k = np.clip((y - 0.15) / 0.5, 0, 1)
    sky = top * (1 - k) + mid * k
    k2 = np.clip((y - 0.55) / 0.2, 0, 1)
    sky = sky * (1 - k2) + low * k2
    col = np.repeat(sky[:, None, :].reshape(H, 1, 3), W, axis=1).astype(np.float32)
    col += 0.03 * noise(H, W, 30)[..., None]
    hz = int(H * 0.70)
    x = 0
    while x < W:  # 건물 윤곽
        bw, bh = rng.randint(30, 110), rng.randint(8, 70)
        col[hz - bh:hz, x:x + bw] = np.array([0.20, 0.17, 0.19]) * rng.uniform(0.8, 1.2)
        x += bw + rng.randint(0, 25)
    col[hz:, :] = np.array([0.42, 0.33, 0.26])  # 운동장 흙
    col[hz:, :] *= (0.85 + 0.3 * noise(H - hz, W, 20))[..., None]
    return image("r12_sky_col", col)

def decal(name, draw, S=256):
    a = np.zeros((S, S, 4), np.float32)
    draw(a, S)
    return image(name, a)
def d_dust(a, S):
    # 석고 가루: 한가운데 몰린 흰 점들과 옅은 번짐 (C1)
    pts = nrng.normal(S / 2, S / 9, (1500, 2)).astype(int).clip(1, S - 2)
    m = np.zeros((S, S), np.float32)
    m[pts[:, 1], pts[:, 0]] = 1
    alpha = (blur(m, 0.8) * 3.2 + blur(m, 7) * 9).clip(0, 0.95)
    a[..., :3] = (0.93, 0.92, 0.89)
    a[..., 3] = alpha
def d_tape(a, S):
    # 테이프 자국: 펜 한 자루 길이의 끈적한 띠, 가장자리에 먼지가 붙었다 (C4)
    m = np.zeros((S, S), np.float32)
    m[S // 2 - 22:S // 2 + 22, 16:S - 16] = 1
    edge = blur(m, 1.5) * (1 - blur(m, 5)) * 4
    a[..., :3] = (0.36, 0.31, 0.22)
    a[..., 3] = (0.34 * m * (0.6 + 0.8 * noise(S, S, 5)) + edge.clip(0, 1) * 0.5).clip(0, 0.9)
def d_ladder(a, S):
    # 사다리 발의 격자무늬 고무 자국 (C2)
    m = np.zeros((S, S), np.float32)
    for i in range(34, S - 34, 26):
        m[40:S - 40, i:i + 9] = 1
        m[i:i + 9, 40:S - 40] = 1
    m *= (noise(S, S, 4) > 0.3)
    a[..., :3] = (0.10, 0.10, 0.11)
    a[..., 3] = blur(m, 1.0).clip(0, 1) * 0.62
def d_dent(a, S):
    # 책상 다리가 오래 누른 자리: 왁스가 둥글게 죽었다 (C3)
    yy, xx = np.mgrid[0:S, 0:S]
    r = np.hypot(xx - S / 2, yy - S / 2) / (S / 2)
    ring = np.exp(-((r - 0.55) / 0.12) ** 2) * 0.55 + (r < 0.55) * 0.22
    a[..., :3] = (0.26, 0.20, 0.13)
    a[..., 3] = ring.clip(0, 0.7)
def d_sticker(a, S):
    # 수험번호 스티커: 흰 딱지에 줄 몇 개. 번호는 글자 메시로 얹는다.
    a[30:S - 30, 8:S - 8, :3] = (0.96, 0.96, 0.93)
    a[30:S - 30, 8:S - 8, 3] = 1
    a[44:52, 20:S - 20, :3] = (0.75, 0.16, 0.12)
    for y in (S - 70, S - 54):
        a[y:y + 4, 20:S - 90, :3] = (0.25, 0.25, 0.27)
def d_chart(a, S):
    # 좌석 배치도: 네 열 여섯 줄. 24번은 다른 줄과 나란하다.
    a[..., :3] = (0.96, 0.96, 0.94)
    a[..., 3] = 1
    a[16:22, 30:S - 30, :3] = (0.15, 0.15, 0.18)
    for c in range(4):
        for r_ in range(6):
            x, y = 40 + c * 48, 44 + r_ * 31
            a[y:y + 22, x:x + 34, :3] = (0.80, 0.84, 0.90)
            a[y:y + 22, x:x + 1, :3] = a[y:y + 22, x + 33:x + 34, :3] = a[y:y + 1, x:x + 34, :3] = a[y + 21:y + 22, x:x + 34, :3] = (0.2, 0.2, 0.25)
    a[44 + 5 * 31:44 + 5 * 31 + 22, 40 + 3 * 48:40 + 3 * 48 + 34, :3] *= (1.0, 0.75, 0.7)
    a[S - 22:S - 14, 30:120, :3] = (0.3, 0.3, 0.34)

# ── 재질 ──
def pbr(name, color=(0.8, 0.8, 0.8), rough=0.6, metal=0.0, emit=None, emit_strength=1.0, blend=False, alpha=1.0, normal=None, transmission=0.0):
    m = bpy.data.materials.get(name)
    if m:
        bpy.data.materials.remove(m)
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    def put(sock, v, data=False):
        if isinstance(v, bpy.types.Image):
            t = nt.nodes.new("ShaderNodeTexImage")
            t.image = v
            nt.links.new(t.outputs["Color"], b.inputs[sock])
            return t
        b.inputs[sock].default_value = (*v, 1.0) if isinstance(v, tuple) else v
    tc = put("Base Color", color)
    put("Roughness", rough)
    put("Metallic", metal)
    if emit is not None:
        put("Emission Color", emit)
        b.inputs["Emission Strength"].default_value = emit_strength
    if blend:
        if tc is not None:
            nt.links.new(tc.outputs["Alpha"], b.inputs["Alpha"])
        else:
            b.inputs["Alpha"].default_value = alpha
        m.surface_render_method = "BLENDED"
    if transmission:
        b.inputs["Transmission Weight"].default_value = transmission
    return m

FLOOR_C, FLOOR_R = tex_floor()
M = {
    "floor": pbr("r12_floor", FLOOR_C, FLOOR_R),
    "wall": pbr("r12_wall", (0.80, 0.78, 0.70), 0.9),            # 크림색 수성 페인트
    "dado": pbr("r12_dado", (0.47, 0.60, 0.53), 0.55),           # 허리 아래 옥색 유성 페인트
    "base": pbr("r12_baseboard", (0.20, 0.17, 0.14), 0.6),
    "ceil": pbr("r12_ceiling", tex_ceiling(), 0.95),
    "tile24": pbr("r12_tile24", tex_ceiling(True), 0.95),
    "slab": pbr("r12_slab", (0.22, 0.22, 0.21), 0.95),
    "alu": pbr("r12_aluminium", (0.74, 0.75, 0.76), 0.38, 0.85),
    "sash": pbr("r12_sash", (0.86, 0.86, 0.84), 0.5),
    "sill": pbr("r12_sill", (0.62, 0.60, 0.56), 0.4),
    "board": pbr("r12_board", tex_board(), 0.8),
    "wood": pbr("r12_wood", (0.52, 0.36, 0.21), 0.5),
    "wood2": pbr("r12_wood_dark", (0.36, 0.24, 0.14), 0.55),
    "steel": pbr("r12_steel_paint", (0.55, 0.60, 0.62), 0.45, 0.2),
    "cork": pbr("r12_cork", tex_cork(), 0.95),
    "paper": pbr("r12_paper", (0.93, 0.93, 0.90), 0.8),
    "black": pbr("r12_black", (0.03, 0.03, 0.035), 0.5),
    "white": pbr("r12_white", (0.92, 0.92, 0.90), 0.5),
    "grille": pbr("r12_grille", (0.07, 0.07, 0.07), 0.9),
    "lamp": pbr("r12_lamp", (1, 1, 1), 0.4, emit=(1.0, 0.95, 0.86), emit_strength=14.0),
    "lamp_body": pbr("r12_lamp_body", (0.9, 0.9, 0.88), 0.5),
    "glass": pbr("r12_glass", (0.85, 0.92, 0.95), 0.03, blend=True, alpha=0.16),
    "sky": pbr("r12_sky", (0, 0, 0), 1.0, emit=tex_sky(), emit_strength=1.0),
    "chalk": pbr("r12_chalk", (0.90, 0.90, 0.86), 1.0),
    "chalk_red": pbr("r12_chalk_red", (0.82, 0.30, 0.26), 1.0),
    "ink": pbr("r12_ink", (0.08, 0.08, 0.10), 0.7),
    "pipe": pbr("r12_pipe_red", (0.62, 0.10, 0.08), 0.5, 0.3),
    "dust": pbr("r12_decal_dust", decal("r12_d_dust", d_dust), 1.0, blend=True),
    "tape": pbr("r12_decal_tape", decal("r12_d_tape", d_tape), 0.35, blend=True),
    "ladder_mark": pbr("r12_decal_ladder", decal("r12_d_ladder", d_ladder), 0.9, blend=True),
    "dent": pbr("r12_decal_dent", decal("r12_d_dent", d_dent), 0.85, blend=True),
    "sticker": pbr("r12_decal_sticker", decal("r12_d_sticker", d_sticker), 0.6, blend=True),
    "chart": pbr("r12_chart", decal("r12_d_chart", d_chart), 0.8),
}

# ── 모양 ──
def box(name, lo, hi, material, c, uv=1.0):
    """축에 나란한 상자. UV는 실제 크기(m)를 uv로 나눈 값: 타일 텍스처가 크기에 맞게 깔린다."""
    me = bpy.data.meshes.new("r12_" + name)
    bm = bmesh.new()
    (x0, y0, z0), (x1, y1, z1) = lo, hi
    v = [bm.verts.new(p) for p in ((x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1))]
    for f in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
        bm.faces.new([v[i] for i in f])
    bm.normal_update()
    uvl = bm.loops.layers.uv.new("uv")
    for f in bm.faces:
        ax = max(range(3), key=lambda i: abs(f.normal[i]))
        for l in f.loops:
            p = l.vert.co
            l[uvl].uv = ((p.x, p.y) if ax == 2 else (p.y, p.z) if ax == 0 else (p.x, p.z))
            l[uvl].uv = (l[uvl].uv[0] / uv, l[uvl].uv[1] / uv)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(material)
    o = bpy.data.objects.new(name, me)
    c.objects.link(o)
    return o

def quad(name, center, sx, sy, material, c, z=None, rot=0.0, normal="+z", flip_u=False):
    """UV 0~1의 네모 한 장 (데칼, 종이). normal: +z(위), -z(아래), +x, -x, +y, -y"""
    me = bpy.data.meshes.new("r12_" + name)
    bm = bmesh.new()
    pts = [(-sx / 2, -sy / 2), (sx / 2, -sy / 2), (sx / 2, sy / 2), (-sx / 2, sy / 2)]
    uvs = [(0, 0), (1, 0), (1, 1), (0, 1)]
    vs = [bm.verts.new((x, y, 0)) for x, y in pts]
    f = bm.faces.new(vs)
    uvl = bm.loops.layers.uv.new("uv")
    for l, uv_ in zip(f.loops, uvs):
        l[uvl].uv = (1 - uv_[0], uv_[1]) if flip_u else uv_
    bm.to_mesh(me)
    bm.free()
    me.materials.append(material)
    o = bpy.data.objects.new(name, me)
    R = {"+z": Euler((0, 0, rot)), "-z": Euler((math.pi, 0, rot)), "+x": Euler((math.pi / 2, 0, math.pi / 2)), "-x": Euler((math.pi / 2, 0, -math.pi / 2)),
         "+y": Euler((math.pi / 2, 0, math.pi)), "-y": Euler((math.pi / 2, 0, 0))}[normal]
    o.rotation_euler = R
    o.location = center
    c.objects.link(o)
    return o

FONT = None
for fp in (r"C:\Windows\Fonts\malgunbd.ttf", r"C:\Windows\Fonts\malgun.ttf"):
    if os.path.exists(fp):
        FONT = bpy.data.fonts.load(fp, check_existing=True)
        break
def text(name, body, size, loc, material, c, normal="+x", align="CENTER", res=1):
    """글자를 메시로. 칠판 글씨와 번호처럼 읽혀야 하는 것에 쓴다."""
    cu = bpy.data.curves.new("r12_" + name, "FONT")
    cu.body, cu.size, cu.align_x, cu.align_y, cu.resolution_u = body, size, align, "CENTER", res
    if FONT:
        cu.font = FONT
    tmp = bpy.data.objects.new(name + "_tmp", cu)
    bpy.context.scene.collection.objects.link(tmp)
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(tmp, do_unlink=True)
    bpy.data.curves.remove(cu)
    me.name = "r12_" + name
    me.materials.clear()
    me.materials.append(material)
    o = bpy.data.objects.new(name, me)
    o.rotation_euler = {"+x": Euler((math.pi / 2, 0, math.pi / 2)), "-x": Euler((math.pi / 2, 0, -math.pi / 2)), "+z": Euler((0, 0, -math.pi / 2)), "+y": Euler((math.pi / 2, 0, math.pi)), "-y": Euler((math.pi / 2, 0, 0))}[normal]
    o.location = loc
    c.objects.link(o)
    return o

# ── 바닥, 천장, 벽 ──
box("floor", (-HX, -HY, -0.1), (HX, HY, 0), M["floor"], STATIC, uv=2.4)
PLEN = 0.55  # 천장 속 높이
# 텍스 천장: 한 장이 한 칸. 24번 위 한 장은 따로(재질이 다르다) 두었다가 굽고 나서 떼어 낸다.
me = bpy.data.meshes.new("r12_ceiling")
bm = bmesh.new()
uvl = bm.loops.layers.uv.new("uv")
nx, ny = round(L.ROOM_X / L.TILE), round(L.ROOM_Y / L.TILE)
t24 = (round((L.TILE24[0] + HX) / L.TILE - 0.5), round((L.TILE24[1] + HY) / L.TILE - 0.5))
for i in range(nx):
    for j in range(ny):
        x0, y0 = -HX + i * L.TILE, -HY + j * L.TILE
        f = bm.faces.new([bm.verts.new(p) for p in ((x0, y0, HZ), (x0, y0 + L.TILE, HZ), (x0 + L.TILE, y0 + L.TILE, HZ), (x0 + L.TILE, y0, HZ))])
        f.material_index = 1 if (i, j) == t24 else 0
        for l, uv_ in zip(f.loops, ((0, 0), (0, 1), (1, 1), (1, 0))):
            l[uvl].uv = uv_
bmesh.ops.remove_doubles(bm, verts=[v for f in bm.faces if f.material_index == 0 for v in f.verts], dist=1e-5)
bm.to_mesh(me)
bm.free()
me.materials.append(M["ceil"])
me.materials.append(M["tile24"])
STATIC.objects.link(bpy.data.objects.new("ceiling", me))

DADO = 1.0
def wall(name, lo, hi):
    """아래 1m는 옥색, 위는 크림색."""
    (x0, y0, z0), (x1, y1, z1) = lo, hi
    if z0 < DADO < z1:
        box(name + "_dado", (x0, y0, z0), (x1, y1, DADO), M["dado"], STATIC)
        box(name, (x0, y0, DADO), (x1, y1, z1), M["wall"], STATIC)
    else:
        box(name, lo, hi, M["dado"] if z1 <= DADO else M["wall"], STATIC)
TOP = HZ   # 벽은 텍스 천장까지만 짓는다. 그 위는 보이지 않는다.
wall("wall_front", (-HX - T, -HY - T, 0), (-HX, HY + T, TOP))
wall("wall_back", (HX, -HY - T, 0), (HX + T, HY + T, TOP))
wall("wall_win_sill", (-HX, -HY - T, 0), (HX, -HY, 0.9))
wall("wall_win_head", (-HX, -HY - T, 2.3), (HX, -HY, TOP))
edges = [-HX] + [e for cx in L.WINDOWS_X for e in (cx - 1.2, cx + 1.2)] + [HX]
for i in range(0, len(edges), 2):
    if edges[i + 1] - edges[i] > 0.01:
        wall(f"wall_win_pier{i // 2}", (edges[i], -HY - T, 0.9), (edges[i + 1], -HY, 2.3))
dedges = [-HX] + [e for cx in L.DOORS_X for e in (cx - 0.45, cx + 0.45)] + [HX]
for i in range(0, len(dedges), 2):
    if dedges[i + 1] - dedges[i] > 0.01:
        wall(f"wall_cor_seg{i // 2}", (dedges[i], HY, 0), (dedges[i + 1], HY + T, TOP))
for i, cx in enumerate(L.DOORS_X):
    wall(f"wall_cor_head{i}", (cx - 0.45, HY, 2.1), (cx + 0.45, HY + T, TOP))
# 걸레받이
box("base_front", (-HX, -HY, 0), (-HX + 0.012, HY, 0.1), M["base"], STATIC)
box("base_back", (HX - 0.012, -HY, 0), (HX, HY, 0.1), M["base"], STATIC)
box("base_win", (-HX, -HY, 0), (HX, -HY + 0.012, 0.1), M["base"], STATIC)
for i in range(0, len(dedges), 2):
    if dedges[i + 1] - dedges[i] > 0.01:
        box(f"base_cor{i}", (dedges[i], HY - 0.012, 0), (dedges[i + 1], HY, 0.1), M["base"], STATIC)

# ── 창: 알루미늄 미서기창 두 짝, 안쪽 창턱 ──
GLASS = []
for i, cx in enumerate(L.WINDOWS_X):
    y0, y1 = -HY - T + 0.05, -HY - 0.03
    x0, x1, z0, z1 = cx - 1.2, cx + 1.2, 0.9, 2.3
    fr = 0.05
    for nm, lo, hi in (("l", (x0, y0, z0), (x0 + fr, y1, z1)), ("r", (x1 - fr, y0, z0), (x1, y1, z1)), ("b", (x0, y0, z0), (x1, y1, z0 + fr)), ("t", (x0, y0, z1 - fr), (x1, y1, z1)),
                       ("m", (cx - 0.035, y0, z0), (cx + 0.035, y1, z1)), ("tr", (x0, y0, 1.86), (x1, y1, 1.90))):
        box(f"win{i}_{nm}", lo, hi, M["sash"], STATIC)
    box(f"win{i}_sill", (x0 - 0.05, -HY - 0.03, 0.87), (x1 + 0.05, -HY + 0.07, 0.9), M["sill"], STATIC)
    GLASS.append(box(f"window{i}_glass", (x0 + fr, -HY - T / 2 - 0.004, z0 + fr), (x1 - fr, -HY - T / 2 + 0.004, z1 - fr), M["glass"], DYN))
# 창밖 풍경: 스스로 빛나는 판 (구울 때는 가린다)
sky = quad("sky_backdrop", (0, -HY - 9, 2.6), 46, 20, M["sky"], DYN, normal="+y")
sky.visible_shadow = False  # 해를 가리지 않는다

# ── 문: 나무 미닫이문, 위쪽에 작은 유리 ──
for i, cx in enumerate(L.DOORS_X):
    y = HY + 0.09
    box(f"door{i}", (cx - 0.45, y, 0), (cx + 0.45, y + 0.04, 2.1), M["wood"], STATIC)
    box(f"door{i}_pane", (cx - 0.22, y - 0.004, 1.25), (cx + 0.22, y, 1.75), M["black"], STATIC)
    box(f"door{i}_kick", (cx - 0.45, y - 0.004, 0), (cx + 0.45, y, 0.22), M["alu"], STATIC)
    box(f"door{i}_handle", (cx + 0.34, y - 0.02, 0.95), (cx + 0.37, y, 1.15), M["alu"], STATIC)
    for nm, lo, hi in (("l", (cx - 0.5, HY - 0.01, 0), (cx - 0.45, HY + T, 2.15)), ("r", (cx + 0.45, HY - 0.01, 0), (cx + 0.5, HY + T, 2.15)), ("t", (cx - 0.5, HY - 0.01, 2.1), (cx + 0.5, HY + T, 2.15))):
        box(f"door{i}_frame_{nm}", lo, hi, M["wood2"], STATIC)

# ── 칠판 벽: 칠판, 시계, 방송 스피커 ──
bx = -HX
box("blackboard", (bx, -1.8, 0.9), (bx + 0.02, 1.8, 2.1), M["board"], STATIC, uv=1.0)
bb = bpy.data.objects["blackboard"]
for poly in bb.data.polygons:  # 앞면만 그림 전체가 한 번 깔리게
    if poly.normal.x > 0.9:
        for li in poly.loop_indices:
            co = bb.data.vertices[bb.data.loops[li].vertex_index].co
            bb.data.uv_layers[0].data[li].uv = ((co.y + 1.8) / 3.6, (co.z - 0.9) / 1.2)
for nm, lo, hi in (("t", (bx, -1.84, 2.1), (bx + 0.035, 1.84, 2.14)), ("b", (bx, -1.84, 0.86), (bx + 0.035, 1.84, 0.9)), ("l", (bx, -1.84, 0.86), (bx + 0.035, -1.8, 2.14)), ("r", (bx, 1.8, 0.86), (bx + 0.035, 1.84, 2.14))):
    box("board_frame_" + nm, lo, hi, M["alu"], STATIC)
box("chalk_tray", (bx, -1.8, 0.82), (bx + 0.09, 1.8, 0.86), M["alu"], STATIC)
box("eraser", (bx + 0.02, 1.2, 0.86), (bx + 0.07, 1.36, 0.89), M["wood2"], STATIC)
for k, y in enumerate((0.9, 0.98, 1.05)):
    box(f"chalk{k}", (bx + 0.03, y, 0.86), (bx + 0.04, y + 0.06, 0.87), M["chalk_red" if k == 1 else "chalk"], STATIC)
# 칠판 글씨 (단서): 시험 시간표와 반입 금지
CH = []
CH.append(text("chalk_t1", "4교시 탐구  14:50 ~ 16:37", 0.13, (bx + 0.022, -0.55, 1.78), M["chalk"], DECAL))
CH.append(text("chalk_t2", "반입 금지: 전자기기 일체", 0.10, (bx + 0.022, -0.55, 1.56), M["chalk_red"], DECAL))
CH.append(text("chalk_t3", "제 12 시험실", 0.09, (bx + 0.022, 1.2, 1.95), M["chalk"], DECAL))
# 벽시계
me = bpy.data.meshes.new("r12_clock")
bm = bmesh.new()
bmesh.ops.create_cone(bm, cap_ends=True, segments=28, radius1=0.16, radius2=0.16, depth=0.04, matrix=Matrix.Translation((bx + 0.02, 0, 2.4)) @ Matrix.Rotation(math.pi / 2, 4, "Y"))
bm.to_mesh(me); bm.free()
me.materials.append(M["black"])
STATIC.objects.link(bpy.data.objects.new("clock", me))
me = bpy.data.meshes.new("r12_clock_face")
bm = bmesh.new()
bmesh.ops.create_circle(bm, cap_ends=True, segments=28, radius=0.145, matrix=Matrix.Translation((bx + 0.0405, 0, 2.4)) @ Matrix.Rotation(math.pi / 2, 4, "Y"))
bm.to_mesh(me); bm.free()
me.materials.append(M["white"])
STATIC.objects.link(bpy.data.objects.new("clock_face", me))
for nm, ang, ln, w in (("hour", math.radians(-140), 0.075, 0.012), ("min", math.radians(-240), 0.115, 0.008)):  # 4시 40분
    o = box("clock_" + nm, (0, -w / 2, 0), (0.002, w / 2, ln), M["black"], STATIC)
    o.location = (bx + 0.042, 0, 2.4)
    o.rotation_euler = (ang, 0, 0)
for k in range(12):
    a = k * math.pi / 6
    box(f"clock_tick{k}", (bx + 0.041, math.sin(a) * 0.125 - 0.004, 2.4 + math.cos(a) * 0.125 - 0.004), (bx + 0.042, math.sin(a) * 0.125 + 0.004, 2.4 + math.cos(a) * 0.125 + 0.004), M["black"], STATIC)
# 방송 스피커
box("speaker", (bx, 2.85, 2.3), (bx + 0.16, 3.15, 2.6), M["wood2"], STATIC)
box("speaker_grille", (bx + 0.16, 2.88, 2.33), (bx + 0.164, 3.12, 2.57), M["grille"], STATIC)
# 태극기 대신 급훈 액자 (가상의 학교)

# ── 뒷벽: 게시판, 사물함, 청소도구함 ──
kx = HX
box("notice_frame", (kx - 0.03, -2.14, 0.96), (kx, -0.26, 2.04), M["wood2"], STATIC)
box("notice_board", (kx - 0.034, -2.1, 1.0), (kx - 0.03, -0.3, 2.0), M["cork"], STATIC, uv=0.5)
quad("seat_chart", (kx - 0.036, -1.2, 1.55), 0.42, 0.56, M["chart"], DECAL, normal="-x")
text("chart_title", "시험실 좌석 배치도", 0.028, (kx - 0.038, -1.2, 1.80), M["ink"], DECAL, normal="-x")
for k, (y, z, w, h) in enumerate(((-1.75, 1.6, 0.3, 0.42), (-0.62, 1.68, 0.3, 0.21), (-0.68, 1.3, 0.21, 0.3), (-1.72, 1.2, 0.21, 0.15))):
    o = quad(f"notice_paper{k}", (kx - 0.036, y, z), w, h, M["paper"], DECAL, normal="-x")
    o.rotation_euler.rotate_axis("Z", rng.uniform(-0.03, 0.03))
# 사물함: 세 칸 세 단
lx0, ly0, ly1 = HX - 0.45, -HY + 0.2, -2.3
box("lockers", (lx0, ly0, 0), (HX, ly1, 1.2), M["wood2"], STATIC)
cw = (ly1 - ly0) / 3
for c_ in range(3):
    for r_ in range(3):
        y0, z0 = ly0 + c_ * cw + 0.012, 0.06 + r_ * 0.375 + 0.01
        box(f"locker_door{c_}{r_}", (lx0 - 0.016, y0, z0), (lx0, y0 + cw - 0.024, z0 + 0.355), M["wood"], STATIC)
        box(f"locker_knob{c_}{r_}", (lx0 - 0.028, y0 + cw - 0.07, z0 + 0.16), (lx0 - 0.016, y0 + cw - 0.05, z0 + 0.2), M["alu"], STATIC)
box("locker_top", (lx0 - 0.02, ly0 - 0.01, 1.2), (HX, ly1 + 0.01, 1.225), M["wood"], STATIC)
# 청소도구함
box("broom_cabinet", (HX - 0.5, 2.6, 0), (HX, 3.3, 1.8), M["steel"], STATIC)
box("broom_seam", (HX - 0.502, 2.946, 0.05), (HX - 0.5, 2.954, 1.75), M["black"], STATIC)
for y in (2.9, 2.97):
    box(f"broom_handle{y}", (HX - 0.52, y, 0.95), (HX - 0.5, y + 0.02, 1.1), M["alu"], STATIC)

# ── 형광등: 천장에 붙인 등기구 ──
for i, lx in enumerate((-2.7, 0.0, 2.7)):
    for j, ly in enumerate((-1.8, 1.8)):
        # 흰 몸통 아래로 젖빛 덮개가 내려와 있다: 옆으로도 빛이 새어 천장을 밝힌다
        box(f"lampbody{i}{j}", (lx - 0.63, ly - 0.17, HZ - 0.02), (lx + 0.63, ly + 0.17, HZ - 0.001), M["lamp_body"], STATIC)
        box(f"lamp{i}{j}", (lx - 0.6, ly - 0.14, HZ - 0.075), (lx + 0.6, ly + 0.14, HZ - 0.02), M["lamp"], LAMPS)

# ── 천장 속: 텍스를 밀면 보이는 어둠과 배관 ──
tx, ty = L.TILE24
box("hole24", (tx - 0.9, ty - 0.9, HZ + 0.012), (tx + 0.9, ty + 0.9, HZ + PLEN - 0.001), M["black"], DYN)
hole = bpy.data.objects["hole24"]
bm = bmesh.new(); bm.from_mesh(hole.data)
bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.normal.z < -0.9], context="FACES")
bmesh.ops.reverse_faces(bm, faces=bm.faces)
bm.to_mesh(hole.data); bm.free()
me = bpy.data.meshes.new("r12_plenum_pipe")
bm = bmesh.new()
bmesh.ops.create_cone(bm, cap_ends=False, segments=12, radius1=0.014, radius2=0.014, depth=1.7, matrix=Matrix.Translation((tx, ty - 0.08, HZ + 0.2)) @ Matrix.Rotation(math.pi / 2, 4, "Y"))
bm.to_mesh(me); bm.free()
me.materials.append(M["pipe"])
DYN.objects.link(bpy.data.objects.new("plenum_pipe", me))

# ── Tripo가 만든 소품을 불러와 다듬는다 ──
from mathutils.bvhtree import BVHTree

def tripo(file, name, size, rot_z=0.0, decimate=1.0):
    """glb 하나를 메시 하나로. 바닥 가운데가 원점, size(x, y, z)에 맞춘다. rot_z: 원본의 앞(-Y)을 돌릴 각도."""
    before = set(bpy.data.objects)
    logging.disable(logging.CRITICAL)
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            bpy.ops.import_scene.gltf(filepath=os.path.join(TRIPO, file))
    finally:
        logging.disable(logging.NOTSET)
    new = [o for o in bpy.data.objects if o not in before]
    src = next(o for o in new if o.type == "MESH")
    me = src.data.copy()
    me.transform(src.matrix_world)
    for o in new:
        bpy.data.objects.remove(o, do_unlink=True)
    me.transform(Matrix.Rotation(rot_z, 4, "Z"))
    co = np.empty(len(me.vertices) * 3, np.float32)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    lo, hi = co.min(0), co.max(0)
    me.transform(Matrix.Translation((-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, -lo[2])))
    me.transform(Matrix.Diagonal((size[0] / (hi[0] - lo[0]), size[1] / (hi[1] - lo[1]), size[2] / (hi[2] - lo[2]), 1)))
    me.name = "tripo_" + name
    for m in me.materials:
        m.name = "tripo_" + name
        for n in m.node_tree.nodes:
            if n.type == "TEX_IMAGE" and n.image:
                n.image.name = "tripo_%s_%s" % (name, n.image.name.rsplit("_", 1)[-1])
    if decimate < 1.0:
        tmp = bpy.data.objects.new("tmp", me)
        bpy.context.scene.collection.objects.link(tmp)
        mod = tmp.modifiers.new("d", "DECIMATE")
        mod.ratio = decimate
        me2 = bpy.data.meshes.new_from_object(tmp.evaluated_get(bpy.context.evaluated_depsgraph_get()))
        bpy.data.objects.remove(tmp, do_unlink=True)
        bpy.data.meshes.remove(me)
        me2.name = "tripo_" + name
        me = me2
    return me
def place(name, me, loc, yaw, c):
    o = bpy.data.objects.new(name, me)
    o.location = loc
    o.rotation_euler = (0, 0, yaw)
    c.objects.link(o)
    return o

DX, DY, DZ = L.DESK
DESK = tripo("school_desk.glb", "desk", (DX + 0.03, DY, DZ), -math.pi / 2, decimate=0.6)   # 서랍이 앉는 쪽(+X)을 본다
CHAIR = tripo("school_chair.glb", "chair", (0.43, 0.40, 0.76), -math.pi / 2, decimate=0.6)
PODIUM = tripo("teacher_podium.glb", "podium", (0.5, 0.9, 1.05), math.pi / 2)
LADDER = tripo("step_ladder.glb", "ladder", (0.56 + 0.05, 0.8 + 0.05, 1.25))

for n, x, y in L.seats():
    key = n == 24
    place(f"desk{n:02d}", DESK, (x, y, 0), 0 if key else math.radians(rng.uniform(-1.5, 1.5)), FURN)
    # 시험이 끝나고 일어선 자리: 의자는 조금씩 비뚤다
    out = rng.choice([0, 0, 0.02, 0.05, 0.09])
    place(f"chair{n:02d}", CHAIR, (x + L.CHAIR_DX - 0.04 + out, y + rng.uniform(-0.03, 0.03), 0), math.radians(rng.uniform(-9, 9)), FURN)
place("podium", PODIUM, (-3.75, 0, 0), 0, FURN)

lad = place("ladder_open", LADDER, (L.LADDER[0], L.LADDER[1], 0), 0, DYN)
fold = LADDER.copy()
fold.name = "tripo_ladder_folded"
fold.transform(Matrix.Diagonal((1, 0.16, 1.45, 1)))  # 접으면 얇고 길다
lf = place("ladder_folded", fold, (HX - 0.14, 1.55, 0), math.pi / 2, DYN)
lf.rotation_euler = (0, math.radians(-7), math.pi / 2)

# ── 단서: 가루, 테이프 자국, 사다리 자국, 옛 책상 자국 ──
d24x, d24y = L.DESK24
quad("trace_dust", (d24x - 0.01, d24y + 0.02, DZ + 0.002), 0.30, 0.34, M["dust"], DECAL)
# 상판 밑(서랍 바닥)의 가장 낮은 면을 찾아 그 아래에 붙인다
bm = bmesh.new(); bm.from_mesh(DESK)
tree = BVHTree.FromBMesh(bm)
hit = tree.ray_cast(Vector((0.06, 0.0, 0.25)), Vector((0, 0, 1)))
bm.free()
under = (hit[0].z if hit[0] is not None else DZ - 0.12) - 0.0015
quad("trace_tape", (d24x + 0.06, d24y, under), 0.15, 0.045, M["tape"], DECAL, normal="-z", rot=math.pi / 2)
for i, (fx, fy) in enumerate(L.LADDER_FEET):
    quad(f"trace_ladder_mark{i}", (fx, fy, 0.002), 0.075, 0.075, M["ladder_mark"], DECAL, rot=rng.uniform(-0.1, 0.1))
ox, oy = L.DESK24_OLD
for i, (sx, sy) in enumerate(((-1, -1), (-1, 1), (1, -1), (1, 1))):
    quad(f"trace_old_mark{i}", (ox + sx * (DX / 2 - 0.03), oy + sy * (DY / 2 - 0.04), 0.002), 0.055, 0.055, M["dent"], DECAL)
# 수험번호 스티커: 책상 왼쪽 앞 모서리. 앉은 사람이 읽는 방향.
for n, x, y in L.seats():
    sx_, sy_ = x - DX / 2 + 0.06, y + DY / 2 - 0.09
    quad(f"sticker{n:02d}", (sx_, sy_, DZ + 0.0015), 0.075, 0.11, M["sticker"], DECAL, rot=math.pi / 2)
    t = text(f"sticker_no{n:02d}", f"{n:02d}", 0.03, (sx_ + 0.002, sy_, DZ + 0.0022), M["ink"], DECAL, normal="+z")
    t.rotation_euler = (0, 0, math.pi / 2)

# ── 묶기: 붙박이는 한 덩어리(조명을 굽는다), 등과 데칼도 한 덩어리씩 ──
def join(objs, name):
    objs = list(objs)
    for o in bpy.data.objects:
        o.select_set(False)
    with bpy.context.temp_override(active_object=objs[0], selected_objects=objs, selected_editable_objects=objs):
        bpy.ops.object.join()
    objs[0].name = name
    objs[0].data.name = "r12_" + name
    return objs[0]
static = join(STATIC.objects, "static")
# 보이지 않는 면을 걷어 낸다: 방 바깥을 보는 면, 바닥 밑, 벽 꼭대기. 조명 지도의 자리를 아낀다.
bm = bmesh.new(); bm.from_mesh(static.data); bm.normal_update()
e = 1e-3
def unseen(f):
    c, n = f.calc_center_median(), f.normal
    return ((c.z < -e) or (c.z < e and n.z < -0.5) or (c.z > HZ - e and n.z > 0.5)
            or (c.x < -HX - T + e and n.x < -0.5) or (c.x > HX + T - e and n.x > 0.5)
            or (c.y < -HY - T + e and n.y < -0.5) or (c.y > HY + T - e and n.y > 0.5))
gone = [f for f in bm.faces if unseen(f)]
bmesh.ops.delete(bm, geom=gone, context="FACES")
bm.to_mesh(static.data); bm.free()
join(LAMPS.objects, "lamps")
join(DECAL.objects, "decals")
bpy.context.view_layer.update()
# 조명을 구울 두 번째 UV. 굽고 나서 24번 위 텍스를 떼어 낸다 (bake_room12.py).
lm = static.data.uv_layers.new(name="lm")
static.data.uv_layers.active = lm
for o in bpy.data.objects:
    o.select_set(False)
static.select_set(True)
bpy.context.view_layer.objects.active = static
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.004, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
bpy.ops.object.mode_set(mode="OBJECT")
static.data.uv_layers.active = static.data.uv_layers[0]

def tris(c):
    n = 0
    for o in c.all_objects:
        if o.type == "MESH":
            o.data.calc_loop_triangles()
            n += len(o.data.loop_triangles)
    return n
print("room12 real:", {c.name: (len(c.objects), tris(c)) for c in (STATIC, LAMPS, FURN, DYN, DECAL)}, "desk/chair tris", len(DESK.polygons), len(CHAIR.polygons), "under", round(under, 3))
