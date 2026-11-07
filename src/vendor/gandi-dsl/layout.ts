/**
 * 积木脚本的自动排布（纯函数，不碰 DOM，node 里能直接跑）。
 *
 * 要解决的事：AI 写的脚本几乎不带 `@at`，一页十几串脚本全落在 (0,0) 叠成一团；
 * 原版「整理积木」又只会排一竖列，左右空着、无限往下。这里按脚本之间真实的关系
 * 和真实的尺寸把它们摆成一屏看得下的样子。
 *
 * ## 怎么摆
 *
 * 1. **分组**：define ↔ 调用它的脚本、广播发送 ↔ 收到广播、脚本框架（frame）
 *    是强关系，连通的算一组；同一个变量只被两三串脚本碰到是弱关系，合并后一组不
 *    超过 6 串才并。没有任何关系的脚本不成组，进「散件」。
 * 2. **组内分列**：入口（绿旗、按键、点击、收到广播、克隆启动）在最左一列，被它
 *    调用的 define / 它广播出去的接收者放在右边相邻的一列，依此类推（最多 5 列）。
 *    右列的脚本尽量和它的调用方同一高度；一列堆不下（超过一屏高）就另起一列，
 *    超长脚本自己占一列。
 * 3. **装箱**：每串脚本按估出来的宽高占位（宽度也算），整组当成一个矩形，组与
 *    组之间留大间距，按「书架」方式从左到右、满了换行，整体宽高比逼近 16:9。散
 *    件按类别（绿旗、按键、点击……）分到若干竖列，列和列并排。
 * 4. **注释跟着积木**：积木附带的注释放在所属脚本右侧、和所属那块积木同一高度；
 *    独立注释排成页面最上面的一条。
 * 5. **只动该动的**：`mode: 'new'` 只摆调用方点名的脚本，其余原样当障碍，新摆的
 *    落在空位上；`mode: 'all'` 整页重排（`gandi arrange`、编辑器的「整理积木」）。
 *
 * ## 估算宁大勿小
 *
 * 高度的常量照积木库的排版（见 blocks/lostLayout 的历史说明）；宽度按积木文字
 * 长度、输入个数粗估。估高只是空一点，估低会压住，所以宽高都留余量。编辑器里已
 * 经画出来的积木有真尺寸，调用方可以用 `measure` 覆盖。
 *
 * ## 确定性
 *
 * 排布只取决于积木表里的先后顺序和脚本内容，不看当前坐标，所以对同一张表再排一
 * 次得到一样的结果（幂等）。
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export interface Pos {x: number; y: number}
export interface Rect {x: number; y: number; w: number; h: number}

/** 排布用到的积木表、注释表、框架表（和 dsl/blocks.ts 里的形状一致，这里只取要用的字段）。 */
export type LayoutBlocks = Record<string, Any>;
export type LayoutComments = Record<string, Any>;
export type LayoutFrames = Record<string, Any>;

/* ------------------------------------------------------------------ 常量 */

/** 积木库排版常量，名字和 block_render_svg_vertical.js 对应。 */
const BLOCK_H = 48;
const EXTENSION_EXTRA_H = 8;
const HAT_H = 16;
const DEFINE_HAT_H = 40;
const EMPTY_BRANCH_H = 24;
const BRANCH_TAIL_H = 32;
/** 高度余量：估高只是空一点，估低会压住。 */
const SLACK_H = 1.04;
const SLACK_W = 1.15;

/** 脚本之间（同一列里上下）的间距。 */
const GAP_Y = 40;
/** 列和列（同一组里）的间距。 */
const GAP_COL = 72;
/** 列越宽，估宽的误差绝对值越大：列间距随列宽按比例加大。 */
const colGap = (width: number, base = GAP_COL): number => Math.max(base, Math.round(width * 0.12));
/** 组和组的间距。 */
const GAP_GROUP = 112;
/** 散件列和列的间距。 */
const GAP_LOOSE = 56;
/** 积木右边到它的注释的距离。 */
const COMMENT_GAP = 24;
const COMMENT_W = 200;
const COMMENT_H = 200;
const COMMENT_MINIMIZED_H = 40;
/** 排布的起点（和积木库自带整理的起点同一个位置）。 */
const ORIGIN: Pos = {x: 48, y: 64};
/** 目标宽高比：一屏。 */
const ASPECT = 16 / 9;
/** 一个组最多几列（再深的关系都落在最后一列）。 */
const MAX_DEPTH = 4;
/** 弱关系（共用变量）合并出来的组最大脚本数。 */
const WEAK_GROUP_CAP = 6;
/** 一列最矮的目标高度，别让很小的页面被切成细条。 */
const MIN_COLUMN_H = 480;
/** 框架里的内边距。 */
const FRAME_PAD = 24;

const CORE_CATEGORIES = new Set([
    'motion', 'looks', 'sound', 'event', 'control', 'sensing',
    'operator', 'operators', 'data', 'procedures', 'argument', 'math', 'text'
]);

/* ------------------------------------------------------------------ 尺寸估算 */

/** 一段文字大概多宽：中日韩字宽、其余字窄。`?` 是输入位，不算字。 */
const textWidth = (text: string): number => {
    let width = 0;
    for (const char of text) {
        if (char === '?') {
            continue;
        }
        const code = char.codePointAt(0) ?? 0;
        width += code >= 0x2e80 ? 12.5 : char === ' ' ? 3.5 : 6.4;
    }
    return width;
};

export type LabelOf = (opcode: string) => string | undefined;

/** 没有 schema 文字时，拿操作码的后半截凑一个长度。 */
const fallbackLabel = (opcode: string): string => {
    const at = opcode.indexOf('_');
    return at >= 0 ? opcode.slice(at + 1) : opcode;
};

const fieldText = (block: Any): number => {
    let total = 0;
    for (const field of Object.values(block?.fields ?? {}) as Any[]) {
        total += Math.min(textWidth(String(field?.value ?? '')) + 34, 320);
    }
    return total;
};

/** `procedures_prototype` / call 的 proccode：去掉 %s %b 占位，返回文字宽和参数个数。 */
const procParts = (block: Any): {label: number; args: number} => {
    const code = String(block?.mutation?.proccode ?? '');
    const args = (code.match(/%[sbn]/g) ?? []).length;
    return {label: textWidth(code.replace(/%[sbn]/g, '')), args};
};

/** 自制积木调用的实参：按实际嵌进去的积木估宽，缺失的按 fallback 补。 */
const callArgs = (
    all: LayoutBlocks, block: Any, labelOf: LabelOf | undefined, count: number, fallback: number, depth: number
): number => {
    let total = 0;
    let seen = 0;
    for (const [key, input] of Object.entries(block.inputs ?? {}) as Array<[string, Any]>) {
        if (key.startsWith('SUBSTACK')) {
            continue;
        }
        const child = input?.block ?? input?.shadow;
        if (child) {
            total += blockWidth(all, child, labelOf, depth + 1) + 8;
            seen += 1;
        }
    }
    return total + Math.max(0, count - seen) * fallback;
};

