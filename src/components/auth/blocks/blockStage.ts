import { APP_NAME } from '@/config';
import { EASE } from './motion';
import type { SbRenderer } from './scratchblocksRuntime';

/**
 * 登录页左边那块「工作区」里的真 Scratch 3 积木：跟着表单实时变、能拖动吸附、点一下运行。
 *
 * 这一块是命令式的 DOM 动画（逐帧插值 SVG 属性、指针拖动），不走 React 渲染：
 * React 只负责给一个空的容器，然后通过 update / setFocus / runMain 把表单状态喂进来。
 *
 * - 每个输入框驱动一块积木：登录 = 说「你好，<用户名>!」+ 将 [密码] 设为 [●●●]；
 *   注册 = 说「欢迎加入，<用户名>!」+ 将 [昵称] 设为 […]（填了昵称才接上来）+ 如果 <[密码] = [确认]> 那么 创建 […] 账号，
 *   两次密码一致时布尔积木由灰变绿。密码只显示成圆点。
 * - 文本变了不换图：离屏渲染新 SVG，把现在这块的路径 / 参数槽 / 文字位置逐个数字插值过去（morph），
 *   文字交叉淡入淡出，每帧同步接缝，下面的积木不会跳。每帧最多渲染一次。
 * - 登录 ⇄ 注册：共享的积木原地变形，独有的积木脱离淡出，另一边的积木错开飞入、吸附上去。
 * - 动效关 / 系统减少动态效果：全部瞬时更新。
 */

export type StageKind = 'desk' | 'phone';
export type StageMode = 'login' | 'reg';
export type StageField = 'u' | 'n' | 'p' | 'c';

export interface StageVars {
  mode: StageMode;
  name: string;
  nick: string;
  pw: string;
  conf: string;
}

type BlockId = 'hat' | 'say' | 'pw' | 'open' | 'chat' | 'nick' | 'ifc' | 'online';

interface BlockDef {
  code: string | ((vars: StageVars) => string);
  hat?: boolean;
  ext?: boolean;
  rep?: boolean;
  bool?: boolean;
  say?: (vars: StageVars) => string;
}

interface Rendered {
  svg: string;
  ghost: string;
  w: number;
  h: number;
  body: number;
  sw: number;
  code: string;
}

interface Stack {
  x: number;
  y: number;
  ids: BlockId[];
}

interface Snap {
  type: 'insert' | 'top';
  stack: Stack;
  at: number;
  gx: number;
  gy: number;
}

interface DragState {
  ids: BlockId[];
  h: number;
  gx: number;
  gy: number;
  x: number;
  y: number;
  wrap: HTMLElement;
  lift: HTMLElement;
  hat: boolean;
  rep: boolean;
  raf: number;
  last: PointerEvent | null;
}

interface Press {
  id: BlockId;
  pid: number;
  cx: number;
  cy: number;
  p: { x: number; y: number };
}

/*
 * KukeChat 扩展里真实存在的积木（src/extension/extension.ts 的 getInfo，文案取 zh-cn）：
 *   windowAction 「将 KukeChat 窗口 [ACTION]」 · recommendFriend 「推荐添加好友 [USER_ID] 附加消息 [EXTRA_MESSAGE]」 · kukeInfo 「获取 KukeChat 信息 [FIELD]」
 * 扩展色 color1/2/3 = #27272a / #18181b / #171717，图标 = src/extension/assets.ts 的 iconSvg。
 */
const EXT = {
  c1: '#27272a',
  c2: '#18181b',
  c3: '#171717',
  icon: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" rx="34" fill="#171717"/><rect x="10" y="10" width="108" height="108" rx="28" fill="#262626" stroke="#525252" stroke-width="2"/><path d="M31 42c0-8.284 6.716-15 15-15h36c8.284 0 15 6.716 15 15v21c0 8.284-6.716 15-15 15H59.8L41.2 94.6C38.6 96.9 34.5 95 34.5 91.5V77.7C28.1 75.9 23.5 70 23.5 63V42H31Z" fill="#f4f4f5"/><circle cx="50" cy="54" r="5.8" fill="#171717"/><circle cx="64" cy="54" r="5.8" fill="#737373"/><circle cx="78" cy="54" r="5.8" fill="#171717"/></svg>')
};

/** 去掉会打断 scratchblocks 语法的字符，截短。 */
export const cleanName = (s: string): string => s.replace(/[[\]()<>{}:\\\n]/g, '').slice(0, 22);
const DOTS = (s: string): string => '•'.repeat(Math.min(s.length, 14));
const sayText = (v: StageVars): string => (v.mode === 'reg' ? `欢迎加入，${v.name || 'Scratcher'}!` : `你好，${v.name || 'Scratcher'}!`);

