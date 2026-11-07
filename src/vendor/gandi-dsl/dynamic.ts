import type {BlockSpec, VariadicGroup, VariadicSlot} from './compiler';
import type {VmBlock} from './blocks';

const maximum = 64;
const input = (name: string, type: VariadicSlot['type'], extra: Partial<VariadicSlot> = {}): VariadicSlot =>
    ({name, kind: 'input', type, ...extra});
const operatorGroup = (prefix: string, type: VariadicSlot['type'] = 'string'): VariadicGroup => ({slots: [input(prefix, type)], min: 2, max: maximum,
    start: 2, firstDynamic: 3, separator: 'OP', mutation: {count: 'items'}});
const broadcastArgs = (): VariadicGroup => ({slots: [input('ARG', 'string', {shadowOpcode: 'text'})], min: 0, max: 16, start: 0,
    compact: true, mutation: {count: 'items', prefix: 'ARG', omitEmpty: true}});
/**
 * 核心里能增减槽的积木，按声明的形状描述（schema 里没带 variadic 时用这份；exportSchema 也往核心积木上填同样的内容）。
 * 编辑器侧的写法：运算类 `items=N`；三元 `items` + `prefix`；if 用 `elif`（elif 口从 SUBSTACK3 起，SUBSTACK2 是 else）。
 */
export const CORE_VARIADIC: Record<string, VariadicGroup[]> = {
    operator_join: [{slots: [input('STRING', 'string')], min: 2, max: maximum, start: 2, firstDynamic: 3,
        mutation: {count: 'items'}}],
    operator_arithmetic: [operatorGroup('NUM')],
    operator_compare: [operatorGroup('OPERAND')],
    operator_logic: [operatorGroup('OPERAND', 'boolean')],
    operator_ternary: [{slots: [input('CONDITION', 'boolean'), input('THEN', 'string')], min: 1, max: maximum,
        start: 1, firstDynamic: 2, insertAfter: 'THEN', mutation: {count: 'items', prefix: 'CONDITION,THEN'}}],
    control_if: [{slots: [input('CONDITION', 'boolean'), {name: 'SUBSTACK', kind: 'branch', type: 'stack', offset: 1}],
        min: 1, max: maximum, start: 1, firstDynamic: 2, insertAfter: 'SUBSTACK',
        grownTail: {name: 'SUBSTACK2', like: 'SUBSTACK'}, mutation: {count: 'elif', extra: {base: 'control_if'}}}],
    control_if_else: [{slots: [input('CONDITION', 'boolean'), {name: 'SUBSTACK', kind: 'branch', type: 'stack', offset: 1}],
        min: 1, max: maximum, start: 1, firstDynamic: 2, insertAfter: 'SUBSTACK',
        grownTail: {name: 'SUBSTACK2', like: 'SUBSTACK'}, mutation: {count: 'elif'}}],
    // 带参数的广播（原版增强）：不带参数时没有 mutation，两边按位置对应
    event_broadcast: [broadcastArgs()],
    event_broadcastandwait: [broadcastArgs()],
    event_whenbroadcastreceived: [{slots: [input('PARAM', 'string', {shadowOpcode: 'ccw_hat_parameter', hatParam: true})],
        min: 0, max: 16, start: 0, compact: true, rename: true, mutation: {count: 'items', prefix: 'PARAM', omitEmpty: true}}]
};

/** 这块积木的可变输入组：schema 上声明的，没有就按核心积木的默认声明 */
export const variadicOf = (opcode: string, spec?: BlockSpec): VariadicGroup[] | null => {
    const groups = spec?.variadic ?? CORE_VARIADIC[opcode];
    return groups?.length ? groups : null;
};

const escapeName = (name: string): string => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const slotName = (slot: VariadicSlot, unit: number): string =>
    `${slot.name}${unit * (slot.stride ?? 1) + (slot.offset ?? 0)}`;