/** 一块积木自己（含嵌在输入里的积木）大概多宽，不含它肚子里的东西。 */
const blockWidth = (all: LayoutBlocks, id: string, labelOf: LabelOf | undefined, depth = 0): number => {
    const block = all[id];
    if (!block || depth > 40) {
        return 48;
    }
    const opcode = String(block.opcode ?? '');
    if (block.shadow) {
        // 数字/文字框、菜单：看里面的字
        return Math.max(40, fieldText(block) || 40) + (opcode === 'text' || opcode.endsWith('_text') ? 8 : 0);
    }
    let width = 36;
    if (opcode === 'procedures_call') {
        const parts = procParts(block);
        width += parts.label + callArgs(all, block, labelOf, parts.args, 52, depth);
    } else if (opcode === 'procedures_definition') {
        const proto = all[block.inputs?.custom_block?.shadow ?? block.inputs?.custom_block?.block];
        const parts = procParts(proto);
        width += textWidth('define ') + parts.label + parts.args * 70;
    } else {
        width += textWidth(labelOf?.(opcode) ?? fallbackLabel(opcode));
        width += fieldText(block);
        for (const [key, input] of Object.entries(block.inputs ?? {}) as Array<[string, Any]>) {
            if (key.startsWith('SUBSTACK')) {
                continue;
            }
            const child = input?.block ?? input?.shadow;
            width += child ? blockWidth(all, child, labelOf, depth + 1) + 8 : 40;
        }
    }
    return width;
};

const rowHeight = (opcode: string): number => {
    const category = opcode.slice(0, opcode.indexOf('_'));
    const extension = category !== '' && !CORE_CATEGORIES.has(category);
    return BLOCK_H + (extension ? EXTENSION_EXTRA_H : 0);
};

const hatHeight = (opcode: string): number => {
    if (opcode === 'procedures_definition') {
        return DEFINE_HAT_H;
    }
    if (opcode.startsWith('event_when') || opcode === 'control_start_as_clone' || opcode.startsWith('when')) {
        return HAT_H;
    }
    return 0;
};

export interface Measure {
    /** 未加余量的宽高。 */
    w: number;
    h: number;
    /** 每块积木那一行顶边离脚本顶边多远（只含 next 链和 C 形肚子里的积木）。 */
    offsets: Map<string, number>;
}

/**
 * 一串脚本画出来大概多大。next 链走循环（几千块的长链递归会爆栈），只有 C 形肚子递归。
 * @param all 积木表。
 * @param id 脚本最上面那块。
 * @param labelOf 操作码 → 积木上的文字（算宽度用）。
 * @returns 宽高和每块的纵向偏移。
 */
export const measureStack = (all: LayoutBlocks, id: string, labelOf?: LabelOf): Measure => {
    const offsets = new Map<string, number>();
    const walk = (first: string, base: number): {w: number; h: number} => {
        let height = 0;
        let width = 0;
        let at: string | undefined | null = first;
        const seen = new Set<string>();
        while (at && !seen.has(at)) {
            seen.add(at);
            const block: Any = all[at];
            if (!block) {
                break;
            }
            const opcode = String(block.opcode ?? '');
            height += hatHeight(opcode);
            offsets.set(at, base + height);
            const row = rowHeight(opcode);
            height += row;
            width = Math.max(width, blockWidth(all, at, labelOf));
            let branches = 0;
            // 所有 SUBSTACK* 口：多分支 if 的 SUBSTACK3+、扩展里可增减的 C 口都算
            for (const key of Object.keys(block.inputs ?? {}).filter(name => name.startsWith('SUBSTACK'))) {
                const input = block.inputs?.[key];
                if (!input) {
                    continue;
                }
                branches += 1;
                if (input.block) {
                    const inner = walk(input.block, base + height);
                    height += inner.h;
                    width = Math.max(width, inner.w + 24);
                } else {
                    height += EMPTY_BRANCH_H;
                }
            }
            height += branches * BRANCH_TAIL_H;
            at = block.next;
        }
        return {w: width, h: height};
    };
    const size = walk(id, 0);
    return {w: size.w, h: size.h, offsets};
};

/** 估出来的脚本高度（含余量）。lostLayout 老接口。 */
export const estimateStackHeight = (all: LayoutBlocks, id: string): number =>
    Math.ceil(measureStack(all, id).h * SLACK_H) + 12;

/* ------------------------------------------------------------------ 脚本信息 */

export interface ScriptInfo {
    id: string;
    /** 脚本本体宽高（含余量），不含注释。 */
    w: number;
    h: number;
    /** 脚本加上它的附带注释一起占的位置，相对脚本左上角。 */
    footprint: Rect;
    /** 附带注释的相对位置。 */
    comments: Array<{id: string; x: number; y: number}>;
    rank: number;
    order: number;
    defines: string[];
    calls: string[];
    sends: string[];
    receives: string[];
    vars: string[];
}

const HAT_RANK: Record<string, number> = {
    event_whenflagclicked: 0,
    event_whenkeypressed: 1,
    event_whenthisspriteclicked: 2,
    event_whenstageclicked: 2,
    event_whenbroadcastreceived: 3,
    control_start_as_clone: 4,
    procedures_definition: 5
};

const rankOf = (opcode: string): number => {
    if (opcode in HAT_RANK) {
        return HAT_RANK[opcode];
    }
    return hatHeight(opcode) > 0 ? 2 : 6;
};

/** 没有父块的非影子积木就是脚本起点。 */
export const rootsOf = (all: LayoutBlocks): string[] =>
    Object.values(all).filter((block: Any) => block && !block.shadow && (!block.parent || !all[block.parent]))
        .map((block: Any) => String(block.id));

const broadcastName = (all: LayoutBlocks, block: Any): string => {
    const child = all[block.inputs?.BROADCAST_INPUT?.shadow ?? block.inputs?.BROADCAST_INPUT?.block];
    const field = child?.fields?.BROADCAST_OPTION;
    return field ? String(field.id ?? field.value ?? '') : '';
};

/**
 * 读一串脚本：尺寸、注释位置、它和别的脚本的关系。
 * @param all 积木表。
 * @param id 脚本起点。
 * @param order 它在页里的先后顺序。
 * @param comments 注释表（只看 blockId 落在这串脚本里的）。
 * @param labelOf 操作码 → 积木文字。
 * @param measured 真实尺寸（编辑器里画出来的），覆盖估算。
 * @returns 脚本信息。
 */
