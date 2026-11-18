# 살펴보는 소품을 만든다 — 사인펜, 뿔테 안경, 천장 속(장치가 있을 때 / 거둬 간 뒤).
#   먼저: python tools/3d/make_prop_textures.py   (글자 그림)
#   Blender에서: exec(open(r"D:\ai-mystery-game\tools\3d\build_props.py", encoding="utf-8").read())
#   내보내기: export_props()   → public/assets/3d/props/*.glb
# 게임은 glb 안의 이름만 읽는다: detail_* (볼 곳), view_center (눈길의 중심), 재질 이름 *lens_film / *lens (안경알).
# 좌표: Blender Z가 위. 게임 화면에서 정면은 -Y 쪽에서 본 모습이다 (three.js의 +Z).
import bpy, bmesh, math, os, io, contextlib, logging
import numpy as np
from mathutils import Vector, Matrix

HERE = r"D:\ai-mystery-game\tools\3d"
TRIPO = r"D:\ai-mystery-game\tools\_raw\3d\tripo"
TEX = r"D:\ai-mystery-game\tools\_raw\3d\tex"
OUT = r"D:\ai-mystery-game\public\assets\3d\props"

def coll(name):
    c = bpy.data.collections.get(name)
    if c:
        for o in list(c.objects):
            bpy.data.objects.remove(o, do_unlink=True)
    else:
        c = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(c)
    return c

def picture(file):
    im = bpy.data.images.load(os.path.join(TEX, file), check_existing=True)
    im.reload()
    im.pack()
    return im

def noise_image(name, base, amp, size=256, seed=1):
    rng = np.random.default_rng(seed)
    a = rng.normal(0, 1, (size, size, 1)).astype(np.float32)
    for _ in range(2):   # 조금 뭉갠다
        a = (a + np.roll(a, 1, 0) + np.roll(a, 1, 1) + np.roll(a, -1, 0) + np.roll(a, -1, 1)) / 5
    arr = np.clip(np.array(base, np.float32)[None, None, :] + a * amp, 0, 1)
    arr = np.concatenate([arr, np.ones((size, size, 1), np.float32)], -1)
    old = bpy.data.images.get(name)
    if old:
        bpy.data.images.remove(old)
    im = bpy.data.images.new(name, size, size, alpha=False)
    im.pixels.foreach_set(arr.ravel())
    im.pack()
    return im

def pbr(name, color=(0.8, 0.8, 0.8), rough=0.6, metal=0.0, emit=None, emit_strength=1.0, alpha=None):
    m = bpy.data.materials.get(name)
    if m:
        bpy.data.materials.remove(m)
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    def put(sock, v):
        if isinstance(v, bpy.types.Image):
            t = nt.nodes.new("ShaderNodeTexImage")
            t.image = v
            nt.links.new(t.outputs["Color"], b.inputs[sock])
        else:
            b.inputs[sock].default_value = (*v, 1.0) if isinstance(v, tuple) else v
    put("Base Color", color)
    put("Roughness", rough)
    put("Metallic", metal)
    if emit is not None:
        put("Emission Color", emit)
        b.inputs["Emission Strength"].default_value = emit_strength
    if alpha is not None:
        b.inputs["Alpha"].default_value = alpha
        m.surface_render_method = "BLENDED"
    return m