export const firstDynamic = (group: VariadicGroup): number => group.firstDynamic ?? 1;
/** 一组里动态单元的所有槽名（printer / compiler 清理多余的旧输入时用） */
export const groupSlotPattern = (group: VariadicGroup): RegExp => new RegExp(`^(?:${[
    ...group.slots.map(slot => escapeName(slot.name)), ...(group.separator ? [escapeName(group.separator)] : [])
].join('|')})\\d+$`);

const countFromNames = (group: VariadicGroup, names: string[]): number => {
    let count = 0;
    for (const slot of group.slots) {
        const pattern = new RegExp(`^${escapeName(slot.name)}([1-9]\\d*)$`);
        const stride = slot.stride ?? 1;
        for (const key of names) {
            const match = pattern.exec(key);
            if (!match) continue;
            // 交错的槽（stride > 1）：只认序号对得上这个槽的名字（DYNAMIC_ARGS1 是键、DYNAMIC_ARGS2 是值……）
            const unit = (Number(match[1]) - (slot.offset ?? 0)) / stride;
            if (Number.isInteger(unit) && unit >= 1) count = Math.max(count, unit);
        }
    }
    if (group.separator) {
        const pattern = new RegExp(`^${escapeName(group.separator)}([1-9]\\d*)$`);
        for (const key of names) {
            const match = pattern.exec(key);
            if (match) count = Math.max(count, Number(match[1]) + 1);
        }
    }
    return count;
};

/** 单元 unit 里这个槽的输入描述（基础形状里有同类槽的照抄，扩展的组按声明造） */
const slotInput = (slot: VariadicSlot, unit: number, base: BlockSpec, group: VariadicGroup,
    letter?: string): BlockSpec['inputs'][string] => {
    // 逐槽选类型的槽：这个单元选了什么类型就是什么形状（布尔槽没有输入框影子）
    if (letter && slot.typed) {
        return {type: letter === 'b' ? 'boolean' : letter === 'n' ? 'number' : 'string',
            ...(letter === 'n' ? {shadowOpcode: 'math_number'} : letter === 's' ? {shadowOpcode: 'text'} : {})};
    }
    if (!group.compact) {
        const template = base.inputs[`${slot.name}${firstDynamic(group) - 1 + (slot.offset ?? 0)}`] ?? base.inputs[slot.name];
        if (template) return template;
    }
    const fallback = slot.defaults?.[unit - 1];
    return {type: slot.kind === 'branch' ? 'stack' : slot.type,
        ...(slot.shadowOpcode ? {shadowOpcode: slot.shadowOpcode} : {}),
        ...(typeof fallback === 'string' || typeof fallback === 'number' || typeof fallback === 'boolean' ?
            {defaultValue: fallback} : {}),
        ...(slot.hatParam ? {hatParam: true} : {})};
};

export interface DynamicShape {
    spec: BlockSpec;
    mutation?: Record<string, unknown>;
    /** 槽数没超过起始数时 mutation 是 undefined；这是它「若要写」的样子（旧积木带着一样内容的 mutation 就沿用，不丢 items="2"） */
    unitMutation?: Record<string, unknown>;
    error?: string;
    /** error 的错误码：超过上限是 E_VARIADIC_LIMIT（脏数据 / 写多了，一条诊断说清），少于下限是 E_DYNAMIC_LIMIT */
    errorCode?: 'E_VARIADIC_LIMIT' | 'E_DYNAMIC_LIMIT';
    /** 每个可变输入组现在有几个单元 */
    counts: number[];
    /** 积木上原本带不带槽数属性（printer 用：带的才能写紧凑形式） */
    declared?: boolean;
    /** 所有组都是起始槽数：积木原来没有 mutation 时可以不写（编辑器读不到 mutation 就按起始槽数摆） */
    optional?: boolean;
}

/**
 * 扩展自己的动态参数（moreDataTypes，见 sugar/moreDataTypes.ts）：槽名 DYNAMIC_ARGS1.. 从 1 连续编号，
 * mutation 写 dynamicargids = JSON 数组、dynamicargtypes = 每个槽的类型（s / n / b）的 JSON 数组。
 */
