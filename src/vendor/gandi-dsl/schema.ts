import type {BlockSpec, Schema, VariadicGroup, VariadicSlot} from './compiler';
import coreSchema from './core-schema.json';
import {CORE_VARIADIC} from './dynamic';
import {applyMoreDataTypesSchema} from './sugar/moreDataTypes';

interface BlockDefinition {
    inputList: Array<{
        name: string;
        type: number;
        connection?: {check_?: string[] | null};
        fieldRow: Array<{name?: string; getOptions?: () => Array<[string, string]>;
            getVariable?: () => unknown; defaultType_?: string; variableType_?: string; variableTypes_?: string[]}>;
    }>;
    previousConnection?: unknown;
    nextConnection?: unknown;
    outputConnection?: {check_?: string[] | null};
    getHatType?: () => string | null;
    toString?: () => string;
    dispose: () => void;
}

interface Workspace {
    newBlock: (opcode: string) => BlockDefinition;
    dispose: () => void;
}

interface BlockLibrary {
    Blocks: Record<string, unknown>;
    Workspace: new () => Workspace;
    INPUT_VALUE: number;
    NEXT_STATEMENT: number;
    Events?: {disable: () => void; enable: () => void};
    mainWorkspace?: Workspace | null;
    Xml?: {textToDom: (source: string) => Document};
}

interface ExtensionBlock {
    opcode: string;
    blockType?: string;
    text?: string;
    arguments?: Record<string, {type?: string; defaultValue?: unknown; menu?: string; shadowType?: string}>;
    branchCount?: number;
    /** 回调式积木（遍历 / map / reduce……）的 lambda 体输入名：一个表达式输入，里面能引用同一块积木上的参数槽 */
    lambdaInput?: string;
    /** VM 摊平后的可扩展段规格（extension-support/expandable-blocks.js 的 normalizeSegment；一段一份） */
    expandable?: unknown;
}

export interface ExtensionInfo {
    id: string;
    version?: string;
    url?: string;
    blocks: ExtensionBlock[];
    menus?: Record<string, Array<string | [string, string] | {text: string; value: unknown}> |
        {items: Array<string | [string, string] | {text: string; value: unknown}> | string;
            acceptReporters?: boolean} | string>;
}

const classify = (block: BlockDefinition): BlockSpec['shape'] => {
    if (block.getHatType?.()) return 'hat';
    if (block.outputConnection) {
        return block.outputConnection.check_?.includes('Boolean') ? 'boolean' : 'reporter';
    }
    return block.previousConnection ? 'command' : block.nextConnection ? 'hat' : 'shadow';
};

const projectMenus = new Set(['control_create_clone_of_menu', 'event_touchingobjectmenu',
    'event_whenbackdropswitchesto', 'looks_backdrops', 'looks_costume', 'looks_costumeinfo_menu',
    'looks_videomenu', 'looks_whenvideoends',
    'motion_glideto_menu', 'motion_goto_menu', 'motion_pointtowards_menu', 'procedures_dropdown_arg',
    // sensing_of 的属性菜单随所选角色变（还列出那个角色 / 舞台的变量名）
    'sensing_distancetomenu', 'sensing_of', 'sensing_of_object_menu', 'sensing_touchingobjectmenu',
    'sound_sounds_menu', 'sound_soundsorall_menu']);

/** 变量 / 列表积木的默认输入框（gandi-blocks core/data_category.js） */
const DATA_CATEGORY_SHADOWS: Record<string, Record<string, string>> = {
    data_setvariableto: {VALUE: 'text'},
    data_changevariableby: {VALUE: 'math_number'},
    data_addtolist: {ITEM: 'text'},
    data_deleteoflist: {INDEX: 'math_integer'},
    data_insertatlist: {INDEX: 'math_integer', ITEM: 'text'},
    data_replaceitemoflist: {INDEX: 'math_integer', ITEM: 'text'},
    data_itemoflist: {INDEX: 'math_integer'},
    data_itemnumoflist: {ITEM: 'text'},
    data_listcontainsitem: {ITEM: 'text'}
};