export const describeScript = (
    all: LayoutBlocks,
    id: string,
    order: number,
    comments: LayoutComments,
    labelOf?: LabelOf,
    measured?: {w: number; h: number} | null
): ScriptInfo => {
    const m = measureStack(all, id, labelOf);
    const w = measured ? Math.ceil(measured.w + 24) : Math.ceil(m.w * SLACK_W) + 16;
    const h = measured ? Math.ceil(measured.h + 16) : Math.ceil(m.h * SLACK_H) + 12;
    const info: ScriptInfo = {
        id, w, h, footprint: {x: 0, y: 0, w, h}, comments: [], order,
        rank: rankOf(String(all[id]?.opcode ?? '')),
        defines: [], calls: [], sends: [], receives: [], vars: []
    };
    const vars = new Set<string>();
    const seen = new Set<string>();
    const pending: string[] = [id];
    const attached: Array<{id: string; y: number}> = [];
    const byBlock = new Map<string, Any[]>();
    for (const comment of Object.values(comments)) {
        if (comment?.blockId) {
            const list = byBlock.get(comment.blockId);
            if (list) {
                list.push(comment);
            } else {
                byBlock.set(comment.blockId, [comment]);
            }
        }
    }
    while (pending.length) {
        const at = pending.pop() as string;
        if (seen.has(at) || !all[at]) {
            continue;
        }
        seen.add(at);
        const block = all[at];
        const opcode = String(block.opcode ?? '');
        if (opcode === 'procedures_definition') {
            const proto = all[block.inputs?.custom_block?.shadow ?? block.inputs?.custom_block?.block];
            const code = String(proto?.mutation?.proccode ?? '');
            if (code) {
                info.defines.push(code);
            }
        } else if (opcode === 'procedures_call') {
            const code = String(block.mutation?.proccode ?? '');
            if (code) {
                info.calls.push(code);
            }
        } else if (opcode === 'event_broadcast' || opcode === 'event_broadcastandwait') {
            const name = broadcastName(all, block);
            if (name) {
                info.sends.push(name);
            }
        } else if (opcode === 'event_whenbroadcastreceived') {
            const field = block.fields?.BROADCAST_OPTION;
            const name = field ? String(field.id ?? field.value ?? '') : '';
            if (name) {
                info.receives.push(name);
            }
        }
        for (const key of ['VARIABLE', 'LIST']) {
            const field = block.fields?.[key];
            if (field && opcode.startsWith('data_')) {
                vars.add(String(field.id ?? field.value ?? ''));
            }
        }
        for (const mine of byBlock.get(at) ?? []) {
            attached.push({id: String(mine.id), y: m.offsets.get(at) ?? 0});
        }
        if (block.next) {
            pending.push(block.next);
        }
        for (const input of Object.values(block.inputs ?? {}) as Any[]) {
            if (input?.block) {
                pending.push(input.block);
            }
            if (input?.shadow) {
                pending.push(input.shadow);
            }
        }
    }
    info.vars = [...vars].filter(Boolean);
    if (attached.length) {
        attached.sort((a, b) => a.y - b.y);
        let cursor = 0;
        let bottom = h;
        for (const item of attached) {
            const comment = comments[item.id];
            const height = comment?.minimized ? COMMENT_MINIMIZED_H : Number(comment?.height) || COMMENT_H;
            const y = Math.max(Math.ceil(item.y * SLACK_H), cursor);
            info.comments.push({id: item.id, x: w + COMMENT_GAP, y});
            cursor = y + height + 12;
            bottom = Math.max(bottom, y + height);
        }
        const widest = Math.max(...attached.map(item =>
            (comments[item.id]?.minimized ? COMMENT_W : Number(comments[item.id]?.width) || COMMENT_W)));
        info.footprint = {x: 0, y: 0, w: w + COMMENT_GAP + widest, h: bottom};
    }
    return info;
};

/* ------------------------------------------------------------------ 条目排布 */

/** 参与排布的一个单元：一串脚本，或者一个框架（里面的脚本相对位置固定）。 */
export interface Item {
    key: string;
    w: number;
    h: number;
    rank: number;
    order: number;
    defines: string[];
    calls: string[];
    sends: string[];
    receives: string[];
    vars: string[];
    /** 框架不进散件。 */
    rigid?: boolean;
}

export interface ItemLayout {
    pos: Map<string, Pos>;
    width: number;
    height: number;
    /** 每组里的条目 key；散件另算。 */
    groups: string[][];
    loose: string[];
}

interface Box {key: string; x: number; y: number; w: number; h: number}
interface Block {
    boxes: Box[];
    w: number;
    h: number;
    rank: number;
    order: number;
    gap: number;
}

const unionFind = (n: number): {find: (i: number) => number; join: (a: number, b: number) => void; size: (i: number) => number} => {
    const parent = Array.from({length: n}, (_, i) => i);
    const count = new Array<number>(n).fill(1);
    const find = (i: number): number => {
        let root = i;
        while (parent[root] !== root) {
            root = parent[root];
        }
        while (parent[i] !== root) {
            const next = parent[i];
            parent[i] = root;
            i = next;
        }
        return root;
    };
    return {
        find,
        size: i => count[find(i)],
        join: (a, b) => {
            const ra = find(a);
            const rb = find(b);
            if (ra !== rb) {
                parent[rb] = ra;
                count[ra] += count[rb];
            }
        }
    };
};

/**
 * 条目分组并排布。位置相对 (0,0)，整体包围盒的左上角就是 (0,0)。
 * @param items 要排的条目。
 * @param aspect 目标宽高比。
 * @returns 位置、整体尺寸、分组情况。
 */