const SB_DEFS: Record<BlockId, BlockDef> = {
  hat: { code: '当绿旗被点击', hat: true },
  say: { code: (v) => `说 [${sayText(v)}]`, say: sayText },
  pw: { code: (v) => `将 [密码 v] 设为 [${DOTS(v.pw)}]` },
  open: { code: `将 ${APP_NAME} 窗口 [打开 v] :: pen`, ext: true },
  chat: { code: '推荐添加好友 (1) 附加消息 [一起聊天吧!] :: pen', ext: true },
  nick: { code: (v) => `将 [昵称 v] 设为 [${v.nick}]` },
  ifc: { code: (v) => `如果 <[${DOTS(v.pw)}] = [${DOTS(v.conf)}]> 那么\n创建 [${v.name || `新的 ${APP_NAME}`}] 账号 :: custom\nend`, bool: true },
  online: { code: `(获取 ${APP_NAME} 信息 [在线玩家数 v] :: pen)`, ext: true, rep: true }
};
const IDS: Record<StageMode, BlockId[]> = { login: ['hat', 'say', 'pw', 'open', 'chat'], reg: ['hat', 'say', 'nick', 'ifc'] };
const BOUND: BlockId[] = ['say', 'pw', 'nick', 'ifc'];
const LANGS = ['zh_cn', 'en'];
const SB_FONT = 'Arial, "Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif';
const SVGNS = 'http://www.w3.org/2000/svg';
const BASE_VARS: StageVars = { mode: 'login', name: '', nick: '', pw: '', conf: '' };
const SNAP = 40;
const NUM = /-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;
const MATTR = ['d', 'x', 'y', 'width', 'height', 'rx', 'ry', 'transform', 'viewBox'];
const MORPH_MS = 320;

const wait = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms));

function svgEl(tag: string, attrs: Record<string, string | number>): SVGElement {
  const e = document.createElementNS(SVGNS, tag);
  for (const k of Object.keys(attrs)) e.setAttribute(k, String(attrs[k]));
  return e;
}

function htmlEl(html: string): HTMLElement {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
}

/* ═════════ 渲染（所有登录页共用一份缓存） ═════════ */

interface Shared {
  renderer: SbRenderer;
  cache: Partial<Record<BlockId, Rendered>>;
  defs: Element | null;
  styled: WeakSet<Node>;
}

let shared: Shared | null = null;

/** 把 scratchblocks 的样式表放进 node 所在的 document 或 ShadowRoot（扩展是挂在 Shadow DOM 里的）。 */
export function ensureSbStyles(renderer: SbRenderer, node: Node): void {
  const root = node.getRootNode();
  const target = root instanceof ShadowRoot ? root : document.head;
  const key = root instanceof ShadowRoot ? root : document;
  if (!shared) shared = { renderer, cache: {}, defs: null, styled: new WeakSet() };
  if (shared.styled.has(key)) return;
  shared.styled.add(key);
  const style = document.createElement('style');
  style.dataset.klgScratchblocks = '';
  style.textContent = renderer.cssText;
  target.appendChild(style);
}

/** scratchblocks 量字用 Helvetica；中文落到系统字体时宽度不准，量字时补上中文字体。 */
function withFont<T>(fn: () => T): T {
  const proto = CanvasRenderingContext2D.prototype;
  const measure = proto.measureText;
  proto.measureText = function patched(this: CanvasRenderingContext2D, text: string): TextMetrics {
    if (/Helvetica/.test(this.font) && !/YaHei/.test(this.font)) this.font = this.font.replace(/sans-serif\s*$/, SB_FONT);
    return measure.call(this, text);
  };
  try {
    return fn();
  } finally {
    proto.measureText = measure;
  }
}

