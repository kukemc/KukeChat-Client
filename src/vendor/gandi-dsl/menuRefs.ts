/**
 * 场景菜单的引用：DSL 里写场景名，积木里存场景 id。
 *
 * gandiScene 扩展的场景菜单（`scenes`、`scenesOrAny`）是动态菜单：值是场景 id、显示的是名字（改名后已放置的积木
 * 不会失效）。DSL 里直接写 id 是 20 位乱码，所以这里在两边做翻译：
 *  - 编译：字面量按「id 全等 > 名字全等 > 名字忽略大小写 > id 前缀（≥ 4 位）」解析成 id，找不到 / 有歧义报错；
 *  - 打印：id 打印成场景名；名字重了、或者名字会被解析到别的场景，就回退打印完整 id（保证重新编译得到同一个 id）。
 *
 * 纯函数，不依赖 VM。匹配规则的唯一实现是下面的 matchSceneRefs（agent 层的 sceneRef.ts 只需要 import 它，dsl 层不依赖 agent 层）；
 * 两边行为一致由 src/dsl/__tests__/scene-refs.mjs 里的一致性测试守着。
 */

export interface SceneRefEntry {id: string; name: string}

/** 场景菜单带给编译器 / 打印器的场景表 */
export interface SceneMenus {scenes: SceneRefEntry[]}

export type SceneRefErrorCode = 'E_UNKNOWN_SCENE' | 'E_SCENE_AMBIGUOUS';

export class SceneRefError extends Error {
    constructor(readonly code: SceneRefErrorCode, message: string, readonly fix?: string) {
        super(message);
        this.name = 'SceneRefError';
    }
}

/** 最短的 id 前缀长度（与 sceneRef.ts 的 MIN_SCENE_ID_PREFIX 相同） */
const MIN_ID_PREFIX = 4;

/** 场景菜单的影子积木：`gandiScene_menu_scenes`（具体场景）与 `gandiScene_menu_scenesOrAny`（含「任意场景」） */
const SCENE_MENU_OPCODE = /^gandiScene_menu_(scenes|scenesOrAny)$/;

export const isSceneMenuOpcode = (opcode: string): boolean => SCENE_MENU_OPCODE.test(opcode);

export type SceneMatchTier = 'id' | 'name' | 'name-insensitive' | 'id-prefix';

/**
 * 场景引用的匹配（不抛错）：按层，前一层有命中就不再看后一层 ——
 * id 全等 > 名字全等 > 名字忽略大小写与首尾空白 > id 前缀（至少 4 位）。空白串（trim 后为空）不匹配任何场景。
 * 命中不止一个的歧义交给调用方报。泛型：调用方的场景记录多带字段也原样返回。
 */
export const matchSceneRefs = <T extends SceneRefEntry>(scenes: T[], ref: unknown): {tier: SceneMatchTier | null; matches: T[]} => {
    const key = typeof ref === 'string' ? ref : '';
    if (!key.trim()) return {tier: null, matches: []};
    const list = Array.isArray(scenes) ? scenes : [];
    let hits = list.filter(scene => scene.id === key);
    if (hits.length) return {tier: 'id', matches: hits};
    hits = list.filter(scene => scene.name === key);
    if (hits.length) return {tier: 'name', matches: hits};
    const lowered = key.trim().toLowerCase();
    hits = list.filter(scene => String(scene.name).trim().toLowerCase() === lowered);
    if (hits.length) return {tier: 'name-insensitive', matches: hits};
    if (key.length >= MIN_ID_PREFIX) {
        hits = list.filter(scene => scene.id.startsWith(key));
        if (hits.length) return {tier: 'id-prefix', matches: hits};
    }
    return {tier: null, matches: []};
};
const match = (scenes: SceneRefEntry[], key: string): SceneRefEntry[] => matchSceneRefs(scenes, key).matches;

/** 编辑距离（找最近似的场景名，给错误信息当候选） */
const distance = (a: string, b: string): number => {
    const row = Array.from({length: b.length + 1}, (_, index) => index);
    for (let i = 1; i <= a.length; i++) {
        let diagonal = row[0];
        row[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const keep = row[j];
            row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
            diagonal = keep;
        }
    }
    return row[b.length];
};

/** 最近似的场景名；差得太远（超过一半长度）就不推荐 */
export const nearestSceneName = (value: string, scenes: SceneRefEntry[]): string | null => {
    const lowered = value.trim().toLowerCase();
    let best: {name: string; score: number} | null = null;
    for (const scene of scenes) {
        const name = String(scene.name);
        const target = name.trim().toLowerCase();
        const score = target.includes(lowered) || (lowered && lowered.includes(target)) ? 0 : distance(lowered, target);
        if (!best || score < best.score) best = {name, score};
    }
    return best && best.score <= Math.max(1, Math.floor(Math.max(lowered.length, 1) / 2)) ? best.name : null;
};

/**
 * 场景引用 → 场景 id。
 *
 * 空字符串是保留值（「任意场景」/「（没有场景）」占位，运行时按「不限」处理）：原样返回。
 * 其余按层匹配；歧义、找不到抛 SceneRefError（E_SCENE_AMBIGUOUS / E_UNKNOWN_SCENE）。
 */
export const resolveSceneMenuValue = (value: string, scenes: SceneRefEntry[]): string => {
    if (value === '') return value;
    const hits = match(scenes, value);
    if (hits.length === 1) return hits[0].id;
    if (hits.length > 1) {
        throw new SceneRefError('E_SCENE_AMBIGUOUS', `Scene reference ${JSON.stringify(value)} matches ${hits.length} scenes: ` +
            hits.map(scene => `${JSON.stringify(scene.name)} (${scene.id})`).join(', '),
        'write the full scene id as a string, or rename one of the scenes');
    }
    const names = scenes.map(scene => JSON.stringify(scene.name)).join(', ') || '(none)';
    const near = nearestSceneName(value, scenes);
    throw new SceneRefError('E_UNKNOWN_SCENE', `No scene matches ${JSON.stringify(value)}. Scenes: ${names}`,
        near ? `did you mean ${JSON.stringify(near)}?` : 'write the name of an existing scene (list_scenes shows them)');
};

/** 同上，不抛错：解析不出返回 null（打印器判断回退用） */
export const tryResolveSceneMenuValue = (value: string, scenes: SceneRefEntry[]): string | null => {
    try { return resolveSceneMenuValue(value, scenes); } catch { return null; }
};

/**
 * 积木里存的场景菜单值 → DSL 里写的字面量。
 *
 * 存的是某个场景的 id：打印成名字，前提是这个名字重新解析回同一个 id；名字重了、被别的场景的 id 前缀盖住、
 * 是空名……一律回退打印完整 id。空串（保留值）、已删除场景残留的值、旧作品里直接存名字的值原样返回
 * （编译时前两者保持原值，后者解析成 id）。
 */
export const displaySceneMenuValue = (id: string, scenes: SceneRefEntry[]): string => {
    if (id === '') return id;
    const scene = scenes.find(item => item.id === id);
    if (!scene) return id;
    return scene.name.trim() !== '' && tryResolveSceneMenuValue(scene.name, scenes) === id ? scene.name : id;
};
