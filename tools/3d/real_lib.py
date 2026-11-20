# 사실화 공간을 짓는 도구 — 재질과 그림(텍스처)을 숫자로 만들고, 실제 치수의 UV로 벽·바닥·창·문을 짓는다.
# 12시험실(build_room12_real.py)에서 쓴 방법을 장소에 매이지 않게 옮긴 것이다. 프롤로그의 네 장소가 쓴다.
#   from real_lib import Real
#   R = Real("rooftop"); R.box(...); R.wall(...); R.finish()
# 결과: 컬렉션 <site>_real (static / lamps / furniture / dynamic / decals) + 블록아웃의 <site>_colliders, <site>_markers.
# 게임이 읽는 이름: static(구운 빛을 받는다), lamps, sky_backdrop, *glass*, spot_* / spawn_* / npc_*, col_*.
import bpy, bmesh, math, os, io, contextlib, logging, random
import numpy as np
from mathutils import Vector, Matrix, Euler

TRIPO = r"D:\ai-mystery-game\tools\_raw\3d\tripo"
TEX = r"D:\ai-mystery-game\tools\_raw\3d\tex"
PI = math.pi


def coll(name, parent=None):
    c = bpy.data.collections.get(name)
    if c is None:
        c = bpy.data.collections.new(name)
        (parent or bpy.context.scene.collection).children.link(c)
    return c


