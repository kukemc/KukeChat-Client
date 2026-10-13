import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toggleMessageBookmark } from '@/api/messages';
import type { BookmarkedMessageRead, Conversation, Message, User } from '@/types/api';
import { Icon } from '@/components/ui/Icon';
import { ImageViewer } from '@/components/ui/ImageViewer';
import { registerNativeBackHandler } from '@/native/back';
import { FavoritesDesktop } from './desktop/FavoritesDesktop';
import { formatMessageTime, messageSenderLabel } from './messageMeta';
import { ConversationAvatar } from './messageText';
import { renderMessageContentPreview } from './messageContent';
import { FAVORITE_FILTERS, useFavorites } from './useFavorites';


export interface FavoritesPanelProps {
  conversations: Conversation[];
  currentUser: User;
  items: BookmarkedMessageRead[];
  isLoading: boolean;
  error: unknown;
  isMobile?: boolean;
  onOpenForwardBundle: (message: Message) => void;
  onMobileBack?: () => void;
  transitionStyle?: CSSProperties;
}

/** 收藏页的入口：桌面布局和移动布局是两套界面，筛选和搜索的状态都来自 useFavorites。 */
export function FavoritesPanel(props: FavoritesPanelProps): JSX.Element {
  return props.isMobile ? <FavoritesMobile {...props} /> : <FavoritesDesktop {...props} />;
}

