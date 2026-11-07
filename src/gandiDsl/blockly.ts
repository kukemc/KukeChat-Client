/**
 * 拿一个能画积木的 Blockly（scratch-blocks / gandi-blocks）。
 *
 * 两条路，按顺序：
 *
 * 1. **宿主的积木库。** 社区扩展跑在 CCW 的 Gandi 编辑器里，页面上本来就有一份积木库
 *    （`runtime.scratchBlocks`，或者全局的 ScratchBlocks / Blockly）。直接借它画，不用再下载两兆。
 *    只在它身上**另起一个离屏的只读工作区**，不碰编辑器的主工作区；inject 会把
 *    `Blockly.mainWorkspace` 换成新工作区，建完立刻换回去。也不传 `colours`（那是全局的，会把编辑器的配色改掉）。
 *
 * 2. **自己加载 gandi-blocks。** 播放器页、桌面端、网页、安卓渲染页没有宿主积木库，就按
 *    {@link gandiBlocksBase} 给的地址加载 gandi-blocks 的几个脚本 —— 加载进一个**隐藏的同源 iframe**，
 *    不在宿主页面上留下 `window.Blockly` / `window.goog` 这些全局（播放器页上别的扩展会按它们判断
 *    「是不是在编辑器里」）。
 *
 * 地址：桌面端 / 网页 / 安卓渲染页的构建会把 gandi-blocks 拷到页面旁边的 `gandi-blocks/` 目录
 * （`__KUKE_GANDI_BLOCKS_LOCAL__`）；社区扩展是单文件，入口处用 {@link setGandiBlocksRemoteBase} 传入
 * `VITE_GANDI_BLOCKS_BASE`（对象存储），没配就只能用宿主积木库，宿主也没有时积木卡片退回显示代码。
 * 这个模块不直接读 config/env.ts：安卓渲染页不连后端，不该因为缺后端地址而起不来。
 */

/* --- 积木库的最小类型：只写这里用得到的 -------------------------------------------- */

export interface BlockLike {
  getSvgRoot(): SVGGElement;
  dispose(healStack?: boolean): void;
}

export interface WorkspaceMetrics {
  viewLeft: number;
  viewTop: number;
  viewWidth: number;
  viewHeight: number;
}

export interface WorkspaceLike {
  dispose(): void;
  scale?: number;
  isFlyout?: boolean;
  options?: { readOnly?: boolean; pathToMedia?: string; parentWorkspace?: unknown };
  getMetrics?(): WorkspaceMetrics | null;
  getAllVariables?(): unknown[];
  scrollCenter?(): void;
}

export interface BlocklyLike {
  inject(container: Element, options: Record<string, unknown>): WorkspaceLike;
  Xml: {
    domToBlock(xml: Element, workspace: WorkspaceLike): BlockLike;
    domToWorkspace?(xml: Element, workspace: WorkspaceLike): string[];
  };
  Events: { disable(): void; enable(): void; setGroup?(state: boolean | string): void };
  Blocks: Record<string, unknown>;
  defineBlocksWithJsonArray?(json: Array<Record<string, unknown>>): void;
  mainWorkspace?: WorkspaceLike | null;
  getMainWorkspace?(): WorkspaceLike | null;
  TextLayer?: abstract new (...args: never[]) => unknown;
  ScratchMsgs?: { setLocale?(locale: string): void };
  Msg?: Record<string, string>;
  Colours?: Record<string, unknown>;
}

export interface BlocklyContext {
  Blockly: BlocklyLike;
  /** 积木画在哪个窗口里（宿主：当前页面；自己加载的：隐藏 iframe）。 */
  win: Window;
  doc: Document;
  /** 积木库取图标的目录（结尾带 /）。 */
  media: string;
  kind: 'host' | 'own';
}


function isBlockly(value: unknown): value is BlocklyLike {
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) return false;
  const candidate = value as Partial<BlocklyLike>;
  return typeof candidate.inject === 'function' && typeof candidate.Xml?.domToBlock === 'function' && Boolean(candidate.Blocks) && Boolean(candidate.Events);
}

/* --- 宿主 ---------------------------------------------------------------------------- */

let hostProvider: (() => unknown) | null = null;

/** 扩展启动时登记宿主的积木库来源（`runtime.scratchBlocks`）。 */
export function setHostBlocklyProvider(provider: (() => unknown) | null): void {
  hostProvider = provider;
}

