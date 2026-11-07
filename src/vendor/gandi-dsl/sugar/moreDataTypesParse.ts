/**
 * 「高级数据结构」的 JavaScript 糖：文字 → 积木（parser 这一侧）。parser.ts 在 schema 里认出这个扩展时才创建，
 * 没装扩展时 parser 的行为一字不变。
 *
 * 糖只产出带名字的参数（args）的调用，不依赖积木文字里占位符的顺序（它随语言变）；动态参数写成 DYNAMIC_ARGSn 具名槽，
 * 槽数由编译器按槽名推（见 dynamic.ts 的 dynargs）。语法表在 moreDataTypesSyntax.ts，和打印器共用。
 */
import type {Call, Lambda, Value} from '../parser';
import {DYNAMIC, MDT_VARIADIC, moreDataTypesIds} from './moreDataTypes';
import {CONFIG_COMMANDS, FIND_METHODS, GLOBAL_FUNCTIONS, isStaticKey, LIST_OP_METHODS, MARKET_FUNCTIONS, MARKET_METHODS, MERGE_METHODS,
    JSON_PATH_DEFAULT, OBJECT_STATICS, PROTOTYPE_METHODS, PUSH_METHODS, SET_OPS, SUGAR_METHOD_NAMES, SOME_METHODS, SORT_BY_METHODS, STORE_METHODS, SUGAR_NAMESPACES, TYPE_FUNCTIONS} from './moreDataTypesSyntax';

export interface AstNode {
    type: string;
    start: number;
    end: number;
    loc: {start: {line: number; column: number}};
    [key: string]: unknown;
}

export interface MdtParseApi {
    schema: Record<string, unknown>;
    node: (value: unknown) => AstNode;
    list: (value: unknown) => AstNode[];
    unparen: (node: AstNode) => AstNode;
    value: (node: AstNode) => Value;
    fail: (node: AstNode, code: string, message: string, fix?: string) => never;
    warn: (node: AstNode, code: string, message: string, fix?: string) => void;
    mk: (opcode: string, positions: Value[], at: AstNode) => Call;
    /** 标识符是 Scratch 列表（`L.push(v)` 走原来的列表写法） */
    listOf: (node: AstNode) => string | null;
    /** 标识符是不是变量 / 列表 / 广播 / 形参（形参先于一切；这些名字不会被当成命名空间） */
    isBound: (name: string) => boolean;
    namespaces: Set<string>;
    zeroIndex: (index: Value, at: AstNode) => void;
    /** 文字里出现了 `ads.indexStart(0)` / `ads.indexStart(1)`：之后字面量下标 0 不再提示「总是空」 */
    setIndexStart: (zero: boolean) => void;
}

export interface MdtParser {
    prefix: string;
    /** 这个标识符是糖的命名空间（store / ads / Object / JSON / Array），并且没被变量、同名积木分类占用 */
    ownsNamespace: (name: string) => boolean;
    member: (expression: AstNode) => Value | null;
    object: (expression: AstNode) => Value;
    array: (expression: AstNode) => Value;
    call: (expression: AstNode) => Call | null;
    /** `new Set()` / `new Set([a, b])` / `new Set(x)`（集市版）；不是 Set 返回 null */
    newExpression: (expression: AstNode) => Call | null;
    typeofOf: (expression: AstNode) => Value;
    inOperator: (expression: AstNode) => Value;
    assignment: (expression: AstNode) => Call | null;
    update: (expression: AstNode) => Call | null;
    deleteStatement: (expression: AstNode) => Call | null;
    nullCompare: (expression: AstNode) => void;
    lengthWarning: (expression: AstNode) => void;
    /** 这个表达式是 Scratch 列表就报 E_MDT_RECEIVER（糖不能用在 Scratch 列表上）；what 里的 @ 换成列表名 */
    guardList: (at: AstNode, what: string) => void;
}

const MAX_STATIC_DEPTH = 120;

