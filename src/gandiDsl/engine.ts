/**
 * 积木文本的编译与识别（懒加载的那一半：会把 acorn 和编译器带进来）。
 *
 * 编译器是从 Gandi 3.0 原样拷来的（src/vendor/gandi-dsl，见那里的 README），这里只做聊天需要的包装：
 *
 * 1. **没声明的变量自动补上。** 编译器的规矩是「作品里已有的变量不用声明」，可聊天里没有作品 ——
 *    照搬的话 `x = 1;`、`L.push(v)`、`broadcast("开始")` 全是 E_UNKNOWN_VAR。所以编译报
 *    「不认识的变量 / 列表 / 广播」时，把那个名字当成作品里已有的（角色变量 / 角色列表 / 广播）
 *    再编一遍，直到不再冒出新名字。真写了声明的照声明来；补出来的名字放在 autoDeclared 里给界面提示。
 *    `L.push(...)` 这种在列表名不认识时会被当成未知扩展积木（E_UNKNOWN_BLOCK L_push），也按列表补。
 *
 * 2. **扩展积木。** 随包带着官方 + Gandi 内置扩展的 schema 快照（extension-schemas.json，`pen.penDown()`、
 *    `music.playNoteForBeats(60, 0.25)`、`gandiScene.switchTo("main")` 直接能编）；在 CCW 编辑器 / 播放器里还会并上
 *    宿主作品里装了的扩展（hostExtensions.ts，第三方扩展也算，盖过快照）。都不认识的扩展积木
 *    （前缀不是核心分类、也不是认识的扩展）按写法现编一块灰色占位积木（unknownCalls.ts），其余照常画；
 *    拼错的核心 / 已知扩展积木（`looks.sayy`、`pen.penDwn`）仍然报 E_UNKNOWN_BLOCK。
 *
 * 3. **识别（detectDsl）。** 没有围栏的消息要同时满足：整段编译零错误、至少编出一块积木、
 *    并且至少有一块「真积木」—— 帽子或者运动 / 外观 / 声音 / 侦测 / 事件 / 自制积木这类。
 *    只有 if / while / 赋值 / 运算的那种（也就是看起来像普通 JS 的）不算，免得把代码片段误认成积木。
 */
import { compileDsl, type CompileOptions, type Schema, type VariableBinding } from '@/vendor/gandi-dsl/compiler';
import type { Diagnostic } from '@/vendor/gandi-dsl/parser';
import type { BlockTable, CommentTable } from '@/vendor/gandi-dsl/blocks';
import coreSchema from '@/vendor/gandi-dsl/core-schema.json';
import extensionSchemaFile from '@/vendor/gandi-dsl/extension-schemas.json';
import { CORE_CATEGORIES } from '@/vendor/gandi-dsl/extensionIds';
import { blockToXml } from './blockXml';
import { DSL_MAX_LENGTH, looksLikeDsl } from './detect';
import { liveExtensions } from './hostExtensions';
import { placeholderSchema, scanExtensionCalls, type PlaceholderSpec } from './unknownCalls';

export type { PlaceholderSpec } from './unknownCalls';

export interface DslDiagnostic {
  line?: number;
  column?: number;
  code: string;
  message: string;
  fix?: string;
}

export interface DslAutoDeclared {
  variables: string[];
  lists: string[];
  broadcasts: string[];
}

export interface DslCompileOutput {
  ok: boolean;
  /** 编出来的积木表（失败时为 null）。 */
  blocks: BlockTable | null;
  comments: CommentTable | null;
  /** 每段脚本的顶层积木 id，按源文顺序。 */
  roots: string[];
  diagnostics: DslDiagnostic[];
  warnings: DslDiagnostic[];
  autoDeclared: DslAutoDeclared;
  /** 每段脚本一条 `<block>` XML（不带 `<xml>` 根），画图用：不含注释、不带坐标。 */
  scriptXml: string[];
  /**
   * 拖进 Gandi 用的 XML：几段 `<block>` 首尾相接（不带 `<xml>` 根，带注释和坐标）。
   * Gandi 的 insertBlocksXml 会自己包一层 `<xml>`，和它导出的 SVG 里藏的格式一致。
   */
  embedXml: string;
  /** 没装的扩展积木按写法现编的占位积木（操作码 → 样子）。画图时用灰色占位定义画它们。 */
  placeholders: Record<string, PlaceholderSpec>;
  /** 占位积木所属的扩展 id（卡片上提示「扩展 xx 不认识」）。 */
  unknownExtensions: string[];
  /** 编译用的 schema 版本（随包快照 / 宿主作品里的扩展），渲染缓存按它分。 */
  schemaKey: string;
}