/** Keep extension argument shadows aligned with the VM's ArgumentTypeMap. */
const extensionShadows: Record<string, {opcode: string; field: string}> = {
    string: {opcode: 'text', field: 'TEXT'},
    number: {opcode: 'math_number', field: 'NUM'},
    angle: {opcode: 'math_angle', field: 'NUM'},
    color: {opcode: 'colour_picker', field: 'COLOUR'},
    note: {opcode: 'note', field: 'NOTE'},
    matrix: {opcode: 'matrix', field: 'MATRIX'},
    xigua_matrix: {opcode: 'xigua_matrix', field: 'XIGUA_MATRIX'},
    xigua_white_board_note: {opcode: 'xigua_white_board_note', field: 'XIGUA_WHITE_BOARD_NOTE'},
    ccw_hat_parameter: {opcode: 'ccw_hat_parameter', field: 'VALUE'},
    costume: {opcode: 'looks_costume', field: 'COSTUME'},
    sound: {opcode: 'sound_sounds_menu', field: 'SOUND_MENU'}
};

export interface ExportSchemaOptions {
    /**
     * 核心积木的参数顺序从哪来。'bundled'（默认）：随包的 core-schema.json；'live'：这一刻积木库排出来的顺序 ——
     * 只给生成 core-schema.json 的脚本用（它要的就是英文文案下的顺序）。
     */
    parameterOrder?: 'bundled' | 'live';
}

/**
 * 积木库里输入和字段的先后跟着当前语言的积木文案走（中文「%2 的第 %1 项」把列表排在序号前面），所以直接读出来的
 * parameters 在不同界面语言下不一样。DSL 的位置参数不能跟着界面语言变：同一份文本换个语言的编辑器就编不回去，
 * 或者两个参数悄悄对调。核心积木一律用随包 schema 的顺序；随包里没有的名字（积木库比随包新）接在后面。
 */
const bundledOrder = (opcode: string, live: string[]): string[] => {
    const bundled = (coreSchema as unknown as Record<string, {parameters?: string[]}>)[opcode]?.parameters;
    if (!bundled || !Object.prototype.hasOwnProperty.call(coreSchema, opcode)) return live;
    const known = bundled.filter(name => live.includes(name));
    return known.length === live.length ? known : [...known, ...live.filter(name => !known.includes(name))];
};

