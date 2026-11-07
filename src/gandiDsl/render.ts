/**
 * 积木 XML → 一张独立的 SVG（里面还藏着积木本身）。
 *
 * 照 Gandi 3.0 的做法（gandi-gui-3.0/src/blocks/blockThumbs.ts 的 drawBlock、exportBlock.ts 的 blocksToSvg）：
 *
 * - 在一个**离屏、只读**的工作区里把积木建出来（Blockly 只能在工作区里建积木），量包围盒，
 *   克隆它的 SVG，把算出来的样式一条条写死在克隆上 —— 这样导出的 SVG 不依赖任何样式表；
 * - `<image>`（绿旗、旋转箭头、下拉三角）换成 data URL；按 id 引用的渐变 / 滤镜一起搬进来；
 * - 原始 XML 用 base64 藏在 `<metadata id="gandi-blocks">` 里。Gandi 编辑器收到这样一个 SVG 文件
 *   （拖进工作区）会把积木原样长出来（gandi-gui 的 blocksFromSvg / insertBlocksXml）。
 *
 * 多段脚本竖着排在一张图里，中间留一点空。离屏工作区每个积木库一份，画完的积木立即销毁。
 */
import type { BlockLike, BlocklyContext, WorkspaceLike } from './blockly';
import { builtinMedia, utf8ToBase64 } from './media';

/** 藏 XML 的元素 id（和 Gandi 的 exportBlock.ts 一致，改了就拖不回去了）。 */
export const GANDI_BLOCKS_METADATA_ID = 'gandi-blocks';

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';
const PAD = 8;
const SCRIPT_GAP = 24;

/** 只抄画得出东西的样式。全量抄 computed style 文件会大十几倍。 */
const INLINE_PROPS = [
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity',
  'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'opacity',
  'font-family', 'font-size', 'font-weight', 'font-style', 'letter-spacing',
  'text-anchor', 'dominant-baseline', 'display', 'visibility'
];

export type DslTheme = 'light' | 'dark';

export interface RenderedBlocks {
  /** 独立 SVG 文档文本（带 `<?xml?>` 头和藏着的积木 XML）。 */
  svg: string;
  width: number;
  height: number;
}

interface Stage {
  div: HTMLDivElement;
  ws: WorkspaceLike;
}

const stages = new WeakMap<object, Stage>();

/**
 * 摘掉 gandi-blocks 的「文字层」：它会把积木上的字改画到 canvas 上、把 SVG 里的 `<text>` 设成 display:none，
 * 克隆出去的 SVG 就没字了。按类型找（属性名被压缩过），先 dispose 让排队中的那次重画作废。见 gandi 的 blockThumbs.ts。
 */
function dropTextLayer(ctx: BlocklyContext, ws: WorkspaceLike): void {
  const Layer = ctx.Blockly.TextLayer;
  if (!Layer) return;
  const record = ws as unknown as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const value = record[key];
    if (value instanceof Layer) {
      (value as { dispose?: () => void }).dispose?.();
      record[key] = null;
    }
  }
}

function stageFor(ctx: BlocklyContext): Stage {
  const existing = stages.get(ctx.Blockly);
  if (existing && existing.div.isConnected) return existing;
  const div = ctx.doc.createElement('div');
  div.setAttribute('aria-hidden', 'true');
  div.dataset.kukeDslStage = '1';
  // 离屏而不是隐藏：display:none 时工作区没有尺寸，积木库什么都量不出来
  div.style.cssText = 'position:fixed;left:-6000px;top:0;width:900px;height:600px;pointer-events:none;';
  ctx.doc.body.appendChild(div);
  const { Blockly } = ctx;
  // inject 会把新工作区设成主工作区 —— 宿主编辑器的快捷键、撤销都认主工作区，必须换回去
  const previousMain = Blockly.mainWorkspace ?? null;
  const options: Record<string, unknown> = {
    toolbox: null,
    trashcan: false,
    scrollbars: false,
    readOnly: true,
    sounds: false,
    zoom: { controls: false, wheel: false, startScale: 1 }
  };
  if (ctx.media) options.media = ctx.media;
  let ws: WorkspaceLike;
  try {
    ws = Blockly.inject(div, options);
  } finally {
    if (ctx.kind === 'host' && previousMain) Blockly.mainWorkspace = previousMain;
  }
  dropTextLayer(ctx, ws);
  const stage = { div, ws };
  stages.set(Blockly, stage);
  return stage;
}