class Part:
    """재질 여러 개를 가진 메시 하나를 조각조각 쌓는다."""
    def __init__(self):
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new("uv")
        self.mats = []
    def mi(self, m):
        if m not in self.mats:
            self.mats.append(m)
        return self.mats.index(m)
    def face(self, pts, m, uvs=None, smooth=False):
        f = self.bm.faces.new([self.bm.verts.new(p) for p in pts])
        f.material_index = self.mi(m)
        f.smooth = smooth
        if uvs:
            for l, uv in zip(f.loops, uvs):
                l[self.uv].uv = uv
        return f
    def box(self, lo, hi, m):
        x0, y0, z0 = lo
        x1, y1, z1 = hi
        P = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
        for q in ((3, 2, 1, 0), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
            self.face([P[i] for i in q], m, [(0, 0), (1, 0), (1, 1), (0, 1)])
    def rod(self, a, b, r0, m, r1=None, seg=12, caps=(True, True), label=False):
        """a에서 b까지의 둥근 막대. label이면 UV가 (길이, 둘레)로 펴진다: 둘레의 가운데(v=0.5)가 -Y 쪽."""
        a, b = Vector(a), Vector(b)
        r1 = r0 if r1 is None else r1
        ax = (b - a).normalized()
        # 축에 수직인 두 방향: e1은 -Y에 가깝게, e2는 +Z에 가깝게 (축이 X일 때 정확히 그렇다)
        e2 = ax.cross(Vector((0, -1, 0)))
        if e2.length < 1e-4:
            e2 = Vector((0, 0, 1))
        e2.normalize()
        if e2.z < 0:
            e2 = -e2
        e1 = ax.cross(e2).normalized()
        ring = lambda c, r: [c + (e1 * math.cos(t) + e2 * math.sin(t)) * r for t in (-math.pi + 2 * math.pi * i / seg for i in range(seg + 1))]
        A, B = ring(a, r0), ring(b, r1)
        for i in range(seg):
            v0, v1 = i / seg, (i + 1) / seg
            self.face([A[i], B[i], B[i + 1], A[i + 1]], m, [(0, v0), (1, v0), (1, v1), (0, v1)] if label else None, smooth=True)
        if caps[0]:
            self.face(list(reversed(A[:-1])), m)
        if caps[1]:
            self.face(B[:-1], m)
    def wire(self, pts, r, m, seg=6):
        for p, q in zip(pts, pts[1:]):
            self.rod(p, q, r, m, seg=seg)
    def quad(self, center, u, v, m):
        c, u, v = Vector(center), Vector(u), Vector(v)
        self.face([c - u - v, c + u - v, c + u + v, c - u + v], m, [(0, 0), (1, 0), (1, 1), (0, 1)])
    def finish(self, name, c):
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        me = bpy.data.meshes.new("prop_" + name)
        self.bm.to_mesh(me)
        self.bm.free()
        for m in self.mats:
            me.materials.append(m)
        o = bpy.data.objects.new(name, me)
        c.objects.link(o)
        return o

def empty(name, loc, c):
    o = bpy.data.objects.new(name, None)
    o.empty_display_size = 0.01
    o.location = loc
    c.objects.link(o)
    return o

def tripo_mesh(file, name):
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
    me.name = "prop_" + name
    for m in me.materials:
        m.name = "prop_" + name
        for n in m.node_tree.nodes:
            if n.type == "TEX_IMAGE" and n.image:
                n.image.name = "prop_%s_%s" % (name, n.image.name.rsplit("_", 1)[-1])
    return me

def coords(me):
    co = np.empty(len(me.vertices) * 3, np.float32)
    me.vertices.foreach_get("co", co)
    return co.reshape(-1, 3)

def base_image(me):
    m = me.materials[0]
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    return b.inputs["Base Color"].links[0].from_node.image

# ── 재질 ──
BLACK = pbr("prop_black", (0.025, 0.025, 0.03), 0.32)
BLACK_MATTE = pbr("prop_black_matte", (0.03, 0.03, 0.035), 0.8)
STEEL = pbr("prop_galv", (0.56, 0.58, 0.60), 0.6, 0.5)
YELLOW = pbr("prop_tie_yellow", (0.86, 0.68, 0.06), 0.5)

# ── 사인펜: 길이 14.6cm. +X가 뚜껑, -X가 뒤 끝. 라벨의 검은 네모가 정면(-Y)을 본다 ──
def build_pen():
    c = coll("prop_pen")
    R = 0.0055
    body = pbr("prop_pen_body", picture("pen_label.png"), 0.34)
    window = pbr("prop_pen_window", (0.05, 0.004, 0.012), 0.06)
    lens = pbr("prop_pen_pinhole", (0.0, 0.0, 0.0), 0.04)
    p = Part()
    p.rod((-0.0595, 0, 0), (0.0355, 0, 0), R, body, seg=40, caps=(False, False), label=True)
    # 뒷마개: 둥글게 줄어드는 검은 마개, 한가운데 바늘구멍
    p.rod((-0.0665, 0, 0), (-0.0595, 0, 0), R * 1.02, BLACK, seg=40, caps=(False, True))
    p.rod((-0.0682, 0, 0), (-0.0665, 0, 0), R * 0.78, BLACK, r1=R * 1.02, seg=40, caps=(True, False))
    p.rod((-0.06835, 0, 0), (-0.0682, 0, 0), 0.0008, lens, seg=16)
    # 뚜껑: 조금 굵고, 끝이 좁아지며, 끝면에 어두운 창
    p.rod((0.0350, 0, 0), (0.0745, 0, 0), R * 1.13, BLACK, seg=40, caps=(True, False))
    p.rod((0.0745, 0, 0), (0.0770, 0, 0), R * 1.13, BLACK, r1=R * 0.86, seg=40, caps=(False, True))
    p.rod((0.0770, 0, 0), (0.07715, 0, 0), 0.0028, window, seg=24)
    # 클립
    p.box((0.0400, -0.0017, R * 1.13 + 0.0009), (0.0720, 0.0017, R * 1.13 + 0.0021), BLACK)
    p.box((0.0660, -0.0017, R * 1.05), (0.0720, 0.0017, R * 1.13 + 0.0009), BLACK)
    p.finish("pen", c)
    empty("detail_cam", (-0.0685, 0, 0), c)
    empty("detail_label", (-0.0595 + 0.095 * (816 / 1408), -R, 0.0), c)
    empty("detail_cap", (0.0775, 0, 0), c)
    empty("view_center", (0.004, 0, 0), c)
    return c

# ── 뿔테 안경: Tripo 모델. 알을 따로 떼어 투명한 재질로. 착용자 기준 왼쪽 알이 +X, 알은 -Y를 본다 ──
def build_glasses():
    c = coll("prop_glasses")
    me = tripo_mesh("horn_glasses.glb", "glasses")
    co = coords(me)
    lo, hi = co.min(0), co.max(0)
    S = 0.142 / (hi[0] - lo[0])
    # 알: 바탕색 그림이 밝은 면 (테는 어둡다)
    img = base_image(me)
    w, h = img.size
    px = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(h, w, 4)
    lum = px[..., :3].mean(-1)
    uv = me.uv_layers[0].data
    film = pbr("prop_lens_film", (0.72, 0.76, 0.95), 0.03, alpha=0.3)
    plain = pbr("prop_lens", (0.9, 0.95, 0.97), 0.03, alpha=0.14)
    me.materials.append(film)
    me.materials.append(plain)
    # 알: 바탕색이 밝은 면에서 시작해, 같은 평면으로 이어진 면까지 번진다 (알에 그려진 어두운 반사 자국도 알이다).
    # 테 안쪽 벽은 면이 꺾여 있어서 거기서 멈춘다.
    front = [poly for poly in me.polygons if poly.center.y < -0.36 and 0.045 < abs(poly.center.x) < 0.445 and 0.02 < poly.center.z < 0.32 and abs(poly.normal.y) > 0.7]
    key = lambda i: tuple(round(c, 4) for c in me.vertices[i].co)
    at = {}
    for poly in front:
        for i in poly.vertices:
            at.setdefault(key(i), []).append(poly.index)
    lens_faces, todo = set(), []
    for poly in front:
        u = sum(uv[i].uv.x for i in poly.loop_indices) / poly.loop_total
        v = sum(uv[i].uv.y for i in poly.loop_indices) / poly.loop_total
        if lum[min(h - 1, int(v % 1.0 * h)), min(w - 1, int(u % 1.0 * w))] > 0.5:
            lens_faces.add(poly.index)
            todo.append(poly.index)
    while todo:
        f = me.polygons[todo.pop()]
        for i in f.vertices:
            for j in at[key(i)]:
                if j not in lens_faces:
                    lens_faces.add(j)
                    todo.append(j)
    cl, cr, nl, nr = Vector(), Vector(), 0, 0
    for j in lens_faces:
        poly = me.polygons[j]
        cen = poly.center
        if cen.x > 0:
            poly.material_index, cl, nl = 1, cl + cen, nl + 1
        else:
            poly.material_index, cr, nr = 2, cr + cen, nr + 1
    # 테는 무광 검정에 가깝게 누른다
    grey = px[..., :3].mean(-1, keepdims=True)
    px[..., :3] = 0.016 + grey * 0.05   # 앞테만 밝게 칠해져 나왔다: 다리와 같은 검정으로 맞춘다
    old = bpy.data.images.get("prop_glasses_frame")
    if old:
        bpy.data.images.remove(old)
    dark = bpy.data.images.new("prop_glasses_frame", w, h, alpha=False)   # 불러온 그림은 묶인 원본이 남아서, 새 그림으로 갈아 끼운다
    dark.pixels.foreach_set(px.ravel())
    dark.pack()
    b = next(n for n in me.materials[0].node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].links[0].from_node.image = dark
    for sock in ("Roughness", "Metallic"):
        for l in list(b.inputs[sock].links):
            me.materials[0].node_tree.links.remove(l)
    b.inputs["Roughness"].default_value, b.inputs["Metallic"].default_value = 0.72, 0.0
    T = Matrix.Scale(S, 4) @ Matrix.Translation((-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, -lo[2]))
    me.transform(T)
    o = bpy.data.objects.new("glasses", me)
    c.objects.link(o)
    tp = co[(co[:, 0] > 0.40) & (co[:, 1] > -0.1) & (co[:, 1] < 0.2)].mean(0)
    P = lambda v, dy=0.0: (T @ Vector(v)) + Vector((0, dy, 0))
    empty("detail_temple", P(tp), c)
    empty("detail_left", P(cl / max(nl, 1), -0.002), c)
    empty("detail_right", P(cr / max(nr, 1), -0.002), c)
    empty("view_center", P(((lo[0] + hi[0]) / 2, -0.25, (lo[2] + hi[2]) / 2)), c)
    return c, (nl, nr)

# ── 천장 속 ──
PIPE_Y, PIPE_Z, DEV_X, DEV_S = 0.10, 0.11, 0.16, 0.36
SLAB_Z = 0.55

def device_mesh():
    """Tripo의 장치(배관 토막 + 기판 + 보조배터리 둘 + 노란 케이블 타이). 배관 축을 X에 맞추고 원점에 둔다."""
    me = tripo_mesh("ceiling_device.glb", "device")
    # 리본에 달린 작은 카메라 모듈은 지운다: 이 장치는 보지 않는다. 눈은 펜에 달려 있다.
    bm = bmesh.new()
    bm.from_mesh(me)
    kill = [f for f in bm.faces if f.calc_center_median().x < -0.275 and f.calc_center_median().z > 0.385]
    bmesh.ops.delete(bm, geom=kill, context="FACES")
    bm.to_mesh(me)
    bm.free()
    co = coords(me)
    low = co[co[:, 2] < 0.20]          # 배관의 아래쪽 (보조배터리보다 낮은 곳)
    d = low - low.mean(0)
    w_, v_ = np.linalg.eigh(d.T @ d)
    ax = Vector([float(x) for x in v_[:, -1]])   # 가장 긴 방향 = 배관의 축. 옆으로 돌아간 것과 기운 것을 함께 편다.
    if ax.x < 0:
        ax = -ax
    me.transform(ax.rotation_difference(Vector((1, 0, 0))).to_matrix().to_4x4())
    co = coords(me)
    # 배관의 굵기와 축: 아래쪽(보조배터리보다 낮은 곳)의 너비가 지름이다. 속이 빈 관이라 원을 맞추면 안쪽 벽에 끌려간다.
    half = co[co[:, 2] < 0.2]
    y0, y1 = np.percentile(half[:, 1], [0.5, 99.5])
    r, cy = (y1 - y0) / 2, (y0 + y1) / 2
    cz = float(np.percentile(co[:, 2], 0.5)) + r
    cx = (half[:, 0].min() + half[:, 0].max()) / 2
    me.transform(Matrix.Scale(DEV_S, 4) @ Matrix.Translation((-cx, -cy, -cz)))
    # 배관 토막은 지운다: 양 끝의 어두운 마개와, 회색 보온재로 칠해진 옆면. 배관은 우리가 길게 다시 놓는다.
    # 노란 케이블 타이와 검은 부품은 색으로 가려 남긴다.
    R = r * DEV_S
    img = base_image(me)
    w, h = img.size
    px = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(h, w, 4)
    bm = bmesh.new()
    bm.from_mesh(me)
    uvl = bm.loops.layers.uv.active
    ends = []
    for f in bm.faces:
        q = f.calc_center_median()
        rad = math.hypot(q.y, q.z)
        if (q.x < -0.150 or q.x > 0.160) and rad < R * 1.2 and q.z < R * 0.9:
            ends.append(f)
            continue
        if rad < R * 1.25 and q.z < R * 0.8:
            u = sum(l[uvl].uv.x for l in f.loops) / len(f.loops)
            v = sum(l[uvl].uv.y for l in f.loops) / len(f.loops)
            cr, cg, cb = px[min(h - 1, int(v % 1.0 * h)), min(w - 1, int(u % 1.0 * w)), :3]
            grey = max(cr, cg, cb) - min(cr, cg, cb) < 0.12 and (cr + cg + cb) / 3 > 0.22
            if grey:
                ends.append(f)
    bmesh.ops.delete(bm, geom=ends, context="FACES")
    bm.to_mesh(me)
    bm.free()
    return me, R

SHELL = {}

def plenum_shell(p, pipe_r, empty_variant):
    if not SHELL:
        SHELL.update(
            tile=pbr("prop_tile_back", noise_image("prop_tile_back", (0.50, 0.47, 0.41), 0.10, seed=3), 0.98),
            concrete=pbr("prop_concrete", noise_image("prop_concrete", (0.20, 0.20, 0.19), 0.05, seed=5), 0.95),
            pipe=pbr("prop_pipe_red", noise_image("prop_pipe_red", (0.50, 0.09, 0.07), 0.05, seed=7), 0.82),   # 붉게 칠한 소방 배관
            white=pbr("prop_box_white", (0.80, 0.80, 0.77), 0.6),
            sticker=pbr("prop_check_sticker", picture("check_sticker.png"), 0.7),
            sticker_empty=pbr("prop_check_sticker_empty", picture("check_sticker_empty.png"), 0.7),
        )
    tile, concrete, lagging, white = SHELL["tile"], SHELL["concrete"], SHELL["pipe"], SHELL["white"]
    sticker = SHELL["sticker_empty" if empty_variant else "sticker"]
    X0, X1, Y0, Y1 = -2.1, 2.1, -1.5, 1.5
    # 텍스의 뒷면 (한 칸 0.6m), 위층 바닥판, 안쪽 보
    for i in range(7):
        for j in range(5):
            x, y = X0 + i * 0.6, Y0 + j * 0.6
            if (i, j) == (3, 0):
                continue   # 지금 고개를 들이민 구멍
            p.face([(x, y, 0), (x + 0.6, y, 0), (x + 0.6, y + 0.6, 0), (x, y + 0.6, 0)], tile, [(0, 0), (1, 0), (1, 1), (0, 1)])
    p.face([(X0, Y0, SLAB_Z), (X0, Y1, SLAB_Z), (X1, Y1, SLAB_Z), (X1, Y0, SLAB_Z)], concrete, [(0, 0), (0, 5), (7, 5), (7, 0)])
    p.box((X0, 1.05, 0.25), (X1, Y1, SLAB_Z), concrete)
    # 경량 천장틀과 달대
    for j in range(6):
        y = Y0 + j * 0.6
        p.box((X0, y - 0.012, 0.0), (X1, y + 0.012, 0.004), STEEL)
        p.box((X0, y - 0.002, 0.0), (X1, y + 0.002, 0.032), STEEL)
    for i in range(8):
        x = X0 + i * 0.6
        p.box((x - 0.012, Y0, 0.0), (x + 0.012, Y1, 0.003), STEEL)
        p.box((x - 0.002, Y0, 0.0), (x + 0.002, Y1, 0.026), STEEL)
    for x in (-1.5, -0.3, 0.9):
        for y in (-0.3, 0.9):
            p.rod((x, y, 0.03), (x, y, SLAB_Z), 0.0028, STEEL, seg=6)
            p.box((x - 0.012, y - 0.004, 0.028), (x + 0.012, y + 0.004, 0.05), STEEL)
    # 배관과 행어
    p.rod((X0, PIPE_Y, PIPE_Z), (X1, PIPE_Y, PIPE_Z), pipe_r * 1.03, lagging, seg=28, label=True)   # Tripo의 배관 토막을 삼킨다
    for x in (-1.2, 0.72, 1.9):
        p.rod((x, PIPE_Y, PIPE_Z + pipe_r), (x, PIPE_Y, SLAB_Z), 0.004, STEEL, seg=6)
        p.rod((x - 0.012, PIPE_Y, PIPE_Z), (x + 0.012, PIPE_Y, PIPE_Z), pipe_r + 0.004, STEEL, seg=24)
    # 화재감지기: 텍스에 박힌 뒷박스, 배관을 타는 중계 박스, 그 앞면의 점검표
    jx = -0.31
    p.rod((jx, PIPE_Y - 0.16, 0.0), (jx, PIPE_Y - 0.16, 0.035), 0.05, white, seg=20)
    p.wire([(jx, PIPE_Y - 0.16, 0.035), (jx, PIPE_Y - 0.15, 0.07), (jx, PIPE_Y - 0.09, PIPE_Z - 0.02), (jx, PIPE_Y - 0.065, PIPE_Z)], 0.007, STEEL, seg=8)
    p.box((jx - 0.085, PIPE_Y - 0.065, PIPE_Z - 0.06), (jx + 0.085, PIPE_Y + 0.065, PIPE_Z + 0.06), white)
    p.quad((jx, PIPE_Y - 0.0655, PIPE_Z), (0.075, 0, 0), (0, 0, 0.05), sticker)
    return (jx, PIPE_Y - 0.068, PIPE_Z)

def build_plenum():
    c = coll("prop_plenum")
    me, pipe_r = device_mesh()
    dev = bpy.data.objects.new("device", me)
    dev.location = (DEV_X, PIPE_Y, PIPE_Z)
    c.objects.link(dev)
    co = coords(me) + np.array([DEV_X, PIPE_Y, PIPE_Z], np.float32)
    top = co[co[:, 2] > PIPE_Z + pipe_r + 0.004]
    board = top[top[:, 0] < DEV_X - 0.01]             # 기판 쪽 (보조배터리는 +X)
    bx0, bx1, by0, bz1 = board[:, 0].min(), board[:, 0].max(), board[:, 1].min(), board[:, 2].max()
    bz = float(np.median(board[:, 2]))
    ties = co[(co[:, 2] < PIPE_Z - pipe_r * 0.5)]      # 배관 아래로 도는 것은 케이블 타이뿐이다
    p = Part()
    sticker_at = plenum_shell(p, pipe_r, False)
    screen = pbr("prop_device_screen", (0, 0, 0), 0.2, emit=picture("device_display.png"), emit_strength=2.2)
    led = pbr("prop_ir_led", (0.05, 0.02, 0.08), 0.2, emit=(0.45, 0.12, 1.0), emit_strength=1.4)
    card = pbr("prop_card_label", (0.82, 0.80, 0.74), 0.6)
    tape = pbr("prop_tape_black", (0.02, 0.02, 0.02), 0.45)
    # 작은 화면: 기판 앞 모서리에 비스듬히 선다
    sx, sy = (bx0 + bx1) / 2 + 0.006, by0 - 0.004
    u, v, n = Vector((0.017, 0, 0)), Vector((0, 0.0055, 0.0065)), Vector((0, -0.77, 0.64))
    p.box((sx - 0.019, sy - 0.002, bz - 0.004), (sx + 0.019, sy + 0.006, bz + 0.004), BLACK_MATTE)
    cen = Vector((sx, sy - 0.001, bz + 0.012))
    p.quad(cen - n * 0.0012, u * 1.1, v * 1.25, BLACK_MATTE)
    p.quad(cen, u, v, screen)
    # 메모리 카드: 기판 옆구리(앞쪽)에 꽂혀 조금 나와 있다
    kx = bx0 + 0.014
    p.box((kx - 0.0055, by0 - 0.009, bz - 0.0045), (kx + 0.0055, by0 + 0.004, bz - 0.0033), BLACK_MATTE)
    p.box((kx - 0.0045, by0 - 0.0085, bz - 0.0033), (kx + 0.0045, by0 - 0.002, bz - 0.0031), card)
    # 빛 신호 장치: 기판에서 내려와 텍스 구멍 위에 검은 테이프로 붙어 있다
    ex, ey = DEV_X - 0.02, PIPE_Y - 0.19
    p.wire([(bx1 - 0.01, by0 + 0.004, bz), (bx1 - 0.005, by0 - 0.03, bz - 0.01), (ex + 0.02, ey + 0.06, 0.05), (ex + 0.004, ey + 0.012, 0.016), (ex, ey, 0.012)], 0.0016, BLACK_MATTE)
    p.box((ex - 0.009, ey - 0.009, 0.0), (ex + 0.009, ey + 0.009, 0.011), BLACK)
    p.rod((ex, ey, 0.011), (ex, ey, 0.0135), 0.003, led, seg=12)
    p.box((ex - 0.03, ey - 0.012, 0.0), (ex - 0.009, ey + 0.012, 0.0012), tape)
    p.box((ex + 0.009, ey - 0.012, 0.0), (ex + 0.03, ey + 0.012, 0.0012), tape)
    # 마이크: 가는 선이 배관 위를 타고 칠판 쪽(-X)으로 가서, 타이로 묶인 작은 마이크로 끝난다
    mx, my, mz = -0.13, PIPE_Y - 0.012, PIPE_Z + pipe_r * 1.03 + 0.0052
    p.wire([(bx0 + 0.004, by0 + 0.012, bz), (bx0 - 0.012, by0 + 0.016, bz - 0.012), (bx0 - 0.03, my + 0.004, mz + 0.004), (-0.06, my - 0.004, mz - 0.003), (mx + 0.03, my, mz - 0.001), (mx + 0.014, my, mz)], 0.0012, BLACK_MATTE)
    p.rod((mx + 0.014, my, mz), (mx - 0.02, my, mz), 0.0048, BLACK, seg=12)
    p.rod((mx - 0.02, my, mz), (mx - 0.027, my, mz), 0.0053, STEEL, seg=12)
    p.rod((mx, PIPE_Y, PIPE_Z), (mx + 0.0035, PIPE_Y, PIPE_Z), pipe_r * 1.03 + 0.0015, YELLOW, seg=28)   # 배관에 두른 타이
    p.box((mx - 0.001, my - 0.006, mz + 0.003), (mx + 0.0045, my + 0.006, mz + 0.0062), YELLOW)
    p.finish("plenum", c)
    tx = float(np.median(ties[ties[:, 0] < DEV_X][:, 0])) if len(ties) else DEV_X - 0.1
    empty("detail_device", ((bx0 + bx1) / 2 + 0.03, PIPE_Y, bz1 + 0.004), c)
    empty("detail_power", tuple(cen), c)
    empty("detail_card", (kx, by0 - 0.007, bz - 0.004), c)
    empty("detail_ties", (tx, PIPE_Y - pipe_r * 0.9, PIPE_Z - pipe_r * 0.3), c)
    empty("detail_mic", (mx - 0.02, my, mz + 0.004), c)
    empty("detail_sticker", sticker_at, c)
    empty("view_center", (0.0, PIPE_Y, 0.30), c)
    return c, dict(pipe_r=round(pipe_r, 4), board=[round(float(x), 3) for x in (bx0, bx1, by0, bz, bz1)], tie_x=round(tx, 3))

def build_plenum_empty(pipe_r, tie_xs):
    """토요일 새벽 5시가 지난 뒤: 장치는 없고, 잘린 케이블 타이 끝만 남았다."""
    c = coll("prop_plenum_empty")
    p = Part()
    sticker_at = plenum_shell(p, pipe_r, True)
    R = pipe_r + 0.002
    for k, x in enumerate(tie_xs):
        a0 = 0.5 + 0.35 * k   # 잘린 자리가 저마다 다르다
        pts = [(x, PIPE_Y - R * math.cos(t), PIPE_Z + R * math.sin(t)) for t in np.linspace(a0, a0 + 4.3, 14)]
        p.wire(pts, 0.0018, YELLOW, seg=5)
        e = Vector(pts[-1])
        p.wire([e, e + Vector((0.004, -0.012, -0.016))], 0.0018, YELLOW, seg=5)
    p.finish("plenum_empty", c)
    empty("detail_ties", (tie_xs[1], PIPE_Y - R, PIPE_Z), c)
    empty("detail_sticker", sticker_at, c)
    empty("view_center", (0.0, PIPE_Y, 0.30), c)
    return c

def build_all():
    info = {}
    build_pen()
    _, info["lens_faces"] = build_glasses()
    _, info["plenum"] = build_plenum()
    tx = info["plenum"]["tie_x"]
    build_plenum_empty(info["plenum"]["pipe_r"], [tx, tx + 0.085, tx + 0.2])
    return info

def export_props():
    exec(open(os.path.join(HERE, "export_glb.py"), encoding="utf-8").read(), globals())
    os.makedirs(OUT, exist_ok=True)
    out = {}
    for cname, file, webp in (("prop_pen", "pen.glb", 90), ("prop_glasses", "horn_glasses.glb", 85), ("prop_plenum", "plenum.glb", 85), ("prop_plenum_empty", "plenum_empty.glb", 85)):
        # Blender는 파일 안에서 이름이 겹치지 못한다(view_center.001). 내보내는 컬렉션이 제 이름을 갖도록 돌려 준다.
        for o in bpy.data.collections[cname].objects:
            base = o.name.split(".")[0]
            if o.name != base:
                other = bpy.data.objects.get(base)
                if other:
                    other.name = base + ".swap"
                o.name = base
        out[file] = export_collection(cname, os.path.join(OUT, file), draco=True, apply=False, webp=webp)
    return out

def preview(cname, cam_loc, target, path, lens=50, torch=None, res=(1280, 720)):
    """소품 하나만 보이게 하고 한 장 찍는다 (확인용)."""
    sc = bpy.context.scene
    def walk(l):
        yield l
        for ch in l.children:
            yield from walk(ch)
    for l in walk(bpy.context.view_layer.layer_collection):
        if l.name.startswith("prop_") or l.name in ("room12_real", "room12", "tripo_raw", "char_bae"):
            l.exclude = l.name != cname
    cam = bpy.data.objects.get("props_cam")
    if cam is None:
        cam = bpy.data.objects.new("props_cam", bpy.data.cameras.new("props_cam"))
        sc.collection.objects.link(cam)
    cam.data.type, cam.data.lens, cam.data.clip_start = "PERSP", lens, 0.005
    cam.location = cam_loc
    cam.rotation_euler = (Vector(target) - Vector(cam_loc)).to_track_quat("-Z", "Y").to_euler()
    sc.camera = cam
    lamp = bpy.data.objects.get("props_torch")
    if lamp is None:
        lamp = bpy.data.objects.new("props_torch", bpy.data.lights.new("props_torch", "SPOT"))
        sc.collection.objects.link(lamp)
    bg = next(n for n in sc.world.node_tree.nodes if n.type == "BACKGROUND")
    sun = bpy.data.objects.get("r12_sun")
    if torch:
        lamp.hide_render = False
        lamp.data.energy, lamp.data.spot_size, lamp.data.spot_blend = torch, 0.7, 0.6
        lamp.location = Vector(cam_loc) + Vector((0.08, 0, -0.06))
        lamp.rotation_euler = cam.rotation_euler
        bg.inputs[0].default_value, bg.inputs[1].default_value = (0.02, 0.02, 0.03, 1), 0.3
        if sun:
            sun.hide_render = True
    else:
        lamp.hide_render = True
        bg.inputs[0].default_value, bg.inputs[1].default_value = (0.75, 0.76, 0.8, 1), 1.0
        if sun:
            sun.hide_render = False
    sc.render.engine = "CYCLES"
    sc.cycles.samples = 48
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.image_settings.file_format = "PNG"
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)