export const exportSchema = (library: BlockLibrary, extensions: ExtensionInfo[] = [], toolboxXML?: string,
    locale?: 'en' | 'zh', options: ExportSchemaOptions = {}): Schema => {
    const result: Schema = Object.create(null);
    const keepLiveOrder = options.parameterOrder === 'live';
    library.Events?.disable();
    const workspace = new library.Workspace();
    const previousWorkspace = library.mainWorkspace;
    if (!previousWorkspace) {
        (workspace as Workspace & {options: {pathToMedia: string}}).options = {pathToMedia: ''};
        library.mainWorkspace = workspace;
    }
    try {
        for (const opcode of Object.keys(library.Blocks)) {
            if (!/^[\w$]+_[\w$]+$/.test(opcode)) continue;
            let block: BlockDefinition | null = null;
            try {
                block = workspace.newBlock(opcode);
                const inputs: BlockSpec['inputs'] = {};
                const fields: BlockSpec['fields'] = {};
                const parameters: string[] = [];
                for (const input of block.inputList) {
                    for (const field of input.fieldRow) {
                        if (field.name && !parameters.includes(field.name)) parameters.push(field.name);
                    }
                    if (input.name && input.type === library.NEXT_STATEMENT) inputs[input.name] = {type: 'stack'};
                    else if (input.name && input.type === library.INPUT_VALUE) {
                        inputs[input.name] = {type: input.connection?.check_?.includes('Boolean') ? 'boolean' : 'string'};
                    }
                    if (input.name && (input.type === library.NEXT_STATEMENT || input.type === library.INPUT_VALUE) &&
                        !parameters.includes(input.name)) parameters.push(input.name);
                    for (const field of input.fieldRow) {
                        if (!field.name) continue;
                        let options: string[] | undefined;
                        try { options = field.getOptions?.().map(([, value]) => value); } catch { /* Dynamic options require a target. */ }
                        // Some shipped getters expose an empty variableType_ even on LIST.
                        const rawType = field.variableType_ || field.defaultType_ ||
                            (field.variableTypes_?.length === 1 ? field.variableTypes_[0] : undefined) ||
                            (field.name === 'LIST' ? 'list' : field.name === 'BROADCAST_OPTION' ? 'broadcast_msg' : '');
                        const variableType = typeof field.getVariable === 'function' ?
                            rawType === 'broadcast_msg' ? 'broadcast' : rawType === 'list' ? 'list' : 'variable' : undefined;
                        fields[field.name] = {...(options ? {options} : {}),
                            ...(projectMenus.has(opcode) ? {dynamicOptions: true} : {}),
                            ...(variableType ? {variableType} : {})};
                    }
                }
                let label: string | undefined;
                try { if (opcode !== 'colour_picker') label = block.toString?.(); }
                catch { /* Some menus need an active project. */ }
                const shape = classify(block);
                const branchCount = Object.values(inputs).filter(input => input.type === 'stack').length;
                result[opcode] = {shape, inputs, fields,
                    parameters: keepLiveOrder ? parameters : bundledOrder(opcode, parameters), category: opcode.split('_')[0],
                    ...(branchCount ? {branchCount} : {}),
                    ...(shape === 'command' && !block.nextConnection ? {terminal: true} : {}),
                    ...(locale && label && label !== '[object Object]' ? {text: {[locale]: label}} : {})};
            } catch { /* An incomplete dynamic definition cannot be instantiated without its project. */ }
            finally { block?.dispose(); }
        }
    } finally {
        workspace.dispose();
        library.mainWorkspace = previousWorkspace;
        library.Events?.enable();
    }
    // 变量、列表积木是积木栏按变量现生成的（gandi-blocks core/data_category.js 的 addBlock），不在积木栏 XML 里；
    // 它们的默认输入框照那张表抄
    for (const [opcode, inputs] of Object.entries(DATA_CATEGORY_SHADOWS)) {
        for (const [name, shadowOpcode] of Object.entries(inputs)) {
            if (result[opcode]?.inputs[name]) result[opcode].inputs[name].shadowOpcode = shadowOpcode;
        }
    }
    // 核心里能增减槽的积木：把可变输入组的声明写进 schema（扩展的由下面的 expandable 读出来）
    for (const [opcode, groups] of Object.entries(CORE_VARIADIC)) {
        if (result[opcode]) result[opcode].variadic = groups;
    }
    if (toolboxXML && library.Xml) {
        const tree = library.Xml.textToDom(toolboxXML);
        // 积木栏里同一种积木可能出现不止一次（测试用的「Extensions」分类里有另一份 event_whengreaterthan，阈值是 hat 参数椭圆）：
        // 同一个输入只认第一次出现的默认影子，后面的不覆盖
        const decided = new Set<string>();
        for (const block of Array.from(tree.querySelectorAll('block[type]'))) {
            const spec = result[block.getAttribute('type') ?? ''];
            if (!spec) continue;
            for (const input of Array.from(block.children)) {
                if (input.tagName.toLowerCase() !== 'value') continue;
                const name = input.getAttribute('name');
                const shadow = Array.from(input.children).find(child => child.tagName.toLowerCase() === 'shadow');
                if (!name || !shadow || !spec.inputs[name]) continue;
                const decision = `${block.getAttribute('type')}|${name}`;
                if (decided.has(decision)) continue;
                decided.add(decision);
                spec.inputs[name].shadowOpcode = shadow.getAttribute('type') ?? undefined;
                // 积木栏里 hat 参数椭圆的默认名写在影子的 VALUE 字段上
                if (spec.inputs[name].shadowOpcode === 'ccw_hat_parameter') {
                    const label = Array.from(shadow.children).find(child => child.getAttribute('name') === 'VALUE')?.textContent;
                    spec.inputs[name].hatParam = true;
                    if (label) spec.inputs[name].defaultValue = label;
                }
            }
        }
    }
    for (const extension of extensions) {
        const menuValues = (menuName: string): {menu: {acceptReporters?: boolean} | null; values: unknown[] | null;
            options: string[] | undefined} => {
            const rawMenu = extension.menus?.[menuName];
            const menu = rawMenu && !Array.isArray(rawMenu) && typeof rawMenu === 'object' ? rawMenu : null;
            const values = Array.isArray(rawMenu) ? rawMenu : menu && Array.isArray(menu.items) ? menu.items : null;
            const options = values?.map(value => String(Array.isArray(value) ? value[1] :
                typeof value === 'object' && value !== null ? (value as {value: unknown}).value : value));
            return {menu, values, options};
        };
        const registerMenuShadow = (menuName: string): void => {
            const {values, options} = menuValues(menuName);
            result[`${extension.id}_menu_${menuName}`] ??= {shape: 'shadow', inputs: {},
                fields: {[menuName]: {...(options ? {options} : {}), ...(!values ? {dynamicOptions: true} : {})}},
                category: extension.id, extension: {id: extension.id, version: extension.version, url: extension.url}};
        };
        for (const block of extension.blocks) {
            if (!block || typeof block.opcode !== 'string') continue;
            const opcode = `${extension.id}_${block.opcode}`;
            const type = String(block.blockType ?? '').toLowerCase();
            /*
             * blockType xml / button 只是积木栏里的摆放（预填好影子的一段 XML、一个按钮），不是积木定义。多莉 Pro 给隐藏的
             * 真积木再配一条同 opcode 的 xml 摆放项：照定义读的话它没有参数，会把前面那条真定义盖掉。
             */
            if (type === 'xml' || type === 'button') continue;
            const shape: BlockSpec['shape'] = type.includes('boolean') ? 'boolean' :
                type.includes('reporter') ? 'reporter' : type.includes('hat') || type.includes('event') ? 'hat' : 'command';
            const inputs: BlockSpec['inputs'] = {};
            const fields: BlockSpec['fields'] = {};
            const parameters: string[] = [];
            /*
             * 可扩展段（积木上的 ➕➖）：VM 已经把声明摊平成 info.expandable，起始槽数那几个槽也展开进了 text 和
             * arguments。这些槽不是固定参数：从 inputs / parameters 里拿出来，写成可变输入组（variadic），
             * 编译、打印按这份声明走。
             */
            const variadic: VariadicGroup[] = [];
            const grouped = new Set<string>();
            for (const raw of Array.isArray(block.expandable) ? block.expandable : block.expandable ? [block.expandable] : []) {
                const flat = raw as {members?: Array<Record<string, unknown>>; names?: unknown; min?: number; max?: number;
                    types?: unknown; start?: number; rename?: boolean; branchBase?: number | null; defaults?: Record<string, unknown[]>};
                if (!flat || !Array.isArray(flat.members) || !Array.isArray(flat.names) || !flat.names.length) continue;
                const slots: VariadicSlot[] = [];
                const start = Math.max(0, Number(flat.start) || 0);
                const flatTypes = Array.isArray(flat.types) && flat.types.length > 1 ?
                    flat.types.filter((letter): letter is string => ['s', 'n', 'b'].includes(letter as string)) : null;
                for (const member of flat.members) {
                    if (member.kind === 'branch') {
                        slots.push({name: 'SUBSTACK', kind: 'branch', type: 'stack', offset: flat.branchBase ?? 1});
                        continue;
                    }
                    if (member.kind !== 'input' || typeof member.name !== 'string') continue;
                    const memberType = String(member.type ?? '').toLowerCase();
                    const memberShadow = member.shadow as {type?: string; field?: string} | null | undefined;
                    const defaults = (flat.defaults?.[member.name] ?? []).map(item =>
                        typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean' ? item : null);
                    const hatParam = memberType === 'ccw_hat_parameter' || memberShadow?.type === 'ccw_hat_parameter';
                    slots.push({name: member.name, kind: 'input',
                        type: memberType.includes('boolean') ? 'boolean' :
                            ['number', 'angle', 'note', 'xigua_white_board_note'].includes(memberType) ? 'number' : 'string',
                        ...(member.menu ? {shadowOpcode: `${extension.id}_menu_${String(member.menu)}`} :
                            memberShadow?.type ? {shadowOpcode: memberShadow.type} : {}),
                        ...(defaults.length ? {defaults} : {}), ...(hatParam ? {hatParam: true} : {}),
                        // 声明了逐槽类型（flat.types）的组：这个槽的类型由用户在积木上选
                        ...(member.typed === true && flatTypes ? {typed: true} : {})});
                    if (member.menu) registerMenuShadow(String(member.menu));
                    if (memberShadow?.type && !member.menu && !result[memberShadow.type]) {
                        result[memberShadow.type] = {shape: 'shadow', inputs: {},
                            fields: {[memberShadow.field ?? 'VALUE']: {}}, parameters: [memberShadow.field ?? 'VALUE']};
                    }
                    for (let unit = 1; unit <= start; unit++) grouped.add(`${member.name}${unit}`);
                }
                const names = slots.filter(slot => slot.kind === 'input').map(slot => slot.name);
                if (!names.length) continue;
                const branch = slots.find(slot => slot.kind === 'branch');
                variadic.push({slots, min: Number(flat.min) || 0, max: Number(flat.max) || 16, start,
                    ...(flat.rename ? {rename: true} : {}), compact: true,
                    ...(flatTypes && flatTypes.length > 1 ? {types: flatTypes} : {}),
                    mutation: {count: 'items', prefix: [...names, ...(branch ? [`SUBSTACK+${branch.offset}`] : [])].join(',')}});
            }
            /*
             * 位置参数的先后只看 arguments 的键序，不看积木文字里占位符的先后：文字跟着界面语言走（译文常常换语序），
             * 照它排的话同一行代码在中文界面和英文界面里是两个意思。键序是扩展 getInfo() 里写下的，各种语言下都一样。
             */
            for (const [name, argument] of Object.entries(block.arguments ?? {})) {
                const argumentType = String(argument.type ?? '').toLowerCase();
                // An inline image is a label field, not a value the DSL needs to supply.
                if (argumentType === 'image') continue;
                const inGroup = grouped.has(name);
                if (!inGroup && !parameters.includes(name)) parameters.push(name);
                const {menu, values, options} = menuValues(argument.menu ?? '');
                if (argument.menu && menu?.acceptReporters !== true) {
                    fields[name] = {...(options ? {options} : {}), ...(!values ? {dynamicOptions: true} : {})};
                    continue;
                }
                const shadow = extensionShadows[argumentType];
                const hatParam = argumentType === 'ccw_hat_parameter';
                /*
                 * 自定义影子（`shadowType: "扩展id_积木"`，积木栏里这个输入摆的是那块积木的影子）。影子是同一个扩展里一块
                 * 没有任何输入的 reporter 时，这个输入是回调的「参数槽」：积木栏里生成的是一块能从槽里拖出副本来用的
                 * 可再生 reporter（和 hat 参数椭圆同一类，只是名字固定、不存字段）。DSL 里写成回调形参。
                 */
                const customShadow = typeof argument.shadowType === 'string' && argument.shadowType ? argument.shadowType : undefined;
                const shadowTarget = customShadow ? extension.blocks.find(item => item && typeof item.opcode === 'string' &&
                    `${extension.id}_${item.opcode}` === customShadow) : undefined;
                const binder = !!shadowTarget && String(shadowTarget.blockType ?? '').toLowerCase().includes('reporter') &&
                    !Object.values(shadowTarget.arguments ?? {}).some(item => String(item?.type ?? '').toLowerCase() !== 'image');
                if (!inGroup) {
                    inputs[name] = {type: argumentType.includes('boolean') ? 'boolean' :
                        ['number', 'angle', 'note', 'xigua_white_board_note'].includes(argumentType) ? 'number' : 'string',
                    // hat 参数椭圆里的默认字是占位名（runtime 的 _convertPlaceholders），不是 defaultValue
                    ...(hatParam ? {defaultValue: name} : typeof argument.defaultValue === 'string' ||
                        typeof argument.defaultValue === 'number' || typeof argument.defaultValue === 'boolean' ?
                        {defaultValue: argument.defaultValue} : {}),
                    ...(argument.menu ? {shadowOpcode: `${extension.id}_menu_${argument.menu}`} :
                        customShadow ? {shadowOpcode: customShadow} : shadow ? {shadowOpcode: shadow.opcode} : {}),
                    ...(hatParam ? {hatParam: true} : {}), ...(binder && !argument.menu ? {binder: true} : {})};
                }
                if (shadow && !result[shadow.opcode]) {
                    result[shadow.opcode] = {shape: 'shadow', inputs: {}, fields: {[shadow.field]: {}},
                        parameters: [shadow.field]};
                }
                if (argument.menu) registerMenuShadow(argument.menu);
            }
            for (let index = 0; index < (block.branchCount ?? 0); index++) {
                const name = index ? `SUBSTACK${index + 1}` : 'SUBSTACK';
                inputs[name] = {type: 'stack'};
                parameters.push(name);
            }
            result[opcode] = {shape, inputs, fields, parameters, category: extension.id,
                ...(block.branchCount ? {branchCount: block.branchCount} : {}),
                ...(typeof block.lambdaInput === 'string' && inputs[block.lambdaInput] ? {lambda: block.lambdaInput} : {}),
                ...(variadic.length ? {variadic} : {}),
                ...(type.includes('end') ? {terminal: true} : {}),
                text: block.text ? {en: block.text} : undefined,
                extension: {id: extension.id, version: extension.version, url: extension.url}};
        }
    }
    // 「高级数据结构」自己改 Blockly.Blocks 做的动态参数，getInfo 里只有取不到的 dynamicArgsInfo：并入内置描述表
    return applyMoreDataTypesSchema(result);
};
