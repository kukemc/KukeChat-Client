import { useQuery } from '@tanstack/react-query';
import { pokeOptionsQuery } from '@/api/users';
import { ContextMenuItem, ContextMenuSeparator, ContextMenuSurface } from '@/components/ui/ContextMenu';
import { pokeActionLabel } from '@/utils/poke';
import { clampOverlayPosition } from '../../message/chatDom';

const MENU_WIDTH = 184;
/** 首行 + 分隔线 + 四行动作的大致高度，用来把子菜单夹在面板范围内 */
const MENU_HEIGHT = 160;
const GAP = 4;

interface PokeActionMenuProps {
  /** 展开它的那一行菜单项：主菜单的左边、宽度，和这一行的上边（相对 overlayRoot） */
  beside: { left: number; top: number; width: number };
  overlayRoot: HTMLElement | null;
  /** 对方资料里设置的动作 */
  targetAction?: string | null;
  disabled: boolean;
  /** 不带 action 表示「按对方设置的来」 */
  onPick: (action?: string) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

/** 成员菜单里「互动」展开的动作列表。动作由服务端下发；对方自己设置的那个排在最前。 */
export function PokeActionMenu({ beside, overlayRoot, targetAction, disabled, onPick, onMouseEnter, onMouseLeave }: PokeActionMenuProps): JSX.Element {
  const { data: options, isPending } = useQuery(pokeOptionsQuery);
  const preferred = options ? (targetAction && options.actions.includes(targetAction) ? targetAction : options.default_action) : null;
  // 默认贴在主菜单右边；右边放不下（比如从右侧成员栏点开）就翻到左边，不压住主菜单
  const rootWidth = overlayRoot?.getBoundingClientRect().width ?? window.innerWidth;
  const right = beside.left + beside.width + GAP;
  const position = clampOverlayPosition({ left: right + MENU_WIDTH + 8 > rootWidth ? beside.left - MENU_WIDTH - GAP : right, top: beside.top - 4 }, MENU_WIDTH, MENU_HEIGHT, overlayRoot);
  return (
    <ContextMenuSurface onMouseDown={(event) => event.stopPropagation()} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} style={{ ...position, width: MENU_WIDTH }} className="absolute z-20">
      {options && preferred ? (
        <>
          <ContextMenuItem label={pokeActionLabel(preferred)} icon="poke" suffix="TA 的默认" disabled={disabled} onClick={() => onPick(preferred)} />
          <ContextMenuSeparator />
          <div className="kcd-poke-grid">
            {options.actions.filter((action) => action !== preferred).map((action) => (
              <button key={action} type="button" role="menuitem" className="kui-menu-item" disabled={disabled} onClick={() => onPick(action)}>{pokeActionLabel(action)}</button>
            ))}
          </div>
        </>
      ) : isPending ? (
        <ContextMenuItem label="正在加载…" icon="clock" disabled />
      ) : (
        // 动作列表拿不到（比如服务端还没升级）：仍然可以按对方的设置戳一下
        <ContextMenuItem label={pokeActionLabel(targetAction)} icon="poke" disabled={disabled} onClick={() => onPick()} />
      )}
    </ContextMenuSurface>
  );
}
