# 살펴보는 소품을 만든다 — 사인펜, 뿔테 안경, 천장 속(장치가 있을 때 / 거둬 간 뒤).
#   먼저: python tools/3d/make_prop_textures.py   (글자 그림)
#   Blender에서: exec(open(r"D:\ai-mystery-game\tools\3d\build_props.py", encoding="utf-8").read())
#   내보내기: export_props()   → public/assets/3d/props/*.glb
#   build_all() -> build_inspect_props() -> export_props(INSPECT_PROPS): the three prologue inspect props at the end of this file
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

def export_props(which=None):
    exec(open(os.path.join(HERE, "export_glb.py"), encoding="utf-8").read(), globals())
    os.makedirs(OUT, exist_ok=True)
    out = {}
    for cname, file, webp in which or (("prop_pen", "pen.glb", 90), ("prop_glasses", "horn_glasses.glb", 85), ("prop_plenum", "plenum.glb", 85), ("prop_plenum_empty", "plenum_empty.glb", 85)):
        # Blender는 파일 안에서 이름이 겹치지 못한다(view_center.001). 내보내는 컬렉션이 제 이름을 갖도록 돌려 준다.
        for o in bpy.data.collections[cname].objects:
            base = o.name.split(".")[0]
            if o.name != base:
                other = bpy.data.objects.get(base)
                if other:
                    other.name = base + ".swap"
                o.name = base
        todo = [bpy.context.view_layer.layer_collection]         # preview()가 꺼 둔 컬렉션은 고를 수 없다: 다시 켠다
        while todo:
            l = todo.pop()
            if l.name == cname:
                l.exclude = False
            todo.extend(l.children)
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

# ═══════════ 프롤로그의 열람 소품: 택배 상자, 새 필통, 수학 연습지 ═══════════
#   먼저: python tools/3d/make_prologue_textures.py   (운송장, 쪽지, 수험표, 연습지와 그 광택, 골판지, 천)
#   build_inspect_props() → export_props(INSPECT_PROPS)
# 단서가 되는 것(글자, 광택, 왼쪽 알)은 모두 손으로 만든다. 게임이 읽는 이름은 detail_* 과 view_center, 재질 이름 *lens* 뿐이다.
import json
from mathutils import noise

def img_mat(name, file, rough=0.8, metal=0.0, rough_file=None, normal_file=None, strength=1.0):
    """그림을 바탕색으로 쓰는 재질. rough_file은 거칠기 그림(흑백), normal_file은 법선 그림."""
    m = pbr(name, picture(file) if file else (0.8, 0.8, 0.8), rough, metal)
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    if rough_file:
        im = picture(rough_file)
        im.colorspace_settings.name = "Non-Color"
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = im
        sep = nt.nodes.new("ShaderNodeSeparateColor")           # glTF는 거칠기를 초록 채널에서 읽는다
        nt.links.new(t.outputs[0], sep.inputs[0])
        nt.links.new(sep.outputs[1], b.inputs["Roughness"])
    if normal_file:
        im = picture(normal_file)
        im.colorspace_settings.name = "Non-Color"
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = im
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nm.inputs[0].default_value = strength
        nt.links.new(t.outputs[0], nm.inputs[1])
        nt.links.new(nm.outputs[0], b.inputs["Normal"])
    return m

def base_color(m, color):
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    for l in list(b.inputs["Base Color"].links):
        m.node_tree.links.remove(l)
    b.inputs["Base Color"].default_value = (*color, 1.0)
    return m

def finish_weld(p, name, c, angle=38, M=None):
    """겹친 점을 붙여 매끈하게 굴리고, 꺾인 모서리만 날카롭게 남긴다."""
    bmesh.ops.remove_doubles(p.bm, verts=p.bm.verts, dist=1e-6)
    o = p.finish(name, c)
    o.data.set_sharp_from_angle(angle=math.radians(angle))
    if M is not None:
        o.matrix_world = M
    return o