class Real:
    def __init__(self, site, seed=7):
        self.site = site
        self.px = "pl_%s_" % site          # 이 장소가 만든 데이터의 이름 머리
        self.rng = random.Random(seed)
        self.nrng = np.random.default_rng(seed)
        self.ROOT = coll(site + "_real")
        self.STATIC, self.LAMPS, self.FURN, self.DYN, self.DECAL = (coll("%s_r_%s" % (site, n), self.ROOT) for n in ("static", "lamps", "furniture", "dynamic", "decals"))
        for c in (self.STATIC, self.LAMPS, self.FURN, self.DYN, self.DECAL):
            for o in list(c.objects):
                bpy.data.objects.remove(o, do_unlink=True)
        for n in ("colliders", "markers"):   # 충돌 면과 자리는 블록아웃의 것을 그대로 묶는다: 걸어 본 동선이 바뀌지 않는다
            c = bpy.data.collections["%s_%s" % (site, n)]
            if c.name not in self.ROOT.children:
                self.ROOT.children.link(c)
            for o in c.objects:
                o.hide_render = True
        self.M = {}
        self.font = None
        for fp in (r"C:\Windows\Fonts\malgunbd.ttf", r"C:\Windows\Fonts\malgun.ttf"):
            if os.path.exists(fp):
                self.font = bpy.data.fonts.load(fp, check_existing=True)
                break
        self._tripo = {}

    # ── 그림을 숫자로 ──
    @staticmethod
    def blur(a, sigma):
        """가장자리가 이어지는(타일링) 흐림."""
        h, w = a.shape[:2]
        fy, fx = np.fft.fftfreq(h)[:, None], np.fft.fftfreq(w)[None, :]
        g = np.exp(-2 * (np.pi ** 2) * (sigma ** 2) * (fx ** 2 + fy ** 2))
        if a.ndim == 3:
            return np.stack([np.fft.ifft2(np.fft.fft2(a[..., i]) * g).real for i in range(a.shape[2])], -1)
        return np.fft.ifft2(np.fft.fft2(a) * g).real

    def noise(self, h, w, sigma):
        n = self.blur(self.nrng.standard_normal((h, w)), sigma)
        return (n - n.min()) / (n.max() - n.min() + 1e-9)

    def image(self, name, arr, data=False):
        """arr: (H, W, 3|4) 0~1, 위가 첫 줄. 색이면 sRGB 값."""
        arr = np.clip(np.asarray(arr, dtype=np.float32), 0, 1)
        if arr.ndim == 2:
            arr = np.repeat(arr[..., None], 3, 2)
        h, w = arr.shape[:2]
        if arr.shape[2] == 3:
            arr = np.concatenate([arr, np.ones((h, w, 1), np.float32)], -1)
        name = self.px + name
        old = bpy.data.images.get(name)
        if old:
            bpy.data.images.remove(old)
        im = bpy.data.images.new(name, w, h, alpha=True)
        im.colorspace_settings.name = "Non-Color" if data else "sRGB"
        im.pixels.foreach_set(arr[::-1].ravel())
        im.pack()
        return im

    def picture(self, file):
        """tools/_raw/3d/tex의 그림 파일 (글자가 든 것은 make_prologue_textures.py가 그린다)."""
        im = bpy.data.images.load(os.path.join(TEX, file), check_existing=True)
        im.pack()
        return im

    def tex_speckle(self, name, base, var=0.08, S=512, fine=1.0, coarse=40, stain=0.0, rough=None):
        """콘크리트, 미장, 아스팔트, 장판: 고운 알갱이와 큰 얼룩."""
        n = 0.55 * self.noise(S, S, fine) + 0.45 * self.noise(S, S, coarse)
        col = np.array(base, np.float32)[None, None, :] * (1 - var + 2 * var * n[..., None])
        if stain:
            col *= (1 - stain * (self.noise(S, S, 70) ** 2))[..., None]
        out = [self.image(name + "_col", col)]
        if rough is not None:
            out.append(self.image(name + "_rough", rough[0] + (rough[1] - rough[0]) * self.noise(S, S, 25), data=True))
        return out if rough is not None else out[0]

    def tex_tiles(self, name, nx, ny, tile, grout, S=512, gap=3, jitter=0.05, brick=False, rough=None, bevel=True):
        """타일, 보도블록, 벽돌(brick=True면 한 줄씩 어긋난다)."""
        col = np.zeros((S, S, 3), np.float32) + np.array(grout, np.float32)
        gl = np.zeros((S, S), np.float32)
        th, tw = S // ny, S // nx
        for j in range(ny):
            off = (tw // 2) if (brick and j % 2) else 0
            for i in range(nx + (1 if off else 0)):
                x0, y0 = i * tw - off, j * th
                xa, xb = max(0, x0 + gap), min(S, x0 + tw)
                if xb <= xa:
                    continue
                tone = 1 + self.rng.uniform(-jitter, jitter)
                warm = self.rng.uniform(-jitter, jitter) * 0.4
                col[y0 + gap:y0 + th, xa:xb] = np.array(tile, np.float32) * tone + np.array([warm, 0, -warm], np.float32)
                gl[y0 + gap:y0 + th, xa:xb] = 1
        n = self.noise(S, S, 1.4)
        col *= (0.94 + 0.12 * n)[..., None]
        if bevel:
            col *= (0.82 + 0.18 * self.blur(gl, 1.2).clip(0, 1))[..., None]
        out = [self.image(name + "_col", col)]
        if rough is not None:
            out.append(self.image(name + "_rough", rough[1] - (rough[1] - rough[0]) * gl * (0.7 + 0.3 * self.noise(S, S, 30)), data=True))
        return out if rough is not None else out[0]

    def tex_planks(self, name, strips, base, S=1024, cuts=2, var=0.08, rough=(0.3, 0.55)):
        """마루, 평상, 합판: 널 사이의 이음과 길이 방향의 결."""
        col = np.zeros((S, S, 3), np.float32)
        seam = np.zeros((S, S), np.float32)
        grain = self.blur(self.nrng.standard_normal((S, S)), 0.6)
        grain = self.blur(np.repeat(grain[:, ::16], 16, axis=1), 2.5)
        sw = S // strips
        for i in range(strips):
            y0 = i * sw
            cs = sorted({int(self.rng.uniform(0, S)) for _ in range(cuts)}) + [S]
            x0 = 0
            for x1 in cs:
                tone = 1 + self.rng.uniform(-var, var)
                warm = self.rng.uniform(-0.03, 0.03)
                col[y0:y0 + sw, x0:x1] = (np.array(base, np.float32) + np.array([warm, 0, -warm * 0.5], np.float32)) * tone
                seam[y0:y0 + sw, max(0, x1 - 1):x1] = 1
                x0 = x1
            seam[y0:y0 + 1, :] = 1
        g = (grain - grain.mean()) / (grain.std() + 1e-9)
        col *= (1 + 0.05 * g)[..., None]
        col *= (1 - 0.5 * self.blur(seam, 0.6).clip(0, 1)).clip(0.6, 1)[..., None]
        r = rough[0] + (rough[1] - rough[0]) * (0.6 * self.noise(S, S, 60) + 0.4 * self.blur(seam, 0.8).clip(0, 1))
        return self.image(name + "_col", col), self.image(name + "_rough", r, data=True)

    def tex_grain(self, name, base, S=512, strength=0.07):
        """가구의 나뭇결 (한 방향)."""
        g = self.blur(self.nrng.standard_normal((S, S)), 0.5)
        g = self.blur(np.repeat(g[:, ::32], 32, axis=1), 2.0)
        g = (g - g.mean()) / (g.std() + 1e-9)
        col = np.array(base, np.float32)[None, None, :] * (1 + strength * g + 0.04 * (self.noise(S, S, 40) - 0.5))[..., None]
        return self.image(name + "_col", col)

    def tex_stripes(self, name, a, b, n=16, S=256, soft=0.6, vertical=True):
        """골판(물탱크, 셔터, 컨테이너), 줄무늬 벽지."""
        x = np.arange(S)
        k = 0.5 + 0.5 * np.sin(x / S * n * 2 * np.pi)
        k = k ** soft
        m = np.repeat(k[None, :], S, 0) if vertical else np.repeat(k[:, None], S, 1)
        col = np.array(a, np.float32) * m[..., None] + np.array(b, np.float32) * (1 - m[..., None])
        col *= (0.95 + 0.1 * self.noise(S, S, 20))[..., None]
        return self.image(name + "_col", col)

    def tex_panorama(self, name, top, horizon, haze, skyline=(0.30, 0.31, 0.34), W=2048, H=512, towers=True, hills=True):
        """하늘과 먼 도시: 반구 안쪽에 두른다. 아래 가장자리가 지평선보다 조금 아래."""
        y = np.linspace(0, 1, H)[:, None]          # 0 = 꼭대기, 1 = 맨 아래
        k = np.clip((y - 0.05) / 0.72, 0, 1) ** 1.6
        sky = np.array(top, np.float32) * (1 - k) + np.array(horizon, np.float32) * k
        col = np.repeat(sky.reshape(H, 1, 3), W, axis=1).astype(np.float32)
        cloud = self.blur(self.nrng.standard_normal((H, W)), 22)
        cloud = np.clip((cloud - cloud.mean()) / (cloud.std() + 1e-9) * 0.5 + 0.2, 0, 1)
        cloud *= np.clip(1.2 - y * 1.1, 0, 1)
        col = col * (1 - 0.35 * cloud[..., None]) + np.array((1.0, 0.99, 0.97), np.float32) * 0.35 * cloud[..., None]
        hz = int(H * 0.86)                          # 지평선
        sil = np.zeros((H, W), np.float32)
        if hills:
            hx = np.arange(W)
            ridge = 14 + 10 * np.sin(hx / W * 2 * np.pi * 3 + 1.0) + 7 * np.sin(hx / W * 2 * np.pi * 7 + 2.0)
            for x in range(W):
                sil[hz - int(ridge[x]):hz, x] = 0.45
        x = 0
        while towers and x < W:                     # 아파트와 낮은 건물의 윤곽
            tall = self.rng.random() < 0.3
            bw = self.rng.randint(14, 40) if tall else self.rng.randint(20, 70)
            bh = self.rng.randint(34, 78) if tall else self.rng.randint(6, 26)
            sil[hz - bh:hz, x:x + bw] = self.rng.uniform(0.7, 1.0)
            if tall:                                # 창의 줄
                for wy in range(hz - bh + 3, hz - 2, 4):
                    sil[wy, x + 2:x + bw - 2] *= 0.82
            x += bw + self.rng.randint(0, 18)
        hz_col = np.array(haze, np.float32)
        s = sil[..., None]
        far = np.array(skyline, np.float32) * 0.55 + hz_col * 0.45     # 멀수록 안개색에 가깝다
        col = col * (1 - np.clip(s, 0, 1)) + (far * (0.75 + 0.25 * s)) * np.clip(s, 0, 1)
        col[hz:, :] = hz_col * 0.82
        col += 0.012 * self.nrng.standard_normal((H, W, 1))
        return self.image(name + "_col", col)

    def decal(self, name, draw, S=256):
        a = np.zeros((S, S, 4), np.float32)
        draw(a, S)
        return self.image(name, a)

    # ── 재질 ──
    def pbr(self, key, color=(0.8, 0.8, 0.8), rough=0.6, metal=0.0, emit=None, emit_strength=1.0, blend=False, alpha=1.0, bake_emit=None):
        """bake_emit: 등을 구울 때의 세기 (구울 때만 켠다. 0이면 굽지 않는 빛 — 화면, 하늘)."""
        name = self.px + key
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
                return t
            b.inputs[sock].default_value = (*v, 1.0) if isinstance(v, tuple) else v

        tc = put("Base Color", color)
        put("Roughness", rough)
        put("Metallic", metal)
        if emit is not None:
            put("Emission Color", emit)
            b.inputs["Emission Strength"].default_value = emit_strength
            m["emit_show"] = emit_strength
            m["emit_bake"] = emit_strength if bake_emit is None else bake_emit
        if blend:
            if tc is not None:
                nt.links.new(tc.outputs["Alpha"], b.inputs["Alpha"])
            else:
                b.inputs["Alpha"].default_value = alpha
            m.surface_render_method = "BLENDED"
        self.M[key] = m
        return m

    def mat(self, key):
        return self.M[key] if isinstance(key, str) else key

    # ── 모양 ──
    def _obj(self, name, me, c):
        o = bpy.data.objects.new(name, me)
        (c or self.STATIC).objects.link(o)
        return o

    def box(self, name, lo, hi, material, c=None, uv=1.0, rot=0.0):
        """축에 나란한 상자. UV는 실제 크기(m)를 uv로 나눈 값: 타일 그림이 크기에 맞게 깔린다. uv=0이면 면마다 0~1."""
        lo, hi = [min(lo[i], hi[i]) for i in range(3)], [max(lo[i], hi[i]) for i in range(3)]
        me = bpy.data.meshes.new(self.px + name)
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
                a, b = ((p.x, p.y) if ax == 2 else (p.y, p.z) if ax == 0 else (p.x, p.z))
                if uv:
                    l[uvl].uv = (a / uv, b / uv)
                else:
                    r = ((x0, x1, y0, y1) if ax == 2 else (y0, y1, z0, z1) if ax == 0 else (x0, x1, z0, z1))
                    u_ = (a - r[0]) / ((r[1] - r[0]) or 1)
                    l[uvl].uv = ((1 - u_) if ((ax == 0 and f.normal.x < 0) or (ax == 1 and f.normal.y > 0)) else u_, (b - r[2]) / ((r[3] - r[2]) or 1))
        if rot:
            cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
            bmesh.ops.rotate(bm, verts=bm.verts, cent=(cx, cy, 0), matrix=Matrix.Rotation(rot, 3, "Z"))
        bm.to_mesh(me)
        bm.free()
        me.materials.append(self.mat(material))
        return self._obj(name, me, c)

    def quad(self, name, center, sx, sy, material, c=None, rot=0.0, normal="+z", flip_u=False):
        """UV 0~1의 네모 한 장 (종이, 그림, 자국). normal: +z(위), -z, +x, -x, +y, -y. sx는 가로, sy는 세로."""
        me = bpy.data.meshes.new(self.px + name)
        bm = bmesh.new()
        pts = [(-sx / 2, -sy / 2), (sx / 2, -sy / 2), (sx / 2, sy / 2), (-sx / 2, sy / 2)]
        f = bm.faces.new([bm.verts.new((x, y, 0)) for x, y in pts])
        uvl = bm.loops.layers.uv.new("uv")
        for l, uv_ in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
            l[uvl].uv = (1 - uv_[0], uv_[1]) if flip_u else uv_
        bm.to_mesh(me)
        bm.free()
        me.materials.append(self.mat(material))
        o = self._obj(name, me, c if c is not None else self.DECAL)
        R = {"+z": Euler((0, 0, rot)), "-z": Euler((PI, 0, rot)), "+x": Euler((PI / 2, 0, PI / 2)), "-x": Euler((PI / 2, 0, -PI / 2)),
             "+y": Euler((PI / 2, 0, PI)), "-y": Euler((PI / 2, 0, 0))}[normal]
        o.rotation_euler = R
        if normal[1] != "z" and rot:
            o.rotation_euler.rotate_axis("Z", rot)
        o.location = center
        return o

    def cyl(self, name, base, r, h, material, c=None, seg=16, r2=None, axis="z", cap=True):
        """원기둥(또는 원뿔대). base: 밑면의 중심."""
        me = bpy.data.meshes.new(self.px + name)
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=cap, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=h)
        bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, h / 2))
        uvl = bm.loops.layers.uv.new("uv")
        for f in bm.faces:
            for l in f.loops:
                p = l.vert.co
                if abs(f.normal.z) > 0.9:
                    l[uvl].uv = (p.x, p.y)
                else:
                    l[uvl].uv = ((math.atan2(p.y, p.x) / (2 * PI) + 0.5) * 2 * PI * r, p.z)
        if axis == "x":
            bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(PI / 2, 3, "Y"))
        elif axis == "y":
            bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(-PI / 2, 3, "X"))
        bmesh.ops.translate(bm, verts=bm.verts, vec=base)
        for f in bm.faces:
            f.smooth = abs(f.normal.z if axis == "z" else f.normal.x if axis == "x" else f.normal.y) < 0.9
        bm.to_mesh(me)
        bm.free()
        me.materials.append(self.mat(material))
        return self._obj(name, me, c)

    def blob(self, name, center, r, material, c=None, squash=(1, 1, 1), sub=2, bump=0.12):
        """울퉁불퉁한 덩어리 (쓰레기봉투, 베개, 빨랫감)."""
        me = bpy.data.meshes.new(self.px + name)
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
        for v in bm.verts:
            v.co *= 1 + self.rng.uniform(-bump, bump)
            v.co = Vector((v.co.x * squash[0], v.co.y * squash[1], v.co.z * squash[2]))
        bmesh.ops.translate(bm, verts=bm.verts, vec=center)
        uvl = bm.loops.layers.uv.new("uv")
        for f in bm.faces:
            f.smooth = True
            for l in f.loops:
                l[uvl].uv = (l.vert.co.x, l.vert.co.z)
        bm.to_mesh(me)
        bm.free()
        me.materials.append(self.mat(material))
        return self._obj(name, me, c)

    def text(self, name, body, size, loc, material, c=None, normal="+x", align="CENTER", rot=0.0):
        """글자를 메시로 (간판의 큰 글자). 긴 글은 그림으로 만든다."""
        cu = bpy.data.curves.new(self.px + name, "FONT")
        cu.body, cu.size, cu.align_x, cu.align_y, cu.resolution_u = body, size, align, "CENTER", 1
        if self.font:
            cu.font = self.font
        tmp = bpy.data.objects.new(name + "_tmp", cu)
        bpy.context.scene.collection.objects.link(tmp)
        me = bpy.data.meshes.new_from_object(tmp.evaluated_get(bpy.context.evaluated_depsgraph_get()))
        bpy.data.objects.remove(tmp, do_unlink=True)
        bpy.data.curves.remove(cu)
        me.name = self.px + name
        me.materials.clear()
        me.materials.append(self.mat(material))
        o = self._obj(name, me, c if c is not None else self.DECAL)
        o.rotation_euler = {"+x": Euler((PI / 2, 0, PI / 2)), "-x": Euler((PI / 2, 0, -PI / 2)), "+z": Euler((0, 0, rot)), "+y": Euler((PI / 2, 0, PI)), "-y": Euler((PI / 2, 0, 0))}[normal]
        o.location = loc
        return o

    # ── 벽과 방 ──
    # 축에 나란한 벽. a, b: 바닥면의 두 끝. gaps: [(시작, 끝, 턱, 머리)] 벽이 달리는 축의 좌표. 턱이 0이면 문, 아니면 창.
    # mat: 벽 재질. dado=(높이, 재질)이면 허리 아래를 다른 재질로. frame: 창틀과 문틀의 재질. inside: 방 안쪽이 어느 쪽인가(+1/-1, 벽에 수직인 축) — 창턱과 걸레받이를 그쪽에 단다.
    def wall(self, name, a, b, z1, t=0.15, z0=0.0, gaps=(), mat="wall", dado=None, frame="sash", glass="glass", base=None, inside=0, sill="sill", door=None, uv=1.0):
        along = 0 if abs(b[0] - a[0]) >= abs(b[1] - a[1]) else 1
        s0, s1 = sorted((a[along], b[along]))
        fixed = a[1 - along]

        def P(u0, u1, w0, w1, lo_z, hi_z):
            lo, hi = [0, 0, lo_z], [0, 0, hi_z]
            lo[along], hi[along] = u0, u1
            lo[1 - along], hi[1 - along] = fixed + w0, fixed + w1
            return lo, hi

        def seg(nm, u0, u1, lo_z, hi_z):
            if u1 - u0 < 0.005 or hi_z - lo_z < 0.005:
                return
            if dado and lo_z < dado[0] < hi_z:
                self.box(nm + "_d", *P(u0, u1, -t / 2, t / 2, lo_z, dado[0]), dado[1], uv=uv)
                self.box(nm, *P(u0, u1, -t / 2, t / 2, dado[0], hi_z), mat, uv=uv)
            else:
                self.box(nm, *P(u0, u1, -t / 2, t / 2, lo_z, hi_z), dado[1] if (dado and hi_z <= dado[0]) else mat, uv=uv)
            if base and inside and lo_z <= z0 + 0.001:
                w = (t / 2, t / 2 + 0.012) if inside > 0 else (-t / 2 - 0.012, -t / 2)
                self.box(nm + "_base", *P(u0, u1, w[0], w[1], z0, z0 + 0.09), base)

        u = s0
        for i, (g0, g1, sl, head) in enumerate(sorted(gaps)):
            head = min(head, z1)
            seg("%s_s%d" % (name, i), u, g0, z0, z1)
            seg("%s_sill%d" % (name, i), g0, g1, z0, sl)
            seg("%s_head%d" % (name, i), g0, g1, head, z1)
            fr = 0.045
            if sl > 0 and frame:                      # 창: 틀, 가운데 살, 유리, 창턱
                for nm, q in (("l", P(g0, g0 + fr, -t / 2 + 0.02, t / 2 - 0.02, sl + fr, head - fr)), ("r", P(g1 - fr, g1, -t / 2 + 0.02, t / 2 - 0.02, sl + fr, head - fr)),
                              ("b", P(g0, g1, -t / 2 + 0.02, t / 2 - 0.02, sl, sl + fr)), ("t", P(g0, g1, -t / 2 + 0.02, t / 2 - 0.02, head - fr, head))):
                    self.box("%s_win%d_%s" % (name, i, nm), *q, frame)
                n_m = max(1, round((g1 - g0) / 1.1))
                for k in range(1, n_m):
                    um = g0 + (g1 - g0) * k / n_m
                    self.box("%s_win%d_m%d" % (name, i, k), *P(um - 0.03, um + 0.03, -t / 2 + 0.02, t / 2 - 0.02, sl + fr, head - fr), frame)
                if glass:
                    self.box("%s_glass%d" % (name, i), *P(g0 + fr, g1 - fr, -0.004, 0.004, sl + fr, head - fr), glass, self.DYN)
                if inside and sill:
                    w = (t / 2 - 0.01, t / 2 + 0.06) if inside > 0 else (-t / 2 - 0.06, -t / 2 + 0.01)
                    self.box("%s_winsill%d" % (name, i), *P(g0 - 0.04, g1 + 0.04, w[0], w[1], sl - 0.03, sl), sill)
            elif sl <= 0 and frame and head < z1 - 0.001 or (sl <= 0 and door):   # 문틀
                fm = door or frame
                for nm, q in (("l", P(g0 - 0.04, g0, -t / 2 - 0.012, t / 2 + 0.012, z0, head + 0.04)), ("r", P(g1, g1 + 0.04, -t / 2 - 0.012, t / 2 + 0.012, z0, head + 0.04)),
                              ("t", P(g0 - 0.04, g1 + 0.04, -t / 2 - 0.012, t / 2 + 0.012, head, head + 0.04))):
                    self.box("%s_door%d_%s" % (name, i, nm), *q, fm)
            u = g1
        seg("%s_s%d" % (name, len(gaps)), u, s1, z0, z1)

    def lamp(self, name, x, y, z, w=1.2, d=0.28, mat="lamp", body="lamp_body", drop=0.055):
        """천장에 붙은 등기구: 흰 몸통 아래로 젖빛 덮개. z는 천장 면."""
        self.box(name + "_body", (x - w / 2 - 0.03, y - d / 2 - 0.03, z - 0.02), (x + w / 2 + 0.03, y + d / 2 + 0.03, z - 0.001), body)
        return self.box(name, (x - w / 2, y - d / 2, z - 0.02 - drop), (x + w / 2, y + d / 2, z - 0.02), mat, self.LAMPS)

    def sky_dome(self, material, radius=60.0, low=-0.16, seg=48, rings=12):
        """하늘과 먼 풍경을 그린 반구. 게임은 sky_backdrop이라는 이름을 찾아 시각에 따라 밝기를 바꾼다."""
        me = bpy.data.meshes.new(self.px + "sky")
        bm = bmesh.new()
        uvl = bm.loops.layers.uv.new("uv")
        top = PI / 2
        el = [low * PI / 2 + (top - low * PI / 2) * j / rings for j in range(rings + 1)]
        hz_v = 1 - 0.86                                    # 그림에서 지평선의 높이 (tex_panorama와 같다)
        def vv(e):
            return hz_v * (1 + e / abs(low * PI / 2)) if e < 0 else hz_v + (1 - hz_v) * (e / top) ** 0.7
        for j in range(rings):
            for i in range(seg):
                a0, a1 = 2 * PI * i / seg, 2 * PI * (i + 1) / seg
                e0, e1 = el[j], el[j + 1]
                pts = [(a0, e0), (a0, e1), (a1, e1), (a1, e0)]      # 안쪽을 보는 면
                f = bm.faces.new([bm.verts.new((radius * math.cos(e) * math.cos(a), radius * math.cos(e) * math.sin(a), radius * math.sin(e))) for a, e in pts])
                for l, (a, e) in zip(f.loops, pts):
                    l[uvl].uv = (a / (2 * PI), vv(e))
                f.smooth = True
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
        bm.to_mesh(me)
        bm.free()
        me.materials.append(self.mat(material))
        o = self._obj("sky_backdrop", me, self.DYN)
        o.visible_shadow = False
        return o

    # ── Tripo가 만든 소품 ──
    def tripo(self, file, key, size=None, rot_z=0.0, decimate=1.0, height=None):
        """glb 하나를 메시 하나로. 바닥 가운데가 원점. size(x, y, z)에 맞추거나, height만 주면 비율을 지킨다. 파일이 없으면 None."""
        if key in self._tripo:
            return self._tripo[key]
        path = os.path.join(TRIPO, file)
        if not os.path.exists(path):
            self._tripo[key] = None
            return None
        before = set(bpy.data.objects)
        logging.disable(logging.CRITICAL)
        try:
            with contextlib.redirect_stdout(io.StringIO()):
                bpy.ops.import_scene.gltf(filepath=path)
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
        d = hi - lo
        if size:
            me.transform(Matrix.Diagonal((size[0] / d[0], size[1] / d[1], size[2] / d[2], 1)))
        elif height:
            k = height / d[2]
            me.transform(Matrix.Diagonal((k, k, k, 1)))
        me.name = "tripo_" + key
        for m in me.materials:
            m.name = "tripo_" + key
            for n in m.node_tree.nodes:
                if n.type == "TEX_IMAGE" and n.image:
                    n.image.name = "tripo_%s_%s" % (key, n.image.name.rsplit("_", 1)[-1])
        if decimate < 1.0:
            tmp = bpy.data.objects.new("tmp", me)
            bpy.context.scene.collection.objects.link(tmp)
            mod = tmp.modifiers.new("d", "DECIMATE")
            mod.ratio = decimate
            me2 = bpy.data.meshes.new_from_object(tmp.evaluated_get(bpy.context.evaluated_depsgraph_get()))
            bpy.data.objects.remove(tmp, do_unlink=True)
            bpy.data.meshes.remove(me)
            me2.name = "tripo_" + key
            me = me2
        self._tripo[key] = me
        return me

    def place(self, name, me, loc, yaw=0.0, c=None, scale=None):
        o = bpy.data.objects.new(name, me)
        o.location = loc
        o.rotation_euler = (0, 0, yaw)
        if scale:
            o.scale = scale if isinstance(scale, (tuple, list)) else (scale, scale, scale)
        (c or self.FURN).objects.link(o)
        return o

    def tint(self, me, key, color):
        """같은 메시를 색만 바꿔 한 벌 더 (수거함의 색처럼). 바탕색 그림에 색을 곱한다."""
        me2 = me.copy()
        me2.name = "tripo_" + key
        m = me2.materials[0].copy()
        m.name = "tripo_" + key
        nt = m.node_tree
        b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
        link = next((l for l in nt.links if l.to_socket == b.inputs["Base Color"]), None)
        if link:
            mix = nt.nodes.new("ShaderNodeMix")
            mix.data_type, mix.blend_type = "RGBA", "MULTIPLY"
            mix.inputs[0].default_value = 1.0
            src = link.from_socket
            nt.links.remove(link)
            nt.links.new(src, mix.inputs[6])
            mix.inputs[7].default_value = (*color, 1)
            nt.links.new(mix.outputs[2], b.inputs["Base Color"])
        me2.materials[0] = m
        return me2

    # ── 묶기 ──
    def join(self, objs, name):
        objs = [o for o in objs if o.type == "MESH"]
        if not objs:
            return None
        for o in bpy.data.objects:
            o.select_set(False)
        if len(objs) > 1:
            with bpy.context.temp_override(active_object=objs[0], selected_objects=objs, selected_editable_objects=objs):
                bpy.ops.object.join()
        objs[0].name = name
        objs[0].data.name = self.px + name
        return objs[0]

    @staticmethod
    def _inflate_thin(me, min_m):
        """가는 면(틀, 덮개, 걸레받이의 윗면)의 조명 UV를 넓힌다. 텍셀 하나보다 가늘면 구워지지 않아 검게 나온다. (편집 모드에서 부른다)"""
        bm = bmesh.from_edit_mesh(me)
        uvl = bm.loops.layers.uv.active
        seen, n = set(), 0
        for f0 in bm.faces:
            if f0 in seen:
                continue
            seen.add(f0)
            stack, isl = [f0], []
            while stack:
                g = stack.pop()
                isl.append(g)
                for l in g.loops:
                    for l2 in l.vert.link_loops:
                        if l2.face not in seen and (l2[uvl].uv - l[uvl].uv).length < 1e-5:
                            seen.add(l2.face)
                            stack.append(l2.face)
            aw = sum(f.calc_area() for f in isl)
            au = 0.0
            for f in isl:
                pts = [l[uvl].uv for l in f.loops]
                au += abs(sum(pts[i].x * pts[(i + 1) % len(pts)].y - pts[(i + 1) % len(pts)].x * pts[i].y for i in range(len(pts)))) / 2
            if au <= 1e-12 or aw <= 1e-9:
                continue
            k = math.sqrt(aw / au)                             # UV 1단위가 몇 m인가
            us = [l[uvl].uv.x for f in isl for l in f.loops]
            vs = [l[uvl].uv.y for f in isl for l in f.loops]
            c = ((min(us) + max(us)) / 2, (min(vs) + max(vs)) / 2)
            ext = ((max(us) - min(us)) * k, (max(vs) - min(vs)) * k)
            sc = [min_m / e if 1e-6 < e < min_m else 1.0 for e in ext]
            if sc[0] == 1.0 and sc[1] == 1.0:
                continue
            n += 1
            for f in isl:
                for l in f.loops:
                    l[uvl].uv = (c[0] + (l[uvl].uv.x - c[0]) * sc[0], c[1] + (l[uvl].uv.y - c[1]) * sc[1])
        bmesh.update_edit_mesh(me)
        return n

    def finish(self, floor_z=0.0, cull=None, lm_margin=0.002, lm_thin=0.045):
        """붙박이를 한 덩어리로 묶고(조명을 굽는다), 보이지 않는 면을 걷어 내고, 둘째 UV 'lm'을 편다. 등과 그림도 한 덩어리씩."""
        static = self.join(list(self.STATIC.objects), "static")
        bm = bmesh.new()
        bm.from_mesh(static.data)
        bm.normal_update()
        e = 1e-3

        def unseen(f):
            c, n = f.calc_center_median(), f.normal
            if c.z < floor_z - 0.02 and n.z < 0.5:
                return True                                   # 바닥 밑
            if n.z < -0.9 and abs(c.z - floor_z) < 0.004:
                return True                                   # 바닥에 놓인 것의 밑면
            return bool(cull and cull(c, n))
        gone = [f for f in bm.faces if unseen(f)]
        bmesh.ops.delete(bm, geom=gone, context="FACES")
        bm.to_mesh(static.data)
        bm.free()
        lamps = self.join(list(self.LAMPS.objects), "lamps")
        self.join(list(self.DECAL.objects), "decals")
        # 붙박이의 재질은 게임에서 구운 조명을 읽는다(둘째 UV). 붙박이가 아닌 것이 같은 재질을 쓰면 검게 나오므로 따로 한 벌을 준다.
        baked = {m for m in static.data.materials if m}
        twin = {}
        for c in (self.LAMPS, self.FURN, self.DYN, self.DECAL):
            for o in c.all_objects:
                if o.type != "MESH":
                    continue
                for i, m in enumerate(o.data.materials):
                    if m in baked:
                        if m not in twin:
                            twin[m] = m.copy()
                            twin[m].name = m.name + "_free"
                        o.data.materials[i] = twin[m]
        bpy.context.view_layer.update()
        lm = static.data.uv_layers.new(name="lm")
        static.data.uv_layers.active = lm
        for o in bpy.data.objects:
            o.select_set(False)
        static.select_set(True)
        bpy.context.view_layer.objects.active = static
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=lm_margin, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
        self._inflate_thin(static.data, lm_thin)
        try:      # 스마트 투영의 포장은 빈 곳이 많다(덮임 20%쯤). 다시 포장하면 두 배 가까이 촘촘해진다
            bpy.ops.uv.select_all(action="SELECT")
            bpy.ops.uv.pack_islands(rotate=True, rotate_method="CARDINAL", scale=True, margin_method="FRACTION", margin=lm_margin, shape_method="AABB")
        except (TypeError, RuntimeError) as e:
            print("조명 UV를 다시 포장하지 못했다:", e)
        bpy.ops.object.mode_set(mode="OBJECT")
        static.data.uv_layers.active = static.data.uv_layers[0]
        return self.report()

    def report(self):
        out = {}
        for c in (self.STATIC, self.LAMPS, self.FURN, self.DYN, self.DECAL):
            n = 0
            for o in c.all_objects:
                if o.type == "MESH":
                    o.data.calc_loop_triangles()
                    n += len(o.data.loop_triangles)
            out[c.name.split("_r_")[-1]] = (len(c.objects), n)
        return out