export const layoutItems = (items: Item[], aspect = ASPECT): ItemLayout => {
    const n = items.length;
    const result: ItemLayout = {pos: new Map(), width: 0, height: 0, groups: [], loose: []};
    if (!n) {
        return result;
    }
    // 先按 (rank, order) 定一个稳定的内部序号。
    const sorted = items.slice().sort((a, b) => a.rank - b.rank || a.order - b.order);
    const index = new Map(sorted.map((item, i) => [item.key, i]));
    const list = sorted;

    // 强关系：调用 / 广播
    const definers = new Map<string, number[]>();
    const receivers = new Map<string, number[]>();
    list.forEach((item, i) => {
        for (const code of item.defines) {
            (definers.get(code) ?? definers.set(code, []).get(code) as number[]).push(i);
        }
        for (const name of item.receives) {
            (receivers.get(name) ?? receivers.set(name, []).get(name) as number[]).push(i);
        }
    });
    const out: number[][] = list.map(() => []);
    const indegree = list.map(() => 0);
    const edge = (from: number, to: number): void => {
        if (from !== to && !out[from].includes(to)) {
            out[from].push(to);
            indegree[to] += 1;
        }
    };
    list.forEach((item, i) => {
        for (const code of item.calls) {
            for (const target of definers.get(code) ?? []) {
                edge(i, target);
            }
        }
        for (const name of item.sends) {
            for (const target of receivers.get(name) ?? []) {
                edge(i, target);
            }
        }
    });
    const uf = unionFind(n);
    out.forEach((targets, from) => targets.forEach(to => uf.join(from, to)));
    // 弱关系：只被两三串脚本碰到的变量
    const byVar = new Map<string, number[]>();
    list.forEach((item, i) => {
        for (const name of item.vars) {
            (byVar.get(name) ?? byVar.set(name, []).get(name) as number[]).push(i);
        }
    });
    for (const members of byVar.values()) {
        if (members.length < 2 || members.length > 3) {
            continue;
        }
        for (let k = 1; k < members.length; k++) {
            if (uf.find(members[0]) !== uf.find(members[k]) &&
                uf.size(members[0]) + uf.size(members[k]) <= WEAK_GROUP_CAP) {
                uf.join(members[0], members[k]);
            }
        }
    }
    const components = new Map<number, number[]>();
    list.forEach((_, i) => {
        const root = uf.find(i);
        (components.get(root) ?? components.set(root, []).get(root) as number[]).push(i);
    });

    // 总面积 → 一列多高、整体多宽的基准；再在基准附近试一圈，取宽高比最接近目标、浪费最少的
    let area = 0;
    for (const item of list) {
        area += (item.w + GAP_COL) * (item.h + GAP_Y);
    }
    const baseH = Math.max(MIN_COLUMN_H, Math.sqrt(area / aspect));
    const baseW = Math.sqrt(area * aspect);

    const build = (columnH: number, rowW: number): ItemLayout & {score: number} => {
        const attempt: ItemLayout = {pos: new Map(), width: 0, height: 0, groups: [], loose: []};
        const blocks: Block[] = [];
        const looseIdx: number[] = [];
        const groupKeys: string[][] = [];
        for (const members of components.values()) {
            if (members.length === 1 && !list[members[0]].rigid) {
                looseIdx.push(members[0]);
                continue;
            }
            blocks.push(layoutGroup(list, members, out, indegree, columnH));
            groupKeys.push(members.map(i => list[i].key));
        }
        // 散件：按 (rank, order) 填竖列
        looseIdx.sort((a, b) => a - b);
        let col: Box[] = [];
        let cursor = 0;
        let colW = 0;
        const flush = (): void => {
            if (!col.length) {
                return;
            }
            const first = list[index.get(col[0].key) as number];
            blocks.push({boxes: col, w: colW, h: Math.max(0, cursor - GAP_Y), rank: first.rank, order: first.order,
                gap: GAP_LOOSE});
            col = [];
            cursor = 0;
            colW = 0;
        };
        for (const i of looseIdx) {
            const item = list[i];
            if (col.length && cursor + item.h > columnH) {
                flush();
            }
            col.push({key: item.key, x: 0, y: cursor, w: item.w, h: item.h});
            cursor += item.h + GAP_Y;
            colW = Math.max(colW, item.w);
        }
        flush();

        attempt.loose = looseIdx.map(i => list[i].key);
        attempt.groups = groupKeys;

        // 书架装箱
        blocks.sort((a, b) => a.rank - b.rank || a.order - b.order);
        const limit = Math.max(rowW, ...blocks.map(b => b.w));
        let x = 0;
        let y = 0;
        let shelf = 0;
        let width = 0;
        for (const block of blocks) {
            if (x > 0 && x + block.w > limit) {
                y += shelf + GAP_GROUP;
                x = 0;
                shelf = 0;
            }
            for (const box of block.boxes) {
                attempt.pos.set(box.key, {x: x + box.x, y: y + box.y});
            }
            width = Math.max(width, x + block.w);
            shelf = Math.max(shelf, block.h);
            x += block.w + colGap(block.w, block.gap);
        }

        attempt.width = width;
        attempt.height = y + shelf;
        const ratio = Math.max(attempt.width, 1) / Math.max(attempt.height, 1);
        // 面积 × 偏离目标比例的惩罚：又方正又紧凑的赢
        const score = attempt.width * attempt.height * Math.exp(1.6 * Math.abs(Math.log(ratio / aspect)));
        return {...attempt, score};
    };
    const factors = n > 150 ? [0.8, 1.3] : [0.6, 0.8, 1, 1.3, 1.7, 2.2];
    let best: (ItemLayout & {score: number}) | null = null;
    for (const fh of factors) {
        for (const fw of factors) {
            const candidate = build(Math.max(MIN_COLUMN_H * 0.8, baseH * fh), baseW * fw);
            if (!best || candidate.score < best.score) {
                best = candidate;
            }
        }
    }
    const chosen = best as ItemLayout;
    result.pos = chosen.pos;
    result.width = chosen.width;
    result.height = chosen.height;
    result.groups = chosen.groups;
    result.loose = chosen.loose;
    return result;
};

/** 按列排时，横坐标差在这个范围内的算同一列（和积木库自带整理一致）。 */
const COLUMN_TOLERANCE = 256;
/** 按列排时，上下相邻的条目、左右相邻的列之间的空隙（和积木库自带整理一致）。 */
const COLUMN_GAP_Y = 72;
const COLUMN_GAP_X = 96;

/**
 * 按列排：每个条目留在它原来所在的那一列里，列内按原来的上下顺序往下摞。
 *
 * 有框的页面不能用 `layoutItems` 的书架装箱：它按脚本的种类（绿旗、按键……）重新分组，
 * 高矮不一的框被拆到不同的行，空出大片空白，独立脚本又整列挤到末尾。用户期望的是
 * 「各就各位、贴齐网格」，所以这里只做两件事：横坐标相近的归一列，列内按纵坐标摞起来。
 * @param items 要排的条目（框和独立脚本一视同仁，各是一个整体）。
 * @param anchor 条目 key → 它现在的左上角。
 * @returns 位置相对 (0,0)。
 */
export const layoutColumns = (items: Item[], anchor: Map<string, Pos>): ItemLayout => {
    const result: ItemLayout = {pos: new Map(), width: 0, height: 0, groups: [], loose: []};
    const pos = (item: Item): Pos => anchor.get(item.key) ?? {x: 0, y: 0};
    const cols: Array<{x: number; w: number; items: Item[]}> = [];
    const byX = items.slice().sort((a, b) => pos(a).x - pos(b).x || pos(a).y - pos(b).y || a.order - b.order);
    for (const item of byX) {
        const x = pos(item).x;
        // 容差随列宽缩小：排好之后相邻两列的间距总大于容差，再排一次不会把不同的列并到一起
        const col = cols.find(c => Math.abs(c.x - x) < Math.min(COLUMN_TOLERANCE, c.w / 2 + COLUMN_GAP_X / 2));
        if (col) {
            col.x = (col.x * col.items.length + x) / (col.items.length + 1);
            col.w = Math.max(col.w, item.w);
            col.items.push(item);
        } else {
            cols.push({x, w: item.w, items: [item]});
        }
    }
    cols.sort((a, b) => a.x - b.x);
    let left = 0;
    for (const col of cols) {
        col.items.sort((a, b) => pos(a).y - pos(b).y || a.order - b.order);
        let top = 0;
        let width = 0;
        for (const item of col.items) {
            result.pos.set(item.key, {x: left, y: top});
            top += item.h + COLUMN_GAP_Y;
            width = Math.max(width, item.w);
        }
        result.height = Math.max(result.height, top - COLUMN_GAP_Y);
        left += width + COLUMN_GAP_X;
        result.width = left - COLUMN_GAP_X;
    }
    result.loose = items.filter(item => !item.rigid).map(item => item.key);
    return result;
};

