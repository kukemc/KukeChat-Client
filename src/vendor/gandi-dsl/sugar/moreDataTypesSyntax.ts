/**
 * 「高级数据结构」的 JavaScript 糖：语法表。解析（moreDataTypesParse.ts）和打印（moreDataTypesPrint.ts）共用这一张表，
 * 写法一改两边一起变，打印出来的文字才一定编得回同一棵积木。
 *
 * 约定见 docs/features/more-data-types-dsl.md。每条糖都是「积木 ⇄ 文字」双向无损：打印器只在积木正好是这条糖编出来的
 * 形状时才写糖，其余（手拖出来的、输入框里敲了文字的、带 mutation 差异的）一律写块式 `moreDataTypes.xxx(...)`。
 */

import {dict} from '../safe';

/*
 * 下面所有「名字 → 积木」的表都是无原型字典：键常来自用户文字（`o.constructor(1)`、`toString(1)`）或积木字段值（`constructor`），
 * 普通对象会把 Object.prototype 上的名字当成命中。
 */

/** 列表方法 → addItemToList2 的 OP 字段 */
export const PUSH_METHODS: Record<string, string> = dict({push: 'add', pushUnique: 'addIfNotExists', removeValue: 'remove'});
/** 列表方法 → opList 的 OP 字段 */
export const LIST_OP_METHODS: Record<string, string> = dict({sort: 'asc', sortDesc: 'desc', reverse: 'rev', shuffle: 'shuf',
    dedupe: 'dedup'});
/** 列表方法 → sortListByProp 的 OP 字段 */
export const SORT_BY_METHODS: Record<string, string> = dict({sortBy: 'asc', sortByDesc: 'desc'});
/** 列表方法 → mergeList 的 OP 字段 */
export const MERGE_METHODS: Record<string, string> = dict({concat: 'merge', union: 'union', intersection: 'intersec',
    difference: 'diff'});
/** Object.keys / values / entries → getAllProperties 的 OPTION 字段 */
export const OBJECT_STATICS: Record<string, string> = dict({keys: 'keys', values: 'values', entries: 'entries'});
/** 判断类型的函数 → checkType 的 TYPE 字段 */
export const TYPE_FUNCTIONS: Record<string, string> = dict({isObject: 'obj', isObjectOrList: 'lOrO', isSet: 'set'});
/** ads.xxx(…) 配置命令 → 积木 opcode 和它的参数名 */
export const CONFIG_COMMANDS: Record<string, {suffix: string; input: string; kind: 'bool' | 'index'}> = dict({
    autoCreate: {suffix: 'setAutoCreate', input: 'ON', kind: 'bool'},
    allowJSON: {suffix: 'allowInputJSON', input: 'ON', kind: 'bool'},
    showPrefix: {suffix: 'setShowPrefix', input: 'ON', kind: 'bool'},
    caseSensitive: {suffix: 'setCase', input: 'ON', kind: 'bool'},
    indexStart: {suffix: 'indexStart', input: 'IDX', kind: 'index'},
    negativeIndex: {suffix: 'allowNegIdx', input: 'ON', kind: 'bool'}
});
/** store.xxx(…)：临时数据 */
export const STORE_METHODS = ['set', 'add', 'get', 'has', 'delete', 'clear', 'names'] as const;

/** 集市版：`Set.union(a, b)` 等 → mergeSet 的 OP 字段（和列表的 a.union(b) 是两块积木，写法不同才分得开） */
export const SET_OPS: Record<string, string> = dict({union: 'union', intersection: 'intersec', difference: 'diff'});
/** 集市版：回调方法 → someAll 的 TYPE 字段（some / every） */
export const SOME_METHODS: Record<string, string> = dict({some: 'some', every: 'all'});
/** 集市版：回调方法 → findInList 的 MENU（取值还是取位置）和 TYPE（第一个 f / 最后一个 l / 全部 all） */
export const FIND_METHODS: Record<string, {menu: 'value' | 'idx'; type: 'f' | 'l' | 'all'}> = dict({
    find: {menu: 'value', type: 'f'}, findLast: {menu: 'value', type: 'l'}, filter: {menu: 'value', type: 'all'},
    findIndex: {menu: 'idx', type: 'f'}, findLastIndex: {menu: 'idx', type: 'l'}, findIndexes: {menu: 'idx', type: 'all'}});