export const dynargsAttributes = (group: VariadicGroup, count: number): Record<string, string> => {
    const ids: string[] = [];
    const types: string[] = [];
    for (let unit = 1; unit <= count; unit++) {
        for (const slot of group.slots) {
            if (slot.kind !== 'input') continue;
            ids.push(slotName(slot, unit));
            types.push(slot.type === 'number' ? 'n' : slot.type === 'boolean' ? 'b' : 's');
        }
    }
    return {dynamicargids: JSON.stringify(ids), dynamicargtypes: JSON.stringify(types)};
};

/** 积木上 mutation.dynamicargids 记着几个动态参数 → 折算成单元数；没有 / 读不出来返回 undefined */
const dynargsStored = (group: VariadicGroup, mutation?: Record<string, unknown>): number | undefined => {
    const raw = mutation?.dynamicargids;
    if (raw === undefined) return undefined;
    try {
        const ids: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return Array.isArray(ids) ? Math.ceil(ids.length / Math.max(1, group.slots.length)) : undefined;
    } catch { return undefined; }
};

const mutationNumbers = (raw: unknown, groups: number): Array<number | undefined> => {
    const parts = String(raw ?? '').split(';');
    return Array.from({length: groups}, (_, index) => {
        const part = groups === 1 ? parts.join(';') : parts[index];
        if (part === undefined || part === '') return undefined;
        const value = Number(part);
        return Number.isInteger(value) && value >= 0 ? value : undefined;
    });
};

/**
 * Calculate the Blockly shape from DSL slot names, or from a VM block for printing.
 *
 * @param opcode 积木操作码。
 * @param base schema 里的基础形状（不含动态加的槽）。
 * @param keys DSL 里写出来的槽名。
 * @param existing 打印时传积木本身：槽数取槽名和 mutation 里大的那个。
 * @param counts 编译时由紧凑写法算好的每组单元数（精确值，不再从槽名推）。
 * @returns 带动态槽的形状；这块积木没有可变输入组时 null。
 */
