/**
 * 积木文本（Gandi 3.0 DSL）的识别 —— 同步、零依赖的那一半。
 *
 * 聊天列表里每条消息都会过一遍这里，所以只做字符串层面的判断：
 *
 * - 有没有 ```gandi-dsl / ```gandi / ```dsl 围栏，有就把消息切成「文字 / 积木」几段；
 * - 没有围栏时，整条消息「像不像」积木文本（{@link looksLikeDsl}）。这只是一道便宜的预筛，
 *   真正拍板要等编译器（engine.ts 的 detectDsl）：整段能解析、能编出积木、而且确实用到了积木调用。
 *
 * 编译器（acorn + 九千行）是懒加载的，预筛不过的消息永远不会把它拉进来。
 */

/** 认作积木文本的围栏语言名（不分大小写）。 */
export const DSL_FENCE_LANGS = ['gandi-dsl', 'gandi', 'dsl'] as const;

/** 发消息时用的围栏语言名。 */
export const DSL_FENCE_LANG = 'gandi-dsl';

/** 服务端的消息长度上限（和 MAX_MESSAGE_CONTENT_LENGTH 一致）。超过它的文本不可能是一条消息，也不去识别。 */
export const DSL_MAX_LENGTH = 2000;

/** Gandi 3.0 DSL 语法文档（积木卡片底部、输入框预览里的「语法文档」）。 */
export const DSL_DOCS_URL = 'https://gandi.kuke.ink/docs/dsl-syntax';

export type DslSegment =
  | { kind: 'text'; text: string }
  | { kind: 'dsl'; code: string; lang: string };

const FENCE_OPEN = /^[ \t]*```[ \t]*([\w-]*)[ \t]*$/;
const FENCE_CLOSE = /^[ \t]*```[ \t]*$/;

function isDslLang(lang: string): boolean {
  return (DSL_FENCE_LANGS as readonly string[]).includes(lang.toLowerCase());
}

/**
 * 按围栏把消息切段。只有语言名是积木文本的围栏才切出来；别的围栏（```js 之类）原样留在文字里。
 * 没闭合的积木围栏一直算到结尾（手机上常见：最后那三个反引号懒得打）。
 *
 * 没有任何积木围栏时返回 null —— 调用方据此走普通文字渲染，不用多建一层数组。
 */
export function splitDslFences(text: string): DslSegment[] | null {
  if (!text.includes('```')) {
    return null;
  }
  const lines = text.split('\n');
  const segments: DslSegment[] = [];
  let buffer: string[] = [];
  let found = false;
  let index = 0;

  const flushText = (): void => {
    const value = buffer.join('\n');
    buffer = [];
    if (value.trim()) {
      segments.push({ kind: 'text', text: value.replace(/^\n+|\n+$/g, '') });
    }
  };

  while (index < lines.length) {
    const line = lines[index];
    const open = FENCE_OPEN.exec(line);
    if (open && isDslLang(open[1] ?? '')) {
      flushText();
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !FENCE_CLOSE.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      index += 1; // 跳过闭合的那一行（没闭合时已经到头）
      found = true;
      segments.push({ kind: 'dsl', code: code.join('\n').replace(/\s+$/, ''), lang: open[1].toLowerCase() });
      continue;
    }
    if (open && open[1]) {
      // 别的语言的围栏：整段原样当文字，里面就算有 ```dsl 字样也不当成积木围栏
      buffer.push(line);
      index += 1;
      while (index < lines.length && !FENCE_CLOSE.test(lines[index])) {
        buffer.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) {
        buffer.push(lines[index]);
      }
      index += 1;
      continue;
    }
    buffer.push(line);
    index += 1;
  }
  flushText();
  return found ? segments : null;
}

/**
 * 随包快照里的扩展（src/vendor/gandi-dsl/extension-schemas.json，见 scripts/gandi-dsl/generate-extension-schemas.mjs）。
 * `pen.penDown()` 这种只有扩展积木的消息也要能过预筛。这个文件不能 import 那份 JSON（太大、要同步零依赖），
 * 所以写死一份；gandiDsl.test.mjs 会核对它和快照一致。
 */
export const SNAPSHOT_EXTENSION_IDS = ['pen', 'music', 'videoSensing', 'text2speech', 'translate', 'makeymakey', 'microbit', 'ev3',
  'boost', 'wedo2', 'gdxfor', 'gandiScene', 'gandiTilemap', 'tw', 'gandiLighting', 'gandiParticles', 'gandiPhysics'] as const;

const CORE_NAMESPACES = ['when', 'motion', 'looks', 'sound', 'event', 'control', 'sensing', 'operator', 'data', 'procedures', 'argument', 'ccw', 'interpolation'];
const extraNamespaces = new Set<string>();

/** 名字只会是标识符（字母数字 _ $），要转义的只有 `$`。 */
function escapeRegExp(text: string): string {
  return text.replace(/\$/g, '\\$');
}

/**
 * 积木调用的样子：`分类.积木名(`、`when.xxx(`、`define(`、`call[`。
 * 分类名是编译器认的核心分类（见 core-schema.json）、`when` 这个帽子的写法、随包快照里的扩展，
 * 以及宿主作品里装了的扩展（{@link registerDslNamespaces}）。
 */
let blockCall = buildBlockCall();

function buildBlockCall(): RegExp {
  const names = [...CORE_NAMESPACES, ...SNAPSHOT_EXTENSION_IDS, ...extraNamespaces].map(escapeRegExp).join('|');
  return new RegExp(`(?:^|[^\\w$.])(?:${names})\\.[A-Za-z_]\\w*\\s*\\(|(?:^|[^\\w$.])(?:define\\s*\\(|call\\s*\\[)`);
}

/** 宿主作品里装了的扩展 id（写成标识符的才有用）：之后只有这些扩展积木的消息也能过预筛。 */
export function registerDslNamespaces(ids: Iterable<string>): void {
  let changed = false;
  for (const id of ids) {
    if (/^[A-Za-z_$][\w$]*$/.test(id) && !extraNamespaces.has(id) && !(SNAPSHOT_EXTENSION_IDS as readonly string[]).includes(id)) {
      extraNamespaces.add(id);
      changed = true;
    }
  }
  if (changed) blockCall = buildBlockCall();
}

/**
 * 没有围栏的消息要不要交给编译器再判一次。
 *
 * 只看字面：长度合适、里面出现过积木调用。普通聊天（哪怕带点英文和括号）基本过不了这一关；
 * 一段通用 JS 就算过了，也会在编译那一步因为解析不了 / 编不出积木 / 用到未知积木被刷掉。
 */
export function looksLikeDsl(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 8 || trimmed.length > DSL_MAX_LENGTH) {
    return false;
  }
  return blockCall.test(trimmed);
}

/** 这条消息有没有可能渲染成积木（有积木围栏，或预筛通过）。只做字符串判断。 */
export function mayContainDsl(text: string): boolean {
  return splitDslFences(text) !== null || looksLikeDsl(text);
}

/** 把一段积木文本包成发消息用的围栏。 */
export function wrapDslFence(code: string): string {
  return `\`\`\`${DSL_FENCE_LANG}\n${code.replace(/\s+$/, '')}\n\`\`\``;
}

/** 会话列表的一行摘要：积木围栏换成「[积木]」，别的文字照留。没有积木围栏时原样返回。 */
export function dslPreviewText(text: string): string {
  const segments = splitDslFences(text);
  if (!segments) {
    return text;
  }
  return segments.map((segment) => (segment.kind === 'dsl' ? '[积木]' : segment.text.replace(/\s+/g, ' ').trim())).filter(Boolean).join(' ');
}