/** 一组：入口放左边，被它调用的放右边相邻的列。 */
const layoutGroup = (list: Item[], members: number[], out: number[][], indegree: number[], columnH: number): Block => {
    const inGroup = new Set(members);
    const depth = new Map<number, number>();
    const visit = (start: number): void => {
        depth.set(start, 0);
        const queue = [start];
        while (queue.length) {
            const at = queue.shift() as number;
            for (const next of out[at]) {
                if (inGroup.has(next) && !depth.has(next)) {
                    depth.set(next, (depth.get(at) as number) + 1);
                    queue.push(next);
                }
            }
        }
    };
    for (const i of members) {
        if (indegree[i] === 0) {
            visit(i);
        }
    }
    // 只在环里的（谁都不是入口）：从排最前的那个起
    for (const i of members) {
        if (!depth.has(i)) {
            visit(i);
        }
    }
    const columns: number[][] = [];
    for (const i of members) {
        const d = Math.min(depth.get(i) as number, MAX_DEPTH);
        (columns[d] ??= []).push(i);
    }
    // 调用方（上一列里指向它的脚本）的位置，用来对齐高度
    const placed = new Map<number, Box>();
    const boxes: Box[] = [];
    let left = 0;
    let lastGap = GAP_COL;
    let height = 0;
    for (const column of columns) {
        if (!column) {
            continue;
        }
        const callerY = (i: number): number => {
            let best = Infinity;
            for (const other of members) {
                if (out[other].includes(i) && placed.has(other)) {
                    best = Math.min(best, (placed.get(other) as Box).y);
                }
            }
            return best;
        };
        const ordered = column.slice().sort((a, b) => {
            const ya = callerY(a);
            const yb = callerY(b);
            if (ya !== yb) {
                return ya - yb;
            }
            return list[a].rank - list[b].rank || list[a].order - list[b].order;
        });
        // 一个深度可能拆成几条物理列
        let cursor = 0;
        let width = 0;
        let physicalLeft = left;
        let used = 0;
        for (const i of ordered) {
            const item = list[i];
            const wanted = callerY(i);
            let y = Number.isFinite(wanted) ? Math.max(cursor, wanted) : cursor;
            if (used > 0 && y + item.h > columnH) {
                physicalLeft += width + colGap(width);
                width = 0;
                cursor = 0;
                used = 0;
                y = 0;
            }
            const box: Box = {key: item.key, x: physicalLeft, y, w: item.w, h: item.h};
            boxes.push(box);
            placed.set(i, box);
            cursor = y + item.h + GAP_Y;
            width = Math.max(width, item.w);
            used += 1;
            height = Math.max(height, y + item.h);
        }
        lastGap = colGap(width);
        left = physicalLeft + width + lastGap;
    }
    const first = list[members[0]];
    return {boxes, w: Math.max(0, left - lastGap), h: height, rank: Math.min(...members.map(i => list[i].rank)),
        order: first.order, gap: GAP_GROUP};
};

/* ------------------------------------------------------------------ 找空位 */

const intersects = (a: Rect, b: Rect): boolean =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export const rectsIntersect = intersects;

const padded = (r: Rect, pad: number): Rect => ({x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2});

/**
 * 把排好的整体放到页面上不与障碍相交的地方。
 * 先试起点本身；不行就放到障碍整体的右边或下边，取合起来更接近目标宽高比的那个。
 * @param layout 条目排布（相对 (0,0)）。
 * @param sizes 条目 key → 宽高。
 * @param obstacles 已有东西占的矩形。
 * @param origin 起点。
 * @param aspect 目标宽高比。
 * @returns 整体平移量。
 */
export const placeLayout = (
    layout: ItemLayout,
    sizes: Map<string, {w: number; h: number}>,
    obstacles: Rect[],
    origin: Pos = ORIGIN,
    aspect = ASPECT
): Pos => {
    if (!obstacles.length) {
        return origin;
    }
    const fits = (at: Pos): boolean => {
        for (const [key, p] of layout.pos) {
            const size = sizes.get(key) as {w: number; h: number};
            const rect: Rect = {x: p.x + at.x, y: p.y + at.y, w: size.w, h: size.h};
            for (const wall of obstacles) {
                if (intersects(rect, padded(wall, 16))) {
                    return false;
                }
            }
        }
        return true;
    };
    if (fits(origin)) {
        return origin;
    }
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const o of obstacles) {
        left = Math.min(left, o.x);
        top = Math.min(top, o.y);
        right = Math.max(right, o.x + o.w);
        bottom = Math.max(bottom, o.y + o.h);
    }
    const beside: Pos = {x: right + GAP_GROUP, y: Math.min(top, origin.y)};
    const below: Pos = {x: Math.min(left, origin.x), y: bottom + GAP_GROUP};
    const score = (at: Pos): number => {
        const w = Math.max(right, at.x + layout.width) - Math.min(left, at.x);
        const h = Math.max(bottom, at.y + layout.height) - Math.min(top, at.y);
        return Math.abs(Math.log(w / h / aspect));
    };
    return score(beside) < score(below) ? beside : below;
};

/* ------------------------------------------------------------------ 整张表的排布 */

export interface ArrangeOptions {
    /** 'new'：只摆 `unplaced` 点名的；'all'：整页重排。 */
    mode?: 'new' | 'all';
    /** mode 'new'：要摆的脚本起点 id。 */
    unplaced?: Iterable<string>;
    /** mode 'new'：要摆的独立注释 id（'all' 时全部独立注释都排）。 */
    unplacedNotes?: Iterable<string>;
    /** mode 'new'：这些框架整体要摆（里面点名的脚本在框内摆）。 */
    newFrames?: Iterable<string>;
    /** 允许按里面的内容调整大小的框架（没写 @size 的）。 */
    autosizeFrames?: Iterable<string>;
    /** 只考虑这些脚本起点；缺省取表里所有顶层。 */
    roots?: string[];
    labelOf?: LabelOf;
    /** 已经画出来的脚本的真实尺寸。 */
    measure?: (rootId: string) => {w: number; h: number} | null | undefined;
    origin?: Pos;
    aspect?: number;
    /**
     * 按列排（见 `layoutColumns`）：条目留在原来的列里、列内按原来的上下顺序摞；
     * 不看脚本之间的调用关系，锁住的框也一起排。编辑器里有框的页面用它。
     */
    columns?: boolean;
}

export interface BlockMove {id: string; from: Pos; to: Pos; frame?: string}
export interface CommentMove {id: string; from: Pos | null; to: Pos; attached: boolean}
export interface FrameMove {
    id: string;
    from: Pos;
    to: Pos;
    fromSize: {w: number; h: number};
    toSize: {w: number; h: number};
}

export interface ArrangePlan {
    blocks: BlockMove[];
    comments: CommentMove[];
    frames: FrameMove[];
    /** 位置真的变了的脚本数。 */
    moved: number;
    /** 关系成组的组数（散件不算）。 */
    groups: number;
    /** 散件里的脚本数。 */
    loose: number;
    /** 每组的脚本起点 id（框架展开成成员）。 */
    groupRoots: string[][];
    /** 整体占位。 */
    bounds: Rect | null;
}

