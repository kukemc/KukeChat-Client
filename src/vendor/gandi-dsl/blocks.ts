export interface VmField {
    name: string;
    value: unknown;
    id?: string | null;
    [key: string]: unknown;
}

export interface VmInput {
    name: string;
    block: string | null;
    shadow: string | null;
    [key: string]: unknown;
}

export interface VmBlock {
    id: string;
    opcode: string;
    parent?: string | null;
    next?: string | null;
    topLevel?: boolean;
    shadow: boolean;
    x?: number;
    y?: number;
    fields: Record<string, VmField>;
    inputs: Record<string, VmInput>;
    mutation?: Record<string, unknown>;
    [key: string]: unknown;
}

export type BlockTable = Record<string, VmBlock>;

export interface VmComment {
    id: string;
    text: string;
    blockId: string | null;
    x: number | null;
    y: number | null;
    width: number;
    height: number;
    minimized: boolean;
    [key: string]: unknown;
}

export type CommentTable = Record<string, VmComment>;

export interface VmFrame {
    id: string;
    title: string;
    blocks: string[];
    x: number;
    y: number;
    width: number;
    height: number;
    color?: string;
    locked?: boolean;
    collapsed?: boolean;
    [key: string]: unknown;
}

export type FrameTable = Record<string, VmFrame>;

/**
 * 一页积木里的脚本（顶层积木）。按**实际连接**认：被别的积木的 next / 输入引用着的不是顶层，哪怕它的 parent 指针是空的
 * （旧作品里有这种表：parent 没写、连接却在，照 parent 认会把同一块既当脚本又当子积木打印两遍）。
 * 没人引用、parent 却指着一块还在的积木、又不是 topLevel 的，是表里的残块：不算脚本（打印不出、编译也不动它）。
 */
export const scriptRoots = (table: BlockTable): VmBlock[] => {
    const referenced = new Set<string>();
    for (const block of Object.values(table)) {
        if (block.next) referenced.add(block.next);
        for (const input of Object.values(block.inputs ?? {})) {
            if (input.block) referenced.add(input.block);
            if (input.shadow) referenced.add(input.shadow);
        }
    }
    return Object.values(table).filter(block => !block.shadow && !referenced.has(block.id) &&
        (!block.parent || !table[block.parent] || block.topLevel === true));
};

/**
 * 脚本在文本里的先后：按 y、x 排；代码框里的脚本跟着框里最靠前的那一段一起出现。
 * 打印器照这个顺序写，编译器在文本没写位置、没写 @id 时照同一个顺序把第 n 段认回第 n 个脚本 —— 两边必须是同一个函数。
 */
export const scriptOrder = (table: BlockTable, frames: FrameTable = {}): VmBlock[] => {
    const sorted = scriptRoots(table).sort((a, b) => (a.y ?? 0) - (b.y ?? 0) || (a.x ?? 0) - (b.x ?? 0));
    const frameOf = new Map<string, string>();
    for (const frame of Object.values(frames)) for (const id of frame.blocks ?? []) if (!frameOf.has(id)) frameOf.set(id, frame.id);
    const result: VmBlock[] = [];
    const emitted = new Set<string>();
    for (const root of sorted) {
        const frame = frameOf.get(root.id);
        if (!frame) { result.push(root); continue; }
        if (emitted.has(frame)) continue;
        emitted.add(frame);
        for (const member of sorted) if (frameOf.get(member.id) === frame) result.push(member);
    }
    return result;
};

/**
 * 两个坐标是不是同一个位置。文本里的坐标是打印时去掉了浮点尾巴的（printer 的 coordinate），代码框里的还是相对值，
 * 加回去和原值差 1e-13 这个量级；按完全相等比，一个字没改的脚本就认不回来。
 */
export const sameCoordinate = (a: number | undefined, b: number | undefined): boolean => a === b ||
    (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b)));

/**
 * 显式写输入框种类的包装：`int(3)`、`text("10")`……
 *
 * 普通字面量按该输入的默认输入框解释（见 inferShadow）；输入框和默认不一样时，打印器写上包装，编译器按包装建。
 * 两边共用这一张表和 inferShadow，打印出来的文字一定编得回同一种输入框。
 */