function extensionize(svg: SVGSVGElement, def: BlockDef): void {
  const use = svg.querySelector('use[href="#sb3-penBlock"]');
  if (use) {
    const x = use.getAttribute('transform')?.match(/translate\(([\d.]+)/)?.[1] ?? '8';
    use.replaceWith(svgEl('image', { href: EXT.icon, width: 40, height: 40, transform: `translate(${x} ${def.rep ? 4 : 8})` }));
  }
  svg.querySelectorAll<SVGElement>('.sb3-extension').forEach((n) => {
    n.classList.remove('sb3-extension');
    if (!n.classList.contains('sb3-input')) {
      n.style.fill = EXT.c1;
      n.style.stroke = EXT.c3;
    } else if (n.classList.contains('sb3-input-dropdown')) {
      n.style.fill = EXT.c2;
      n.style.stroke = EXT.c3;
    }
  });
  svg.querySelectorAll<SVGElement>('.sb3-extension-line').forEach((n) => {
    n.removeAttribute('class');
    n.style.stroke = EXT.c3;
    n.style.strokeWidth = '1';
  });
}

/* 接缝：描边单独一条画在填充下面、顶边被上一块盖住的那段裁掉、底边垫一条本块颜色 */
function seamless(svg: SVGSVGElement, body: number, measureHost: HTMLElement): void {
  measureHost.appendChild(svg);
  const shape = svg.querySelector('path') as SVGPathElement;
  const cs = getComputedStyle(shape);
  const fill = shape.style.fill || cs.fill;
  const stroke = shape.style.stroke || cs.stroke;
  svg.remove();
  const g = shape.parentNode as Element;
  const clip = svgEl('clipPath', { id: '__CLIP__' });
  clip.appendChild(svgEl('path', { class: 'sb-clip', 'clip-rule': 'evenodd', d: 'M-20 -20 H3000 V3000 H-20 Z' }));
  const edge = svgEl('path', { class: 'sb-edge', d: shape.getAttribute('d') ?? '', fill: 'none', stroke, 'stroke-width': 2, 'stroke-linejoin': 'round', 'clip-path': 'url(#__CLIP__)' });
  const filler = svgEl('rect', { class: 'sb-filler', x: 4, y: body - 2, width: 0, height: 3, fill });
  shape.removeAttribute('class');
  shape.style.fill = fill;
  shape.style.stroke = 'none';
  g.insertBefore(clip, shape);
  g.insertBefore(edge, shape);
  g.insertBefore(filler, shape);
}

const codeOf = (def: BlockDef, vars: StageVars): string => (typeof def.code === 'function' ? def.code(vars) : def.code);

function renderBlock(def: BlockDef, measureHost: HTMLElement, vars: StageVars = BASE_VARS): Rendered {
  const s = shared as Shared;
  return withFont(() => {
    const code = codeOf(def, vars);
    const svg = s.renderer.render(code, LANGS);
    const d = svg.querySelector('defs');
    if (d) {
      if (!s.defs) s.defs = d.cloneNode(true) as Element;
      d.remove();
    }
    const w = Number(svg.getAttribute('width'));
    const h = Number(svg.getAttribute('height'));
    const body = def.rep ? h - 2 : h - 10;
    if (def.ext) extensionize(svg, def);
    if (def.bool) svg.querySelector('path.sb3-operators')?.classList.add('pw-bool');
    const ghost = svg.cloneNode(true) as SVGSVGElement;
    const gshape = ghost.querySelector('path, rect');
    if (gshape?.parentNode) [...gshape.parentNode.children].forEach((c) => c !== gshape && c.remove());
    if (!def.rep) seamless(svg, body, measureHost);
    return { svg: svg.outerHTML, ghost: ghost.outerHTML, w, h, body, sw: w - 4, code };
  });
}

/* ═════════ 积木舞台 ═════════ */

export interface BlockStageOptions {
  kind: StageKind;
  vars: StageVars;
  reduceMotion: () => boolean;
  /** 在线人数之类的真实值；没有就是 null，报告积木不显示数值气泡。 */
  onlineValue: string | null;
  /** 手机键盘弹起后，画板能看到的高度（未缩放前的像素）。 */
  phoneKbView?: number;
}

let UID = 0;

export class BlockStage {
  private readonly stage: HTMLElement;
  private readonly kind: StageKind;
  private readonly reduceMotion: () => boolean;
  private onlineValue: string | null;
  private readonly uid = `k${(UID += 1)}`;
  private vars: StageVars;
  private layer!: HTMLElement;
  private ghost!: HTMLElement;
  private probe!: HTMLElement;
  private els: Partial<Record<BlockId, HTMLElement>> = {};
  private own: Partial<Record<BlockId, Rendered>> = {};
  private codes: Partial<Record<BlockId, string>> = {};
  private morphs: Partial<Record<BlockId, number>> = {};
  private animSw: Partial<Record<BlockId, number>> = {};
  private arriving = new Set<BlockId>();
  private pos = new WeakMap<HTMLElement, { x: number; y: number }>();
  private model: { stacks: Stack[]; touched: boolean } = { stacks: [], touched: false };
  private preview: Snap | null = null;
  private drag: DragState | null = null;
  private press: Press | null = null;
  private run = 0;
  private running = false;
  private raf = 0;
  private boolOn = false;
  private focus: StageField | null = null;
  private kb = false;
  private readonly phoneKbView: number;
  private destroyed = false;
  private readonly timers = new Set<number>();
  private readonly resizeObserver: ResizeObserver | null = null;

  constructor(stage: HTMLElement, options: BlockStageOptions) {
    this.stage = stage;
    this.kind = options.kind;
    this.reduceMotion = options.reduceMotion;
    this.onlineValue = options.onlineValue;
    this.vars = { ...options.vars };
    this.phoneKbView = options.phoneKbView ?? 124;
    this.mount();
    stage.addEventListener('pointerdown', this.onPointerDown);
    stage.addEventListener('pointermove', this.onPointerMove);
    stage.addEventListener('pointerup', this.onPointerEnd);
    stage.addEventListener('pointercancel', this.onPointerEnd);
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.onResize());
      this.resizeObserver.observe(stage);
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.run += 1;
    this.stage.removeEventListener('pointerdown', this.onPointerDown);
    this.stage.removeEventListener('pointermove', this.onPointerMove);
    this.stage.removeEventListener('pointerup', this.onPointerEnd);
    this.stage.removeEventListener('pointercancel', this.onPointerEnd);
    this.resizeObserver?.disconnect();
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.drag?.raf) cancelAnimationFrame(this.drag.raf);
    Object.values(this.morphs).forEach((id) => id && cancelAnimationFrame(id));
    this.timers.forEach((id) => window.clearTimeout(id));
    this.layer?.remove();
  }

  /** 表单变了：切换模式时整体换积木，否则只把变化的那几块变形过去。 */
  update(vars: StageVars): void {
    const modeChanged = vars.mode !== this.vars.mode;
    this.vars = { ...vars, name: cleanName(vars.name.trim()), nick: cleanName(vars.nick.trim()) };
    if (modeChanged) {
      this.switchBlocks();
      this.pan();
      return;
    }
    if (this.reduceMotion()) this.sync();
    else this.schedule();
  }

  setOnlineValue(value: string | null): void {
    if (value === this.onlineValue) return;
    this.onlineValue = value;
    if (this.els.online) this.paint('online');
  }

  /** 手机：键盘弹起时画板变矮、积木缩小，镜头对准正在填的那块积木。 */
  setFocus(field: StageField | null, kb: boolean): void {
    this.focus = field;
    this.kb = kb;
    this.pan();
  }

  /** 从帽子积木那一串开始依次「运行」（发光、说话）。 */
  runMain(): Promise<void> {
    this.touch();
    const main = this.model.stacks.find((s) => SB_DEFS[s.ids[0]].hat);
    return this.runIds(main ? main.ids.slice() : []);
  }

  /* ───────── 摆放 / 接缝 ───────── */

  private H(bid: BlockId): number {
    return (shared?.cache[bid] as Rendered).body;
  }

  private cc(bid: BlockId): Rendered {
    return this.own[bid] ?? (shared?.cache[bid] as Rendered);
  }

  private swOf(bid: BlockId): number {
    return this.animSw[bid] ?? this.cc(bid).sw;
  }

  private stackH(ids: BlockId[]): number {
    return ids.reduce((a, b) => a + this.H(b), 0);
  }

  private setT(n: HTMLElement, x: number, y: number, s = 1): void {
    n.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
    this.pos.set(n, { x, y });
  }

  private findStack(bid: BlockId): Stack | undefined {
    return this.model.stacks.find((s) => s.ids.includes(bid));
  }

  private later(fn: () => void, ms: number): void {
    const id = window.setTimeout(() => {
      this.timers.delete(id);
      if (!this.destroyed) fn();
    }, ms);
    this.timers.add(id);
  }

  private setJoin(bid: BlockId, above: number, below: number): void {
    const n = this.els[bid];
    if (!n) return;
    const clip = n.querySelector('.sb-clip');
    if (!clip) return;
    clip.setAttribute('d', 'M-20 -20 H3000 V3000 H-20 Z' + (above ? ` M3 -3 H${above - 3} V9.5 H3 Z` : ''));
    n.querySelector('.sb-filler')?.setAttribute('width', String(below ? Math.max(0, below - 8) : 0));
  }

  /* 正在飞进来的积木先不接缝，落下那一刻再接上 */
  private joinRun(ids: BlockId[], gapAt = -1): void {
    const A = this.arriving;
    ids.forEach((bid, i) => {
      const prev = i > 0 && i !== gapAt && !A.has(bid) && !A.has(ids[i - 1]) ? ids[i - 1] : null;
      const next = i < ids.length - 1 && i + 1 !== gapAt && !A.has(bid) && !A.has(ids[i + 1]) ? ids[i + 1] : null;
      const sw = this.swOf(bid);
      this.setJoin(bid, prev ? Math.min(sw, this.swOf(prev)) : 0, next ? Math.min(sw, this.swOf(next)) : 0);
    });
  }

  private rejoin(bid: BlockId): void {
    if (this.drag && this.drag.ids.includes(bid)) {
      this.joinRun(this.drag.ids);
      return;
    }
    const s = this.findStack(bid);
    if (s) this.joinRun(s.ids, this.preview && this.preview.stack === s && this.preview.type === 'insert' ? this.preview.at : -1);
  }

  private homeXY(): { x: number; y: number } {
    if (this.kind !== 'desk') return { x: 26, y: 10 };
    const Hd = this.layer.offsetHeight;
    return { x: 40, y: Math.round(Math.max(110, (Hd - this.stackH(IDS.login) - 8) / 2 + 30)) };
  }

  private onlineXY(home: { x: number; y: number }): { x: number; y: number } {
    const w = (shared?.cache.online as Rendered).w;
    return { x: Math.round(Math.max(home.x + 60, this.layer.offsetWidth - w - 44)), y: Math.max(16, home.y - 104) };
  }

  private wantIds(): BlockId[] {
    return this.vars.mode === 'reg' ? IDS.reg.filter((b) => b !== 'nick' || this.vars.nick) : IDS.login.slice();
  }

  private makeEl(bid: BlockId): HTMLElement {
    const def = SB_DEFS[bid];
    const cache = shared?.cache[bid] as Rendered;
    if (typeof def.code === 'function') {
      const c = codeOf(def, this.vars);
      this.own[bid] = c === cache.code ? cache : renderBlock(def, this.probe, this.vars);
    }
    this.codes[bid] = this.cc(bid).code;
    const n = document.createElement('div');
    n.className = 'sb-blk';
    n.dataset.id = bid;
    this.layer.insertBefore(n, this.ghost);
    this.els[bid] = n;
    this.paint(bid);
    return n;
  }

  private paint(bid: BlockId): void {
    const n = this.els[bid];
    if (!n) return;
    const value = SB_DEFS[bid].rep && this.onlineValue ? `<span class="sb-val"></span>` : '';
    n.innerHTML = this.cc(bid).svg.split('__CLIP__').join(`sbc-${this.uid}-${bid}`) + value;
    const val = n.querySelector('.sb-val');
    if (val) val.textContent = this.onlineValue;
    if (bid === 'ifc') this.setBool(true);
  }

  private mount(): void {
    const s = shared as Shared;
    const layer = htmlEl('<div class="sb-layer"><i class="sb-probe"></i></div>');
    this.stage.appendChild(layer);
    this.layer = layer;
    this.probe = layer.firstElementChild as HTMLElement;
    for (const [id, def] of Object.entries(SB_DEFS) as [BlockId, BlockDef][]) {
      if (!s.cache[id]) s.cache[id] = renderBlock(def, this.probe);
    }
    if (s.defs) {
      // <use href="#sb3-…"> 只在同一棵树（document 或 ShadowRoot）里找 id，所以每个舞台自带一份
      const holder = svgEl('svg', { width: 0, height: 0, 'aria-hidden': 'true' });
      holder.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden');
      holder.appendChild(s.defs.cloneNode(true));
      layer.appendChild(holder);
    }
    this.ghost = htmlEl('<div class="sb-ghost" hidden></div>');
    layer.appendChild(this.ghost);
    const home = this.homeXY();
    this.model = { stacks: [{ x: home.x, y: home.y, ids: this.wantIds() }], touched: false };
    if (this.kind === 'desk') this.model.stacks.push({ ...this.onlineXY(home), ids: ['online'] });
    for (const st of this.model.stacks) for (const bid of st.ids) this.makeEl(bid);
    this.layout(true);
  }

  /** 窗口尺寸变了：没被拖过就回到默认摆放，拖过的只保证不出界。 */
  private onResize(): void {
    if (!this.layer || this.drag) return;
    const Wd = this.layer.offsetWidth;
    const Hd = this.layer.offsetHeight;
    if (!Wd || !Hd) return;
    if (!this.model.touched) {
      const home = this.homeXY();
      for (const st of this.model.stacks) {
        if (st.ids[0] === 'online') Object.assign(st, this.onlineXY(home));
        else if (SB_DEFS[st.ids[0]].hat) Object.assign(st, home);
      }
    } else {
      for (const st of this.model.stacks) this.clampStack(st);
    }
    this.layout(true);
  }

  private clampStack(target: Stack): void {
    const Wd = this.layer.offsetWidth;
    const Hd = this.layer.offsetHeight;
    const tw = Math.max(...target.ids.map((b) => this.cc(b).w));
    const th = this.stackH(target.ids) + (SB_DEFS[target.ids[0]].rep ? 34 : 10);
    target.x = Math.round(Math.max(6, Math.min(target.x, Wd - tw - 6)));
    target.y = Math.round(Math.max(SB_DEFS[target.ids[0]].hat ? 14 : 2, Math.min(target.y, Hd - th)));
  }

  private layout(instant = false): void {
    const p = this.preview;
    let z = 1;
    for (const s of this.model.stacks) {
      let y = s.y;
      this.joinRun(s.ids, p && p.stack === s && p.type === 'insert' ? p.at : -1);
      s.ids.forEach((bid, i) => {
        if (p && p.stack === s && p.at === i && p.type === 'insert' && this.drag) y += this.drag.h;
        const n = this.els[bid];
        if (!n) return;
        if (instant) n.style.transition = 'none';
        this.setT(n, s.x, y);
        n.style.zIndex = String(z);
        z += 1;
        if (instant) {
          void n.offsetWidth;
          n.style.transition = '';
        }
        y += this.H(bid);
      });
    }
  }

  /* ───────── 变形：文本变了，积木的几何连续过渡 ───────── */

  private morph(bid: BlockId, next: Rendered): void {
    const host = this.els[bid];
    if (!host) return;
    const live = host.querySelector('svg');
    this.own[bid] = next;
    const prevRaf = this.morphs[bid];
    if (prevRaf) {
      cancelAnimationFrame(prevRaf);
      delete this.morphs[bid];
    }
    const tpl = document.createElement('div');
    tpl.innerHTML = next.svg.split('__CLIP__').join(`sbc-${this.uid}-${bid}`);
    const nsvg = tpl.firstElementChild as SVGSVGElement;
    if (!live) {
      host.prepend(nsvg);
      return;
    }
    const A = [live, ...live.querySelectorAll('*')].filter((n) => !n.classList.contains('mx-old'));
    const B = [nsvg, ...nsvg.querySelectorAll('*')];
    const iso = A.length === B.length && A.every((a, i) => a.tagName === B[i].tagName);
    if (!iso || this.reduceMotion()) {
      live.querySelectorAll('.mx-old').forEach((n) => n.remove());
      if (iso) {
        A.forEach((a, i) => {
          if (a.classList.contains('sb-clip') || a.classList.contains('sb-filler')) return;
          for (const k of MATTR) {
            const v = B[i].getAttribute(k);
            if (v == null) a.removeAttribute(k);
            else a.setAttribute(k, v);
          }
          if (a.tagName === 'text') a.textContent = B[i].textContent;
        });
      } else {
        live.replaceWith(nsvg);
        if (bid === 'ifc') this.setBool(true);
      }
      delete this.animSw[bid];
      this.rejoin(bid);
      return;
    }
    const tracks: { el: Element; k: string; from: number[]; to: number[]; parts: string[] }[] = [];
    A.forEach((a, i) => {
      const b = B[i];
      if (a.classList.contains('sb-clip') || a.classList.contains('sb-filler')) return;
      for (const k of MATTR) {
        const va = a.getAttribute(k);
        const vb = b.getAttribute(k);
        if (va === vb) continue;
        if (va == null || vb == null) {
          if (vb == null) a.removeAttribute(k);
          else a.setAttribute(k, vb);
          continue;
        }
        const na = va.match(NUM) ?? [];
        const nb = vb.match(NUM) ?? [];
        if (na.length !== nb.length) {
          a.setAttribute(k, vb);
          continue;
        }
        tracks.push({ el: a, k, from: na.map(Number), to: nb.map(Number), parts: vb.split(NUM) });
      }
      if (a.tagName === 'text' && a.textContent !== b.textContent) {
        const old = a.cloneNode(true) as Element;
        old.classList.add('mx-old');
        old.removeAttribute('opacity');
        a.parentNode?.insertBefore(old, a);
        const fo = old.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, easing: 'ease-in', fill: 'forwards' });
        const drop = (): void => old.remove();
        fo.onfinish = drop;
        fo.oncancel = drop;
        a.textContent = b.textContent;
        a.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: 40, easing: 'ease-out', fill: 'backwards' });
      }
    });
    const t0 = performance.now();
    const step = (now: number): void => {
      const p = Math.min(1, (now - t0) / MORPH_MS);
      const e = EASE(p);
      for (const tr of tracks) {
        let s = tr.parts[0];
        for (let j = 0; j < tr.to.length; j += 1) s += Math.round((tr.from[j] + (tr.to[j] - tr.from[j]) * e) * 100) / 100 + tr.parts[j + 1];
        tr.el.setAttribute(tr.k, s);
      }
      this.animSw[bid] = Number(live.getAttribute('width')) - 4;
      this.rejoin(bid);
      if (p < 1) this.morphs[bid] = requestAnimationFrame(step);
      else {
        delete this.morphs[bid];
        delete this.animSw[bid];
        this.rejoin(bid);
      }
    };
    this.morphs[bid] = requestAnimationFrame(step);
  }

  /* 「如果」里的布尔：两次密码都填了且一致 → 运算绿；否则灰。翻成绿色时轻轻亮一下 */
  private setBool(force = false): void {
    const n = this.els.ifc;
    if (!n) return;
    const b = n.querySelector<SVGElement>('.pw-bool');
    if (!b) return;
    const on = !!this.vars.pw && this.vars.pw === this.vars.conf;
    b.style.fill = on ? '' : '#c3c7d0';
    b.style.stroke = on ? '' : '#a3a8b4';
    n.querySelectorAll<SVGElement>('rect.sb3-operators').forEach((r) => {
      r.style.transition = 'stroke .32s';
      r.style.stroke = on ? '' : '#a3a8b4';
    });
    if (!force && on && !this.boolOn && !this.reduceMotion()) b.animate([{ filter: 'brightness(1)' }, { filter: 'brightness(1.25)' }, { filter: 'brightness(1)' }], { duration: 520, easing: 'ease-out' });
    this.boolOn = on;
  }

  /* ───────── 积木进出：脱离淡出 / 错开飞入并吸附 ───────── */

  private leave(bid: BlockId, delay = 0): void {
    const n = this.els[bid];
    if (!n) return;
    for (const s of this.model.stacks) {
      const i = s.ids.indexOf(bid);
      if (i >= 0) s.ids.splice(i, 1);
    }
    this.model.stacks = this.model.stacks.filter((s) => s.ids.length);
    this.setJoin(bid, 0, 0);
    const m = this.morphs[bid];
    if (m) cancelAnimationFrame(m);
    delete this.els[bid];
    delete this.morphs[bid];
    delete this.animSw[bid];
    delete this.own[bid];
    this.arriving.delete(bid);
    n.classList.add('leaving');
    if (this.reduceMotion()) {
      n.remove();
      return;
    }
    const at = this.pos.get(n) ?? { x: 0, y: 0 };
    n.style.transition = `transform .32s cubic-bezier(.4,0,.7,.2) ${delay}ms, opacity .24s ease ${delay}ms`;
    requestAnimationFrame(() => {
      this.setT(n, at.x + 34, at.y + 8, 0.98);
      n.style.opacity = '0';
    });
    this.later(() => n.remove(), delay + 380);
  }

  private arrive(bid: BlockId, delay = 0): void {
    const n = this.makeEl(bid);
    if (this.reduceMotion()) return;
    this.arriving.add(bid);
    n.dataset.delay = String(delay);
  }

  /* layout 之后：把刚建的积木先放到落点左下方（不透明度 0），下一帧带延迟过渡到落点，略带一点回弹，像 Scratch 里吸附上去 */
  private launch(): void {
    for (const bid of this.arriving) {
      const n = this.els[bid];
      if (!n || n.dataset.delay == null) continue;
      const delay = Number(n.dataset.delay);
      delete n.dataset.delay;
      const { x: fx, y: fy } = this.pos.get(n) ?? { x: 0, y: 0 };
      n.style.transition = 'none';
      n.style.opacity = '0';
      this.setT(n, fx - 30, fy + 22, 0.98);
      void n.offsetWidth;
      n.style.transition = `transform .46s cubic-bezier(.3,1.22,.5,1) ${delay}ms, opacity .2s ease ${delay}ms`;
      this.setT(n, fx, fy);
      n.style.opacity = '1';
      this.later(() => {
        if (!this.arriving.has(bid)) return;
        this.arriving.delete(bid);
        n.style.transition = '';
        this.rejoin(bid);
      }, delay + 300);
    }
  }

  private switchBlocks(): void {
    if (this.drag) {
      if (this.drag.raf) cancelAnimationFrame(this.drag.raf);
      this.endDrag(true);
    }
    this.run += 1;
    this.stage.querySelectorAll('.sb-say').forEach((b) => b.remove());
    Object.values(this.els).forEach((n) => n?.classList.remove('glow'));
    const want = this.wantIds();
    const keep = new Set<BlockId>([...want, 'online']);
    let k = 0;
    for (const bid of Object.keys(this.els) as BlockId[]) {
      if (!keep.has(bid)) {
        this.leave(bid, k * 40);
        k += 1;
      }
    }
    for (const s of this.model.stacks) s.ids = s.ids.filter((b) => !want.includes(b));
    this.model.stacks = this.model.stacks.filter((s) => s.ids.length);
    const home = this.homeXY();
    this.model.stacks.unshift({ x: home.x, y: home.y, ids: want });
    want.filter((b) => !this.els[b]).forEach((bid, i) => this.arrive(bid, 150 + i * 70));
    this.sync(true);
    this.layout();
    this.launch();
  }

  /* ───────── 表单 → 积木（每帧最多一次） ───────── */

  private schedule(): void {
    if (!this.raf) {
      this.raf = requestAnimationFrame(() => {
        this.raf = 0;
        this.sync();
      });
    }
  }

  private sync(noLayout = false): void {
    if (!this.layer || this.destroyed) return;
    for (const bid of BOUND) {
      if (!this.els[bid]) continue;
      const code = codeOf(SB_DEFS[bid], this.vars);
      if (code === this.codes[bid]) continue;
      this.codes[bid] = code;
      this.morph(bid, renderBlock(SB_DEFS[bid], this.probe, this.vars));
    }
    this.setBool();
    // 注册：昵称第一个字出现时接上「将 [昵称] 设为」，清空时脱离
    if (this.vars.mode === 'reg' && !noLayout) {
      const has = !!this.vars.nick;
      if (has && !this.els.nick) {
        const s = this.findStack('say') ?? this.findStack('hat') ?? this.model.stacks[0];
        if (s) {
          const at = s.ids.indexOf('say') + 1 || s.ids.length;
          s.ids.splice(at, 0, 'nick');
          this.arrive('nick', 0);
          this.layout();
          this.launch();
        }
      } else if (!has && this.els.nick) {
        this.leave('nick');
        this.layout();
      }
    }
    this.pan();
  }

  private pan(): void {
    if (this.kind === 'desk' || !this.layer) return;
    let py = 0;
    const f = this.focus;
    if (this.kb && f) {
      const bid: BlockId = f === 'n' ? 'nick' : f === 'c' ? 'ifc' : this.vars.mode === 'reg' ? 'ifc' : f === 'u' ? 'say' : 'pw';
      const s = this.findStack(bid);
      if (s) {
        const top = s.y + this.stackH(s.ids.slice(0, s.ids.indexOf(bid)));
        const bottom = top + this.cc(bid).h;
        const view = this.phoneKbView / 0.6 - 30; // 键盘态画板高度 / 缩放，再留出底部淡出
        py = -Math.max(0, Math.min(top - 6, bottom - view)) * 0.6;
      }
    }
    this.stage.style.setProperty('--py', `${Math.round(py)}px`);
  }

  /* ───────── 拖动 / 吸附 / 运行 ───────── */

  private toLocal(e: PointerEvent): { x: number; y: number } {
    const r = this.layer.getBoundingClientRect();
    const unit = this.probe.getBoundingClientRect().width / 100 || 1;
    return { x: (e.clientX - r.left) / unit, y: (e.clientY - r.top) / unit };
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0 || this.drag || this.press || !this.layer) return;
    const n = (e.target as Element | null)?.closest<HTMLElement>('.sb-blk');
    if (!n || n.classList.contains('leaving') || this.arriving.has(n.dataset.id as BlockId)) return;
    e.preventDefault();
    this.press = { id: n.dataset.id as BlockId, pid: e.pointerId, cx: e.clientX, cy: e.clientY, p: this.toLocal(e) };
    this.stage.setPointerCapture?.(e.pointerId);
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    const press = this.press;
    if (!press || e.pointerId !== press.pid) return;
    if (!this.drag) {
      if (!this.els[press.id] || Math.hypot(e.clientX - press.cx, e.clientY - press.cy) < 4) return;
      this.startDrag(press);
    }
    const d = this.drag;
    if (!d) return;
    d.last = e;
    if (!d.raf) {
      d.raf = requestAnimationFrame(() => {
        d.raf = 0;
        if (this.drag === d && d.last) this.moveDrag(d.last);
      });
    }
  };

  private readonly onPointerEnd = (e: PointerEvent): void => {
    const press = this.press;
    if (!press || e.pointerId !== press.pid) return;
    if (this.stage.hasPointerCapture?.(e.pointerId)) this.stage.releasePointerCapture(e.pointerId);
    if (this.drag) {
      if (this.drag.raf) cancelAnimationFrame(this.drag.raf);
      this.moveDrag(e);
      this.endDrag(e.type === 'pointercancel');
    } else if (e.type === 'pointerup' && this.els[press.id]) {
      this.clickBlock(press.id);
    }
    this.press = null;
  };

  private touch(): void {
    this.model.touched = true;
  }

  private startDrag(press: Press): void {
    this.touch();
    const s = this.findStack(press.id);
    if (!s) return;
    const i = s.ids.indexOf(press.id);
    const top = { x: s.x, y: s.y + this.stackH(s.ids.slice(0, i)) };
    const ids = s.ids.splice(i);
    if (!s.ids.length) this.model.stacks.splice(this.model.stacks.indexOf(s), 1);
    const gx = press.p.x - top.x;
    const gy = press.p.y - top.y;
    const wrap = htmlEl('<div class="sb-drag"></div>');
    const lift = htmlEl('<div class="sb-lift"></div>');
    lift.style.transformOrigin = `${gx}px ${gy}px`;
    let yy = 0;
    for (const bid of ids) {
      const n = this.els[bid] as HTMLElement;
      n.style.zIndex = '';
      this.setT(n, 0, yy);
      lift.appendChild(n);
      yy += this.H(bid);
    }
    wrap.appendChild(lift);
    this.layer.appendChild(wrap);
    this.setT(wrap, top.x, top.y);
    this.ghost.innerHTML = ids.reduce((acc, bid, k) => acc + this.cc(bid).ghost.replace('<svg ', `<svg style="top:${this.stackH(ids.slice(0, k))}px" `), '');
    this.drag = { ids, h: this.stackH(ids), gx, gy, x: top.x, y: top.y, wrap, lift, hat: !!SB_DEFS[ids[0]].hat, rep: !!SB_DEFS[ids[0]].rep, raf: 0, last: null };
    this.joinRun(ids);
    requestAnimationFrame(() => lift.classList.add('on'));
    this.layout();
  }

  private findSnap(x: number, y: number): Snap | null {
    const d = this.drag;
    if (!d || d.rep) return null;
    let best: Snap | null = null;
    let bd = SNAP;
    for (const s of this.model.stacks) {
      if (SB_DEFS[s.ids[0]].rep) continue;
      if (!d.hat) {
        let yy = s.y;
        for (let at = 1; at <= s.ids.length; at += 1) {
          yy += this.H(s.ids[at - 1]);
          const dist = Math.hypot(x - s.x, y - yy);
          if (dist < bd) {
            bd = dist;
            best = { type: 'insert', stack: s, at, gx: s.x, gy: yy };
          }
        }
      }
      if (!SB_DEFS[s.ids[0]].hat) {
        const dist = Math.hypot(x - s.x, y + d.h - s.y);
        if (dist < bd) {
          bd = dist;
          best = { type: 'top', stack: s, at: 0, gx: s.x, gy: s.y - d.h };
        }
      }
    }
    return best;
  }

  private moveDrag(e: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    const p = this.toLocal(e);
    d.x = p.x - d.gx;
    d.y = p.y - d.gy;
    this.setT(d.wrap, d.x, d.y);
    const snap = this.findSnap(d.x, d.y);
    const pv = this.preview;
    const same = snap && pv && snap.stack === pv.stack && snap.at === pv.at && snap.type === pv.type;
    if (same || (!snap && !pv)) return;
    this.preview = snap;
    if (snap) {
      this.ghost.hidden = false;
      this.setT(this.ghost, snap.gx, snap.gy);
    } else {
      this.ghost.hidden = true;
    }
    this.layout();
  }

  private endDrag(cancelled: boolean): void {
    const d = this.drag;
    if (!d) return;
    const snap = cancelled ? null : this.preview;
    this.preview = null;
    this.ghost.hidden = true;
    this.drag = null;
    let target: Stack;
    if (snap && snap.type === 'insert') {
      snap.stack.ids.splice(snap.at, 0, ...d.ids);
      target = snap.stack;
    } else if (snap) {
      snap.stack.ids.unshift(...d.ids);
      snap.stack.y -= d.h;
      target = snap.stack;
    } else {
      target = { x: d.x, y: d.y, ids: d.ids };
      this.model.stacks.push(target);
    }
    this.clampStack(target);
    this.model.stacks.splice(this.model.stacks.indexOf(target), 1);
    this.model.stacks.push(target);
    const sc = d.lift.classList.contains('on') && !this.reduceMotion() ? 1.04 : 1;
    let yy = 0;
    for (const bid of d.ids) {
      const n = this.els[bid] as HTMLElement;
      n.style.transition = 'none';
      this.setT(n, d.x + d.gx - d.gx * sc, d.y + d.gy + (yy - d.gy) * sc, sc);
      this.layer.insertBefore(n, this.ghost);
      yy += this.H(bid);
    }
    d.wrap.remove();
    void this.layer.offsetWidth;
    for (const bid of d.ids) {
      const n = this.els[bid];
      if (n) n.style.transition = '';
    }
    this.layout();
  }

  private async runIds(ids: BlockId[]): Promise<void> {
    this.run += 1;
    const tok = this.run;
    let bubble: HTMLElement | null = null;
    for (const bid of ids) {
      if (tok !== this.run) break;
      const n = this.els[bid];
      if (!n || !n.isConnected) break;
      n.classList.add('glow');
      const say = SB_DEFS[bid].say;
      if (say) {
        this.stage.querySelectorAll('.sb-say').forEach((b) => b.remove());
        bubble = htmlEl('<span class="sb-say"></span>');
        bubble.textContent = say(this.vars);
        n.appendChild(bubble);
      }
      await wait(say ? 700 : 420);
      n.classList.remove('glow');
    }
    if (bubble && !this.destroyed) {
      await wait(1300);
      bubble.classList.add('out');
      await wait(220);
      bubble.remove();
    }
  }

  private clickBlock(bid: BlockId): void {
    this.touch();
    const n = this.els[bid];
    if (SB_DEFS[bid].rep) {
      const val = n?.querySelector('.sb-val');
      if (val) val.animate([{ transform: 'translateX(-50%) scale(1.15)' }, { transform: 'translateX(-50%) scale(1)' }], { duration: 260, easing: 'ease-out' });
      else if (n && !this.reduceMotion()) {
        n.classList.add('glow');
        this.later(() => n.classList.remove('glow'), 420);
      }
      return;
    }
    if (this.running) return;
    const s = this.findStack(bid);
    if (!s) return;
    this.running = true;
    void this.runIds(s.ids.slice()).finally(() => {
      this.running = false;
    });
  }
}