const num = (value: unknown, fallback = 0): number => {
    const v = Number(value);
    return Number.isFinite(v) ? v : fallback;
};

const frameRectOf = (frame: Any): Rect => ({
    x: num(frame.x), y: num(frame.y), w: num(frame.width, 400),
    h: frame.collapsed ? 65 : num(frame.height, 300)
});

const noteRect = (note: Any, at: Pos): Rect => ({
    x: at.x, y: at.y, w: num(note.width, COMMENT_W),
    h: note.minimized ? COMMENT_MINIMIZED_H : num(note.height, COMMENT_H)
});

/**
 * 给一张积木表算排布计划（不改表）。
 * @param blocks 积木表（含影子积木）。
 * @param comments 注释表。
 * @param frames 框架表。
 * @param options 选项。
 * @returns 计划：谁从哪到哪。
 */
export const planArrange = (
    blocks: LayoutBlocks,
    comments: LayoutComments = {},
    frames: LayoutFrames = {},
    options: ArrangeOptions = {}
): ArrangePlan => {
    const all = options.mode === 'all';
    const aspect = options.aspect ?? ASPECT;
    const origin = options.origin ?? ORIGIN;
    const roots = (options.roots ?? rootsOf(blocks)).filter(id => blocks[id] && !blocks[id].shadow);
    const rootSet = new Set(roots);
    const unplaced = new Set(options.unplaced ?? []);
    const newFrames = new Set(options.newFrames ?? []);
    const autosize = new Set(options.autosizeFrames ?? []);
    const plan: ArrangePlan = {blocks: [], comments: [], frames: [], moved: 0, groups: 0, loose: 0,
        groupRoots: [], bounds: null};

    const infoOf = new Map<string, ScriptInfo>();
    roots.forEach((id, order) => {
        const info = describeScript(blocks, id, order, comments, options.labelOf, options.measure?.(id));
        infoOf.set(id, info);
    });
    const at = (id: string): Pos => ({x: num(blocks[id].x), y: num(blocks[id].y)});

    // 框架归属
    const frameOfRoot = new Map<string, string>();
    for (const frame of Object.values(frames)) {
        for (const member of frame.blocks ?? []) {
            if (rootSet.has(member)) {
                frameOfRoot.set(member, frame.id);
            }
        }
    }
    const liveFrames = Object.values(frames).filter(frame => (frame.blocks ?? []).some((m: string) => rootSet.has(m)) ||
        newFrames.has(frame.id));

    const obstacles: Rect[] = [];
    const items: Item[] = [];
    const sizes = new Map<string, {w: number; h: number}>();
    /** 条目 key → 摆下去之后怎么落到各个脚本/注释上（相对条目左上角）。 */
    const parts = new Map<string, {
        blocks: Array<{id: string; dx: number; dy: number; frame?: string}>;
        comments: Array<{id: string; dx: number; dy: number; attached: boolean}>;
        frame?: {id: string; w: number; h: number};
    }>();
    /** 条目现在的位置，按列排时用来决定归哪一列、列内的先后。 */
    const anchor = new Map<string, Pos>();
    const addItem = (item: Item, part: Pick<NonNullable<ReturnType<typeof parts.get>>, 'blocks' | 'comments' | 'frame'>): void => {
        items.push(item);
        sizes.set(item.key, {w: item.w, h: item.h});
        parts.set(item.key, part);
    };
    const itemOf = (key: string, info: Pick<Item, 'rank' | 'order' | 'defines' | 'calls' | 'sends' | 'receives' | 'vars'> & {w: number; h: number}): Item =>
        ({key, ...info});

    /** 脚本自己要摆（相对条目左上角放在 dx,dy）：本体 + 附带注释。 */
    const scriptPart = (id: string, dx: number, dy: number, frame?: string) => ({
        blocks: [{id, dx, dy, ...(frame ? {frame} : {})}],
        comments: (infoOf.get(id) as ScriptInfo).comments.map(c => ({id: c.id, dx: dx + c.x, dy: dy + c.y, attached: true}))
    });

    const scriptRect = (id: string): Rect => {
        const info = infoOf.get(id) as ScriptInfo;
        const p = at(id);
        return {x: p.x, y: p.y, w: info.footprint.w, h: info.footprint.h};
    };

    const handledFrames = new Set<string>();
    const movableRoot = (id: string): boolean => all || unplaced.has(id);

    // 框架
    for (const frame of liveFrames) {
        const members: string[] = (frame.blocks ?? []).filter((m: string) => rootSet.has(m));
        const rect = frameRectOf(frame);
        const frameMovable = all ? (!frame.locked || !!options.columns) : newFrames.has(frame.id);
        const pending = members.filter(m => (all ? false : unplaced.has(m)) || (newFrames.has(frame.id) && unplaced.has(m)));
        // 框里要新摆的脚本：在框内相对坐标里找空位
        let inner: {rel: Map<string, Pos>; w: number; h: number} | null = null;
        if (pending.length) {
            const innerItems = pending.map(id => {
                const info = infoOf.get(id) as ScriptInfo;
                return itemOf(id, {w: info.footprint.w, h: info.footprint.h, rank: info.rank, order: info.order,
                    defines: info.defines, calls: info.calls, sends: info.sends, receives: info.receives, vars: info.vars});
            });
            const layout = layoutItems(innerItems, aspect);
            const fixed = members.filter(m => !pending.includes(m)).map(m => {
                const r = scriptRect(m);
                return {x: r.x - rect.x, y: r.y - rect.y, w: r.w, h: r.h};
            });
            const innerSizes = new Map(innerItems.map(i => [i.key, {w: i.w, h: i.h}]));
            const base = placeLayout(layout, innerSizes, fixed, {x: FRAME_PAD, y: FRAME_PAD}, aspect);
            const rel = new Map<string, Pos>();
            let right = 0;
            let bottom = 0;
            for (const [key, p] of layout.pos) {
                const size = innerSizes.get(key) as {w: number; h: number};
                rel.set(key, {x: p.x + base.x, y: p.y + base.y});
                right = Math.max(right, p.x + base.x + size.w);
                bottom = Math.max(bottom, p.y + base.y + size.h);
            }
            for (const f of fixed) {
                right = Math.max(right, f.x + f.w);
                bottom = Math.max(bottom, f.y + f.h);
            }
            inner = {rel, w: right + FRAME_PAD, h: bottom + FRAME_PAD};
        }
        let width = rect.w;
        let height = rect.h;
        if (inner && autosize.has(frame.id)) {
            width = Math.max(inner.w, newFrames.has(frame.id) ? 0 : rect.w);
            height = Math.max(inner.h, newFrames.has(frame.id) ? 0 : rect.h);
        } else if (inner) {
            width = Math.max(width, inner.w);
            height = Math.max(height, inner.h);
        }
        handledFrames.add(frame.id);
        for (const m of members) {
            handledFrames.add(m);
        }
        if (!frameMovable) {
            // 不动的框：本体和里面的脚本都是障碍；框里新摆的脚本落在 inner.rel 上
            obstacles.push({x: rect.x, y: rect.y, w: width, h: height});
            for (const m of members) {
                if (!pending.includes(m)) {
                    obstacles.push(scriptRect(m));
                }
            }
            if (inner || width !== rect.w || height !== rect.h) {
                plan.frames.push({id: frame.id, from: {x: rect.x, y: rect.y}, to: {x: rect.x, y: rect.y},
                    fromSize: {w: rect.w, h: rect.h}, toSize: {w: width, h: height}});
            }
            for (const id of pending) {
                const p = (inner as NonNullable<typeof inner>).rel.get(id) as Pos;
                const info = infoOf.get(id) as ScriptInfo;
                plan.blocks.push({id, from: at(id), to: {x: rect.x + p.x, y: rect.y + p.y}, frame: frame.id});
                for (const c of info.comments) {
                    plan.comments.push({id: c.id, from: comments[c.id] ? {x: num(comments[c.id].x), y: num(comments[c.id].y)} : null,
                        to: {x: rect.x + p.x + c.x, y: rect.y + p.y + c.y}, attached: true});
                }
            }
            continue;
        }
        // 整个框当一个条目，成员跟着它走
        const itemParts: NonNullable<ReturnType<typeof parts.get>> = {
            blocks: [], comments: [], frame: {id: frame.id, w: width, h: height}
        };
        let bodyW = width;
        let bodyH = height;
        const memberInfos: ScriptInfo[] = [];
        for (const m of members) {
            const info = infoOf.get(m) as ScriptInfo;
            memberInfos.push(info);
            let dx: number;
            let dy: number;
            if (inner && pending.includes(m)) {
                const p = inner.rel.get(m) as Pos;
                dx = p.x;
                dy = p.y;
            } else {
                dx = at(m).x - rect.x;
                dy = at(m).y - rect.y;
            }
            itemParts.blocks.push({id: m, dx, dy, frame: frame.id});
            // 框里的注释：新摆的用算好的位置，其余跟着平移
            for (const c of info.comments) {
                const old = comments[c.id];
                const keep = !(inner && pending.includes(m)) && old && old.x !== null && old.x !== undefined;
                itemParts.comments.push({id: c.id, dx: keep ? num(old.x) - rect.x : dx + c.x,
                    dy: keep ? num(old.y) - rect.y : dy + c.y, attached: true});
            }
            // 折起来的框只占一条标题栏的高度，藏着的成员不撑大它
            if ((!inner || !pending.includes(m)) && !frame.collapsed) {
                bodyW = Math.max(bodyW, dx + info.footprint.w);
                bodyH = Math.max(bodyH, dy + info.footprint.h);
            }
        }
        const sum = memberInfos.reduce((acc, info) => ({
            defines: [...acc.defines, ...info.defines], calls: [...acc.calls, ...info.calls],
            sends: [...acc.sends, ...info.sends], receives: [...acc.receives, ...info.receives],
            vars: [...acc.vars, ...info.vars]
        }), {defines: [] as string[], calls: [] as string[], sends: [] as string[], receives: [] as string[],
            vars: [] as string[]});
        const rank = memberInfos.length ? Math.min(...memberInfos.map(i => i.rank)) : 6;
        const order = memberInfos.length ? Math.min(...memberInfos.map(i => i.order)) : roots.length;
        const key = `frame:${frame.id}`;
        anchor.set(key, {x: rect.x, y: rect.y});
        addItem({...itemOf(key, {w: bodyW, h: bodyH, rank, order, ...sum}), rigid: true}, itemParts);
    }

    // 脚本
    for (const id of roots) {
        if (handledFrames.has(id)) {
            continue;
        }
        const info = infoOf.get(id) as ScriptInfo;
        if (movableRoot(id)) {
            anchor.set(id, at(id));
            addItem(itemOf(id, {w: info.footprint.w, h: info.footprint.h, rank: info.rank, order: info.order,
                defines: info.defines, calls: info.calls, sends: info.sends, receives: info.receives, vars: info.vars}),
            scriptPart(id, 0, 0));
        } else {
            obstacles.push(scriptRect(id));
        }
    }

    // 独立注释
    const noteIds = new Set(options.unplacedNotes ?? []);
    const notes = Object.values(comments).filter(note => !note.blockId && (all || noteIds.has(note.id)));
    for (const note of Object.values(comments)) {
        if (!note.blockId && !notes.includes(note) && note.x !== null && note.x !== undefined) {
            obstacles.push(noteRect(note, {x: num(note.x), y: num(note.y)}));
        }
    }

    const layout = options.columns ? layoutColumns(items, anchor) : layoutItems(items, aspect);
    plan.groups = layout.groups.length;
    plan.loose = layout.loose.length;
    const keyRoots = (key: string): string[] => (parts.get(key)?.blocks ?? []).map(p => p.id);
    plan.groupRoots = layout.groups.map(group => group.flatMap(keyRoots));

    // 注释条带：放在页面最上面，脚本整体往下让
    let noteBand = 0;
    const notePos: Array<{note: Any; at: Pos}> = [];
    if (notes.length) {
        const limit = Math.max(layout.width, 900);
        let x = 0;
        let y = 0;
        let rowH = 0;
        for (const note of notes) {
            const rect = noteRect(note, {x: 0, y: 0});
            if (x > 0 && x + rect.w > limit) {
                y += rowH + 24;
                x = 0;
                rowH = 0;
            }
            notePos.push({note, at: {x, y}});
            x += rect.w + 24;
            rowH = Math.max(rowH, rect.h);
        }
        noteBand = y + rowH + GAP_GROUP / 2;
    }
    const shifted: ItemLayout = {...layout, pos: new Map([...layout.pos].map(([k, p]) => [k, {x: p.x, y: p.y + noteBand}])),
        width: layout.width, height: layout.height + noteBand};
    for (const entry of notePos) {
        const key = `note:${entry.note.id}`;
        const size = noteRect(entry.note, {x: 0, y: 0});
        shifted.pos.set(key, entry.at);
        sizes.set(key, size);
        shifted.width = Math.max(shifted.width, entry.at.x + size.w);
    }
    const base = placeLayout(shifted, sizes, obstacles, origin, aspect);
    layout.pos = shifted.pos;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const grow = (r: Rect): void => {
        minX = Math.min(minX, r.x);
        minY = Math.min(minY, r.y);
        maxX = Math.max(maxX, r.x + r.w);
        maxY = Math.max(maxY, r.y + r.h);
    };
    for (const [key, p] of layout.pos) {
        if (key.startsWith('note:')) {
            continue;
        }
        const part = parts.get(key) as NonNullable<ReturnType<typeof parts.get>>;
        const size = sizes.get(key) as {w: number; h: number};
        const px = base.x + p.x;
        const py = base.y + p.y;
        grow({x: px, y: py, w: size.w, h: size.h});
        if (part.frame) {
            const frame = frames[part.frame.id];
            const rect = frameRectOf(frame);
            plan.frames.push({id: frame.id, from: {x: rect.x, y: rect.y}, to: {x: px, y: py},
                fromSize: {w: rect.w, h: rect.h}, toSize: {w: part.frame.w, h: part.frame.h}});
        }
        for (const b of part.blocks) {
            plan.blocks.push({id: b.id, from: at(b.id), to: {x: px + b.dx, y: py + b.dy}, ...(b.frame ? {frame: b.frame} : {})});
        }
        for (const c of part.comments) {
            const old = comments[c.id];
            plan.comments.push({id: c.id, from: old && old.x !== null && old.x !== undefined ?
                {x: num(old.x), y: num(old.y)} : null, to: {x: px + c.dx, y: py + c.dy}, attached: c.attached});
        }
    }
    for (const entry of notePos) {
        const old = entry.note;
        const to = {x: base.x + entry.at.x, y: base.y + entry.at.y};
        plan.comments.push({id: old.id, from: old.x !== null && old.x !== undefined ? {x: num(old.x), y: num(old.y)} : null,
            to, attached: false});
        grow(noteRect(old, to));
    }
    plan.moved = plan.blocks.filter(m => blocks[m.id].x === undefined || blocks[m.id].y === undefined ||
        m.from.x !== m.to.x || m.from.y !== m.to.y).length;
    plan.bounds = Number.isFinite(minX) ? {x: minX, y: minY, w: maxX - minX, h: maxY - minY} : null;
    return plan;
};

