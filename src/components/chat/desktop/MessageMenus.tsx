import { ContextMenuItem, ContextMenuSeparator, ContextMenuSurface, MenuLayer } from '@/components/ui/ContextMenu';
import { Icon } from '@/components/ui/Icon';
import type { Message } from '@/types/api';
import { isGiftMessage } from '@/utils/gift';
import { isRedPacketMessage } from '@/utils/redPacket';
import { groupFileMetaOf } from '@/api/groupPlus';
import { clampOverlayPosition } from '../message/chatDom';
import { QUICK_REACTION_EMOJIS } from '../message/constants';
import { canTranscribeVoice, toggleVoiceTranscript, voiceTranscriptOf } from '../message/voiceTranscripts';
import { ReactionPickerPanel } from './reactions/ReactionPickerPanel';
import { readRecentReactions, rememberReaction } from './reactions/reactionRecent';

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
  /** 「设为群待办 / 取消群待办」；不该出现时为 null（非群主管理员、不支持的消息类型……） */
  todoAction?: { label: string; run: () => void } | null;
  onRecall: (message: Message) => void;
  onDelete: (message: Message) => void;
  onReport: (message: Message) => void;
}

/** 消息右键菜单。每个条目点完都会关闭菜单。 */
export function MessageMenu({ menu, overlayRoot, canManageFeatured, canRecall, onClose, onReact, onMoreReactions, onCopy, onFavoriteImage, onForward, onBookmark, onMultiSelect, onQuote, onFeature, todoAction, onRecall, onDelete, onReport }: MessageMenuProps): JSX.Element {
  const { message } = menu;
  const recalled = Boolean(message.recalled_at);
  // 系统消息（入群提示、戳一戳……）不显示回应、不能被引用，也不能被举报（服务端会拒绝）
  const system = message.type === 'system';
  // 红包、礼物、群文件消息不能转发（服务端对带文件的合并转发整个拒绝），也不进多选（多选是为了合并转发）
  const redPacket = isRedPacketMessage(message) || isGiftMessage(message) || groupFileMetaOf(message) !== null;
  // 系统消息（戳一戳、入群提示）也不能转发、不进多选：它们没有发送者，转出去后别处的界面画不了
  const notForwardable = redPacket || system;
  const position = clampOverlayPosition(menu, MENU_WIDTH, MENU_HEIGHT, overlayRoot);
  // 快捷回应：最近用过的排前面，不够 6 个用默认的补
  const quickReactions = [...new Set([...readRecentReactions(), ...QUICK_REACTION_EMOJIS])].slice(0, QUICK_REACTION_EMOJIS.length);
  const react = (emoji: string): void => {
    if (!message.reactions?.some((reaction) => reaction.emoji === emoji && reaction.reacted_by_me)) {
      rememberReaction(emoji);
    }
    onReact(message, emoji);
  };
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
              {quickReactions.map((emoji) => (
                <button key={emoji} type="button" onClick={run(() => react(emoji))} aria-label={`回应 ${emoji}`}>{emoji}</button>
              ))}
              <button type="button" onClick={(event) => onMoreReactions(event, message)} aria-label="更多表情回应"><Icon name="plus" className="h-3.5 w-3.5" /></button>
            </div>
            <ContextMenuSeparator />
          </>
        ) : null}
        {message.type !== 'image' ? <ContextMenuItem label="复制" icon="copy" disabled={recalled} onClick={run(() => onCopy(message))} /> : null}
        {menu.clickedImageUrl ? <ContextMenuItem label="添加到表情" icon="heart" disabled={recalled} onClick={run(() => onFavoriteImage(menu.clickedImageUrl ?? ''))} /> : null}
        {/* 语音转文字：字挂在气泡下面；已经展开着就是「收起文字」 */}
        {canTranscribeVoice(message) ? <ContextMenuItem label={voiceTranscriptOf(message).open ? '收起文字' : '转文字'} icon="fileText" onClick={run(() => toggleVoiceTranscript(message))} /> : null}
        {system ? null : <ContextMenuItem label="引用" icon="quote" disabled={recalled} onClick={run(() => onQuote(message))} />}
        {notForwardable ? null : <ContextMenuItem label="转发" icon="send" disabled={recalled} onClick={run(() => onForward(message))} />}
        {notForwardable ? null : <ContextMenuItem label="多选" icon="checkSquare" disabled={recalled} onClick={run(() => onMultiSelect(message))} />}
        <ContextMenuSeparator />
        <ContextMenuItem label={message.bookmarked_by_me ? '取消收藏' : '收藏'} icon="star" disabled={recalled} onClick={run(() => onBookmark(message))} />
        {canManageFeatured ? <ContextMenuItem label={message.featured ? '取消精华' : '设为精华'} icon="sparkles" disabled={recalled} onClick={run(() => onFeature(message))} /> : null}
        {todoAction ? <ContextMenuItem label={todoAction.label} icon="checkSquare" onClick={run(todoAction.run)} /> : null}
        <ContextMenuSeparator />
        {canRecall ? <ContextMenuItem label="撤回" icon="recall" onClick={run(() => onRecall(message))} /> : null}
        <ContextMenuItem label="删除" icon="trash" onClick={run(() => onDelete(message))} />
        {system ? null : <ContextMenuItem label="举报" icon="flag" danger disabled={recalled} onClick={run(() => onReport(message))} />}
      </ContextMenuSurface>
    </MenuLayer>
  );
}

/** 「添加表情回应」面板，实现在 reactions/ReactionPickerPanel.tsx。 */
export function ReactionPicker({ picker, overlayRoot, onPick, onClose }: { picker: ReactionPickerState; overlayRoot: HTMLElement | null; onPick: (message: Message, emoji: string) => void; onClose: () => void }): JSX.Element {
  return <ReactionPickerPanel picker={picker} overlayRoot={overlayRoot} onPick={onPick} onClose={onClose} />;
}
