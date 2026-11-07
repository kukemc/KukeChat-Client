import {parse, tokenizer, type Comment} from 'acorn';
import {dottedNamespaces, EXT_NAMESPACE, namespaceRoots, type TypedKind} from './blocks';
import {callbackLayout} from './dynamic';
import type {BlockSpec} from './compiler';
import coreSchema from './core-schema.json';
import {decodeComment, isDocComment} from './comments';
import {dict, MAX_DEPTH, setOwn, TOO_DEEP_FIX, tooDeepMessage} from './safe';
import {createMdtParser} from './sugar/moreDataTypesParse';

/** Only block shape is needed for syntax grouping; extension opcodes are not inferred from names. */
/** 源码里的对象字面量（{键: 值}）带这个标记：编译器靠它把 `{typed: 1}` 这样的对象和降级出来的内部节点分开 */
export const RECORD = Symbol.for('gandi-dsl-record');
/** for (const value of x) 里没写键：占住「键」槽的形参名，写不成标识符，体内引用不到 */
const NO_KEY = '\u0000key';

export interface ParseOptions {
    schema?: Record<string, {shape: string}>;
    /** 项目里已有的变量名 / 列表名：没在文件里声明也能当变量用（x = 1、L.push(v)），文件里的声明优先 */
    known?: {variables: ReadonlySet<string>; lists: ReadonlySet<string>};
}

export interface Diagnostic {
    path?: string;
    code: string;
    message: string;
    line: number;
    column: number;
    severity: 'error' | 'warning';
    fix?: string;
}

/** 源文里的一段：字符偏移 [start, end)。源码映射、落点表用；编译器自己造出来的节点没有 */
export interface SourceSpan {start?: number; end?: number}
/** 写在输入位置的标识符；line / column 是它在源文里的位置（诊断定位用） */
export interface Reference extends SourceSpan {reference: string; line?: number; column?: number; comment?: string | null;
    /** 写成了 Boolean(x)：这个值是硬放进布尔槽的（见 Call.forced） */
    forced?: boolean}
/**
 * 写明了输入框种类的值（`int(3)`、`text("10")`），或者原文写法和数值不一致的数字字面量（`0.10`、`1e99`：
 * typed 为 `'number'`，value 是原文，仍按普通字面量推断输入框，只是不丢写法）。
 */
export interface TypedValue {typed: TypedKind | 'number'; value: string | number}
export interface Call extends SourceSpan {
    opcode: string;
    /** 位置参数各自在源文里的范围（和 positions 对齐；语法糖造出来的调用没有） */
    argumentSpans?: Array<{start: number; end: number}>;
    /**
     * 写成了 Boolean(expr)：圆形积木硬放进布尔槽。编辑器里拖不出这种形状，但作品里有（生成器写的、老版本留下的），
     * 运行时按 Scratch 的规则转成真假。不写 Boolean(...) 时编译器照旧报 E_SLOT_TYPE。
     */
    forced?: boolean;
    args: Record<string, Value>;
    positions?: Value[];
    body?: Call[];
    at?: {x: number; y: number};
    warp?: boolean;
    global?: boolean;
    returnType?: 'none' | 'string' | 'boolean';
    collapsed?: boolean;
    anchor?: string;
    note?: {x: number | null; y: number | null; width: number; height: number};
    /** 编译器降级后填：字段位置上写的标识符 → 它在源文里的位置（诊断定位用） */
    fieldLocations?: Record<string, {line: number; column: number}>;
    /** 写成了 JS 的 return 语句（不是 procedures.return(...) 调用） */
    returnStatement?: boolean;
    /** 文字里写的扩展 id（只在这个操作码 schema 里没有时填）：扩展 id 带下划线时，报「扩展没装」要指对 id，不能靠操作码猜 */
    extensionId?: string;
    /** 回调的形参（define 的参数；hat 回调里绑定 hat 参数椭圆的别名） */
    parameters?: string[];
    /** 编译器降级后填：每个可变输入组的单元数 */
    variadicCounts?: Array<number | undefined>;
    /** 编译器降级后填：hat 形参别名 → 椭圆里写的参数名 */
    hatBindings?: Array<{alias: string; name: string}>;
    /** 编译器降级后填：回调形参的作用域——回调体输入名，和形参别名 → 参数槽里的东西（'h' 椭圆名 / 'r' 可再生 reporter 的操作码） */
    callbackScope?: {key: string; bindings: Array<{alias: string; type: 'h' | 'r'; name: string; label?: string}>};
    /** 编译器降级后填：这是回调参数槽自己的影子（不是盖在槽上的积木） */
    asShadow?: boolean;
    line: number;
    column: number;
    /** 积木注释：字符串（可以是空串）= 有这条注释；null = 源码里这一块没写注释（改写已有积木时会删掉它原来的注释）；undefined = 不管 */
    comment?: string | null;
}
/**
 * 带形参或表达式体的箭头函数：`(item, index) => 表达式`、`(key, value) => { ... }`。形参绑定积木上的回调参数槽，
 * 体是 C 形口里的积木堆（body）或 lambda 的表达式（expression）；没有形参的 `() => { ... }` 仍是积木堆（Call[]）。
 */
export interface Lambda extends SourceSpan {
    lambda: {parameters: string[]; body?: Call[]; expression?: Value};
    line: number;
    column: number;
}
export type Value = string | number | boolean | null | Reference | TypedValue | Lambda |
    Call | Call[] | Value[] | {[key: string]: Value};
export interface Declaration {
    identifier: string;
    scope: 'stage' | 'sprite' | 'broadcast';
    type: 'variable' | 'list' | 'broadcast';
    name: string;
    initialValue: Value;
    line: number;
    column: number;
}
export interface FrameScope {
    title: string;
    at?: {x: number; y: number};
    size?: {width: number; height: number};
    color?: string;
    locked?: boolean;
    collapsed?: boolean;
}
interface Node {
    type: string;
    start: number;
    end: number;
    loc: {start: {line: number; column: number}};
    [key: string]: unknown;
}
export interface ParseResult {
    scripts: Call[][];
    scriptFrames: Array<FrameScope | null>;
    declarations: Declaration[];
    notes: Array<{text: string; x: number | null; y: number | null; width: number; height: number}>;
    diagnostics: Diagnostic[];
    /** 警告（不阻断）：被丢掉的注释之类 */
    warnings: Diagnostic[];
}

interface DecoratorItem {start: number; end: number; name: string; args: string}
const DECORATOR = /@(?:at\(\s*[-+]?\d+(?:\.\d+)?\s*,\s*[-+]?\d+(?:\.\d+)?\s*\)|size\(\s*\d+(?:\.\d+)?\s*,\s*\d+(?:\.\d+)?\s*\)|color\(\s*"(?:[^"\\]|\\.)*"\s*\)|note\(\s*(?:null|[-+]?\d+(?:\.\d+)?)(?:\s*,\s*(?:null|[-+]?\d+(?:\.\d+)?)){3}\s*\)|id\(\s*"(?:[^"\\]|\\.)*"\s*\)|warp\b|global\b|reporter\b|boolean\b|collapsed\b|locked\b)/y;

/**
 * Decorators are DSL tokens, not JavaScript decorators (Acorn does not implement those on statements).
 * Mask their source ranges with spaces so AST offsets and error locations remain exact.
 *
 * 迭代扫描，不递归：模板字符串的 `${` 里可以再嵌模板，嵌得很深时递归实现会撑爆调用栈。栈里每一项是一层模板
 * （-1）或一层 `${ }` 表达式（里面未配对的 `{` 个数）；只在最外层代码里认装饰器。
 */
const decorators = (source: string): {source: string; items: DecoratorItem[]} => {
    const items: DecoratorItem[] = [];
    // 按 UTF-16 单元拆，和下面的 index 一致；`[...source]` 按码点拆，遇到 emoji 之后位置全错开一格
    const masked = source.split('');
    const stack: number[] = [];
    const length = source.length;
    for (let index = 0; index < length;) {
        const char = source[index];
        const top = stack.length ? stack[stack.length - 1] : 0;
        if (top === -1) {
            if (char === '\\') index += 2;
            else if (char === '`') { stack.pop(); index++; }
            else if (char === '$' && source[index + 1] === '{') { stack.push(1); index += 2; }
            else index++;
            continue;
        }
        if (char === '"' || char === "'") {
            index++;
            while (index < length && source[index] !== char) index += source[index] === '\\' ? 2 : 1;
            index++;
            continue;
        }
        if (char === '`') { stack.push(-1); index++; continue; }
        if (char === '/' && source[index + 1] === '/') {
            const end = source.indexOf('\n', index + 2);
            index = end < 0 ? length : end + 1;
            continue;
        }
        if (char === '/' && source[index + 1] === '*') {
            const end = source.indexOf('*/', index + 2);
            index = end < 0 ? length : end + 2;
            continue;
        }
        if (stack.length) {
            if (char === '{') stack[stack.length - 1]++;
            else if (char === '}' && --stack[stack.length - 1] === 0) stack.pop();
            index++;
            continue;
        }
        if (char === '@') {
            DECORATOR.lastIndex = index;
            const match = DECORATOR.exec(source);
            if (match) {
                const name = match[0].slice(1).split('(')[0];
                items.push({start: index, end: index + match[0].length, name, args: match[0].slice(name.length + 1)});
                for (let cursor = index; cursor < index + match[0].length; cursor++) {
                    if (masked[cursor] !== '\n' && masked[cursor] !== '\r') masked[cursor] = ' ';
                }
                index += match[0].length;
                continue;
            }
        }
        index++;
    }
    return {source: masked.join(''), items};
};