let runtimeProvider: (() => unknown) | null = null;

/**
 * 扩展启动时登记宿主的 VM runtime（扩展构造函数拿到的那个）。读它的 `_blockInfo`：
 * 作品里装了的扩展（包括第三方的）按编辑器里的样子编译、画出来，见 hostExtensions.ts。
 */
export function setHostRuntimeProvider(provider: (() => unknown) | null): void {
  runtimeProvider = provider;
}

/** 宿主的 VM runtime（没有返回 null）。 */
export function hostRuntime(): unknown {
  try {
    return runtimeProvider?.() ?? null;
  } catch {
    return null;
  }
}

let ownFrameWindow: Window | null = null;

/** 宿主页面上的积木库（不是我们自己加载的那份）。没有返回 null。 */
export function findHostBlockly(): BlocklyLike | null {
  if (typeof window === 'undefined') return null;
  const globals = window as unknown as { ScratchBlocks?: unknown; Blockly?: unknown };
  const candidates = [hostProvider?.(), globals.ScratchBlocks, globals.Blockly];
  for (const candidate of candidates) {
    if (isBlockly(candidate)) return candidate;
  }
  return null;
}

/** 宿主编辑器的主工作区（能往里放积木的那个）。不在编辑器里返回 null。 */
export function findHostEditorWorkspace(): { Blockly: BlocklyLike; workspace: WorkspaceLike } | null {
  const Blockly = findHostBlockly();
  if (!Blockly || typeof Blockly.Xml.domToWorkspace !== 'function') return null;
  const workspace = Blockly.getMainWorkspace?.() ?? Blockly.mainWorkspace ?? null;
  if (!workspace || workspace.isFlyout || workspace.options?.readOnly || workspace.options?.parentWorkspace) return null;
  return { Blockly, workspace };
}

function hostMediaPath(Blockly: BlocklyLike, base: string | null): string {
  const main = Blockly.getMainWorkspace?.() ?? Blockly.mainWorkspace ?? null;
  const path = main?.options?.pathToMedia;
  if (path) return path;
  // 取不到就留空（inject 时不传 media）：导出时图标按文件名换成内置的那几张，见 media.ts
  return base ? `${base}media/` : '';
}

/* --- 自己加载 ------------------------------------------------------------------------ */

let remoteBase: string | null = null;

/** 社区扩展入口调用：没有随包发布 gandi-blocks 时，从这个地址懒加载（VITE_GANDI_BLOCKS_BASE）。 */
export function setGandiBlocksRemoteBase(url: string | null): void {
  remoteBase = url;
}

/** gandi-blocks 文件所在的目录（结尾带 /）。没有可用地址返回 null。 */
export function gandiBlocksBase(): string | null {
  const local = typeof __KUKE_GANDI_BLOCKS_LOCAL__ === 'string' ? __KUKE_GANDI_BLOCKS_LOCAL__ : '';
  const raw = local || remoteBase;
  if (!raw || typeof document === 'undefined') return null;
  try {
    const url = new URL(raw, document.baseURI).href;
    return url.endsWith('/') ? url : `${url}/`;
  } catch {
    return null;
  }
}

/** 加载顺序和 gandi-gui 的 loadBlockly 一致：库本体定义全局，后面几个往上挂。 */
const SCRIPTS = ['blockly_compressed_vertical.js', 'msg/messages.js', 'msg/scratch_msgs.js', 'blocks_compressed.js', 'blocks_compressed_vertical.js'];

function loadScriptInto(doc: Document, src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const el = doc.createElement('script');
    el.src = src;
    el.async = false;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`积木库加载失败：${src}`));
    doc.head.appendChild(el);
  });
}

/**
 * gandi-blocks 自带的语言表里没有的那几条（Gandi 补的核心积木），照 gandi-gui 的 applyCoreBlockText 补中文。
 * 只补聊天里用得到的常见几块；缺的会显示英文原文，不影响结构。
 */