type SchemaShape = Record<string, { shape?: string; category?: string; fields?: Record<string, { variableType?: string }>;
  inputs?: Record<string, { type?: string }>; parameters?: string[]; extension?: { id?: string } }>;
const CORE_SCHEMA = coreSchema as unknown as SchemaShape;
/** 随包的扩展快照（scripts/gandi-dsl/generate-extension-schemas.mjs 生成）。 */
const STATIC_EXTENSION_SCHEMA = (extensionSchemaFile as unknown as { schema: Schema }).schema;

interface ActiveSchema {
  key: string;
  /** 传给编译器的扩展 schema（快照 + 宿主作品里的扩展）。 */
  extensions: Schema;
  /** 核心 + 扩展，查形状用。 */
  all: SchemaShape;
  /** 认识的扩展 id。 */
  extensionIds: Set<string>;
}

function idsOf(schema: Schema): Set<string> {
  const ids = new Set<string>();
  for (const spec of Object.values(schema)) {
    if (spec?.extension?.id) ids.add(spec.extension.id);
  }
  return ids;
}

const staticSchema: ActiveSchema = {
  key: 'static',
  extensions: STATIC_EXTENSION_SCHEMA,
  all: { ...CORE_SCHEMA, ...(STATIC_EXTENSION_SCHEMA as unknown as SchemaShape) },
  extensionIds: idsOf(STATIC_EXTENSION_SCHEMA)
};
let liveSchema: ActiveSchema | null = null;

/** 现在用哪份 schema：宿主作品里装了扩展就把它们并到快照上（同名的以宿主为准）。 */
export function activeSchema(): ActiveSchema {
  const live = liveExtensions();
  if (!live) return staticSchema;
  if (liveSchema?.key !== live.key) {
    const extensions = { ...STATIC_EXTENSION_SCHEMA, ...live.schema };
    liveSchema = {
      key: live.key,
      extensions,
      all: { ...CORE_SCHEMA, ...(extensions as unknown as SchemaShape) },
      extensionIds: new Set([...staticSchema.extensionIds, ...live.ids, ...idsOf(live.schema)])
    };
  }
  return liveSchema;
}

/** 自动补声明最多补几轮（每轮至少多认识一个名字）。 */
const MAX_DECLARE_ROUNDS = 40;
const LIST_METHODS = new Set(['push', 'insert', 'remove', 'clear', 'includes', 'indexOf', 'length']);
const IDENT = /^[A-Za-z_$ -￿][\w$ -￿]*$/;

function toDiagnostic(item: { line?: number; column?: number; code: string; message: string; fix?: string }): DslDiagnostic {
  return {
    ...(typeof item.line === 'number' && item.line > 0 ? { line: item.line } : {}),
    ...(typeof item.column === 'number' && item.column > 0 ? { column: item.column } : {}),
    code: item.code,
    message: item.message,
    ...(item.fix ? { fix: item.fix } : {})
  };
}

interface Declared {
  variables: Map<string, string>;
  lists: Map<string, string>;
  broadcasts: Map<string, string>;
  /** 当标识符用的广播（`event.broadcast(go)`）：编译器只认文件里声明过的，得在源文前面补一句声明。 */
  broadcastIdents: Set<string>;
}

const CATEGORY_ROOTS = new Set(['when', 'motion', 'looks', 'sound', 'event', 'control', 'sensing', 'operator', 'data', 'procedures',
  'argument', 'ccw', 'interpolation', 'call', 'ext', 'stage', 'sprite', 'Math', 'body',
  // 扩展的命名空间：`pen.clear()` 是画笔积木，不是名叫 pen 的列表（快照和宿主里的扩展 id 另外在 isNamespace 里查）
  'pen', 'music', 'videoSensing', 'text2speech', 'translate', 'makeymakey', 'microbit', 'wedo2', 'ev3', 'boost', 'gdxfor',
  'gandiScene', 'moreDataTypes']);

/**
 * 预扫一遍：`名字.push(` / `名字.length` / `名字[` 这种写法里的名字多半是列表。
 * 不先认成列表的话，编译器会先把它当变量报「不认识」，补成变量后又冒出列表写法的错。
 */
