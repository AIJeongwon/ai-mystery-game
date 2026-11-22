# 목원고 12시험실의 조명을 굽는다 — build_room12_real.py 다음에 Blender에서 실행한다.
#   exec(open(r"D:\ai-mystery-game\tools\3d\bake_room12.py", encoding="utf-8").read())
#   light(...)            조명을 세운다 (시험 렌더용)
#   bake_all(size, spp)   붙박이(static)의 두 번째 UV에 세 장을 굽고 jpg로 낸다
#   split_tile24()        굽고 난 뒤 24번 위 텍스를 따로 떼어 낸다 (게임에서 밀어 올린다)
# 굽는 것은 세 장이다. 게임이 시각에 따라 섞는다: 등 + 하늘빛 x 낮 + 햇빛의 되비침 x 해.
#   lamp  형광등의 직접광과 되비침        sky  창으로 드는 하늘빛        sun  햇빛이 방 안에서 되비친 빛(직접광은 게임이 실시간으로 그린다)
import bpy, math, os
import numpy as np
from mathutils import Vector

OUT = r"D:\ai-mystery-game\public\assets\3d\sites"
SUN_DIR = Vector((-0.35, -1.0, 0.18)).normalized()   # 방에서 해를 향하는 방향 (창은 -Y). 게임의 light.sun.dir와 같은 방향이다.
SUN_COLOR, SUN_STRENGTH = (1.0, 0.66, 0.38), 4.0     # 해 질 녘
SKY_COLOR, SKY_STRENGTH = (0.80, 0.74, 0.72), 1.0
LAMP_STRENGTH = 9.0
RANGE = {"lamp": 0.8, "sky": 0.8, "sun": 0.45}        # 8비트로 줄일 때 1.0이 되는 밝기. 게임의 lightmap.range와 같아야 한다.