/**
 * 把计划写进积木表、注释表、框架表（就地改）。
 * @param blocks 积木表。
 * @param comments 注释表。
 * @param frames 框架表。
 * @param plan 计划。
 */
export const applyArrange = (
    blocks: LayoutBlocks,
    comments: LayoutComments,
    frames: LayoutFrames,
    plan: ArrangePlan
): void => {
    for (const move of plan.blocks) {
        if (blocks[move.id]) {
            blocks[move.id].x = move.to.x;
            blocks[move.id].y = move.to.y;
        }
    }
    for (const move of plan.comments) {
        if (comments[move.id]) {
            comments[move.id].x = move.to.x;
            comments[move.id].y = move.to.y;
        }
    }
    for (const move of plan.frames) {
        const frame = frames[move.id];
        if (frame) {
            frame.x = move.to.x;
            frame.y = move.to.y;
            frame.width = move.toSize.w;
            frame.height = move.toSize.h;
        }
    }
};

/** 计划的反向（撤销用）：把 from/to 对调。 */
export const invertPlan = (plan: ArrangePlan): ArrangePlan => ({
    ...plan,
    blocks: plan.blocks.map(m => ({...m, from: m.to, to: m.from})),
    comments: plan.comments.filter(m => m.from).map(m => ({...m, from: m.to, to: m.from as Pos})),
    frames: plan.frames.map(m => ({...m, from: m.to, to: m.from, fromSize: m.toSize, toSize: m.fromSize}))
});

