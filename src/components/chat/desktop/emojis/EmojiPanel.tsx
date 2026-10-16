import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { addFavoriteSticker, removeFavoriteSticker, type FavoriteStickerItem } from '@/api/messages';
import { ContextMenuItem, ContextMenuSeparator, ContextMenuSurface, MenuLayer } from '@/components/ui/ContextMenu';
import { Icon, type IconName } from '@/components/ui/Icon';
import { toast } from '@/components/ui/toast';
import { useKukeStore } from '@/store/kukeStore';
import type { MemberRole } from '@/types/api';
import { clampOverlayPosition, pointInContainer } from '../../message/chatDom';
import type { SendMessageVariables } from '../../message/types';
import { cx, useEvent } from '../runtime';
import { FavoritesPage, GroupPage, RecentPage, SearchPage, SystemPage, type OpenStickerMenu, type StickerSource } from './EmojiPages';
import { EmojiPreview, type EmojiPreviewHandle } from './EmojiPreview';
import { clearRecents, pushRecentEmoji, pushRecentSticker, readLastTab, readRecents, removeRecentSticker, stickerMessage, writeLastTab, type EmojiTab, type RecentEmojis, type StickerItem } from './emojiPrefs';
import { GroupEmojiDialog } from './GroupEmojiDialog';
import { FAVORITE_IMAGE_TYPES, favoriteStickersKey, useFavoriteStickers, useFavoriteUploads, type FavoriteUploads } from './useFavoriteStickers';

interface EmojiPanelProps {
  open: boolean;
  conversationId: number;
  isGroup: boolean;
  currentRole: MemberRole;
  /** 上一条消息还在发送 */
  sending: boolean;
  /** 往输入框光标处插一个 Emoji；面板不关，可以连着点 */
  onInsert: (emoji: string) => void;
  /** 把一张表情当消息发出去；发完由调用方关面板 */
  onSend: (variables: SendMessageVariables) => void;
  /** refocus：用键盘关掉的，焦点应该回到输入框 */
  onClose: (refocus?: boolean) => void;
}

const TABS: Array<{ id: EmojiTab; icon: IconName; label: string }> = [
  { id: 'search', icon: 'search', label: '搜索' },
  { id: 'recent', icon: 'clock', label: '最近使用' },
  { id: 'emoji', icon: 'emoji', label: 'Emoji' },
  { id: 'favorites', icon: 'heart', label: '收藏表情' },
  { id: 'group', icon: 'users', label: '本群表情' }
];

/** 聊天区再矮，面板也至少留这么高 */
const MIN_HEIGHT = 200;
/** 面板和输入卡片之间的缝，和 desktop-emojis.css 里 .kce-pop 的 bottom 是同一个数 */
const GAP = 6;
const MENU_WIDTH = 172;
const MENU_HEIGHT = 104;

interface StickerMenuState {
  item: StickerItem;
  source: StickerSource;
  left: number;
  top: number;
}

function hasFiles(event: React.DragEvent): boolean {
  return Array.from(event.dataTransfer.types).includes('Files');
}

function imagesOf(files: FileList): File[] {
  return Array.from(files).filter((file) => FAVORITE_IMAGE_TYPES.includes(file.type));
}

/** 打开时停在上次的分类；那个分类这次没有内容可看就退到最接近的一个。 */
function initialTab(isGroup: boolean, recents: RecentEmojis): EmojiTab {
  const last = readLastTab();
  if (last === 'group' && !isGroup) {
    return 'favorites';
  }
  if (last === 'recent' && recents.emojis.length === 0 && recents.stickers.length === 0) {
    return 'emoji';
  }
  return last ?? 'emoji';
}

/**
 * 输入框上方的表情面板：Emoji、最近使用、收藏表情、本群表情，外加搜索。
 * 「管理群表情」的对话框也挂在这里，因为点开它的时候面板本身已经收起来了。
 */
