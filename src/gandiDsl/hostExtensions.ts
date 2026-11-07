/**
 * 宿主 VM 里装了的扩展（作品现在用着的那些，包括第三方扩展）。
 *
 * 社区扩展跑在 CCW 的 Gandi 编辑器 / 播放器里，构造函数拿得到 VM 的 runtime（见 blockly.ts 的 setHostRuntimeProvider）。
 * `runtime._blockInfo` 是 VM 给每个已装扩展整理好的分类信息：每块积木的 `info`（getInfo() 里那一项）和 `json`
 * （VM 交给积木库 defineBlocksWithJsonArray 的定义）、菜单、配色、图标。这里从它取两样：
 *
 * 1. **schema**：照 Gandi 3.0 的 runtimeSchema.ts（`runtimeExtensions()` → `exportSchema`）把 info 换成编译器认的 schema。
 *    只走 exportSchema 的扩展那一半（给一个没有积木的空积木库），核心积木仍然用随包的 core-schema.json ——
 *    CCW 是 Gandi 2 时代的编辑器，它的核心积木表和 3.0 的编译器不一定对得上。
 * 2. **积木定义**：`json`，画图时给自己加载的积木库（播放器页、没有宿主积木库时）用；借宿主积木库画时它本来就有。
 *
 * 结果按「装了哪些扩展、各有几块积木」的指纹缓存：装 / 卸扩展之后自动重算，编译 / 渲染缓存也跟着换键。
 */
import { exportSchema, type ExtensionInfo } from '@/vendor/gandi-dsl/schema';
import type { Schema } from '@/vendor/gandi-dsl/compiler';
import { CORE_CATEGORIES } from '@/vendor/gandi-dsl/extensionIds';
import { hostRuntime } from './blockly';
import { registerDslNamespaces } from './detect';

interface CategoryLike {
  id?: unknown;
  name?: unknown;
  blocks?: Array<{ info?: Record<string, unknown>; json?: Record<string, unknown> | null } | null>;
  menus?: Array<{ json?: Record<string, unknown> | null } | null>;
  menuInfo?: ExtensionInfo['menus'];
  version?: string;
  url?: string;
}

export interface LiveExtensions {
  /** 指纹：装的扩展或积木数变了就变。 */
  key: string;
  ids: string[];
  schema: Schema;
  /** 积木类型 → VM 给的积木定义 JSON（菜单影子也在里面）。 */
  json: Map<string, Record<string, unknown>>;
}

/** 积木库里没有任何积木的空壳：exportSchema 只做扩展那一半。 */
const EMPTY_LIBRARY = {
  Blocks: {},
  Workspace: class {
    newBlock(): never {
      throw new Error('no blocks');
    }

    dispose(): void {
      // 没东西要释放
    }
  },
  INPUT_VALUE: 1,
  NEXT_STATEMENT: 3
};

/** 核心分类不算（VM 的 _blockInfo 里一般只有扩展，保险起见滤一下）。 */
function categoriesOf(runtime: unknown): CategoryLike[] {
  const list = (runtime as { _blockInfo?: unknown } | null)?._blockInfo;
  if (!Array.isArray(list)) return [];
  return list.filter((category): category is CategoryLike => {
    const id = (category as CategoryLike | null)?.id;
    return typeof id === 'string' && id.length > 0 && !CORE_CATEGORIES.has(id);
  });
}

function fingerprint(categories: CategoryLike[]): string {
  return categories.map((category) => `${String(category.id)}:${category.blocks?.length ?? 0}:${category.menus?.length ?? 0}`).join('|');
}

let cached: LiveExtensions | null = null;

/** 宿主里装了的扩展。没有宿主 runtime（桌面端、网页、安卓渲染页）或一个扩展都没装时返回 null。 */
export function liveExtensions(): LiveExtensions | null {
  const runtime = hostRuntime();
  if (!runtime) return null;
  let categories: CategoryLike[];
  try {
    categories = categoriesOf(runtime);
  } catch {
    return null;
  }
  const key = `live:${fingerprint(categories)}`;
  if (cached && cached.key === key) return cached;
  if (!categories.length) {
    cached = null;
    return null;
  }
  const infos: ExtensionInfo[] = categories.map((category) => ({
    id: String(category.id),
    blocks: (category.blocks ?? []).map((block) => (block?.info ?? block) as unknown as ExtensionInfo['blocks'][number]).filter(Boolean),
    menus: category.menuInfo,
    version: category.version,
    url: category.url
  }));
  let schema: Schema = {};
  try {
    schema = exportSchema(EMPTY_LIBRARY as unknown as Parameters<typeof exportSchema>[0], infos);
  } catch {
    // 某个扩展的 getInfo 形状太怪：退回逐个转换，坏的那个跳过
    for (const info of infos) {
      try {
        Object.assign(schema, exportSchema(EMPTY_LIBRARY as unknown as Parameters<typeof exportSchema>[0], [info]));
      } catch {
        // 跳过
      }
    }
  }
  const json = new Map<string, Record<string, unknown>>();
  for (const category of categories) {
    for (const item of [...(category.menus ?? []), ...(category.blocks ?? [])]) {
      const definition = item?.json;
      if (definition && typeof definition.type === 'string' && !(item as { info?: { isDynamic?: boolean } }).info?.isDynamic) {
        json.set(definition.type, definition);
      }
    }
  }
  const ids = categories.map((category) => String(category.id));
  registerDslNamespaces(ids);
  cached = { key, ids, schema, json };
  return cached;
}