/* ------------------------------------------------------------------ 编译器挂的钩子 */

export interface CompiledLayoutInput {
    blocks: LayoutBlocks;
    comments: LayoutComments;
    frames: LayoutFrames;
    /** 这次编译出来的脚本起点，和源码里脚本的顺序一致。 */
    roots: Array<string | null | undefined>;
    /** 与 roots 平行：这串脚本的位置是定的（写了 @at，或者沿用了作品里原来的坐标）。 */
    placed: boolean[];
    /** 与 roots 平行：这串脚本在源码里写了 @at。写了的永远不被「丢位置」判据挪走；不给就按老判据（同坐标三串以上）。 */
    explicit?: boolean[];
    /** 框架 id → 它的位置是不是定的（写了 @at，或者原来就在作品里）、尺寸是不是写死的（@size）。 */
    frameInfo: Record<string, {fixed: boolean; sized: boolean}>;
    labelOf?: LabelOf;
}

/**
 * 编译出一页之后，把没有位置的脚本摆开。
 *
 * 只动「没有位置」的：没写 `@at` 又是新写的脚本，没写位置的框架和独立注释；还有同页
 * 三串以上坐标完全一样的脚本（和 blocks/lostLayout 同一条判据，不可能是手摆的）。
 * 其余原样不动，新摆的落在空位上。写了 @at 的脚本、写了 @note 位置的注释永远不动。
 * @param input 编译结果和每串脚本是否已有位置。
 * @returns 计划；没有要摆的就是 null。
 */
export const placeCompiled = (input: CompiledLayoutInput): ArrangePlan | null => {
    const {blocks, comments, frames} = input;
    const roots: string[] = [];
    const placed: boolean[] = [];
    const explicit: boolean[] = [];
    input.roots.forEach((id, i) => {
        if (id && blocks[id]) {
            roots.push(id);
            explicit.push(!!input.explicit?.[i]);
            placed.push(input.placed[i] && blocks[id].x !== undefined && blocks[id].y !== undefined);
        }
    });
    const inFrame = new Set<string>();
    for (const frame of Object.values(frames)) {
        for (const member of frame.blocks ?? []) {
            inFrame.add(member);
        }
    }
    const unplaced = new Set<string>();
    const piles = new Map<string, string[]>();
    roots.forEach((id, i) => {
        if (!placed[i]) {
            unplaced.add(id);
        } else if (!inFrame.has(id)) {
            const key = `${blocks[id].x},${blocks[id].y}`;
            (piles.get(key) ?? piles.set(key, []).get(key) as string[]).push(id);
        }
    });
    const explicitOf = new Map<string, boolean>(roots.map((id, i) => [id, explicit[i]]));
    for (const group of piles.values()) {
        if (!input.explicit) {
            if (group.length >= 3) {
                for (const id of group) {
                    unplaced.add(id);
                }
            }
            continue;
        }
        // 写了 @at 的不动；没写 @at、却和别的脚本坐标完全相同（不管几串）的，是继承来的叠影，排开
        if (group.length >= 2) {
            for (const id of group) {
                if (!explicitOf.get(id)) {
                    unplaced.add(id);
                }
            }
        }
    }
    const unplacedNotes = Object.values(comments).filter(note => !note.blockId &&
        (note.x === null || note.x === undefined || note.y === null || note.y === undefined)).map(note => String(note.id));
    const newFrames = Object.entries(input.frameInfo).filter(([, info]) => !info.fixed).map(([id]) => id);
    if (!unplaced.size && !unplacedNotes.length && !newFrames.length) {
        return null;
    }
    const plan = planArrange(blocks, comments, frames, {
        mode: 'new', roots, unplaced, unplacedNotes, newFrames,
        autosizeFrames: Object.entries(input.frameInfo).filter(([, info]) => !info.sized).map(([id]) => id),
        labelOf: input.labelOf
    });
    applyArrange(blocks, comments, frames, plan);
    return plan;
};
