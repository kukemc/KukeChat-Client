/**
 * 查表的安全工具。DSL 里很多键来自用户（标识符、命名参数的键、变量名、积木字段值）：用普通对象按键查表，
 * `constructor` / `__proto__` / `toString` 这些名字会命中 Object.prototype 上的东西，抛 TypeError 或查出错的结果。
 * 公开的 parser / compiler / printer 的约定是「只返回诊断、不抛异常」，所以所有按用户键查的表都走这里。
 */

/** 对象自己有没有这个键（不看原型链） */
export const hasOwn = (object: object | null | undefined, key: string): boolean =>
    !!object && Object.prototype.hasOwnProperty.call(object, key);

/** 只取对象自己的键；没有返回 undefined */
export const own = <T>(object: Record<string, T> | null | undefined, key: string): T | undefined =>
    hasOwn(object, key) ? (object as Record<string, T>)[key] : undefined;

/** 无原型的字典：键是什么都安全（`__proto__` 也只是一个普通键） */
export const dict = <T>(entries: Record<string, T> = {}): Record<string, T> =>
    Object.assign(Object.create(null) as Record<string, T>, entries);

const specCache = new WeakMap<object, unknown>();
/**
 * 积木表（操作码 → 规格）换成安全的查表形式：外层和每个规格的 inputs / fields 都是无原型字典。
 * 按「用户写的参数名」查 `spec.inputs[key]` / `spec.fields[key]` 不会再命中 `constructor` 这类原型上的名字。
 * 规格对象按身份缓存，不会每次编译都全量复制。
 */
export const safeSchema = <T extends {inputs: object; fields: object}>(schema: Record<string, T>): Record<string, T> => {
    const result = dict<T>();
    for (const opcode of Object.keys(schema)) {
        const spec = schema[opcode];
        let safe = specCache.get(spec) as T | undefined;
        if (!safe) {
            safe = {...spec, inputs: dict(spec.inputs as Record<string, unknown>), fields: dict(spec.fields as Record<string, unknown>)};
            specCache.set(spec, safe);
        }
        result[opcode] = safe;
    }
    return result;
};

/**
 * 解析 / 编译允许的嵌套深度（语句嵌套 + 表达式嵌套）。再深的结构递归会撑爆调用栈；超限返回 E_TOO_DEEP 诊断，
 * 不静默丢内容、不抛 RangeError。
 */
export const MAX_DEPTH = 400;
/** 打印允许的嵌套深度：必须明显小于 MAX_DEPTH，打印出来的文字才一定还在解析的上限之内（一层积木嵌套最多折成两层解析嵌套） */
export const PRINT_MAX_DEPTH = 180;
/**
 * 打印时积木树的实际深度上限（语句 / 表达式嵌套，加上模板字符串里 join 链每一段多嵌的一层）。链在文字里是平的，
 * 不占解析深度，但编译时每一段是一层递归；调用栈在 1200 层以上才溢出，留一倍以上余量。
 */
export const PRINT_MAX_TREE_DEPTH = 600;

export const tooDeepMessage = (limit: number): string =>
    `Nesting is too deep (limit ${limit} levels of nested statements and expressions)`;
export const TOO_DEEP_FIX = 'split the long chain into several statements, e.g. keep partial results in a variable';

/** 打印遇到超过 PRINT_MAX_DEPTH 的积木嵌套：明确报错，不截断、不丢积木 */
export class DslTooDeepError extends Error {
    readonly code = 'E_TOO_DEEP';
    constructor(readonly limit: number) {
        super(`${tooDeepMessage(limit)}; this page cannot be written as DSL text`);
        this.name = 'DslTooDeepError';
    }
}

/** 给普通对象写一个自己的键（`__proto__` 也只是个键，普通赋值会被当成改原型而悄悄丢掉） */
export const setOwn = <T>(object: Record<string, T>, key: string, value: T): void => {
    Object.defineProperty(object, key, {value, enumerable: true, writable: true, configurable: true});
};