export const TYPED_SHADOWS = {
    num: 'math_number',
    positive: 'math_positive_number',
    whole: 'math_whole_number',
    int: 'math_integer',
    angle: 'math_angle',
    text: 'text',
    color: 'colour_picker'
} as const;
export type TypedKind = keyof typeof TYPED_SHADOWS;
export const typedKindOf = (opcode: string): TypedKind | null =>
    (Object.keys(TYPED_SHADOWS) as TypedKind[]).find(kind => TYPED_SHADOWS[kind] === opcode) ?? null;

const NUMERIC_SHADOW = /^math_(?:number|integer|positive_number|whole_number|angle)$/;

/** 这个值能不能放进这种输入框（不用包装的情况下） */
export const acceptsShadowLiteral = (opcode: string, value: string | number, numeric: boolean): boolean => {
    if (opcode === 'colour_picker') return typeof value === 'string' && /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value);
    if (NUMERIC_SHADOW.test(opcode) || opcode === 'note' || opcode === 'xigua_white_board_note') {
        return numeric || typeof value === 'number' || value.trim() === '' || Number.isFinite(Number(value));
    }
    return true;
};

/**
 * 不写包装的字面量编成哪种输入框：输入的默认输入框放得下就用它；这个输入没有默认输入框时，数字 → 数字框，
 * 文字 → 文字框。放不下返回 null（编译器报错，要求写包装）。`numeric` 表示原文是数字字面量。
 */
export const inferShadow = (expected: string | undefined, value: string | number, numeric: boolean): string | null => {
    if (expected) return acceptsShadowLiteral(expected, value, numeric) ? expected : null;
    return typeof value === 'number' || numeric ? 'math_number' : 'text';
};

export const literalShadow = (block: VmBlock): unknown => {
    if (!block.shadow) return undefined;
    if (/^math_(number|integer|positive_number|whole_number|angle)$/.test(block.opcode)) {
        const raw = block.fields.NUM?.value;
        const numeric = Number(raw);
        return raw !== '' && Number.isFinite(numeric) ? numeric : String(raw ?? '');
    }
    if (block.opcode === 'text') return block.fields.TEXT?.value ?? '';
    const fields = Object.values(block.fields);
    if (fields.length === 1 && Object.keys(block.inputs).length === 0) return fields[0].value;
    return undefined;
};

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/** 写不成点链的扩展 id（连字符、空格、中文……）和任何写不成标识符的积木名，用 `ext["id"]["name"](...)` 的字符串键写法 */
export const EXT_NAMESPACE = 'ext';

/**
 * 扩展 id 写成点链的条件：按 `.` 拆开每一段都是标识符。`test.moreDataTypes` 写成 `test.moreDataTypes.getNewSet()`，
 * 和 JavaScript 里的成员链一样。不同的 id 写出来的链不同，链拆回 id 只靠「去掉最后一段方法名、其余用点连起来」，
 * 所以打印、解析互逆（id 里的下划线属于 id，不拆）。
 */
export const isNamespaceId = (id: string): boolean => {
    if (id === '') return false;
    const parts = id.split('.');
    // 第一段是写在最前面的标识符：JS 保留字（`if.go()`、`null.go()` 读不回）和 DSL 自己占用的根名（`when.go()` 是 hat，
    // `Math.go()` 是数学函数）不能当扩展前缀，走 ext["id"] 的字符串键写法；后面几段是属性名，保留字也行
    return parts.every(part => IDENTIFIER.test(part)) && !RESERVED_ROOTS.has(parts[0]);
};

/** 不能当「扩展 id 点链的第一段」的名字：JS 保留字、字面量，和 DSL 里有语法含义的根名（不含 event 这类核心分类：核心积木也走同一条打印路径） */
const RESERVED_ROOTS: ReadonlySet<string> = new Set([
    'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do', 'else', 'enum', 'export', 'extends',
    'false', 'finally', 'for', 'function', 'if', 'import', 'in', 'instanceof', 'new', 'null', 'return', 'super', 'switch', 'this',
    'throw', 'true', 'try', 'typeof', 'var', 'void', 'while', 'with',
    'when', 'call', 'Math', 'JSON', 'Object', 'Array', 'Set', 'store', 'ads', 'ext', 'stage', 'sprite', 'frame', 'define']);

