# 사실화한 장소의 조명을 굽는다 — real_lib.py로 지은 장소(<site>_real)에 쓴다. 12시험실의 bake_room12.py와 같은 방식이다.
#   exec(open(r"D:\ai-mystery-game\tools\3d\bake_site.py", encoding="utf-8").read())
#   bake(CFG, "lamp" | "sky" | "sun", size, spp)   한 장을 굽고 jpg로 낸다 (한 번에 한 장씩 부른다)
# 굽는 것은 세 장: lamp 등의 직접광과 되비침 / sky 하늘빛 / sun 햇빛이 되비친 빛(직접광은 게임이 실시간으로 그린다).
# CFG = dict(out="prologue_rooftop", sun_dir=(x, y, z), sun_color, sun_strength, sky_color, sky_strength, lamp=1.0, range={lamp, sky, sun}, hide=[...])
#   sun_dir은 장소에서 해를 향하는 방향(Blender 좌표). 게임의 light.sun.dir = (x, z, -y)와 같아야 한다.
#   range는 8비트로 줄일 때 1.0이 되는 밝기. 게임의 lightmap.maps.*.range와 같아야 한다.
import bpy, math, os
import numpy as np
from mathutils import Vector

OUT = r"D:\ai-mystery-game\public\assets\3d\sites"