def light(lamp=True, sky=True, sun=True):
    sc = bpy.context.scene
    w = sc.world or bpy.data.worlds.new("r12_world")
    sc.world = w
    w.use_nodes = True
    bg = next(n for n in w.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs[0].default_value = (*SKY_COLOR, 1)
    bg.inputs[1].default_value = SKY_STRENGTH if sky else 0.0
    s = bpy.data.objects.get("r12_sun")
    if s is None:
        s = bpy.data.objects.new("r12_sun", bpy.data.lights.new("r12_sun", "SUN"))
        sc.collection.objects.link(s)
    s.data.energy, s.data.color, s.data.angle = SUN_STRENGTH, SUN_COLOR, math.radians(1.2)
    s.rotation_euler = SUN_DIR.to_track_quat("Z", "Y").to_euler()
    s.location = SUN_DIR * 20
    s.hide_render = not sun
    s.hide_viewport = not sun
    m = bpy.data.materials["r12_lamp"]
    next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED").inputs["Emission Strength"].default_value = LAMP_STRENGTH if lamp else 0.0

def cycles(spp):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = spp
    sc.cycles.use_denoising = True
    sc.cycles.sample_clamp_indirect = 4.0      # 굽기에는 잡티 제거가 듣지 않는다: 튀는 표본을 누르고, 구운 뒤에 직접 거른다
    sc.cycles.caustics_reflective = False
    sc.cycles.caustics_refractive = False
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        for kind in ("OPTIX", "CUDA"):
            try:
                prefs.compute_device_type = kind
                break
            except TypeError:
                pass
        prefs.get_devices()
        for d in prefs.devices:
            d.use = True
        sc.cycles.device = "GPU"
    except Exception as e:
        print("GPU를 쓰지 못한다:", e)

def hide_for_bake(on):
    """구울 때 빛을 막으면 안 되는 것: 유리, 창밖 풍경, 펼친 사다리, 천장 속 어둠."""
    for name in ("sky_backdrop", "ladder_open", "ladder_folded", "hole24", "plenum_pipe"):   # 사다리는 나중에 나타난다: 그림자를 구워 두면 안 된다
        o = bpy.data.objects.get(name)
        if o:
            o.hide_render = on
    for o in bpy.data.objects:
        if "glass" in o.name:
            o.hide_render = on

def smooth(a):
    """구운 그림의 잡티를 거른다: 3x3 가운뎃값으로 튀는 점을 지우고, 좁은 가우스로 고른다 (여백 6화소 안쪽이라 섬 밖으로 번지지 않는다)."""
    sh = [np.roll(np.roll(a, dy, 0), dx, 1) for dy in (-1, 0, 1) for dx in (-1, 0, 1)]
    a = np.median(np.stack(sh), axis=0)
    k = np.exp(-np.arange(-3, 4) ** 2 / (2 * 1.1 ** 2)).astype(np.float32)
    k /= k.sum()
    for axis in (0, 1):
        a = sum(np.roll(a, i - 3, axis) * k[i] for i in range(7))
    return a

def encode(img, rng):
    """선형 밝기를 rng로 나눠 sRGB 8비트로. 돌려주는 값은 잘린 화소의 비율."""
    w, h = img.size
    a = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(a)
    a = smooth(a.reshape(h, w, 4)[..., :3]) / rng
    clipped = float((a > 1).mean())
    a = np.clip(a, 0, 1)
    a = np.where(a <= 0.0031308, a * 12.92, 1.055 * a ** (1 / 2.4) - 0.055)
    out = bpy.data.images.get(img.name + "_8") or bpy.data.images.new(img.name + "_8", w, h, alpha=False)
    out.scale(w, h)
    out.colorspace_settings.name = "sRGB"
    out.pixels.foreach_set(np.concatenate([a, np.ones((h, w, 1), np.float32)], -1).ravel())
    return out, clipped

def bake(kind, size=2048, spp=128):
    static = bpy.data.objects["static"]
    objs = [static] + ([bpy.data.objects["tile24"]] if bpy.data.objects.get("tile24") else [])   # 텍스를 떼어 낸 뒤에 다시 굽는 경우
    name = "r12_lm_" + kind
    img = bpy.data.images.get(name)
    if img and tuple(img.size) != (size, size):
        bpy.data.images.remove(img)
        img = None
    img = img or bpy.data.images.new(name, size, size, alpha=False, float_buffer=True)
    targets = []
    for m in {m for o in objs for m in o.data.materials}:
        nt = m.node_tree
        n = nt.nodes.new("ShaderNodeTexImage")
        n.image = img
        n.name = "LM_TARGET"
        for x in nt.nodes:
            x.select = False
        n.select = True
        nt.nodes.active = n
        targets.append((nt, n))
    light(lamp=kind == "lamp", sky=kind == "sky", sun=kind == "sun")
    hide_for_bake(True)
    cycles(spp)
    for o in bpy.data.objects:
        o.select_set(False)
    for o in objs:
        o.data.uv_layers.active = o.data.uv_layers["lm"]
        o.select_set(True)
    bpy.context.view_layer.objects.active = static
    try:
        for i, o in enumerate(objs):   # 한 그림에 차례로 굽는다 (둘째부터는 지우지 않는다)
            for x in objs:
                x.select_set(x is o)
            bpy.context.view_layer.objects.active = o
            bpy.ops.object.bake(type="DIFFUSE", pass_filter={"INDIRECT"} if kind == "sun" else {"DIRECT", "INDIRECT"}, margin=6, use_clear=i == 0)
    finally:
        for o in objs:
            o.data.uv_layers.active = o.data.uv_layers[0]
        for nt, n in targets:
            nt.nodes.remove(n)
        hide_for_bake(False)
        light()
    out, clipped = encode(img, RANGE[kind])
    path = os.path.join(OUT, "mokwon_room12_lm_%s.jpg" % kind)
    sc = bpy.context.scene
    fmt, q = sc.render.image_settings.file_format, sc.render.image_settings.quality
    sc.render.image_settings.file_format, sc.render.image_settings.quality = "JPEG", 88
    out.filepath_raw, out.file_format = path, "JPEG"
    out.save()
    sc.render.image_settings.file_format, sc.render.image_settings.quality = fmt, q
    a = np.empty(size * size * 4, np.float32)
    img.pixels.foreach_get(a)
    return {"kind": kind, "bytes": os.path.getsize(path), "mean": round(float(a.reshape(-1, 4)[:, :3].mean()), 4), "clipped": round(clipped, 4)}

def bake_all(size=2048, spp=128):
    return [bake(k, size, spp) for k in ("lamp", "sky", "sun")]

def split_tile24():
    """구운 뒤에 한다: 24번 위 텍스(재질 r12_tile24)를 static에서 떼어 dynamic으로 옮긴다."""
    if bpy.data.objects.get("tile24"):
        return "already"
    static = bpy.data.objects["static"]
    idx = [i for i, m in enumerate(static.data.materials) if m.name == "r12_tile24"][0]
    for o in bpy.data.objects:
        o.select_set(False)
    static.select_set(True)
    bpy.context.view_layer.objects.active = static
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="DESELECT")
    bpy.ops.object.mode_set(mode="OBJECT")
    for p in static.data.polygons:
        p.select = p.material_index == idx
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.separate(type="SELECTED")
    bpy.ops.object.mode_set(mode="OBJECT")
    tile = next(o for o in bpy.context.selected_objects if o is not static)
    tile.name = "tile24"
    tile.data.name = "r12_tile24"
    # 원점을 텍스 가운데로 (게임이 이 노드를 민다)
    c = sum((tile.matrix_world @ v.co for v in tile.data.vertices), Vector()) / len(tile.data.vertices)
    tile.data.transform(__import__("mathutils").Matrix.Translation(-c))
    tile.location = c
    for col in list(tile.users_collection):
        col.objects.unlink(tile)
    bpy.data.collections["real_dynamic"].objects.link(tile)
    for ob in (tile, static):   # 쓰지 않는 재질 칸을 비운다
        used = sorted({p.material_index for p in ob.data.polygons})
        for i in reversed(range(len(ob.data.materials))):
            if i not in used:
                ob.data.materials.pop(index=i)
    return "split"