def lathe(p, prof, m, seg=32):
    """(z, r)의 윤곽을 Z축 둘레로 돌린다. UV는 (둘레, 윤곽을 따라간 길이)."""
    L = [0.0]
    for (z0, r0), (z1, r1) in zip(prof, prof[1:]):
        L.append(L[-1] + math.hypot(z1 - z0, r1 - r0))
    ring = lambda z, r: [Vector((r * math.cos(2 * math.pi * i / seg), r * math.sin(2 * math.pi * i / seg), z)) for i in range(seg + 1)]
    R = [ring(z, r) for z, r in prof]
    for k in range(len(prof) - 1):
        v0, v1 = L[k] / L[-1], L[k + 1] / L[-1]
        for i in range(seg):
            u0, u1 = i / seg, (i + 1) / seg
            if prof[k][1] < 1e-7:
                p.face([R[k][i], R[k + 1][i], R[k + 1][i + 1]], m, [(u0, v0), (u0, v1), (u1, v1)], smooth=True)
            elif prof[k + 1][1] < 1e-7:
                p.face([R[k][i], R[k + 1][i], R[k][i + 1]], m, [(u0, v0), (u0, v1), (u1, v0)], smooth=True)
            else:
                p.face([R[k][i], R[k + 1][i], R[k + 1][i + 1], R[k][i + 1]], m, [(u0, v0), (u0, v1), (u1, v1), (u1, v0)], smooth=True)

def disc(p, z, r, m, seg=32):
    p.face([Vector((r * math.cos(2 * math.pi * i / seg), r * math.sin(2 * math.pi * i / seg), z)) for i in range(seg)], m,
           [(0.5 + 0.5 * math.cos(2 * math.pi * i / seg), 0.5 + 0.5 * math.sin(2 * math.pi * i / seg)) for i in range(seg)])