/** 集市版：按属性找 → findByProp 的 MENU */
export const FIND_PROP_METHODS: Record<string, string> = dict({findByProp: 'value', findIndexByProp: 'idx'});
/** 集市版：这些方法带回调（箭头函数），回调体是表达式 */
export const CALLBACK_METHODS = ['map', 'reduce', 'some', 'every', 'sort', ...Object.keys(FIND_METHODS)];
/** 集市版：其余只在集市版有的方法（积木在才认） → 积木 */
export const MARKET_METHODS: Record<string, string> = dict({add: 'addToSet', delete: 'removeFromSet', flat: 'flat', splitToObj: 'splitToObj',
    joinObj: 'joinObj', map: 'mapList', reduce: 'reduceList', some: 'someAll', every: 'someAll', sort: 'sortListByRule',
    findByProp: 'findByProp', findIndexByProp: 'findByProp', ...Object.fromEntries(Object.keys(FIND_METHODS).map(name => [name, 'findInList']))});

/** JavaScript 对象自带的方法名：对象 / 列表积木上没有，读到时给出能写的路（而不是报「不存在的积木 o_toString」） */
export const PROTOTYPE_METHODS: Record<string, string> = dict({
    hasOwnProperty: 'use o.has("k") (or "k" in o) to test for a property',
    propertyIsEnumerable: 'use o.has("k") (or "k" in o) to test for a property',
    isPrototypeOf: 'objects here have no prototype chain; compare with same(a, b) or equivalent(a, b)',
    toString: 'use JSON.stringify(o) for the JSON text, or a template `${o}`',
    toLocaleString: 'use JSON.stringify(o) for the JSON text, or a template `${o}`',
    valueOf: 'write the variable itself: o',
    constructor: 'objects and lists are made with {} / [] / list(n, v) / clone(o); typeof o names the kind'
});

/** 全局函数（标识符调用）：函数名 → 参数个数（`merge`、`jsonPath` 的参数个数有范围，见解析器） */
export const GLOBAL_FUNCTIONS: Record<string, number> = dict({size: 1, clone: 1, structuredClone: 1, same: 2, list: 2, pick: 2,
    pickValues: 2, keyAt: 2, valueAt: 2, isObject: 1, isObjectOrList: 1, isSet: 1, equivalent: 2, getPath: 2, jsonPath: 3, merge: 2});
/** 只在集市版有的全局函数 → 需要的积木 */
export const MARKET_FUNCTIONS: Record<string, string> = dict({isSet: 'checkType', equivalent: 'equivalent', getPath: 'getPropByPath',
    jsonPath: 'getByJsonPath', merge: 'merge'});
/** getByJsonPath 的 TYPE 默认值 */
export const JSON_PATH_DEFAULT = 'value';
/** 对象 / 列表 / 集合上的糖方法名（含集市版的）：作品里没有「高级数据结构」时，已声明变量上的这些调用说明缺的是它 */
export const SUGAR_METHOD_NAMES: ReadonlySet<string> = new Set([...Object.keys(PUSH_METHODS), ...Object.keys(LIST_OP_METHODS),
    ...Object.keys(SORT_BY_METHODS), ...Object.keys(MERGE_METHODS), ...Object.keys(MARKET_METHODS), 'insert', 'indexOf', 'lastIndexOf',
    'nthIndexOf', 'pop', 'range', 'join', 'split', 'has', 'clear', ...Object.keys(PROTOTYPE_METHODS)]);
/** 缺「高级数据结构」时的修法：线上版 id 和集市版 id */
export const DATA_STRUCTURES_FIX = 'Install the data-structure extension first: add_extension({extensionId: "moreDataTypes"}) ' +
    '(CLI: gandi install moreDataTypes; the community preview with sets and for...of is "test.moreDataTypes"), ' +
    'then write this page again';
/** 这些名字在 DSL 里有语法含义：变量不能占用（打印器给同名变量加数字后缀） */
export const SUGAR_NAMESPACES = ['store', 'ads', 'Object', 'JSON', 'Array', 'Set'];

/** 值放进对象 / 列表时，数字字面量要先变成数字：Scratch 的输入框里敲的 5 是文字 "5"，JSON 里是 "5" 不是 5 */
export const isCanonicalNumber = (text: string): boolean =>
    /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(text) && String(Number(text)) === text;

/** JS 标识符（用在 `.name`）：保留字也行，但 `length` 在 DSL 里是字符串长度，不当属性名 */
export const isPropertyName = (text: string): boolean => /^[A-Za-z_$][\w$]*$/.test(text) && text !== 'length';

/**
 * 整数样的键（`"0"`、`"12"`）：静态 JSON 字面量不收，走 getNewObject 保住**积木里**的书写顺序。
 * 运行时顺序保不住：JS 引擎会把整数样的键提到对象最前面（`{"2": .., "1": ..}` 用起来是 `{"1": .., "2": ..}`），这不归 DSL 管。
 */
