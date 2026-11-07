/**
 * 画图前把扩展积木的定义备好：积木库里没有 `pen_penDown` 的定义，domToBlock 就建不出来。
 *
 * 一段脚本里用到的每种积木（含菜单影子），按顺序找定义：
 *
 * 1. 积木库里已经有（宿主编辑器装了这个扩展；或者之前已经定义过）→ 直接用；
 * 2. 宿主 VM 里装了这个扩展（hostExtensions.ts）→ 用 VM 给的那份 JSON —— 第三方扩展也和编辑器里一模一样；
 * 3. 随包快照（extension-blocks.json，官方 + Gandi 内置扩展，中文）；
 * 4. 编译时现编的占位积木（没装的扩展，unknownCalls.ts）→ 灰色占位定义，字是 `myExt.doThing`，口子照编译结果开。
 *
 * **宿主的积木库只加不改**：不碰它已有的任何定义，补的定义一律挂在带前缀的类型名下（`kukedsl:pen_penDown`，
 * 冒号不是标识符字符，Gandi 那种按 `/^[\w$]+_[\w$]+$/` 枚举积木的地方不会把它当成积木），只在画图用的 XML 里换名；
 * 拖进编辑器的 XML 不动，还是真操作码。自己加载的积木库（隐藏 iframe 里那份）是我们自己的，直接用真类型名定义。
 */
import type { BlocklyContext } from './blockly';
import type { DslCompileOutput } from './engine';
import { liveExtensions } from './hostExtensions';
import type { PlaceholderSpec } from './unknownCalls';

type Json = Record<string, unknown>;

interface SnapshotExtension {
  name: string;
  colours: [string, string, string];
  colorGradient?: unknown;
  icon?: string;
  menuIcon?: string;
  menus: Json[];
  blocks: Json[];
}

interface SnapshotIndex {
  /** 积木类型 → [所属扩展, 精简过的 JSON] */
  types: Map<string, { extension: SnapshotExtension; json: Json }>;
}

const HOST_PREFIX = 'kukedsl:';

let snapshotPending: Promise<SnapshotIndex> | null = null;

/** 快照很大（几百 KB），只在真要画扩展积木时才加载（桌面端 / 网页是单独的一块）。 */
function loadSnapshot(): Promise<SnapshotIndex> {
  if (!snapshotPending) {
    snapshotPending = import('@/vendor/gandi-dsl/extension-blocks.json').then((module) => {
      const file = ((module as { default?: unknown }).default ?? module) as { extensions: Record<string, SnapshotExtension> };
      const types = new Map<string, { extension: SnapshotExtension; json: Json }>();
      for (const extension of Object.values(file.extensions)) {
        for (const json of [...extension.menus, ...extension.blocks]) {
          if (typeof json.type === 'string') types.set(json.type, { extension, json });
        }
      }
      return { types };
    });
    snapshotPending.catch(() => {
      snapshotPending = null;
    });
  }
  return snapshotPending;
}

/** 快照里省掉的字段补回去：配色、分类名、图标。 */
function expandSnapshot(extension: SnapshotExtension, json: Json): Json {
  const [colour, colourSecondary, colourTertiary] = extension.colours;
  const filled: Json = { colour, colourSecondary, colourTertiary, category: extension.name, ...json };
  if (extension.colorGradient && !('colourGradient' in json)) filled.colourGradient = extension.colorGradient;
  const icons = (value: unknown): unknown => {
    if (value === '$icon') return extension.icon ?? '';
    if (value === '$menuIcon') return extension.menuIcon ?? extension.icon ?? '';
    if (Array.isArray(value)) return value.map(icons);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, icons(item)]));
    return value;
  };
  return icons(filled) as Json;
}

/** `media://repeat.svg`（VM 给 LOOP 型积木底下那个箭头）换成积木库的素材目录。见 gandi-gui 的 blocks/extensions.ts。 */
function resolveMedia(json: Json, media: string): Json {
  const out: Json = { ...json };
  for (let i = 0; Array.isArray(out[`args${i}`]); i += 1) {
    out[`args${i}`] = (out[`args${i}`] as Json[]).map((arg) => {
      if (arg && typeof arg.src === 'string' && arg.src.startsWith('media://')) return { ...arg, src: `${media}${arg.src.slice('media://'.length)}` };
      // 没有选项的下拉（动态菜单存不进 JSON）：积木库建不出来。给一个空选项，画出来显示的是 XML 里的值
      if (arg?.type === 'field_dropdown' && typeof arg.options !== 'function' && !(Array.isArray(arg.options) && arg.options.length)) {
        return { ...arg, options: [['', '']] };
      }
      return arg;
    });
  }
  // 空的渐变别传给不认识它的积木库（CCW 的 Gandi 2）
  if (out.colourGradient === null || out.colourGradient === undefined) delete out.colourGradient;
  return out;
}

const GREY = { colour: '#8a8f99', colourSecondary: '#767b85', colourTertiary: '#62666f' };