# ── 여러 장소가 함께 쓰는 재질 한 벌 ──
def common_materials(R):
    """자주 쓰는 재질. 장소의 스크립트가 여기에 제 것을 더한다."""
    R.pbr("white", (0.90, 0.90, 0.88), 0.55)
    R.pbr("black", (0.03, 0.03, 0.035), 0.5)
    R.pbr("ink", (0.08, 0.08, 0.10), 0.7)
    R.pbr("paper", (0.93, 0.93, 0.90), 0.8)
    R.pbr("alu", (0.74, 0.75, 0.76), 0.38, 0.85)
    R.pbr("steel", (0.55, 0.58, 0.60), 0.45, 0.3)
    R.pbr("sash", (0.84, 0.84, 0.82), 0.5)
    R.pbr("sash_dark", (0.20, 0.19, 0.18), 0.5, 0.3)
    R.pbr("sill", (0.62, 0.60, 0.56), 0.4)
    R.pbr("base", (0.20, 0.17, 0.14), 0.6)
    R.pbr("glass", (0.85, 0.92, 0.95), 0.03, blend=True, alpha=0.16)
    R.pbr("lamp", (1, 1, 1), 0.4, emit=(1.0, 0.96, 0.90), emit_strength=12.0)
    R.pbr("lamp_body", (0.9, 0.9, 0.88), 0.5)
    R.pbr("rubber", (0.06, 0.06, 0.065), 0.85)
    R.pbr("plastic_grey", (0.42, 0.44, 0.46), 0.5)
    R.pbr("red", (0.62, 0.10, 0.08), 0.5)
    R.pbr("gold", (0.80, 0.62, 0.22), 0.3, 0.9)
    return R.M