export const isIntegerKey = (text: string): boolean => /^(?:0|[1-9]\d*)$/.test(text);

/** 对象字面量的键能不能进静态 JSON：不是整数样、不是 __proto__ */
export const isStaticKey = (text: string): boolean => !isIntegerKey(text) && text !== '__proto__';

/** 帮助里每块积木的 JS 糖示例（opcode 不含扩展 id）；和 docs/features/more-data-types-dsl.md 的速查表一致 */
export const SUGAR_EXAMPLES: Record<string, string> = dict({
    getNewObject: 'o = {};', getNewList: 'L = [];', createListWithLength: 'L = list([3, 4], 0);',
    getObjFromJson: 'o = JSON.parse(text);', JSONOf: 'text = JSON.stringify(o);', copyFrom: 'c = structuredClone(o);',
    getPropOfObject: 'x = o.a.b[1];', setPropOfObject: 'o.a.b = 5;  // o.n += 1; o.n++;', delPropOfObject: 'delete o.a;',
    sizeOfObject: 'n = size(o);', ifObjectPropExist: 'if (o.has("k")) {}  // "k" in o', getAllProperties: 'ks = Object.keys(o);',
    getPropOfObjectByIdx: 'k = keyAt(o, 1);  // valueAt(o, 1)', getSubObject: 'p = pick(o, ["a", "b"]);', clear: 'o.clear();',
    mergeObject: 'Object.assign(o, other);', typeOf: 't = typeof o;', checkType: 'if (Array.isArray(o)) {}  // isObject(o), isObjectOrList(o)',
    strictlyEqual: 'if (same(a, b)) {}', addItemToList2: 'o.items.push(5);  // pushUnique(v), removeValue(v)',
    insertItemIntoList: 'L.insert(1, "x");', indexOf: 'i = L.indexOf(v);  // lastIndexOf(v), nthIndexOf(v, 2)', pop: 'v = L.pop();  // L.pop(2)',
    slice: 's = L.range(2, 4);', join: 's = L.join(",");', split: 'parts = text.split(",");', mergeList: 'c = a.concat(b);  // union, intersection, difference',
    opList: 'L.sort();  // sortDesc, reverse, shuffle, dedupe', sortListByProp: 'L.sortBy("score");  // sortByDesc',
    setTempData: 'store.set("k", 1);  // store.add("k", 1)', getTempData: 'v = store.get("k");', ifTempDataExist: 'if (store.has("k")) {}',
    delTempData: 'store.delete("k");', deleteAllTempData: 'store.clear();', listAllData: 's = store.names();',
    setAutoCreate: 'ads.autoCreate(true);', indexStart: 'ads.indexStart(1);', allowInputJSON: 'ads.allowJSON(false);',
    setShowPrefix: 'ads.showPrefix(false);', setCase: 'ads.caseSensitive(true);'
});

/** 集市版（test.moreDataTypes）多出来的积木的 JS 糖示例（opcode 不含扩展 id）；只在积木存在的 schema 里编得过 */
export const MARKET_SUGAR_EXAMPLES: Record<string, string> = dict({
    getNewSet: 'o = new Set([1, 2]);', toSet: 'o = new Set(L);  // new Set(([1, 2])) when the source is a list literal',
    mergeSet: 'o = Set.union(a, b);  // Set.intersection, Set.difference', addToSet: 'o.add(5);', removeFromSet: 'o.delete(5);',
    equivalent: 'if (equivalent(a, b)) {}', flat: 'r = o.flat(1);', findByProp: 'r = L.findByProp("name", "a");  // findIndexByProp',
    splitToObj: 'o = "a=1,b=2".splitToObj("=", ",");', joinObj: 's = o.joinObj("=", ",");', getPropByPath: 'r = getPath(o, ["a", "b"]);',
    getByJsonPath: 'r = jsonPath(o, "$..price");  // jsonPath(o, path, "path")', merge: 'o = merge(a, b, c);',
    allowNegIdx: 'ads.negativeIndex(true);', listFrom: 'L = list(5, (index) => index * 2);',
    mapList: 'L = o.map((item, index) => item * 2);', reduceList: 'r = o.reduce((acc, item, index) => acc + item, 0);',
    someAll: 'if (o.some((item, index) => item > 1)) {}  // every', findInList: 'r = o.find((item, index) => item > 1);  // findLast, filter, findIndex, findLastIndex, findIndexes',
    sortListByRule: 'o.sort((a, b) => a - b);', forEachWithObj: 'for (const [key, value] of Object.entries(o)) {}  // for (const value of o) {}'
});