def obox(p, M, lo, hi, m):
    """기울어진 상자: 자리 행렬 M을 거친 상자."""
    x0, y0, z0 = lo
    x1, y1, z1 = hi
    P = [M @ Vector(q) for q in ((x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1))]
    for q in ((3, 2, 1, 0), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
        p.face([P[i] for i in q], m, [(0, 0), (1, 0), (1, 1), (0, 1)])

def rrect(w, d, r, n=6):
    """모서리가 둥근 네모의 윤곽 (반시계, 오른쪽 가운데에서 시작)."""
    pts = []
    for cx, cy, a0 in ((w / 2 - r, d / 2 - r, 0), (-w / 2 + r, d / 2 - r, 90), (-w / 2 + r, -d / 2 + r, 180), (w / 2 - r, -d / 2 + r, 270)):
        for i in range(n + 1):
            a = math.radians(a0 + 90 * i / n)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts

def smooth01(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)

# ── 택배 상자: 날개를 젖힌 골판지 상자(30 x 22 x 11cm). 구겨 넣은 종이 위에 도장, 인주통, 쪽지. 운송장은 앞면에 ──
def build_parcel():
    c = coll("prop_parcel")
    W, D, H, T, F = 0.30, 0.22, 0.11, 0.004, 0.106
    Z0 = 0.072                                                   # 물건이 놓인 종이의 높이
    card = img_mat("prop_cardboard", "pl_cardboard.png", 0.9)
    edge = img_mat("prop_cardboard_edge", "pl_cardboard_edge.png", 0.95)
    tape = pbr("prop_tape", (0.46, 0.33, 0.17), 0.2)
    p = Part()
    def panel(o, u, v, t=T):
        """골판지 한 장. o에서 u, v로 펼친 면이 겉이고, 두께는 그 뒤로 간다. 잘린 단면에는 골이 보인다."""
        o, u, v = Vector(o), Vector(u), Vector(v)
        n = u.cross(v).normalized()
        A = [o, o + u, o + u + v, o + v]
        B = [q - n * t for q in A]
        lu, lv = u.length / 0.25, v.length / 0.25
        p.face(A, card, [(0, 0), (lu, 0), (lu, lv), (0, lv)])
        p.face(B, card, [(0.31, 0.17), (0.31 + lu, 0.17), (0.31 + lu, 0.17 + lv), (0.31, 0.17 + lv)])
        for i in range(4):
            j = (i + 1) % 4
            L = (A[j] - A[i]).length / 0.032
            p.face([A[i], A[j], B[j], B[i]], edge, [(0, 1), (L, 1), (L, 0), (0, 0)])
        return n
    panel((-W / 2 + T, D / 2 - T, 0), (W - 2 * T, 0, 0), (0, -(D - 2 * T), 0))            # 바닥
    panel((-W / 2, -D / 2, 0), (W, 0, 0), (0, 0, H))                                       # 앞
    panel((W / 2, D / 2, 0), (-W, 0, 0), (0, 0, H))                                        # 뒤
    panel((-W / 2, D / 2 - T, 0), (0, -(D - 2 * T), 0), (0, 0, H))                         # 왼쪽
    panel((W / 2, -D / 2 + T, 0), (0, D - 2 * T, 0), (0, 0, H))                            # 오른쪽
    # 날개: 뒤는 세워 젖히고, 양옆은 비스듬히 벌어지고, 앞은 안으로 접어 넣었다(그래서 앞면의 운송장이 가려지지 않는다)
    rad = math.radians
    tb = rad(112)
    vb = Vector((0, -math.cos(tb), math.sin(tb)))
    nb = panel((W / 2, D / 2, H), (-W, 0, 0), vb * F)
    tr = rad(127)
    panel((W / 2, -D / 2 + 0.003, H), (0, D - 0.006, 0), Vector((-math.cos(tr), 0, math.sin(tr))) * F)
    tl = rad(142)
    panel((-W / 2, D / 2 - 0.003, H), (0, -(D - 0.006), 0), Vector((math.cos(tl), 0, math.sin(tl))) * F)
    tf = rad(-83)
    panel((-W / 2 + T + 0.003, -D / 2 + 2 * T + 0.0015, H - 0.001), (W - 2 * T - 0.006, 0, 0), Vector((0, math.cos(tf), math.sin(tf))) * F)
    # 테이프: 가운데 이음매를 따라 붙였던 것이 양옆 벽으로 내려와 있고, 칼로 가른 반쪽이 뒷날개 끝에 남았다
    for s in (1, -1):
        p.quad((s * (W / 2 + 0.0004), 0, H - 0.029), (0, 0.024, 0), (0, 0, 0.029), tape)
        p.quad((s * (W / 2 + 0.0004), 0, 0.021), (0, 0.024, 0), (0, 0, 0.021), tape)
    p.quad(Vector((0, D / 2, H)) + vb * (F - 0.0122) + nb * 0.0004, (W / 2 - 0.0005, 0, 0), vb * 0.012, tape)
    # 운송장: 손으로 붙여 조금 기울었다
    a = rad(2.2)
    p.quad((-0.048, -D / 2 - 0.0005, 0.057), Vector((math.cos(a), 0, math.sin(a))) * 0.055, Vector((-math.sin(a), 0, math.cos(a))) * 0.031, img_mat("prop_waybill", "pl_waybill.png", 0.5))
    p.finish("parcel_box", c)

    # 물건의 자리
    axis = Vector((0.55, 0.80, -0.16)).normalized()             # 도장: 새긴 면에서 손잡이 쪽으로
    PF = Vector((-0.106, -0.046, Z0 + 0.0215))                   # 새긴 면의 한가운데
    TIN = Vector((0.070, 0.040, Z0 - 0.002))
    MEMO = Vector((0.014, -0.030, Z0 + 0.0065))
    psi, phi = rad(18), rad(57)                                 # 뚜껑이 기댄 방향과 기울기
    d = Vector((math.cos(psi), math.sin(psi), 0))
    LIDZ = Z0 - 0.0015
    LIDB = TIN + d * (0.0270 + (TIN.z + 0.0140 - LIDZ) / math.tan(phi) + 0.0008)
    LIDB.z = LIDZ
    rest = [((PF + axis * 0.010).xy, 0.022, Z0 + 0.005), ((PF + axis * 0.056).xy, 0.026, Z0 - 0.007), (TIN.xy, 0.036, Z0 - 0.002), (LIDB.xy, 0.022, Z0 - 0.004), (MEMO.xy, 0.052, Z0)]

    # 구겨 넣은 누런 종이
    kraft = pbr("prop_kraft", noise_image("prop_kraft", (0.62, 0.50, 0.35), 0.03, 256, 3), 0.96)
    NX, NY = 46, 34
    x0, x1, y0, y1 = -W / 2 + T + 0.001, W / 2 - T - 0.001, -D / 2 + 0.022, D / 2 - T - 0.001
    rng = np.random.default_rng(12)
    G = []
    for j in range(NY + 1):
        row = []
        for i in range(NX + 1):
            x, y = x0 + (x1 - x0) * i / NX, y0 + (y1 - y0) * j / NY
            if 0 < i < NX:
                x += rng.uniform(-0.0018, 0.0018)
            if 0 < j < NY:
                y += rng.uniform(-0.0018, 0.0018)
            q = Vector((x * 21, y * 21, 1.7))
            cr = (1 - abs(noise.noise(q))) * 0.020 + (1 - abs(noise.noise(q * 2.9 + Vector((5, 3, 0))))) * 0.008 + rng.uniform(-0.001, 0.001)
            z = Z0 - 0.022 + cr
            for cen, r, zi in rest:
                w = 1 - smooth01(r * 0.75, r + 0.018, (Vector((x, y)) - cen).length)
                z = z * (1 - w) + (zi - 0.0006 + cr * 0.06) * w
            row.append(Vector((x, y, z)))
        G.append(row)
    pp = Part()
    uvk = lambda q: (q.x / 0.12, q.y / 0.12)
    for j in range(NY):
        for i in range(NX):
            a_, b_, c_, d_ = G[j][i], G[j][i + 1], G[j + 1][i + 1], G[j + 1][i]
            tris = ((a_, b_, c_), (a_, c_, d_)) if abs(a_.z - c_.z) < abs(b_.z - d_.z) else ((a_, b_, d_), (b_, c_, d_))
            for t in tris:
                pp.face(list(t), kraft, [uvk(q) for q in t])
    pp.finish("parcel_paper", c)

    # 도장: 닳은 나무 손잡이. 새긴 면에는 인주가 말라붙어 있다
    wood = img_mat("prop_stamp_wood", "pl_stamp_wood.png", 0.46)
    sp = Part()
    lathe(sp, [(0.0, 0.0150), (0.0006, 0.0153), (0.0150, 0.0153), (0.0166, 0.0146), (0.0182, 0.0128), (0.0215, 0.0102), (0.0280, 0.0088), (0.0340, 0.0084),
               (0.0400, 0.0093), (0.0455, 0.0118), (0.0510, 0.0150), (0.0570, 0.0167), (0.0625, 0.0163), (0.0675, 0.0140), (0.0708, 0.0100), (0.0724, 0.0055), (0.0730, 0.0)], wood)
    disc(sp, 0.0, 0.0150, img_mat("prop_stamp_face", "pl_stamp_face.png", 0.62))
    finish_weld(sp, "parcel_stamp", c, 50, Matrix.Translation(PF) @ axis.to_track_quat("Z", "Y").to_matrix().to_4x4() @ Matrix.Rotation(rad(40), 4, "Z"))

    # 인주통: 놋쇠. 뚜껑은 옆에 기대어 있다
    brass = pbr("prop_brass", noise_image("prop_brass", (0.78, 0.58, 0.24), 0.035, 256, 5), 0.3, 1.0)
    brass_in = pbr("prop_brass_in", (0.42, 0.22, 0.12), 0.5, 0.7)
    tp = Part()
    lathe(tp, [(0.0, 0.0), (0.0, 0.0258), (0.0012, 0.0270), (0.0128, 0.0270), (0.0138, 0.0266), (0.0140, 0.0260), (0.0138, 0.0254), (0.0128, 0.0250), (0.0104, 0.0250)], brass, 40)
    disc(tp, 0.0104, 0.0250, img_mat("prop_ink_pad", "pl_ink_pad.png", 0.8, rough_file="pl_ink_pad_rough.png"), 40)
    finish_weld(tp, "parcel_ink", c, 50, Matrix.Translation(TIN))
    lp = Part()
    lathe(lp, [(0.0, 0.0277), (0.0, 0.0287), (0.0060, 0.0287), (0.0070, 0.0280), (0.0074, 0.0268), (0.0075, 0.0215), (0.0070, 0.0208), (0.0070, 0.0196), (0.0075, 0.0189), (0.0077, 0.0)], brass, 40)
    lathe(lp, [(0.0, 0.0277), (0.0064, 0.0277), (0.0066, 0.0)], brass_in, 40)
    s_up = -d * math.cos(phi) + Vector((0, 0, math.sin(phi)))    # 뚜껑이 기대어 올라가는 방향
    n_top = d * math.sin(phi) + Vector((0, 0, math.cos(phi)))    # 뚜껑의 윗면이 보는 방향
    t_h = Vector((0, 0, 1)).cross(d)
    R3 = Matrix((t_h, n_top.cross(t_h), n_top)).transposed()
    finish_weld(lp, "parcel_ink_lid", c, 50, Matrix.Translation(LIDB + s_up * 0.0287) @ R3.to_4x4())

    # 쪽지: 한 번 접었던 종이
    mp = Part()
    note = img_mat("prop_memo", "pl_memo.png", 0.86)
    hw, hh = 0.046, 0.023
    mp.face([(-hw, -hh, 0.0008), (0, -hh, 0.0044), (0, hh, 0.0050), (-hw, hh, 0.0016)], note, [(0, 0), (0.5, 0), (0.5, 1), (0, 1)])
    mp.face([(0, -hh, 0.0044), (hw, -hh, 0.0012), (hw, hh, 0.0026), (0, hh, 0.0050)], note, [(0.5, 0), (1, 0), (1, 1), (0.5, 1)])
    mo = mp.finish("parcel_memo", c)
    mo.matrix_world = Matrix.Translation(MEMO) @ Matrix.Rotation(rad(7), 4, "Z") @ Matrix.Rotation(rad(13), 4, "X")

    empty("detail_stamp", PF + axis * 0.034 + Vector((0, 0, 0.019)), c)
    empty("detail_ink", TIN + Vector((0, 0, 0.018)), c)
    empty("detail_memo", MEMO + Vector((0, 0, 0.008)), c)
    empty("view_center", (0, 0, 0.07), c)
    return c

# ── 새 필통: 지퍼를 끝까지 열어 펼친 천 필통. 뚜껑의 주머니에 수험표, 몸통에 다리를 접은 뿔테 안경과 사인펜 ──
def folded_glasses():
    """안경의 다리를 접은 메시. 다리를 앞테 바로 뒤에서 잘라 내어 안쪽으로 돌린다."""
    src = next(o for o in bpy.data.collections["prop_glasses"].objects if o.type == "MESH").data
    me = src.copy()
    me.name = "prop_case_glasses"
    bm = bmesh.new()
    bm.from_mesh(me)
    CUT = -0.052
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, CUT, 0), plane_no=(0, 1, 0), clear_inner=False, clear_outer=False)
    on = lambda v: abs(v.co.y - CUT) < 1e-5 and abs(v.co.x) > 0.058
    bmesh.ops.split_edges(bm, edges=[e for e in bm.edges if on(e.verts[0]) and on(e.verts[1])])
    bm.faces.ensure_lookup_table()
    temple = {v for f in bm.faces if f.calc_center_median().y > CUT and abs(f.calc_center_median().x) > 0.04 for v in f.verts}
    side = {s: [v for v in temple if v.co.x * s > 0] for s in (-1, 1)}
    bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if e.is_boundary and on(e.verts[0]) and on(e.verts[1])], sides=0)
    for s, deg, back in ((-1, 83, 0.0010), (1, 77, 0.0040)):    # 오른쪽 다리를 먼저 접고, 왼쪽 다리가 그 위에 얹힌다
        vs = side[s]
        bmesh.ops.rotate(bm, cent=(s * 0.0685, CUT, 0), matrix=Matrix.Rotation(math.radians(s * deg), 3, "Z"), verts=vs)
        bmesh.ops.translate(bm, vec=(0, back, 0), verts=vs)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    return me, len(temple)