def light(cfg, lamp=True, sky=True, sun=True, show=False):
    sc = bpy.context.scene
    w = sc.world or bpy.data.worlds.new("site_world")
    sc.world = w
    w.use_nodes = True
    bg = next(n for n in w.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs[0].default_value = (*cfg["sky_color"], 1)
    bg.inputs[1].default_value = cfg["sky_strength"] if sky else 0.0
    s = bpy.data.objects.get("site_sun")
    if s is None:
        s = bpy.data.objects.new("site_sun", bpy.data.lights.new("site_sun", "SUN"))
        sc.collection.objects.link(s)
    d = Vector(cfg["sun_dir"]).normalized()
    s.data.energy, s.data.color, s.data.angle = cfg["sun_strength"], cfg["sun_color"], math.radians(1.5)
    s.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
    s.location = d * 40
    s.hide_render = not sun
    s.hide_viewport = not sun
    for m in bpy.data.materials:      # 스스로 빛나는 재질: 구울 때는 emit_bake, 보여 줄 때는 emit_show
        if "emit_bake" in m and m.use_nodes:
            b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
            b.inputs["Emission Strength"].default_value = m["emit_show"] if show else (m["emit_bake"] * cfg.get("lamp", 1.0) if lamp else 0.0)


def cycles(spp):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = spp
    sc.cycles.use_denoising = True
    sc.cycles.sample_clamp_indirect = 4.0
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


def hide_for_bake(cfg, on):
    """구울 때 빛을 막으면 안 되는 것: 유리, 하늘 그림, 나중에 나타나는 물건."""
    for o in bpy.data.objects:
        if "glass" in o.name or o.name == "sky_backdrop" or o.name in cfg.get("hide", ()):
            o.hide_render = on


def smooth(a, mask):
    """섬(구워진 텍셀) 안에서만 고르게 한다. 빈 곳과 섞이면 가는 면(틀, 걸레받이, 덮개)이 검어진다."""
    k = np.exp(-np.arange(-3, 4) ** 2 / (2 * 1.1 ** 2)).astype(np.float32)
    k /= k.sum()
    m = mask.astype(np.float32)[..., None]
    num, den = a * m, m.copy()
    for axis in (0, 1):
        num = sum(np.roll(num, i - 3, axis) * k[i] for i in range(7))
        den = sum(np.roll(den, i - 3, axis) * k[i] for i in range(7))
    return np.where(m > 0, num / np.maximum(den, 1e-6), 0.0)


def dilate(a, mask, n=8):
    """섬의 가장자리 값을 바깥으로 n 텍셀 넓힌다 (밉맵과 필터가 빈 곳을 읽지 않게)."""
    m = mask.astype(np.float32)[..., None]
    a = a * m
    for _ in range(n):
        num = sum(np.roll(np.roll(a, dy, 0), dx, 1) for dy in (-1, 0, 1) for dx in (-1, 0, 1))
        den = sum(np.roll(np.roll(m, dy, 0), dx, 1) for dy in (-1, 0, 1) for dx in (-1, 0, 1))
        grow = (m == 0) & (den > 0)
        a = np.where(grow, num / np.maximum(den, 1e-6), a)
        m = np.where(grow, 1.0, m)
    return a


def encode(img, rng):
    w, h = img.size
    a = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(a)
    a = a.reshape(h, w, 4)
    mask = a[..., 3] > 0.5
    a = dilate(smooth(a[..., :3], mask), mask) / rng
    clipped = float((a[mask] > 1).mean()) if mask.any() else 0.0
    a = np.clip(a, 0, 1)
    a = np.where(a <= 0.0031308, a * 12.92, 1.055 * a ** (1 / 2.4) - 0.055)
    out = bpy.data.images.get(img.name + "_8") or bpy.data.images.new(img.name + "_8", w, h, alpha=False)
    out.scale(w, h)
    out.colorspace_settings.name = "sRGB"
    out.pixels.foreach_set(np.concatenate([a, np.ones((h, w, 1), np.float32)], -1).ravel())
    return out, clipped, float(mask.mean())


def bake(cfg, kind, size=2048, spp=256):
    static = bpy.data.objects["static"]
    name = "site_lm_" + kind
    img = bpy.data.images.get(name)
    if img and tuple(img.size) != (size, size):
        bpy.data.images.remove(img)
        img = None
    img = img or bpy.data.images.new(name, size, size, alpha=True, float_buffer=True)
    targets = []
    for m in {m for m in static.data.materials if m}:
        nt = m.node_tree
        n = nt.nodes.new("ShaderNodeTexImage")
        n.image = img
        n.name = "LM_TARGET"
        for x in nt.nodes:
            x.select = False
        n.select = True
        nt.nodes.active = n
        targets.append((nt, n))
    light(cfg, lamp=kind == "lamp", sky=kind == "sky", sun=kind == "sun")
    hide_for_bake(cfg, True)
    cycles(spp)
    for o in bpy.data.objects:
        o.select_set(False)
    static.data.uv_layers.active = static.data.uv_layers["lm"]
    static.select_set(True)
    bpy.context.view_layer.objects.active = static
    try:
        bpy.ops.object.bake(type="DIFFUSE", pass_filter={"INDIRECT"} if kind == "sun" else {"DIRECT", "INDIRECT"}, margin=0, use_clear=True)
    finally:
        static.data.uv_layers.active = static.data.uv_layers[0]
        for nt, n in targets:
            nt.nodes.remove(n)
        hide_for_bake(cfg, False)
        light(cfg, show=True)
    out, clipped, cover = encode(img, cfg["range"][kind])
    path = os.path.join(OUT, "%s_lm_%s.jpg" % (cfg["out"], kind))
    sc = bpy.context.scene
    fmt, q = sc.render.image_settings.file_format, sc.render.image_settings.quality
    sc.render.image_settings.file_format, sc.render.image_settings.quality = "JPEG", 88
    out.filepath_raw, out.file_format = path, "JPEG"
    out.save()
    sc.render.image_settings.file_format, sc.render.image_settings.quality = fmt, q
    a = np.empty(size * size * 4, np.float32)
    img.pixels.foreach_get(a)
    a = a.reshape(-1, 4)
    a = a[a[:, 3] > 0.5][:, :3]
    return {"kind": kind, "bytes": os.path.getsize(path), "cover": round(cover, 3), "mean": round(float(a.mean()), 4), "p99": round(float(np.percentile(a, 99)), 3), "clipped": round(clipped, 4)}