/**
 * 积木的调用前缀：`分类.积木名`；扩展 id 带点就是 `a.b.积木名`；id 或积木名写不成标识符时是
 * `ext["id"].积木名` / `ext["id"]["积木名"]`。category 是积木所属扩展 id（schema 里的 category），
 * 不给就按操作码第一个 `_` 前拆。调用方在后面接 `(`。
 */
export const displayOpcode = (opcode: string, category?: string): string => {
    const prefix = category && opcode.startsWith(`${category}_`) ? category : opcode.split('_')[0];
    const name = opcode.slice(prefix.length + 1);
    if (IDENTIFIER.test(name) && isNamespaceId(prefix)) return `${prefix}.${name}`;
    return `${EXT_NAMESPACE}[${JSON.stringify(prefix)}]${IDENTIFIER.test(name) ? `.${name}` : `[${JSON.stringify(name)}]`}`;
};

/** 积木 opcode 所属的扩展 id（分类）：schema 里记着的优先（id 本身含下划线、点的时候按它），没有就按第一个 `_` 前拆 */
export const categoryOfOpcode = (schema: Record<string, {category?: string}>, opcode: string): string =>
    schema[opcode]?.category ?? opcode.split('_')[0];

const rootCache = new WeakMap<object, Set<string>>();

/**
 * 文本里被「扩展前缀」占用的标识符：每个积木分类 / 扩展 id 的第一段（`test.moreDataTypes` → `test`），
 * 有 id 写不成点链时再加 `ext`。变量、形参不能用这些名字（见 printer 的 reserved），解析器也靠它认「这是扩展调用」。
 * 老规则（操作码第一个 `_` 前）一并保留，已有作品里变量的改名不变。
 */
export const namespaceRoots = (schema: Record<string, {category?: string}>): Set<string> => {
    const known = rootCache.get(schema);
    if (known) return known;
    const roots = new Set<string>();
    const seen = new Set<string>();
    for (const opcode of Object.keys(schema)) {
        roots.add(opcode.split('_')[0]);
        const category = schema[opcode]?.category;
        if (!IDENTIFIER.test(opcode.slice((category ?? opcode.split('_')[0]).length + 1))) roots.add(EXT_NAMESPACE);
        if (!category || seen.has(category)) continue;
        seen.add(category);
        if (isNamespaceId(category)) roots.add(category.split('.')[0]);
        else roots.add(EXT_NAMESPACE);
    }
    rootCache.set(schema, roots);
    return roots;
};

/** 所有写成点链的扩展 id（带点的）：解析器靠它把 `a.b.method(...)` 认回扩展调用，而不是对象属性路径 */
const dottedCache = new WeakMap<object, Set<string>>();
export const dottedNamespaces = (schema: Record<string, {category?: string}>): Set<string> => {
    const known = dottedCache.get(schema);
    if (known) return known;
    const ids = new Set<string>();
    for (const opcode of Object.keys(schema)) {
        const category = schema[opcode]?.category;
        if (category && category.includes('.') && isNamespaceId(category)) ids.add(category);
    }
    dottedCache.set(schema, ids);
    return ids;
};

const qualifiedCache = new WeakMap<object, Set<string>>();

/**
 * 只有带点 / 字符串键写法才会占用的名字：带点 id 的第一段，以及 `ext`。积木式（blocks）风格里变量名也不能占用它们，
 * 否则 `test.moreDataTypes.x()` 读回来根名字成了变量。没有这类扩展时是空集，已有作品的打印不变。
 */
export const qualifiedRoots = (schema: Record<string, {category?: string}>): Set<string> => {
    const known = qualifiedCache.get(schema);
    if (known) return known;
    const roots = new Set<string>();
    const seen = new Set<string>();
    for (const opcode of Object.keys(schema)) {
        const category = schema[opcode]?.category;
        if (!IDENTIFIER.test(opcode.slice((category ?? opcode.split('_')[0]).length + 1))) roots.add(EXT_NAMESPACE);
        if (!category || seen.has(category)) continue;
        seen.add(category);
        if (!isNamespaceId(category)) roots.add(EXT_NAMESPACE);
        else if (category.includes('.')) roots.add(category.split('.')[0]);
    }
    qualifiedCache.set(schema, roots);
    return roots;
};