const CORE_BLOCK_TEXT: Record<string, string> = {
  OPERATORS_POWER: '%1 ^ %2',
  OPERATORS_STRICTEQUALS: '%1 ≡ %2',
  OPERATORS_ROUNDTO: '将 %1 四舍五入到 %2 位小数',
  OPERATORS_TERNARY: '如果 %1 那么 %2 否则 %3',
  CONTROL_ISCLONE: '是克隆体?',
  CONTROL_BREAK: '跳出循环',
  CONTROL_CONTINUE: '跳过本次循环',
  CONTROL_WARP: '瞬时执行',
  CONTROL_FOREACH: '对 %1 从 1 数到 %2 重复执行',
  CONTROL_WHILE: '如果 %1 就循环，直到不成立',
  SENSING_MOUSEBUTTON: '按下鼠标 %1 ?',
  SENSING_MOUSEBUTTON_LEFT: '左键',
  SENSING_MOUSEBUTTON_RIGHT: '右键',
  SENSING_MOUSEBUTTON_MIDDLE: '中键',
  SENSING_MOUSEBUTTON_ANY: '任意键',
  SENSING_DELTATIME: '帧间隔（秒）',
  SENSING_PERSECOND: '每秒 %1',
  SENSING_FRAMERATE: '实际帧率',
  LOOKS_VISIBLE: '显示?',
  LOOKS_LAYER: '图层',
  LOOKS_GOTOLAYER: '移到第 %1 层',
  LOOKS_EFFECTVALUE: '%1 特效值',
  LOOKS_EFFECT_SATURATION: '饱和度',
  LOOKS_EFFECT_LIGHTNESS: '明度',
  MOTION_ROTATIONSTYLE: '旋转方式',
  SOUND_ISPLAYING: '正在播放 %1 ?',
  SOUND_DURATION: '声音 %1 的时长'
};

let ownPending: Promise<BlocklyContext> | null = null;

function loadOwnBlockly(base: string): Promise<BlocklyContext> {
  if (ownPending) return ownPending;
  ownPending = (async () => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.title = 'gandi-blocks';
    // 离屏而不是隐藏：display:none 时积木库量不出尺寸
    frame.style.cssText = 'position:fixed;left:-12000px;top:0;width:1200px;height:900px;border:0;pointer-events:none;opacity:0;';
    document.body.appendChild(frame);
    const win = frame.contentWindow;
    const doc = frame.contentDocument;
    if (!win || !doc) throw new Error('无法创建积木渲染环境');
    doc.open();
    doc.write('<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0"></body></html>');
    doc.close();
    const version = typeof __KUKE_GANDI_BLOCKS_VERSION__ === 'string' && __KUKE_GANDI_BLOCKS_VERSION__ ? `?v=${__KUKE_GANDI_BLOCKS_VERSION__}` : '';
    for (const file of SCRIPTS) {
      await loadScriptInto(doc, `${base}${file}${version}`);
    }
    const Blockly = (win as unknown as { Blockly?: unknown }).Blockly;
    if (!isBlockly(Blockly)) throw new Error('gandi-blocks 已加载但没有定义 Blockly');
    Blockly.ScratchMsgs?.setLocale?.('zh-cn');
    if (Blockly.Msg) Object.assign(Blockly.Msg, CORE_BLOCK_TEXT);
    // 没有积木栏：不传 toolbox 时积木库会拿 defaultToolbox 顶上（只读工作区不会，但以防万一）
    Blockly.Blocks.defaultToolbox = null;
    ownFrameWindow = win;
    return { Blockly, win, doc, media: `${base}media/`, kind: 'own' as const };
  })();
  ownPending.catch(() => {
    ownPending = null;
  });
  return ownPending;
}

/**
 * 拿一个画积木用的环境。优先宿主，其次自己加载；都不行返回 null（界面退回显示代码）。
 * @param preferOwn 跳过宿主，强制用自己加载的那份（安卓渲染页、调试用）。
 */
export async function acquireBlockly(preferOwn = false): Promise<BlocklyContext | null> {
  const base = gandiBlocksBase();
  if (!preferOwn) {
    const host = findHostBlockly();
    if (host && (host as unknown) !== (ownFrameWindow as unknown as { Blockly?: unknown } | null)?.Blockly) {
      return { Blockly: host, win: window, doc: document, media: hostMediaPath(host, base), kind: 'host' };
    }
  }
  if (!base) return null;
  return loadOwnBlockly(base);
}

/** 渲染环境可能拿得到吗（不加载任何东西）。 */
export function blocklyMaybeAvailable(): boolean {
  return Boolean(findHostBlockly() || gandiBlocksBase());
}
