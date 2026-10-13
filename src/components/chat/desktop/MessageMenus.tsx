import { ContextMenuItem, ContextMenuSeparator, ContextMenuSurface, MenuLayer } from '@/components/ui/ContextMenu';
import { Icon } from '@/components/ui/Icon';
import type { Message } from '@/types/api';
import { clampOverlayPosition } from '../message/chatDom';
import { FULL_REACTION_EMOJIS, QUICK_REACTION_EMOJIS, REACTION_PICKER_HEIGHT, REACTION_PICKER_WIDTH } from '../message/constants';

/** 菜单的大致尺寸，用来把它夹在面板范围内。 */
const MENU_WIDTH = 200;
const MENU_HEIGHT = 372;
import type { MessageMenuState, ReactionPickerState } from '../message/types';

interface MessageMenuProps {
  menu: MessageMenuState;
  overlayRoot: HTMLElement | null;
  canManageFeatured: boolean;
  canRecall: boolean;
  onClose: () => void;
  onReact: (message: Message, emoji: string) => void;
  onMoreReactions: (event: React.MouseEvent<HTMLElement>, message: Message) => void;
  onCopy: (message: Message) => void;
  onFavoriteImage: (imageUrl: string) => void;
  onForward: (message: Message) => void;
  onBookmark: (message: Message) => void;
  onMultiSelect: (message: Message) => void;
  onQuote: (message: Message) => void;
  onFeature: (message: Message) => void;
  onRecall: (message: Message) => void;
  onDelete: (message: Message) => void;
  onReport: (message: Message) => void;
}

/** 消息右键菜单。每个条目点完都会关闭菜单。 */
export function MessageMenu({ menu, overlayRoot, canManageFeatured, canRecall, onClose, onReact, onMoreReactions, onCopy, onFavoriteImage, onForward, onBookmark, onMultiSelect, onQuote, onFeature, onRecall, onDelete, onReport }: MessageMenuProps): JSX.Element {
  const { message } = menu;
  const recalled = Boolean(message.recalled_at);
  // 系统消息（入群提示、戳一戳……）不显示回应、不能被引用，也不能被举报（服务端会拒绝）
  const system = message.type === 'system';
  const position = clampOverlayPosition(menu, MENU_WIDTH, MENU_HEIGHT, overlayRoot);
  const run = (action: () => void) => () => {
    action();
    onClose();
  };

  return (
    <MenuLayer onClose={onClose}>
      <ContextMenuSurface onMouseDown={(event) => event.stopPropagation()} style={position} className="kui-scroll absolute max-h-[calc(100%-16px)] w-[200px]">
        {!recalled && !system ? (
          <>
            <div className="kcd-menu-reactions">
              {QUICK_REACTION_EMOJIS.map((emoji) => (
                <button key={emoji} type="button" onClick={run(() => onReact(message, emoji))} aria-label={`回应 ${emoji}`}>{emoji}</button>
              ))}
              <button type="button" onClick={(event) => onMoreReactions(event, message)} aria-label="更多表情回应"><Icon name="plus" className="h-3.5 w-3.5" /></button>
            </div>
            <ContextMenuSeparator />
          </>
        ) : null}
        {message.type !== 'image' ? <ContextMenuItem label="复制" icon="copy" disabled={recalled} onClick={run(() => onCopy(message))} /> : null}
        {menu.clickedImageUrl ? <ContextMenuItem label="添加到表情" icon="heart" disabled={recalled} onClick={run(() => onFavoriteImage(menu.clickedImageUrl ?? ''))} /> : null}
        {system ? null : <ContextMenuItem label="引用" icon="quote" disabled={recalled} onClick={run(() => onQuote(message))} />}
        <ContextMenuItem label="转发" icon="send" disabled={recalled} onClick={run(() => onForward(message))} />
        <ContextMenuItem label="多选" icon="checkSquare" disabled={recalled} onClick={run(() => onMultiSelect(message))} />
        <ContextMenuSeparator />
        <ContextMenuItem label={message.bookmarked_by_me ? '取消收藏' : '收藏'} icon="star" disabled={recalled} onClick={run(() => onBookmark(message))} />
        {canManageFeatured ? <ContextMenuItem label={message.featured ? '取消精华' : '设为精华'} icon="sparkles" disabled={recalled} onClick={run(() => onFeature(message))} /> : null}
        <ContextMenuSeparator />
        {canRecall ? <ContextMenuItem label="撤回" icon="recall" onClick={run(() => onRecall(message))} /> : null}
        <ContextMenuItem label="删除" icon="trash" onClick={run(() => onDelete(message))} />
        {system ? null : <ContextMenuItem label="举报" icon="flag" danger disabled={recalled} onClick={run(() => onReport(message))} />}
      </ContextMenuSurface>
    </MenuLayer>
  );
}

export function ReactionPicker({ picker, overlayRoot, onPick, onClose }: { picker: ReactionPickerState; overlayRoot: HTMLElement | null; onPick: (message: Message, emoji: string) => void; onClose: () => void }): JSX.Element {
  const position = clampOverlayPosition(picker, REACTION_PICKER_WIDTH, REACTION_PICKER_HEIGHT, overlayRoot);
  return (
    <MenuLayer onClose={onClose} className="absolute inset-0 z-50">
      <div onMouseDown={(event) => event.stopPropagation()} style={position} className="kcd-popover kcd-reaction-picker scroll-soft">
        <div className="kcd-reaction-picker-quick">
          {QUICK_REACTION_EMOJIS.map((emoji) => (
            <button key={emoji} type="button" onClick={() => onPick(picker.message, emoji)} aria-label={`回应 ${emoji}`}>{emoji}</button>
          ))}
        </div>
        <div className="kcd-emoji-grid kcd-emoji-grid--dense">
          {FULL_REACTION_EMOJIS.map((emoji) => (
            <button key={emoji} type="button" onClick={() => onPick(picker.message, emoji)} aria-label={`回应 ${emoji}`}>{emoji}</button>
          ))}
        </div>
      </div>
    </MenuLayer>
  );
}