function FavoritesMobile({ conversations, currentUser, items, isLoading, error, onOpenForwardBundle, onMobileBack, transitionStyle }: FavoritesPanelProps): JSX.Element {
  const { filter, setFilter, search, setSearch, counts, visible, imageViewer, setImageViewer, openImage, navigateImage } = useFavorites(items, conversations, currentUser);
  const [favoriteSearchOpen, setFavoriteSearchOpen] = useState(false);
  const [favoriteAction, setFavoriteAction] = useState<BookmarkedMessageRead | null>(null);
  const favoriteLongPressTimer = useRef<number | null>(null);
  const favoriteLongPressTriggered = useRef(false);
  const queryClient = useQueryClient();
  const filterLabel = FAVORITE_FILTERS.find((option) => option.key === filter)?.label ?? '全部';

  const clearFavoriteLongPress = (): void => {
    if (favoriteLongPressTimer.current !== null) {
      window.clearTimeout(favoriteLongPressTimer.current);
      favoriteLongPressTimer.current = null;
    }
  };
  const openFavoriteAction = (item: BookmarkedMessageRead): void => {
    clearFavoriteLongPress();
    favoriteLongPressTriggered.current = true;
    setFavoriteAction(item);
  };
  const startFavoriteLongPress = (item: BookmarkedMessageRead): void => {
    clearFavoriteLongPress();
    favoriteLongPressTriggered.current = false;
    favoriteLongPressTimer.current = window.setTimeout(() => openFavoriteAction(item), 520);
  };
  const finishFavoritePress = (): void => {
    clearFavoriteLongPress();
    window.setTimeout(() => { favoriteLongPressTriggered.current = false; }, 0);
  };

  const deleteFavoriteMutation = useMutation({
    mutationFn: ({ conversationId, messageId }: { conversationId: number; messageId: number }) => toggleMessageBookmark(conversationId, messageId),
    onSuccess: (_result, variables) => {
      setFavoriteAction(null);
      queryClient.setQueriesData<BookmarkedMessageRead[]>({ queryKey: ['bookmarks-all'] }, (current) => current?.filter((item) => !(item.conversation_id === variables.conversationId && item.message.id === variables.messageId)) ?? current);
      void queryClient.invalidateQueries({ queryKey: ['bookmarks-all'] });
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    }
  });

  useEffect(() => () => clearFavoriteLongPress(), []);

  useEffect(() => {
    if (!imageViewer) {
      return undefined;
    }
    return registerNativeBackHandler(() => {
      setImageViewer(null);
      return true;
    }, 100);
  }, [imageViewer, setImageViewer]);

  return (
    <section className="kc-qq-page flex h-full min-h-0 flex-col overflow-hidden text-[#111827]" style={transitionStyle}>
        <header className="kc-qq-home-header kc-qq-sticky-home-header mx-4 shrink-0">
          {onMobileBack ? <button type="button" onClick={onMobileBack} className="grid h-9 w-9 place-items-center rounded-full bg-white text-[#526070] shadow-sm" aria-label="返回空间"><Icon name="chevronLeft" className="h-5 w-5" /></button> : <span className="h-9 w-9" />}
          <div className="min-w-0 text-center"><h1 className="text-[17px] font-black text-[#151922]">收藏</h1><p className="text-[11px] font-bold text-[#8b95a5]">聊天收藏与重要消息</p></div>
          <button type="button" onClick={() => setFavoriteSearchOpen((open) => !open)} className="grid h-9 w-9 place-items-center rounded-full bg-white text-[#526070] shadow-sm" aria-label="搜索收藏" title="搜索收藏">
            <Icon name="search" className="h-5 w-5" />
          </button>
        </header>
        <div className="kc-qq-scroll kc-mobile-page-transition scroll-soft min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(var(--kc-native-safe-bottom,env(safe-area-inset-bottom))+24px)]">
        <section className="kc-qq-channel-hero mt-2">
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-[#eaf4ff]">我的收藏</p>
            <h2 className="mt-2 text-[30px] font-black leading-none text-white">{items.length}</h2>
            <p className="mt-2 text-[13px] font-medium text-white/80">快速回看聊天里的重点消息和资料卡片。</p>
          </div>
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-[26px] bg-white/18 text-white backdrop-blur">
            <Icon name="bookmark" className="h-8 w-8" />
          </span>
        </section>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="kc-qq-channel-stat">
            <Icon name="message" className="h-5 w-5 text-[#168bff]" />
            <span>私聊收藏</span>
            <strong>{counts.direct}</strong>
          </div>
          <div className="kc-qq-channel-stat">
            <Icon name="users" className="h-5 w-5 text-[#34c759]" />
            <span>群聊收藏</span>
            <strong>{counts.group}</strong>
          </div>
        </div>

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {FAVORITE_FILTERS.map((option) => (
            <button key={option.key} type="button" onClick={() => setFilter(option.key)} className={`shrink-0 rounded-full px-4 py-2 text-[13px] font-bold transition ${filter === option.key ? 'bg-[#168bff] text-white shadow-[0_8px_18px_rgba(22,139,255,0.2)]' : 'bg-white text-[#526070]'}`}>
              {option.label} {counts[option.key]}
            </button>
          ))}
        </div>
        {favoriteSearchOpen ? (
          <label className="kc-qq-search-pill mt-3 h-[46px]">
            <Icon name="search" className="h-5 w-5 shrink-0 text-[#a4adba]" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} className="min-w-0 flex-1 border-0 bg-transparent text-[15px] font-medium outline-none text-[#111827] placeholder:text-[#a4adba]" placeholder="搜索收藏内容、会话或发送者" autoFocus />
            {search ? <button type="button" onClick={() => setSearch('')} className="text-xs font-bold text-[#8b95a5]">清空</button> : null}
          </label>
        ) : null}

        <section className="kc-qq-card mt-3 overflow-hidden p-0">
          <div className="flex items-center justify-between px-4 py-3">
            <h2 className="text-[17px] font-bold text-[#151922]">最近收藏</h2>
            <span className="text-[12px] font-semibold text-[#8b95a5]">{filterLabel}</span>
          </div>
          {isLoading ? <p className="px-4 pb-4 text-[13px] text-[#8b95a5]">正在加载收藏消息...</p> : null}
          {error ? <p className="mx-4 mb-4 rounded-[18px] bg-red-50 p-4 text-[13px] text-red-500">收藏消息加载失败，请稍后重试。</p> : null}
          {!isLoading && !error && items.length === 0 ? <p className="px-4 pb-4 text-[13px] text-[#8b95a5]">暂无收藏消息。长按消息可加入收藏。</p> : null}
          {!isLoading && !error && items.length > 0 && visible.length === 0 ? <p className="px-4 pb-4 text-[13px] text-[#8b95a5]">当前筛选下暂无收藏。</p> : null}
          <div>
            {visible.map(({ item, conversation, title }) => {
              return (
                <article
                  key={`${item.conversation_id}-${item.message.id}`}
                  className="kc-qq-favorite-item select-none"
                  onPointerDown={() => startFavoriteLongPress(item)}
                  onPointerUp={finishFavoritePress}
                  onPointerCancel={finishFavoritePress}
                  onPointerLeave={finishFavoritePress}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    openFavoriteAction(item);
                  }}
                >
                  <ConversationAvatar conversation={conversation} title={title} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center justify-between gap-3">
                      <p className="truncate text-[15px] font-bold text-[#151922]">{title}</p>
                      <span className="shrink-0 text-[11px] font-semibold text-[#b0b6c0]">{formatMessageTime(item.message.created_at)}</span>
                    </div>
                    <p className="mt-1 truncate text-[12px] font-semibold text-[#8b95a5]">{messageSenderLabel(item.message)}</p>
                    <div className="mt-2 line-clamp-2 text-[13px] leading-5 text-[#526070]">{renderMessageContentPreview(item.message, onOpenForwardBundle, openImage)}</div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
      {favoriteAction ? (
        <div className="fixed inset-0 z-[2147483647] flex items-end bg-black/35 px-3 pb-[calc(var(--kc-native-safe-bottom,env(safe-area-inset-bottom))+12px)]" onClick={() => setFavoriteAction(null)}>
          <section className="w-full overflow-hidden rounded-[28px] bg-white p-2 shadow-[0_24px_70px_rgba(15,23,42,0.28)]" onClick={(event) => event.stopPropagation()}>
            <div className="px-4 pb-2 pt-3 text-center">
              <p className="text-[15px] font-black text-[#151922]">收藏操作</p>
              <p className="mt-1 truncate text-[12px] font-semibold text-[#8b95a5]">{messageSenderLabel(favoriteAction.message)} · {formatMessageTime(favoriteAction.message.created_at)}</p>
            </div>
            <button
              type="button"
              disabled={deleteFavoriteMutation.isPending}
              onClick={() => deleteFavoriteMutation.mutate({ conversationId: favoriteAction.conversation_id, messageId: favoriteAction.message.id })}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-[18px] text-[15px] font-black text-red-500 disabled:opacity-50"
            >
              <Icon name="trash" className="h-5 w-5" />{deleteFavoriteMutation.isPending ? '删除中...' : '删除收藏'}
            </button>
            {deleteFavoriteMutation.error ? <p className="mx-2 mb-2 rounded-[16px] bg-red-50 px-3 py-2 text-center text-[12px] font-bold text-red-500">删除收藏失败，请稍后重试。</p> : null}
            <button type="button" onClick={() => setFavoriteAction(null)} className="mt-1 h-12 w-full rounded-[18px] bg-[#f4f6fa] text-[15px] font-black text-[#526070]">取消</button>
          </section>
        </div>
      ) : null}
      {imageViewer ? <ImageViewer viewer={imageViewer} mobile portal onClose={() => setImageViewer(null)} onNavigate={navigateImage} /> : null}
    </section>
  );
}