/**
 * Canonical lexical proof for DSL rewrites: ignore whitespace/comments, never metadata.
 * Decorators stay ordered at their JavaScript token boundary (including EOF). Their
 * argument spelling is deliberately conservative: only whitespace outside strings
 * is ignored, not numeric spelling, string escapes, decorator order or coordinates.
 * Throws on unrecognized/malformed lexical input; this is not a DSL validity check.
 */
export const dslTokens = (text: string): string => {
    const decorated = decorators(text);
    const stream = tokenizer(decorated.source, {ecmaVersion: 2022});
    const tokens: unknown[] = [];
    let index = 0;
    const markerToken = (item: DecoratorItem): unknown[] => {
        let args = '';
        let quoted = false;
        for (let cursor = 0; cursor < item.args.length; cursor++) {
            const char = item.args[cursor];
            if (quoted && char === '\\') { args += char + item.args[++cursor]; continue; }
            if (char === '"') quoted = !quoted;
            if (quoted || !/\s/.test(char)) args += char;
        }
        // The scanner accepts JS-style escapes; @id/@color actually use JSON strings.
        if (item.name === 'id' || item.name === 'color') JSON.parse(item.args.slice(1, -1).trim());
        if (!item.args && /^\s*\(/.test(text.slice(item.end))) throw new SyntaxError(`Invalid @${item.name} arguments`);
        return ['decorator', item.name, args];
    };
    for (;;) {
        const token = stream.getToken();
        while (index < decorated.items.length && decorated.items[index].end <= token.start) {
            tokens.push(markerToken(decorated.items[index++]));
        }
        // A scanner match inside an Acorn token (e.g. a regexp) must not erase data.
        if (index < decorated.items.length && decorated.items[index].start < token.end) {
            throw new SyntaxError('Decorator overlaps a JavaScript token');
        }
        if (token.type.label === 'eof') break;
        tokens.push([token.type.label, (token as typeof token & {value?: unknown}).value]);
    }
    return JSON.stringify(tokens);
};

export const parseDsl = (source: string, options: ParseOptions = {}): ParseResult => {
    // 无原型：`__proto__`（`_.proto__()` 会拼出这个操作码）、`constructor` 这些名字查不到东西，也不会查到 Object.prototype
    const schema = dict<{shape: string}>({...coreSchema, ...options.schema} as Record<string, {shape: string}>);
    const isHat = (item: Call): boolean => item.opcode === 'procedures_definition' || schema[item.opcode]?.shape === 'hat';
    const diagnostics: Diagnostic[] = [];
    const warnings: Diagnostic[] = [];
    const comments: Comment[] = [];
    const empty = (): ParseResult => ({scripts: [], scriptFrames: [], declarations: [], notes: [], diagnostics, warnings});
    const fail = (node: Node, code: string, message: string, fix?: string): never => {
        diagnostics.push({code, message, line: node.loc.start.line, column: node.loc.start.column + 1, severity: 'error',
            ...(fix ? {fix} : {})});
        throw new Error(code);
    };
    const node = (value: unknown): Node => value as Node;
    const list = (value: unknown): Node[] => value as Node[];
    const decorated = decorators(source);
    let program: Node;
    try {
        program = parse(decorated.source, {ecmaVersion: 2020, locations: true, onComment: comments,
            preserveParens: true, allowReturnOutsideFunction: true}) as unknown as Node;
    } catch (error) {
        const syntax = error as Error & {loc?: {line: number; column: number}};
        // 括号 / 模板嵌得太深，acorn 自己的递归就撑爆了栈
        // （acorn 较新的版本把栈溢出包成 SyntaxError「Not enough stack space to parse input」，也算嵌套太深）
        if (error instanceof RangeError || /stack space|call stack/i.test(syntax.message)) {
            diagnostics.push({code: 'E_TOO_DEEP', message: tooDeepMessage(MAX_DEPTH), line: 1, column: 1, severity: 'error',
                fix: TOO_DEEP_FIX});
        } else {
            // 回调（repeat(3, () => {...}) 这类）是箭头函数，JS 不许在里面写 break / continue
            const loopWord = /^Unsyntactic (break|continue)/.exec(syntax.message)?.[1];
            diagnostics.push({code: 'E_PARSE', message: syntax.message,
                line: syntax.loc?.line ?? 1, column: (syntax.loc?.column ?? 0) + 1, severity: 'error',
                ...(loopWord ? {fix: `inside a callback such as repeat(...) write control.${loopWord}(); a plain ${loopWord}; only works in while / for loops`} : {})});
        }
        return empty();
    }
    /** 当前解析的嵌套深度：语句嵌套 + 表达式嵌套，超过 MAX_DEPTH 就报 E_TOO_DEEP（再深递归会撑爆栈） */
    let depth = 0;
    const enter = (at: Node): void => {
        if (++depth > MAX_DEPTH) fail(at, 'E_TOO_DEEP', tooDeepMessage(MAX_DEPTH), TOO_DEEP_FIX);
    };
    const isReferenceValue = (item: Value): item is Reference => !!item && typeof item === 'object' && !Array.isArray(item) &&
        typeof (item as Reference).reference === 'string';
    /** 被某块积木认领的注释（下标）：没被认领的会被丢掉，最后报 W_COMMENT_DROPPED */
    const claimed = new Set<number>();
    const dropped = (at: {line: number; column: number}, message: string, fix?: string): void => {
        warnings.push({code: 'W_COMMENT_DROPPED', message, line: at.line, column: at.column, severity: 'warning',
            ...(fix ? {fix} : {})});
    };
    /** 最后一条结束位置 <= position 的注释的下标（二分；没有返回 -1） */
    const lastCommentBefore = (position: number): number => {
        let low = 0;
        let high = comments.length - 1;
        let found = -1;
        while (low <= high) {
            const mid = (low + high) >> 1;
            if (comments[mid].end <= position) { found = mid; low = mid + 1; } else high = mid - 1;
        }
        return found;
    };
    /** [from, to) 之间只有空白（装饰器已经被遮成空格）；碰到第一个非空白就返回，不扫整段 */
    const onlySpace = (from: number, to: number): boolean => {
        for (let index = from; index < to; index++) if (!/\s/.test(decorated.source[index])) return false;
        return true;
    };
    /**
     * 紧贴在 position 前面（中间只有空白）的 JSDoc 样式注释，往前接着收（几条连着的用换行拼起来）；收走的记进 claimed。
     * 普通注释（`//`、`/* *\/`）不是积木注释，遇到就停。
     */
    const leadingComment = (position: number): {text: string; line: number; column: number} | null => {
        const texts: string[] = [];
        let boundary = position;
        let firstAt = {line: 1, column: 1};
        for (let index = lastCommentBefore(position); index >= 0 && !claimed.has(index); index--) {
            const comment = comments[index];
            if (!onlySpace(comment.end, boundary)) break;
            if (comment.type !== 'Block' || !isDocComment(source.slice(comment.start, comment.end))) break;
            claimed.add(index);
            texts.unshift(decodeComment(comment.value.slice(1)));
            boundary = comment.start;
            firstAt = {line: comment.loc?.start.line ?? 1, column: (comment.loc?.start.column ?? 0) + 1};
        }
        return texts.length ? {text: texts.join('\n'), ...firstAt} : null;
    };
    const properties = (object: Node): Record<string, Value> => {
        if (object.type !== 'ObjectExpression') fail(object, 'E_JS_EXPR', 'Expected named arguments');
        const result: Record<string, Value> = Object.create(null);
        for (const property of list(object.properties)) {
            if (property.type !== 'Property' || property.computed || property.method || property.shorthand || property.kind !== 'init') {
                fail(property, 'E_JS_EXPR', 'Only named properties are supported');
            }
            const keyNode = node(property.key);
            const key = keyNode.type === 'Identifier' ? String(keyNode.name) :
                keyNode.type === 'Literal' && typeof keyNode.value === 'string' ? keyNode.value : null;
            if (key === null) return fail(keyNode, 'E_JS_EXPR', 'Invalid property name');
            if (key === '$xy' || key.startsWith('$field_')) fail(keyNode, 'E_UNKNOWN_ARG', `Legacy DSL property ${key} is not supported`);
            if (Object.prototype.hasOwnProperty.call(result, key)) fail(keyNode, 'E_UNKNOWN_ARG', `Duplicate parameter ${key}`);
            result[key] = value(node(property.value));
        }
        Object.defineProperty(result, RECORD, {value: true});
        return result;
    };
    const unparen = (expression: Node): Node => {
        let current = expression;
        while (current.type === 'ParenthesizedExpression') current = node(current.expression);
        return current;
    };
    /** 节点在源文里的位置：行列（诊断）+ 字符范围（源码映射） */
    const where = (at: Node): {line: number; column: number; start: number; end: number} =>
        ({line: at.loc.start.line, column: at.loc.start.column + 1, start: at.start, end: at.end});
    const mk = (opcode: string, positions: Value[], at: Node): Call => ({opcode, args: Object.create(null), positions, ...where(at)});
    /** 顶层 const / let 声明的名字 → 种类（语法糖要认得 `L.push(v)` 里的 L 是列表） */
    const declaredKinds = new Map<string, 'variable' | 'list' | 'broadcast'>();
    for (const item of list(program.body)) {
        if (item.type !== 'VariableDeclaration') continue;
        for (const entry of list(item.declarations)) {
            const id = node(entry.id);
            const init = entry.init ? node(entry.init) : null;
            if (id.type !== 'Identifier' || init?.type !== 'CallExpression') continue;
            const callee = node(init.callee);
            if (callee.type === 'MemberExpression' && !callee.computed && node(callee.object).type === 'Identifier' &&
                ['stage', 'sprite'].includes(String(node(callee.object).name)) &&
                ['variable', 'list'].includes(String(node(callee.property).name))) {
                declaredKinds.set(String(id.name), String(node(callee.property).name) as 'variable' | 'list');
            } else if (callee.type === 'Identifier' && callee.name === 'broadcast') declaredKinds.set(String(id.name), 'broadcast');
        }
    }
    /** 标识符是什么：文件里声明的优先，其次是项目里已有的变量 / 列表（同名的变量和列表按变量算，列表要声明才能用列表写法） */
    const kindOf = (name: string): 'variable' | 'list' | 'broadcast' | undefined => {
        const declared = declaredKinds.get(name);
        if (declared) return declared;
        const variable = options.known?.variables.has(name);
        const listed = options.known?.lists.has(name);
        return variable ? 'variable' : listed ? 'list' : undefined;
    };
    const namespaces = new Set([...namespaceRoots(schema as Record<string, {category?: string}>), 'when', 'call', 'Math']);
    const dotted = dottedNamespaces(schema as Record<string, {category?: string}>);
    /** 当前 define 的形参名：形参先于同名的别名、变量和列表 */
    let parameterScope = new Set<string>();
    const listOf = (expression: Node): string | null => {
        const target = unparen(expression);
        return target.type === 'Identifier' && !parameterScope.has(String(target.name)) &&
            kindOf(String(target.name)) === 'list' ? String(target.name) : null;
    };
    /** parser 自己造出来的右折叠 join（模板字符串、`+` 链）：后面再接 `+` 字符串时往右并，不另起左折叠 */
    const foldable = new WeakSet<Call>();
    const isLambdaValue = (item: Value): item is Lambda => !!item && typeof item === 'object' && !Array.isArray(item) && 'lambda' in item;
    const isCallValue = (item: Value): item is Call => !!item && typeof item === 'object' && !Array.isArray(item) &&
        'opcode' in item && typeof (item as Call).opcode === 'string';    const isStringValue = (item: Value): boolean => typeof item === 'string' ||
        (isCallValue(item) && item.opcode === 'operator_join');
    const makeJoin = (left: Value, right: Value, at: Node): Call => {
        const result = mk('operator_join', [left, right], at);
        foldable.add(result);
        return result;
    };
    const appendJoin = (target: Call, tail: Value, at: Node): Call => {
        const [head, rest] = target.positions as Value[];
        return makeJoin(head, isCallValue(rest) && foldable.has(rest) ? appendJoin(rest, tail, at) :
            makeJoin(rest, tail, at), at);
    };
    /** JS 的 `+`：有一边语法上就是字符串（字面量、模板、join）按字符串拼接，否则是数字加 */
    const plus = (left: Value, right: Value, at: Node): Call => {
        if (!isStringValue(left) && !isStringValue(right)) return mk('operator_add', [left, right], at);
        if (isCallValue(left) && foldable.has(left)) return appendJoin(left, right, at);
        return makeJoin(left, right, at);
    };
    const LOOP_OPCODES = new Set(['control_forever', 'control_while', 'control_repeat', 'control_repeat_until', 'control_for_each']);
    /** 这一串语句里有没有 break 能跳出外面这一层循环（嵌套的循环自己接住它们的 break；打印器按积木表走同一条规则） */
    const hasBreak = (stack: Call[]): boolean => stack.some(item => item.opcode === 'control_break' ||
        !LOOP_OPCODES.has(item.opcode) && [...(item.positions ?? []), ...Object.values(item.args)].some(entry =>
            Array.isArray(entry) && entry.every(isCallValue) && hasBreak(entry as Call[])));
    const negate = (item: Value, at: Node): Value => {
        if (typeof item === 'number') return item === 0 ? 0 : -item;
        if (item && typeof item === 'object' && 'typed' in item && item.typed === 'number') {
            const text = String(item.value);
            return {typed: 'number', value: text.startsWith('-') ? text.slice(1) : `-${text}`};
        }
        return mk('operator_subtract', [0, item], at);
    };
    const BINARY = dict({'-': 'operator_subtract', '*': 'operator_multiply', '/': 'operator_divide',
        '%': 'operator_mod', '**': 'operator_power', '>': 'operator_gt', '<': 'operator_lt', '==': 'operator_equals',
        '===': 'operator_strictequals'});
    const RELATIONAL = new Set(['<', '>', '<=', '>=']);
    const EQUALITY = new Set(['==', '!=', '===', '!==']);
    const NEGATED = dict({'!=': 'operator_equals', '<=': 'operator_gt', '>=': 'operator_lt',
        '!==': 'operator_strictequals'});
    const binary = (expression: Node): Value => {
        const operator = String(expression.operator);
        if (mdt && operator === 'in') return mdt.inOperator(expression);
        if (mdt && EQUALITY.has(operator)) mdt.nullCompare(expression);
        const leftNode = node(expression.left);
        const rightNode = node(expression.right);
        const level = RELATIONAL.has(operator) ? RELATIONAL : EQUALITY.has(operator) ? EQUALITY : null;
        if (level) {
            for (const side of [leftNode, rightNode]) {
                if (side.type === 'BinaryExpression' && level.has(String(side.operator))) {
                    fail(expression, 'E_CHAINED_COMPARE', 'A comparison cannot be chained: (a < b) < c compares a Boolean with c',
                        'write a < b && b < c');
                }
            }
        }
        const left = value(leftNode);
        const right = value(rightNode);
        if (operator === '+') return plus(left, right, expression);
        if (BINARY[operator]) return mk(BINARY[operator], [left, right], expression);
        if (NEGATED[operator]) return mk('operator_not', [mk(NEGATED[operator], [left, right], expression)], expression);
        return fail(expression, 'E_JS_EXPR', `Operator ${operator} is not supported`,
            operator === '&' || operator === '|' ? 'use && and || for logic' :
                'use + - * / % ** comparisons, && || !, or block calls such as operator.mod(a, b)');
    };
    const MATH = dict<[string, string?]>({round: ['operator_round'], abs: ['operator_mathop', 'abs'],
        floor: ['operator_mathop', 'floor'], ceil: ['operator_mathop', 'ceiling'], sqrt: ['operator_mathop', 'sqrt'],
        log: ['operator_mathop', 'ln'], log10: ['operator_mathop', 'log'], exp: ['operator_mathop', 'e ^'],
        pow: ['operator_power']});
    const TRIG = new Set(['sin', 'cos', 'tan', 'asin', 'acos', 'atan']);
    const BARE = dict({repeat: 'control_repeat', repeatUntil: 'control_repeat_until',
        wait: 'control_wait', waitUntil: 'control_wait_until', stop: 'control_stop', random: 'operator_random'});
    const LIST_METHODS = new Set(['push', 'insert', 'remove', 'clear', 'includes', 'indexOf']);
    const mathCall = (expression: Node, method: string): Call => {
        const args = list(expression.arguments);
        const entry = MATH[method];
        if (!entry) {
            return fail(expression, 'E_JS_EXPR', `Math.${method} is not supported`,
                TRIG.has(method) ? `Scratch trigonometry works in degrees: write ${method}(x)` :
                    'supported: Math.round abs floor ceil sqrt log log10 exp pow; others are operator.mathop(...) blocks');
        }
        const count = entry[0] === 'operator_power' ? 2 : 1;
        if (args.length !== count) fail(expression, 'E_JS_EXPR', `Math.${method} takes ${count} argument${count === 1 ? '' : 's'}`);
        const values = args.map(item => value(item));
        return mk(entry[0], entry[1] ? [entry[1], ...values] : values, expression);
    };
    const listMethod = (expression: Node, name: string, method: string): Call => {
        const args = list(expression.arguments);
        const reference: Value = {reference: name};
        const need = (count: number): void => {
            if (args.length !== count) {
                fail(expression, 'E_JS_EXPR', `${name}.${method}() takes ${count} argument${count === 1 ? '' : 's'}`);
            }
        };
        need({push: 1, insert: 2, remove: 1, clear: 0, includes: 1, indexOf: 1}[method] as number);
        const [first, second] = args.map(item => value(item));
        switch (method) {
        case 'push': return mk('data_addtolist', [first, reference], expression);
        case 'insert': return mk('data_insertatlist', [second, first, reference], expression);
        case 'remove': return mk('data_deleteoflist', [first, reference], expression);
        case 'clear': return mk('data_deletealloflist', [reference], expression);
        case 'includes': return mk('data_listcontainsitem', [reference, first], expression);
        default: return mk('data_itemnumoflist', [first, reference], expression);
        }
    };
    const templateValue = (expression: Node): Value => {
        const parts: Value[] = [];
        const quasis = list(expression.quasis);
        const expressions = list(expression.expressions);
        quasis.forEach((quasi, index) => {
            const text = (quasi.value as {cooked: string | null}).cooked;
            if (text === null) fail(quasi, 'E_JS_EXPR', 'Invalid escape in template string');
            if (text) parts.push(text);
            if (expressions[index]) parts.push(value(expressions[index]));
        });
        if (!parts.length) return '';
        // 模板编成右折叠的 join 链，链有多长积木就嵌多深
        if (parts.length > MAX_DEPTH) fail(expression, 'E_TOO_DEEP', tooDeepMessage(MAX_DEPTH), TOO_DEEP_FIX);
        if (parts.length === 1) return typeof parts[0] === 'string' ? parts[0] : mk('operator_join', [parts[0], ''], expression);
        let result: Value = parts[parts.length - 1];
        for (let index = parts.length - 2; index >= 0; index--) result = makeJoin(parts[index], result, expression);
        return result;
    };
    /** Scratch 的序号从 1 开始：字面量 0 永远取不到东西（字符串 s[0] 是空串），多半是按 JS 习惯写错了 */
    /** 文字里已经出现过 ads.indexStart(0)（按源文顺序）：之后下标 0 是合法的第一项，不再提示 */
    let indexStartZero = false;
    const zeroIndex = (index: Value, at: Node): void => {
        if (indexStartZero) return;
        const zero = index === 0 || (!!index && typeof index === 'object' && 'typed' in index && index.typed === 'number' &&
            Number(index.value) === 0);
        if (zero) {
            warnings.push({code: 'W_INDEX_FROM_ONE', message: 'Scratch indexes start at 1: index 0 is always empty (an item list has no item 0)',
                line: at.loc.start.line, column: at.loc.start.column + 1, severity: 'warning',
                fix: 'use 1 for the first item or character'});
        }
    };
    /** 「高级数据结构」的 JavaScript 糖（schema 里有这个扩展才有；没有时下面所有 mdt 分支都不走） */
    const mdt = createMdtParser({schema, node, list, unparen, value: item => value(item), fail,
        warn: (at, code, message, fix) => {
            warnings.push({code, message, line: at.loc.start.line, column: at.loc.start.column + 1, severity: 'warning',
                ...(fix ? {fix} : {})});
        },
        mk, listOf, isBound: name => parameterScope.has(name) || kindOf(name) !== undefined, namespaces, zeroIndex,
        setIndexStart: zero => { indexStartZero = zero; }});
    const unsupportedValue = (expression: Node): never => {
        const type = expression.type;
        const hint: Record<string, [string, string]> = {
            AssignmentExpression: ['Assignments are statements, not values', 'put the assignment on its own line'],
            UpdateExpression: ['x++ and x-- are statements, not values', 'write x += 1 on its own line, then use x'],
            FunctionExpression: ['Function expressions are not supported', 'write callbacks as () => { ... }'],
            NewExpression: ['new is not supported', 'use a block call such as stage.variable(...)'],
            AwaitExpression: ['await is not supported', 'use wait(seconds) or waitUntil(condition)'],
            SequenceExpression: ['Comma expressions are not supported', 'write one statement per line'],
            TaggedTemplateExpression: ['Tagged templates are not supported', 'use a plain template string']
        };
        const found = hint[type];
        if (found) return fail(expression, 'E_JS_EXPR', found[0], found[1]);
        if (type === 'UnaryExpression') {
            return fail(expression, 'E_JS_EXPR', `Unary ${String(expression.operator)} is not supported`,
                expression.operator === '+' ? 'drop the +, or write operator.add(0, x)' :
                    'supported unary operators are - and !');
        }
        if (type === 'LogicalExpression') {
            return fail(expression, 'E_JS_EXPR', '?? is not supported', 'use a ternary: c ? a : b');
        }
        return fail(expression, 'E_JS_EXPR',
            'Use literals, declared names, JavaScript operators or block calls, not other JavaScript expressions',
            'write the block call: category.block(...)');
    };
    /** 表达式前面紧贴着的 `/** 注释 *\/`（打印器给带注释的 reporter 写成 `(/** 注释 *\/ 表达式)`）→ 挂在这块积木上 */
    const value = (input: Node): Value => {
        enter(input);
        try {
            const expression = unparen(input);
            const lead = leadingComment(expression.start);
            const result = valueInner(input);
            if (isCallValue(result)) result.comment = lead ? lead.text : null;
            else if (isReferenceValue(result)) result.comment = lead ? lead.text : null;
            else if (lead) dropped(lead, 'A comment can only be attached to a block (a block call, variable or parameter), not to a literal value');
            return result;
        } finally { depth--; }
    };
    const valueInner = (input: Node): Value => {
        const expression = unparen(input);
        if (expression.type === 'Literal' && (expression.value === null ||
            ['string', 'number', 'boolean'].includes(typeof expression.value))) {
            if (typeof expression.value === 'number' &&
                source.slice(expression.start, expression.end) !== String(expression.value)) {
                return {typed: 'number', value: source.slice(expression.start, expression.end)};
            }
            return expression.value as Value;
        }
        if (expression.type === 'UnaryExpression' && ['-', '+'].includes(String(expression.operator)) &&
            node(expression.argument).type === 'Literal' && typeof node(expression.argument).value === 'number') {
            const number = expression.operator === '-' ? -(node(expression.argument).value as number) :
                node(expression.argument).value as number;
            // `-0`、`-0.0000000009` 这类写法和 String(数值) 不一样：原文照留，不然 -0 变 0、小数变科学计数
            const written = source.slice(expression.start, expression.end).replace(/\s+/g, '');
            return written !== String(number) ? {typed: 'number', value: written} : number;
        }
        if (expression.type === 'UnaryExpression' && expression.operator === '-') {
            return mk('operator_subtract', [0, value(node(expression.argument))], expression);
        }
        if (expression.type === 'UnaryExpression' && expression.operator === '!') {
            return mk('operator_not', [value(node(expression.argument))], expression);
        }
        if (mdt && expression.type === 'UnaryExpression' && expression.operator === 'typeof') return mdt.typeofOf(expression);
        if (expression.type === 'Identifier') {
            return {reference: String(expression.name), ...where(expression)};
        }
        if (expression.type === 'ObjectExpression') return mdt ? mdt.object(expression) : properties(expression);
        if (expression.type === 'ArrayExpression') {
            return mdt ? mdt.array(expression) : list(expression.elements).map(element => value(element));
        }
        if (expression.type === 'CallExpression') {
            const forced = forcedBoolean(expression);
            if (forced) return forced;
            return call(expression);
        }
        if (mdt && expression.type === 'NewExpression') {
            const made = mdt.newExpression(expression);
            if (made) return made;
        }
        if (expression.type === 'ArrowFunctionExpression') {
            // 没有形参的块体箭头函数是 C 形口里的积木堆；带形参或表达式体的是回调（lambda），由积木的回调布局认领
            if (!list(expression.params).length && node(expression.body).type === 'BlockStatement') return arrow(expression).body;
            return lambdaValue(expression);
        }
        if (expression.type === 'BinaryExpression') return binary(expression);
        if (expression.type === 'LogicalExpression' && ['&&', '||'].includes(String(expression.operator))) {
            return mk(expression.operator === '&&' ? 'operator_and' : 'operator_or',
                [value(node(expression.left)), value(node(expression.right))], expression);
        }
        if (expression.type === 'ConditionalExpression') {
            return mk('operator_ternary', [value(node(expression.test)), value(node(expression.consequent)),
                value(node(expression.alternate))], expression);
        }
        if (expression.type === 'TemplateLiteral') return templateValue(expression);
        if (expression.type === 'MemberExpression' && !expression.optional) {
            const object = node(expression.object);
            const owner = listOf(object);
            const sugar = mdt ? mdt.member(expression) : null;
            if (sugar !== null) return sugar;
            if (mdt && !expression.computed && node(expression.property).name === 'length') mdt.lengthWarning(expression);
            if (!expression.computed && node(expression.property).name === 'length') {
                return owner ? mk('data_lengthoflist', [{reference: owner}], expression) :
                    mk('operator_length', [value(object)], expression);
            }
            if (expression.computed) {
                const index = value(node(expression.property));
                zeroIndex(index, expression);
                return owner ? mk('data_itemoflist', [index, {reference: owner}], expression) :
                    mk('operator_letter_of', [index, value(object)], expression);
            }
            return fail(expression, 'E_JS_EXPR', `.${String(node(expression.property).name)} is not supported`,
                'supported: s.length, s.includes(t), s[i] (1-based), and list methods push insert remove clear includes indexOf');
        }
        return unsupportedValue(expression);
    };
    /**
     * `Boolean(x)`：把一块圆形积木（变量、参数、有返回值的调用……）硬放进布尔槽。不多出积木，只是告诉编译器「这里就是要放它」。
     * 名字被变量 / 形参占用时不是这个写法（照普通调用处理）。
     */
    const forcedBoolean = (expression: Node): Call | Reference | null => {
        const callee = node(expression.callee);
        if (callee.type !== 'Identifier' || callee.name !== 'Boolean' || expression.optional ||
            parameterScope.has('Boolean') || kindOf('Boolean') !== undefined) return null;
        const args = list(expression.arguments);
        if (args.length !== 1) fail(expression, 'E_JS_EXPR', 'Boolean(x) takes 1 argument');
        const inner = value(args[0]);
        if (!isCallValue(inner) && !isReferenceValue(inner)) {
            return fail(args[0], 'E_SLOT_TYPE', 'Boolean(...) wraps a block (a variable, a parameter or a reporter call), not a literal',
                'write true / false, or a comparison such as x == 1');
        }
        inner.forced = true;
        return inner;
    };
    const target = (expression: Node): string => {
        const name = String(expression.name);
        if (parameterScope.has(name)) {
            fail(expression, 'E_ASSIGN_PARAM', `${name} is a procedure parameter and cannot be assigned`,
                `copy it into a declared variable: const v = sprite.variable("v", 0); v = ${name};`);
        }
        const kind = kindOf(name);
        if (kind === 'list') {
            fail(expression, 'E_ASSIGN_TARGET', `${name} is a list and cannot be assigned as a whole`,
                `use ${name}.push(v), ${name}[i] = v or ${name}.clear()`);
        }
        if (kind !== 'variable') {
            fail(expression, kind ? 'E_ASSIGN_TARGET' : 'E_UNKNOWN_VAR',
                kind ? `${name} is a broadcast, not a variable` : `Unknown identifier ${name}; declare it first`,
                kind ? undefined : `const ${name} = sprite.variable("${name}", 0);`);
        }
        return name;
    };
    const assignment = (expression: Node): Call => {
        const operator = String(expression.operator);
        const left = unparen(node(expression.left));
        if (left.type === 'MemberExpression') {
            const sugar = mdt ? mdt.assignment(expression) : null;
            if (sugar) return sugar;
            const owner = left.computed ? listOf(node(left.object)) : null;
            if (!owner || operator !== '=') {
                return fail(left, 'E_JS_EXPR', 'Only list items can be assigned this way: L[i] = v',
                    'declare the list with sprite.list(...) and write L[i] = v; use data.replaceitemoflist for other cases');
            }
            const index = value(node(left.property));
            zeroIndex(index, left);
            return mk('data_replaceitemoflist', [index, {reference: owner},
                value(node(expression.right))], expression);
        }
        if (left.type !== 'Identifier') {
            return fail(left, 'E_JS_EXPR', 'Assign to a declared variable: x = value',
                'declare it with const x = sprite.variable("x", 0)');
        }
        const reference: Value = {reference: target(left)};
        const right = value(node(expression.right));
        const set = (item: Value): Call => mk('data_setvariableto', [reference, item], expression);
        switch (operator) {
        case '=': return set(right);
        case '+=': return isStringValue(right) ? set(plus(reference, right, expression)) :
            mk('data_changevariableby', [reference, right], expression);
        case '-=': return mk('data_changevariableby', [reference, negate(right, expression)], expression);
        case '*=': return set(mk('operator_multiply', [reference, right], expression));
        case '/=': return set(mk('operator_divide', [reference, right], expression));
        case '%=': return set(mk('operator_mod', [reference, right], expression));
        case '**=': return set(mk('operator_power', [reference, right], expression));
        default: return fail(expression, 'E_JS_EXPR', `${operator} is not supported`,
            'supported: = += -= *= /= %= **=');
        }
    };
    const update = (expression: Node): Call => {
        const argument = unparen(node(expression.argument));
        const sugar = mdt && argument.type === 'MemberExpression' ? mdt.update(expression) : null;
        if (sugar) return sugar;
        if (argument.type !== 'Identifier') {
            return fail(argument, 'E_JS_EXPR', 'Only a declared variable can be incremented: x++', 'write x += 1');
        }
        return mk('data_changevariableby', [{reference: target(argument)}, expression.operator === '++' ? 1 : -1], expression);
    };
    const bodyOf = (statement: Node): Call[] => statement.type === 'BlockStatement' ?
        statements(list(statement.body)) : statements([statement]);
    /** `for (let i = 1; i <= n; i++) { ... }` 是「对 i 从 1 数到 n」；别的 for 写法编不成积木 */
    const forLoop = (statement: Node): Call => {
        const refuse = (at: Node): never => fail(at, 'E_UNSUPPORTED_FOR',
            'Only for (let i = 1; i <= n; i++) { ... } is supported (counts i from 1 to n; i is a declared variable)',
            'use that form with a declared variable, or write a while loop with an explicit counter');
        const init = statement.init ? node(statement.init) : null;
        const test = statement.test ? unparen(node(statement.test)) : null;
        const step = statement.update ? unparen(node(statement.update)) : null;
        if (!init || !test || !step) return refuse(statement);
        let name: string | null = null;
        let start: Node | null = null;
        if (init.type === 'VariableDeclaration' && list(init.declarations).length === 1) {
            const entry = list(init.declarations)[0];
            if (node(entry.id).type === 'Identifier' && entry.init) { name = String(node(entry.id).name); start = node(entry.init); }
        } else if (init.type === 'ExpressionStatement' || init.type === 'AssignmentExpression') {
            const assign = unparen(init.type === 'AssignmentExpression' ? init : node(init.expression));
            if (assign.type === 'AssignmentExpression' && assign.operator === '=' && node(assign.left).type === 'Identifier') {
                name = String(node(assign.left).name);
                start = node(assign.right);
            }
        }
        if (!name || !start) return refuse(init);
        const first = value(start);
        if (first !== 1) return refuse(start);
        if (test.type !== 'BinaryExpression' || test.operator !== '<=' || node(test.left).type !== 'Identifier' ||
            node(test.left).name !== name) return refuse(test);
        const stepsOnce = step.type === 'UpdateExpression' && step.operator === '++' && node(step.argument).type === 'Identifier' &&
            node(step.argument).name === name ||
            step.type === 'AssignmentExpression' && step.operator === '+=' && node(step.left).type === 'Identifier' &&
            node(step.left).name === name && value(node(step.right)) === 1;
        if (!stepsOnce) return refuse(step);
        const counter = target(node(test.left));
        return mk('control_for_each', [{reference: counter}, value(node(test.right)), bodyOf(node(statement.body))], statement);
    };
    /**
     * for...of（高级数据结构集市版的「遍历」积木 forEachWithObj）：
     *   for (const [key, value] of Object.entries(x)) { ... }   键和值都用
     *   for (const value of x) { ... }                          只用值（x 是列表 / 对象 / 集合）
     * 循环变量是积木上两个参数槽（键、值）的名字，只在循环体里有效，和回调的形参同一套规则（见 compiler 的 structureCallback）。
     */
    const forOf = (statement: Node): Call => {
        const prefix = (mdt as {prefix: string}).prefix;
        const left = node(statement.left);
        const declarations = left.type === 'VariableDeclaration' ? list(left.declarations) : [];
        if (declarations.length !== 1 || declarations[0].init) {
            fail(left, 'E_UNSUPPORTED', 'for...of takes one declaration: for (const item of list) { ... }',
                'for (const [key, value] of Object.entries(o)) { ... } gives the key as well');
        }
        const identifier = (item: Node): string => {
            if (item.type !== 'Identifier') fail(item, 'E_UNSUPPORTED', 'The loop variable must be a plain name');
            return String(item.name);
        };
        const id = node(declarations[0].id);
        const right = unparen(node(statement.right));
        let parameters: string[];
        let iterable: Value;
        if (id.type === 'ArrayPattern') {
            const names = list(id.elements).map(element => element ? identifier(node(element)) :
                fail(id, 'E_UNSUPPORTED', 'Holes in the loop pattern are not supported'));
            const callee = right.type === 'CallExpression' ? unparen(node(right.callee)) : null;
            const entries = !!callee && callee.type === 'MemberExpression' && !callee.computed && node(callee.object).type === 'Identifier' &&
                node(callee.object).name === 'Object' && node(callee.property).name === 'entries' && list(right.arguments).length === 1 &&
                isFreeName('Object');
            if (!entries || !names.length || names.length > 2) {
                fail(id, 'E_UNSUPPORTED', 'Write for (const [key, value] of Object.entries(x)) { ... }',
                    'for (const value of x) { ... } loops over the values only');
            }
            parameters = names;
            mdt?.guardList(list((right as Node).arguments)[0], 'for (… of Object.entries(@))');
            iterable = value(list((right as Node).arguments)[0]);
        } else {
            parameters = [NO_KEY, identifier(id)];
            mdt?.guardList(right, 'for (… of @)');
            iterable = value(right);
        }
        const outer = parameterScope;
        parameterScope = new Set([...outer, ...parameters]);
        let body: Call[];
        try { body = bodyOf(node(statement.body)); } finally { parameterScope = outer; }
        const at = where(statement);
        const result: Call = {opcode: `${prefix}_forEachWithObj`, args: Object.create(null), ...at};
        setOwn(result.args, 'NAME_OR_OBJ', iterable);
        setOwn(result.args, 'SUBSTACK', {lambda: {parameters, body}, ...at});
        return result;
    };
    /** break / continue / return 的节点把结尾的分号算在内；语句的范围统一不含分号（和调用、赋值一样） */
    const endOfStatement = (statement: Node): number => source[statement.end - 1] === ';' ? statement.end - 1 : statement.end;
    const lowerStatement = (statement: Node): Call => {
        switch (statement.type) {
        case 'ExpressionStatement': {
            const expression = unparen(node(statement.expression));
            if (expression.type === 'CallExpression') return call(expression);
            if (expression.type === 'AssignmentExpression') return assignment(expression);
            if (expression.type === 'UpdateExpression') return update(expression);
            if (mdt && expression.type === 'UnaryExpression' && expression.operator === 'delete') {
                const removal = mdt.deleteStatement(expression);
                if (removal) return removal;
            }
            return fail(statement, 'E_JS_EXPR', 'Only block calls, assignments (x = e, x += e, x++) and control statements are supported here',
                'write a block call: category.block(...)');
        }
        case 'IfStatement': {
            const condition = value(node(statement.test));
            const body = bodyOf(node(statement.consequent));
            if (!statement.alternate) return mk('control_if', [condition, body], statement);
            const alternate = node(statement.alternate);
            let rest: Call[];
            if (alternate.type === 'IfStatement') {
                // else if 链：每一级是上一级 else 槽里的一层嵌套，也要计深度
                enter(alternate);
                try { rest = [{...lowerStatement(alternate), comment: null}]; } finally { depth--; }
            } else rest = bodyOf(alternate);
            return mk('control_if_else', [condition, body, rest], statement);
        }
        case 'WhileStatement': {
            const test = unparen(node(statement.test));
            const body = bodyOf(node(statement.body));
            // while (true) 是「重复执行」；循环体里有 break 它就是会结束的循环（forever 是终结积木，后面不能再接积木）
            if (test.type === 'Literal' && test.value === true) {
                return hasBreak(body) ? mk('control_while', [true, body], statement) : mk('control_forever', [body], statement);
            }
            return mk('control_while', [value(test), body], statement);
        }
        case 'ForStatement': return forLoop(statement);
        case 'ForOfStatement':
        case 'ForInStatement':
            if (statement.type === 'ForOfStatement' && mdt && schema[`${mdt.prefix}_forEachWithObj`]) return forOf(statement);
            return fail(statement, 'E_UNSUPPORTED', 'for...of and for...in are not supported',
                mdt ? 'count with for (let i = 1; i <= size(o); i++) { ... keyAt(o, i) / valueAt(o, i) ... } over an object or list, or L.length over a Scratch list' :
                    'count with for (let i = 1; i <= L.length; i++) { ... L[i] ... } over a list');
        case 'DoWhileStatement':
            return fail(statement, 'E_UNSUPPORTED', 'do...while is not supported',
                'use while (condition) { ... } or repeatUntil(condition, () => { ... })');
        case 'BreakStatement':
        case 'ContinueStatement':
            if (statement.label) fail(statement, 'E_UNSUPPORTED', 'Labels are not supported');
            return {...mk(statement.type === 'BreakStatement' ? 'control_break' : 'control_continue', [], statement), end: endOfStatement(statement)};
        case 'ReturnStatement':
            // returnStatement：这是 JS 的 return 语句（只能写在 define 里；孤立的 procedures_return 积木只能用块式写法）
            return {...mk('procedures_return', statement.argument ? [value(node(statement.argument))] : [], statement),
                returnStatement: true, end: endOfStatement(statement)};
        case 'SwitchStatement':
            return fail(statement, 'E_UNSUPPORTED', 'switch is not supported', 'use if ... else if ... else chains');
        case 'VariableDeclaration':
            return fail(statement, 'E_DECL', 'Declare variables at the top of the file, outside scripts',
                'const x = sprite.variable("x", 0);');
        default:
            return fail(statement, 'E_JS_EXPR', 'Only block calls, assignments and if / while / for statements are supported here',
                'write a block call: category.block(...)');
        }
    };
    const statements = (body: Node[]): Call[] => body.filter(statement => statement.type !== 'EmptyStatement').map(statement => {
        enter(statement);
        try {
            // 先认领语句前面的注释，再解析语句里的表达式（里面表达式前的注释不会和它抢：中间隔着代码）
            const lead = leadingComment(statement.start);
            const result = lowerStatement(statement);
            result.comment = lead ? lead.text : null;
            return result;
        } finally { depth--; }
    });
    const arrow = (input: Node, withParameters = false): {body: Call[]; parameters: string[]} => {
        const expression = unparen(input);
        if (expression.type !== 'ArrowFunctionExpression') fail(expression, 'E_JS_EXPR', 'Expected () => { ... }');
        if (!withParameters && list(expression.params).length) {
            fail(expression, 'E_JS_EXPR', 'This callback takes no parameters',
                'only define(...) and hat blocks take callback parameters: art.whenTyped((character) => { ... })');
        }
        const parameters = list(expression.params).map(param => {
            if (param.type !== 'Identifier') fail(param, 'E_PROC', 'Procedure parameter must be an identifier');
            return String(param.name);
        });
        const body = node(expression.body);
        if (body.type !== 'BlockStatement') fail(body, 'E_JS_EXPR', 'Arrow body must be a block');
        const outer = parameterScope;
        if (withParameters) parameterScope = new Set([...outer, ...parameters]);
        try { return {body: statements(list(body.body)), parameters}; }
        finally { parameterScope = outer; }
    };
    /** 回调（lambda）：形参只在体内有效，嵌套的回调里外层形参仍可见 */
    const lambdaValue = (expression: Node): Lambda => {
        const parameters = list(expression.params).map(param => {
            if (param.type !== 'Identifier') fail(param, 'E_JS_EXPR', 'Callback parameter must be an identifier');
            return String(param.name);
        });
        const body = node(expression.body);
        const outer = parameterScope;
        parameterScope = new Set([...outer, ...parameters]);
        try {
            const at = where(expression);
            return body.type === 'BlockStatement' ?
                {lambda: {parameters, body: statements(list(body.body))}, ...at} :
                {lambda: {parameters, expression: value(body)}, ...at};
        } finally { parameterScope = outer; }
    };
    /** 声明（stage.variable / sprite.list ……）和带可变输入组的扩展积木：输入组位置上的 [..] / {..} 不是对象 / 列表字面量 */
    const rawGroupStart = (opcode: string): {from: number; tuple: boolean} | null => {
        if (/^(?:stage|sprite)_(?:variable|list)$/.test(opcode)) return {from: 1, tuple: false};
        const spec = schema[opcode] as {variadic?: Array<{compact?: boolean; slots: unknown[]}>; parameters?: string[]; inputs?: object;
            fields?: object} | undefined;
        const group = spec?.variadic?.find(item => item.compact);
        return spec && group ? {from: (spec.parameters ?? [...Object.keys(spec.fields ?? {}), ...Object.keys(spec.inputs ?? {})]).length,
            tuple: group.slots.length > 1} : null;
    };
    /** 数组 / 对象写法的可变输入组：[a, b]、{k: v}，两个槽的组还可以是 [[k, v], ...]（里面一层是元组，不是列表字面量） */
    const rawContainer = (item: Node, tuple: boolean): Value => item.type === 'ArrayExpression' ?
        list(item.elements).map(element => tuple && unparen(element).type === 'ArrayExpression' ?
            list(unparen(element).elements).map(part => value(part)) : value(element)) : properties(item);
    /** 成员链 `a.b.c` → ['a', 'b', 'c']；有一环不是「.标识符」就是 null */
    const memberChain = (target: Node): string[] | null => {
        const parts: string[] = [];
        let current = unparen(target);
        while (current.type === 'MemberExpression' && !current.computed && !current.optional &&
            node(current.property).type === 'Identifier') {
            parts.unshift(String(node(current.property).name));
            current = unparen(node(current.object));
        }
        if (current.type !== 'Identifier') return null;
        parts.unshift(String(current.name));
        return parts;
    };
    /** 这个名字没被文件里的声明、形参占用（占用了就是普通标识符，不是扩展前缀）；项目里隐式的同名变量不算：扩展前缀先认 */
    const isFreeName = (name: string): boolean => !parameterScope.has(name) && !declaredKinds.has(name);
    /**
     * 扩展积木的两种带点写法 → 操作码：
     *  - 点链 `test.moreDataTypes.getNewSet()`：扩展 id 带点，id 是去掉最后一段方法名的链（schema 里有这个 id 才算；
     *    没装这个扩展时也认，编译报「积木不存在」并带上扩展 id，宿主据此去装）；开着高级数据结构时，没对上已知 id 的链
     *    是对象属性路径（`o.a.b.push(v)`），留给糖处理。
     *  - 字符串键 `ext["my-ext"].name(...)` / `ext["my-ext"]["name"](...)`：id 或积木名写不成标识符。
     * 根名字被变量 / 形参占用时都不是扩展调用（打印器给变量改名，不会撞上）。
     */
    let lastExtensionId: string | undefined;
    const extensionCall = (callee: Node): string | null => {
        lastExtensionId = undefined;
        if (callee.type !== 'MemberExpression' || callee.optional) return null;
        const owner = unparen(node(callee.object));
        const method = node(callee.property);
        const methodName = !callee.computed && method.type === 'Identifier' ? String(method.name) :
            callee.computed && method.type === 'Literal' && typeof method.value === 'string' ? method.value : null;
        if (methodName === null) return null;
        if (owner.type === 'MemberExpression' && owner.computed && !owner.optional) {
            const root = unparen(node(owner.object));
            const id = node(owner.property);
            if (root.type === 'Identifier' && root.name === EXT_NAMESPACE && isFreeName(EXT_NAMESPACE) &&
                id.type === 'Literal' && typeof id.value === 'string') { lastExtensionId = id.value; return `${id.value}_${methodName}`; }
            return null;
        }
        if (callee.computed) return null;
        const chain = memberChain(owner);
        if (!chain || chain.length < 2 || !isFreeName(chain[0])) return null;
        const id = chain.join('.');
        if (!(dotted.has(id) || (!mdt && methodName !== 'includes'))) return null;
        lastExtensionId = id;
        return `${id}_${methodName}`;
    };
    const call = (expression: Node): Call => {
        if (expression.type !== 'CallExpression' || expression.optional) fail(expression, 'E_JS_EXPR', 'Expected a block call');
        const callee = node(expression.callee);
        const extensionOpcode = extensionCall(callee);
        const extensionFromText = lastExtensionId;
        const sugar = !extensionOpcode && mdt ? mdt.call(expression) : null;
        if (sugar) return sugar;
        let opcode: string;
        let extensionId: string | undefined = extensionFromText;
        if (extensionOpcode) {
            opcode = extensionOpcode;
        } else if (callee.type === 'MemberExpression' && node(callee.object).type === 'Identifier' &&
            node(callee.object).name === 'call') {
            if (!callee.computed || node(callee.property).type !== 'Literal' ||
                typeof node(callee.property).value !== 'string') {
                fail(callee, 'E_PROC', 'Use call["full template"](...) for every procedure call');
            }
            opcode = `@proc:${node(callee.property).value}`;
        } else if (callee.type === 'MemberExpression' && !callee.computed &&
            node(callee.object).type === 'Identifier' && node(callee.property).type === 'Identifier') {
            const namespace = String(node(callee.object).name);
            const method = String(node(callee.property).name);
            if (namespace === 'Math' && !declaredKinds.has('Math') && !parameterScope.has('Math')) {
                return mathCall(expression, method);
            }
            const owner = listOf(node(callee.object));
            if (owner && LIST_METHODS.has(method)) return listMethod(expression, owner, method);
            if (method === 'includes' && (parameterScope.has(namespace) || kindOf(namespace) !== undefined ||
                !namespaces.has(namespace))) {
                if (list(expression.arguments).length !== 1) fail(expression, 'E_JS_EXPR', 'includes() takes 1 argument');
                return mk('operator_contains', [value(node(callee.object)), value(list(expression.arguments)[0])], expression);
            }
            if (namespace === 'procedures' && /^call(?:_with_return)?$/.test(String(node(callee.property).name))) {
                fail(expression, 'E_PROC', 'Use call["full template"](...) for a procedure');
            }
            if (namespace === 'procedures' && node(callee.property).name === 'run_branch') {
                fail(expression, 'E_PROC', 'Invoke a %c parameter as body() inside define()');
            }
            if (namespace === 'event' && String(node(callee.property).name).startsWith('when')) {
                fail(expression, 'E_JS_EXPR', 'Use when.name(...) for hat blocks');
            }
            opcode = namespace === 'when' ? `event_when${node(callee.property).name}` :
                `${namespace}_${node(callee.property).name}`;
            if (namespace !== 'when') extensionId = namespace;
        } else if (callee.type === 'MemberExpression' && !callee.computed && node(callee.property).type === 'Identifier' &&
            node(callee.property).name === 'includes' && node(callee.object).type !== 'Identifier') {
            if (list(expression.arguments).length !== 1) fail(expression, 'E_JS_EXPR', 'includes() takes 1 argument');
            return mk('operator_contains', [value(node(callee.object)), value(list(expression.arguments)[0])], expression);
        } else if (callee.type === 'Identifier' && callee.name === 'define') {
            opcode = 'procedures_definition';
        } else if (callee.type === 'Identifier' && callee.name === 'raw') {
            // DSL 只写 schema 里有的积木；缺扩展时先装扩展、重新取 schema，而不是手写一块不存在的积木
            return fail(expression, 'E_UNKNOWN_BLOCK',
                'raw() is not supported; write the block as extension.block(...) after the extension is installed');
        } else if (callee.type === 'Identifier' && !parameterScope.has(String(callee.name)) &&
            TRIG.has(String(callee.name))) {
            const args = list(expression.arguments);
            if (args.length !== 1) fail(expression, 'E_JS_EXPR', `${String(callee.name)}(x) takes 1 argument (degrees)`);
            return mk('operator_mathop', [String(callee.name), value(args[0])], expression);
        } else if (callee.type === 'Identifier') {
            if (callee.name === 'call') fail(expression, 'E_PROC', 'Use call["full template"](...) for a procedure');
            opcode = BARE[String(callee.name)] && !parameterScope.has(String(callee.name)) ?
                BARE[String(callee.name)] : `@call:${String(callee.name)}`;
        } else {
            // 高级数据结构开着时，没对上已知 id 的点链被糖让给了对象属性路径；糖也不认、根名又不是任何变量，
            // 那它是还没装的带点 id 的扩展（`FurryR.NotJS.run()`）：写成扩展调用，编译报「积木不存在」并指向 add_extension
            const chain = mdt && callee.type === 'MemberExpression' && !callee.computed && !callee.optional &&
                node(callee.property).type === 'Identifier' ? memberChain(unparen(node(callee.object))) : null;
            if (!chain || chain.length < 2 || !isFreeName(chain[0]) || kindOf(chain[0]) !== undefined || namespaces.has(chain[0])) {
                return fail(callee, 'E_JS_EXPR', 'Use category.block(...) or a declared procedure');
            }
            opcode = `${chain.join('.')}_${node(callee.property).name}`;
            extensionId = chain.join('.');
        }
        const args = list(expression.arguments);
        if (opcode === 'event_broadcast' || opcode === 'event_broadcastandwait') {
            const first = args[0];
            const selected = first?.type === 'ObjectExpression' ? list(first.properties).find(property =>
                (node(property.key).name ?? node(property.key).value) === 'BROADCAST_INPUT') : null;
            const content = selected ? node(selected.value) : first;
            if (content?.type === 'Literal' && typeof content.value === 'string') {
                fail(content, 'E_BROADCAST',
                    'Select a broadcast with its declared identifier; use a reporter expression for computed text');
            }
        }
        if (opcode === 'procedures_definition') {
            if (args.length !== 2 || args[0].type !== 'Literal' || typeof args[0].value !== 'string') {
                fail(expression, 'E_PROC', 'define("template", (args) => {...}) expected');
            }
            const definition = arrow(args[1], true);
            return {opcode, args: {proccode: args[0].value as string}, body: definition.body,
                parameters: definition.parameters, ...where(expression)};
        }
        const named = args[0]?.type === 'ObjectExpression';
        if (named && args.length > 2) fail(expression, 'E_JS_EXPR', 'Too many arguments');
        // hat 积木的回调（最后一个参数）单独成 body，可以带形参绑定 hat 的参数椭圆：art.whenTyped((character) => {...})
        const hat = isHat({opcode} as Call);
        const last = args[args.length - 1];
        const callback = hat && last && unparen(last).type === 'ArrowFunctionExpression' && (named ? args.length === 2 : true) ?
            arrow(last, true) : null;
        // 高级数据结构开着时，对象 / 列表字面量是对象 / 列表积木；声明的初始值、可变输入组位置上的 [..] / {..} 仍是原样的数据
        const raw = mdt ? rawGroupStart(opcode) : null;
        const positions = named ? undefined : (callback ? args.slice(0, -1) : args).map((item, index) =>
            raw && index >= raw.from && ['ArrayExpression', 'ObjectExpression'].includes(unparen(item).type) ?
                rawContainer(unparen(item), raw.tuple) : value(item));
        // 具名写法的第二个参数是回调：hat 的回调体、有参数槽的积木的回调（放进回调体输入的键里）、其余积木的 { ... } 体
        const layout = callbackLayout(schema[opcode] as BlockSpec | undefined);
        const second = named && args[1] && !callback ? args[1] : null;
        const secondIsLayout = !!layout && !!second && unparen(second).type === 'ArrowFunctionExpression';
        const trailing = second && !secondIsLayout ? arrow(second) : callback;
        const named0: Record<string, Value> = named ? properties(args[0]) : Object.create(null);
        if (secondIsLayout && layout) setOwn(named0, layout.body, value(second));
        const result: Call = {opcode, args: named0,
            ...(positions ? {positions} : {}),
            ...(trailing ? {body: trailing.body, ...(callback ? {parameters: callback.parameters} : {})} : {}),
            ...(extensionId !== undefined && !schema[opcode] ? {extensionId} : {}),
            ...(positions ? {argumentSpans: (callback ? args.slice(0, -1) : args).map(item => ({start: item.start, end: item.end}))} : {}),
            ...where(expression)};
        // 带形参 / 表达式体的回调只有 hat、define 和有参数槽的积木认；别的积木写了就地说清楚
        if (schema[opcode] && !layout) {
            const stray = [...(positions ?? []), ...Object.values(named0)].find(isLambdaValue);
            if (stray) {
                fail(args[0], 'E_JS_EXPR', stray.lambda.parameters.length ? 'This callback takes no parameters' :
                    'Arrow body must be a block',
                'only define(...), hat blocks and blocks with callback parameter slots take callback parameters: art.whenTyped((character) => { ... })');
            }
        }
        return result;
    };
    /** 被语句认领的装饰器；没被认领的（写在回调里、后面没跟语句）最后报错，不静默失效 */
    const usedDecorators = new Set<DecoratorItem>();
    /**
     * 装饰器和它修饰的语句之间只能隔空白和注释（打印器把积木注释写在 @at 和积木之间）。
     * 装饰器和语句都按位置有序：从语句起点往回跳过空白和注释找到这一段的起点，再二分取这一段里的装饰器，
     * 总代价和装饰器个数无关（不是每条语句扫一遍全部装饰器）。
     */
    const decoratorsBefore = (statement: Node): DecoratorItem[] => {
        const items = decorated.items;
        if (!items.length) return [];
        let boundary = statement.start;
        for (;;) {
            let cursor = boundary;
            while (cursor > 0 && /\s/.test(decorated.source[cursor - 1])) cursor--;
            const index = lastCommentBefore(cursor);
            if (index >= 0 && comments[index].end === cursor) { boundary = comments[index].start; continue; }
            boundary = cursor;
            break;
        }
        let low = 0;
        let high = items.length;
        while (low < high) {
            const mid = (low + high) >> 1;
            if (items[mid].start >= boundary) high = mid; else low = mid + 1;
        }
        const found: DecoratorItem[] = [];
        for (let index = low; index < items.length && items[index].end <= statement.start; index++) {
            found.push(items[index]);
            usedDecorators.add(items[index]);
        }
        return found;
    };
    try {
        const scripts: Call[][] = [];
        const scriptFrames: Array<FrameScope | null> = [];
        const declarations: Declaration[] = [];
        const notes: ParseResult['notes'] = [];
        let current: Call[] = [];
        let currentFrame: FrameScope | null = null;
        const flush = (): void => {
            if (current.length) { scripts.push(current); scriptFrames.push(currentFrame); }
            current = [];
            currentFrame = null;
        };
        const processStatement = (statement: Node, frameScope: FrameScope | null = null): void => {
            if (statement.type === 'VariableDeclaration') {
                if (frameScope !== null) fail(statement, 'E_FRAME', 'Declare variables outside frame()');
                flush();
                if (statement.kind !== 'const' && statement.kind !== 'let') fail(statement, 'E_DECL', 'Declarations must use const');
                for (const item of list(statement.declarations)) {
                    const identifier = node(item.id);
                    if (identifier.type !== 'Identifier') fail(identifier, 'E_DECL', 'Expected a declaration name');
                    if (!item.init || node(item.init).type !== 'CallExpression') {
                        fail(item, 'E_DECL', 'Declare variables with stage.variable("name", value), sprite.variable(...) or sprite.list(...)',
                            'const score = sprite.variable("score", 0);');
                    }
                    const init = call(node(item.init));
                    const match = /^(stage|sprite)_(variable|list)$/.exec(init.opcode);
                    const kind = match ? match[2] : init.opcode === '@call:broadcast' ? 'broadcast' : null;
                    if (!kind || !init.positions || typeof init.positions[0] !== 'string' || init.positions.length > 2) {
                        fail(item, 'E_DECL', 'Use stage.variable, sprite.variable/list or broadcast(name)');
                    }
                    const positions = init.positions as Value[];
                    declarations.push({identifier: String(identifier.name), scope: match ? match[1] as 'stage' | 'sprite' : 'broadcast',
                        type: kind as Declaration['type'], name: positions[0] as string, initialValue: positions[1] ?? null,
                        line: item.loc.start.line, column: item.loc.start.column + 1});
                }
                return;
            }
            if (statement.type === 'EmptyStatement') return;
            const expression = statement.type === 'ExpressionStatement' ? node(statement.expression) : statement;
            const callee = expression.type === 'CallExpression' ? node(expression.callee) : null;
            if (callee && callee.type === 'Identifier' && callee.name === 'frame') {
                if (frameScope !== null) fail(statement, 'E_FRAME', 'Nested frames are not supported');
                const args = list(expression.arguments);
                if (args.length !== 2 || args[0].type !== 'Literal' || typeof args[0].value !== 'string' ||
                    !String(args[0].value).trim() || args[1].type !== 'ArrowFunctionExpression' ||
                    list(args[1].params).length || node(args[1].body).type !== 'BlockStatement') {
                    fail(expression, 'E_FRAME', 'Use frame("title", () => { ... })');
                }
                const members = list(node(args[1].body).body);
                if (!members.length) fail(expression, 'E_FRAME', 'A frame needs at least one script');
                const frame: FrameScope = {title: String(args[0].value)};
                const markers = decoratorsBefore(statement);
                for (const marker of markers) {
                    const text = source.slice(marker.start, marker.end);
                    if (marker.name === 'at') {
                        const coordinates = /@at\(\s*([-+]?\d+(?:\.\d+)?)\s*,\s*([-+]?\d+(?:\.\d+)?)\s*\)/.exec(text);
                        if (coordinates) frame.at = {x: Number(coordinates[1]), y: Number(coordinates[2])};
                    } else if (marker.name === 'size') {
                        const dimensions = /@size\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*\)/.exec(text);
                        if (dimensions) frame.size = {width: Number(dimensions[1]), height: Number(dimensions[2])};
                        if (!frame.size?.width || !frame.size.height) fail(statement, 'E_FRAME', 'Frame size must be positive');
                    } else if (marker.name === 'color') {
                        let color = '';
                        try { color = JSON.parse(marker.args.slice(1, -1).trim()) as string; }
                        catch { fail(statement, 'E_FRAME', 'Use @color("#RRGGBB")'); }
                        if (typeof color !== 'string') fail(statement, 'E_FRAME', 'Use @color("#RRGGBB")');
                        if (/^#[\da-f]{6}$/i.test(color)) {
                            frame.color = [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16)).join(', ');
                        } else if (/^\d{1,3},\s*\d{1,3},\s*\d{1,3}$/.test(color) &&
                            color.split(',').every(value => Number(value.trim()) <= 255)) {
                            frame.color = color.split(',').map(value => Number(value.trim())).join(', ');
                        } else fail(statement, 'E_FRAME', 'Use @color("#RRGGBB")');
                    } else if (marker.name === 'locked') frame.locked = true;
                    else if (marker.name === 'collapsed') frame.collapsed = true;
                    else fail(statement, 'E_FRAME', `@${marker.name} cannot decorate a frame`);
                }
                flush();
                members.forEach(member => processStatement(member, frame));
                flush();
                return;
            }
            const item = statements([statement])[0];
            const attached = decoratorsBefore(statement);
            for (const entry of attached) {
                if (entry.name === 'size' || entry.name === 'color' || entry.name === 'locked') {
                    fail(statement, 'E_FRAME', `@${entry.name} requires frame()`);
                }
                if (entry.name === 'at') {
                    const coordinates = /@at\(\s*([-+]?\d+(?:\.\d+)?)\s*,\s*([-+]?\d+(?:\.\d+)?)\s*\)/.exec(source.slice(entry.start, entry.end));
                    if (coordinates) item.at = {x: Number(coordinates[1]), y: Number(coordinates[2])};
                } else if (entry.name === 'warp') item.warp = true;
                else if (entry.name === 'global') item.global = true;
                else if (entry.name === 'reporter') item.returnType = 'string';
                else if (entry.name === 'boolean') item.returnType = 'boolean';
                else if (entry.name === 'collapsed') item.collapsed = true;
                else if (entry.name === 'id') item.anchor = JSON.parse(entry.args.slice(1, -1).trim());
                else if (entry.name === 'note') {
                    const numbers = source.slice(entry.start + 6, entry.end - 1).split(',').map(part =>
                        part.trim() === 'null' ? null : Number(part));
                    if (numbers[2] === null || numbers[3] === null) fail(statement, 'E_NOTE', 'Note size must be numeric');
                    item.note = {x: numbers[0], y: numbers[1], width: numbers[2] as number,
                        height: numbers[3] as number};
                }
            }
            if (item.note) {
                if (item.opcode !== '@call:comment' || item.positions?.length !== 1 ||
                    typeof item.positions[0] !== 'string') fail(statement, 'E_NOTE', 'Expected @note(x, y, w, h) comment("text")');
                notes.push({...item.note, text: (item.positions as Value[])[0] as string});
                return;
            }
            if (item.opcode === '@call:comment') fail(statement, 'E_NOTE', 'comment() requires @note');
            if (item.warp && item.opcode !== 'procedures_definition') fail(statement, 'E_PROC', '@warp requires define()');
            if (item.global && item.opcode !== 'procedures_definition') fail(statement, 'E_PROC', '@global requires define()');
            if (item.returnType && item.opcode !== 'procedures_definition') {
                fail(statement, 'E_PROC', '@reporter and @boolean require define()');
            }
            if (item.returnType) item.args.returntype = item.returnType;
            // A hat starts a script, and its callback already contains the complete script body.
            // Ordinary commands still form a top-level stack until @at, frame or a real schema hat.
            // @id 也起一段新脚本：不写位置的文本里，两段挨着的无帽脚本靠它分开（否则会并成一串）
            if (currentFrame !== frameScope || item.at || item.anchor || !current.length || isHat(item) || isHat(current[0])) flush();
            currentFrame = frameScope;
            current.push(item);
        };
        for (const statement of list(program.body)) processStatement(statement);
        flush();
        const lineOf = (offset: number): {line: number; column: number} => {
            let line = 1;
            let lineStart = 0;
            for (let index = source.indexOf('\n'); index >= 0 && index < offset; index = source.indexOf('\n', index + 1)) {
                line++;
                lineStart = index + 1;
            }
            return {line, column: offset - lineStart + 1};
        };
        for (const item of decorated.items) {
            if (usedDecorators.has(item)) continue;
            diagnostics.push({code: 'E_DECORATOR', message: `@${item.name} is not directly before a top-level statement, so it has no effect`,
                ...lineOf(item.start), severity: 'error',
                fix: 'write decorators on their own line right before a top-level statement or frame(); they cannot go inside callbacks'});
        }
        comments.forEach((comment, index) => {
            if (claimed.has(index)) return;
            const doc = comment.type === 'Block' && isDocComment(source.slice(comment.start, comment.end));
            dropped({line: comment.loc?.start.line ?? 1, column: (comment.loc?.start.column ?? 0) + 1},
                doc ? 'This /** */ comment is not directly before a statement or a value, so it is dropped' :
                    'Plain comments (// and /* */) are not kept in the blocks; only /** note */ before a statement is a block comment',
                'put /** text */ on the line right before the block it describes');
        });
        return {...empty(), scripts, scriptFrames, declarations, notes};
    } catch (error) {
        // 兜底：不静默返回空结果（调用方会以为「源文里没有积木」）
        if (!diagnostics.length) {
            diagnostics.push(error instanceof RangeError ?
                {code: 'E_TOO_DEEP', message: tooDeepMessage(MAX_DEPTH), line: 1, column: 1, severity: 'error', fix: TOO_DEEP_FIX} :
                {code: 'E_INTERNAL', message: `Internal error while parsing: ${error instanceof Error ? error.message : String(error)}`,
                    line: 1, column: 1, severity: 'error'});
        }
        return empty();
    }
};
