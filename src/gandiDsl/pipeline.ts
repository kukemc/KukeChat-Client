/**
 * 积木文本 → 积木图，一条龙。聊天界面和安卓渲染页共用这一个入口。
 *
 * 这个文件会把编译器（acorn + 九千行）带进来，界面代码请通过 index.ts 的 loadGandiDsl() 懒加载它。
 */
import { acquireBlockly, findHostEditorWorkspace } from './blockly';
import { activeSchema, compileSnippet, detectDsl, type DslCompileOutput, type DslDiagnostic } from './engine';
import { prepareExtensionBlocks } from './extensionBlocks';
import { renderBlocksSvg, svgToDataUrl, svgToPng, type DslTheme, type RenderedBlocks } from './render';

export { compileSnippet, detectDsl } from './engine';
export type { DslCompileOutput, DslDiagnostic, DslAutoDeclared, PlaceholderSpec } from './engine';
export type { DslTheme, RenderedBlocks } from './render';
export { svgToDataUrl, svgToPng } from './render';

/** 一次最多画多少块积木。再多图会大得没法在聊天里看，也拖慢列表。 */
export const MAX_RENDER_BLOCKS = 800;

export type DslRenderStatus = 'ok' | 'compile-error' | 'unavailable' | 'render-error';

export interface DslRenderResult {
  status: DslRenderStatus;
  compile: DslCompileOutput;
  rendered?: RenderedBlocks;
  /** 显示用的 data URL（status 为 ok 时有）。 */
  dataUrl?: string;
  /** 画图那一步出的问题（不是编译错误）。 */
  renderError?: string;
}

const renderCache = new Map<string, Promise<DslRenderResult>>();

async function renderUncached(code: string, theme: DslTheme, preferOwn: boolean): Promise<DslRenderResult> {
  const compile = compileSnippet(code);
  if (!compile.ok || !compile.blocks) {
    return { status: 'compile-error', compile };
  }
  if (Object.keys(compile.blocks).length > MAX_RENDER_BLOCKS) {
    return { status: 'render-error', compile, renderError: `积木太多了（超过 ${MAX_RENDER_BLOCKS} 块），只显示代码` };
  }
  let ctx;
  try {
    ctx = await acquireBlockly(preferOwn);
  } catch (error) {
    return { status: 'unavailable', compile, renderError: error instanceof Error ? error.message : String(error) };
  }
  if (!ctx) {
    return { status: 'unavailable', compile, renderError: '这里没有可用的积木渲染库' };
  }
  try {
    // 扩展积木 / 占位积木的定义（宿主积木库上补的定义换了类型名，只影响画图用的 XML，藏进 SVG 的还是真操作码）
    const scriptXml = await prepareExtensionBlocks(ctx, compile);
    const rendered = await renderBlocksSvg(ctx, scriptXml, compile.embedXml, theme);
    return { status: 'ok', compile, rendered, dataUrl: svgToDataUrl(rendered.svg) };
  } catch (error) {
    // 最常见：宿主积木库里没有某种积木（版本不同、扩展积木）
    return { status: 'render-error', compile, renderError: error instanceof Error ? `积木画不出来：${error.message}` : '积木画不出来' };
  }
}

/** 编译并画出一段积木文本。同一段文本 + 主题只画一次。 */
export function renderDslCode(code: string, theme: DslTheme, options: { preferOwn?: boolean } = {}): Promise<DslRenderResult> {
  // 宿主作品里装 / 卸了扩展，schema 就换了一版（activeSchema().key），同一段文本要重新编
  const key = `${activeSchema().key}\u0000${theme}\u0000${options.preferOwn ? 1 : 0}\u0000${code}`;
  let pending = renderCache.get(key);
  if (!pending) {
    pending = renderUncached(code, theme, Boolean(options.preferOwn));
    if (renderCache.size > 200) renderCache.clear();
    renderCache.set(key, pending);
    // 积木库暂时加载失败的别缓存，下次再试
    void pending.then((result) => {
      if (result.status === 'unavailable') renderCache.delete(key);
    });
  }
  return pending;
}

/* --- 放进宿主编辑器 ------------------------------------------------------------------- */

/** 当前页面是不是 Gandi 编辑器（能把积木放进工作区）。 */
export function canInsertIntoEditor(): boolean {
  return findHostEditorWorkspace() !== null;
}

/**
 * 把编译好的积木放进宿主编辑器当前的工作区（落在可视区域左上角往里一点）。
 * 走 Blockly.Xml.domToWorkspace、事件开着 —— 编辑器自己的监听会把积木和新变量同步给 VM，整段算一次撤销。
 */
