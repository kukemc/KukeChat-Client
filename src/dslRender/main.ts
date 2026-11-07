/**
 * 安卓用的积木渲染页（`npm run build:dsl-render` → dist-dsl-render/）。
 *
 * 安卓应用在一个隐藏的 WebView 里打开 index.html（file:///android_asset/...），调下面两个全局函数：
 *
 *   window.kukeDslDetect(text) => boolean
 *   window.kukeDslRender(text, { theme: 'light' | 'dark', scale?: number }) => Promise<{
 *     ok, png?, svg?, width?, height?, diagnostics: [{ line?, column?, code, message, fix? }], detected?
 *   }>
 *
 * 识别规则、渲染流程和聊天界面完全一样（共用 src/gandiDsl）。积木库用随页面发布的 gandi-blocks/，
 * 全部相对路径、不联网。契约见 docs/gandi-dsl-blocks.md。
 */
import { splitDslFences } from '@/gandiDsl/detect';
import { detectDsl, renderForAndroid, type KukeDslRenderOptions, type KukeDslRenderOutput } from '@/gandiDsl/pipeline';

declare global {
  interface Window {
    kukeDslRender?: (text: string, opts?: KukeDslRenderOptions) => Promise<KukeDslRenderOutput>;
    kukeDslDetect?: (text: string) => boolean;
    kukeDslReady?: boolean;
  }
}

/** 整条消息里取要画的代码：有积木围栏取第一段，没有就是整段。 */
function extractCode(text: string): { code: string; fenced: boolean } {
  const segments = splitDslFences(String(text ?? ''));
  const fence = segments?.find((segment) => segment.kind === 'dsl');
  return fence && fence.kind === 'dsl' ? { code: fence.code, fenced: true } : { code: String(text ?? '').trim(), fenced: false };
}

window.kukeDslDetect = (text: string): boolean => {
  try {
    const { code, fenced } = extractCode(text);
    return fenced || detectDsl(code);
  } catch {
    return false;
  }
};

window.kukeDslRender = async (text: string, opts: KukeDslRenderOptions = {}): Promise<KukeDslRenderOutput> => {
  try {
    return await renderForAndroid(String(text ?? ''), opts ?? {}, extractCode);
  } catch (error) {
    return { ok: false, diagnostics: [{ code: 'E_INTERNAL', message: error instanceof Error ? error.message : String(error) }] };
  }
};

window.kukeDslReady = true;
window.dispatchEvent(new Event('kukedslready'));