export const dynamicShape = (opcode: string, base: BlockSpec, keys: string[],
    existing?: VmBlock, counts?: Array<number | undefined>, argtypes?: string): DynamicShape | null => {
    const groups = variadicOf(opcode, base);
    if (!groups) return null;
    // 逐槽选类型：只有一个 typed 槽的单组。字母串来自调用方推出来的（编译）或积木自己的 mutation.argtypes（打印）
    const typedGroup = groups.length === 1 && groups[0].types?.length &&
        groups[0].slots.filter(slot => slot.kind === 'input' && slot.typed).length === 1 ? groups[0] : null;
    const letters = typedGroup ? String(argtypes ?? existing?.mutation?.argtypes ?? '') : '';
    const names = existing ? [...Object.keys(existing.inputs), ...Object.keys(existing.fields)] : keys;
    const stored = groups.map((group, index) => {
        if (group.mutation.count === 'dynargs') return dynargsStored(group, existing?.mutation);
        const raw = existing?.mutation?.[group.mutation.count];
        return mutationNumbers(raw, groups.length)[index];
    });
    const resolved = groups.map((group, index) => {
        if (counts?.[index] !== undefined) return counts[index];
        let count = Math.max(group.min, countFromNames(group, names));
        const attr = stored[index];
        if (attr !== undefined) count = Math.max(count, group.mutation.count === 'elif' ? attr + 1 : attr);
        // 积木没有槽数属性：编辑器按起始槽数摆
        else if (existing) count = Math.max(count, group.start);
        return count;
    });
    for (const [index, group] of groups.entries()) {
        if (resolved[index] > group.max) {
            return {spec: base, counts: resolved, errorCode: 'E_VARIADIC_LIMIT',
                error: `${opcode} takes at most ${group.max} group(s) of this parameter, this one has ${resolved[index]}; split it into several blocks`};
        }
        if (resolved[index] < group.min) {
            return {spec: base, counts: resolved, errorCode: 'E_DYNAMIC_LIMIT',
                error: `Dynamic block ${opcode} needs at least ${group.min} slot(s)`};
        }
    }
    const spec: BlockSpec = {...base, inputs: {...base.inputs}, fields: {...base.fields},
        parameters: [...(base.parameters ?? [])]};
    groups.forEach((group, index) => {
        const count = resolved[index];
        const from = firstDynamic(group);
        const added: string[] = [];
        for (let unit = from; unit <= count; unit++) {
            if (group.separator && unit >= 2) {
                const field = `${group.separator}${unit - 1}`;
                spec.fields[field] = base.fields[`${group.separator}1`] ?? {};
                added.push(field);
            }
            for (const slot of group.slots) {
                const name = slotName(slot, unit);
                spec.inputs[name] = slotInput(slot, unit, base, group,
                    typedGroup === group ? letters[unit - 1] || group.types![0] : undefined);
                added.push(name);
            }
        }
        const parameters = spec.parameters!;
        const after = group.insertAfter ? parameters.indexOf(group.insertAfter) + 1 : 0;
        parameters.splice(after > 0 ? after : parameters.length, 0, ...added);
        const tail = group.grownTail;
        if (tail && count >= from && !parameters.includes(tail.name)) {
            spec.inputs[tail.name] = base.inputs[tail.name] ?? base.inputs[tail.like];
            parameters.push(tail.name);
        }
    });
    const [first] = groups;
    const compact = !!first.compact;
    const attributes: Record<string, unknown> = {};
    const attribute = first.mutation.count;
    if (attribute === 'dynargs') Object.assign(attributes, dynargsAttributes(first, resolved[0]));
    else {
        attributes[attribute] = groups.length === 1 ?
            String(attribute === 'elif' ? resolved[0] - 1 : resolved[0]) : resolved.join(';');
    }
    if (groups.some(group => group.mutation.prefix !== undefined)) {
        attributes.prefix = groups.map(group => group.mutation.prefix ?? '').join(';');
    }
    // 打印（传了积木）：积木自己带 argtypes 才算在期望的 mutation 里，没带的积木不因此对不上；编译：推出来的字母串一定写
    if (typedGroup && (existing ? existing.mutation?.argtypes !== undefined : argtypes !== undefined)) {
        attributes.argtypes = Array.from({length: resolved[0]}, (_, index) => letters[index] || typedGroup.types![0]).join('');
    }
    for (const group of groups) Object.assign(attributes, group.mutation.extra);
    // omitEmpty：一个槽都没有时不写 mutation，积木和没有这个能力时一个字节都不差（带参数的广播）
    const empty = groups.every(group => group.mutation.omitEmpty) && resolved.every(count => count === 0);
    const grown = !empty && (compact || resolved.some((count, index) => count >= firstDynamic(groups[index])));
    return {spec, counts: resolved, declared: stored.some(item => item !== undefined),
        mutation: grown ? {tagName: 'mutation', children: [], ...attributes} : undefined,
        unitMutation: {tagName: 'mutation', children: [], ...attributes},
        optional: compact && resolved.every((count, index) => count === groups[index].start)};
};

/** 积木上的 mutation 是不是正好是这些槽数应有的样子（只比 items / prefix 这类属性，不比 tagName / children） */
export const mutationMatches = (block: VmBlock, expected?: Record<string, unknown>): boolean => {
    if (!expected) return false;
    const attributes = (item?: Record<string, unknown>): Array<[string, string]> => Object.entries(item ?? {})
        .filter(([key]) => key !== 'tagName' && key !== 'children').map(([key, value]) => [key, String(value)] as [string, string])
        .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
    return JSON.stringify(attributes(block.mutation)) === JSON.stringify(attributes(expected));
};

/** schema 标了 hatParam，或这个输入的默认输入框就是 ccw_hat_parameter（老的生成物没有 hatParam 字段） */
export const isHatParamInput = (input?: BlockSpec['inputs'][string]): boolean =>
    !!input && (input.hatParam === true || input.shadowOpcode === 'ccw_hat_parameter');
