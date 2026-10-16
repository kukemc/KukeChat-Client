"""
KukeChat 图标矢量复刻：从 src/assets/logo.png 量出几何和颜色，拟合成 SVG 参数，再生成各个版本的 SVG。

运行（在 KukeChat-Client 根目录）：
    python dev/login-concepts/logo/tools/replicate.py fit     # 量图 + 拟合，写 tools/params.json（约 1–3 分钟）
    python dev/login-concepts/logo/tools/replicate.py build   # 按 params.json 生成 logo/*.svg
    python dev/login-concepts/logo/tools/replicate.py diff    # 用本机 Chrome 把 kukechat-icon.svg 渲染成 PNG，和原图做像素差（写 tools/diff/）
依赖：Python 3.10+、numpy、scipy、Pillow；diff 需要本机装了 Chrome（或用环境变量 CHROME 指定路径）。

做法：
  · 外轮廓：原图 alpha 通道逐角拟合（每个角一段三次贝塞尔，半径 R + 收紧系数 k）。
  · 内圈发光边：从中心向外打射线找亮度峰的亚像素位置，拟合圆角矩形中心线。
  · 气泡：同样打射线取描边中心线（720 个采样），轻度平滑后用 Catmull-Rom 自适应取点，偏差 ≤ 0.12px。
  · 颜色 / 线宽 / 发光：把 SVG 的画法（线性渐变 + 高光叠层 + 高斯模糊发光 + 正常叠加）在 numpy 里一模一样地实现一遍，
    用最小二乘对原图拟合全部参数，所以拟合出来的数字可以原样写进 SVG。
"""
import json, math, os, subprocess, sys, tempfile
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as nd
from scipy.optimize import least_squares, minimize
from scipy.spatial import cKDTree

HERE = os.path.dirname(os.path.abspath(__file__))
LOGO_DIR = os.path.dirname(HERE)
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
SRC = os.path.join(ROOT, 'src', 'assets', 'logo.png')
PARAMS = os.path.join(HERE, 'params.json')
S = 256
X, Y = np.meshgrid(np.arange(S) + 0.5, np.arange(S) + 0.5)
GRID = np.stack([X.ravel(), Y.ravel()], 1)


def f(v, nd_=2):
    s = ('%.' + str(nd_) + 'f') % v
    s = s.rstrip('0').rstrip('.') if '.' in s else s
    return '0' if s in ('-0', '') else s


def load_src():
    a = np.array(Image.open(SRC).convert('RGBA')).astype(float) / 255
    pm = a[..., :3] * a[..., 3:4]  # 预乘
    return pm, a[..., 3]


