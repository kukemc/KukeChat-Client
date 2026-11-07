import {parseDsl, RECORD, type Call, type Diagnostic, type Lambda, type Value, type Reference, type TypedValue} from './parser';
import {displayOpcode, inferShadow, sameCoordinate, scriptOrder, scriptRoots, TYPED_SHADOWS, type BlockTable, type CommentTable,
    type FrameTable, type TypedKind, type VmBlock, type VmInput} from './blocks';
import coreSchema from './core-schema.json';
import {callbackLayout, callbackParamName, dynamicShape, groupSlotPattern, hatLayout, hatParamDefault, mutationMatches, slotName,
    variadicOf, type CallbackLayout} from './dynamic';
import {placeCompiled} from './layout';
import {isSceneMenuOpcode, resolveSceneMenuValue, SceneRefError, type SceneMenus} from './menuRefs';
import {dict, hasOwn, MAX_DEPTH, own, safeSchema, setOwn, TOO_DEEP_FIX, tooDeepMessage} from './safe';
import {CORE_CATEGORIES} from './extensionIds';
import {moreDataTypesIds} from './sugar/moreDataTypes';
import {DATA_STRUCTURES_FIX, GLOBAL_FUNCTIONS, MARKET_FUNCTIONS, MARKET_METHODS, SUGAR_METHOD_NAMES, SUGAR_NAMESPACES} from './sugar/moreDataTypesSyntax';

/** 可变输入组里每个单元（一对 KEY/VALUE、一个 PARAM……）里的一个槽 */
export interface VariadicSlot {
    /** 第 i 个单元里这个槽的 input 名是 `${name}${i + (offset ?? 0)}`（核心的第一个单元没有序号，见 firstDynamic） */
    name: string;
    kind: 'input' | 'branch';
    type: 'number' | 'string' | 'boolean' | 'stack';
    shadowOpcode?: string;
    /** `defaults[i - 1]`：第 i 个单元里这个槽的默认值（hat 参数槽就是默认参数名） */
    defaults?: Array<string | number | boolean | null>;
    /** 这个槽是 hat 参数椭圆（ccw_hat_parameter） */
    hatParam?: boolean;
    offset?: number;
    /** 几个槽交错排在同一个名字下（moreDataTypes 的 DYNAMIC_ARGS）：第 i 个单元的槽序号 = i * stride + offset，默认 1 */
    stride?: number;
    /** 这个槽的类型由用户在积木上逐槽选（扩展声明了 types；选的类型存在 mutation.argtypes，一槽一个字母 s / n / b） */
    typed?: boolean;
}

/**
 * 可变输入组：积木上可以增减的一串槽（核心的 join / 多操作数运算 / elif / 三元，和扩展 `expandable` 声明的那一段）。
 * 一块积木可以有好几组；槽名、mutation 写法都从这份声明推出来，编译、打印、dynamicShape 共用同一套。
 */
export interface VariadicGroup {
    slots: VariadicSlot[];
    min: number;
    max: number;
    start: number;
    /** hat 参数组：允许把槽里的参数名改成形参名（schema 声明 rename:true） */
    rename?: boolean;
    /** 前面几个单元已经在积木的基础形状里（核心积木），从这个序号起的单元才是动态加的；默认 1（全部动态） */
    firstDynamic?: number;
    /** 单元之间的分隔字段（运算符）：单元 i（i ≥ 2）前面有字段 `${separator}${i - 1}` */
    separator?: string;
    /** 在基础形状的 parameters 里，动态单元插在这个名字之后（默认插在最后） */
    insertAfter?: string;
    /** 动态单元出现时基础形状要多出来的尾部槽（if 变 if-elif 后多一个 else 口），形状照抄 like */
    grownTail?: {name: string; like: string};
    mutation: {
        /** 槽数写在 mutation 的哪个属性上：items = 单元数；elif = 单元数 - 1 */
        count: 'items' | 'elif' | 'dynargs';
        prefix?: string;
        extra?: Record<string, string>;
        /** 一个槽都没有时不写 mutation。 */
        omitEmpty?: boolean;
    };
    /** 紧凑写法：固定参数后面接一个数组 / 对象（扩展的组）；核心的组仍写成位置参数或具名槽 */
    compact?: boolean;
    /** 逐槽可选的类型字母（s 文字 / n 数字 / b 布尔；第一个是默认）。只有一个 typed 槽的组才按它走 */
    types?: string[];
}

export interface BlockSpec {
    shape: 'hat' | 'command' | 'reporter' | 'boolean' | 'shadow';
    inputs: Record<string, {type: 'number' | 'string' | 'boolean' | 'stack'; shadowOpcode?: string;
        defaultValue?: string | number | boolean; required?: boolean; hatParam?: boolean;
        /** 回调参数槽（名字固定）：影子是扩展里一块没有输入的 reporter，体内引用就是这块 reporter（见 dynamic.ts 的 callbackLayout） */
        binder?: boolean}>;
    /** lambda 体输入（回调式 reporter 积木的表达式输入）；回调的最后一个箭头函数绑定参数槽，体是这个输入 */
    lambda?: string;
    /** 可变输入组；基础形状（inputs / parameters）不含组里的槽 */
    variadic?: VariadicGroup[];
    fields: Record<string, {options?: string[]; dynamicOptions?: boolean; variableType?: string; required?: boolean}>;
    /** Field and input slots in their visual order. */
    parameters?: string[];
    text?: {zh?: string; en?: string};
    category?: string;
    branchCount?: number;
    terminal?: boolean;
    extension?: {id: string; version?: string; url?: string};
}

export type Schema = Record<string, BlockSpec>;
export type VariableBinding = string | {id: string; type: 'variable' | 'list'} |
    Array<{id: string; type: 'variable' | 'list'}>;

export interface CompileOptions {
    path?: string;
    baseBlocks?: BlockTable;
    /** Existing target blocks used to resolve calls; never copied into the result. */
    procedureBlocks?: BlockTable;
    baseComments?: CommentTable;
    baseFrames?: FrameTable;
    /** false：不替没写 @at 的脚本自动排位（默认排，见 layout.ts）。 */
    autoLayout?: boolean;
    schema?: Schema;
    idFactory?: () => string;
    variables?: {self?: Record<string, VariableBinding>; stage?: Record<string, VariableBinding>};
    broadcasts?: Record<string, string>;
    dynamicOptions?: Record<string, Record<string, string[]>>;
    /**
     * 场景表（gandiScene 的场景菜单用）：写场景名 / id / id 前缀，存成场景 id；找不到报 E_UNKNOWN_SCENE，
     * 歧义报 E_SCENE_AMBIGUOUS。不传（单场景作品、调用方没提供）就不校验，字面量原样存。见 menuRefs.ts。
     */
    sceneMenus?: SceneMenus;
    /**
     * 行锚点：源文里某条语句 / 某个表达式的范围 [start, end) → 它原来那块积木的 id。写了锚点的节点一定先认回这块（操作码对得上时），
     * 别的节点不许占用被锚定的 id。代码模式用它保住「没改的行」的积木 id：中间删一句，后面同种积木不会跟着错位。
     */
    anchors?: Array<{start: number; end: number; id: string}>;
    /** 要不要出源码映射（CompileResult.map） */
    sourceMap?: boolean;
    /**
     * 底稿里的自制积木调用，记的参数 id 和现在的定义对不上时怎么办。true（默认，整页写入一直是这样）：按定义重新绑定，
     * 所以「把这一页重写一遍」能修好读成空的参数；false：原样留着（只给警告 W_STALE_CALL_IDS），按段编译用它保证没改的调用一块不动。
     */
    rebindCalls?: boolean;
}

/** 源码映射的一条：文本里 [start, end) 这一段是哪块积木。statement = 积木堆里的一句；expression = 放在输入里的积木 */
export interface SourceMapEntry {id: string; start: number; end: number; kind: 'statement' | 'expression'}

export interface CompileResult {
    blocks: BlockTable | null;
    comments: CommentTable | null;
    frames: FrameTable | null;
    createdBroadcasts: Record<string, string>;
    createdVariables: Array<{id: string; name: string; type: '' | 'list'; scope: 'stage' | 'sprite'; value: unknown}>;
    diagnostics: Diagnostic[];
    /** 警告（severity warning）：不阻断写入，不在 diagnostics 里 */
    warnings: Diagnostic[];
    /** 写入成功后值得告知作者的事（如声明已存在的变量、初始值被忽略） */
    notes: string[];
    /** 源码映射（options.sourceMap 时才有）：按 start 升序，外层在前 */
    map?: SourceMapEntry[];
    /** 每段脚本的顶层积木 id，和源文里脚本的先后一致（编不出来时没有） */
    roots?: Array<string | null>;
}

const isCall = (value: Value): value is Call => !!value && typeof value === 'object' && !Array.isArray(value) &&
    'opcode' in value && typeof value.opcode === 'string';
const isLambda = (value: Value): value is Lambda => !!value && typeof value === 'object' && !Array.isArray(value) &&
    'lambda' in value;
const isStack = (value: Value): value is Call[] => Array.isArray(value) && value.every(isCall);
const isReference = (value: Value): value is Reference => !!value && typeof value === 'object' &&
    !Array.isArray(value) && 'reference' in value && typeof value.reference === 'string';
/**
 * 输入位置上写的 `null`：积木上没有这个输入；`_`：有这个输入、但空着。两个标记都是对象，降级（lowerValue）可以
 * 反复跑 —— 嵌套积木的参数会先当值降一遍、建积木时再降一遍，用 null 表示空的话第二遍就分不清了。
 */
const ABSENT: Value = Object.freeze({absent: true});
const EMPTY: Value = Object.freeze({empty: true});

const isTyped = (value: Value): value is TypedValue => !!value && typeof value === 'object' &&
    !Array.isArray(value) && 'typed' in value;


/**
 * 会让出一帧 / 等一阵的积木（按 scratch-vm 源码核对）：
 *  - control：wait、wait_until 和各种循环（循环在非 warp 过程里每圈让出）；
 *  - motion_glidesecstoxy / motion_glideto：util.yield() 直到时间到；
 *  - looks_sayforsecs / looks_thinkforsecs：返回 Promise；looks_switchbackdroptoandwait：util.yield()/yieldTick() 等被启动的线程；
 *  - sound_playuntildone：返回 Promise，播完才继续；
 *  - event_broadcastandwait：util.yield()/yieldTick() 等被启动的线程跑完；
 *  - sensing_askandwait：返回 Promise，等用户回答；
 *  - music_playDrumForBeats / music_restForBeats / music_playNoteForBeats：stack timer + util.yield()；
 *  - text2speech_speakAndWait、speech2text_listenAndWait：返回 Promise。
 */
export const YIELDING_OPCODE = new RegExp('^(?:control_(?:wait|wait_until|repeat|forever|repeat_until|while|for_each)|' +
    'motion_glide(?:secstoxy|to)|looks_(?:sayforsecs|thinkforsecs|switchbackdroptoandwait)|sound_playuntildone|' +
    'event_broadcastandwait|sensing_askandwait|music_(?:playDrumForBeats|restForBeats|playNoteForBeats)|' +
    'text2speech_speakAndWait|speech2text_listenAndWait)$');

/** 扩展的循环积木：不是核心类别、带 SUBSTACK 输入、名字像循环（运行时没法知道它让不让出，按名字猜）。 */
const yieldingExtensionLoop = (block: VmBlock): boolean => {
    const category = block.opcode.slice(0, Math.max(block.opcode.indexOf('_'), 0));
    return !CORE_OPCODE_CATEGORIES.has(category) && Object.keys(block.inputs ?? {}).some(key => key.startsWith('SUBSTACK')) &&
        /repeat|loop|forever|while|until|each/i.test(block.opcode);
};
/** 原版 Scratch 没有的积木（Gandi 专有）：操作码 → DSL 里的写法 */
export const GANDI_ONLY_BLOCKS: Record<string, string> = dict({operator_strictequals: '===', operator_power: '** / Math.pow',
    operator_ternary: 'c ? a : b', control_break: 'break', control_continue: 'continue'});
const CORE_OPCODE_CATEGORIES = new Set(['motion', 'looks', 'sound', 'event', 'control', 'sensing', 'operator', 'data',
    'procedures', 'argument', 'math', 'text', 'pen', 'music']);

/**
 * 这些核心积木的位置参数以前跟着编辑器的界面语言排（中文界面把列表排在序号前面，见 schema.ts 的 bundledOrder），
 * 现在各语言统一成随包 schema 的顺序。在旧顺序下写的文本还在：每块积木列出出现过的旧顺序（中文、俄文、西班牙文），
 * 编译器认得出时按旧顺序读（reorderLegacy）。
 */
export const LEGACY_PARAMETER_ORDERS: Record<string, string[][]> = dict({
    data_itemoflist: [['LIST', 'INDEX']],
    data_itemnumoflist: [['LIST', 'ITEM']],
    data_deleteoflist: [['LIST', 'INDEX']],
    data_insertatlist: [['LIST', 'INDEX', 'ITEM'], ['ITEM', 'LIST', 'INDEX']],
    data_replaceitemoflist: [['LIST', 'INDEX', 'ITEM']],
    data_listcontainsitem: [['ITEM', 'LIST']],
    operator_letter_of: [['STRING', 'LETTER']],
    sensing_of: [['OBJECT', 'PROPERTY']],
    looks_goforwardbackwardlayers: [['NUM', 'FORWARD_BACKWARD']]
});
/** sensing_of 的属性里不随作品变的那几个（其余是所选角色的变量名） */
const SENSING_OF_PROPERTIES = new Set(['x position', 'y position', 'direction', 'costume #', 'costume name', 'size', 'volume',
    'backdrop #', 'backdrop name']);

/**
 * 写进输入框的字面量读回来和输入对不上吗（不该发生；发生了就报 W_LITERAL_CHANGED，别静默）。
 * 数字按数值比（空串、空白都不算 0），其余按文本比。
 * @param arg 源码里的字面量。
 * @param stored 最终存进积木的值。
 * @returns 对不上。
 */
export const literalReadsBackDifferently = (arg: unknown, stored: unknown): boolean => {
    const writtenText = String(stored);
    return typeof arg === 'number' ? Number.isFinite(arg) && (writtenText.trim() === '' || Number(writtenText) !== arg) :
        writtenText !== String(arg);
};