export function insertIntoEditor(compile: DslCompileOutput): { ok: boolean; message: string } {
  const host = findHostEditorWorkspace();
  if (!host) return { ok: false, message: '当前页面不是 Gandi 编辑器' };
  if (!compile.ok || !compile.embedXml) return { ok: false, message: '这段积木文本有错误，放不进去' };
  const { Blockly, workspace } = host;
  const dom = new DOMParser().parseFromString(`<xml>${compile.embedXml}</xml>`, 'text/xml');
  const root = dom.documentElement;
  if (!root || root.getElementsByTagName('parsererror').length) return { ok: false, message: '积木 XML 解析失败' };
  const missing = Array.from(root.querySelectorAll('block, shadow')).map((node) => node.getAttribute('type') ?? '')
    .find((type) => type && !(Object.prototype.hasOwnProperty.call(Blockly.Blocks, type) && Blockly.Blocks[type]));
  if (missing) {
    const extension = extensionOfType(missing, compile);
    return { ok: false, message: extension ? `先在作品里添加扩展「${extension}」，再放进来` : `这个编辑器里没有「${missing}」这种积木` };
  }
  const metrics = workspace.getMetrics?.();
  const scale = workspace.scale || 1;
  const left = metrics ? metrics.viewLeft / scale + 40 : 40;
  const top = metrics ? metrics.viewTop / scale + 40 : 40;
  let offsetY = 0;
  for (const stack of Array.from(root.children)) {
    stack.setAttribute('x', String(Math.round(left)));
    stack.setAttribute('y', String(Math.round(top + offsetY)));
    offsetY += 280;
  }
  try {
    Blockly.Events.setGroup?.(true);
    Blockly.Xml.domToWorkspace?.(root, workspace);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : '放进编辑器失败' };
  } finally {
    Blockly.Events.setGroup?.(false);
  }
  return { ok: true, message: '已放进当前角色的代码区' };
}

/** 积木类型是哪个扩展的（认识的扩展 id 里取最长前缀；占位积木直接有）。核心积木返回 null。 */
function extensionOfType(type: string, compile: DslCompileOutput): string | null {
  const placeholder = compile.placeholders[type];
  if (placeholder) return placeholder.extensionId;
  let best = '';
  for (const id of activeSchema().extensionIds) {
    if (id.length > best.length && type.startsWith(`${id}_`)) best = id;
  }
  return best || null;
}

/* --- 安卓渲染页用的契约 --------------------------------------------------------------- */

export interface KukeDslRenderOptions {
  theme?: DslTheme;
  scale?: number;
}

export interface KukeDslRenderOutput {
  ok: boolean;
  png?: string;
  svg?: string;
  width?: number;
  height?: number;
  diagnostics: DslDiagnostic[];
  detected?: boolean;
  /** 画成灰色占位积木的扩展 id（这里不认识的扩展）。没有就不带这个字段。 */
  unknownExtensions?: string[];
}

/**
 * `window.kukeDslRender` 的实现：text 可以是整条消息（带 ```gandi-dsl 围栏就取第一段围栏里的代码），
 * 也可以直接是积木文本。detected 是「这条消息按聊天的规则会不会被当成积木」。
 */
export async function renderForAndroid(text: string, options: KukeDslRenderOptions, extractCode: (text: string) => { code: string; fenced: boolean }): Promise<KukeDslRenderOutput> {
  const { code, fenced } = extractCode(text);
  const detected = fenced || detectDsl(code);
  const theme: DslTheme = options.theme === 'dark' ? 'dark' : 'light';
  const scale = typeof options.scale === 'number' && options.scale > 0 && options.scale <= 4 ? options.scale : 2;
  const result = await renderDslCode(code, theme, { preferOwn: true });
  const diagnostics = result.compile.diagnostics.length
    ? result.compile.diagnostics
    : result.renderError ? [{ code: result.status === 'unavailable' ? 'E_RENDERER' : 'E_RENDER', message: result.renderError }] : [];
  if (result.status !== 'ok' || !result.rendered) {
    return { ok: false, diagnostics, detected };
  }
  const png = await svgToPng(result.rendered, scale);
  const unknownExtensions = result.compile.unknownExtensions;
  return {
    ok: true, png, svg: result.rendered.svg, width: result.rendered.width, height: result.rendered.height, diagnostics: [], detected,
    ...(unknownExtensions.length ? { unknownExtensions } : {})
  };
}
