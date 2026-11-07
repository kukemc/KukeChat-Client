/**
 * 操作码 → 扩展 id。操作码是 `扩展id_积木名`，但扩展 id 自己可以带下划线（`my_ext_go` 是 `my_ext` 的 `go`），
 * 只按第一个下划线切会把这样的扩展还原成不存在的 `my`，缺扩展的判断、降级预览、自动安装就全错了。
 * 做法：拿已知的扩展 id（schema 里的扩展、扩展库、已装的）做最长前缀匹配；一个也对不上才退回第一段。
 */

/** 核心积木的分类前缀：不是扩展 */
export const CORE_CATEGORIES: ReadonlySet<string> = new Set(['motion', 'looks', 'sound', 'event', 'control', 'sensing',
    'operator', 'data', 'procedures', 'argument', 'math', 'text', 'colour', 'note', 'when']);

/** 操作码的扩展前缀。known 里最长且后面紧跟下划线的那个；没有就是第一段 */
export const extensionOfOpcode = (opcode: string, known?: Iterable<string>): string => {
    let best = '';
    if (known) {
        for (const id of known) {
            if (id.length > best.length && opcode.length > id.length && opcode.startsWith(`${id}_`)) best = id;
        }
    }
    return best || opcode.split('_')[0];
};

/** VM 的扩展注册表里的扩展 id（官方、自定义、已加载）：同步可读，给带下划线的扩展 id 做最长前缀还原 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const vmExtensionIds = (vm: any): string[] => {
    const manager = vm?.extensionManager;
    return [...Object.keys(manager?._officialExtensionInfo ?? {}), ...Object.keys(manager?._customExtensionInfo ?? {}),
        ...(manager?._loadedExtensions?.keys?.() ?? [])];
};

/** schema 里已有扩展积木带的扩展 id（核心积木没有） */
export const extensionIdsInSchema = (schema: Record<string, {extension?: {id?: string}} | undefined> | undefined): Set<string> => {
    const ids = new Set<string>();
    for (const spec of Object.values(schema ?? {})) {
        const id = spec?.extension?.id;
        if (typeof id === 'string' && id) ids.add(id);
    }
    return ids;
};
