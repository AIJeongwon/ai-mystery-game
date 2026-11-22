# 블록아웃을 짓는 도구 — 회색 상자, 문과 창이 뚫린 벽, 충돌 상자, 게임이 읽는 자리.
# 장소마다 컬렉션 하나(arch / furniture / colliders / markers)를 만든다. bpy.ops를 쓰지 않아 빠르다.
#   from blockout_lib import Blockout
#   B = Blockout("apt"); B.box(...); B.wall(...); B.markers([...])
import bpy, math


def _coll(name, parent=None):
    c = bpy.data.collections.get(name)
    if c is None:
        c = bpy.data.collections.new(name)
        (parent or bpy.context.scene.collection).children.link(c)
    return c


def _mat(name, rgb, rough=0.8):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough
    m.diffuse_color = (*rgb, 1)
    return m


PALETTE = {
    "wall": (0.72, 0.74, 0.70), "floor": (0.45, 0.42, 0.38), "ceil": (0.85, 0.85, 0.83), "ground": (0.36, 0.37, 0.36),
    "furn": (0.55, 0.50, 0.42), "accent": (0.16, 0.32, 0.24), "glass": (0.55, 0.70, 0.80), "key": (0.80, 0.30, 0.22),
    "metal": (0.50, 0.52, 0.55), "dark": (0.12, 0.12, 0.13), "paper": (0.90, 0.88, 0.80), "green": (0.25, 0.42, 0.22),
    "yellow": (0.85, 0.68, 0.15), "blue": (0.20, 0.36, 0.60), "col": (0.9, 0.1, 0.9),
}
FACES = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]


class Blockout:
    def __init__(self, name):
        self.name = name
        self.root = _coll(name)
        self.arch, self.furn, self.cols, self.mark = (_coll(f"{name}_{n}", self.root) for n in ("arch", "furniture", "colliders", "markers"))
        for c in (self.arch, self.furn, self.cols, self.mark):
            for o in list(c.objects):
                bpy.data.objects.remove(o, do_unlink=True)
        self.M = {k: _mat("bo_" + k, v, 0.1 if k == "glass" else 0.8) for k, v in PALETTE.items()}
        self.n = 0

    # lo, hi: 마주 보는 두 모서리. 원점은 상자의 중심.
    def box(self, name, lo, hi, mat="furn", arch=False, c=None):
        lo, hi = [min(lo[i], hi[i]) for i in range(3)], [max(lo[i], hi[i]) for i in range(3)]
        ctr = [(lo[i] + hi[i]) / 2 for i in range(3)]
        h = [(hi[i] - lo[i]) / 2 for i in range(3)]
        verts = [(sx * h[0], sy * h[1], sz * h[2]) for sx in (-1, 1) for sy in (-1, 1) for sz in (-1, 1)]
        me = bpy.data.meshes.new(name)
        me.from_pydata(verts, [], FACES)
        me.update()
        me.materials.append(self.M[mat])
        o = bpy.data.objects.new(name, me)
        o.location = ctr
        (c or (self.arch if arch else self.furn)).objects.link(o)
        return o

    def collider(self, name, lo, hi):
        o = self.box("col_" + name, lo, hi, "col", c=self.cols)
        o.display_type = "WIRE"
        o.hide_render = True
        return o

    # 가구: 상자 하나와 그만 한 충돌 상자
    def solid(self, name, lo, hi, mat="furn", pad=0.02):
        self.box(name, lo, hi, mat)
        self.collider(name, (lo[0] - pad, lo[1] - pad, 0), (hi[0] + pad, hi[1] + pad, hi[2]))

    # 축에 나란한 벽. a, b: 바닥면의 두 끝 (x, y). gaps: [(시작, 끝, 턱, 머리)] — 벽이 달리는 축의 좌표.
    # 턱이 0이면 문(지나다닌다), 0보다 크면 창(유리를 끼우고 막는다).
    def wall(self, name, a, b, z1, t=0.15, z0=0.0, gaps=(), mat="wall", glass=True, collide=True):
        along = 0 if abs(b[0] - a[0]) >= abs(b[1] - a[1]) else 1
        s0, s1 = sorted((a[along], b[along]))
        fixed = a[1 - along]

        def seg(nm, u0, u1, lo_z, hi_z, m=mat, th=t, col=None):
            if u1 - u0 < 0.005 or hi_z - lo_z < 0.005:
                return
            lo, hi = [0, 0, lo_z], [0, 0, hi_z]
            lo[along], hi[along] = u0, u1
            lo[1 - along], hi[1 - along] = fixed - th / 2, fixed + th / 2
            if col:
                self.collider(nm, lo, hi)
            else:
                self.box(nm, lo, hi, m, arch=True)

        cuts = sorted(gaps)
        u = s0
        run = s0  # 문이 나오기 전까지 이어지는 충돌 구간의 시작
        for i, (g0, g1, sill, head) in enumerate(cuts):
            seg(f"{name}_s{i}", u, g0, z0, z1)
            seg(f"{name}_sill{i}", g0, g1, z0, sill)
            seg(f"{name}_head{i}", g0, g1, head, z1)
            if sill > 0 and glass:
                seg(f"{name}_glass{i}", g0, g1, sill, head, "glass", 0.012)
            if sill <= 0:
                if collide:
                    seg(f"{name}_{i}", run, g0, z0, z1, col=True)
                run = g1
            u = g1
        seg(f"{name}_s{len(cuts)}", u, s1, z0, z1)
        if collide:
            seg(f"{name}_{len(cuts)}", run, s1, z0, z1, col=True)

    # 네 벽으로 둘러싼 방. gaps: {"s": [...], "n": [...], "w": [...], "e": [...]} — s/n 벽은 x, w/e 벽은 y 좌표.
    def room(self, name, x0, y0, x1, y1, h, gaps=None, floor="floor", ceil=True, t=0.15, lamps=()):
        gaps = gaps or {}
        self.box(f"{name}_floor", (x0, y0, -0.08), (x1, y1, 0), floor, arch=True)
        if ceil:
            self.box(f"{name}_ceiling", (x0, y0, h), (x1, y1, h + 0.06), "ceil", arch=True)
        if "s" in gaps: self.wall(f"{name}_ws", (x0, y0), (x1, y0), h, t, gaps=gaps["s"])
        if "n" in gaps: self.wall(f"{name}_wn", (x0, y1), (x1, y1), h, t, gaps=gaps["n"])
        if "w" in gaps: self.wall(f"{name}_ww", (x0, y0), (x0, y1), h, t, gaps=gaps["w"])
        if "e" in gaps: self.wall(f"{name}_we", (x1, y0), (x1, y1), h, t, gaps=gaps["e"])
        for i, (lx, ly) in enumerate(lamps):
            self.box(f"lamp_{name}{i}", (lx - 0.5, ly - 0.12, h - 0.04), (lx + 0.5, ly + 0.12, h - 0.005), "glass", arch=True)

    def markers(self, items):
        for name, loc, yaw in items:
            e = bpy.data.objects.new(name, None)
            big = name.startswith(("spawn", "npc", "view"))
            e.empty_display_type = "ARROWS" if big else "SPHERE"
            e.empty_display_size = 0.25 if big else 0.12
            e.location = loc
            e.rotation_euler = (0, 0, math.radians(yaw))
            self.mark.objects.link(e)

    def report(self):
        return f"{self.name}: {len(self.arch.objects)} arch, {len(self.furn.objects)} furniture, {len(self.cols.objects)} colliders, {len(self.mark.objects)} markers"