/** 这个 schema 里有高级数据结构就建一个糖解析器；没有返回 null */
export const createMdtParser = (api: MdtParseApi): MdtParser | null => {
    const [prefix] = moreDataTypesIds(api.schema);
    if (prefix === undefined) return null;
    const {node, list, unparen, value, fail, warn, mk, listOf} = api;
    const has = (suffix: string): boolean => `${prefix}_${suffix}` in api.schema;
    const block = (suffix: string, args: Record<string, Value>, at: AstNode): Call => {
        const call: Call = {opcode: `${prefix}_${suffix}`, args: Object.create(null), start: at.start, end: at.end, line: at.loc.start.line,
            column: at.loc.start.column + 1};
        for (const [key, item] of Object.entries(args)) Object.defineProperty(call.args, key,
            {value: item, enumerable: true, writable: true, configurable: true});
        // 糖写出的积木永远带 mutation（和编辑器一样，空的也写）：槽数明说，不让编译器按槽名猜
        const slots = MDT_VARIADIC[suffix]?.slots.length;
        if (slots) call.variadicCounts = [Math.ceil(Object.keys(args).filter(key => key.startsWith(DYNAMIC)).length / slots)];
        return call;
    };
    const ownsNamespace = (name: string): boolean => SUGAR_NAMESPACES.includes(name) && !api.isBound(name) &&
        (!api.namespaces.has(name) || name === prefix);
    const isStringLiteral = (item: AstNode): boolean => {
        const inner = unparen(item);
        return inner.type === 'Literal' && typeof inner.value === 'string' || inner.type === 'TemplateLiteral';
    };
    /** 数字 / 布尔字面量放进对象、列表时的编码：数字 → 0 + n（数字运算的结果才是数字），布尔 → JSON 解析 */
    const encode = (item: Value, at: AstNode): Value => {
        if (typeof item === 'number' || (!!item && typeof item === 'object' && 'typed' in item && item.typed === 'number')) {
            return mk('operator_add', [0, item], at);
        }
        if (typeof item === 'boolean') return block('getObjFromJson', {VALUE: String(item)}, at);
        if (item === null) {
            fail(at, 'E_MDT_NULL', 'null cannot be stored in an object or list (a missing property already reads as "")',
                'delete the property with delete o.k, or store "" explicitly');
        }
        return item;
    };
    const encoded = (at: AstNode): Value => encode(value(at), at);

    // ───── 静态字面量 → JSON ─────
    interface Static {json: unknown}
    /** 静态 JSON 里的数字必须是有限的：JSON.stringify(Infinity) 是 null，写进去会悄悄变成 null */
    const finite = (at: AstNode, number: number): number => Number.isFinite(number) ? number :
        fail(at, 'E_MDT_NUMBER', 'A number that is not finite (like 1e400) cannot go into a {...} / [...] literal: JSON text has no Infinity and it would become null',
            'set it after creating the object (o.k = 1e400 stores a real number at run time), or write the text "Infinity"');
    const staticOf = (input: AstNode, depth = 0): Static | null => {
        if (depth > MAX_STATIC_DEPTH) return null;
        const expression = unparen(input);
        switch (expression.type) {
        case 'Literal':
            // null 不进静态 JSON（和 o.k = null 一样报 E_MDT_NULL，走动态路径）；JSON 放不下 Infinity（会变成 null）
            if (typeof expression.value === 'number') return {json: finite(expression, expression.value)};
            return ['string', 'boolean'].includes(typeof expression.value) ? {json: expression.value} : null;
        case 'UnaryExpression': {
            const argument = node(expression.argument);
            return expression.operator === '-' && argument.type === 'Literal' && typeof argument.value === 'number' ?
                {json: finite(expression, -argument.value)} : null;
        }
        case 'TemplateLiteral': {
            if (list(expression.expressions).length) return null;
            const cooked = (list(expression.quasis)[0]?.value as {cooked: string | null} | undefined)?.cooked;
            return typeof cooked === 'string' ? {json: cooked} : null;
        }
        case 'ArrayExpression': {
            const items: unknown[] = [];
            for (const element of list(expression.elements)) {
                if (!element || element.type === 'SpreadElement') return null;
                const inner = staticOf(element, depth + 1);
                if (!inner) return null;
                items.push(inner.json);
            }
            return {json: items};
        }
        case 'ObjectExpression': {
            const result: Record<string, unknown> = {};
            const seen = new Set<string>();
            for (const property of list(expression.properties)) {
                if (property.type !== 'Property' || property.computed || property.method || property.shorthand ||
                    property.kind !== 'init') return null;
                const key = staticKey(node(property.key));
                if (key === null || !isStaticKey(key) || seen.has(key)) return null;
                seen.add(key);
                const inner = staticOf(node(property.value), depth + 1);
                if (!inner) return null;
                result[key] = inner.json;
            }
            return {json: result};
        }
        default: return null;
        }
    };
    const staticKey = (key: AstNode): string | null => key.type === 'Identifier' ? String(key.name) :
        key.type === 'Literal' && typeof key.value === 'string' ? key.value :
            key.type === 'Literal' && typeof key.value === 'number' ? String(key.value) : null;

    const array = (expression: AstNode): Value => {
        const elements = list(expression.elements);
        if (!elements.length) return block('getNewList', {}, expression);
        const fixed = staticOf(expression);
        if (fixed) return block('getObjFromJson', {VALUE: JSON.stringify(fixed.json)}, expression);
        const args: Record<string, Value> = {};
        elements.forEach((element, index) => {
            if (!element || element.type === 'SpreadElement') {
                fail(element ?? expression, 'E_JS_EXPR', element ? 'Spread in a list literal is not supported' :
                    'Holes in a list literal are not supported', 'use clone(list) for a copy, or list.concat(other) to join lists');
            }
            args[`${DYNAMIC}${index + 1}`] = encoded(element);
        });
        return block('getNewList', args, expression);
    };
    const object = (expression: AstNode): Value => {
        const properties = list(expression.properties);
        if (!properties.length) return block('getNewObject', {}, expression);
        const fixed = staticOf(expression);
        if (fixed) return block('getObjFromJson', {VALUE: JSON.stringify(fixed.json)}, expression);
        const args: Record<string, Value> = {};
        properties.forEach((property, index) => {
            if (property.type !== 'Property' || property.method || property.kind !== 'init') {
                fail(property, 'E_JS_EXPR', property.type === 'SpreadElement' ? 'Spread in an object literal is not supported' :
                    'Only key: value properties are supported in an object literal',
                'use clone(o) for a copy, or Object.assign(o, other) to merge into an existing object');
            }
            const keyNode = node(property.key);
            let key: Value;
            if (property.computed) key = value(keyNode);
            else {
                const text = staticKey(keyNode);
                if (text === null) fail(keyNode, 'E_JS_EXPR', 'Invalid property name in an object literal');
                key = text;
            }
            const item: Value = property.shorthand ? value(keyNode) : encoded(node(property.value));
            args[`${DYNAMIC}${index * 2 + 1}`] = key;
            args[`${DYNAMIC}${index * 2 + 2}`] = item;
        });
        return block('getNewObject', args, expression);
    };

    // ───── 路径：o.a.b[i] ─────
    interface Segment {key: Value; at: AstNode}
    /** 沿着没加括号的成员链往里走，一直到根；`.length` 和 Scratch 列表的下标不是属性，在那里停下 */
    const chain = (start: AstNode): {root: AstNode; segments: Segment[]} => {
        const segments: Segment[] = [];
        let current = start;
        while (current.type === 'MemberExpression' && !current.optional) {
            const computed = !!current.computed;
            const property = node(current.property);
            if (!computed && String(property.name) === 'length') break;
            const owner = node(current.object);
            if (computed && listOf(owner)) break;
            segments.push({key: computed ? value(property) : String(property.name), at: current});
            current = owner;
        }
        segments.reverse();
        return {root: current, segments};
    };
    /**
     * Scratch 列表（`sprite.list(...)`）不能当扩展糖的接收者：列表积木读出来是一段文字（项目用空格连起来），
     * 扩展把它当成「临时数据名」，找不到就静默什么都不做。编译期直接说清，不让它悄悄变成空操作。
     */
    function notScratchList(at: AstNode, what: string): void {
        const name = listOf(at);
        if (name === null) return;
        fail(at, 'E_MDT_RECEIVER', `${what.replace('@', name)} does not work on the Scratch list ${name}: the extension would read the list as a temporary-data name and silently do nothing`,
            'Scratch lists only support push / insert / remove / clear / includes / indexOf / length and L[i]. ' +
            'To use this on the items, put them into an object list first (o = [] then o.push(L[1]) ... , or JSON.parse(text)), ' +
            `or read the Scratch list as an object list with the block form o = ${prefix}.getScratchList("${name}") ` +
            `(it returns the list itself: o.sort() / o.push(x) change ${name} in place)`);
    }
    /** 链根必须是对象表达式：字符串字面量是「临时数据名」的写法，糖里不收（用 store.get） */
    const rootValue = (root: AstNode): Value => {
        notScratchList(root, '@.…');
        if (root.type === 'Literal' && typeof root.value === 'string') {
            fail(root, 'E_MDT_RECEIVER', 'A string literal here would be read as the name of a temporary data entry, not as text',
                `use store.get(${JSON.stringify(root.value)}) for temporary data, or the block form ${prefix}.xxx(...)`);
        }
        return value(root);
    };
    const pathArgs = (segments: Segment[], names: string[]): Record<string, Value> => {
        const args: Record<string, Value> = {};
        // 路径上的 0 可能是对象的键 "0"（接收者的类型这里不知道），不提示「总是空」；列表专用的 insert(0, v) 才提示
        segments.forEach((segment, index) => {
            args[index < names.length ? names[index] : `${DYNAMIC}${index - names.length + 1}`] = segment.key;
        });
        return args;
    };

    // 对象一样的表达式：标识符、成员链、对象 / 列表字面量、糖里返回对象 / 列表的调用
    const OBJECT_METHODS = new Set(['range', 'split', 'concat', 'union', 'intersection', 'difference', 'pop']);
    const objectCall = (expression: AstNode): boolean => {
        const callee = unparen(node(expression.callee));
        if (callee.type === 'Identifier') {
            return ['clone', 'structuredClone', 'pick', 'pickValues', 'list'].includes(String(callee.name));
        }
        if (callee.type !== 'MemberExpression' || callee.computed) return false;
        const owner = unparen(node(callee.object));
        const method = String(node(callee.property).name);
        if (owner.type === 'Identifier' && ownsNamespace(String(owner.name))) {
            const name = String(owner.name);
            return name === 'JSON' ? method === 'parse' : name === 'Object' ? method in OBJECT_STATICS :
                name === 'store' && method === 'get';
        }
        if (owner.type === 'Identifier' && String(owner.name) === prefix) return true;
        return OBJECT_METHODS.has(method) && !(owner.type === 'Identifier' && api.namespaces.has(String(owner.name)) &&
            !api.isBound(String(owner.name)));
    };

    const member = (expression: AstNode): Value | null => {
        const computed = !!expression.computed;
        const owner = node(expression.object);
        if (!computed && String(node(expression.property).name) === 'length') return null;
        if (listOf(owner)) return null;
        // `"abc"[1]`、模板字符串的 [1]：字符串的第几个字，仍是原来的写法；其余接收者（变量、成员链、调用结果……）都是属性访问
        if (computed && isStringLiteral(owner)) return null;
        const {root, segments} = chain(expression);
        if (!segments.length) return null;
        return block('getPropOfObject', {NAME_OR_OBJ: rootValue(root), ...pathArgs(segments, ['PROP'])}, expression);
    };

    // ───── 调用 ─────
    const need = (expression: AstNode, name: string, count: number | [number, number]): AstNode[] => {
        const args = list(expression.arguments);
        const [low, high] = Array.isArray(count) ? count : [count, count];
        if (args.length < low || args.length > high) {
            fail(expression, 'E_JS_EXPR', `${name}() takes ${low === high ? low : `${low} to ${high}`} argument${high === 1 ? '' : 's'}`);
        }
        for (const arg of args) if (arg.type === 'SpreadElement') fail(arg, 'E_JS_EXPR', 'Spread arguments are not supported');
        return args;
    };
    const flag = (at: AstNode, item: Value, kind: 'bool' | 'index'): string => {
        if (kind === 'bool' && (item === true || item === false)) return item ? 'on' : 'off';
        if (kind === 'index' && (item === 0 || item === 1)) return String(item);
        return fail(at, 'E_JS_EXPR', kind === 'bool' ? 'Write true or false' : 'Write 1 or 0');
    };

    const isLambda = (item: Value): item is Lambda => !!item && typeof item === 'object' && !Array.isArray(item) && 'lambda' in item;
    /** 回调参数：必须是带形参 / 表达式体的箭头函数 `(item, index) => 表达式` */
    const callbackOf = (at: AstNode, name: string, shape: string): Lambda => {
        const item = value(at);
        if (!isLambda(item)) return fail(at, 'E_JS_EXPR', `${name}() takes a callback: ${shape}`);
        return item;
    };
    /** 回调体产出的值放进列表 / 对象：数字字面量先变成数字、布尔变成 JSON，和 push 里的值同一条规则 */
    const encodeBody = (lambda: Lambda, at: AstNode): Lambda => lambda.lambda.expression === undefined ? lambda :
        {...lambda, lambda: {...lambda.lambda, expression: encode(lambda.lambda.expression, at)}};
    /** 集市版才有的方法（积木在才认） */
    const marketCall = (expression: AstNode, receiver: AstNode, method: string): Call => {
        const recv = (): Value => value(receiver);
        switch (method) {
        case 'add':
        case 'delete': {
            const [item] = need(expression, method, 1);
            return block(method === 'add' ? 'addToSet' : 'removeFromSet', {NAME_OR_OBJ: recv(), VALUE: encoded(item)}, expression);
        }
        case 'flat': {
            const args = need(expression, method, [0, 1]);
            return block('flat', {NAME_OR_OBJ: recv(), DEPTH: args.length ? value(args[0]) : 1}, expression);
        }
        case 'splitToObj': {
            const [pair, entry] = need(expression, method, 2);
            return block('splitToObj', {STR: recv(), CH1: value(pair), CH2: value(entry)}, expression);
        }
        case 'joinObj': {
            const [pair, entry] = need(expression, method, 2);
            return block('joinObj', {OBJ: recv(), CH1: value(pair), CH2: value(entry)}, expression);
        }
        case 'findByProp':
        case 'findIndexByProp': {
            const [key, item] = need(expression, method, 2);
            return block('findByProp', {NAME_OR_OBJ: recv(), KEY: value(key), VALUE: encoded(item),
                MENU: method === 'findByProp' ? 'value' : 'idx'}, expression);
        }
        case 'map': {
            const [callback] = need(expression, method, 1);
            return block('mapList', {NAME_OR_OBJ: recv(), EXP: encodeBody(callbackOf(callback, method, '(item, index) => expression'), callback)},
                expression);
        }
        case 'reduce': {
            const [callback, initial] = need(expression, method, 2);
            return block('reduceList', {NAME_OR_OBJ: recv(), ACC0: encoded(initial),
                EXP: encodeBody(callbackOf(callback, method, '(acc, item, index) => expression, initial'), callback)}, expression);
        }
        case 'some':
        case 'every': {
            const [callback] = need(expression, method, 1);
            return block('someAll', {TYPE: SOME_METHODS[method], NAME_OR_OBJ: recv(),
                CONDITION: callbackOf(callback, method, '(item, index) => condition')}, expression);
        }
        case 'sort': {
            const [callback] = need(expression, method, 1);
            return block('sortListByRule', {NAME_OR_OBJ: recv(), EXP: callbackOf(callback, method, '(a, b) => number')}, expression);
        }
        default: {
            const [callback] = need(expression, method, 1);
            const {menu, type} = FIND_METHODS[method];
            return block('findInList', {MENU: menu, TYPE: type, NAME_OR_OBJ: recv(),
                CONDITION: callbackOf(callback, method, '(item, index) => condition')}, expression);
        }
        }
    };

    const methodCall = (expression: AstNode, receiver: AstNode, method: string): Call | null => {
        const known = method in PUSH_METHODS || method in LIST_OP_METHODS || method in SORT_BY_METHODS || method in MERGE_METHODS ||
            ['insert', 'indexOf', 'lastIndexOf', 'nthIndexOf', 'pop', 'range', 'join', 'split', 'has', 'clear'].includes(method);
        // 集市版的方法：积木在才认；`L.sort(回调)` 是按规则排序，`L.sort()` 仍是升序排序
        const market = method in MARKET_METHODS && has(MARKET_METHODS[method]) &&
            (method !== 'sort' || list(expression.arguments).length > 0);
        if (!(known || market) || !has('getPropOfObject')) return null;
        // 字符串字面量只有 split / join 的参数位置是文字；其他方法的接收者必须是对象
        const literal = isStringLiteral(receiver);
        if (literal && method !== 'split' && method !== 'splitToObj') {
            return fail(receiver, 'E_MDT_RECEIVER', 'A string literal here would be read as the name of a temporary data entry',
                `use store.get("name").${method}(...) or the block form ${prefix}.xxx(...)`);
        }
        if (market) return marketCall(expression, receiver, method);
        const recv = (): Value => value(receiver);
        if (method in PUSH_METHODS) {
            const [item] = need(expression, method, 1);
            // 路径写在接收者上：o.a.b.push(v) → 对象 o、路径 a、b；没加括号的成员链才折进路径
            const {root, segments} = chain(receiver);
            return block('addItemToList2', {NAME_OR_OBJ: rootValue(root), OP: PUSH_METHODS[method],
                VALUE: encoded(item), ...pathArgs(segments, [])}, expression);
        }
        if (method in LIST_OP_METHODS) {
            need(expression, method, 0);
            return block('opList', {NAME_OR_OBJ: recv(), OP: LIST_OP_METHODS[method]}, expression);
        }
        if (method in SORT_BY_METHODS) {
            const [property] = need(expression, method, 1);
            return block('sortListByProp', {NAME_OR_OBJ: recv(), PROP: value(property), OP: SORT_BY_METHODS[method]}, expression);
        }
        if (method in MERGE_METHODS) {
            const [other] = need(expression, method, 1);
            return block('mergeList', {OP: MERGE_METHODS[method], LIST1: recv(), LIST2: value(other)}, expression);
        }
        switch (method) {
        case 'insert': {
            const [index, item] = need(expression, method, 2);
            const position = value(index);
            api.zeroIndex(position, index);
            return block('insertItemIntoList', {NAME_OR_OBJ: recv(), IDX: position, VALUE: encoded(item)}, expression);
        }
        case 'indexOf': {
            const args = need(expression, method, [1, 2]);
            if (args.length === 2) {
                return fail(expression, 'E_MDT_INDEXOF', 'indexOf(v) takes the value only: the second argument of the block is a count, not a start index',
                    'indexOf(v) finds the first match, lastIndexOf(v) the last, nthIndexOf(v, n) the n-th (negative n counts from the end)');
            }
            return block('indexOf', {NAME_OR_OBJ: recv(), VALUE: value(args[0]), N: 1}, expression);
        }
        case 'lastIndexOf': {
            const [item] = need(expression, method, 1);
            return block('indexOf', {NAME_OR_OBJ: recv(), VALUE: value(item), N: -1}, expression);
        }
        case 'nthIndexOf': {
            const [item, nth] = need(expression, method, 2);
            const count = value(nth);
            if (count === 0) {
                warn(nth, 'W_MDT_INDEXOF_ZERO', 'nthIndexOf(v, 0) always returns the first position, whatever the list holds (a quirk of the extension)',
                    'use 1 for the first match, -1 for the last');
            }
            return block('indexOf', {NAME_OR_OBJ: recv(), VALUE: value(item), N: count}, expression);
        }
        case 'pop': {
            const args = need(expression, method, [0, 1]);
            return block('pop', {LIST: recv(), IDX: args.length ? value(args[0]) : -1}, expression);
        }
        case 'range': {
            const [from, to] = need(expression, method, 2);
            return block('slice', {NAME_OR_OBJ: recv(), A: value(from), B: value(to)}, expression);
        }
        case 'join': {
            const [separator] = need(expression, method, 1);
            return block('join', {CH: value(separator), NAME_OR_OBJ: recv()}, expression);
        }
        case 'split': {
            const [separator] = need(expression, method, 1);
            return block('split', {CH: value(separator), STR: recv()}, expression);
        }
        case 'has': {
            const [key] = need(expression, method, 1);
            return block('ifObjectPropExist', {NAME_OR_OBJ: recv(), PROP: value(key)}, expression);
        }
        default: {
            need(expression, method, 0);
            return block('clear', {NAME: recv()}, expression);
        }
        }
    };

    const globalCall = (expression: AstNode, name: string): Call | null => {
        if (!(name in GLOBAL_FUNCTIONS)) return null;
        // 集市版才有的函数：积木不在就不认（按普通的裸调用报「不认识」）
        if (name in MARKET_FUNCTIONS && !has(MARKET_FUNCTIONS[name])) return null;
        // isSet 要 checkType 的类型菜单里有 set 这一项（线上版没有）
        const typeOptions = (api.schema[`${prefix}_checkType`] as {fields?: Record<string, {options?: string[]}>} | undefined)?.fields?.TYPE?.options;
        if (name === 'isSet' && !typeOptions?.includes('set')) return null;
        const args = need(expression, name, name === 'merge' ? [2, 64] : name === 'jsonPath' ? [2, 3] : GLOBAL_FUNCTIONS[name]);
        const [first, second] = args;
        // 这些函数的第一个参数是对象 / 列表：Scratch 列表放进去会静默得到空结果
        if (!['list', 'same', 'equivalent'].includes(name)) notScratchList(first, `${name}(@)`);
        if (name === 'merge') args.forEach(item => notScratchList(item, 'merge(@, …)'));
        switch (name) {
        case 'equivalent': return block('equivalent', {A: encoded(first), B: encoded(second)}, expression);
        case 'getPath': return block('getPropByPath', {OBJ: value(first), PATH: value(second)}, expression);
        case 'jsonPath': {
            const kind = args.length > 2 ? value(args[2]) : JSON_PATH_DEFAULT;
            if (typeof kind !== 'string') return fail(args[2], 'E_JS_EXPR', 'jsonPath(o, path, type) takes the result type as a string: "value", "path", "pointer", "parent", "parentProperty" or "all"');
            return block('getByJsonPath', {OBJ: value(first), PATH: value(second), TYPE: kind}, expression);
        }
        case 'merge': {
            const extra: Record<string, Value> = {};
            args.slice(2).forEach((item, index) => { extra[`${DYNAMIC}${index + 1}`] = value(item); });
            return block('merge', {A: value(first), B: value(second), ...extra}, expression);
        }
        case 'size': return block('sizeOfObject', {NAME_OR_OBJ: value(first)}, expression);
        case 'clone': return block('copyFrom', {OP: 'shallow', OBJ: value(first)}, expression);
        case 'structuredClone': return block('copyFrom', {OP: 'deep', OBJ: value(first)}, expression);
        case 'same': return block('strictlyEqual', {A: encoded(first), B: encoded(second)}, expression);
        case 'list': {
            // list(n, (index) => 表达式)：集市版的「创建列表：长度 n，第 index 项 = 表达式」
            if (unparen(second).type === 'ArrowFunctionExpression') {
                if (!has('listFrom')) return fail(second, 'E_JS_EXPR', 'list(n, callback) needs the market version of the extension (listFrom)');
                if (unparen(first).type === 'ArrayExpression') return fail(first, 'E_JS_EXPR', 'list(n, (index) => expression) takes one length');
                return block('listFrom', {N: value(first), ITEM: encodeBody(callbackOf(second, 'list', '(index) => expression'), second)}, expression);
            }
            // list(n, v) 一维；list([n, m], v) n 行 m 列……（多出来的长度是动态参数）
            const dimensions = unparen(first).type === 'ArrayExpression' ? list(unparen(first).elements) : [first];
            if (!dimensions.length || dimensions.some(item => !item || item.type === 'SpreadElement')) {
                fail(first, 'E_JS_EXPR', 'list([n, m, ...], value) needs at least one length');
            }
            const args2: Record<string, Value> = {N: value(dimensions[0]), VALUE: encoded(second)};
            dimensions.slice(1).forEach((dimension, index) => { args2[`${DYNAMIC}${index + 1}`] = value(dimension); });
            return block('createListWithLength', args2, expression);
        }
        case 'pick': return block('getSubObject', {OBJ: value(first), TYPE: 'obj', KEYS: value(second)}, expression);
        case 'pickValues': return block('getSubObject', {OBJ: value(first), TYPE: 'v', KEYS: value(second)}, expression);
        case 'keyAt': return block('getPropOfObjectByIdx', {NAME_OR_OBJ: value(first), IDX: value(second), OPTION: 'name'}, expression);
        case 'valueAt': return block('getPropOfObjectByIdx', {NAME_OR_OBJ: value(first), IDX: value(second), OPTION: 'value'}, expression);
        default: return block('checkType', {VALUE: encoded(first), TYPE: TYPE_FUNCTIONS[name]}, expression);
        }
    };

    const namespaceCall = (expression: AstNode, space: string, method: string): Call | null => {
        if (space === 'JSON') {
            if (method === 'parse') return block('getObjFromJson', {VALUE: value(need(expression, 'JSON.parse', 1)[0])}, expression);
            if (method === 'stringify') {
                const [subject] = need(expression, 'JSON.stringify', 1);
                notScratchList(subject, 'JSON.stringify(@)');
                return block('JSONOf', {VALUE: encoded(subject)}, expression);
            }
            return fail(expression, 'E_JS_EXPR', `JSON.${method} is not supported`, 'supported: JSON.parse(text), JSON.stringify(value)');
        }
        if (space === 'Object') {
            if (method in OBJECT_STATICS) {
                const [subject] = need(expression, `Object.${method}`, 1);
                notScratchList(subject, `Object.${method}(@)`);
                return block('getAllProperties', {NAME_OR_OBJ: value(subject), OPTION: OBJECT_STATICS[method]}, expression);
            }
            if (method === 'assign') {
                const [target, source] = need(expression, 'Object.assign', 2);
                notScratchList(target, 'Object.assign(@, …)');
                notScratchList(source, 'Object.assign(…, @)');
                return block('mergeObject', {NAME_OR_OBJ: value(target), OBJ: value(source)}, expression);
            }
            return fail(expression, 'E_JS_EXPR', `Object.${method} is not supported`,
                'supported: Object.keys / values / entries (o), Object.assign(target, source)');
        }
        if (space === 'Set') {
            if (!has('mergeSet') || !(method in SET_OPS)) {
                return fail(expression, 'E_JS_EXPR', `Set.${method} is not supported`,
                    has('mergeSet') ? 'supported: Set.union(a, b), Set.intersection(a, b), Set.difference(a, b)' :
                        'sets need the market version of the extension (test.moreDataTypes)');
            }
            const [first, second] = need(expression, `Set.${method}`, 2);
            return block('mergeSet', {OP: SET_OPS[method], LIST1: value(first), LIST2: value(second)}, expression);
        }
        if (space === 'Array') {
            if (method === 'isArray') {
                const [subject] = need(expression, 'Array.isArray', 1);
                notScratchList(subject, 'Array.isArray(@)');
                return block('checkType', {VALUE: encoded(subject), TYPE: 'list'}, expression);
            }
            return fail(expression, 'E_JS_EXPR', `Array.${method} is not supported`, 'supported: Array.isArray(x)');
        }
        if (space === 'store') {
            if (!(STORE_METHODS as readonly string[]).includes(method)) {
                return fail(expression, 'E_JS_EXPR', `store.${method} is not supported`,
                    `supported: store.${STORE_METHODS.join(' / ')}`);
            }
            const args = (count: number | [number, number]): AstNode[] => need(expression, `store.${method}`, count);
            switch (method) {
            case 'set': {
                const [name, item] = args(2);
                return block('setTempData', {NAME: value(name), OP: 'set', VALUE: encoded(item)}, expression);
            }
            case 'add': {
                const [name, item] = args(2);
                return block('setTempData', {NAME: value(name), OP: 'add', VALUE: value(item)}, expression);
            }
            case 'get': return block('getTempData', {NAME: value(args(1)[0])}, expression);
            case 'has': return block('ifTempDataExist', {NAME: value(args(1)[0])}, expression);
            case 'delete': return block('delTempData', {NAME: value(args(1)[0])}, expression);
            case 'clear': args(0); return block('deleteAllTempData', {}, expression);
            default: args(0); return block('listAllData', {}, expression);
            }
        }
        // ads
        const config = CONFIG_COMMANDS[method];
        if (!config || !has(config.suffix)) {
            return fail(expression, 'E_JS_EXPR', `ads.${method} is not supported`,
                `supported: ${Object.keys(CONFIG_COMMANDS).map(item => `ads.${item}(...)`).join(', ')}`);
        }
        const [setting] = need(expression, `ads.${method}`, 1);
        const mode = flag(setting, value(setting), config.kind);
        if (config.kind === 'index') api.setIndexStart(mode === '0');
        return block(config.suffix, {[config.input]: mode}, expression);
    };

    /** `new Set()`、`new Set([a, b])`（getNewSet）、`new Set(x)`（toSet：列表 / 集合转集合） */
    const newExpression = (expression: AstNode): Call | null => {
        const callee = unparen(node(expression.callee));
        if (callee.type !== 'Identifier' || callee.name !== 'Set' || !ownsNamespace('Set')) return null;
        if (!has('getNewSet')) {
            return fail(expression, 'E_JS_EXPR', 'new Set(...) needs the market version of the extension (test.moreDataTypes)');
        }
        const args = need(expression, 'new Set', [0, 1]);
        if (!args.length) return block('getNewSet', {}, expression);
        const [source] = args;
        // 没加括号的数组字面量才是集合字面量；new Set(([1, 2])) 多套了括号，是把这个列表转成集合（toSet）
        if (source.type !== 'ArrayExpression') return block('toSet', {VALUE: value(source)}, expression);
        const items: Record<string, Value> = {};
        list(source.elements).forEach((element, index) => {
            if (!element || element.type === 'SpreadElement') {
                fail(element ?? source, 'E_JS_EXPR', element ? 'Spread in a Set literal is not supported' : 'Holes in a Set literal are not supported');
            }
            items[`${DYNAMIC}${index + 1}`] = encoded(element);
        });
        return block('getNewSet', items, expression);
    };

    /** `ns.method(...)` 是不是这个糖命名空间里的函数 */
    const isNamespaceFunction = (space: string, method: string): boolean => {
        switch (space) {
        case 'store': return (STORE_METHODS as readonly string[]).includes(method);
        case 'ads': return method in CONFIG_COMMANDS;
        case 'JSON': return method === 'parse' || method === 'stringify';
        case 'Object': return method in OBJECT_STATICS || method === 'assign';
        case 'Array': return method === 'isArray';
        case 'Set': return method in SET_OPS;
        default: return false;
        }
    };
    /** 命名空间函数对应的块式写法（积木名，不含扩展 id 前缀） */
    const blockFormOf = (space: string, method: string): string | null => {
        const table: Record<string, string> = space === 'store' ?
            {set: 'setTempData', add: 'setTempData', get: 'getTempData', has: 'ifTempDataExist', delete: 'delTempData',
                clear: 'deleteAllTempData', names: 'listAllData'} :
            space === 'ads' ? Object.fromEntries(Object.entries(CONFIG_COMMANDS).map(([name, item]) => [name, item.suffix])) :
                space === 'JSON' ? {parse: 'getObjFromJson', stringify: 'JSONOf'} :
                    space === 'Object' ? {keys: 'getAllProperties', values: 'getAllProperties', entries: 'getAllProperties', assign: 'mergeObject'} :
                        space === 'Array' ? {isArray: 'checkType'} : space === 'Set' ? {union: 'mergeSet', intersection: 'mergeSet', difference: 'mergeSet'} : {};
        return Object.prototype.hasOwnProperty.call(table, method) ? table[method] : null;
    };

    const call = (expression: AstNode): Call | null => {
        const callee = unparen(node(expression.callee));
        if (callee.type === 'Identifier') return globalCall(expression, String(callee.name));
        if (callee.type !== 'MemberExpression' || callee.computed || callee.optional) return null;
        const method = String(node(callee.property).name);
        const owner = node(callee.object);
        const inner = unparen(owner);
        if (inner.type === 'Identifier') {
            const name = String(inner.name);
            if (ownsNamespace(name) && !(`${name}_${method}` in api.schema)) return namespaceCall(expression, name, method);
            // 分类名（motion、looks……、扩展 id）：积木调用，不是对象方法；变量 / 形参 / 没见过的名字才是接收者
            if (api.namespaces.has(name) && !api.isBound(name)) return null;
            if (name === 'call' || name === 'when' || name === 'Math') return null;
        }
        // Scratch 列表的方法（push / insert / remove / clear / indexOf）是原来的写法
        if (listOf(owner) && ['push', 'insert', 'remove', 'clear', 'includes', 'indexOf'].includes(method)) return null;
        if (method === 'includes') return null;
        // 其余的糖方法（sort / join / pop / range / has ……）在 Scratch 列表上会静默失效：直接报错
        if (listOf(owner) && SUGAR_METHOD_NAMES.has(method) && PROTOTYPE_METHODS[method] === undefined) {
            notScratchList(owner, `@.${method}(...)`);
        }
        const prototypeHint = PROTOTYPE_METHODS[method];
        if (prototypeHint !== undefined) {
            return fail(expression, 'E_JS_EXPR', `${method}() is not a method of objects and lists in the data-structure sugar`, prototypeHint);
        }
        const made = methodCall(expression, owner, method);
        // `store.set(...)`：store 同时是变量（文件里声明的，或项目里本来就有的），按变量的方法读，而变量上没有 set
        if (made === null && inner.type === 'Identifier' && isNamespaceFunction(String(inner.name), method) && api.isBound(String(inner.name))) {
            const name = String(inner.name);
            const blockForm = blockFormOf(name, method);
            fail(expression, 'E_MDT_SHADOWED', `${name} is also a variable here, so ${name}.${method}(...) is read as a method of that variable, not as the ${name} helper`,
                `rename the variable (a variable named ${name} hides the ${name} helper)${blockForm ? `, or write the block form ${prefix}.${blockForm}(...)` : ''}`);
        }
        return made;
    };

    // ───── 其他表达式 / 语句 ─────
    const typeofOf = (expression: AstNode): Value => {
        notScratchList(node(expression.argument), 'typeof @');
        return block('typeOf', {VALUE: encoded(node(expression.argument))}, expression);
    };
    const inOperator = (expression: AstNode): Value => {
        notScratchList(node(expression.right), '"k" in @');
        return block('ifObjectPropExist', {NAME_OR_OBJ: rootValue(node(expression.right)), PROP: value(node(expression.left))}, expression);
    };

    const assignment = (expression: AstNode): Call | null => {
        const left = unparen(node(expression.left));
        if (left.type !== 'MemberExpression' || left.optional) return null;
        if (!left.computed && String(node(left.property).name) === 'length') return null;
        if (listOf(node(left.object)) && left.computed) return null;
        const operator = String(expression.operator);
        const {root, segments} = chain(left);
        if (!segments.length) return null;
        const right = node(expression.right);
        const target = (): Record<string, Value> => ({NAME_OR_OBJ: rootValue(root), ...pathArgs(segments, ['PROP'])});
        if (operator === '=') return block('setPropOfObject', {...target(), OP: 'set', VALUE: encoded(right)}, expression);
        if (operator !== '+=' && operator !== '-=') {
            return fail(expression, 'E_JS_EXPR', `${operator} is not supported on object properties`,
                `write o.k = o.k ${operator.slice(0, -1)} v`);
        }
        const amount = value(right);
        if (typeof amount === 'string' || (!!amount && typeof amount === 'object' && !Array.isArray(amount) && 'opcode' in amount &&
            amount.opcode === 'operator_join')) {
            fail(expression, 'E_MDT_ADD_TEXT', `${operator} on an object property adds numbers; it does not join text`,
                'build the text explicitly: o.k = `${o.k}text`');
        }
        const delta: Value = operator === '-=' ? (typeof amount === 'number' ? (amount === 0 ? 0 : -amount) :
            mk('operator_subtract', [0, amount], expression)) : amount;
        return block('setPropOfObject', {...target(), OP: 'add', VALUE: delta}, expression);
    };
    const update = (expression: AstNode): Call | null => {
        const argument = unparen(node(expression.argument));
        if (argument.type !== 'MemberExpression') return null;
        if (!argument.computed && String(node(argument.property).name) === 'length') return null;
        if (listOf(node(argument.object)) && argument.computed) return null;
        const {root, segments} = chain(argument);
        if (!segments.length) return null;
        return block('setPropOfObject', {NAME_OR_OBJ: rootValue(root), ...pathArgs(segments, ['PROP']), OP: 'add',
            VALUE: expression.operator === '++' ? 1 : -1}, expression);
    };
    /** delete o.a.b → 删除「o.a」的属性 b；列表按下标删（和 JS 不同：后面的项会前移） */
    const deleteStatement = (expression: AstNode): Call | null => {
        const argument = unparen(node(expression.argument));
        if (argument.type !== 'MemberExpression' || argument.optional) {
            return fail(expression, 'E_JS_EXPR', 'delete takes a property: delete o.k or delete o[k]');
        }
        const owner = node(argument.object);
        const computed = !!argument.computed;
        const property = node(argument.property);
        notScratchList(owner, 'delete @[…]');
        const key: Value = computed ? value(property) : String(property.name);
        // 所有者：没加括号的成员链折成 getPropOfObject，否则就是它本身
        const receiver = owner.type === 'MemberExpression' ? value(owner) : rootValue(owner);
        return block('delPropOfObject', {NAME_OR_OBJ: receiver, PROP: key}, expression);
    };
    /** `==` / `!=` 的两边：null 编不了；对象 / 列表字面量按 JSON 文字比，提醒用 same() */
    const nullCompare = (expression: AstNode): void => {
        for (const side of [node(expression.left), node(expression.right)]) {
            const inner = unparen(side);
            if (inner.type === 'ObjectExpression' || inner.type === 'ArrayExpression') {
                warn(expression, 'W_MDT_EQ', '== compares objects and lists as JSON text (ignoring letter case), not by identity',
                    'same(a, b) tests whether two values are the very same object');
            }
            if (inner.type === 'Literal' && inner.value === null) {
                fail(expression, 'E_MDT_NULL', 'null cannot be compared: a missing property or null reads as "" in Scratch',
                    'write o.k == "" for "missing or empty", or !("k" in o) / !o.has("k") for "no such property"');
            }
        }
    };
    const lengthWarning = (expression: AstNode): void => {
        const owner = node(expression.object);
        const inner = unparen(owner);
        // 只对明确的对象 / 列表接收者报：字面量、糖产出对象的调用。`o.name.length` 这样的路径没有类型信息（可能是字符串），不报
        if (listOf(owner) || isStringLiteral(owner) || !(inner.type === 'ArrayExpression' || inner.type === 'ObjectExpression' ||
            (inner.type === 'CallExpression' && objectCall(inner)))) return;
        warn(expression, 'W_MDT_LENGTH', '.length here is the length of the value as text (a list or object is its JSON text), not its number of items',
            'use size(x) for the number of items of a list or object, or `${x}`.length for text length');
    };

    return {prefix, ownsNamespace, member, object, array, call, newExpression, typeofOf, inOperator, assignment, update, deleteStatement,
        nullCompare, lengthWarning, guardList: notScratchList};
};