# ── 인물: Tripo에서 리깅과 동작까지 끝낸 glb를 불러와, 메시와 뼈대만 남겨 다시 싼다 ──
def build_char(file, name):
    c = coll("char_" + name)
    for a in list(bpy.data.actions):
        if a.name.startswith(name + "_"):
            bpy.data.actions.remove(a)
    before, acts = set(bpy.data.objects), set(bpy.data.actions)
    logging.disable(logging.CRITICAL)
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            bpy.ops.import_scene.gltf(filepath=os.path.join(TRIPO, file))
    finally:
        logging.disable(logging.NOTSET)
    keep = []
    for o in [o for o in bpy.data.objects if o not in before]:
        if o.type in ("MESH", "ARMATURE") and not o.name.startswith("Icosphere"):
            for col in list(o.users_collection):
                col.objects.unlink(o)
            c.objects.link(o)
            o.name = name + ("_rig" if o.type == "ARMATURE" else "_body")
            keep.append(o)
        elif o.parent is None or o.name.startswith("Icosphere"):
            pass
    for o in [o for o in bpy.data.objects if o not in before and o not in keep]:
        if o.type not in ("MESH", "ARMATURE") and any(ch in keep for ch in o.children_recursive):
            for col in list(o.users_collection):
                col.objects.unlink(o)
            c.objects.link(o)   # 뼈대를 품은 빈 부모는 남긴다
        else:
            bpy.data.objects.remove(o, do_unlink=True)
    clips = []
    for a in [a for a in bpy.data.actions if a not in acts]:
        clips.append((a.name, round(a.frame_range[1] - a.frame_range[0])))
    return c, clips

def export_char(name):
    exec(open(os.path.join(HERE, "export_glb.py"), encoding="utf-8").read(), globals())
    out = os.path.join(os.path.dirname(OUT), "chars", name + ".glb")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    return export_collection("char_" + name, out, draco=True, apply=False, webp=85, anim=True)