const compileInner = (source: string, options: CompileOptions = {}): CompileResult => {
    // 查表安全：键是用户写的名字（标识符、命名参数的键），`constructor` / `__proto__` 不能命中原型上的东西
    const schema: Schema = safeSchema({...coreSchema as Schema, ...options.schema});
    // 项目里已有的变量 / 列表：没在文件里声明也能直接用名字引用（见 lowerValue 的 implicitVariables）
    const entriesOf = (raw: VariableBinding | undefined): Array<{id: string; type: 'variable' | 'list'}> =>
        raw === undefined ? [] : typeof raw === 'string' ? [{id: raw, type: 'variable'}] : Array.isArray(raw) ? raw : [raw];
    const known = {variables: new Set<string>(), lists: new Set<string>()};
    for (const owner of [options.variables?.self, options.variables?.stage]) {
        for (const [name, raw] of Object.entries(owner ?? {})) {
            for (const entry of entriesOf(raw)) (entry.type === 'list' ? known.lists : known.variables).add(name);
        }
    }
    const parsed = parseDsl(source, {schema, known});
    /** 文件里声明的和项目里已有的变量 / 列表名：不认识的 `o_add` 是不是「变量上的糖方法」靠它分辨 */
    const variableNames = new Set<string>([...known.variables, ...known.lists, ...parsed.declarations.map(item => item.identifier)]);
    const withPath = (item: Diagnostic): Diagnostic => ({...item, ...(options.path ? {path: options.path} : {})});
    if (parsed.diagnostics.length) return {blocks: null, comments: null, frames: null,
        createdBroadcasts: {}, createdVariables: [], warnings: parsed.warnings.map(withPath), notes: [],
        diagnostics: parsed.diagnostics.map(withPath)};
    const base: BlockTable = options.baseBlocks ?? {};
    const originalComments = options.baseComments ?? {};
    const originalFrames = options.baseFrames ?? {};
    const blocks: BlockTable = JSON.parse(JSON.stringify(base));
    const comments: CommentTable = JSON.parse(JSON.stringify(originalComments));
    for (const [id, comment] of Object.entries(comments)) if (!comment.blockId) delete comments[id];
    /** 积木 id → 它的注释 id（每块积木都要查一次，不能每次扫整张注释表） */
    const commentsByBlock = new Map<string, string>();
    for (const comment of Object.values(comments)) if (comment.blockId && !commentsByBlock.has(comment.blockId)) commentsByBlock.set(comment.blockId, comment.id);
    const frames: FrameTable = JSON.parse(JSON.stringify(originalFrames));
    schema.text ??= {shape: 'shadow', inputs: dict(), fields: dict({TEXT: {}}), parameters: ['TEXT']};
    const diagnostics: Diagnostic[] = [];
    /** 警告：不阻断写入，不进 diagnostics（调用方都用 diagnostics.length 判失败） */
    const warnings: Diagnostic[] = parsed.warnings.map(withPath);
    /** 提示：写入成功后值得让作者知道的事（比如声明了已存在的变量，初始值被忽略） */
    const notes: string[] = [];
    const warn = (call: {line: number; column: number}, code: string, message: string, fix?: string): void => {
        if (warnings.some(item => item.code === code && item.line === call.line && item.column === call.column &&
            item.message === message)) return;
        warnings.push({code, message, line: call.line, column: call.column, severity: 'warning',
            ...(options.path ? {path: options.path} : {}), ...(fix ? {fix} : {})});
    };
    const createdBroadcasts: Record<string, string> = {};
    const createdVariables: CompileResult['createdVariables'] = [];
    const used = new Set<string>();
    /** 积木 id → 它在源文里的那次调用（诊断定位用） */
    const locations = new Map<string, Call>();
    const fresh = options.idFactory ?? (() => globalThis.crypto.randomUUID());
    for (const note of parsed.notes) {
        const previous = Object.values(originalComments).find(comment => !comment.blockId &&
            comment.x === note.x && comment.y === note.y);
        const id = previous?.id ?? fresh();
        comments[id] = {...previous, id, blockId: null, text: note.text, x: note.x, y: note.y,
            width: note.width, height: note.height, minimized: previous?.minimized ?? false};
    }
    const bindings = new Map<string, {name: string; id: string; type: 'variable' | 'list' | 'broadcast'; scope: string}>();
    // One declaration per entity per source. Re-declaring under another alias is an error,
    // even when initial values agree; existing project entities are reused without changing values.
    const declaredEntities = new Map<string, string>();
    /*
     * 页面里原有的变量字段指向一个上下文里看不见的 id（共享角色引用了别的场景舞台的变量、变量已被删）。打印时它没有声明，
     * 只能写成 sprite.variable("名字")；原样写回时按名字去建就会换出一个新变量、悄悄改指。
     * 所以声明在上下文里找不到、而底稿里正好有同名的悬空引用时，沿用那个 id（不新建、积木一字不动），并给个警告。
     */
    const visibleIds = new Set<string>();
    for (const owner of [options.variables?.self, options.variables?.stage]) {
        for (const raw of Object.values(owner ?? {})) for (const entry of entriesOf(raw)) visibleIds.add(entry.id);
    }
    const orphanReference = (name: string, type: 'variable' | 'list'): string | undefined => {
        for (const block of Object.values(base)) {
            for (const key of ['VARIABLE', 'LIST'] as const) {
                const field = block.fields?.[key];
                if (field && typeof field.id === 'string' && field.value === name && !visibleIds.has(field.id) &&
                    (key === 'LIST') === (type === 'list') && (field as {variableType?: string}).variableType !== 'broadcast_msg') return field.id;
            }
        }
        return undefined;
    };
    /*
     * 广播同理：积木上记着的广播 id 在舞台的广播表里找不到（复制来的角色、合并过的作品）。按名字去建会多出一个新广播、
     * 这页所有引用都换 id。底稿里正好有同名的悬空引用时沿用它的 id，不新建。
     */
    const visibleBroadcastIds = new Set<string>(Object.values(options.broadcasts ?? {}));
    const orphanBroadcast = (name: string): string | undefined => {
        for (const block of Object.values(base)) {
            const field = block.fields?.BROADCAST_OPTION;
            if (field && typeof field.id === 'string' && field.value === name && !visibleBroadcastIds.has(field.id)) return field.id;
        }
        return undefined;
    };
    for (const declaration of parsed.declarations) {
        const scope = declaration.type === 'broadcast' ? 'stage' : declaration.scope === 'stage' ? 'stage' : 'self';
        const entityKey = JSON.stringify([scope, declaration.type, declaration.name]);
        if (declaredEntities.has(entityKey)) {
            diagnostics.push({code: 'E_DECL', message: `Duplicate declaration ${declaration.name}; use ${declaredEntities.get(entityKey)}`,
                line: declaration.line, column: declaration.column, severity: 'error'});
            continue;
        }
        if (bindings.has(declaration.identifier)) {
            diagnostics.push({code: 'E_DECL', message: `Duplicate name ${declaration.identifier}`,
                line: declaration.line, column: declaration.column, severity: 'error'});
            continue;
        }
        const rawExisting = declaration.type === 'broadcast' ? own(options.broadcasts, declaration.name) :
            own(options.variables?.[declaration.scope === 'stage' ? 'stage' : 'self'], declaration.name);
        let existing = Array.isArray(rawExisting) ? rawExisting.find(item => item.type === declaration.type) : rawExisting;
        if (!existing && declaration.type === 'broadcast') {
            const orphan = orphanBroadcast(declaration.name);
            if (orphan) {
                existing = orphan;
                warnings.push({code: 'W_VARIABLE_NOT_VISIBLE', severity: 'warning',
                    message: `Broadcast ${JSON.stringify(declaration.name)} is referenced by this page with an id the stage does not have; ` +
                        'the existing blocks keep that id and no new broadcast is created',
                    line: declaration.line, column: declaration.column, ...(options.path ? {path: options.path} : {})});
            }
        }
        if (!existing && declaration.type !== 'broadcast') {
            const orphan = orphanReference(declaration.name, declaration.type === 'list' ? 'list' : 'variable');
            if (orphan) {
                existing = {id: orphan, type: declaration.type === 'list' ? 'list' : 'variable'};
                warnings.push({code: 'W_VARIABLE_NOT_VISIBLE', severity: 'warning',
                    message: `${declaration.type === 'list' ? 'List' : 'Variable'} ${JSON.stringify(declaration.name)} is referenced by this page but is not visible here ` +
                        '(it belongs to the stage of another scene or was deleted); the existing blocks keep pointing at it and no new one is created',
                    line: declaration.line, column: declaration.column, ...(options.path ? {path: options.path} : {})});
            }
        }
        if (existing && typeof existing !== 'string' && existing.type !== declaration.type) {
            diagnostics.push({code: 'E_DECL', message: `Conflicting declaration ${declaration.name}`,
                line: declaration.line, column: declaration.column, severity: 'error'});
            continue;
        }
        const id = typeof existing === 'string' ? existing : existing?.id ?? fresh();
        declaredEntities.set(entityKey, declaration.identifier);
        bindings.set(declaration.identifier, {name: declaration.name, id, type: declaration.type,
            scope: declaration.scope === 'stage' ? 'stage' : 'self'});
        if (existing && declaration.type !== 'broadcast' && declaration.initialValue !== null &&
            declaration.initialValue !== undefined) {
            notes.push(`${declaration.name} already exists; the initial value is ignored (initialize it inside when.flagclicked)`);
        }
        if (!existing && declaration.type === 'broadcast') setOwn(createdBroadcasts, declaration.name, id);
        if (!existing && declaration.type !== 'broadcast') {
            createdVariables.push({id, name: declaration.name, type: declaration.type === 'list' ? 'list' : '',
                scope: declaration.scope as 'stage' | 'sprite',
                value: isTyped(declaration.initialValue) ? Number(declaration.initialValue.value) : declaration.initialValue});
        }
    }
    /** 模板里写了 `%s[真名]` 的用真名（参数名写不成标识符时打印器这么写），没写的用形参名 */
    const procedureLabel = (call: Call): string => {
        const template = String(call.args.proccode);
        let index = 0;
        return template.replace(/%([snbc])(?:\[([^\]]*)\])?/g, (_, type: string, explicit?: string) => {
            const parameter = call.parameters?.[index++] ?? `arg${index}`;
            return `%${type}[${explicit ?? parameter}]`;
        });
    };
    /**
     * 当前作用域里 形参标识符 → {参数类型, 参数真名}。define 的形参是 argument_reporter_*；hat 的形参
     * 是 ccw_hat_parameter（type 'h'，值按名字取，名字对不上读成空串）。
     */
    let activeParameters: Map<string, {type: string; name: string; label?: string}> | null = null;
    /** 在回调体里编一段：形参（hat 参数椭圆 / 可再生 reporter）进入作用域，里层看得见外层的 */
    const withParameters = <T, >(bindings: NonNullable<Call['callbackScope']>['bindings'], run: () => T): T => {
        const previous = activeParameters;
        activeParameters = new Map([...(previous ?? []), ...bindings.map(binding =>
            [binding.alias, {type: binding.type, name: binding.name, label: binding.label}] as [string, {type: string; name: string; label?: string}])]);
        try { return run(); } finally { activeParameters = previous; }
    };
    const ambiguityReported = new Set<string>();
    /**
     * 没在文件里声明的标识符：按名字在项目现有的变量 / 列表里找（本角色和舞台两边）。唯一匹配就直接用；
     * 同名的角色变量和全局变量（或变量和列表）要报歧义，列出候选和消歧的写法；找不到仍是未知标识符。
     * 字段位置（`data.set(x, 1)` 里的 x）返回名字，由字段编译按名字、种类和范围解析（歧义时它也报 E_AMBIGUOUS_VAR）。
     */
    const implicitVariable = (item: Reference, field: boolean): Value => {
        const found = (['self', 'stage'] as const).flatMap(scope =>
            entriesOf(own(options.variables?.[scope], item.reference)).map(entry => ({...entry, scope})));
        if (!found.length) return item;
        if (field) return item.reference;
        const reporter = (entry: (typeof found)[number]): Call => ({opcode: entry.type === 'list' ? 'data_listcontents' : 'data_variable',
            args: {[entry.type === 'list' ? 'LIST' : 'VARIABLE']: `@${entry.scope === 'stage' ? 'stage' : 'self'}/${item.reference}`},
            line: item.line ?? 1, column: item.column ?? 1, comment: item.comment});
        if (found.length > 1) {
            const key = `${item.line}:${item.column}:${item.reference}`;
            if (!ambiguityReported.has(key)) {
                ambiguityReported.add(key);
                const label = (entry: (typeof found)[number]): string =>
                    `${entry.scope === 'stage' ? 'stage' : 'sprite'} ${entry.type}`;
                diagnoseAt({line: item.line ?? 1, column: item.column ?? 1}, 'E_AMBIGUOUS_VAR',
                    `${item.reference} is ambiguous: ${found.map(label).join(' and ')} both exist`,
                    `declare the one you mean: ${found.map(entry =>
                        `const ${item.reference} = ${entry.scope === 'stage' ? 'stage' : 'sprite'}.${entry.type}("${item.reference}");`).join(' or ')}`);
            }
        }
        return reporter(found[0]);
    };
    const lowerValue = (item: Value, field = false): Value => {
        if (item === null && !field) return ABSENT;
        if (isTyped(item)) return field ? Number(item.value) : item;
        if (isLambda(item)) {
            const key = `lambda:${item.line}:${item.column}`;
            if (!ambiguityReported.has(key)) {
                ambiguityReported.add(key);
                diagnoseAt(item, 'E_SLOT_TYPE', 'A callback with parameters or an expression body is only valid as the last argument of a block that takes one',
                    'callbacks with parameters bind the parameter slots of blocks such as forEachWithObj, mapList and reduceList');
            }
            return EMPTY;
        }
        if (isReference(item) && item.forced) {
            // Boolean(x)：标记跟着降级出来的那块积木走
            const lowered = lowerValue({...item, forced: undefined}, field);
            return isCall(lowered) ? {...lowered, forced: true} : lowered;
        }
        if (isReference(item)) {
            if (item.reference === '_') return field ? null : EMPTY;
            const binding = bindings.get(item.reference);
            // 需要变量名的位置（字段）：同名时变量优先；值的位置形参才盖住变量
            const parameter = field && binding ? undefined : activeParameters?.get(item.reference);
            const line = item.line ?? 1;
            const column = item.column ?? 1;
            // 'r'：回调的可再生参数 reporter（name 是它的操作码，没有字段）
            if (parameter?.type === 'r') {
                // 同一块 reporter 被里层回调重新绑定：运行时按最近一层取值，外层的形参在这里读到的是里层的值
                const entries = [...(activeParameters ?? [])];
                const hiddenBy = entries.slice(entries.findIndex(([alias]) => alias === item.reference) + 1)
                    .find(([alias, entry]) => entry.type === 'r' && entry.name === parameter.name && alias !== item.reference);
                const shadowKey = `${line}:${column}:${item.reference}`;
                if (hiddenBy && !field && !ambiguityReported.has(shadowKey)) {
                    ambiguityReported.add(shadowKey);
                    diagnoseAt({line, column}, 'E_PARAM_SHADOWED',
                        `${item.reference} is a parameter of an outer callback, but the inner callback binds the same block (${hiddenBy[1].label ?? hiddenBy[0]}), so here it would read the inner value`,
                        `copy it into a variable before the inner callback: v = ${item.reference}; and use v inside`);
                }
                return field ? parameter.name : {opcode: parameter.name, args: Object.create(null), line, column, comment: item.comment};
            }
            if (parameter) return field ? parameter.name : {opcode: parameter.type === 'h' ? 'ccw_hat_parameter' :
                parameter.type === 'b' ? 'argument_reporter_boolean' : 'argument_reporter_string_number',
            args: {VALUE: parameter.name}, line, column, comment: item.comment};
            if (!binding) return implicitVariable(item, field);
            if (binding.type === 'broadcast') return binding.name;
            if (field) return `@${binding.scope}/${binding.name}`;
            return {opcode: binding.type === 'list' ? 'data_listcontents' : 'data_variable',
                args: {[binding.type === 'list' ? 'LIST' : 'VARIABLE']: `@${binding.scope}/${binding.name}`},
                line, column, comment: item.comment};
        }
        if (isCall(item)) {
            if (item.opcode.startsWith('@call:')) {
                const helper = item.opcode.slice(6);
                if (hasOwn(TYPED_SHADOWS, helper) && item.positions?.length === 1 &&
                    (['string', 'number'].includes(typeof item.positions[0]) || isTyped(item.positions[0]))) {
                    const argument = item.positions[0];
                    return {typed: helper as TypedKind, value: isTyped(argument) ? argument.value :
                        argument as string | number};
                }
            }
            return lowerCall(item, true);
        }
        // 数组是 C 形口里的一串积木：里面每块都是一句，不是值
        if (Array.isArray(item)) return item.map(value => isCall(value) && !value.opcode.startsWith('@call:') ?
            lowerCall(value) : lowerValue(value));
        return item;
    };
    const isRecord = (value: Value): value is Record<string, Value> => !!value && typeof value === 'object' &&
        !Array.isArray(value) && (RECORD in value || (!isCall(value) && !isTyped(value) && !isReference(value) && !isLambda(value)));
    const structureProblems = new Set<string>();
    /**
     * 可变输入组和 hat 参数的写法 → 具名槽（args）加槽数（variadicCounts）加 hat 形参绑定（hatBindings）。
     * 写法见 docs/features/dsl-syntax.md；打印器按同一份声明（schema.variadic / hatParam）写出这些形式。
     * 幂等：处理过的调用带 variadicCounts，再降级一遍原样返回。
     */
    /**
     * 非 hat 积木上的回调（见 dynamic.ts 的 callbackLayout）：`ext.each(o, (key, value) => { ... })`、`ext.map(list, (item, index) => 表达式)`。
     * 回调是固定参数后面的最后一个（具名写法放在回调体输入的键里）；形参依次绑定参数槽，槽里放那块积木自己的影子
     * （可再生 reporter / 默认名的椭圆），体内用形参就是引用这块 reporter（作用域限回调体，见 callbackScope）。
     * 没有形参的 `() => { ... }` 也走这里；位置参数写满（每个槽都写出来）的老写法不是回调形式，原样交给后面处理。
     */
    const structureCallback = (item: Call, spec: BlockSpec, layout: CallbackLayout): Call | null => {
        const display = displayOpcode(item.opcode, spec.category);
        const positions = item.positions;
        const raw = !positions ? item.args[layout.body] : positions.length === layout.fixed.length + 1 ? positions[layout.fixed.length] :
            undefined;
        if (raw === undefined) return null;
        const lambda = isLambda(raw) ? raw.lambda : null;
        if (!lambda && !(layout.kind === 'branch' ? isStack(raw) : positions !== undefined)) return null;
        const problem = (code: string, message: string, fix?: string): void => {
            const key = `${code}:${item.line}:${item.column}:${message}`;
            if (structureProblems.has(key)) return;
            structureProblems.add(key);
            diagnose(item, code, message, fix);
        };
        const names = layout.slots.map(slot => callbackParamName(item.opcode, slot, spec));
        const parameters = lambda?.parameters ?? [];
        if (parameters.length > layout.slots.length) {
            problem('E_HAT_PARAMS', `${display} has ${layout.slots.length} callback parameter(s) (${names.join(', ')}), but the callback takes ${parameters.length}`,
                'remove the extra parameters');
        }
        let body: Value;
        if (!lambda) body = raw;
        else if (layout.kind === 'branch') {
            if (lambda.body) body = lambda.body;
            else {
                problem('E_SLOT_TYPE', `${display}: the callback must be a { ... } body`, `${display}(..., (${names.join(', ')}) => { ... })`);
                body = [];
            }
        } else if (lambda.expression !== undefined) body = lambda.expression;
        else {
            problem('E_SLOT_TYPE', `${display}: the callback must be an expression, not a { ... } body`,
                `${display}(..., (${names.join(', ')}) => expression)`);
            body = null;
        }
        const args: Record<string, Value> = {...item.args};
        if (positions) layout.fixed.forEach((name, index) => { if (index < positions.length) args[name] = positions[index]; });
        args[layout.body] = body;
        const bindings: NonNullable<Call['callbackScope']>['bindings'] = [];
        layout.slots.forEach((slot, index) => {
            if (slot in args) return;
            const alias = parameters[index];
            if (spec.inputs[slot].binder) {
                const opcode = spec.inputs[slot].shadowOpcode as string;
                args[slot] = {opcode, args: Object.create(null), asShadow: true, line: item.line, column: item.column};
                // 没写形参的槽也在运行时定义了这块 reporter：外层同一块 reporter 的形参在里层体内被它盖住（见 lowerValue 的 E_PARAM_SHADOWED）
                bindings.push({alias: alias ?? `\u0000${slot}`, type: 'r', name: opcode, label: alias === undefined ? `the ${slot} slot of ${display}` : undefined});
            } else {
                args[slot] = names[index];
                if (alias !== undefined) bindings.push({alias, type: 'h', name: names[index]});
            }
        });
        return {...item, args, positions: undefined, variadicCounts: [], callbackScope: {key: layout.body, bindings}};
    };
    const structureCall = (item: Call, spec: BlockSpec): Call => {
        if (item.variadicCounts) return item;
        const callback = callbackLayout(spec);
        const structured = callback ? structureCallback(item, spec, callback) : null;
        if (structured) return structured;
        const all = spec.variadic ?? [];
        const compact = all.flatMap((group, index) => group.compact ? [index] : []);
        const layout = hatLayout(spec);
        const arrowNames = item.parameters ?? [];
        const problem = (code: string, message: string, fix?: string): void => {
            const key = `${code}:${item.line}:${item.column}:${message}`;
            if (structureProblems.has(key)) return;
            structureProblems.add(key);
            diagnose(item, code, message, fix);
        };
        if (!compact.length && !layout) {
            // 回调写了形参、这个 hat 却没有参数椭圆：说清楚，不要等体内引用时报一个看不懂的未知标识符
            if (arrowNames.length && spec.shape === 'hat') {
                problem('E_HAT_PARAMS', `${displayOpcode(item.opcode, spec.category)} has no parameters, but the callback takes ${arrowNames.length}`,
                    'remove the callback parameters');
            }
            return item;
        }
        const named = !item.positions;
        // 具名写法没有形参、没有可变组的位置：照字面处理（槽数从槽名推），不动
        if (named && !arrowNames.length) return item;
        const display = displayOpcode(item.opcode, spec.category);
        const parameters = spec.parameters ?? [...Object.keys(spec.fields), ...Object.keys(spec.inputs)];
        const positions = [...(item.positions ?? [])];
        const args: Record<string, Value> = {...item.args};
        const counts: Array<number | undefined> = all.map(() => undefined);
        const bindings: Array<{alias: string; name: string}> = [];
        // 新写法：形参绑定 hat 参数槽，位置参数只写其余固定参数；老写法：位置参数含每个参数槽（`ext.hat("character", ...)`）
        const bound = !!layout && (arrowNames.length > 0 || (!named && positions.length <= layout.fixed.length));
        const fixedNames = bound ? layout!.fixed : parameters;
        let cursor = fixedNames.length;
        if (bound) {
            fixedNames.forEach((name, index) => { if (index < positions.length) args[name] = positions[index]; });
            layout!.statics.forEach((slot, index) => {
                const defaultName = hatParamDefault(item.opcode, slot, spec);
                if (!(slot in args)) args[slot] = defaultName;
                if (arrowNames[index] !== undefined) bindings.push({alias: arrowNames[index], name: String(args[slot])});
            });
            const rest = arrowNames.slice(layout!.statics.length);
            const [hatGroup] = layout!.groups;
            if (hatGroup !== undefined) {
                const group = all[hatGroup];
                const slot = group.slots[0];
                rest.forEach((alias, index) => {
                    // 可改名的槽：椭圆里的字就是形参名（运行时按它取值）；否则形参只是 DSL 里的别名，字照默认名
                    const name = group.rename ? alias : String(slot.defaults?.[index] ?? slotName(slot, index + 1));
                    args[slotName(slot, index + 1)] = name;
                    bindings.push({alias, name});
                });
                counts[hatGroup] = rest.length;
            } else if (rest.length) {
                problem('E_HAT_PARAMS', `${display} declares ${layout!.statics.length} parameter(s) but the callback takes ${arrowNames.length}`,
                    layout!.statics.length ? `declared: ${layout!.statics.map(name => hatParamDefault(item.opcode, name, spec)).join(', ')}` :
                        'remove the callback parameters');
            }
        }
        for (const index of compact) {
            const group = all[index];
            if (bound && layout!.groups.includes(index)) continue;
            const raw = positions[cursor];
            cursor++;
            const unitSlots = group.slots;
            let units: Value[][] = [];
            const label = group.slots.map(slot => slot.name).join('/');
            if (raw === undefined) units = [];
            else if (unitSlots.length === 1) {
                if (Array.isArray(raw)) units = (raw as Value[]).map(entry => [entry]);
                else problem('E_SLOT_TYPE', `${display}: the variable group (${label}) takes a list [a, b, ...]`,
                    `${display}(..., [value, ...])`);
            } else if (isRecord(raw) && unitSlots.length === 2 && unitSlots.every(slot => slot.kind === 'input')) {
                units = Object.entries(raw).map(([key, value]) => [key, value]);
            } else if (Array.isArray(raw) && (raw as Value[]).every(entry => Array.isArray(entry) &&
                (entry as Value[]).length === unitSlots.length)) {
                units = raw as Value[][];
            } else {
                problem('E_SLOT_TYPE', `${display}: the variable group (${label}) takes ` +
                    `${unitSlots.length === 2 ? '{name: value, ...} or ' : ''}[[${unitSlots.map(slot => slot.name.toLowerCase()).join(', ')}], ...]`);
            }
            units.forEach((unit, unitIndex) => unitSlots.forEach((slot, slotIndex) => {
                args[slotName(slot, unitIndex + 1)] = unit[slotIndex];
            }));
            counts[index] = units.length;
        }
        if (bound && positions.length > cursor) {
            problem('E_UNKNOWN_ARG', `${display} takes ${cursor} argument(s) before the callback; ` +
                'the callback parameters bind the hat parameters');
        }
        return {...item, args, variadicCounts: counts, ...(bound ? {hatBindings: bindings, positions: undefined} :
            {positions: item.positions ? [...positions.slice(0, parameters.length), ...positions.slice(cursor)] : undefined})};
    };
    /** 底稿里的自制积木调用，按 proccode 归拢（没有定义的那些要照原样留着，见 lowerCall） */
    let orphanCallCache: Map<string, {opcodes: Set<string>; template: VmBlock}> | null = null;
    const orphanCalls = (): Map<string, {opcodes: Set<string>; template: VmBlock}> => {
        if (orphanCallCache) return orphanCallCache;
        orphanCallCache = new Map();
        for (const block of Object.values(base)) {
            if (block.opcode !== 'procedures_call' && block.opcode !== 'procedures_call_with_return') continue;
            const code = block.mutation?.proccode;
            if (typeof code !== 'string') continue;
            const entry = orphanCallCache.get(code) ?? {opcodes: new Set<string>(), template: block};
            entry.opcodes.add(block.opcode);
            orphanCallCache.set(code, entry);
        }
        return orphanCallCache;
    };
    /** 这个名字是变量 / 列表吗（文件里声明的标识符，或项目里已有的名字）；形参盖住同名的隐式变量 */
    const kindsOfReference = (name: string): Set<'variable' | 'list' | 'broadcast'> => {
        const binding = bindings.get(name);
        if (binding) return new Set([binding.type]);
        if (activeParameters?.has(name)) return new Set();
        return new Set((['self', 'stage'] as const).flatMap(scope => entriesOf(own(options.variables?.[scope], name)).map(entry => entry.type)));
    };
    /** 字符串写的变量 / 列表名（`"@stage/得分"`、`"得分"`）是不是真有这么一个；没有任何变量上下文时不判（都算有） */
    const namedEntityExists = (raw: string, kind: 'variable' | 'list'): boolean => {
        if (!options.variables && !parsed.declarations.length) return true;
        const label = raw.replace(/^@(?:self|stage)\//, '');
        return (['self', 'stage'] as const).some(scope => entriesOf(own(options.variables?.[scope], label)).some(entry => entry.type === kind)) ||
            parsed.declarations.some(declaration => declaration.name === label && declaration.type === kind);
    };
    /** 这个位置上的值放进这个槽说不说得通（只挑得出明显不对的：数字放进列表字段、非数字文字放进「第几个」……） */
    const slotAccepts = (opcode: string, spec: BlockSpec, name: string, item: Value | undefined): boolean => {
        const fieldSpec = spec.fields[name];
        if (fieldSpec && !spec.inputs[name]) {
            const kind = name === 'LIST' ? 'list' : fieldSpec.variableType;
            if (kind === 'list' || kind === 'variable') {
                if (typeof item === 'string') return namedEntityExists(item, kind);
                return isReference(item as Value) && kindsOfReference((item as Reference).reference).has(kind);
            }
            if (typeof item !== 'string') return typeof item === 'number' && !fieldSpec.options;
            if (opcode === 'sensing_of') return true;
            return !fieldSpec.options || fieldSpec.options.some(option => option.toLowerCase() === item.toLowerCase());
        }
        if (spec.inputs[name]?.type === 'stack') return isStack(item as Value);
        if (Array.isArray(item)) return false;
        return true;
    };
    const NUMERIC_CALLS = /^(?:operator_(?:add|subtract|multiply|divide|mod|round|mathop|random|length|power)|data_(?:lengthoflist|itemnumoflist))$/;
    const numericLooking = (item: Value | undefined): boolean => typeof item === 'number' ||
        (isTyped(item as Value) && !['text', 'color'].includes((item as TypedValue).typed)) ||
        (isCall(item as Value) && NUMERIC_CALLS.test((item as Call).opcode));
    const textLooking = (item: Value | undefined): boolean => (typeof item === 'string' && (item.trim() === '' || !Number.isFinite(Number(item)))) ||
        (isCall(item as Value) && ((item as Call).opcode === 'operator_join' || (item as Call).opcode === 'operator_letter_of'));
    /**
     * 认旧顺序：位置参数照现在的顺序放明显不通、照某一种旧顺序正好说得通时，按旧顺序读，并提醒改写（见 LEGACY_PARAMETER_ORDERS）。
     * 两种顺序都说得通的（两个都是变量）分不出来，一律按现在的顺序。
     */
    const reorderLegacy = (item: Call, spec: BlockSpec): Call => {
        const legacy = own(LEGACY_PARAMETER_ORDERS, item.opcode);
        const positions = item.positions;
        const canonical = spec.parameters;
        if (!legacy || !positions || !canonical || positions.length !== canonical.length) return item;
        const at = (order: string[], name: string): Value | undefined => positions[order.indexOf(name)];
        const fits = (order: string[]): boolean => order.every(name => slotAccepts(item.opcode, spec, name, at(order, name))) &&
            // 两个都是值输入的积木只能看样子：「第几个」放了非数字的文字，而字符串那边放的是数字
            (item.opcode !== 'operator_letter_of' || !((textLooking(at(order, 'LETTER')) && !textLooking(at(order, 'STRING'))) ||
                (numericLooking(at(order, 'STRING')) && !numericLooking(at(order, 'LETTER'))))) &&
            // 属性名是固定那几个：它出现在对象的位置上、属性位置上的又不是
            (item.opcode !== 'sensing_of' || !(typeof at(order, 'OBJECT') === 'string' && SENSING_OF_PROPERTIES.has(String(at(order, 'OBJECT'))) &&
                !SENSING_OF_PROPERTIES.has(String(at(order, 'PROPERTY')))));
        if (fits(canonical)) return item;
        const matches = legacy.filter(order => order.length === canonical.length && order.every(name => canonical.includes(name)) && fits(order));
        if (matches.length !== 1) return item;
        const order = matches[0];
        const display = displayOpcode(item.opcode, spec.category);
        warn(item, 'W_LEGACY_ARG_ORDER', `${display}(${order.join(', ')}) is the argument order of an older editor (it followed the interface language); ` +
            `the arguments were read in that order. The order is now ${display}(${canonical.join(', ')}) in every language`,
        `rewrite as ${display}(${canonical.join(', ')}), or use named arguments: ${display}({${canonical.map(name => `${name}: ...`).join(', ')}})`);
        return {...item, positions: canonical.map(name => positions[order.indexOf(name)]),
            ...(item.argumentSpans ? {argumentSpans: canonical.map(name => item.argumentSpans![order.indexOf(name)])} : {})};
    };
    /** asReporter：这次调用写在输入里（当值用），不是单独一句 */
    const lowerCall = (item: Call, asReporter = false): Call => {
        if (item.opcode === 'data_set') return lowerCall({...item, opcode: 'data_setvariableto'});
        if (item.opcode === 'data_change') return lowerCall({...item, opcode: 'data_changevariableby'});
        // operator.add(a, b, c, ...) 是 operator.arithmetic(a, "+", b, "+", c, ...) 的写法（混合运算符仍写 operator.arithmetic）
        if (item.opcode === 'operator_add' && (item.positions?.length ?? 0) > 2) {
            return lowerCall({...item, opcode: 'operator_arithmetic', positions: item.positions!.flatMap((entry, index) =>
                index ? ['+', entry] : [entry])}, asReporter);
        }
        if (item.opcode === 'procedures_definition') return {...item,
            args: {...item.args, proccode: procedureLabel(item), warp: !!item.warp,
                ...(item.global ? {isglobal: true} : {})}};
        if (item.opcode.startsWith('@proc:') || item.opcode.startsWith('@call:')) {
            const branch = item.opcode.startsWith('@call:') ? item.opcode.slice(6) : null;
            const parameter = branch ? activeParameters?.get(branch) : undefined;
            if (parameter?.type === 'c') {
                if (item.positions?.length || Object.keys(item.args).length) return item;
                return {...item, opcode: 'procedures_run_branch', positions: undefined, args: {VALUE: parameter.name}};
            }
            if (!item.opcode.startsWith('@proc:')) return item;
            const proccode = item.opcode.slice(6);
            if (!procedures.has(proccode)) {
                /*
                 * 这个角色上没有它的定义（复制来的角色、定义被删了），但底稿里本来就有这样的调用：照原样留着。
                 * 打印器能把它写出来，编回来就得是同一块积木；不然这一页一个字没改也写不回去。
                 */
                const orphan = orphanCalls().get(proccode);
                if (!orphan) return item;
                warn(item, 'W_PROC_UNDEFINED', `Procedure ${proccode} is not defined on this target; the existing call is kept as it is`,
                    'define it on this sprite (or as a global block), or remove the call');
                return {...item, positions: undefined,
                    opcode: orphan.opcodes.size === 1 ? [...orphan.opcodes][0] : asReporter ? 'procedures_call_with_return' : 'procedures_call',
                    args: {proccode, args: Object.fromEntries((item.positions ?? []).map((arg, index) => [`arg${index + 1}`, lowerValue(arg)]))}};
            }
            const names = [...proccode.matchAll(/%[snbc]\[([^\]]+)\]/g)].map(match => match[1]);
            const supplied = item.positions ?? [];
            const definition = parseProcedure(proccode);
            const meta = procedures.get(definition.code)?.mutation;
            // 定义没写明返回（TurboWarp 作品：返回值积木只在调用处记 `return`），看调用处写成了值还是一句
            const returning = meta?.returntype !== undefined || meta?.isreporter !== undefined ?
                meta?.returntype && meta.returntype !== 'none' || meta?.isreporter === true || meta?.isreporter === 'true' :
                asReporter;
            return {...item, opcode: returning ? 'procedures_call_with_return' : 'procedures_call', positions: undefined,
                args: {proccode, args: Object.fromEntries(supplied.map((arg, index) =>
                    [names[index] ?? `arg${index + 1}`, lowerValue(arg)]))}};
        }
        const spec = schema[item.opcode];
        if (spec) item = reorderLegacy(item, spec);
        if (spec) item = structureCall(item, spec);
        const slots = spec?.parameters ?? [...Object.keys(spec?.fields ?? {}), ...Object.keys(spec?.inputs ?? {})];
        // 字段位置上写的标识符（data.set(x, 1) 里的 x）：记下它在源文里的位置，解析不了时诊断报在它上面
        const fieldLocations: Record<string, {line: number; column: number}> = {};
        const locate = (key: string | undefined, arg: Value): void => {
            if (key !== undefined && spec?.fields[key] && isReference(arg) && arg.line !== undefined) {
                setOwn(fieldLocations, key, {line: arg.line, column: arg.column ?? item.column});
            }
        };
        Object.entries(item.args).forEach(([key, arg]) => locate(key, arg));
        item.positions?.forEach((arg, index) => locate(slots[index], arg));
        const scope = item.callbackScope;
        return {...item, args: Object.fromEntries(Object.entries(item.args).map(([key, arg]) =>
            [key, scope && key === scope.key ? withParameters(scope.bindings, () => lowerValue(arg, !!spec?.fields[key])) :
                lowerValue(arg, !!spec?.fields[key])])), positions: item.positions?.map((arg, index) =>
            lowerValue(arg, !!spec?.fields[slots[index]])),
        ...(Object.keys(fieldLocations).length ? {fieldLocations} : {})};
    };
    const normalize = (call: Call): Call => {
        if (!call.positions) return call;
        const staticSpec = schema[call.opcode];
        const length = call.positions.length;
        /*
         * 核心的可变积木按位置写：槽数由位置参数的个数定（运算类 [a, op, b, op, c]；join 每个一个；三元 / if 超出
         * 基础形状后每两个一个单元）。紧凑组（扩展的）已在 structureCall 里变成具名槽。
         */
        const [group] = staticSpec && !call.variadicCounts ? variadicOf(call.opcode, staticSpec) ?? [] : [];
        let units = 0;
        if (group && !group.compact) {
            units = group.separator ? Math.ceil((length + 1) / 2) : group.slots.length === 1 ? length :
                group.insertAfter && length > (staticSpec!.parameters?.length ?? 0) ? Math.floor(length / 2) : 0;
        }
        const spec = staticSpec && units ? dynamicShape(call.opcode, staticSpec, [], undefined,
            [Math.max(group.min, units)])?.spec ?? staticSpec : staticSpec;
        if (!spec || ['procedures_definition', 'procedures_call', 'procedures_call_with_return']
            .includes(call.opcode)) return call;
        const slots = spec.parameters ?? [...Object.keys(spec.fields), ...Object.keys(spec.inputs)];
        const args: Record<string, Value> = Object.assign(Object.create(null), call.args);
        for (const [index, item] of call.positions.entries()) {
            const key = slots[index];
            if (key) args[key] = item;
            else if (spec.shape === 'hat' && index === slots.length && Array.isArray(item)) {
                return {...call, args, body: item as Call[]};
            } else args[`$extra_${index}`] = item;
        }
        return {...call, args};
    };
    type Procedure = {names: string[]; ids: string[]; types: string[]; mutation: Record<string, unknown>; anchored?: boolean};
    const procedures = new Map<string, Procedure>();
    const availablePrototypes = Object.values({...options.procedureBlocks, ...base})
        .filter(block => block.opcode === 'procedures_prototype' && block.mutation?.proccode);
    for (const block of availablePrototypes) {
        const mutation = block.mutation;
        if (!mutation?.proccode) continue;
        try {
            procedures.set(String(mutation.proccode), {mutation, names: JSON.parse(String(mutation.argumentnames ?? '[]')),
                ids: JSON.parse(String(mutation.argumentids ?? '[]')),
                types: [...String(mutation.proccode).matchAll(/%([snbc])/g)].map(match => match[1])});
        } catch { /* Malformed project metadata is reported when its definition is edited. */ }
    }
    const parseProcedure = (label: string): {code: string; names: string[]; types: string[]} => {
        const names: string[] = [];
        const types: string[] = [];
        const code = label.replace(/%([snbc])(?:\[([^\]]+)\])?/g, (_, type: string, name?: string) => {
            types.push(type);
            names.push(name ?? `arg${names.length + 1}`);
            return `%${type}`;
        });
        return {code, names, types};
    };
    const parseArray = (raw: unknown): unknown[] | null => {
        try {
            const value = JSON.parse(String(raw));
            return Array.isArray(value) ? value : null;
        } catch { return null; }
    };
    /** 工程里已有的调用（别页的）按 proccode 记着的参数 id 组：返回用得最多的一组（个数对得上才算） */
    const adoptCallIds = (code: string, count: number): {ids: string[]; calls: number} | null => {
        const tally = new Map<string, number>();
        for (const block of Object.values(options.procedureBlocks ?? {})) {
            if (block.opcode !== 'procedures_call' && block.opcode !== 'procedures_call_with_return') continue;
            if (block.mutation?.proccode !== code) continue;
            const ids = parseArray(block.mutation?.argumentids);
            if (!ids || ids.length !== count || ids.some(item => typeof item !== 'string' || !item)) continue;
            const key = JSON.stringify(ids);
            tally.set(key, (tally.get(key) ?? 0) + 1);
        }
        const best = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
        return best ? {ids: JSON.parse(best[0]), calls: best[1]} : null;
    };
    for (const stack of parsed.scripts) {
        for (const call of stack) {
            if (call.opcode !== 'procedures_definition' || typeof call.args.proccode !== 'string') continue;
            const definition = parseProcedure(procedureLabel(call));
            // Only explicit definition anchors identify an edited signature. A new, unanchored
            // definition still uses the historical proccode/positional adoption rules below.
            const anchoredDefinition = call.anchor ? base[call.anchor] : undefined;
            const anchoredPrototype = anchoredDefinition?.opcode === 'procedures_definition' ?
                base[anchoredDefinition.inputs.custom_block?.block ?? ''] : undefined;
            const anchoredMutation = anchoredPrototype?.opcode === 'procedures_prototype' ? anchoredPrototype.mutation : undefined;
            const oldNames = parseArray(anchoredMutation?.argumentnames);
            const oldIds = parseArray(anchoredMutation?.argumentids);
            const oldTypes = [...String(anchoredMutation?.proccode ?? '').matchAll(/%([snbc])/g)].map(match => match[1]);
            const anchored = !!anchoredMutation && !!oldNames && !!oldIds && oldNames.length === oldTypes.length &&
                oldIds.length === oldTypes.length && oldNames.every(name => typeof name === 'string') &&
                oldIds.every(id => typeof id === 'string' && !!id) && new Set(oldIds).size === oldIds.length;
            const existing = anchored ? {names: oldNames as string[], ids: oldIds as string[], types: oldTypes,
                mutation: anchoredMutation!} : procedures.get(definition.code);
            const mutation = {...existing?.mutation};
            let mapped: Array<number | undefined> | undefined;
            if (anchored && existing) {
                const unchanged = JSON.stringify(existing.names) === JSON.stringify(definition.names) &&
                    JSON.stringify(existing.types) === JSON.stringify(definition.types);
                mapped = definition.names.map((_, index) => unchanged ? index : undefined);
                const claimed = new Set<number>(unchanged ? mapped as number[] : []);
                // Names win over positions: swapping parameters must swap their identities too.
                definition.names.forEach((name, index) => {
                    const matches = existing.names.map((oldName, oldIndex) => oldName === name &&
                        existing.types[oldIndex] === definition.types[index] ? oldIndex : -1).filter(i => i >= 0);
                    const uniqueNew = definition.names.filter((newName, i) => newName === name &&
                        definition.types[i] === definition.types[index]).length === 1;
                    if (uniqueNew && matches.length === 1) { mapped![index] = matches[0]; claimed.add(matches[0]); }
                });
                // A sole unmatched pair of one type at the same slot is a true, unambiguous rename.
                // Never guess positional identities for ambiguous replacements or a reorder.
                definition.types.forEach((type, index) => {
                    if (mapped![index] !== undefined || claimed.has(index) || existing.types[index] !== type) return;
                    const remainingOld = existing.types.filter((oldType, i) => oldType === type && !claimed.has(i));
                    const remainingNew = definition.types.filter((newType, i) => newType === type && mapped![i] === undefined);
                    if (remainingOld.length === 1 && remainingNew.length === 1) {mapped![index] = index; claimed.add(index);}
                });
                const defaults = parseArray(mutation.argumentdefaults);
                const menus = parseArray(mutation.argumentoptions);
                const remap = (values: unknown[] | null, fallback: (index: number) => unknown): unknown[] =>
                    mapped!.map((oldIndex, index) => oldIndex !== undefined && values && oldIndex < values.length ?
                        values[oldIndex] : fallback(index));
                const keepJson = (raw: unknown, values: unknown[]): string => typeof raw === 'string' &&
                    JSON.stringify(parseArray(raw)) === JSON.stringify(values) ? raw : JSON.stringify(values);
                mutation.argumentdefaults = keepJson(mutation.argumentdefaults,
                    remap(defaults, index => definition.types[index] === 'b' ? 'false' : ''));
                if (mutation.argumentoptions !== undefined) mutation.argumentoptions = keepJson(mutation.argumentoptions,
                    remap(menus, () => null));
            }
            const priorReturntype = mutation.returntype ??
                ((mutation.isreporter === true || mutation.isreporter === 'true') ? 'string' : 'none');
            if (call.args.returntype !== undefined) {
                // 新定义照编辑器写 returntype；老作品只记了 isreporter、意思没变的，不补（改已有作品不无故改存档）
                if (mutation.returntype !== undefined || call.args.returntype !== priorReturntype || !existing) {
                    mutation.returntype = call.args.returntype;
                }
                // 和编辑器一样记成字符串（Tabbit 里实测 Blockly 写 isreporter="true"），调用上才会照抄
                mutation.isreporter = String(call.args.returntype !== 'none');
            }
            for (const key of ['warp', 'isglobal', 'colour', 'category', 'description']) {
                const value = key === 'warp' ? !!call.warp : call.args[key];
                if (value !== undefined) {
                    const before = mutation[key];
                    mutation[key] = (key === 'warp' || key === 'isglobal') &&
                        (before === true || before === 'true') === value && before !== undefined ?
                        before : key === 'isglobal' || key === 'warp' ? String(value) : value;
                }
            }
            if (call.args.targetid !== undefined) mutation.targetid = JSON.stringify(call.args.targetid);
            if (call.args.argumentoptions !== undefined) mutation.argumentoptions = JSON.stringify(call.args.argumentoptions);
            /*
             * 参数内部 id：已有定义的沿用；定义页被删掉重建时原型没了，但别页的调用还拿着旧 id（调用按 id 绑参数），
             * 新定义直接沿用调用上用得最多的那一组，调用不用改、参数不会读成空。
             */
            const adopted = anchored || existing?.ids?.length === definition.types.length ? null :
                adoptCallIds(definition.code, definition.types.length);
            const ids = mapped && existing ? mapped.map(index => index === undefined ? fresh() : existing.ids[index]) :
                existing?.ids?.length === definition.types.length ? existing.ids :
                    adopted?.ids ?? definition.names.map(() => fresh());
            // 旧原型已经不在，没法核对形参名和顺序：按位置沿用，让作者（AI）知道
            if (adopted) notes.push(`${adopted.calls} call(s) of ${definition.code} elsewhere keep their argument ids and bind ` +
                'the new parameters by position (the old prototype is gone, so names and order cannot be checked)');
            procedures.set(definition.code, {names: definition.names, types: definition.types, mutation, ids, anchored});
            // 仍然对不上的（调用之间互相不一致）：不改别页，给警告
            const stale = Object.values(options.procedureBlocks ?? {}).filter(block =>
                (block.opcode === 'procedures_call' || block.opcode === 'procedures_call_with_return') &&
                block.mutation?.proccode === definition.code && !base[block.id] &&
                JSON.stringify(parseArray(block.mutation?.argumentids) ?? (ids.length ? null : [])) !== JSON.stringify(ids));
            if (stale.length) {
                warn(call, 'W_STALE_CALL_IDS', `${stale.length} call(s) of ${definition.code} on other pages bind arguments ` +
                    `by old ids and will read them as empty (blocks ${stale.slice(0, 5).map(block => block.id).join(', ')}` +
                    `${stale.length > 5 ? ', ...' : ''})`, 'rewrite those pages (writing a page re-binds its calls)');
            }
        }
    }
    const diagnose = (call: Call, code: string, message: string, fix?: string): void => {
        diagnostics.push({code, message, line: call.line, column: call.column, severity: 'error',
            ...(options.path ? {path: options.path} : {}), ...(fix ? {fix} : {})});
    };
    /** 没见过的裸调用（`forever(...)` 之类）：指一条能写的路 */
    const unknownCallFix = (name: string): string => {
        const known: Record<string, string> = dict({forever: 'write while (true) { ... }',
            until: 'write repeatUntil(condition, () => { ... })', sleep: 'write wait(seconds)',
            delay: 'write wait(seconds)', loop: 'write repeat(times, () => { ... }) or while (true) { ... }',
            repeatForever: 'write while (true) { ... }', else: 'write if (c) { ... } else { ... }',
            elseif: 'write if (a) { ... } else if (b) { ... }'});
        if (known[name]) return known[name];
        const lower = name.toLowerCase();
        const match = Object.keys(schema).find(opcode => opcode.toLowerCase().endsWith(`_${lower}`));
        return match ? `write ${displayOpcode(match, schema[match]?.category)}(...)` :
            'bare calls are only repeat, repeatUntil, wait, waitUntil, stop and random; other blocks are category.name(...)';
    };
    /**
     * 写了「高级数据结构」的糖，可作品里没装它（或装的是少了积木的线上版）：指出缺的是这个扩展，
     * 而不是只说 `o_add` / `JSON_parse` 这个操作码不存在。namespace 为空是裸函数调用（`size(o)`）。
     */
    const missingSugarOf = (name: string, namespace: string | null): {message: string; fix: string} | null => {
        const installed = moreDataTypesIds(schema).length > 0;
        let display: string;
        let marketOnly: boolean;
        if (namespace === null) {
            if (!(name in GLOBAL_FUNCTIONS)) return null;
            display = `${name}(...)`;
            marketOnly = name in MARKET_FUNCTIONS;
        } else {
            const root = (SUGAR_NAMESPACES as readonly string[]).includes(namespace);
            if (!root && !(variableNames.has(namespace) && SUGAR_METHOD_NAMES.has(name))) return null;
            display = `${namespace}.${name}(...)`;
            marketOnly = name in MARKET_METHODS;
        }
        if (!installed) {
            return {message: `${display} is written with the data-structure extension, which is not installed in this project`,
                fix: DATA_STRUCTURES_FIX};
        }
        if (!marketOnly) return null;
        return {message: `${display} needs the community preview version of the data-structure extension (id test.moreDataTypes); ` +
            'the installed version does not have it',
        fix: 'Install it with add_extension({extensionId: "test.moreDataTypes"}), or write this with the blocks the installed version has'};
    };
    // 只建议同名、安全标识符的空声明；带空格等名字需要人类选择别名。
    const missingDeclarationFix = (name: string, kind: string, scope?: 'sprite' | 'stage'): string | undefined => {
        if (!/^[$_\p{ID_Start}][$_\p{ID_Continue}]*$/u.test(name) || name === '_' ||
            !['variable', 'list', 'broadcast'].includes(kind)) return undefined;
        const statement = `const ${name} = ${kind === 'broadcast' ? 'broadcast' : `${scope ?? 'sprite'}.${kind}`}(` +
            `${JSON.stringify(name)}${kind === 'variable' ? ', 0' : kind === 'list' ? ', []' : ''});`;
        if (parseDsl(statement).diagnostics.length) return undefined;
        return `${scope ? 'declare it in this scope: ' : 'declare it: '}${statement}`;
    };
    const diagnoseAt = (at: {line: number; column: number}, code: string, message: string, fix?: string): void => {
        diagnostics.push({code, message, line: at.line, column: at.column, severity: 'error',
            ...(options.path ? {path: options.path} : {}), ...(fix ? {fix} : {})});
    };
    /** 位置参数多了：按积木指一条能写的路 */
    const extraArgumentFix = (opcode: string, names: string[]): string => {
        const chain = dict({operator_subtract: '-', operator_multiply: '*', operator_divide: '/',
            operator_power: '^'});
        if (chain[opcode]) {
            return `a chain of operations is one block: operator.arithmetic(a, "${chain[opcode]}", b, "${chain[opcode]}", c)`;
        }
        if (opcode === 'control_if') {
            return 'an else branch is control.if_else(condition, () => {...}, () => {...}); several branches are ' +
                'control.if(c1, () => {...}, c2, () => {...}, () => {...}) (the last callback is the else)';
        }
        if (opcode === 'control_if_else') {
            return 'several branches are control.if(c1, () => {...}, c2, () => {...}, () => {...}) (the last callback is the else)';
        }
        return `${displayOpcode(opcode, schema[opcode]?.category)}(${names.join(', ')})`;
    };
    const unknownInputFix = (opcode: string, key: string): string | undefined => {
        if (opcode === 'operator_add' && /^NUM\d+$/.test(key)) {
            return 'operator.add takes two operands here; operator.add(a, b, c, ...) adds all of them, ' +
                'and operator.arithmetic(a, "+", b, "-", c) mixes operators';
        }
        return undefined;
    };
    /** 布尔槽里放了变量 / 非布尔 reporter：Scratch 的真假规则和 JS 不一样，不自动补，要显式比较 */
    const booleanFix = (arg: Call | null): string => {
        const name = arg?.opcode === 'data_variable' ? String(arg.args.VARIABLE ?? '').replace(/^@\w+\//, '') : 'x';
        // 装了「高级数据结构」：变量里多半是对象 / 列表，`o != 0` 对它们恒为真（`[]`、`{}` 也是），这个提示会把人带进坑
        const prefixes = moreDataTypesIds(schema);
        if (arg && prefixes.length) {
            if (arg.opcode === 'data_listcontents') {
                const list = String(arg.args.LIST ?? '').replace(/^@\w+\//, '');
                return `a Scratch list is not true / false: test its length, e.g. ${list}.length > 0`;
            }
            if (arg.opcode === 'data_variable' || prefixes.some(id => arg.opcode.startsWith(`${id}_`))) {
                return `an object or list is never true / false here, and ${name} != 0 is always true for them (even for {} and []); ` +
                    `test the content instead: size(${name}) > 0 for "not empty", ${name}.has("key") for a property, or compare the value (${name} == "...")`;
            }
        }
        return `compare explicitly, e.g. ${name} != 0 or ${name} == "..." (a Boolean slot does not read a number or text as true / false the way JavaScript does)`;
    };
    /** 底稿里每块积木实际接在谁下面（next 或输入引用它的那一块）；顶层的没有 */
    let referrers: Map<string, string> | null = null;
    const referrerOf = (id: string): string | undefined => {
        if (!referrers) {
            referrers = new Map();
            for (const block of Object.values(base)) {
                if (block.next) referrers.set(block.next, block.id);
                for (const input of Object.values(block.inputs ?? {})) {
                    if (input.block) referrers.set(input.block, block.id);
                    if (input.shadow) referrers.set(input.shadow, block.id);
                }
            }
        }
        return referrers.get(id);
    };
    /** 行锚点（options.anchors）：范围 → 原积木 id；被锚定的 id 只留给写了锚点的那个节点 */
    const anchorByRange = new Map<string, string>();
    const anchoredIds = new Set<string>();
    for (const anchor of options.anchors ?? []) {
        if (!base[anchor.id] || anchoredIds.has(anchor.id)) continue;
        anchorByRange.set(`${anchor.start}:${anchor.end}`, anchor.id);
        anchoredIds.add(anchor.id);
    }
    const anchorFor = (call: Call, opcode: string): string | undefined => {
        if (!anchorByRange.size || call.start === undefined) return undefined;
        const id = anchorByRange.get(`${call.start}:${call.end}`);
        return id && base[id].opcode === opcode && !used.has(id) ? id : undefined;
    };
    /** 积木堆里的语句（源码映射里标 statement；其余是放在输入里的表达式） */
    const statementIds = new Set<string>();
    const pick = (opcode: string, candidate?: string | null): string => {
        if (candidate && blocks[candidate]?.opcode === opcode && !used.has(candidate)) return candidate;
        let id: string;
        do { id = fresh(); } while (blocks[id] || used.has(id));
        return id;
    };
    /**
     * 回调参数槽里写的、正好是这个槽自己影子的调用（`ext.forEachKey()`）：编成槽的影子（和打印器写的一样）。
     * 槽上原来盖着的是同一操作码的普通积木时保持盖着（带底改写不动它）。
     */
    const isBinderShadow = (inputSpec: BlockSpec['inputs'][string] | undefined, arg: Call, previous?: VmInput): boolean => {
        if (!inputSpec?.binder || arg.opcode !== inputSpec.shadowOpcode || arg.positions?.length || Object.keys(arg.args).length) return false;
        const covering = previous?.block ? blocks[previous.block] : undefined;
        return !(covering && !covering.shadow && covering.opcode === arg.opcode);
    };
    /** 正在编的 define 体的层数（return 只能写在里面） */
    let definitionDepth = 0;
    /** 这一串语句里有没有 break / continue 能到达外面这一层循环（嵌套的核心循环、嵌套的 for...of 自己接住它们） */
    const mdtLoops = moreDataTypesIds(schema).map(id => `${id}_forEachWithObj`);
    const breaksOut = (body: Value | undefined): boolean => Array.isArray(body) && body.some(entry => isCall(entry) &&
        (entry.opcode === 'control_break' || entry.opcode === 'control_continue' || (!/^control_(?:forever|while|repeat|repeat_until|for_each)$/.test(entry.opcode) &&
            !mdtLoops.includes(entry.opcode) &&
            [...(entry.positions ?? []), ...Object.values(entry.args)].some(inner => Array.isArray(inner) && breaksOut(inner)))));
    /**
     * 逐槽可选类型的组（扩展声明了 types）：每个单元的类型字母。优先看这一槽现在放的是什么（布尔积木 → b，数字 → n，
     * 文字 → s），看不出来（盖着报告器、空）沿用旧积木 mutation.argtypes 里的字母，再没有就是默认类型。
     * 不是「只有一个 typed 槽的单组」就不管（返回 undefined，行为和以前一样）。
     */
    const inferArgtypes = (call: Call, spec: BlockSpec, old?: VmBlock): string | undefined => {
        const groups = variadicOf(call.opcode, spec);
        const group = groups?.length === 1 ? groups[0] : null;
        const typedSlots = group?.slots.filter(slot => slot.kind === 'input' && slot.typed) ?? [];
        if (!group?.types?.length || typedSlots.length !== 1) return undefined;
        const slot = typedSlots[0];
        const stored = typeof old?.mutation?.argtypes === 'string' ? old.mutation.argtypes : '';
        let units = call.variadicCounts?.[0] ?? 0;
        for (const key of Object.keys(call.args)) {
            if (key.startsWith(slot.name) && /^\d+$/.test(key.slice(slot.name.length))) units = Math.max(units, Number(key.slice(slot.name.length)));
        }
        let letters = '';
        for (let unit = 1; unit <= units; unit++) {
            const arg = call.args[slotName(slot, unit)];
            const kept = stored[unit - 1];
            let letter = kept && group.types.includes(kept) ? kept : group.types[0];
            if (isCall(arg)) {
                if (schema[arg.opcode]?.shape === 'boolean') letter = 'b';
                else if (letter === 'b') letter = group.types.includes('s') ? 's' : letter;
            } else if (typeof arg === 'boolean') letter = 'b';
            else if (typeof arg === 'number' || (isTyped(arg) && arg.typed !== 'text' && arg.typed !== 'color')) letter = 'n';
            else if (typeof arg === 'string' || isTyped(arg)) letter = 's';
            letters += group.types.includes(letter) ? letter : group.types[0];
        }
        return letters;
    };
    const make = (rawCall: Call, parent: string | null, candidate?: string | null): VmBlock => {
        const call = normalize(lowerCall(rawCall));
        const id = pick(call.opcode, anchorFor(rawCall, call.opcode) ?? (candidate && anchoredIds.has(candidate) ? null : candidate));
        used.add(id);
        locations.set(id, rawCall);
        const staticSpec = schema[call.opcode];
        const argtypes = staticSpec ? inferArgtypes(call, staticSpec, blocks[id]) : undefined;
        const dynamic = staticSpec ? dynamicShape(call.opcode, staticSpec, Object.keys(call.args), undefined,
            call.variadicCounts, argtypes) : null;
        const spec = dynamic?.spec ?? staticSpec;
        const old = blocks[id];
        if (dynamic?.error) diagnose(call, dynamic.errorCode ?? 'E_DYNAMIC_LIMIT', dynamic.error,
            'split the block: keep at most the allowed number of groups here and move the rest into a second block');
        /*
         * return 语句只能写在 define 体内。孤立的 procedures_return 积木在运行时是合法的（相当于停止这个脚本，
         * TurboWarp 作品里有），所以块式写法 procedures.return(...) 保留（往返无损）：只给警告，不报错。
         */
        if (call.opcode === 'procedures_return' && !definitionDepth) {
            if (rawCall.returnStatement) {
                diagnose(call, 'E_RETURN_OUTSIDE', 'return can only be written inside define(...)',
                    'move it into the definition: define("name %n", (n) => { return n; }); to end a script early use stop("this script")');
            } else if (!old) {
                warn(call, 'W_RETURN_OUTSIDE', 'procedures.return outside define(...) only stops this script',
                    'write stop("this script") to stop a script');
            }
        }
        if (!spec && !old && call.opcode !== 'procedures_definition') {
            if (call.opcode.startsWith('@proc:')) {
                diagnose(call, 'E_PROC', `Procedure ${call.opcode.slice(6)} is not defined on this target`);
            } else if (call.opcode.startsWith('@call:')) {
                const missingSugar = missingSugarOf(call.opcode.slice(6), null);
                if (missingSugar) diagnose(call, 'E_MDT_MISSING', missingSugar.message, missingSugar.fix);
                else diagnose(call, 'E_UNKNOWN_BLOCK', `Unknown block ${call.opcode}`, unknownCallFix(call.opcode.slice(6)));
            } else {
                // 扩展 id 可能带点或下划线：已知扩展里最长的 id 前缀优先，不认识的按第一个 _ 前拆
                // 文字里写的扩展 id 最准（id 带下划线时操作码拆不对）；没有就按已知扩展里最长的前缀
                const namespace = call.extensionId ?? Object.values(schema).map(spec => spec.category).filter((id): id is string =>
                    !!id && call.opcode.startsWith(`${id}_`)).sort((x, y) => y.length - x.length)[0] ?? call.opcode.split('_')[0];
                const nearby = Object.keys(schema).filter(opcode => opcode.startsWith(`${namespace}_`)).slice(0, 5);
                const missingSugar = missingSugarOf(call.opcode.slice(namespace.length + 1), namespace);
                if (missingSugar) diagnose(call, 'E_MDT_MISSING', missingSugar.message, missingSugar.fix);
                else if (!nearby.length && !CORE_CATEGORIES.has(namespace) && !Object.values(schema).some(spec => spec.category === namespace)) {
                    // 这个扩展作品里没装：指出怎么装，而不是只说积木不存在
                    diagnose(call, 'E_UNKNOWN_BLOCK', `Unknown block ${call.opcode}`,
                        `the extension "${namespace}" is not installed in this project: add_extension({extensionId: "${namespace}"}) ` +
                        `(CLI: gandi install ${namespace}), then write this page again; ` +
                        'if you meant an object or list, declare the variable first');
                } else diagnose(call, 'E_UNKNOWN_BLOCK', `Unknown block ${call.opcode}`, nearby.join(', '));
            }
        }
        const block: VmBlock = old ? {...old, fields: {...old.fields}, inputs: {...old.inputs}} :
            {id, opcode: call.opcode, parent, next: null, inputs: {}, fields: {}, shadow: false, topLevel: parent === null};
        // 这块积木还接在原来那块下面：parent / topLevel 两个记号不动，哪怕原来记的和实际连接对不上（旧作品里有 parent 没写、
        // 指错的表）。文本表达的是连接，连接没变就不是要改它；挪了地方、新建的、顶层的照常按实际连接写
        const sameSpot = !!old && parent !== null && referrerOf(id) === parent;
        if (!sameSpot) {
            if (!old || 'parent' in old) block.parent = parent;
            if (!old || 'topLevel' in old || parent === null) block.topLevel = parent === null;
        }
        block.next = null;
        blocks[id] = block;
        if (dynamic) {
            const groups = variadicOf(call.opcode, staticSpec) ?? [];
            // 紧凑写法 / 形参写法：槽数是明说的，一定写 mutation（和编辑器一样）；具名写法的起始槽数、
            // 原来也没有 mutation 的积木不写（编辑器读不到 mutation 就按起始槽数摆，不多出一个属性）
            const explicit = !!call.variadicCounts?.some(count => count !== undefined);
            // 旧积木没有 argtypes、各槽类型也都是默认的：不添这个属性（编辑器读不到就按默认类型摆，带底写回一字不差）
            if (dynamic.mutation && old && old.mutation?.argtypes === undefined && typeof dynamic.mutation.argtypes === 'string') {
                const typedGroup = variadicOf(call.opcode, staticSpec)?.[0];
                if (typedGroup?.types && dynamic.mutation.argtypes === typedGroup.types[0].repeat(dynamic.mutation.argtypes.length)) {
                    delete dynamic.mutation.argtypes;
                }
            }
            if (dynamic.mutation) {
                if (!dynamic.optional || explicit || old?.mutation) block.mutation = {...block.mutation, ...dynamic.mutation};
            } else if (!(old?.mutation && dynamic.unitMutation && mutationMatches(old as VmBlock, dynamic.unitMutation))) delete block.mutation;
            // 旧作品里带着 items="2" 这类和槽数一致的 mutation（语义上等于没有）：原样沿用，带底写回一字不差
            // A reduced dynamic shape must not retain invisible old slots in VM data.
            for (const group of groups) {
                const pattern = groupSlotPattern(group);
                const separator = group.separator ? new RegExp(`^${group.separator}\\d+$`) : null;
                for (const key of Object.keys(block.inputs)) {
                    if (!spec.inputs[key] && pattern.test(key)) delete block.inputs[key];
                }
                for (const key of Object.keys(block.fields)) {
                    if (!spec.fields[key] && separator?.test(key)) delete block.fields[key];
                }
                for (const [key, field] of Object.entries(spec.fields)) {
                    if (separator?.test(key) && !block.fields[key]) {
                        block.fields[key] = {name: key, value: field.options?.[0] ?? '+'};
                    }
                }
            }
        }
        // 高级数据结构集市版的 for...of：编译模式里循环体内的 break / continue 不起作用（解释执行正常），说清楚
        if (call.callbackScope && moreDataTypesIds(schema).some(id => call.opcode === `${id}_forEachWithObj`) &&
            breaksOut(call.args[call.callbackScope.key])) {
            warn(call, 'W_FOREACH_BREAK', 'break / continue inside this loop do nothing when the project runs in compile mode (they work in the interpreter)',
                'put the rest of the body in an if instead of breaking, or loop with while / for (let i = 1; i <= n; i++)');
        }
        if (rawCall.at) {
            if (parent !== null) diagnose(call, 'E_POSITION', '@at is only valid on top-level blocks');
            else if (!(old && sameCoordinate(old.x, rawCall.at.x) && sameCoordinate(old.y, rawCall.at.y))) {
                // 文本里的坐标是去掉浮点尾巴再写的：和原位置只差这点尾巴时不动原值
                block.x = rawCall.at.x;
                block.y = rawCall.at.y;
            }
        }
        if (rawCall.collapsed) block.collapsed = true;
        // call.comment：字符串（可以是空串）= 这块积木有这条注释；null = 源码里这块没写注释（原来有的删掉）
        if (call.comment !== undefined) {
            const linkedId = commentsByBlock.get(id);
            if (call.comment !== null) {
                const commentId = typeof old?.comment === 'string' ? old.comment : linkedId ?? fresh();
                const existing = comments[commentId];
                comments[commentId] = existing ? {...existing, text: call.comment, blockId: id} :
                    {id: commentId, text: call.comment, blockId: id, x: block.x ?? 0, y: block.y ?? 0,
                        width: 200, height: 200, minimized: false};
                commentsByBlock.set(id, commentId);
                if (old?.comment || !old) block.comment = commentId;
            } else if ((old?.comment || linkedId) && (options.baseComments || Object.keys(originalComments).length) &&
                // 积木上记着注释 id、注释表里却没有这条（旧作品里的悬空引用）：文本里本来就看不到它，不是「删了注释」，原样留着
                (linkedId !== undefined || comments[String(old?.comment)] !== undefined)) {
                delete comments[String(old?.comment ?? linkedId)];
                commentsByBlock.delete(id);
                delete block.comment;
            }
        }
        let argumentsToCompile = call.args;
        const procedureTypes: Record<string, string> = Object.create(null);
        const procedureShadows: Record<string, string> = Object.create(null);
        const procedureMenuDefaults: Record<string, string> = Object.create(null);
        if (call.opcode === 'procedures_definition') {
            if (typeof call.args.proccode !== 'string' || typeof call.args.warp !== 'boolean') {
                diagnose(call, 'E_PROC', 'define requires proccode and warp');
            } else {
                const definition = parseProcedure(call.args.proccode);
                const spec = procedures.get(definition.code);
                if (!spec) diagnose(call, 'E_PROC', `No procedure ${definition.code}`);
                else {
                    const allowed = new Set(['proccode', 'warp', 'returntype', 'isglobal', 'targetid',
                        'argumentoptions', 'colour', 'category', 'description']);
                    for (const key of Object.keys(call.args)) {
                        if (!allowed.has(key)) diagnose(call, 'E_UNKNOWN_ARG', `Unknown define option ${key}`);
                    }
                    const original = spec.mutation;
                    const returntype = call.args.returntype ?? original.returntype ??
                        ((original.isreporter === true || original.isreporter === 'true') ? 'string' : 'none');
                    if (!['none', 'string', 'boolean'].includes(String(returntype))) {
                        diagnose(call, 'E_PROC', 'returntype must be none, string or boolean');
                    }
                    if (call.args.isglobal !== undefined && typeof call.args.isglobal !== 'boolean') {
                        diagnose(call, 'E_PROC', 'isglobal must be a boolean');
                    }
                    const options = call.args.argumentoptions ??
                        (original.argumentoptions ? parseArray(original.argumentoptions) : spec.names.map(() => null));
                    if (!Array.isArray(options) || options.length !== spec.names.length ||
                        options.some(item => item !== null && (!Array.isArray(item) || !item.length ||
                            item.some(entry => typeof entry !== 'string')))) {
                        diagnose(call, 'E_PROC', 'argumentoptions must contain one null or nonempty string list per argument');
                    }
                    for (const key of ['targetid', 'colour', 'category', 'description'] as const) {
                        if (call.args[key] !== undefined && typeof call.args[key] !== 'string' &&
                            !(key === 'targetid' && call.args[key] === null)) {
                            diagnose(call, 'E_PROC', `${key} must be a string`);
                        }
                    }
                    const previousPrototypeId = old?.inputs.custom_block?.block;
                    const prototypeId = pick('procedures_prototype', previousPrototypeId);
                    const prototype = blocks[prototypeId] ?? {id: prototypeId, opcode: 'procedures_prototype',
                        inputs: {}, fields: {}, next: null, shadow: true};
                    const oldMutation = prototype.mutation;
                    // 原型上的参数名 / id 是一串 JSON 文字：内容没变就留原来那串（转义、空格的写法可能和 JSON.stringify 不同），
                    // 默认值也跟着留；按字符串比的话，写法不同的旧原型每次都会被重写
                    const sameJson = (raw: unknown, wanted: unknown[]): boolean => typeof raw === 'string' &&
                        JSON.stringify(parseArray(raw)) === JSON.stringify(wanted);
                    const namesKept = sameJson(oldMutation?.argumentnames, spec.names);
                    const idsKept = sameJson(oldMutation?.argumentids, spec.ids);
                    const defaults = spec.anchored ? original.argumentdefaults :
                        oldMutation?.proccode === definition.code && namesKept ? oldMutation.argumentdefaults : undefined;
                    const oldWarp = oldMutation?.warp;
                    // 新写的定义照编辑器的样子存字符串（Blockly 的 JSON.stringify(warp_)）；原来就有的沿用原来的写法
                    const warp = (oldWarp === true || oldWarp === 'true') === call.args.warp ?
                        oldWarp ?? String(call.args.warp) : String(call.args.warp);
                    // 老作品只靠 isreporter 表达圆形返回值、没记 returntype：意思没变就不补
                    const preserveLegacyReturn = !!oldMutation && oldMutation.returntype === undefined &&
                        returntype === ((oldMutation.isreporter === true || oldMutation.isreporter === 'true') ? 'string' : 'none');
                    prototype.mutation = {...oldMutation, tagName: 'mutation', children: [],
                        proccode: definition.code, argumentnames: namesKept ? oldMutation!.argumentnames : JSON.stringify(spec.names),
                        argumentids: idsKept ? oldMutation!.argumentids : JSON.stringify(spec.ids),
                        // 和 Gandi 的积木库写的一样（procedures.js 的 add*External：布尔参数记字符串 'false'，其余 ''）
                        argumentdefaults: defaults ?? JSON.stringify(spec.types.map(type => type === 'b' ? 'false' : '')),
                        warp,
                        ...((call.args.returntype !== undefined && !preserveLegacyReturn) ||
                            oldMutation?.returntype !== undefined ?
                            {returntype} : {}),
                        ...(call.args.returntype !== undefined || oldMutation?.isreporter !== undefined ?
                            {isreporter: (oldMutation?.isreporter === true || oldMutation?.isreporter === 'true') ===
                                (returntype !== 'none') ? oldMutation?.isreporter ?? String(returntype !== 'none') :
                                String(returntype !== 'none')} : {}),
                        ...(call.args.isglobal !== undefined ? {isglobal:
                            (oldMutation?.isglobal === true || oldMutation?.isglobal === 'true') === call.args.isglobal ?
                                oldMutation?.isglobal ?? String(call.args.isglobal) : String(call.args.isglobal)} : {}),
                        ...(call.args.argumentoptions !== undefined ? {argumentoptions: JSON.stringify(options)} :
                            spec.anchored && original.argumentoptions !== undefined ? {argumentoptions: original.argumentoptions} : {}),
                        ...Object.fromEntries(['targetid', 'colour', 'category', 'description'].filter(key =>
                            call.args[key] !== undefined).map(key => [key, key === 'targetid' ?
                            JSON.stringify(call.args[key]) : call.args[key]]))};
                    spec.mutation = prototype.mutation;
                    /*
                     * 原型上每个参数挂一块参数积木（影子），和编辑器里 Blockly 建出来、存进作品的一样
                     * （gandi-blocks procedures.js 的 createArgumentReporter_）：%b 是布尔，其余是数字 / 文字。
                     * C 形参数（%c）没有。
                     */
                    const argumentInputs: Record<string, VmInput> = {};
                    // sb2 转来的原型（warp 存成布尔）本来就没有参数积木，照旧不加（语料里 13 / 13）
                    const legacyPrototype = typeof prototype.mutation.warp === 'boolean';
                    if (!legacyPrototype) spec.ids.forEach((argumentId, index) => {
                        const type = spec.types[index];
                        if (type === 'c') return;
                        const opcode = type === 'b' ? 'argument_reporter_boolean' : 'argument_reporter_string_number';
                        const previous = prototype.inputs[argumentId]?.block;
                        const reporterId = pick(opcode, previous);
                        used.add(reporterId);
                        const oldField = blocks[reporterId]?.fields.VALUE;
                        blocks[reporterId] = {...blocks[reporterId], id: reporterId, opcode, parent: prototypeId, next: null,
                            inputs: {}, fields: {VALUE: {...oldField, name: 'VALUE', value: spec.names[index]}}, shadow: true,
                            topLevel: false};
                        argumentInputs[argumentId] = {name: argumentId, block: reporterId, shadow: reporterId};
                    });
                    // 原型上本来就多着的输入（参数表里早就没有的旧参数留下的）：文本里看不见，原样留着
                    const priorIds = new Set((parseArray(oldMutation?.argumentids) ?? []).map(String));
                    const leftover = Object.entries(prototype.inputs ?? {}).filter(([key]) => !priorIds.has(key) && !spec.ids.includes(key));
                    for (const [, input] of leftover) for (const ref of [input.block, input.shadow]) if (ref && blocks[ref]) used.add(ref);
                    prototype.inputs = {...Object.fromEntries(leftover), ...argumentInputs};
                    prototype.parent = id;
                    prototype.topLevel = false;
                    blocks[prototypeId] = prototype;
                    used.add(prototypeId);
                    // 原来就指着这块原型的输入不动（旧作品里它的 shadow 可能是空的）
                    const priorCustom = block.inputs.custom_block;
                    block.inputs.custom_block = priorCustom?.block === prototypeId ? priorCustom :
                        {...(priorCustom ?? {name: 'custom_block'}), block: prototypeId, shadow: prototypeId};
                }
            }
            argumentsToCompile = Object.create(null);
        }
        if (call.opcode === 'procedures_call' || call.opcode === 'procedures_call_with_return') {
            const raw = call.args.proccode;
            const definition = typeof raw === 'string' ? parseProcedure(raw) : null;
            const known = definition && procedures.get(definition.code);
            const oldIds = old?.mutation?.argumentids;
            const fallbackIds = oldIds ? parseArray(oldIds) : [];
            const ownIds = {ids: (fallbackIds ?? []).map(String), names: (fallbackIds ?? []).map((_, index) => `arg${index + 1}`)};
            /*
             * 旧调用记的参数 id 和现在的定义不一样（定义被删掉重建过）。整页写入时按定义重新绑定（rebindCalls，默认）；
             * 按段编译时这块调用没人动过，就照它自己记的 id 原样留着，只提醒一句。
             */
            const stale = !!known && !!old && !!definition && old.mutation?.proccode === definition.code && !!fallbackIds &&
                JSON.stringify(ownIds.ids) !== JSON.stringify(known.ids);
            if (stale && options.rebindCalls === false) {
                warn(call, 'W_STALE_CALL_IDS', `This call of ${definition!.code} binds its arguments by ids the definition no longer has; ` +
                    'it is kept as it is and reads them as empty when it runs', 'write the whole page again to re-bind its calls');
            }
            // 底稿里别处有同样的孤儿调用（这个角色上没有定义）：新写的一块照它的样子建
            const orphanTemplate = !known && !old && definition ? orphanCalls().get(definition.code)?.template : undefined;
            const orphanIds = orphanTemplate ? (parseArray(orphanTemplate.mutation?.argumentids) ?? []).map(String) : [];
            const procedure = known && !(stale && options.rebindCalls === false) ? known :
                definition && old?.mutation?.proccode === definition.code ?
                    {...ownIds, types: definition.types, mutation: old.mutation} :
                    orphanTemplate && definition ? {ids: orphanIds, names: orphanIds.map((_, index) => `arg${index + 1}`),
                        types: definition.types, mutation: orphanTemplate.mutation as Record<string, unknown>} : null;
            /*
             * 重新绑定：旧调用按位置把每个参数的输入挪到定义现在的参数 id 下面（连同里面的积木）。只改 mutation 不挪输入的话，
             * 旧输入留在积木上没人读，新 id 下又现建一份，参数里的积木全部换了 id。
             */
            if (stale && procedure === known) {
                ownIds.ids.forEach((oldId, index) => {
                    const newId = known.ids[index];
                    if (!newId || newId === oldId) return;
                    for (const [from, to] of [[oldId, newId], [`SUBSTACK${oldId}`, `SUBSTACK${newId}`]]) {
                        if (hasOwn(block.inputs, from) && !hasOwn(block.inputs, to) && !known.ids.includes(oldId)) {
                            setOwn(block.inputs, to, {...block.inputs[from], name: to});
                            delete block.inputs[from];
                        }
                    }
                });
            }
            const given = call.args.args;
            for (const key of Object.keys(call.args)) {
                if (!['proccode', 'args'].includes(key)) diagnose(call, 'E_UNKNOWN_ARG', `Unknown call option ${key}`);
            }
            if (!definition || !procedure || !given || typeof given !== 'object' || Array.isArray(given) || isCall(given)) {
                diagnose(call, 'E_PROC', definition && !procedure ?
                    `Procedure ${definition.code} is not defined on this target` : 'Call requires proccode and named args');
                argumentsToCompile = Object.create(null);
            } else {
                const meta = procedure.mutation;
                const returntype = meta.returntype ??
                    ((meta.isreporter === true || meta.isreporter === 'true') ? 'string' : 'none');
                // 定义没写明返回类型（TurboWarp 作品）时，调用写成值还是一句都算对
                const declaresReturn = meta.returntype !== undefined || meta.isreporter !== undefined;
                if (declaresReturn && (call.opcode === 'procedures_call_with_return') !== (returntype !== 'none') &&
                    !old) diagnose(call, 'E_PROC', `Procedure ${definition.code} returns ${returntype}`);
                const originalPrototype = availablePrototypes.find(item =>
                    item.mutation?.proccode === definition.code)?.mutation;
                const mutationKeys = ['warp', 'isreporter', 'isglobal', 'targetid', 'returntype',
                    'argumentoptions', 'colour', 'category', 'description'];
                const unchanged = !!old && old.mutation?.proccode === definition.code &&
                    !!originalPrototype && mutationKeys.every(key => meta[key] === originalPrototype[key]);
                /*
                 * 调用上抄哪些属性：Blockly 从原型复制过来的是 XML 属性（字符串），sb2 转来的原型上是布尔、
                 * 调用上就没有。语料里 110 个调用全部符合「原型上是字符串才抄」。
                 */
                const copied = (key: string): boolean => typeof meta[key] === 'string' ||
                    !['warp', 'isreporter', 'isglobal', 'targetid'].includes(key) && meta[key] !== undefined;
                // 参数 id 没变就留原来那串字（JSON 的写法可能不同：空格、转义），带底写回一字不差
                const keptIds = typeof oldIds === 'string' && JSON.stringify(parseArray(oldIds)) === JSON.stringify(procedure.ids) ?
                    oldIds : JSON.stringify(procedure.ids);
                block.mutation = {...block.mutation, tagName: 'mutation', children: [],
                    proccode: definition.code, argumentids: keptIds,
                    ...Object.fromEntries(mutationKeys.filter(key => !unchanged && copied(key))
                        .map(key => [key, meta[key]])),
                    // TurboWarp 的返回值调用：定义上没有返回类型，调用处记 return（VM 靠它认成返回值积木）
                    ...(call.opcode === 'procedures_call_with_return' && !declaresReturn ? {return: '1'} : {})};
                const mapped: Record<string, Value> = Object.create(null);
                const menuOptions = parseArray(meta.argumentoptions ?? '[]') ?? [];
                if (meta.argumentoptions !== undefined && !parseArray(meta.argumentoptions)) {
                    diagnose(call, 'E_PROC', 'Invalid procedure argumentoptions');
                }
                const names = new Set(procedure.names.flatMap((name, index) => [name, `arg${index + 1}`]));
                for (const key of Object.keys(given as Record<string, Value>)) {
                    if (!names.has(key)) diagnose(call, 'E_PROC', `Unknown procedure argument ${key}`);
                }
                for (const [index, inputId] of procedure.ids.entries()) {
                    const name = procedure.names[index];
                    const supplied = given as Record<string, Value>;
                    const fallbackName = `arg${index + 1}`;
                    const uniqueName = procedure.names.indexOf(name) === procedure.names.lastIndexOf(name);
                    const candidate = Object.prototype.hasOwnProperty.call(supplied, fallbackName) ?
                        supplied[fallbackName] : uniqueName ? supplied[name] : undefined;
                    const branch = procedure.types[index] === 'c';
                    const slot = branch ? `SUBSTACK${inputId}` : inputId;
                    procedureTypes[slot] = branch ? 'stack' : procedure.types[index] === 'b' ? 'boolean' :
                        procedure.types[index] === 'n' ? 'number' : 'string';
                    if (!branch) {
                        const menu = menuOptions[index];
                        procedureShadows[slot] = Array.isArray(menu) && menu.length ?
                            'procedures_dropdown_arg' : procedure.types[index] === 'n' ? 'math_number' : 'text';
                        if (Array.isArray(menu) && menu.length) procedureMenuDefaults[slot] = String(menu[0]);
                    }
                    if (candidate !== undefined && Array.isArray(menuOptions[index]) && menuOptions[index].length &&
                        typeof candidate === 'string' && !menuOptions[index].includes(candidate) && !old?.inputs[inputId]) {
                        diagnose(call, 'E_BAD_OPTION', `Invalid ${name}; choose ${menuOptions[index].join(', ')}`);
                    }
                    if (candidate === undefined && !(old && !old.inputs[inputId])) {
                        diagnose(call, 'E_PROC', `Missing procedure argument ${name}`);
                    }
                    else if (candidate !== undefined) mapped[slot] = candidate;
                }
                argumentsToCompile = mapped;
            }
        }
        for (const [key, originalArg] of Object.entries(argumentsToCompile)) {
            let arg = originalArg;
            let shadowOverride: string | null = null;
            // 原文是数字字面量（含 0.10 这类保留写法的）：数字框放得下；文字框也收，存成文字
            let numericLiteral = typeof arg === 'number';
            if (isTyped(arg)) {
                if (arg.typed === 'number') numericLiteral = true;
                else shadowOverride = TYPED_SHADOWS[arg.typed];
                arg = arg.value;
            }
            if (isReference(arg)) {
                const scope = activeParameters?.size ? [...activeParameters.keys()].join(', ') : '';
                diagnoseAt({line: arg.line ?? call.line, column: arg.column ?? call.column}, 'E_UNKNOWN_VAR',
                    `Unknown identifier ${arg.reference}; declare it first`,
                    scope ? `the parameters in scope here: ${scope}` :
                        missingDeclarationFix(arg.reference, key === 'LIST' ? 'list' :
                            spec?.fields[key]?.variableType === 'broadcast' ||
                                spec?.inputs[key]?.shadowOpcode === 'event_broadcast_menu' ? 'broadcast' : 'variable'));
                continue;
            }
            /*
             * `null` = 积木上根本没有这个输入的记录（老作品里常见）；`_` / `() => {}` = 有这个输入、里面空着。
             * 打印器按同样两种写。可增减参数的积木也一样：加出来的口有几个看写了哪些名字（mutation 照算），
             * 每个口有没有输入记录照 null / _ 分。
             */
            if (arg === ABSENT) {
                if (!(spec?.fields[key] && !spec.inputs[key])) {
                    delete block.inputs[key];
                    continue;
                }
                arg = null;
            }
            if (arg === EMPTY) arg = null;
            // 返回槽收 true / false：和布尔槽一样编成 1=1 / 1=0（返回值积木本来就能装布尔块）
            if (typeof arg === 'boolean' && call.opcode === 'procedures_return' && key === 'RETURN') {
                arg = {opcode: 'operator_equals', args: {OPERAND1: 1, OPERAND2: arg ? 1 : 0},
                    line: call.line, column: call.column};
            }
            /*
             * schema 说这是下拉字段，积木上却是一个输入、里面放着菜单影子（生成器写的扩展积木；运行时两种都读得到）：
             * 按积木上的样子当输入处理，值写进那个影子。照字段处理的话值会再写一份到 fields 上，一字没改的积木平白多出字段。
             */
            const menuAsInput = !!old && hasOwn(old.inputs, key) && !hasOwn(old.fields, key) && !!spec?.fields[key] && !spec.inputs[key];
            if (!menuAsInput && ((spec?.fields[key] && !spec.inputs[key]) ||
                (old && hasOwn(old.fields, key) && !hasOwn(old.inputs, key)))) {
                const name = key;
                if (spec && !spec.fields[name] && !(old && hasOwn(old.fields, name))) {
                    diagnose(call, 'E_UNKNOWN_ARG', `Unknown field ${name}`, Object.keys(spec.fields).join(', '));
                }
                if (arg === null || typeof arg === 'object') {
                    diagnose(call, 'E_SLOT_TYPE', `Field ${name} requires a literal`);
                } else {
                    const field = own(block.fields, name) ?? {name, value: arg};
                    const kind = name === 'LIST' ? 'list' : spec?.fields[name]?.variableType;
                    let fieldId = field.id;
                    if (kind && kind !== 'broadcast' && (options.variables || parsed.declarations.length)) {
                        const raw = String(arg);
                        const explicit = raw.startsWith('@self/') ? 'self' : raw.startsWith('@stage/') ? 'stage' : null;
                        const label = explicit ? raw.slice(explicit.length + 2) : raw;
                        const selfRaw = own(options.variables?.self, label);
                        const stageRaw = own(options.variables?.stage, label);
                        const self = (Array.isArray(selfRaw) ? selfRaw.find(item => item.type === kind) : selfRaw) ?? createdVariables.find(v =>
                            v.scope === 'sprite' && v.name === label && (v.type === 'list' ? 'list' : 'variable') === kind)?.id;
                        const stage = (Array.isArray(stageRaw) ? stageRaw.find(item => item.type === kind) : stageRaw) ?? createdVariables.find(v =>
                            v.scope === 'stage' && v.name === label && (v.type === 'list' ? 'list' : 'variable') === kind)?.id;
                        const at = own(call.fieldLocations, name) ?? call;
                        if (!explicit && self && stage) {
                            diagnoseAt(at, 'E_AMBIGUOUS_VAR',
                                `${label} is ambiguous: a sprite ${kind} and a stage ${kind} both exist. Use @self/${label} or @stage/${label}`,
                                `write "@self/${label}" or "@stage/${label}" here, or declare the one you mean: ` +
                                `const ${label} = sprite.${kind}("${label}"); or const ${label} = stage.${kind}("${label}");`);
                        }
                        const binding = explicit === 'self' ? self : explicit === 'stage' ? stage : self ?? stage;
                        if (binding && typeof binding !== 'string' && binding.type !== kind) {
                            diagnoseAt(at, 'E_UNKNOWN_VAR', `${label} is a ${binding.type}, not a ${kind}`);
                        }
                        const declaredAlias = explicit ? declaredEntities.get(JSON.stringify([explicit, kind, label])) : undefined;
                        const declared = declaredAlias ? bindings.get(declaredAlias) : undefined;
                        fieldId = declared?.id ?? (typeof binding === 'string' ? binding : binding?.id);
                        if (!fieldId) diagnoseAt(at, 'E_UNKNOWN_VAR', `Unknown ${kind} ${label}`,
                            missingDeclarationFix(label, kind, explicit === 'self' ? 'sprite' : explicit === 'stage' ? 'stage' : undefined));
                    } else if (kind && kind !== 'broadcast' && !fieldId) {
                        diagnose(call, 'E_UNKNOWN_VAR', `Declare ${String(arg)} in variables.json first`);
                    } else if (kind === 'broadcast') {
                        const label = String(arg);
                        fieldId = own(options.broadcasts, label) ?? own(createdBroadcasts, label) ??
                            (field.value === arg ? fieldId : undefined) ?? orphanBroadcast(label);
                        if (!fieldId) diagnose(call, 'E_UNKNOWN_VAR', `Declare broadcast ${label} first`, missingDeclarationFix(label, 'broadcast'));
                    }
                    const written = kind && typeof arg === 'string' ? arg.replace(/^@(self|stage)\//, '') : arg;
                    // 字段还指着同一个变量 / 列表（id 没变）：字段里记的名字不动。改过名的变量，旧积木上可能还留着旧名字，
                    // 认的是 id；文本里按现在的名字写，不等于要改这块积木
                    const displayValue = kind && kind !== 'broadcast' && hasOwn(old?.fields, name) && typeof field.id === 'string' &&
                        field.id === fieldId ? field.value : written;
                    block.fields[name] = {...field, value: displayValue, ...(fieldId !== undefined ? {id: fieldId} : {}),
                        ...(kind === 'broadcast' ? {variableType: 'broadcast_msg'} : kind === 'list' ? {variableType: 'list'} : {})};
                    const fieldSpec = spec?.fields[name];
                    const allowed = fieldSpec?.dynamicOptions ? own(own(options.dynamicOptions, call.opcode), name) :
                        fieldSpec?.options;
                    // 选项大小写不敏感：VM 运行时也这样认（老作品里特效名是小写 color / ghost），存的值照原样
                    const wanted = String(arg).toLowerCase();
                    if (allowed && !allowed.some(option => option.toLowerCase() === wanted) &&
                        own(old?.fields, name)?.value !== arg) {
                        diagnose(call, 'E_BAD_OPTION', `Invalid ${name}; choose ${allowed.join(', ')}`);
                    }
                }
                continue;
            }
            // 槽数已经超限（E_VARIADIC_LIMIT）：那一条诊断就够了，别再为每个多出来的槽报一遍未知输入
            if (spec && !dynamic?.error && !spec.inputs[key] && !(old && hasOwn(old.inputs, key)) &&
                call.opcode !== 'procedures_call' && call.opcode !== 'procedures_call_with_return') {
                if (key.startsWith('$extra_')) {
                    const names = spec.parameters ?? Object.keys(spec.inputs);
                    diagnose(call, 'E_UNKNOWN_ARG', `${displayOpcode(call.opcode, spec.category)} takes ${names.length} argument(s)`,
                        extraArgumentFix(call.opcode, names));
                } else {
                    diagnose(call, 'E_UNKNOWN_ARG', `Unknown input ${key}`,
                        unknownInputFix(call.opcode, key) ?? Object.keys(spec.inputs).join(', '));
                }
            }
            const expected = spec?.inputs[key]?.type ?? procedureTypes[key];
            if (expected === 'stack' && !isStack(arg) && arg !== null) diagnose(call, 'E_SLOT_TYPE', `${key} requires a callback`);
            if (expected === 'boolean' && !isCall(arg) && typeof arg !== 'boolean' && arg !== null) {
                diagnose(call, 'E_SLOT_TYPE', `${key} requires a Boolean`, booleanFix(null));
            }
            const hadInput = hasOwn(block.inputs, key);
            const existing: VmInput = own(block.inputs, key) ?? {name: key, block: null, shadow: null};
            const input = {...existing};
            block.inputs[key] = input;
            if (isStack(arg)) {
                if (!key.startsWith('SUBSTACK') && spec?.inputs[key]?.type !== 'stack') {
                    diagnose(call, 'E_SLOT_TYPE', `${key} is not a stack input`);
                }
                input.block = makeStack(arg, id, input.block);
            } else if (isCall(arg) && (arg.asShadow || isBinderShadow(spec?.inputs[key], arg, own(old?.inputs, key)))) {
                // 回调参数槽：影子就是那块可再生 reporter 本身（没有字段）
                const shadowId = pick(arg.opcode, input.shadow || input.block);
                const previous = blocks[shadowId];
                blocks[shadowId] = {...previous, id: shadowId, opcode: arg.opcode, parent: id, next: null, inputs: {}, fields: {},
                    shadow: true, topLevel: false};
                used.add(shadowId);
                input.block = shadowId;
                input.shadow = shadowId;
            } else if (isCall(arg)) {
                if (key.startsWith('SUBSTACK')) diagnose(call, 'E_SLOT_TYPE', `${key} requires a callback`);
                if (schema) {
                    const child = schema[arg.opcode];
                    const returnCode = arg.opcode === 'procedures_call_with_return' &&
                        typeof arg.args.proccode === 'string' ? parseProcedure(arg.args.proccode).code : null;
                    const returnMutation = returnCode ? procedures.get(returnCode)?.mutation : null;
                    const childShape = returnMutation?.returntype === 'boolean' ? 'boolean' : child?.shape;
                    const sameLegacySlot = own(old?.inputs, key)?.block &&
                        blocks[own(old?.inputs, key)!.block as string]?.opcode === arg.opcode;
                    if (child && child.shape !== 'reporter' && child.shape !== 'boolean' && child.shape !== 'shadow') {
                        diagnose(arg, 'E_SLOT_TYPE', `${arg.opcode} is not a reporter`);
                    }
                    if (child && expected === 'boolean' && childShape !== 'boolean' && !sameLegacySlot && !arg.forced) {
                        diagnose(arg, 'E_SLOT_TYPE', `${key} requires a Boolean reporter`, booleanFix(arg));
                    }
                }
                // 原来这个输入就被积木盖着、底下没有影子（生成器、旧版本写的）：照旧不补，带底写回一字不差
                const coveredBare = !!existing.block && !existing.shadow && hadInput;
                input.block = make(arg, id, input.block).id;
                if (!input.shadow && !coveredBare && expected !== 'boolean' && expected !== 'stack') {
                    const opcode = procedureShadows[key] ?? spec?.inputs[key]?.shadowOpcode ??
                        (expected === 'number' ? 'math_number' : 'text');
                    const fieldName = Object.keys(schema[opcode]?.fields ?? {})[0] ??
                        (opcode.startsWith('math_') ? 'NUM' : 'TEXT');
                    const field = schema[opcode]?.fields[fieldName];
                    const menu = own(own(options.dynamicOptions, opcode), fieldName) ?? field?.options;
                    const broadcastNames = Object.keys({...options.broadcasts, ...createdBroadcasts});
                    if (spec?.inputs[key]?.binder) {
                        // 参数槽被别的积木盖住：底下的影子仍是那块没有字段的可再生 reporter
                        const shadowId = pick(opcode);
                        blocks[shadowId] = {id: shadowId, opcode, parent: id, next: null, inputs: {}, fields: {}, shadow: true,
                            topLevel: false};
                        used.add(shadowId);
                        input.shadow = shadowId;
                    } else if (opcode !== 'event_broadcast_menu' || broadcastNames.length) {
                        const fallback = procedureMenuDefaults[key] ?? spec?.inputs[key]?.defaultValue ?? menu?.[0] ??
                            (opcode === 'event_broadcast_menu' ? broadcastNames[0] :
                                opcode.startsWith('math_') ? 0 :
                                    // 颜色框序列化要求 #rrggbb，空串会让 check 过、run 才报 schema 错
                                    opcode === 'colour_picker' ? '#000000' : '');
                        const shadow = make({opcode, args: {[fieldName]: fallback}, line: call.line, column: call.column}, id);
                        shadow.shadow = true;
                        input.shadow = shadow.id;
                    }
                }
                if (input.shadow && blocks[input.shadow]) used.add(input.shadow);
            } else if (arg === null) {
                input.block = null;
                if (input.shadow && blocks[input.shadow]) used.add(input.shadow);
            } else if (typeof arg === 'number' || typeof arg === 'string' || typeof arg === 'boolean') {
                if (expected === 'boolean' && typeof arg === 'boolean') {
                    input.block = make({opcode: 'operator_equals', args: {OPERAND1: 1, OPERAND2: arg ? 1 : 0},
                        line: call.line, column: call.column}, id, input.block).id;
                    input.shadow = null;
                    continue;
                }
                if (typeof arg === 'boolean') {
                    diagnose(call, 'E_SLOT_TYPE', `${key} accepts booleans only in a Boolean slot`,
                        'a value slot holds numbers and text: write 1 / 0, or the text "true" / "false"; ' +
                        'keep a comparison (v > 0) for conditions');
                    continue;
                }
                // schema 不认识这个槽、但积木上已经有这个输入的影子（老 schema 没有可增减的槽、hat 参数椭圆……）：
                // 沿用原来影子的种类，不悄悄换成文字框
                const keptShadow = spec && !spec.inputs[key] && input.shadow ? blocks[input.shadow]?.opcode : undefined;
                const expectedShadow = procedureShadows[key] ?? spec?.inputs[key]?.shadowOpcode ?? keptShadow;
                // 不写包装的字面量按这个输入的默认输入框解释（和打印器同一条规则，见 inferShadow）；放不下就报错，
                // 不悄悄换成文字框
                const shadowOpcode: string | null = shadowOverride ?? inferShadow(expectedShadow, arg, numericLiteral);
                if (!shadowOpcode) {
                    diagnose(call, 'E_SLOT_TYPE', `${key} expects ${expectedShadow}; ${JSON.stringify(arg)} does not fit`,
                        `text(${JSON.stringify(arg)})`);
                    continue;
                }
                const shadowId = pick(shadowOpcode, input.shadow || input.block);
                const shadow: VmBlock = blocks[shadowId] ? {...blocks[shadowId], fields: {...blocks[shadowId].fields}} :
                    {id: shadowId, opcode: shadowOpcode, parent: id, next: null, inputs: {}, fields: {}, shadow: true, topLevel: false};
                const fieldName = Object.keys(shadow.fields)[0] ?? Object.keys(schema[shadowOpcode]?.fields ?? {})[0] ??
                    (shadowOpcode.startsWith('math_') ? 'NUM' : 'TEXT');
                const previousValue = shadow.fields[fieldName]?.value;
                const previousFieldId = shadow.fields[fieldName]?.id;
                // 场景菜单的字面量：名字 / id / 前缀 → 存场景 id（菜单值就是 id，改名后引用自动跟着）。
                // 原值没动（旧作品直接存名字、已删场景残留的值）就留着，只在解析不了时警告；reporter 输入不走这里
                if (options.sceneMenus && isSceneMenuOpcode(shadowOpcode)) {
                    const sceneRaw = String(arg);
                    const kept = previousValue !== undefined && String(previousValue) === sceneRaw;
                    try {
                        const sceneId = resolveSceneMenuValue(sceneRaw, options.sceneMenus.scenes);
                        if (!kept) {
                            // 积木原来指向的场景还在、它现在的名字不是文本里写的这个：读完文本之后场景可能改过名（原名被别的场景接手），
                            // 这时按名字解析会悄悄改指到另一个场景。不阻止（也可能是有意改指），但明说
                            const previousScene = previousValue === undefined ? undefined :
                                options.sceneMenus.scenes.find(scene => scene.id === String(previousValue));
                            if (previousScene && previousScene.id !== sceneId && previousScene.name !== sceneRaw) {
                                warn(call, 'W_SCENE_RENAMED',
                                    `${call.opcode.replace('_', '.')}.${key}: the block pointed at scene ${JSON.stringify(previousScene.name)} (${previousScene.id}), ` +
                                    `but the text names ${JSON.stringify(sceneRaw)}, which is a different scene (${sceneId}); the block now points there`,
                                    'if a scene was renamed after you read this file, read it again and keep the new name');
                            }
                            arg = sceneId;
                        }
                    } catch (error) {
                        if (!(error instanceof SceneRefError)) throw error;
                        if (!kept) {
                            diagnose(call, error.code, error.message, error.fix);
                            continue;
                        }
                        warn(call, 'W_SCENE_REF_DANGLING',
                            `${call.opcode.replace('_', '.')}.${key}: scene ${JSON.stringify(sceneRaw)} no longer exists; ` +
                            'the block does nothing until it points at an existing scene');
                    }
                }
                // 值没变就留原来的写法（数字还是字符串、1.0 还是 1）：改已有作品时不无故改动存档
                // 数值比较要求旧值本身是个数：Number("") / Number(" ") 都是 0，别把新写的 0 判成"没变"而留下空串
                const previousIsNumeric = previousValue !== undefined && String(previousValue).trim() !== '' &&
                    Number.isFinite(Number(previousValue));
                const fieldValue = previousValue !== undefined && String(previousValue) === String(arg) ? previousValue :
                    typeof arg === 'number' && previousIsNumeric &&
                    Object.is(Number(previousValue), arg) ? previousValue :
                    typeof previousValue === 'number' && typeof arg === 'number' ? arg :
                    typeof previousValue === 'boolean' && typeof arg === 'boolean' ? arg : String(arg);
                shadow.fields[fieldName] = {...(shadow.fields[fieldName] ?? {name: fieldName}), value: fieldValue};
                // 兜底：写进去的字面量回读出来和输入对不上（不该发生，发生了就别静默）
                if (literalReadsBackDifferently(arg, fieldValue)) {
                    warn(call, 'W_LITERAL_CHANGED',
                        `${call.opcode}.${key}: wrote ${JSON.stringify(arg)} but the stored value reads back as ${JSON.stringify(fieldValue)}`);
                }
                if (schema[shadowOpcode]?.fields[fieldName]?.variableType === 'broadcast') {
                    const label = String(arg);
                    const broadcastId = own(options.broadcasts, label) ?? own(createdBroadcasts, label) ??
                        (previousValue === label ? previousFieldId : undefined) ?? orphanBroadcast(label);
                    if (!broadcastId) diagnose(call, 'E_UNKNOWN_VAR', `Declare broadcast ${label} first`, missingDeclarationFix(label, 'broadcast'));
                    else {
                        shadow.fields[fieldName].id = broadcastId;
                        shadow.fields[fieldName].variableType = 'broadcast_msg';
                    }
                }
                if (!(base[shadowId] && referrerOf(shadowId) === id)) shadow.parent = id;
                blocks[shadowId] = shadow;
                used.add(shadowId);
                input.block = shadowId;
                input.shadow = shadowId;
            } else diagnose(call, 'E_SLOT_TYPE', `Unsupported value for ${key}`);
        }
        if (call.opcode === 'control_stop') {
            // 下面能不能接积木由所选项决定，存在 mutation 里（和 Blockly 的 mutationToDom 一样），不由文字写
            const hasnext = String(block.fields.STOP_OPTION?.value === 'other scripts in sprite');
            // 旧积木上没有 mutation、下面也确实不能接积木（积木库读不到 hasnext 就当 false）：不添
            if (!(old && !old.mutation && hasnext === 'false')) {
                block.mutation = {...block.mutation, tagName: 'mutation', children: [], hasnext};
            }
        }
        if (spec) {
            for (const [key, input] of Object.entries(spec.inputs)) {
                if (input.required && !(key in call.args)) diagnose(call, 'E_MISSING_ARG', `Missing input ${key}`);
            }
            for (const [key, field] of Object.entries(spec.fields)) {
                // 新积木的每个字段都要给（`data.set()` 缺了变量名，打印出来是 null、编不回去）
                const absent = !hasOwn(call.args, key) && !hasOwn(block.fields, key);
                if (absent && (field.required || (!old && !call.opcode.startsWith('procedures_')))) {
                    diagnose(call, 'E_MISSING_ARG', `Missing field ${key}`,
                        field.options?.length ? `options: ${field.options.slice(0, 8).join(', ')}` : undefined);
                }
            }
        }
        if (call.body) {
            if (spec && spec.shape !== 'hat') diagnose(call, 'E_SLOT_TYPE', `${call.opcode} is not a hat`);
            const previousParameters = activeParameters;
            if (call.opcode === 'procedures_definition') {
                const slots = [...String(procedureLabel(rawCall)).matchAll(/%([snbc])\[([^\]]*)\]/g)];
                activeParameters = new Map((rawCall.parameters ?? []).map((identifier, index) =>
                    [identifier, {type: slots[index]?.[1] ?? 's', name: slots[index]?.[2] ?? identifier}]));
            } else if (call.hatBindings) {
                // hat 回调的形参：体内用到就是一块 ccw_hat_parameter（字是椭圆里的参数名）；作用域只在这个 hat 体
                activeParameters = new Map(call.hatBindings.map(binding =>
                    [binding.alias, {type: 'h', name: binding.name}]));
            }
            const insideDefinition = call.opcode === 'procedures_definition';
            if (insideDefinition) definitionDepth++;
            try { block.next = makeStack(call.body, id, old?.next); } finally { if (insideDefinition) definitionDepth--; }
            activeParameters = previousParameters;
        }
        return block;
    };
    const makeStack = (calls: Call[], parent: string | null, start?: string | null): string | null => {
        const candidates: string[] = [];
        const seen = new Set<string>();
        for (let id = start; id && base[id] && !seen.has(id); id = base[id].next) {
            candidates.push(id);
            seen.add(id);
        }
        let nextCandidate = start;
        let previous: VmBlock | null = null;
        let first: string | null = null;
        for (const call of calls) {
            // 文字里的简写（data.set、call["…"]）要先换成真正的操作码再和原积木比，不然这些积木每次都换新 id
            const opcode = lowerCall(call).opcode;
            const free = (id: string): boolean => base[id].opcode === opcode && !used.has(id) && !anchoredIds.has(id);
            const candidate = anchorFor(call, opcode) ?? (nextCandidate && base[nextCandidate] && free(nextCandidate) ?
                nextCandidate : candidates.find(free));
            const shape = schema[opcode]?.shape;
            if ((parent !== null || previous) && ['reporter', 'boolean', 'shadow', 'hat'].includes(shape ?? '') &&
                !candidate) diagnose(call, 'E_SLOT_TYPE', `${call.opcode} cannot be placed in a command stack`);
            // "停止该角色的其他脚本"下面还能接积木（gandi-blocks control.js：选这项才有下一个口）
            const stopWithNext = previous?.opcode === 'control_stop' &&
                previous.fields.STOP_OPTION?.value === 'other scripts in sprite';
            if (previous && schema[previous.opcode]?.terminal && !stopWithNext && !candidate) {
                diagnose(call, 'E_SLOT_TYPE', `Nothing can follow terminal block ${previous.opcode}`,
                    previous.opcode === 'control_forever' ?
                        'while (true) { ... } without a break never ends, so nothing can follow it; put the statements before the loop, ' +
                        'or add a break inside the loop (a while (true) loop with a break can end)' :
                        'put the statements before it; a terminal block ends the script');
            }
            const current = make(call, previous?.id ?? parent, candidate);
            statementIds.add(current.id);
            nextCandidate = candidate && base[candidate]?.next;
            if (previous) previous.next = current.id;
            if (!first) first = current.id;
            previous = current;
        }
        return first;
    };
    const roots = scriptRoots(base);
    const frameOrder = new Map<NonNullable<(typeof parsed.scriptFrames)[number]>, number>();
    const explicitAt: boolean[] = [];
    /*
     * 把文本里的每段脚本认回底稿里的脚本。四步，前面的先挑，挑走的后面不能再用：
     *  1. 写了 @id 的认那一块；
     *  2. 写了 @at 的认位置对得上的（去掉浮点尾巴后相等，见 sameCoordinate）—— 没写位置的脚本不能抢走它们，
     *     否则新脚本落在旧脚本的位置上叠住；
     *  3. 其余的按先后对：文本里的先后 ↔ 打印器的先后（scriptOrder），拿「顶层积木 + 这一串有哪些语句」当签名做最长公共子序列。
     *     一个字没改的文本逐段对上（哪怕没写 @at、没写 @id）；中间插了、删了一段，后面的不会跟着全部错开；
     *  4. 还没着落的拿剩下的同操作码脚本，再没有就拿剩下的任意一个（它那一串里同操作码的积木还能复用 id）。
     */
    const scriptOpcodes = parsed.scripts.map(stack => stack[0] ? lowerCall(stack[0]).opcode : undefined);
    const assigned: Array<VmBlock | undefined> = parsed.scripts.map(() => undefined);
    const taken = new Set<string>();
    const claim = (index: number, root: VmBlock | null | undefined): boolean => {
        if (!root || taken.has(root.id)) return false;
        assigned[index] = root;
        taken.add(root.id);
        return true;
    };
    parsed.scripts.forEach((stack, index) => {
        const anchor = stack[0]?.anchor;
        if (anchor && base[anchor]?.opcode === scriptOpcodes[index]) claim(index, base[anchor]);
    });
    /** 底稿里脚本 → 它所在的代码框 */
    const oldFrameOf = new Map<string, FrameTable[string]>();
    for (const frame of Object.values(originalFrames)) for (const id of frame.blocks ?? []) if (!oldFrameOf.has(id)) oldFrameOf.set(id, frame);
    type Scope = NonNullable<(typeof parsed.scriptFrames)[number]>;
    /** 代码框的原点：文本写了 @at 用它；没写而框里有认回来的脚本时，用那个框现在的位置；都没有就是 (0, 0) */
    const frameOrigin = (scope: Scope): {x: number; y: number} => {
        if (scope.at) return scope.at;
        for (const [index, item] of parsed.scriptFrames.entries()) {
            const existing = item === scope && assigned[index] ? oldFrameOf.get(assigned[index]!.id) : undefined;
            if (existing) return {x: existing.x, y: existing.y};
        }
        return {x: 0, y: 0};
    };
    // 框里写了 @at 的脚本：相对坐标换成绝对的，再和别的写了位置的脚本一起按位置认
    parsed.scripts.forEach((stack, index) => {
        const call = stack[0];
        const frame = parsed.scriptFrames[index];
        explicitAt[index] = !!call?.at;
        if (!call?.at || !frame) return;
        const origin = frameOrigin(frame);
        call.at = {x: origin.x + call.at.x, y: origin.y + call.at.y};
    });
    parsed.scripts.forEach((stack, index) => {
        const coordinates = stack[0]?.at;
        if (assigned[index] || !coordinates) return;
        claim(index, roots.find(root => !taken.has(root.id) && root.opcode === scriptOpcodes[index] &&
            sameCoordinate(root.x, coordinates.x) && sameCoordinate(root.y, coordinates.y)));
    });
    {
        // 文本里的写法 → 积木的操作码（只为比签名：不降级参数，认不准的不影响正确性，只是少对上一段）
        const quick = (call: Call): string => call.opcode === 'data_set' ? 'data_setvariableto' :
            call.opcode === 'data_change' ? 'data_changevariableby' : call.opcode.startsWith('@proc:') ? 'procedures_call' :
                call.opcode.startsWith('@call:') ? 'procedures_run_branch' : call.opcode;
        const isHatOpcode = (opcode: string | undefined): boolean => opcode === 'procedures_definition' || schema[opcode ?? '']?.shape === 'hat';
        const textSignature = (index: number): string => {
            const stack = parsed.scripts[index];
            const rest = stack[0]?.body && isHatOpcode(scriptOpcodes[index]) ? stack[0].body : stack.slice(1);
            return [scriptOpcodes[index], ...rest.map(quick)].join(' ');
        };
        const rootSignature = (root: VmBlock): string => {
            const parts = [root.opcode];
            const seen = new Set<string>([root.id]);
            for (let id = root.next; id && base[id] && !seen.has(id); id = base[id].next) {
                seen.add(id);
                parts.push(base[id].opcode === 'procedures_call_with_return' ? 'procedures_call' : base[id].opcode);
            }
            return parts.join(' ');
        };
        const left = parsed.scripts.map((_, index) => index).filter(index => !assigned[index] && parsed.scripts[index][0]);
        const right = scriptOrder(base, originalFrames).filter(root => !taken.has(root.id));
        if (left.length && right.length) {
            const a = left.map(textSignature);
            const b = right.map(rootSignature);
            let head = 0;
            while (head < a.length && head < b.length && a[head] === b[head]) { claim(left[head], right[head]); head++; }
            let tailA = a.length;
            let tailB = b.length;
            while (tailA > head && tailB > head && a[tailA - 1] === b[tailB - 1]) { tailA--; tailB--; claim(left[tailA], right[tailB]); }
            const rows = tailA - head;
            const columns = tailB - head;
            // 中间那一截才做动态规划；上万段脚本两边都大改的情况不值得花这个内存，交给第 4 步
            if (rows && columns && rows * columns <= 4_000_000) {
                const width = columns + 1;
                const table = new Uint32Array((rows + 1) * width);
                for (let i = rows - 1; i >= 0; i--) {
                    for (let j = columns - 1; j >= 0; j--) {
                        table[i * width + j] = a[head + i] === b[head + j] ? table[(i + 1) * width + j + 1] + 1 :
                            Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
                    }
                }
                for (let i = 0, j = 0; i < rows && j < columns;) {
                    if (a[head + i] === b[head + j]) { claim(left[head + i], right[head + j]); i++; j++; } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) i++;
                    else j++;
                }
            }
        }
        const ordered = scriptOrder(base, originalFrames);
        parsed.scripts.forEach((stack, index) => {
            if (assigned[index] || !stack[0]) return;
            claim(index, ordered.find(root => !taken.has(root.id) && root.opcode === scriptOpcodes[index]));
        });
        parsed.scripts.forEach((stack, index) => {
            if (assigned[index] || !stack[0]) return;
            claim(index, ordered.find(root => !taken.has(root.id)));
        });
    }
    /*
     * 框里没写位置的脚本：认回来的、原来就在框里的旧脚本留在它在框里原来的地方（框挪了就跟着挪），没写位置不等于要重新摆；
     * 其余的先从框的原点起往下排（每段 64），再交给自动排位。
     */
    const keptInFrame: boolean[] = [];
    parsed.scripts.forEach((stack, index) => {
        const call = stack[0];
        const frame = parsed.scriptFrames[index];
        if (!call || !frame) return;
        const order = frameOrder.get(frame) ?? 0;
        frameOrder.set(frame, order + 1);
        if (explicitAt[index]) return;
        const origin = frameOrigin(frame);
        const old = assigned[index];
        const oldFrame = old && oldFrameOf.get(old.id);
        if (old && oldFrame && old.x !== undefined && old.y !== undefined) {
            call.at = {x: origin.x + (old.x - oldFrame.x), y: origin.y + (old.y - oldFrame.y)};
            keptInFrame[index] = true;
            return;
        }
        call.at = {x: origin.x, y: origin.y + order * 64};
    });
    const rootIds = parsed.scripts.map((stack, index) => makeStack(stack, null, assigned[index]?.id));
    const frameMembers = new Map<string, string[]>();
    const frameIds = new Map<NonNullable<(typeof parsed.scriptFrames)[number]>, string>();
    parsed.scriptFrames.forEach((scope, index) => {
        const rootId = rootIds[index];
        if (!scope || !rootId) return;
        const existing = Object.values(frames).find(frame => frame.blocks?.includes(rootId));
        const frameId = frameIds.get(scope) ?? existing?.id ?? fresh();
        frameIds.set(scope, frameId);
        if (!frames[frameId]) {
            frames[frameId] = {id: frameId, title: scope.title, blocks: [], x: scope.at?.x ?? blocks[rootId].x ?? 0,
                y: scope.at?.y ?? blocks[rootId].y ?? 0, width: scope.size?.width ?? 400,
                height: scope.size?.height ?? 300};
        }
        const frame = frames[frameId];
        frame.title = scope.title;
        // 位置、尺寸、颜色、开关：和原来是同一个意思（浮点尾巴、颜色写法、false 和没写）就不动原值，带底写回一字不差
        if (scope.at && !(sameCoordinate(frame.x, scope.at.x) && sameCoordinate(frame.y, scope.at.y))) { frame.x = scope.at.x; frame.y = scope.at.y; }
        if (scope.size && !(sameCoordinate(frame.width, scope.size.width) && sameCoordinate(frame.height, scope.size.height))) {
            frame.width = scope.size.width;
            frame.height = scope.size.height;
        }
        const colorKey = (color: string | undefined): string => (color ?? '45, 140, 255').replace(/ /g, '');
        if (colorKey(frame.color) !== colorKey(scope.color)) frame.color = scope.color ?? '45, 140, 255';
        if (!!frame.locked !== !!scope.locked) frame.locked = !!scope.locked;
        if (!!frame.collapsed !== !!scope.collapsed) frame.collapsed = !!scope.collapsed;
        frameMembers.set(frameId, [...(frameMembers.get(frameId) ?? []), rootId]);
    });
    for (const [id, frame] of Object.entries(frames)) {
        const members = frameMembers.get(id);
        if (!members) {
            if (frame.blocks?.length) delete frames[id];
        } else if (frame.blocks.length !== members.length || members.some(root => !frame.blocks.includes(root))) {
            frame.blocks = members;
        }
    }
    if (diagnostics.length) return {blocks: null, comments: null, frames: null,
        createdBroadcasts: {}, createdVariables: [], warnings, notes, diagnostics};
    if (Object.keys(base).length) {
        const preserveShadow = (id: string): void => {
            if (used.has(id) || !base[id]) return;
            used.add(id);
            for (const input of Object.values(base[id].inputs)) {
                if (input.block) preserveShadow(input.block);
                if (input.shadow) preserveShadow(input.shadow);
            }
        };
        for (const block of Object.values(base)) {
            if (!block.shadow) continue;
            const parent = block.parent && base[block.parent];
            const referenced = parent && Object.values(parent.inputs)
                .some(input => input.block === block.id || input.shadow === block.id);
            if (!parent || (used.has(parent.id) && (!referenced || Object.values(blocks[parent.id]?.inputs ?? {})
                .some(input => input.block === block.id || input.shadow === block.id)))) preserveShadow(block.id);
        }
        // 表里的残块（从哪段脚本都走不到的非影子积木，连同它下面挂着的）：文本里没有它，不是「被删掉的语句」，原样留着
        const reachable = new Set<string>();
        const walk = (start: string): void => {
            const pending = [start];
            while (pending.length) {
                const id = pending.pop() as string;
                if (reachable.has(id) || !base[id]) continue;
                reachable.add(id);
                if (base[id].next) pending.push(base[id].next as string);
                for (const input of Object.values(base[id].inputs)) {
                    if (input.block) pending.push(input.block);
                    if (input.shadow) pending.push(input.shadow);
                }
            }
        };
        for (const root of roots) walk(root.id);
        const fromScripts = new Set(reachable);
        for (const block of Object.values(base)) if (!block.shadow && !fromScripts.has(block.id)) walk(block.id);
        for (const id of Object.keys(blocks)) {
            if (!used.has(id) && (fromScripts.has(id) || !reachable.has(id))) delete blocks[id];
        }
        for (const [id, comment] of Object.entries(comments)) {
            if (comment.blockId && base[comment.blockId] && !blocks[comment.blockId]) delete comments[id];
        }
    }
    /*
     * 没写位置的脚本自动排开（只动没位置的，见 dsl/layout.ts）：AI 几乎不写 @at，
     * 不排的话一页脚本全叠在 (0,0)。
     */
    if (options.autoLayout !== false) {
        const frameInfo: Record<string, {fixed: boolean; sized: boolean}> = {};
        for (const [scope, id] of frameIds) {
            // 原来就有的框、文本没写尺寸、成员也没多：尺寸照旧（不写 @size 不等于要重新量）
            const sameMembers = !!originalFrames[id] && (frames[id]?.blocks ?? []).every(member => originalFrames[id].blocks?.includes(member));
            frameInfo[id] = {fixed: !!scope.at || !!originalFrames[id], sized: !!scope.size || sameMembers};
        }
        placeCompiled({blocks, comments, frames, roots: rootIds, frameInfo,
            // 写了 @id 认回来的脚本和写了 @at 的一样：位置是定的，不因为和别的脚本叠在一起就被排开
            explicit: rootIds.map((id, index) => !!explicitAt[index] || (!!id && parsed.scripts[index][0]?.anchor === id)),
            placed: rootIds.map((id, index) => explicitAt[index] || ((!parsed.scriptFrames[index] || !!keptInFrame[index]) && !!id &&
                base[id]?.x !== undefined && base[id]?.y !== undefined)),
            labelOf: opcode => schema[opcode]?.text?.zh ?? schema[opcode]?.text?.en});
    }
    /*
     * 警告级诊断（不阻断写入）：作品能存、能跑，但行为多半不是作者想要的。
     * 在最终积木表上分析，调用的定义可以在别的页（procedureBlocks）。
     */
    const analyzeBlocks = (): void => {
        const loopy = YIELDING_OPCODE;
        const definitions = new Map<string, {warp: boolean; start: string | null}>();
        const addDefinitions = (table: BlockTable): void => {
            for (const block of Object.values(table)) {
                if (block.opcode !== 'procedures_definition') continue;
                const prototype = table[block.inputs.custom_block?.block ?? ''];
                const code = prototype?.mutation?.proccode;
                if (!code) continue;
                const warp = prototype.mutation?.warp;
                definitions.set(String(code), {warp: warp === true || warp === 'true', start: block.next ?? null});
            }
        };
        addDefinitions(options.procedureBlocks ?? {});
        addDefinitions(blocks);
        const all: BlockTable = {...options.procedureBlocks, ...blocks};
        const loopCache = new Map<string, boolean>();
        /** 这个过程的体（含它调用的非 warp 过程）里有没有循环 / 等待 */
        const containsLoop = (code: string, seen = new Set<string>()): boolean => {
            const top = seen.size === 0;
            if (top && loopCache.has(code)) return loopCache.get(code)!;
            if (seen.has(code)) return false;
            seen.add(code);
            let found = false;
            const visited = new Set<string>();
            const pending = [definitions.get(code)?.start];
            while (pending.length && !found) {
                const id = pending.pop();
                if (!id || visited.has(id)) continue;
                visited.add(id);
                const block = all[id];
                if (!block) continue;
                if (loopy.test(block.opcode) || yieldingExtensionLoop(block)) { found = true; break; }
                if (block.opcode.startsWith('procedures_call')) {
                    const callee = String(block.mutation?.proccode ?? '');
                    if (callee && callee !== code && definitions.has(callee) && !definitions.get(callee)!.warp &&
                        containsLoop(callee, seen)) found = true;
                }
                pending.push(block.next);
                for (const input of Object.values(block.inputs)) pending.push(input.block);
            }
            if (top) loopCache.set(code, found);
            return found;
        };
        const insideFrameLoop = (block: VmBlock): boolean => {
            const seen = new Set<string>();
            for (let parent = block.parent; parent && !seen.has(parent); parent = all[parent]?.parent) {
                seen.add(parent);
                const opcode = all[parent]?.opcode;
                if (opcode === 'control_forever' || opcode === 'control_repeat_until' || opcode === 'control_while') return true;
            }
            return false;
        };
        for (const [id, block] of Object.entries(blocks)) {
            const origin = locations.get(id);
            if (!origin || block.shadow) continue;
            const code = String(block.mutation?.proccode ?? '');
            const definition = definitions.get(code);
            if (block.opcode === 'procedures_call_with_return' && definition && !definition.warp && containsLoop(code)) {
                warn(origin, 'W_REPORTER_LOOP_NOT_WARP',
                    `${code} is used as an expression but is not @warp and its body contains a loop or wait; ` +
                    'the caller is suspended mid-expression and the value may arrive frames late',
                    'add @warp to its define(...)');
            } else if (block.opcode === 'procedures_call' && definition && !definition.warp && insideFrameLoop(block) &&
                containsLoop(code)) {
                warn(origin, 'W_FRAME_LOOP_NOT_WARP',
                    `${code} is called every frame from forever / repeat_until / while and is not @warp, ` +
                    'but its body contains a loop; each call can stretch over several frames',
                    'add @warp to its define(...)');
            } else if (block.opcode === 'looks_costume' && all[block.parent ?? '']?.opcode !== 'looks_switchcostumeto') {
                warn(origin, 'W_MENU_AS_VALUE',
                    'looks.costume(...) is a menu block, not a value: it only returns the fixed name written in it, ' +
                    'not the sprite\'s current costume',
                    'use looks.costumenumbername("name") (or "number") instead');
            }
        }
        /*
         * Gandi 专有积木：原版 Scratch 没有这些操作码，导出到原版 Scratch 的作品打不开。
         * 只数这次编译写出来的积木，报一条汇总（落在第一处使用的位置）。
         */
        const gandiOnly = new Map<string, {count: number; origin: Call}>();
        for (const [id, origin] of locations) {
            const block = blocks[id];
            if (!block || block.shadow || !hasOwn(GANDI_ONLY_BLOCKS, block.opcode)) continue;
            const entry = gandiOnly.get(block.opcode);
            if (entry) entry.count++; else gandiOnly.set(block.opcode, {count: 1, origin});
        }
        if (gandiOnly.size) {
            const first = [...gandiOnly.values()].map(entry => entry.origin)
                .sort((a, b) => a.line - b.line || a.column - b.column)[0];
            warn(first, 'W_GANDI_ONLY', `Uses Gandi-only blocks: ${[...gandiOnly].map(([opcode, entry]) =>
                `${opcode} (${GANDI_ONLY_BLOCKS[opcode]})${entry.count > 1 ? ` x${entry.count}` : ''}`).join(', ')}. ` +
                'A project exported to original Scratch cannot be opened (these blocks do not exist there)',
            'avoid them if the project must open in original Scratch: use operator.equals instead of ===, ' +
                'while / repeatUntil with a flag instead of break and continue, operator.mathop / multiplication instead of ** and ?:');
        }
    };
    analyzeBlocks();
    // ads.autoCreate(...) / ads.indexStart(...) 这些设置命令改的是整个作品的设置：新写进来时提一次
    const settingOpcodes = new Set(moreDataTypesIds(schema).flatMap(id => ['setAutoCreate', 'allowInputJSON', 'setShowPrefix',
        'setCase', 'indexStart', 'allowNegIdx'].map(name => `${id}_${name}`)));
    if (settingOpcodes.size) {
        const countSettings = (table: BlockTable): number => Object.values(table).filter(block => !block.shadow && settingOpcodes.has(block.opcode)).length;
        if (countSettings(blocks) > countSettings(base)) {
            notes.push('ads.* setting commands change a project-wide setting of the data-structure extension: it is stored in the stage\'s ' +
                'configuration comment, saved with the project, and applies to every script. In compile mode (the default) the ' +
                'indexing of a for...of loop is fixed when the script is compiled, so ads.indexStart(...) inside the same script does not change it');
        }
    }
    let map: SourceMapEntry[] | undefined;
    if (options.sourceMap) {
        map = [];
        for (const [id, origin] of locations) {
            if (origin.start === undefined || origin.end === undefined || !blocks[id]) continue;
            map.push({id, start: origin.start, end: origin.end, kind: statementIds.has(id) ? 'statement' : 'expression'});
        }
        map.sort((x, y) => x.start - y.start || y.end - x.end);
    }
    return {blocks, comments, frames, createdBroadcasts, createdVariables, warnings, notes, diagnostics, roots: rootIds,
        ...(map ? {map} : {})};
};

/**
 * 编译 DSL 源文。约定：只返回诊断，不抛异常。再深的结构（比如几千项的 join 链）递归会撑爆调用栈 ——
 * 解析器按 MAX_DEPTH 先拦下常见的深嵌套，漏过的这里兜底成 E_TOO_DEEP，其他意外报 E_INTERNAL，不让调用方拿到异常或空结果。
 */
export const compileDsl = (source: string, options: CompileOptions = {}): CompileResult => {
    try {
        return compileInner(source, options);
    } catch (error) {
        const tooDeep = error instanceof RangeError;
        return {blocks: null, comments: null, frames: null, createdBroadcasts: {}, createdVariables: [], warnings: [], notes: [],
            diagnostics: [{code: tooDeep ? 'E_TOO_DEEP' : 'E_INTERNAL', line: 1, column: 1, severity: 'error',
                message: tooDeep ? tooDeepMessage(MAX_DEPTH) : `Internal error while compiling: ${error instanceof Error ? error.message : String(error)}`,
                ...(tooDeep ? {fix: TOO_DEEP_FIX} : {}), ...(options.path ? {path: options.path} : {})}]};
    }
};