export function EmojiPanel({ open, conversationId, isGroup, currentRole, sending, onInsert, onSend, onClose }: EmojiPanelProps): JSX.Element {
  const canManage = isGroup && (currentRole === 'owner' || currentRole === 'admin');
  const [managing, setManaging] = useState(false);
  const uploads = useFavoriteUploads();

  useEffect(() => {
    if (!managing) {
      return undefined;
    }
    // 改名输入框里的 Esc 只退出编辑，它自己会拦住，到不了这里
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault();
        setManaging(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [managing]);

  return (
    <>
      {open ? (
        <EmojiPopover
          conversationId={conversationId}
          isGroup={isGroup}
          canManage={canManage}
          sending={sending}
          uploads={uploads}
          onInsert={onInsert}
          onSend={onSend}
          onClose={onClose}
          onManage={() => {
            onClose();
            setManaging(true);
          }}
        />
      ) : null}
      {managing ? <GroupEmojiDialog conversationId={conversationId} canManage={canManage} onClose={() => setManaging(false)} /> : null}
    </>
  );
}

interface EmojiPopoverProps extends Omit<EmojiPanelProps, 'open' | 'currentRole'> {
  canManage: boolean;
  uploads: FavoriteUploads;
  onManage: () => void;
}

function EmojiPopover({ conversationId, isGroup, canManage, sending, uploads, onInsert, onSend, onClose, onManage }: EmojiPopoverProps): JSX.Element {
  const queryClient = useQueryClient();
  const userId = useKukeStore((state) => state.currentUser?.id ?? 0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const previewRef = useRef<EmojiPreviewHandle | null>(null);
  const dragDepthRef = useRef(0);
  // 最近使用只在打开面板和切到这一页时读一次：边点边重排的话，连点同一个位置会点到别的表情上
  const [recents, setRecents] = useState(() => readRecents(userId));
  const [tab, setTab] = useState<EmojiTab>(() => initialTab(isGroup, recents));
  const [menu, setMenu] = useState<StickerMenuState | null>(null);
  const [dropping, setDropping] = useState(false);
  const [failure, setFailure] = useState('');
  const favorites = useFavoriteStickers(tab === 'favorites');
  const notice = failure || (tab === 'favorites' ? uploads.error : '');

  const addFavorite = useMutation({
    mutationFn: (item: StickerItem) => addFavoriteSticker(item.url),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: favoriteStickersKey });
      toast.info('已添加到收藏表情');
    },
    onError: (error) => setFailure((error instanceof Error && error.message) || '添加收藏表情失败，请稍后重试。')
  });
  const removeFavorite = useMutation({
    mutationFn: (item: StickerItem) => removeFavoriteSticker(item.assetId ?? 0),
    onSuccess: (_result, item) => {
      queryClient.setQueryData<FavoriteStickerItem[]>(favoriteStickersKey, (current) => current?.filter((sticker) => sticker.asset_id !== item.assetId));
      void queryClient.invalidateQueries({ queryKey: favoriteStickersKey });
      // 没有别人收藏的话服务端会把图片一起删掉，最近使用里那张也就打不开了
      setRecents(removeRecentSticker(userId, item.url));
      toast.info('已删除收藏表情');
    },
    onError: () => setFailure('删除收藏表情失败，请稍后重试。')
  });

  const close = useEvent(onClose);
  const handleEscape = useEvent(() => {
    if (menu) {
      setMenu(null);
    } else {
      onClose(true);
    }
  });

  useEffect(() => {
    const onPointerDown = (event: MouseEvent): void => {
      const root = rootRef.current;
      if (root && !event.composedPath().includes(root)) {
        close();
      }
    };
    // 焦点在输入框里时 Esc 由输入框先处理（它还要照顾 @ 成员和机器人指令面板），这里接的是焦点在面板里或别处的情况
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !event.defaultPrevented && !event.isComposing) {
        event.preventDefault();
        handleEscape();
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [close, handleEscape]);

  // 面板往上长，最高只能到聊天头部下面；窗口变矮或者输入框被拖高时跟着缩
  useLayoutEffect(() => {
    const root = rootRef.current;
    const host = root?.offsetParent;
    const column = root?.closest('.kcd-column');
    if (!root || !host || !column) {
      return undefined;
    }
    const measure = (): void => {
      const header = column.querySelector(':scope > .kcd-header');
      const ceiling = header ? header.getBoundingClientRect().bottom : column.getBoundingClientRect().top;
      // 上面留的空和面板到输入框之间那条缝一样宽
      const room = Math.floor(host.getBoundingClientRect().top - ceiling - GAP * 2);
      root.style.setProperty('--kce-room', `${Math.max(MIN_HEIGHT, room)}px`);
      // 窗口很矮、输入框又被拖得很高时上面放不下，往下沉，压住输入框的上半截，也不能顶出聊天区
      root.style.setProperty('--kce-sink', `${Math.max(0, MIN_HEIGHT - room)}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    observer.observe(column);
    return () => observer.disconnect();
  }, []);

  function selectTab(next: EmojiTab): void {
    previewRef.current?.hide();
    setMenu(null);
    setFailure('');
    if (next === 'recent') {
      setRecents(readRecents(userId));
    }
    if (next === 'search') {
      // 已经在搜索页时再点一下图标，是想回到搜索框里
      rootRef.current?.querySelector<HTMLInputElement>('.kce-search input')?.focus();
    }
    if (tab === 'favorites' && next !== 'favorites') {
      // 添加失败的原因只和收藏页有关，看过就不跟到别的页去
      uploads.clearError();
    }
    writeLastTab(next);
    setTab(next);
  }

  const insertEmoji = useEvent((glyph: string) => {
    pushRecentEmoji(userId, glyph);
    onInsert(glyph);
  });
  const sendSticker = useEvent((item: StickerItem) => {
    if (sending) {
      return;
    }
    pushRecentSticker(userId, item);
    onSend(stickerMessage(item));
  });
  const openMenu = useEvent<Parameters<OpenStickerMenu>, void>((event, item, source) => {
    event.preventDefault();
    previewRef.current?.hide();
    setMenu({ item, source, ...clampOverlayPosition(pointInContainer(event.clientX, event.clientY, rootRef.current), MENU_WIDTH, MENU_HEIGHT, rootRef.current) });
  });
  const dropRecent = useEvent((item: StickerItem) => setRecents(removeRecentSticker(userId, item.url)));
  const clearRecent = useEvent(() => setRecents(clearRecents(userId)));
  const addFiles = useEvent((files: File[]) => {
    setFailure('');
    uploads.addFiles(files);
  });
  const runMenu = (action: () => void) => () => {
    setMenu(null);
    action();
  };

  const stickerProps = { disabled: sending, onSend: sendSticker, onMenu: openMenu };
  // 拖进来和粘贴只在收藏页里算「添加收藏」；在别的页里照旧交给输入框，当成要发的图片
  const collecting = tab === 'favorites';

  return (
    <div
      ref={rootRef}
      className="kce-pop"
      onMouseDown={(event) => event.stopPropagation()}
      onPaste={(event) => {
        const images = collecting ? imagesOf(event.clipboardData.files) : [];
        if (images.length > 0) {
          event.preventDefault();
          event.stopPropagation();
          addFiles(images);
        } else if (event.target instanceof HTMLInputElement) {
          // 往搜索框里粘贴文字：不拦的话输入框的表单会把它插进消息里
          event.stopPropagation();
        }
      }}
      onDragEnter={collecting ? (event) => {
        if (hasFiles(event)) {
          event.stopPropagation();
          dragDepthRef.current += 1;
          setDropping(true);
        }
      } : undefined}
      onDragOver={collecting ? (event) => {
        if (hasFiles(event)) {
          event.preventDefault();
          event.stopPropagation();
        }
      } : undefined}
      onDragLeave={collecting ? (event) => {
        if (hasFiles(event)) {
          event.stopPropagation();
          dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
          if (dragDepthRef.current === 0) {
            setDropping(false);
          }
        }
      } : undefined}
      onDrop={collecting ? (event) => {
        if (hasFiles(event)) {
          event.preventDefault();
          event.stopPropagation();
          dragDepthRef.current = 0;
          setDropping(false);
          addFiles(Array.from(event.dataTransfer.files));
        }
      } : undefined}
    >
      <div className="kce-panel" role="dialog" aria-label="表情">
        <div
          key={tab}
          className="kce-body kui-scroll"
          role="tabpanel"
          onMouseOver={(event) => previewRef.current?.show((event.target as HTMLElement).closest<HTMLElement>('[data-kce-preview]'))}
          onMouseLeave={() => previewRef.current?.hide()}
          onScroll={() => previewRef.current?.hide()}
        >
          {tab === 'search' ? <SearchPage conversationId={isGroup ? conversationId : null} onPick={insertEmoji} {...stickerProps} />
            : tab === 'recent' ? <RecentPage recents={recents} onPick={insertEmoji} onBroken={dropRecent} onClear={clearRecent} {...stickerProps} />
              : tab === 'favorites' ? <FavoritesPage query={favorites} pending={uploads.pending} onAddFiles={addFiles} {...stickerProps} />
                : tab === 'group' ? <GroupPage conversationId={conversationId} canManage={canManage} onManage={onManage} {...stickerProps} />
                  : <SystemPage onPick={insertEmoji} />}
        </div>

        {notice ? (
          <div className="kce-notice" role="alert">
            <span>{notice}</span>
            <button type="button" aria-label="关闭提示" onClick={() => {
              setFailure('');
              uploads.clearError();
            }}><Icon name="close" className="h-3 w-3" /></button>
          </div>
        ) : null}

        <div className="kce-tabs" role="tablist" aria-label="表情分类">
          {TABS.filter((item) => item.id !== 'group' || isGroup).map((item) => (
            <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} aria-label={item.label} title={item.label} className={cx('kui-icon-btn', tab === item.id && 'is-active')} onClick={() => selectTab(item.id)}>
              <Icon name={item.icon} className="h-[18px] w-[18px]" />
            </button>
          ))}
          {uploads.pending.length > 0 ? <span className="kce-tabs-status">正在添加 {uploads.pending.length} 张…</span> : null}
        </div>

        {dropping ? <div className="kce-drop"><Icon name="heart" className="h-6 w-6" /><span>松开添加到收藏表情</span></div> : null}
      </div>

      <EmojiPreview ref={previewRef} rootRef={rootRef} />

      {menu ? (
        <MenuLayer onClose={() => setMenu(null)} className="kce-menu-layer">
          <ContextMenuSurface className="absolute" style={{ left: menu.left, top: menu.top }} onMouseDown={(event) => event.stopPropagation()}>
            <ContextMenuItem label="发送" icon="send" disabled={sending} onClick={runMenu(() => sendSticker(menu.item))} />
            {menu.source !== 'favorites' && !menu.item.assetId ? <ContextMenuItem label="添加到收藏" icon="heart" disabled={addFavorite.isPending} onClick={runMenu(() => addFavorite.mutate(menu.item))} /> : null}
            {menu.source === 'recent' ? <ContextMenuItem label="从最近使用中移除" icon="close" onClick={runMenu(() => dropRecent(menu.item))} /> : null}
            {menu.source === 'group' && canManage ? <ContextMenuItem label="管理群表情" icon="settings" onClick={runMenu(onManage)} /> : null}
            {menu.source === 'favorites' ? (
              <>
                <ContextMenuSeparator />
                <ContextMenuItem label="删除" icon="trash" danger disabled={removeFavorite.isPending} onClick={runMenu(() => {
                  if (window.confirm('确定要删除这个收藏表情吗？')) {
                    setFailure('');
                    removeFavorite.mutate(menu.item);
                  }
                })} />
              </>
            ) : null}
          </ContextMenuSurface>
        </MenuLayer>
      ) : null}
    </div>
  );
}
