/**
 * 社区扩展「高级数据结构」（moreDataTypes，作者 Arkos@CCW）的 DSL 兼容层：积木描述表和扩展检测。
 *
 * 这个扩展不走官方的 `expandable` 机制，而是自己改 Blockly.Blocks（use-expandable-blocks.js）给一部分积木加 ➕➖：
 * 积木上多出来的输入叫 DYNAMIC_ARGS1、DYNAMIC_ARGS2……（从 1 起连续编号，键值成对的积木键是奇数、值是偶数），
 * 槽数记在 mutation 的两个属性里：dynamicargids = `["DYNAMIC_ARGS1",…]`，dynamicargtypes = `["s",…]`（s 文字、
 * n 数字、b 布尔）。动态参数登记在扩展模块里的表里，getInfo() 的结果里只有 `dynamicArgsInfo` 对象（带函数），DSL 侧
 * 取不到，也不该去取，所以这里按 opcode 写一份固定的描述，exportSchema 在 schema 里把它们并成普通的 variadic 组。
 *
 * 描述表对着 E:\scratch\_ref\custom-extension\extensions\Arkos\moreDataTypes\moreDataTypes.js（线上包同源）的
 * getInfo 写：每个积木的 dynamicArgsInfo 里 afterArg（槽插在哪个固定参数后面）、dynamicArgTypes、paramsIncrement。
 */
import type {BlockSpec, Schema, VariadicGroup, VariadicSlot} from '../compiler';
import {dict} from '../safe';

/** 动态参数输入名；编辑器写成 `${DYNAMIC}${n}` */
export const DYNAMIC = 'DYNAMIC_ARGS';

const MAX_DYNAMIC = 1000;

const slot = (type: VariadicSlot['type'], extra: Partial<VariadicSlot> = {}): VariadicSlot => ({
    name: DYNAMIC, kind: 'input', type,
    shadowOpcode: type === 'number' ? 'math_number' : 'text', ...extra
});

const group = (slots: VariadicSlot[], insertAfter?: string): VariadicGroup => ({
    slots, min: 0, max: MAX_DYNAMIC, start: 0, compact: true, ...(insertAfter ? {insertAfter} : {}),
    mutation: {count: 'dynargs'}
});

/**
 * 有动态参数的积木：opcode（不含扩展 id 前缀）→ 可变输入组。
 *  - getNewObject：键、值交错（paramsIncrement 2），没有固定参数；
 *  - getNewList：一串值，没有固定参数；
 *  - createListWithLength：N 之后接多维的长度（数字），`list(3, 0)` 是一维，`list([3, 4], 0)` 是 3 行 4 列；
 *  - getPropOfObject / setPropOfObject：属性路径的后续段，插在 PROP 后面（`o.a.b` 是 PROP = a、DYNAMIC_ARGS1 = b）；
 *  - addItemToList2：到列表的子路径，插在 NAME_OR_OBJ 后面（`o.a.b.push(x)` 是 NAME = o、DYNAMIC_ARGS1 = a、2 = b）；
 *  - getNewSet（集市版）：一串值，没有固定参数，和 getNewList 一样；
 *  - merge（集市版）：A、B 之后接更多要合并的对象 / 列表 / 集合。
 */
export const MDT_VARIADIC: Record<string, VariadicGroup> = dict({
    getNewObject: group([slot('string', {stride: 2, offset: -1}), slot('string', {stride: 2, offset: 0})]),
    getNewList: group([slot('string')]),
    createListWithLength: group([slot('number')], 'N'),
    getPropOfObject: group([slot('string')], 'PROP'),
    setPropOfObject: group([slot('string')], 'PROP'),
    addItemToList2: group([slot('string')], 'NAME_OR_OBJ'),
    getNewSet: group([slot('string')]),
    merge: group([slot('string')], 'B')
});

/**
 * 带回调的积木：opcode → 参数槽的先后。回调的形参按参数槽在 parameters 里的先后绑定（dynamic.ts 的 callbackLayout），
 * 糖的解析和打印都走这一套：`o.map((item, index) => …)`、`o.reduce((acc, item, index) => …, 初值)`、`o.sort((a, b) => …)`、
 * `for (const [key, value] of Object.entries(o))`。parameters 只按扩展 arguments 的键序排（schema.ts），而这个扩展把 IDX
 * 写在 ITEM 前面（reduceList 是 IDX、ITEM、ACC）：照键序绑，`(item, index)` 里的 item 拿到的就是序号。所以这几块的参数槽
 * 在这里钉成糖的先后，糖写法的意思不跟着扩展的键序走。别的参数（NAME_OR_OBJ、ACC0……）不动，仍是键序。
 */
const MDT_CALLBACK_SLOTS: Record<string, string[]> = dict({
    mapList: ['ITEM', 'IDX'],
    reduceList: ['ACC', 'ITEM', 'IDX'],
    someAll: ['ITEM', 'IDX'],
    findInList: ['ITEM', 'IDX'],
    sortListByRule: ['A', 'B'],
    forEachWithObj: ['KEY', 'VALUE']
});

/** 这些积木都在，才认定 schema 里的这个扩展就是「高级数据结构」（不看扩展 id：线上叫 moreDataTypes，开发版叫 test） */
const SIGNATURE = ['getPropOfObject', 'setPropOfObject', 'getNewObject', 'getNewList', 'addItemToList2', 'sizeOfObject'];

const cache = new WeakMap<object, string[]>();

/** schema 里所有「高级数据结构」扩展的 id（操作码前缀）；通常 0 或 1 个 */
export const moreDataTypesIds = (schema: Record<string, unknown>): string[] => {
    const known = cache.get(schema);
    if (known) return known;
    const ids: string[] = [];
    const tail = '_getPropOfObject';
    for (const opcode of Object.keys(schema)) {
        if (!opcode.endsWith(tail)) continue;
        const id = opcode.slice(0, -tail.length);
        if (id && SIGNATURE.every(name => `${id}_${name}` in schema)) ids.push(id);
    }
    cache.set(schema, ids);
    return ids;
};

/**
 * 把动态参数的描述并进 schema（原地改）：exportSchema 末尾调用。已经带 variadic 的积木不动
 * （扩展哪天改走官方 expandable 就以它为准）。带回调的积木顺带把参数槽排成 MDT_CALLBACK_SLOTS 的先后。
 */
export const applyMoreDataTypesSchema = (schema: Schema): Schema => {
    // 缓存按对象身份：并入前先清掉，免得返回过期的检测结果
    cache.delete(schema);
    for (const id of moreDataTypesIds(schema)) {
        for (const [name, groupSpec] of Object.entries(MDT_VARIADIC)) {
            const spec: BlockSpec | undefined = schema[`${id}_${name}`];
            if (spec && !spec.variadic) spec.variadic = [groupSpec];
        }
        for (const [name, slots] of Object.entries(MDT_CALLBACK_SLOTS)) {
            const spec: BlockSpec | undefined = schema[`${id}_${name}`];
            const parameters = spec?.parameters;
            if (!parameters || !slots.every(item => parameters.includes(item))) continue;
            // 参数槽占的那几个位置不变，只把槽名按钉住的先后填回去
            const places = parameters.flatMap((item, index) => slots.includes(item) ? [index] : []);
            places.forEach((place, index) => { parameters[place] = slots[index]; });
        }
    }
    return schema;
};
