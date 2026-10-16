import type { SbRenderer } from './scratchblocksRuntime';
import type { StageKind } from './blockStage';

/**
 * 工作区背景里那些只有描边的「虚拟积木」：同一套 scratchblocks 渲染，去掉文字和填充，
 * 分三层景深缓慢漂移，指针移动时有一点视差。动效关时静止。
 */

const OL_CODE: Record<string, string> = {
  hat: 'when flag clicked',
  move: 'move (10) steps',
  say: 'say [Hello!] for (2) seconds',
  turn: 'turn cw (15) degrees',
  forever: 'forever\nmove (10) steps\nend',
  ifc: 'if <> then\nend',
  repeat: 'repeat (10)\nnext costume\nwait (1) seconds\nend',
  rep: '(x position)',
  join: '(join [apple] [banana])',
  bool: '<key [space v] pressed?>',
  stop: 'stop [all v]'
};

/* 摆放：[形状, x, y, 缩放, 角度, 透明度, 景深(0 远 → 2 近)]，坐标是工作区像素；中间（真积木和口号）尽量留空 */
type Placement = [string, number, number, number, number, number, 0 | 1 | 2];
const OL_LAYOUT: Record<StageKind, Placement[]> = {
  desk: [
    ['ifc', 488, -46, 1.3, 8, 0.12, 0], ['hat', 296, 34, 1.0, -5, 0.17, 1], ['rep', 58, 104, 0.75, -4, 0.19, 2], ['move', -56, 170, 1.0, -7, 0.13, 0],
    ['bool', 424, 246, 0.75, -6, 0.16, 1], ['forever', 446, 322, 1.0, 5, 0.14, 1], ['stop', 500, 494, 0.8, -9, 0.18, 2], ['turn', 236, 508, 0.55, 6, 0.19, 2],
    ['say', -64, 522, 1.0, 3, 0.13, 1], ['repeat', 372, 598, 1.3, -6, 0.11, 0], ['join', 214, 690, 0.9, 2, 0.13, 1]
  ],
  phone: [
    ['ifc', 286, -28, 0.9, 8, 0.11, 0], ['rep', 302, 56, 0.6, 5, 0.17, 2], ['hat', 262, 108, 0.78, -6, 0.15, 1],
    ['say', -70, 300, 0.9, 3, 0.12, 1], ['forever', 300, 286, 0.82, -6, 0.12, 0], ['stop', 186, 318, 0.62, 7, 0.16, 2]
  ]
};

interface Outline {
  inner: string;
  w: number;
  h: number;
}

let outlines: Record<string, Outline> | null = null;

function buildOutlines(renderer: SbRenderer): Record<string, Outline> {
  const result: Record<string, Outline> = {};
  for (const [k, code] of Object.entries(OL_CODE)) {
    const svg = renderer.render(code, ['en']);
    svg.querySelectorAll('defs, text, use, image, line').forEach((n) => n.remove());
    svg.querySelectorAll('*').forEach((n) => {
      n.removeAttribute('class');
      n.removeAttribute('style');
    });
    result[k] = { inner: svg.innerHTML, w: Number(svg.getAttribute('width')), h: Number(svg.getAttribute('height')) };
  }
  return result;
}

/** 把描边积木画进 host，视差跟着 ws 上的指针走。返回清理函数。 */
export function mountOutlines(host: HTMLElement, ws: HTMLElement, kind: StageKind, renderer: SbRenderer, reduceMotion: () => boolean): () => void {
  outlines ??= buildOutlines(renderer);
  const OL = outlines;
  const depths = [0, 1, 2].map((d) => {
    const g = document.createElement('div');
    g.className = 'ol-d';
    g.dataset.d = String(d);
    host.appendChild(g);
    return g;
  });
  OL_LAYOUT[kind].forEach(([k, x, y, s, rot, op, d], i) => {
    const o = OL[k];
    if (!o) return;
    const dx = ((i * 37) % 17) - 8;
    const dy = -6 - ((i * 23) % 11);
    depths[d].insertAdjacentHTML(
      'beforeend',
      `<svg class="ol-s" width="${(o.w * s).toFixed(1)}" height="${(o.h * s).toFixed(1)}" viewBox="0 0 ${o.w} ${o.h}" style="left:${x}px;top:${y}px;rotate:${rot}deg;--o:${op};--sw:${(1.1 / s).toFixed(3)}px;--t:${44 + ((i * 13) % 30)}s;--dl:-${(i * 7) % 40}s;--dx:${dx}px;--dy:${dy}px">${o.inner}</svg>`
    );
  });
  const onMove = (e: PointerEvent): void => {
    if (reduceMotion()) return;
    const r = ws.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const mx = (e.clientX - r.left) / r.width - 0.5;
    const my = (e.clientY - r.top) / r.height - 0.5;
    depths.forEach((g, d) => {
      const k = (d + 1) * 5;
      g.style.transform = `translate(${(-mx * k).toFixed(1)}px, ${(-my * k).toFixed(1)}px)`;
    });
  };
  const onLeave = (): void => depths.forEach((g) => {
    g.style.transform = '';
  });
  ws.addEventListener('pointermove', onMove);
  ws.addEventListener('pointerleave', onLeave);
  return () => {
    ws.removeEventListener('pointermove', onMove);
    ws.removeEventListener('pointerleave', onLeave);
    depths.forEach((g) => g.remove());
  };
}