def build_pencilcase():
    c = coll("prop_pencilcase")
    W, D, Hh, R, T, FL, S = 0.225, 0.100, 0.020, 0.018, 0.0035, 0.003, 0.02
    rad = math.radians
    cloth = img_mat("prop_case_cloth", "pl_fabric.png", 0.93, normal_file="pl_fabric_n.png", strength=0.9)
    lining = base_color(img_mat("prop_case_lining", None, 0.82, normal_file="pl_fabric_n.png", strength=0.35), (0.115, 0.135, 0.185))
    pocket = base_color(img_mat("prop_case_pocket", None, 0.8, normal_file="pl_fabric_n.png", strength=0.35), (0.085, 0.100, 0.145))
    ztape = pbr("prop_case_ztape", (0.030, 0.040, 0.070), 0.88)
    metal = pbr("prop_case_zip", (0.34, 0.35, 0.37), 0.42, 1.0)
    MB = Matrix.Translation((0, -0.006 - D / 2, 0))                                           # 몸통
    ML = Matrix.Translation((0, 0.006, 0)) @ Matrix.Rotation(rad(9), 4, "X") @ Matrix.Translation((0, D / 2, 0))   # 뚜껑: 끝이 조금 들려 있다
    p = Part()
    out, inn, bot, mid = rrect(W, D, R), rrect(W - 2 * T, D - 2 * T, R - T), rrect(W - 0.007, D - 0.007, R - 0.0035), rrect(W - T, D - T, R - T / 2, 10)
    n = len(out)
    per = [0.0]
    for k in range(n):
        per.append(per[-1] + (Vector(out[(k + 1) % n]) - Vector(out[k])).length)
    def tray(M, hinge):
        P = lambda q, z: M @ Vector((q[0], q[1], z))
        p.face([P(q, 0) for q in reversed(bot)], cloth, [(q[0] / S, q[1] / S) for q in reversed(bot)])
        for k in range(n):
            a, b = k, (k + 1) % n
            u0, u1 = per[k] / S, per[k + 1] / S
            p.face([P(bot[a], 0), P(bot[b], 0), P(out[b], 0.0035), P(out[a], 0.0035)], cloth, [(u0, 0), (u1, 0), (u1, 0.2), (u0, 0.2)], smooth=True)
            p.face([P(out[a], 0.0035), P(out[b], 0.0035), P(out[b], Hh), P(out[a], Hh)], cloth, [(u0, 0.2), (u1, 0.2), (u1, Hh / S + 0.03), (u0, Hh / S + 0.03)], smooth=True)
            p.face([P(out[a], Hh), P(out[b], Hh), P(inn[b], Hh), P(inn[a], Hh)], ztape)
            p.face([P(inn[a], Hh), P(inn[b], Hh), P(inn[b], FL), P(inn[a], FL)], lining, [(u0 * 1.6, 1.6), (u1 * 1.6, 1.6), (u1 * 1.6, 0), (u0 * 1.6, 0)], smooth=True)
        p.face([P(q, FL) for q in inn], lining, [(q[0] / S * 1.6, q[1] / S * 1.6) for q in inn])
        # 지퍼 이: 경첩 쪽을 뺀 세 변을 따라
        m2 = [Vector(q) for q in mid]
        acc, k, step = 0.0, 0, 0.0026
        for k in range(len(m2)):
            a, b = m2[k], m2[(k + 1) % len(m2)]
            L = (b - a).length
            t = (b - a).normalized() if L > 1e-9 else Vector((1, 0))
            while acc < L:
                q = a + t * acc
                if q.y * hinge < D / 2 - R - 0.002:
                    Mt = M @ Matrix.Translation((q.x, q.y, Hh)) @ Matrix.Rotation(math.atan2(t.y, t.x), 4, "Z")
                    obox(p, Mt, (-0.0008, -0.0016, -0.0002), (0.0008, 0.0016, 0.0012), metal)
                acc += step
            acc -= L
    tray(MB, 1)
    tray(ML, -1)
    # 등(경첩): 두 반쪽을 잇는 천
    p.box((-W / 2 + R, -0.0085, 0.0003), (W / 2 - R, 0.0085, 0.0034), cloth)
    # 지퍼 손잡이: 몸통의 오른쪽 끝에 멈춰 있다
    MS = MB @ Matrix.Translation((W / 2 - T / 2, D / 2 - R - 0.004, Hh))
    obox(p, MS, (-0.0030, -0.0042, -0.0004), (0.0030, 0.0042, 0.0034), metal)
    obox(p, MS @ Matrix.Translation((0.0026, 0, 0.0028)) @ Matrix.Rotation(rad(62), 4, "Y"), (0.0, -0.0026, -0.0005), (0.0170, 0.0026, 0.0005), metal)
    # 뚜껑 안쪽의 주머니: 수험표의 아래쪽이 여기에 꽂혀 있다
    YC = -0.012
    PL = lambda x, y, z: ML @ Vector((x, y, z))
    xi = W / 2 - T
    pts = [(-xi, YC)] + [q for q in inn if q[1] < YC - 1e-6] + [(xi, YC)]
    p.face([PL(q[0], q[1], FL + 0.0017) for q in pts], pocket, [(q[0] / S * 1.6, q[1] / S * 1.6) for q in pts])
    p.face([PL(-xi, YC - 0.0045, FL + 0.0020), PL(xi, YC - 0.0045, FL + 0.0020), PL(xi, YC, FL + 0.0020), PL(-xi, YC, FL + 0.0020)], cloth, [(0, 0), (2 * xi / S, 0), (2 * xi / S, 0.22), (0, 0.22)])
    # 가격표를 뗀 자국: 몸통의 앞면에, 끈끈이가 번들거리고 종이 부스러기가 남았다
    residue = pbr("prop_tag_residue", (0.07, 0.095, 0.155), 0.36)
    scrap = pbr("prop_tag_scrap", (0.86, 0.85, 0.80), 0.8)
    yf = -D / 2 - 0.0004
    PB = lambda x, z, dy=0.0: MB @ Vector((x, yf - dy, z))
    p.face([PB(0.058 + q[0], 0.0118 + q[1]) for q in rrect(0.027, 0.0115, 0.0018, 3)], residue)
    for sx, sz, w, h, a in ((0.048, 0.0150, 0.0050, 0.0018, 0.2), (0.066, 0.0092, 0.0064, 0.0014, -0.15), (0.0585, 0.0125, 0.0030, 0.0012, 0.5), (0.0695, 0.0155, 0.0022, 0.0016, -0.4)):
        ca, sa = math.cos(a), math.sin(a)
        p.face([PB(sx + qx * ca - qz * sa, sz + qx * sa + qz * ca, 0.0002) for qx, qz in ((-w / 2, -h / 2), (w / 2, -h * 0.3), (w * 0.4, h / 2), (-w * 0.45, h * 0.4))], scrap)
    finish_weld(p, "case", c, 40)

    # 수험표
    tk = Part()
    tk.quad((0, 0, 0), (0.062, 0, 0), (0, 0.035, 0), img_mat("prop_ticket", "pl_ticket.png", 0.78))
    to = tk.finish("case_ticket", c)
    TK = ML @ Matrix.Translation((-0.030, 0.0075, FL + 0.0011)) @ Matrix.Rotation(rad(2.5), 4, "Z") @ Matrix.Rotation(rad(1.3), 4, "X")
    to.matrix_world = TK
    # 뿔테 안경: 알이 위를 보게 누워 있다. 착용자 기준 왼쪽 알(무지갯빛)이 +X
    gme, ntemple = folded_glasses()
    co = coords(gme)
    go = bpy.data.objects.new("case_glasses", gme)
    c.objects.link(go)
    GL = MB @ Matrix.Translation((0.031, 0.013, FL + 0.0006)) @ Matrix.Rotation(rad(-3.5), 4, "Z") @ Matrix.Translation((0, -(co[:, 2].min() + co[:, 2].max()) / 2, co[:, 1].max())) @ Matrix.Rotation(rad(-90), 4, "X")
    go.matrix_world = GL
    # 사인펜: 라벨의 검은 네모가 위를 보게 돌려 놓았다
    pme = next(o for o in bpy.data.collections["prop_pen"].objects if o.type == "MESH").data
    po = bpy.data.objects.new("case_pen", pme)
    c.objects.link(po)
    PN = MB @ Matrix.Translation((-0.020, -0.0365, FL + 0.0066)) @ Matrix.Rotation(rad(1.5), 4, "Z") @ Matrix.Rotation(rad(-58), 4, "X")
    po.matrix_world = PN
    empty("detail_ticket", ML @ Vector((-0.030, 0.020, FL + 0.007)), c)
    empty("detail_glasses", GL @ Vector((0, float(co[:, 1].min()) - 0.004, float(co[:, 2].min() + co[:, 2].max()) / 2)), c)
    empty("detail_pen", PN @ Vector((-0.064, 0, 0.008)), c)
    empty("view_center", (0, 0.004, 0.014), c)
    return c, {"temple_verts": ntemple, "glasses_y": [float(co[:, 1].min()), float(co[:, 1].max())]}