/** 自己加载的积木库才改配色：深色主题下输入框换成深底浅字。宿主的 Colours 是全局的，碰了会改掉编辑器。 */
function applyTheme(ctx: BlocklyContext, theme: DslTheme): void {
  if (ctx.kind !== 'own' || !ctx.Blockly.Colours) return;
  const colours = ctx.Blockly.Colours;
  if (theme === 'dark') {
    colours.textField = '#2A2E37';
  } else {
    colours.textField = '#FFFFFF';
    colours.text = '#575E75';
  }
}

interface Drawn {
  node: SVGGElement;
  x: number;
  y: number;
  width: number;
  height: number;
  dispose: () => void;
}

function drawOne(ctx: BlocklyContext, ws: WorkspaceLike, xml: string): Drawn {
  const { Blockly } = ctx;
  // 用积木所在窗口的 DOMParser：建出来的元素和积木库在同一个文档里
  const Parser = (ctx.win as Window & { DOMParser?: typeof DOMParser }).DOMParser ?? DOMParser;
  const parsed = new Parser().parseFromString(xml, 'text/xml');
  const root = parsed.documentElement;
  if (!root || root.getElementsByTagName('parsererror').length) {
    throw new Error('积木 XML 解析失败');
  }
  let block: BlockLike;
  Blockly.Events.disable();
  try {
    block = Blockly.Xml.domToBlock(root, ws);
  } finally {
    Blockly.Events.enable();
  }
  const dispose = (): void => {
    Blockly.Events.disable();
    try {
      block.dispose(false);
    } catch {
      // 已经跟着工作区一起没了
    } finally {
      Blockly.Events.enable();
    }
  };
  try {
    const node = block.getSvgRoot();
    let box: { x: number; y: number; width: number; height: number };
    try {
      box = node.getBBox();
    } catch {
      box = { x: 0, y: 0, width: 100, height: 32 };
    }
    node.removeAttribute('transform');
    return { node, x: box.x, y: box.y, width: Math.max(1, box.width), height: Math.max(1, box.height), dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}

/** 把 live 和 clone 两棵树并排走一遍，把算出来的样式写死在 clone 上。 */
type StyleRemap = (prop: string, value: string, element: Element) => string;

function inlineStyles(win: Window, live: Element, clone: Element, remap: StyleRemap | null): void {
  const computed = win.getComputedStyle(live);
  let css = '';
  for (const prop of INLINE_PROPS) {
    let value = computed.getPropertyValue(prop);
    if (value && remap) value = remap(prop, value, live);
    if (value) css += `${prop}:${value};`;
  }
  if (css) clone.setAttribute('style', css);
  const liveKids = live.children;
  const cloneKids = clone.children;
  for (let i = 0; i < liveKids.length && i < cloneKids.length; i += 1) {
    inlineStyles(win, liveKids[i], cloneKids[i], remap);
  }
}

/**
 * 深色主题下输入框里的字：积木库的样式表是第一次建工作区时按 Colours.text 生成的，之后改 Colours 不会重写样式表，
 * 所以字色在内联样式这一步换掉（只换输入框字色那一种灰，积木上的白字不动）。
 */
const FIELD_TEXT_LIGHT = /^rgb\(87,\s*94,\s*117\)$/;
function darkRemap(prop: string, value: string, element: Element): string {
  return prop === 'fill' && element.tagName.toLowerCase() === 'text' && FIELD_TEXT_LIGHT.test(value.trim()) ? 'rgb(232, 234, 240)' : value;
}

/** 把克隆里引用到的 `url(#…)` / `href="#…"` 定义一起拷进 defs（渐变色积木的渐变挂在别的 svg 上）。 */
function collectDefs(doc: Document, clone: Element, defs: Element, done: Set<string>): void {
  const wanted = new Set<string>();
  const scan = (node: Element): void => {
    for (const attr of Array.from(node.attributes)) {
      for (const one of attr.value.match(/url\(\s*['"]?#([^)'"]+)['"]?\s*\)/g) ?? []) {
        const id = one.replace(/^url\(\s*['"]?#/, '').replace(/['"]?\s*\)$/, '');
        if (id) wanted.add(id);
      }
      if ((attr.name === 'href' || attr.name === 'xlink:href') && attr.value.startsWith('#')) wanted.add(attr.value.slice(1));
    }
    for (const kid of Array.from(node.children)) scan(kid);
  };
  scan(clone);
  for (;;) {
    const next = [...wanted].filter((id) => !done.has(id));
    if (!next.length) break;
    for (const id of next) {
      done.add(id);
      const node = doc.getElementById(id);
      if (!node) continue;
      const copy = node.cloneNode(true) as Element;
      defs.appendChild(copy);
      scan(copy);
    }
  }
}

async function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** `<image>` 的地址换成 data URL：先查内置图标，再 fetch；都不行就去掉这张图（免得导出的文件里留个裂图）。 */
async function embedImage(node: Element): Promise<void> {
  const href = node.getAttribute('href') || node.getAttributeNS(XLINK_NS, 'href') || '';
  if (!href || href.startsWith('data:')) return;
  let data = builtinMedia(href);
  if (!data) {
    try {
      const response = await fetch(href);
      if (response.ok) data = await readAsDataUrl(await response.blob());
    } catch {
      data = null;
    }
  }
  if (!data) {
    node.remove();
    return;
  }
  node.setAttribute('href', data);
  node.setAttributeNS(XLINK_NS, 'xlink:href', data);
}

/**
 * 画一段或几段积木。
 * @param scriptXml 每段脚本一条 `<block>` XML（画图用，不带注释）。
 * @param embedXml 藏进 SVG 的 XML（几段 `<block>` 首尾相接）；空串就不藏。
 */
export async function renderBlocksSvg(ctx: BlocklyContext, scriptXml: string[], embedXml: string, theme: DslTheme): Promise<RenderedBlocks> {
  const { doc, win } = ctx;
  const stage = stageFor(ctx);
  applyTheme(ctx, theme);
  const group = doc.createElementNS(SVG_NS, 'g');
  const defs = doc.createElementNS(SVG_NS, 'defs');
  const defIds = new Set<string>();
  let y = 0;
  let width = 0;
  for (const xml of scriptXml) {
    const drawn = drawOne(ctx, stage.ws, xml);
    try {
      const clone = drawn.node.cloneNode(true) as SVGGElement;
      inlineStyles(win, drawn.node, clone, ctx.kind === 'own' && theme === 'dark' ? darkRemap : null);
      collectDefs(doc, clone, defs, defIds);
      clone.setAttribute('transform', `translate(${-drawn.x + PAD},${y - drawn.y + PAD})`);
      group.appendChild(clone);
      width = Math.max(width, drawn.width);
      y += drawn.height + SCRIPT_GAP;
    } finally {
      drawn.dispose();
    }
  }
  await Promise.all(Array.from(group.querySelectorAll('image')).map((node) => embedImage(node)));
  const contentHeight = Math.max(1, y - SCRIPT_GAP);
  const outWidth = Math.ceil(width) + PAD * 2;
  const outHeight = Math.ceil(contentHeight) + PAD * 2;
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('xmlns', SVG_NS);
  svg.setAttribute('xmlns:xlink', XLINK_NS);
  svg.setAttribute('width', String(outWidth));
  svg.setAttribute('height', String(outHeight));
  svg.setAttribute('viewBox', `0 0 ${outWidth} ${outHeight}`);
  if (embedXml) {
    // base64 一道：积木里的文字什么都可能有（<、&、CDATA 结束标记），转义一层再被别的工具重排就可能坏掉
    const meta = doc.createElementNS(SVG_NS, 'metadata');
    meta.setAttribute('id', GANDI_BLOCKS_METADATA_ID);
    meta.textContent = utf8ToBase64(embedXml);
    svg.appendChild(meta);
  }
  if (defs.childNodes.length) svg.appendChild(defs);
  svg.appendChild(group);
  return {
    svg: `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(svg)}`,
    width: outWidth,
    height: outHeight
  };
}

/** SVG 文本 → `data:image/svg+xml;base64,…`。 */
export function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;base64,${utf8ToBase64(svg)}`;
}

/** SVG → PNG data URL（默认两倍，贴到哪儿都不糊）。 */
export async function svgToPng(rendered: RenderedBlocks, scale = 2): Promise<string> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('积木图片生成失败'));
    img.src = svgToDataUrl(rendered.svg);
  });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(rendered.width * scale));
  canvas.height = Math.max(1, Math.round(rendered.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('积木图片生成失败');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

/** 从一个 SVG 文件里取出藏着的积木 XML（没有返回 null）。和 Gandi 的 blocksFromSvg 同一个格式。 */
export function blocksXmlFromSvg(text: string, base64ToText: (data: string) => string): string | null {
  if (!text.includes(GANDI_BLOCKS_METADATA_ID)) return null;
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const data = doc.getElementById(GANDI_BLOCKS_METADATA_ID)?.textContent ?? '';
  if (!data.trim()) return null;
  const xml = base64ToText(data);
  return xml.includes('<block') ? xml : null;
}