/** 积木栏里核心积木的 hat 参数椭圆默认名（schema 没带默认值时用）；其余默认名就是占位名 */
const CORE_HAT_PARAM_DEFAULTS: Record<string, Record<string, string>> = {event_whengreaterthan: {VALUE: 'extra'}};
/** 静态 hat 参数槽的默认参数名：运行时拿占位名当椭圆里的字 */
export const hatParamDefault = (opcode: string, name: string, spec: BlockSpec): string => {
    const declared = spec.inputs[name]?.defaultValue;
    return typeof declared === 'string' && declared ? declared : CORE_HAT_PARAM_DEFAULTS[opcode]?.[name] ?? name;
};

export interface HatLayout {
    /** 静态的 hat 参数槽（按 parameters 里的顺序） */
    statics: string[];
    /** 其余固定参数 */
    fixed: string[];
    /** 可增减的 hat 参数组（一个槽、是 hat 参数）在 variadic 里的序号 */
    groups: number[];
}

/** hat 积木上的参数槽分布；不是 hat 或没有参数槽时 null */
export const hatLayout = (spec: BlockSpec | undefined): HatLayout | null => {
    if (spec?.shape !== 'hat') return null;
    const parameters = spec.parameters ?? [...Object.keys(spec.fields), ...Object.keys(spec.inputs)];
    const statics = parameters.filter(name => spec.inputs[name] && isHatParamInput(spec.inputs[name]));
    const groups = (spec.variadic ?? []).flatMap((group, index) =>
        group.slots.length === 1 && group.slots[0].hatParam ? [index] : []);
    if (!statics.length && !groups.length) return null;
    return {statics, fixed: parameters.filter(name => !statics.includes(name)), groups};
};

/** 这个输入是回调的参数槽：hat 参数椭圆（有名字）或可再生的参数 reporter（名字固定，binder） */
export const isCallbackSlot = (input?: BlockSpec['inputs'][string]): boolean =>
    !!input && (isHatParamInput(input) || input.binder === true);

export interface CallbackLayout {
    /** 参数槽（parameters 里的顺序） */
    slots: string[];
    /** 其余固定参数（不含参数槽、不含回调体） */
    fixed: string[];
    /** 回调体输入：C 形口（SUBSTACK）或 lambda 体（spec.lambda） */
    body: string;
    kind: 'branch' | 'lambda';
}

/**
 * 非 hat 积木上的回调：有参数槽、并且有回调体（一个 C 形口，或 spec.lambda 声明的表达式输入）。
 * 写成 `ext.block(固定参数..., (形参...) => { ... })` / `(形参...) => 表达式`：形参依次绑定参数槽，体内引用形参就是引用
 * 槽里那块可再生 reporter（或 ccw_hat_parameter），作用域只在这个回调体。hat 的回调另见 hatLayout。
 */
export const callbackLayout = (spec: BlockSpec | undefined): CallbackLayout | null => {
    if (!spec || spec.shape === 'hat' || spec.variadic?.some(group => group.compact)) return null;
    const parameters = spec.parameters ?? [...Object.keys(spec.fields), ...Object.keys(spec.inputs)];
    const slots = parameters.filter(name => isCallbackSlot(spec.inputs[name]));
    if (!slots.length) return null;
    const stacks = parameters.filter(name => spec.inputs[name]?.type === 'stack');
    const body = spec.lambda && spec.inputs[spec.lambda] ? spec.lambda : stacks.length === 1 ? stacks[0] : null;
    if (!body || slots.includes(body)) return null;
    return {slots, fixed: parameters.filter(name => name !== body && !slots.includes(name)), body,
        kind: spec.inputs[body].type === 'stack' ? 'branch' : 'lambda'};
};

/** 回调形参的默认名：binder 槽用输入名的小写（KEY → key；IDX 写成 index，和 JavaScript 的回调一样），hat 参数槽用占位名（见 hatParamDefault） */
export const callbackParamName = (opcode: string, slot: string, spec: BlockSpec): string =>
    spec.inputs[slot]?.binder ? (slot === 'IDX' ? 'index' : slot.toLowerCase()) : hatParamDefault(opcode, slot, spec);