/** 占位积木的定义：灰色，第一行是 `⚠ myExt.doThing` 加参数口，每个 C 形口单独一行。 */
function placeholderJson(spec: PlaceholderSpec): Json {
  const json: Json = { type: spec.opcode, inputsInline: true, tooltip: `扩展「${spec.extensionId}」没有装，这块积木先用占位块显示`, ...GREY };
  const head: Json[] = [{ type: 'field_label', text: `⚠ ${spec.label}` }];
  const stacks: string[] = [];
  for (const input of spec.inputs) {
    if (input.kind === 'stack') stacks.push(input.name);
    else head.push(input.kind === 'boolean' ? { type: 'input_value', name: input.name, check: 'Boolean' } : { type: 'input_value', name: input.name });
  }
  json.message0 = head.map((_, index) => `%${index + 1}`).join(' ');
  json.args0 = head;
  stacks.forEach((name, index) => {
    json[`message${index + 1}`] = '%1';
    json[`args${index + 1}`] = [{ type: 'input_statement', name }];
  });
  if (spec.shape === 'reporter' || spec.shape === 'boolean') {
    json.output = spec.shape === 'boolean' ? 'Boolean' : null;
    json.outputShape = spec.shape === 'boolean' ? 1 : 2;
  } else if (spec.shape === 'hat') {
    json.nextStatement = null;
    json.extensions = ['shape_hat'];
  } else {
    json.previousStatement = null;
    json.nextStatement = null;
  }
  return json;
}

/** 每个积木库上我们补过的类型（宿主的：带前缀的名字；自己的：真名字）。 */
const definedBy = new WeakMap<object, Set<string>>();

function define(ctx: BlocklyContext, type: string, json: Json): void {
  const { Blockly } = ctx;
  const definition = { ...json, type };
  if (typeof Blockly.defineBlocksWithJsonArray === 'function') {
    Blockly.defineBlocksWithJsonArray([definition]);
  } else {
    Blockly.Blocks[type] = {
      init(this: { jsonInit(value: Json): void }) {
        this.jsonInit(definition);
      }
    };
  }
  let set = definedBy.get(Blockly);
  if (!set) {
    set = new Set();
    definedBy.set(Blockly, set);
  }
  set.add(type);
}

function typesIn(xml: string[]): Set<string> {
  const types = new Set<string>();
  for (const text of xml) {
    for (const match of text.matchAll(/<(?:block|shadow)\b[^>]*?\btype="([^"]+)"/g)) types.add(match[1]);
  }
  return types;
}

function unescapeXml(value: string): string {
  return value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, '\'').replace(/&amp;/g, '&');
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * 备好这段脚本要的扩展积木定义，返回画图用的 XML（宿主积木库上补的定义换成了带前缀的类型名）。
 * 积木库里没有、也找不到定义的类型原样留着 —— 画的时候会报错，卡片退回显示代码（和以前一样）。
 */
export async function prepareExtensionBlocks(ctx: BlocklyContext, compile: DslCompileOutput): Promise<string[]> {
  const { Blockly } = ctx;
  const host = ctx.kind === 'host';
  const ours = definedBy.get(Blockly);
  const renames = new Map<string, string>();
  const missing = [...typesIn(compile.scriptXml)].map(unescapeXml).filter((type) => {
    if (host) {
      if (Object.prototype.hasOwnProperty.call(Blockly.Blocks, type) && Blockly.Blocks[type]) return false;
      if (ours?.has(HOST_PREFIX + type)) {
        renames.set(type, HOST_PREFIX + type);
        return false;
      }
      return true;
    }
    return !Blockly.Blocks[type];
  });
  if (missing.length) {
    const live = liveExtensions();
    const needSnapshot = missing.some((type) => !live?.json.has(type) && !compile.placeholders[type]);
    const snapshot = needSnapshot ? await loadSnapshot() : null;
    for (const type of missing) {
      let json: Json | null = null;
      const fromLive = live?.json.get(type);
      const fromSnapshot = snapshot?.types.get(type);
      if (fromLive) json = fromLive;
      else if (fromSnapshot) json = expandSnapshot(fromSnapshot.extension, fromSnapshot.json);
      else if (compile.placeholders[type]) json = placeholderJson(compile.placeholders[type]);
      if (!json) continue;
      const target = host ? HOST_PREFIX + type : type;
      try {
        define(ctx, target, resolveMedia(json, ctx.media));
        if (host) renames.set(type, target);
      } catch {
        // 定义本身坏了：留给画图那一步报错
      }
    }
  }
  if (!renames.size) return compile.scriptXml;
  return compile.scriptXml.map((xml) => xml.replace(/(<(?:block|shadow)\b[^>]*?\btype=")([^"]+)(")/g, (whole, open: string, raw: string, close: string) => {
    const renamed = renames.get(unescapeXml(raw));
    return renamed ? `${open}${escapeXml(renamed)}${close}` : whole;
  }));
}