# ───────── 几何 ─────────
def bez(p0, c1, c2, p3, n=48):
    t = np.linspace(0, 1, n)[:, None]
    return (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * c1 + 3 * (1 - t) * t ** 2 * c2 + t ** 3 * p3


def rrect(x0, y0, x1, y1, corners):
    """圆角矩形：corners = [(R,k)]×4，顺序 左上 右上 右下 左下。返回 (SVG d, 密集折线)。"""
    (R0, k0), (R1, k1), (R2, k2), (R3, k3) = corners
    A = np.array
    segs = [
        ('L', A([x1 - R1, y0])),
        ('C', A([x1 - R1 * (1 - k1), y0]), A([x1, y0 + R1 * (1 - k1)]), A([x1, y0 + R1])),
        ('L', A([x1, y1 - R2])),
        ('C', A([x1, y1 - R2 * (1 - k2)]), A([x1 - R2 * (1 - k2), y1]), A([x1 - R2, y1])),
        ('L', A([x0 + R3, y1])),
        ('C', A([x0 + R3 * (1 - k3), y1]), A([x0, y1 - R3 * (1 - k3)]), A([x0, y1 - R3])),
        ('L', A([x0, y0 + R0])),
        ('C', A([x0, y0 + R0 * (1 - k0)]), A([x0 + R0 * (1 - k0), y0]), A([x0 + R0, y0])),
    ]
    start = A([x0 + R0, y0])
    d = f'M{f(start[0], 3)} {f(start[1], 3)}'
    pts = [start[None]]
    cur = start
    for s in segs:
        if s[0] == 'L':
            d += f'L{f(s[1][0], 3)} {f(s[1][1], 3)}'
            t = np.linspace(0, 1, max(2, int(np.linalg.norm(s[1] - cur) * 4)))[:, None]
            pts.append(cur + (s[1] - cur) * t); cur = s[1]
        else:
            d += 'C' + ' '.join(f'{f(p[0], 3)} {f(p[1], 3)}' for p in s[1:])
            pts.append(bez(cur, s[1], s[2], s[3], 160)); cur = s[3]
    return d + 'Z', np.concatenate(pts)


def catmull(P, idx):
    """Catmull-Rom 过点 P[idx]，返回 (SVG d, 密集折线)。"""
    m = len(idx); d = f'M{f(P[idx[0]][0])} {f(P[idx[0]][1])}'; pts = []
    for j in range(m):
        p0, p1, p2, p3 = P[idx[j - 1]], P[idx[j]], P[idx[(j + 1) % m]], P[idx[(j + 2) % m]]
        c1 = p1 + (p2 - p0) / 6; c2 = p2 - (p3 - p1) / 6
        d += f'C{f(c1[0])} {f(c1[1])} {f(c2[0])} {f(c2[1])} {f(p2[0])} {f(p2[1])}'
        pts.append(bez(p1, c1, c2, p2, 24))
    return d + 'Z', np.concatenate(pts)


def poly_cov(pts, ss=6):
    im = Image.new('L', (S * ss, S * ss), 0)
    ImageDraw.Draw(im).polygon([(x * ss, y * ss) for x, y in pts], fill=255)
    return np.array(im.resize((S, S), Image.BOX)).astype(float) / 255


def dist_to(pts):
    # 折线足够密（≤0.25px），点距近似线距
    dense = []
    for a, b in zip(pts, np.roll(pts, -1, 0)):
        n = max(1, int(np.linalg.norm(b - a) / 0.2))
        dense.append(a + (b - a) * np.linspace(0, 1, n, endpoint=False)[:, None])
    return cKDTree(np.concatenate(dense)).query(GRID)[0].reshape(S, S)


def ridge(B, cx, cy, r0, r1, step=0.5):
    out = []
    for th in np.arange(0, 360, step):
        t = math.radians(th); rs = np.arange(r0, r1, 0.05)
        xs = cx + rs * math.cos(t) - 0.5; ys = cy + rs * math.sin(t) - 0.5
        ok = (xs > 0) & (xs < S - 1) & (ys > 0) & (ys < S - 1)
        v = nd.map_coordinates(B, [ys, xs], order=3); v[~ok] = 0
        i = int(np.argmax(v)); m = np.abs(rs - rs[i]) < 1.6
        w = np.clip(v[m] - 0.5 * v[i], 0, None)
        r = (rs[m] * w).sum() / w.sum()
        out.append((cx + r * math.cos(t), cy + r * math.sin(t)))
    return np.array(out)


def measure():
    pm, alpha = load_src(); B = pm.max(-1)
    geo = {}
    # 外轮廓：逐角拟合 alpha
    N = 72
    def corner_cov(R, k):
        p0 = np.array([0, R]); p3 = np.array([R, 0])
        pts = list(bez(p0, np.array([0, R * (1 - k)]), np.array([R * (1 - k), 0]), p3, 80)) + [(N, 0), (N, N), (0, N)]
        im = Image.new('L', (N * 8, N * 8), 0); ImageDraw.Draw(im).polygon([(x * 8, y * 8) for x, y in pts], fill=255)
        return np.array(im.resize((N, N), Image.BOX)).astype(float) / 255
    corners = []
    for sub in (alpha[:N, :N], alpha[:N, ::-1][:, :N], alpha[::-1, ::-1][:N, :N], alpha[::-1, :N][:N]):
        r = minimize(lambda p: ((corner_cov(*p) - sub) ** 2).sum(), [58, 0.56], method='Nelder-Mead', options={'xatol': 1e-3, 'fatol': 1e-4})
        corners.append([float(r.x[0]), float(r.x[1])])
    geo['sil'] = {'box': [0, 0, S, S], 'corners': corners}
    # 内圈发光边
    rp = ridge(B, 128, 127, 100, 182)
    def rr_err(p):
        _, pts = rrect(p[0], p[1], p[2], p[3], [(p[4], p[5])] * 4)
        return (cKDTree(pts).query(rp)[0] ** 2).mean()
    r = minimize(rr_err, [5.5, 4.8, 250.5, 250.7, 65, 0.55], method='Nelder-Mead', options={'maxiter': 4000, 'xatol': 1e-4, 'fatol': 1e-7})
    geo['ring'] = {'box': [float(v) for v in r.x[:4]], 'corners': [[float(r.x[4]), float(r.x[5])]] * 4, 'rms': float(math.sqrt(r.fun))}
    # 气泡中心线（只在 r>42 找，避开两个点）
    bp = ridge(B, 128, 122, 42, 95)
    bp = np.stack([nd.gaussian_filter1d(bp[:, 0], 1.0, mode='wrap'), nd.gaussian_filter1d(bp[:, 1], 1.0, mode='wrap')], 1)
    Np = len(bp); idx = list(range(0, Np, 16))
    for _ in range(14):
        _, C = catmull(bp, idx); d = cKDTree(C).query(bp)[0]; add = set()
        for j in range(len(idx)):
            a, b = idx[j], idx[(j + 1) % len(idx)]; span = (b - a) % Np
            if span > 1 and max(d[(a + q) % Np] for q in range(span)) > 0.12: add.add((a + span // 2) % Np)
        if not add: break
        idx = sorted(set(idx) | add)
    geo['bubble'] = {'pts': [[round(float(x), 3), round(float(y), 3)] for x, y in bp[idx]], 'maxdev': float(d.max())}
    # 两个点：亮度过半的区域求质心和等面积半径（初值，后面一起拟合）
    dots = []
    for cx, cy in ((102, 125), (149, 120)):
        sub = B[cy - 20:cy + 20, cx - 20:cx + 20]; m = sub > sub.max() * 0.5; ys, xs = np.nonzero(m)
        dots.append([cx - 20 + xs.mean() + 0.5, cy - 20 + ys.mean() + 0.5, math.sqrt(m.sum() / math.pi)])
    geo['dots'] = dots
    return geo


# ───────── 和 SVG 画法一致的 numpy 模型 ─────────
class Model:
    def __init__(self, geo):
        self.geo = geo
        g = geo
        self.sil_d, sil_pts = rrect(*g['sil']['box'], g['sil']['corners'])
        self.ring_d, ring_pts = rrect(*g['ring']['box'], g['ring']['corners'])
        bp = np.array(g['bubble']['pts']); self.bub_d, bub_pts = catmull(bp, list(range(len(bp))))
        self.Sil = poly_cov(sil_pts); self.RingIn = poly_cov(ring_pts); self.BubIn = poly_cov(bub_pts)
        self.dSil = dist_to(sil_pts); self.dRing = dist_to(ring_pts); self.dBub = dist_to(bub_pts)
        self.ring_pts, self.bub_pts = ring_pts, bub_pts
        # 渐变端点按图形在方向上的投影范围
        self.spec = []

    @staticmethod
    def grad_ends(pts, theta):
        d = np.array([math.cos(theta), math.sin(theta)]); c = pts.mean(0)
        pr = (pts - c) @ d
        return c + pr.min() * d, c + pr.max() * d

    @staticmethod
    def lin(p1, p2, stops):
        """SVG linearGradient（userSpaceOnUse、等距色标、pad）在每个像素中心的取值。stops: (n,c)。"""
        v = p2 - p1; u = np.clip(((X - p1[0]) * v[0] + (Y - p1[1]) * v[1]) / (v @ v), 0, 1)
        n = len(stops); t = u * (n - 1); i = np.clip(np.floor(t).astype(int), 0, n - 2); fr = (t - i)[..., None]
        st = np.asarray(stops)
        return st[i] * (1 - fr) + st[i + 1] * fr

    @staticmethod
    def over(dst, src):  # 预乘 RGBA
        return src + dst * (1 - src[..., 3:4])

    @staticmethod
    def blur(img, s):
        return np.stack([nd.gaussian_filter(img[..., c], s, mode='constant') for c in range(img.shape[-1])], -1) if s > 0.05 else img

    @staticmethod
    def stroke(dist, w):
        return np.clip(w / 2 + 0.5 - dist, 0, 1)

    @staticmethod
    def lay(cov, rgb, a=1.0):
        cov = cov[..., None] * a
        return np.concatenate([rgb * cov, cov], -1)

    def bubble_layer(self, P):
        """气泡描边：底色渐变 + 白色叠层 + 黑色叠层（三层同一条描边），返回清晰版（预乘 RGBA）。"""
        bcov = self.stroke(self.dBub, P['bub_w'])
        p1, p2 = self.grad_ends(self.bub_pts, P['bub_theta'])
        out = self.lay(bcov, self.lin(p1, p2, P['bub_stops']))
        for key, col in (('ov1', 1.0), ('ov2', 0.0)):
            q1, q2 = self.grad_ends(self.bub_pts, P[key + '_theta'])
            a = self.lin(q1, q2, np.array(P[key + '_alpha'])[:, None])[..., 0]
            out = self.over(out, self.lay(bcov * a, np.full(3, col)))
        return out

    def ring_layer(self, P, key='ring_stops'):
        p1, p2 = self.grad_ends(self.ring_pts, P['ring_theta'])
        q1, q2 = self.grad_ends(self.ring_pts, P['ring_theta'] + math.pi / 2)
        rm = self.lin(q1, q2, np.array(P['ring_mask'])[:, None])[..., 0]
        return self.lay(self.stroke(self.dRing, P['ring_w']) * rm, self.lin(p1, p2, P[key]))

    def bubble_glow_src(self, P):
        p1, p2 = self.grad_ends(self.bub_pts, P['bub_theta'])
        return self.lay(self.stroke(self.dBub, P['bub_w']), self.lin(p1, p2, P['bubglow_stops']))

    def render_under(self, P):
        """底、外沿灰边、内底渐变、内圈发光边。"""
        out = np.zeros((S, S, 4))
        out = self.over(out, self.lay(self.Sil, np.array(P['sil_color'])))
        out = self.over(out, self.lay(self.stroke(self.dSil, P['rim_w'] * 2) * self.Sil, np.full(3, P['rim_gray'])))
        out = self.over(out, self.lay(self.RingIn, self.lin(np.array([128, 4.8]), np.array([128, 250.7]), P['bg_stops'])))
        t1, t2 = self.grad_ends(self.ring_pts, P['tint_theta'])
        ta = self.lin(t1, t2, np.array(P['tint_alpha'])[:, None])[..., 0]
        out = self.over(out, self.lay(self.RingIn * ta, np.array(P['tint_color'])))
        ring = self.ring_layer(P); rglow = self.ring_layer(P, 'ringglow_stops')
        out = self.over(out, self.blur(rglow, P['ring_g1_s']) * P['ring_g1_a'] * self.Sil[..., None])
        out = self.over(out, self.blur(rglow, P['ring_g2_s']) * P['ring_g2_a'] * self.RingIn[..., None])
        out = self.over(out, self.blur(ring, P['ring_core_s']) * self.Sil[..., None])
        return out

    def render_top(self, P, under=None):
        """气泡（外发光、内发光、柔化后的描边本体）和两个点。under=None 时画在透明底上。"""
        out = np.zeros((S, S, 4)) if under is None else under
        bub = self.bubble_layer(P); glow = self.bubble_glow_src(P)
        out = self.over(out, self.blur(glow, P['bub_g3_s']) * P['bub_g3_a'])
        out = self.over(out, self.blur(glow, P['bub_g1_s']) * P['bub_g1_a'])
        out = self.over(out, self.blur(glow, P['bub_g2_s']) * P['bub_g2_a'] * self.BubIn[..., None])
        out = self.over(out, self.blur(bub, P['bub_core_s']))
        dots = np.zeros((S, S, 4))
        th = P['dot_theta']; dv = np.array([math.cos(th), math.sin(th)])
        for k, (cx, cy, r) in enumerate(P['dots']):
            cov = np.clip(r + 0.5 - np.hypot(X - cx, Y - cy), 0, 1)
            c = np.array([cx, cy])
            dots = self.over(dots, self.lay(cov, self.lin(c - r * dv, c + r * dv, P['dot_stops'][k])))
        out = self.over(out, self.blur(dots, P['dot_g_s']) * P['dot_g_a'])
        out = self.over(out, self.blur(dots, P['dot_core_s']))
        return out

    def render(self, P):
        return self.render_top(P, self.render_under(P))


UNDER = [  # 名字, 形状, 初值, 下界, 上界
    ('sil_color', (3,), [0.01, 0.01, 0.02], 0, 0.2),
    ('rim_w', (), 0.4, 0.0, 3),
    ('rim_gray', (), 0.3, 0, 0.6),
    ('bg_stops', (3, 3), [[0.05, 0.04, 0.17], [0.01, 0.01, 0.07], [0.01, 0.02, 0.06]], 0, 1),
    ('tint_theta', (), -0.6, -math.pi, math.pi),
    ('tint_color', (3,), [0.35, 0.12, 0.6], 0, 1),
    ('tint_alpha', (3,), [0.0, 0.0, 0.15], 0, 1),
    ('ring_theta', (), -0.78, -math.pi, math.pi),
    ('ring_stops', (7, 3), [[0.25, 0.4, 1], [0.22, 0.3, 0.8], [0.2, 0.22, 0.7], [0.4, 0.25, 0.8], [0.62, 0.31, 0.93]], 0, 1),
    ('ring_mask', (5,), [1, 1, 0.5], 0, 1),
    ('ringglow_stops', (7, 3), [[0.25, 0.4, 1], [0.22, 0.3, 0.8], [0.2, 0.22, 0.7], [0.4, 0.25, 0.8], [0.62, 0.31, 0.93]], 0, 1),
    ('ring_w', (), 1.6, 0.3, 4),
    ('ring_core_s', (), 0.4, 0.06, 2),
    ('ring_g1_s', (), 1.0, 0.1, 6),
    ('ring_g1_a', (), 0.3, 0, 1),
    ('ring_g2_s', (), 9, 2, 40),
    ('ring_g2_a', (), 0.8, 0, 1),
]
TOP = [
    ('bub_theta', (), 0.08, -math.pi, math.pi),
    ('bub_stops', (8, 3), [[0.15, 0.62, 1], [0.2, 0.5, 1], [0.35, 0.3, 1], [0.4, 0.15, 1], [0.38, 0.1, 0.95], [0.3, 0.1, 0.7]], 0, 1),
    ('bubglow_stops', (8, 3), [[0.05, 0.4, 1], [0.1, 0.3, 1], [0.2, 0.15, 1], [0.3, 0.05, 1], [0.3, 0.05, 0.9], [0.25, 0.05, 0.7]], 0, 1),
    ('ov1_theta', (), 1.41, -math.pi, math.pi),
    ('ov1_alpha', (7,), [0.5, 0.25, 0.05, 0.1, 0.3], 0, 1),
    ('ov2_theta', (), 0.0, -math.pi, math.pi),
    ('ov2_alpha', (7,), [0.0, 0.0, 0.0, 0.1, 0.3], 0, 1),
    ('bub_w', (), 2.0, 0.5, 5),
    ('bub_core_s', (), 0.6, 0.06, 2.5),
    ('bub_g1_s', (), 2.3, 0.2, 8),
    ('bub_g1_a', (), 0.7, 0, 1),
    ('bub_g2_s', (), 9, 2, 40),
    ('bub_g2_a', (), 1.0, 0, 1),
    ('bub_g3_s', (), 14, 4, 40),
    ('bub_g3_a', (), 0.3, 0, 1),
    ('dots', (2, 3), None, None, None),
    ('dot_theta', (), -0.64, -math.pi, math.pi),
    ('dot_stops', (2, 3, 3), [[[0.26, 0.52, 0.98], [0.52, 0.31, 0.97]], [[0.31, 0.38, 0.98], [0.62, 0.31, 0.97]]], 0, 1),
    ('dot_core_s', (), 0.4, 0.06, 2),
    ('dot_g_s', (), 1.0, 0.1, 6),
    ('dot_g_a', (), 0.6, 0, 1),
]
SPEC = UNDER + TOP


def pack(P, spec):
    v, lo, hi = [], [], []
    for name, shape, _, a, b in spec:
        arr = np.asarray(P[name], float).ravel(); v += list(arr)
        if name == 'dots':
            for cx, cy, r in np.asarray(P[name]).reshape(-1, 3):
                lo += [cx - 3, cy - 3, r - 3]; hi += [cx + 3, cy + 3, r + 3]
        else:
            lo += [a] * arr.size; hi += [b] * arr.size
    return np.array(v), np.array(lo), np.array(hi)


def unpack(v, spec, base=None):
    P, i = dict(base or {}), 0
    for name, shape, *_ in spec:
        n = int(np.prod(shape)) if shape else 1
        chunk = v[i:i + n]; i += n
        P[name] = float(chunk[0]) if not shape else np.asarray(chunk).reshape(shape).tolist()
    return P


# ── 并行有限差分：16 核下雅可比一列一个进程 ──
_W = {}
def _winit(geo, target, mask, stage, fixed, under):
    _W.update(M=Model(geo), T=target, mask=mask, stage=stage, fixed=fixed, under=under)


def _res(v):
    spec = UNDER if _W['stage'] == 'under' else TOP if _W['stage'] == 'top' else SPEC
    P = unpack(v, spec, _W['fixed'])
    M = _W['M']
    if _W['stage'] == 'under': out = M.render_under(P)
    elif _W['stage'] == 'top': out = M.render_top(P, _W['under'].copy())
    else: out = M.render(P)
    return ((out - _W['T']) * _W['mask']).ravel()


def _col(args):
    v, j, h = args
    v2 = v.copy(); v2[j] += h
    return j, _res(v2)


def run_stage(geo, target, mask, stage, fixed, under, v0, lo, hi, iters):
    import multiprocessing as mp
    with mp.Pool(min(16, os.cpu_count() or 4), initializer=_winit, initargs=(geo, target, mask, stage, fixed, under)) as pool:
        _winit(geo, target, mask, stage, fixed, under)
        def jac(v):
            hs = 1e-3 * np.maximum(1, np.abs(v))
            hs = np.where(v + hs > hi, -hs, hs)
            f0 = _res(v); J = np.empty((f0.size, v.size))
            for j, fj in pool.map(_col, [(v, j, hs[j]) for j in range(v.size)]):
                J[:, j] = (fj - f0) / hs[j]
            return J
        r = least_squares(_res, v0, jac=jac, bounds=(lo, hi), x_scale='jac', max_nfev=iters, verbose=1)
    return r.x


def fit():
    print('量图…'); geo = measure()
    print('  外轮廓角', [[round(a, 2), round(b, 3)] for a, b in geo['sil']['corners']])
    print('  发光边', [round(v, 3) for v in geo['ring']['box']], geo['ring']['corners'][0], 'rms', round(geo['ring']['rms'], 3))
    print('  气泡点数', len(geo['bubble']['pts']), '中心线偏差', round(geo['bubble']['maxdev'], 3))
    M = Model(geo)
    pm, alpha = load_src()
    target = np.concatenate([pm, alpha[..., None]], -1)
    def fit_shape(init, shape):
        a = np.asarray(init, float)
        if not shape or a.shape == tuple(shape): return init
        ax = 1 if a.ndim == 3 else 0; t_old = np.linspace(0, 1, a.shape[ax]); t_new = np.linspace(0, 1, shape[ax])
        return np.apply_along_axis(lambda col: np.interp(t_new, t_old, col), ax, a).tolist()
    P = {name: (fit_shape(init, shape) if init is not None else None) for name, shape, init, *_ in SPEC}; P['dots'] = geo['dots']
    if os.path.exists(PARAMS):  # 有上次的结果就从它接着拟合
        old = json.load(open(PARAMS, encoding='utf-8'))['P']
        shapes = {name: shape for name, shape, *_ in SPEC}
        for k, v in old.items():
            if k not in P: continue
            want = shapes[k] if k != 'dots' else np.shape(v)
            if tuple(np.shape(v)) == tuple(want): P[k] = v
            elif np.ndim(v) == len(want):  # 色标数变了：线性重采样（dot_stops 沿第二维）
                ax = 1 if k == 'dot_stops' else 0
                a = np.asarray(v, float); n_new = want[ax]
                t_old = np.linspace(0, 1, a.shape[ax]); t_new = np.linspace(0, 1, n_new)
                P[k] = np.apply_along_axis(lambda col: np.interp(t_new, t_old, col), ax, a).tolist()
    # 第一步：底和发光边，避开气泡和点周围
    far = (M.dBub > 16) & (np.hypot(X - 102, Y - 126) > 20) & (np.hypot(X - 149, Y - 121) > 20)
    v0, lo, hi = pack(P, UNDER); v0 = np.clip(v0, lo + 1e-6, hi - 1e-6)
    print('第一步：底 + 发光边（参数', len(v0), '个）')
    P = unpack(run_stage(geo, target, far[..., None].astype(float), 'under', P, None, v0, lo, hi, 40), UNDER, P)
    # 第二步：气泡和点，底固定
    under = M.render_under(P)
    v0, lo, hi = pack(P, TOP); v0 = np.clip(v0, lo + 1e-6, hi - 1e-6)
    print('第二步：气泡 + 点（参数', len(v0), '个）')
    P = unpack(run_stage(geo, target, np.ones((S, S, 1)), 'top', P, under, v0, lo, hi, 60), TOP, P)
    # 第三步：全部一起微调
    v0, lo, hi = pack(P, SPEC); v0 = np.clip(v0, lo + 1e-6, hi - 1e-6)
    print('第三步：整体微调（参数', len(v0), '个）')
    P = unpack(run_stage(geo, target, np.ones((S, S, 1)), 'all', P, None, v0, lo, hi, 15), SPEC, P)
    out = M.render(P)
    err = np.abs(out - target)[..., :3].max(-1) * 255
    print('模型误差（RGB 0–255）：平均 %.2f，95%% 分位 %.1f，最大 %.0f' % (err.mean(), np.percentile(err, 95), err.max()))
    json.dump({'geo': geo, 'P': P}, open(PARAMS, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


# ───────── 生成 SVG ─────────
def hexc(c):
    return '#%02X%02X%02X' % tuple(int(round(max(0, min(1, x)) * 255)) for x in c)


def stops_xml(stops, op=None):
    n = len(stops)
    return ''.join(f'<stop offset="{f(i / (n - 1), 4)}" stop-color="{hexc(c)}"' + (f' stop-opacity="{f(op[i], 4)}"' if op is not None else '') + '/>' for i, c in enumerate(stops))


def lin_xml(id_, p1, p2, inner):
    return f'<linearGradient id="{id_}" gradientUnits="userSpaceOnUse" x1="{f(p1[0])}" y1="{f(p1[1])}" x2="{f(p2[0])}" y2="{f(p2[1])}">{inner}</linearGradient>'


def blur_xml(id_, s, box='-40 -40 336 336'):
    x, y, w, h = box.split()
    return f'<filter id="{id_}" filterUnits="userSpaceOnUse" x="{x}" y="{y}" width="{w}" height="{h}" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="{f(s, 3)}"/></filter>'


def svg_parts(D, prefix='k'):
    """各图层的 SVG 片段（和 Model 的画法一一对应），供不同版本组合。"""
    geo, P = D['geo'], D['P']
    sil_d, _ = rrect(*geo['sil']['box'], geo['sil']['corners'])
    ring_d, ring_pts = rrect(*geo['ring']['box'], geo['ring']['corners'])
    bp = np.array(geo['bubble']['pts']); bub_d, bub_pts = catmull(bp, list(range(len(bp))))
    q = lambda s: f'{prefix}-{s}'
    ge = Model.grad_ends
    defs = [lin_xml(q('bg'), (128, 4.8), (128, 250.7), stops_xml(P['bg_stops']))]
    t1, t2 = ge(ring_pts, P['tint_theta']); defs.append(lin_xml(q('tint'), t1, t2, stops_xml([P['tint_color']] * 3, P['tint_alpha'])))
    r1, r2 = ge(ring_pts, P['ring_theta']); m1, m2 = ge(ring_pts, P['ring_theta'] + math.pi / 2)
    defs.append(lin_xml(q('ring'), r1, r2, stops_xml(P['ring_stops'])))
    defs.append(lin_xml(q('ringm'), m1, m2, stops_xml([[1, 1, 1]] * len(P['ring_mask']), P['ring_mask'])))
    defs.append(f'<mask id="{q("ringmask")}" maskUnits="userSpaceOnUse" x="0" y="0" width="256" height="256" style="mask-type:alpha"><rect width="256" height="256" fill="url(#{q("ringm")})"/></mask>')
    b1, b2 = ge(bub_pts, P['bub_theta']); defs.append(lin_xml(q('bub'), b1, b2, stops_xml(P['bub_stops'])))
    for key, col in (('ov1', [1, 1, 1]), ('ov2', [0, 0, 0])):
        o1, o2 = ge(bub_pts, P[key + '_theta']); defs.append(lin_xml(q(key), o1, o2, stops_xml([col] * len(P[key + '_alpha']), P[key + '_alpha'])))
    th = P['dot_theta']; dv = np.array([math.cos(th), math.sin(th)])
    for k, (cx, cy, r) in enumerate(P['dots']):
        c = np.array([cx, cy]); defs.append(lin_xml(q(f'dot{k}'), c - r * dv, c + r * dv, stops_xml(P['dot_stops'][k])))
    for nm in ('ring_core_s', 'ring_g1_s', 'ring_g2_s', 'bub_core_s', 'bub_g1_s', 'bub_g2_s', 'bub_g3_s', 'dot_core_s', 'dot_g_s'):
        defs.append(blur_xml(q(nm.replace('_s', '').replace('_', '')), P[nm]))
    defs.append(f'<clipPath id="{q("sil")}"><path d="{sil_d}"/></clipPath>')
    defs.append(f'<clipPath id="{q("in")}"><path d="{ring_d}"/></clipPath>')
    defs.append(f'<clipPath id="{q("bin")}"><path d="{bub_d}"/></clipPath>')
    defs.append(lin_xml(q('ringgl'), r1, r2, stops_xml(P['ringglow_stops'])))
    defs.append(lin_xml(q('bubgl'), b1, b2, stops_xml(P['bubglow_stops'])))
    ring = (f'<g id="{q("ringl")}" mask="url(#{q("ringmask")})"><path d="{ring_d}" fill="none" stroke="url(#{q("ring")})" stroke-width="{f(P["ring_w"], 3)}"/></g>'
            f'<g id="{q("ringglow")}" mask="url(#{q("ringmask")})"><path d="{ring_d}" fill="none" stroke="url(#{q("ringgl")})" stroke-width="{f(P["ring_w"], 3)}"/></g>')
    bubble = (f'<path id="{q("bubp")}" d="{bub_d}"/>'
              f'<g id="{q("bubl")}" fill="none" stroke-width="{f(P["bub_w"], 3)}" stroke-linejoin="round">'
              f'<use href="#{q("bubp")}" stroke="url(#{q("bub")})"/><use href="#{q("bubp")}" stroke="url(#{q("ov1")})"/><use href="#{q("bubp")}" stroke="url(#{q("ov2")})"/></g>'
              f'<use id="{q("bubglow")}" href="#{q("bubp")}" fill="none" stroke="url(#{q("bubgl")})" stroke-width="{f(P["bub_w"], 3)}" stroke-linejoin="round"/>')
    dots = f'<g id="{q("dots")}">' + ''.join(f'<circle cx="{f(cx, 3)}" cy="{f(cy, 3)}" r="{f(r, 3)}" fill="url(#{q(f"dot{k}")})"/>' for k, (cx, cy, r) in enumerate(P['dots'])) + '</g>'
    return dict(defs=''.join(defs), sil_d=sil_d, ring_d=ring_d, bub_d=bub_d, ring=ring, bubble=bubble, dots=dots, P=P, q=q, bub_pts=bub_pts)


def icon_svg(D, prefix='k'):
    p = svg_parts(D, prefix); P, q = p['P'], p['q']
    body = (f'<path d="{p["sil_d"]}" fill="{hexc(P["sil_color"])}"/>'
            f'<g clip-path="url(#{q("sil")})">'
            f'<path d="{p["sil_d"]}" fill="none" stroke="{hexc([P["rim_gray"]] * 3)}" stroke-width="{f(P["rim_w"] * 2, 3)}"/>'
            f'<path d="{p["ring_d"]}" fill="url(#{q("bg")})"/><path d="{p["ring_d"]}" fill="url(#{q("tint")})"/>'
            f'<defs>{p["ring"]}</defs>'
            f'<use href="#{q("ringglow")}" filter="url(#{q("ringg1")})" opacity="{f(P["ring_g1_a"], 4)}"/>'
            f'<g clip-path="url(#{q("in")})"><use href="#{q("ringglow")}" filter="url(#{q("ringg2")})" opacity="{f(P["ring_g2_a"], 4)}"/></g>'
            f'<use href="#{q("ringl")}" filter="url(#{q("ringcore")})"/>'
            + mark_inner(p) + '</g>')
    return body, p


def mark_inner(p, glow_scale=1.0, inner_scale=None):
    """glow_scale：外发光和点的光晕的倍数；inner_scale：气泡内发光的倍数（默认同 glow_scale）。"""
    P, q = p['P'], p['q']
    inner = glow_scale if inner_scale is None else inner_scale
    a = lambda k: f(min(1, P[k] * (inner if k == 'bub_g2_a' else glow_scale)), 4)
    return (f'<defs>{p["bubble"]}{p["dots"]}</defs>'
            f'<use href="#{q("bubglow")}" filter="url(#{q("bubg3")})" opacity="{a("bub_g3_a")}"/>'
            f'<use href="#{q("bubglow")}" filter="url(#{q("bubg1")})" opacity="{a("bub_g1_a")}"/>'
            f'<g clip-path="url(#{q("bin")})"><use href="#{q("bubglow")}" filter="url(#{q("bubg2")})" opacity="{a("bub_g2_a")}"/></g>'
            f'<use href="#{q("bubl")}" filter="url(#{q("bubcore")})"/>'
            f'<use href="#{q("dots")}" filter="url(#{q("dotg")})" opacity="{a("dot_g_a")}"/>'
            f'<use href="#{q("dots")}" filter="url(#{q("dotcore")})"/>')


def wrap(body, defs, vb='0 0 256 256', w=256, h=256, title='KukeChat'):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" width="{f(w)}" height="{f(h)}" role="img" aria-label="{title}">'
            f'<title>{title}</title><defs>{defs}</defs>{body}</svg>\n')


def bbox_of_mark(p):
    pts = p['bub_pts']; P = p['P']
    x0, y0 = pts.min(0); x1, y1 = pts.max(0)
    return x0, y0, x1, y1


def build():
    D = json.load(open(PARAMS, encoding='utf-8'))
    P = D['P']
    out = {}
    body, p = icon_svg(D)
    out['kukechat-icon.svg'] = wrap(body, p['defs'], title='KukeChat')
    # 透明图形：只要气泡 + 两个点（含发光）。视框按图形 + 发光留边裁到正方形
    x0, y0, x1, y1 = bbox_of_mark(p)
    pad = 10
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2; side = max(x1 - x0, y1 - y0) + pad * 2
    vb = f'{f(cx - side / 2)} {f(cy - side / 2)} {f(side)} {f(side)}'
    p2 = svg_parts(D, 'm')
    out['kukechat-mark.svg'] = wrap(mark_inner(p2), p2['defs'], vb, 256, 256, 'KukeChat')
    # 浅底版：同形同色；外发光和点的光晕减到 35%，气泡里面那层内发光去掉（浅底上会变成一团发灰的彩雾），另加一层很淡的投影把描边托出来
    p3 = svg_parts(D, 'l')
    shadow = (f'<filter id="l-sh" filterUnits="userSpaceOnUse" x="-40" y="-40" width="336" height="336">'
              f'<feGaussianBlur in="SourceAlpha" stdDeviation="1.6" result="b"/><feOffset in="b" dy="1" result="o"/>'
              f'<feFlood flood-color="#1B1F3A" flood-opacity="0.28"/><feComposite operator="in" in2="o"/></filter>')
    light_body = mark_inner(p3, 0.35, 0).replace(f'<use href="#l-bubglow" filter="url(#l-bubg3)"', '<g filter="url(#l-sh)"><use href="#l-bubl"/><use href="#l-dots"/></g><use href="#l-bubglow" filter="url(#l-bubg3)"', 1)
    out['kukechat-mark-light.svg'] = wrap(light_body, p3['defs'] + shadow, vb, 256, 256, 'KukeChat')
    # 单色剪影：气泡描边 + 两个实心点（通知栏小图标要纯色 + 透明）。描边在 24dp 下要 ≥1.5dp，所以加粗到 1.9 倍
    mono_w = P['bub_w'] * 1.9
    mono = (f'<path d="{p["bub_d"]}" fill="none" stroke="#000" stroke-width="{f(mono_w, 2)}" stroke-linejoin="round"/>'
            + ''.join(f'<circle cx="{f(c[0], 2)}" cy="{f(c[1], 2)}" r="{f(c[2] * 1.05, 2)}" fill="#000"/>' for c in P['dots']))
    mvb_side = max(x1 - x0, y1 - y0) + 2 * (mono_w / 2 + 2)
    mvb = f'{f(cx - mvb_side / 2)} {f(cy - mvb_side / 2)} {f(mvb_side)} {f(mvb_side)}'
    out['kukechat-mono.svg'] = wrap(mono, '', mvb, 24, 24, 'KukeChat')
    # 安卓自适应图标：108dp 画板，图形放进中间 72dp 可见区里、再留安全边（图形最长边 = 54dp，在 66dp 安全圆内）
    sc = 54 / max(x1 - x0, y1 - y0)
    tr = f'translate({f(54 - cx * sc, 3)} {f(54 - cy * sc, 3)}) scale({f(sc, 5)})'
    p4 = svg_parts(D, 'a')
    out['launcher-foreground.svg'] = wrap(f'<g transform="{tr}">{mark_inner(p4)}</g>', p4['defs'].replace('-40 -40 336 336', '-60 -60 376 376'), '0 0 108 108', 108, 108, 'ic_launcher_foreground')
    # 背景层：原图的深色底（底色 + 竖直渐变 + 内圈发光边），按 108 画板铺满；发光边放在 72dp 可见区边缘
    p5 = svg_parts(D, 'b')
    bsc = 108 / 256
    out['launcher-background.svg'] = wrap(f'<rect width="108" height="108" fill="{hexc(P["bg_stops"][1])}"/><g transform="scale({f(bsc, 5)})"><rect width="256" height="256" fill="url(#b-bg)"/></g>',
                                          lin_xml('b-bg', (128, 0), (128, 256), stops_xml(P['bg_stops'])), '0 0 108 108', 108, 108, 'ic_launcher_background')
    msc = 54 / mvb_side * (mvb_side / max(x1 - x0, y1 - y0))
    out['launcher-monochrome.svg'] = wrap(f'<g transform="translate({f(54 - cx * msc, 3)} {f(54 - cy * msc, 3)}) scale({f(msc, 5)})">{mono}</g>', '', '0 0 108 108', 108, 108, 'ic_launcher_monochrome')
    # 字标：图标 + 「KukeChat」（Inter Display Bold 轮廓，wordmark-text.json），NEXT 版再加一个参数槽形状的胶囊标签
    T = json.load(open(os.path.join(HERE, 'wordmark-text.json'), encoding='utf-8'))
    INK = {'light': '#12141A', 'dark': '#E9ECF2'}
    side_l = max(x1 - x0, y1 - y0) + 14  # 字标里图形留边小一点，图形和字的比例才对
    ms = 48 / side_l
    for theme in ('light', 'dark'):
        pre = 'w' + theme[0]
        pp = svg_parts(D, pre)
        mk = mark_inner(pp, 0.35, 0) if theme == 'light' else mark_inner(pp)
        mark_g = f'<g transform="scale({f(ms, 5)}) translate({f(-(cx - side_l / 2), 3)} {f(-(cy - side_l / 2), 3)})">{mk}</g>'
        vis_r = x1 - (cx - side_l / 2)  # 图形右缘在视框里的位置
        tx = vis_r * ms + 8; ts = 30.2 / 100; base = 35
        text = f'<path transform="translate({f(tx)} {base}) scale({ts})" d="{T["brand"]["d"]}" fill="{INK[theme]}"/>'
        w = tx + T['brand']['w'] * ts
        out[f'wordmark-{theme}.svg'] = wrap(mark_g + text, pp['defs'], f'0 0 {f(w + 2)} 48', w + 2, 48, 'KukeChat')
        ns = 12 / 100; padx = 7.6; th_ = 19.6; tw = T['next']['w'] * ns + padx * 2; nx = w + 7
        tag = (f'<rect x="{f(nx)}" y="{f(24 - th_ / 2)}" width="{f(tw)}" height="{f(th_)}" rx="{f(th_ / 2)}" fill="#1F6BFF"/>'
               f'<path transform="translate({f(nx + padx)} {f(24 + T["next"]["cap"] * ns / 2)}) scale({ns})" d="{T["next"]["d"]}" fill="#FFFFFF"/>')
        out[f'wordmark-next-{theme}.svg'] = wrap(mark_g + text + tag, pp['defs'], f'0 0 {f(nx + tw + 2)} 48', nx + tw + 2, 48, 'KukeChat NEXT')
    for name, s in out.items():
        open(os.path.join(LOGO_DIR, name), 'w', encoding='utf-8', newline='\n').write(s)
    print('写出', ', '.join(out))
    diff()
    inject_pages(out)
    return out


# 像素差说明（看过 diff-x4.png 后手写的结论，会原样显示在 logo.html 上）
NOTES = [
 "<b>整体</b>：65,536 个像素逐个比（预乘 RGB，0–255），平均差 4.5、中位数 3；87% 的像素差 ≤ 8（约 3%），原尺寸并排看分不出来。差主要集中在下面几处细线和边缘上。",
 "<b>气泡描边（差最多，线附近平均约 14）</b>：原图那条 2–3px 的线截面是「中间尖、两边很快变暗」的三角形，而且沿线颜色不是一个方向的渐变能表达的（左上偏青白、顶上偏粉白、右侧偏暗紫）。矢量版用 8 色标渐变 + 白 / 黑两层叠色去逼近，顶上和左上的最亮处还暗 10–30。",
 "<b>内圈发光边（平均约 10）</b>：原图这圈细线的亮度沿边有细碎起伏（位图缩放留下的），矢量版是平滑的。",
 "<b>外轮廓 4px（平均约 8）</b>：原图外沿是抠图留下的锯齿和一圈 1px 灰边，四个角的半径也不一样（约 60 / 57 / 51 / 57）。矢量版逐角拟合了半径、保留了灰边，锯齿没有照抄。",
 "<b>两个点（平均约 12）</b>：原图的点有一点立体感（左下偏青、右上偏紫，边上一圈亮边），矢量版用三色标渐变 + 0.6px 柔边，边上的亮边没做。",
 "<b>渲染注意</b>：Chrome 用软件光栅（--disable-gpu）时会忽略不到 1px 的小模糊，点的边缘会变硬一点；正常 GPU 渲染没问题。"
]


def b64png(path):
    import base64
    return 'data:image/png;base64,' + base64.b64encode(open(path, 'rb').read()).decode()


def inject_pages(out):
    import re
    page_dir = os.path.dirname(LOGO_DIR)
    stats = json.load(open(os.path.join(HERE, 'diff', 'stats.json')))
    svgs = {k: v.strip() for k, v in out.items()}
    data = ('const SVGS = ' + json.dumps(svgs, ensure_ascii=False) + ';\n'
            'const PNGS = ' + json.dumps({'src': b64png(SRC), 'render': b64png(os.path.join(HERE, 'diff', 'svg-256.png')), 'diff': b64png(os.path.join(HERE, 'diff', 'diff-x4.png'))}) + ';\n'
            'const STATS = ' + json.dumps(stats) + ';\n'
            'const NOTES = ' + json.dumps(NOTES, ensure_ascii=False) + ';')
    p = os.path.join(page_dir, 'logo.html'); s = open(p, encoding='utf-8').read()
    s = re.sub(r'/\* DATA:BEGIN \*/.*?/\* DATA:END \*/', lambda _: '/* DATA:BEGIN */\n' + data + '\n/* DATA:END */', s, flags=re.S)
    open(p, 'w', encoding='utf-8', newline='').write(s)
    # index.html 的 C 方案：内联 KukeChat NEXT 字标
    p = os.path.join(page_dir, 'index.html'); s = open(p, encoding='utf-8').read()
    kc = {t: re.sub(r'<title>.*?</title>', '', out[f'wordmark-next-{t}.svg'].strip()) for t in ('light', 'dark')}
    blob = ('/* KC_LOGO:BEGIN（logo/wordmark-next-*.svg 原样内联，由 logo/tools/replicate.py build 生成，别手改） */\n'
            'const KC_LOGO = ' + json.dumps(kc, ensure_ascii=False) + ';\n/* KC_LOGO:END */')
    if '/* KC_LOGO:BEGIN' in s:
        s = re.sub(r'/\* KC_LOGO:BEGIN.*?KC_LOGO:END \*/', lambda _: blob, s, flags=re.S)
        open(p, 'w', encoding='utf-8', newline='').write(s)
    print('已刷新 logo.html / index.html 里的内联数据')


def chrome():
    for c in (os.environ.get('CHROME'), r'C:/Program Files/Google/Chrome/Application/chrome.exe', r'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'):
        if c and os.path.exists(c): return c
    raise SystemExit('找不到 Chrome，用环境变量 CHROME 指定')


def render_png(svg_path, size, out_png):
    html = os.path.join(tempfile.gettempdir(), 'kc-render.html')
    svg = open(svg_path, encoding='utf-8').read()
    svg = svg.replace('<svg ', f'<svg style="display:block;width:{size}px;height:{size}px" ', 1)
    open(html, 'w', encoding='utf-8').write(f'<html><body style="margin:0;background:transparent">{svg}</body></html>')
    subprocess.run([chrome(), '--headless=new', '--hide-scrollbars', '--allow-file-access-from-files', '--default-background-color=00000000', '--force-device-scale-factor=1', '--virtual-time-budget=2000',
                    f'--window-size={size},{size}', f'--screenshot={out_png}', 'file:///' + html.replace(os.sep, '/')], capture_output=True, check=True)
    return np.array(Image.open(out_png).convert('RGBA')).astype(float) / 255


def diff():
    os.makedirs(os.path.join(HERE, 'diff'), exist_ok=True)
    pm, alpha = load_src()
    tgt = np.concatenate([pm, alpha[..., None]], -1)
    got = render_png(os.path.join(LOGO_DIR, 'kukechat-icon.svg'), 256, os.path.join(HERE, 'diff', 'svg-256.png'))
    gpm = np.concatenate([got[..., :3] * got[..., 3:4], got[..., 3:4]], -1)
    e = np.abs(gpm - tgt)
    rgbE = e[..., :3].max(-1) * 255
    print('逐像素（预乘 RGB，0–255）：平均 %.2f，中位 %.2f，95%% 分位 %.1f，99%% 分位 %.1f，最大 %.0f' % (
        rgbE.mean(), np.median(rgbE), np.percentile(rgbE, 95), np.percentile(rgbE, 99), rgbE.max()))
    print('alpha：平均 %.3f，最大 %.2f' % (e[..., 3].mean(), e[..., 3].max()))
    print('差值 > 8 的像素占 %.2f%%，> 16 的占 %.2f%%' % ((rgbE > 8).mean() * 100, (rgbE > 16).mean() * 100))
    # 差异热力图（×4 放大差值）
    heat = np.clip(rgbE * 4, 0, 255).astype(np.uint8)
    Image.fromarray(heat).resize((512, 512), Image.NEAREST).save(os.path.join(HERE, 'diff', 'diff-x4.png'))
    json.dump({'mean': float(rgbE.mean()), 'median': float(np.median(rgbE)), 'p95': float(np.percentile(rgbE, 95)), 'p99': float(np.percentile(rgbE, 99)),
               'max': float(rgbE.max()), 'gt8': float((rgbE > 8).mean()), 'gt16': float((rgbE > 16).mean()), 'alpha_mean': float(e[..., 3].mean())},
              open(os.path.join(HERE, 'diff', 'stats.json'), 'w'), indent=1)


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'build'
    {'fit': fit, 'build': build, 'diff': diff}[cmd]()