# ── 수학 연습지: 책상 위의 A4 한 장. 문제의 줄마다 눌린 광택이 거칠기 그림에만 남아 있다 ──
def build_practice():
    c = coll("prop_practice")
    with open(os.path.join(TEX, "pl_practice.json"), encoding="utf-8") as fp:
        meta = json.load(fp)
    PW, PH = 0.210, 0.297
    paper = img_mat("prop_practice_paper", "pl_practice.png", 0.95, rough_file="pl_practice_rough.png")
    blank = pbr("prop_practice_blank", (0.86, 0.85, 0.80), 0.95)
    desk = pbr("prop_practice_desk", noise_image("prop_practice_desk", (0.30, 0.23, 0.16), 0.018, 256, 9), 0.5)
    dp = Part()
    dp.box((-0.31, -0.23, -0.02), (0.31, 0.23, 0.0), desk)
    # 아래에 깔린 다른 종이 한 장 (뒷면)
    M2 = Matrix.Translation((0.021, -0.013, 0.0003)) @ Matrix.Rotation(math.radians(-6.5), 4, "Z")
    dp.face([M2 @ Vector(q) for q in ((-PW / 2, -PH / 2, 0), (PW / 2, -PH / 2, 0), (PW / 2, PH / 2, 0), (-PW / 2, PH / 2, 0))], blank)
    dp.finish("practice_desk", c)
    # 연습지: 오른쪽 위 귀퉁이가 조금 들렸다
    def lift(u, v):
        return 0.0008 + 0.0030 * smooth01(0.62, 1.0, u) * smooth01(0.60, 1.0, v) + 0.0009 * smooth01(0.7, 1.0, 1 - u) * smooth01(0.75, 1.0, 1 - v) + 0.00035 * (1 + math.sin(u * 4.1 + v * 2.3))
    sp = Part()
    NX, NY = 14, 20
    P = lambda i, j: Vector(((i / NX - 0.5) * PW, (j / NY - 0.5) * PH, lift(i / NX, j / NY)))
    for j in range(NY):
        for i in range(NX):
            sp.face([P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)], paper, [(i / NX, j / NY), ((i + 1) / NX, j / NY), ((i + 1) / NX, (j + 1) / NY), (i / NX, (j + 1) / NY)], smooth=True)
    so = finish_weld(sp, "practice_sheet", c, 60)
    if so.data.polygons[0].normal.z < 0:
        so.data.flip_normals()
    IW, IH = meta["size"]
    at = lambda px, py, z=0.004: ((px / IW - 0.5) * PW, (0.5 - py / IH) * PH, z)
    empty("detail_gloss", at(*meta["gloss"]), c)
    empty("detail_margin", at(*meta["margin"]), c)
    empty("view_center", (0, 0, 0), c)
    return c

INSPECT_PROPS = (("prop_parcel", "parcel.glb", 88), ("prop_pencilcase", "pencilcase.glb", 88), ("prop_practice", "practice.glb", 90))

def build_inspect_props():
    """build_all() 다음에 부른다 (필통이 사인펜과 안경의 메시를 빌려 쓴다)."""
    build_parcel()
    _, info = build_pencilcase()
    build_practice()
    return info