function isNamespace(name: string, active: ActiveSchema): boolean {
  return CATEGORY_ROOTS.has(name) || active.extensionIds.has(name);
}

function guessLists(source: string, active: ActiveSchema): string[] {
  const names = new Set<string>();
  const pattern = /(?:^|[^\w$.])([A-Za-z_$][\w$]*)\s*(?:\.\s*(push|insert|remove|clear|includes|indexOf|length)|\[)/g;
  for (const match of source.matchAll(pattern)) {
    const name = match[1];
    if (!isNamespace(name, active)) names.add(name);
  }
  // 整个被赋值过的是变量（`s = "abc"; s[1]` 是取字符），不是列表
  for (const match of source.matchAll(/(?:^|[^\w$.])([A-Za-z_$][\w$]*)\s*(?:[-+*/%]|\*\*)?=(?!=)/g)) names.delete(match[1]);
  return [...names];
}

/** 声明过的名字（`const x = sprite.variable(...)` 等）不去猜。 */
function declaredInSource(source: string): Set<string> {
  const names = new Set<string>();
  for (const match of source.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g)) names.add(match[1]);
  return names;
}

/** 从一条「不认识」的报错里认出要补的名字。认不出返回 null。 */
function missingName(diagnostic: { code: string; message: string; fix?: string }, active: ActiveSchema): { kind: 'variable' | 'list' | 'broadcast' | 'broadcastIdent'; name: string } | null {
  if (diagnostic.code === 'E_UNKNOWN_VAR') {
    let match = /^Unknown identifier (.+); declare it first$/.exec(diagnostic.message);
    if (match) {
      const fix = diagnostic.fix ?? '';
      const kind = /\.list\(/.test(fix) ? 'list' : /broadcast\(/.test(fix) ? 'broadcastIdent' : 'variable';
      return { kind, name: match[1] };
    }
    match = /^Unknown (variable|list) (.+)$/.exec(diagnostic.message);
    if (match) {
      return { kind: match[1] === 'list' ? 'list' : 'variable', name: match[2] };
    }
    match = /^Declare broadcast (.+) first$/.exec(diagnostic.message);
    if (match) {
      return { kind: 'broadcast', name: match[1] };
    }
    return null;
  }
  if (diagnostic.code === 'E_UNKNOWN_BLOCK') {
    // `L.push(v)`：L 不认识时被当成扩展 L 的 push 积木
    const match = /^Unknown block ([^\s_]+)_(\w+)$/.exec(diagnostic.message);
    if (match && IDENT.test(match[1]) && !isNamespace(match[1], active) && LIST_METHODS.has(match[2]) && !active.all[`${match[1]}_${match[2]}`]) {
      return { kind: 'list', name: match[1] };
    }
  }
  return null;
}

function bindingsOf(declared: Declared): { self: Record<string, VariableBinding> } {
  const self: Record<string, VariableBinding> = Object.create(null) as Record<string, VariableBinding>;
  for (const [name, id] of declared.variables) self[name] = { id, type: 'variable' };
  for (const [name, id] of declared.lists) {
    const prior = self[name];
    const entry = { id, type: 'list' as const };
    self[name] = prior ? [...(Array.isArray(prior) ? prior : [typeof prior === 'string' ? { id: prior, type: 'variable' as const } : prior]), entry] : entry;
  }
  return { self };
}

/** 编译器记的字段变量类型补成 XML 认的 variabletype（变量是空串、列表是 list、广播是 broadcast_msg）。 */
function annotateVariableTypes(blocks: BlockTable, schema: SchemaShape): void {
  for (const block of Object.values(blocks)) {
    for (const [name, field] of Object.entries(block.fields ?? {})) {
      const type = schema[block.opcode]?.fields?.[name]?.variableType;
      if (type && typeof field.variableType !== 'string') {
        field.variableType = type === 'broadcast' ? 'broadcast_msg' : type === 'variable' ? '' : type;
      }
    }
  }
}

let idSeed = 0;

/**
 * 一条 E_UNKNOWN_BLOCK 是不是「没装的扩展积木」：前缀不是核心分类、不是认识的扩展，而且源文里扫得到这个调用。
 * 拼错的核心积木（`looks.sayy`）和认识的扩展里没有的积木（`pen.penDwn`）不算 —— 那是真错。
 */
function unknownExtensionCall(diagnostic: Diagnostic, calls: () => Map<string, PlaceholderSpec>, active: ActiveSchema): PlaceholderSpec | null {
  if (diagnostic.code !== 'E_UNKNOWN_BLOCK') return null;
  const match = /^Unknown block (\S+)$/.exec(diagnostic.message);
  if (!match || match[1].startsWith('@')) return null;
  const spec = calls().get(match[1]);
  if (!spec) return null;
  const head = spec.extensionId.split('.')[0];
  if (CORE_CATEGORIES.has(spec.extensionId) || CATEGORY_ROOTS.has(head) || active.extensionIds.has(spec.extensionId)) return null;
  return spec;
}

/**
 * 编译一段积木文本。
 * - 没声明的变量 / 列表 / 广播自动当成「作品里已有的」补上；
 * - 没装的扩展积木按写法当成占位积木（见 unknownCalls.ts），结果的 placeholders / unknownExtensions 里列出来。
 */
export function compileSnippet(source: string): DslCompileOutput {
  const active = activeSchema();
  const declared: Declared = { variables: new Map(), lists: new Map(), broadcasts: new Map(), broadcastIdents: new Set() };
  const placeholders = new Map<string, PlaceholderSpec>();
  let scanned: Map<string, PlaceholderSpec> | null = null;
  const calls = (): Map<string, PlaceholderSpec> => {
    scanned ??= scanExtensionCalls(source, {
      booleanSlot: (opcode, index) => {
        const spec = active.all[opcode];
        const name = spec?.parameters?.[index];
        return Boolean(name && spec?.inputs?.[name]?.type === 'boolean');
      }
    });
    return scanned;
  };
  const prefix = `kc${(idSeed++).toString(36)}`;
  let counter = 0;
  const nextId = (kind: string): string => `${prefix}_${kind}${(counter++).toString(36)}`;
  const explicit = declaredInSource(source);
  for (const name of guessLists(source, active)) {
    if (!explicit.has(name)) declared.lists.set(name, nextId('l'));
  }
  /** 广播标识符的声明拼在第一行前面（不加换行，行号不变；第一行的列号事后减回去）。 */
  let lead = '';
  const run = (): ReturnType<typeof compileDsl> => {
    lead = [...declared.broadcastIdents].map((name) => `const ${name} = broadcast(${JSON.stringify(name)}); `).join('');
    const schema: Schema = placeholders.size
      ? { ...active.extensions, ...Object.fromEntries([...placeholders.values()].map((spec) => [spec.opcode, placeholderSchema(spec)])) }
      : active.extensions;
    const options: CompileOptions = { autoLayout: true, schema };
    if (declared.variables.size || declared.lists.size) options.variables = bindingsOf(declared);
    if (declared.broadcasts.size) options.broadcasts = Object.fromEntries(declared.broadcasts);
    return compileDsl(lead + source, options);
  };
  let result = run();

  for (let round = 0; round < MAX_DECLARE_ROUNDS && result.diagnostics.length > 0; round += 1) {
    let added = false;
    for (const diagnostic of result.diagnostics) {
      const missing = missingName(diagnostic, active);
      if (!missing) {
        const unknown = unknownExtensionCall(diagnostic, calls, active);
        if (unknown && !placeholders.has(unknown.opcode)) {
          placeholders.set(unknown.opcode, unknown);
          added = true;
        }
        continue;
      }
      if (explicit.has(missing.name)) continue;
      if (missing.kind === 'broadcastIdent') {
        if (IDENT.test(missing.name) && !declared.broadcastIdents.has(missing.name)) {
          declared.broadcastIdents.add(missing.name);
          added = true;
        }
        continue;
      }
      // 已经猜成列表的名字不再补成变量（会变成「变量和列表同名」）
      if (missing.kind === 'variable' && declared.lists.has(missing.name)) continue;
      const table = missing.kind === 'variable' ? declared.variables : missing.kind === 'list' ? declared.lists : declared.broadcasts;
      if (!table.has(missing.name)) {
        table.set(missing.name, nextId(missing.kind === 'variable' ? 'v' : missing.kind === 'list' ? 'l' : 'b'));
        added = true;
      }
    }
    if (!added) break;
    result = run();
  }
  if (lead) {
    const shift = (item: Diagnostic): Diagnostic => (item.line === 1 && item.column > lead.length ? { ...item, column: item.column - lead.length } : item);
    result = { ...result, diagnostics: result.diagnostics.map(shift), warnings: result.warnings.map(shift) };
  }
  // 猜成列表但根本没用到列表写法的不提示（guessLists 是宽松的）
  const usedLists = new Set<string>();
  for (const block of Object.values(result.blocks ?? {})) {
    const list = block.fields?.LIST;
    if (list && typeof list.value === 'string') usedLists.add(list.value);
  }

  const autoDeclared: DslAutoDeclared = {
    variables: [...declared.variables.keys()],
    lists: [...declared.lists.keys()].filter((name) => usedLists.has(name)),
    broadcasts: [...declared.broadcasts.keys(), ...declared.broadcastIdents]
  };
  const diagnostics = result.diagnostics.map(toDiagnostic);
  const warnings = result.warnings.map(toDiagnostic);
  const blocks = result.diagnostics.length === 0 ? result.blocks : null;
  if (!blocks) {
    return {
      ok: false, blocks: null, comments: null, roots: [], diagnostics, warnings, autoDeclared, scriptXml: [], embedXml: '',
      placeholders: {}, unknownExtensions: [], schemaKey: active.key
    };
  }
  // 真用上了的占位积木
  const usedPlaceholders: Record<string, PlaceholderSpec> = {};
  for (const block of Object.values(blocks)) {
    const spec = placeholders.get(block.opcode);
    if (spec) usedPlaceholders[spec.opcode] = spec;
  }
  const unknownExtensions = [...new Set(Object.values(usedPlaceholders).map((spec) => spec.extensionId))];
  annotateVariableTypes(blocks, active.all);
  const roots = (result.roots ?? []).filter((id): id is string => typeof id === 'string' && Boolean(blocks[id]));
  if (roots.length === 0) {
    // 老版本编译器不给 roots 时按坐标排
    roots.push(...Object.values(blocks).filter((block) => block.topLevel && !block.shadow)
      .sort((a, b) => (a.y ?? 0) - (b.y ?? 0) || (a.x ?? 0) - (b.x ?? 0)).map((block) => block.id));
  }
  const comments = result.comments ?? null;
  return {
    ok: roots.length > 0,
    blocks,
    comments,
    roots,
    diagnostics: roots.length > 0 ? diagnostics : [{ code: 'E_EMPTY', message: '这段文本没有编出任何积木', fix: '写一段积木，例如 when.flagclicked(() => { looks.say("你好"); });' }],
    warnings,
    autoDeclared,
    scriptXml: roots.map((id) => blockToXml(id, blocks)),
    embedXml: roots.map((id) => blockToXml(id, blocks, comments, true)).join(''),
    placeholders: usedPlaceholders,
    unknownExtensions,
    schemaKey: active.key
  };
}

/** 「只有控制 / 变量 / 运算」的积木不算数：那种文本看起来就是普通 JS。 */
const GENERIC_PREFIXES = ['control_', 'data_', 'operator_', 'argument_', 'math_', 'text', 'colour_'];

/** 占位积木（没装的扩展）不算：`console.log(x)` 也会编成占位积木，它不该让一条消息被认成积木。 */
function hasRealBlock(blocks: BlockTable, schema: SchemaShape, placeholders: Record<string, PlaceholderSpec>): boolean {
  return Object.values(blocks).some((block) => {
    if (block.shadow || placeholders[block.opcode]) return false;
    if (schema[block.opcode]?.shape === 'hat' || block.opcode === 'procedures_definition') return true;
    return !GENERIC_PREFIXES.some((prefix) => block.opcode.startsWith(prefix)) && block.opcode !== 'procedures_prototype';
  });
}

const detectCache = new Map<string, boolean>();

/**
 * 一条没有围栏的消息是不是整段积木文本。
 * 规则：预筛通过 → 整段编译零错误 → 至少一块积木 → 至少一块真积木（帽子、运动外观声音侦测事件、自制积木……）。
 */
export function detectDsl(text: string): boolean {
  const source = text.trim();
  if (!source || source.length > DSL_MAX_LENGTH || !looksLikeDsl(source)) {
    return false;
  }
  const key = `${activeSchema().key}\u0000${source}`;
  const cached = detectCache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  let detected = false;
  try {
    const output = compileSnippet(source);
    detected = output.ok && output.blocks !== null && hasRealBlock(output.blocks, activeSchema().all, output.placeholders);
  } catch {
    detected = false;
  }
  if (detectCache.size > 500) {
    detectCache.clear();
  }
  detectCache.set(key, detected);
  return detected;
}
