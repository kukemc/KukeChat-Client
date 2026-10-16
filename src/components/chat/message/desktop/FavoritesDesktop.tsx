import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { ImageViewer } from '@/components/ui/ImageViewer';
import type { BookmarkedMessageRead, Conversation, Message, User } from '@/types/api';
import { MessageView } from '../MessageView';
import { formatMessageTime, messageSenderLabel } from '../messageMeta';
import { ConversationAvatar } from '../messageText';
import { FAVORITE_FILTERS, useFavorites } from '../useFavorites';

interface FavoritesDesktopProps {
  conversations: Conversation[];
  currentUser: User;
  items: BookmarkedMessageRead[];
  isLoading: boolean;
  error: unknown;
  onOpenForwardBundle: (message: Message) => void;
}

/** 桌面端的收藏页：所有会话里收藏过的消息排成一列，可以按私聊 / 群聊筛选。 */
export function FavoritesDesktop({ conversations, currentUser, items, isLoading, error, onOpenForwardBundle }: FavoritesDesktopProps): JSX.Element {
  const { filter, setFilter, counts, visible, imageViewer, setImageViewer, openImage, navigateImage } = useFavorites(items, conversations, currentUser);

  let state: string | null = null;
  if (isLoading) {
    state = '正在加载收藏消息...';
  } else if (!error && items.length === 0) {
    state = '暂无收藏消息。';
  } else if (!error && visible.length === 0) {
    state = '当前筛选下暂无收藏。';
  }

  return (
    <section className="kfv">
      <header className="kfv-bar">
        <h2>我的收藏</h2>
        <p>集中查看所有已收藏的消息。</p>
        <div className="kui-segment" role="radiogroup" aria-label="按会话类型筛选">
          {FAVORITE_FILTERS.map((option) => (
            <button key={option.key} type="button" role="radio" aria-checked={filter === option.key} className={filter === option.key ? 'is-active' : undefined} onClick={() => setFilter(option.key)}>
              {option.label}<span>{counts[option.key]}</span>
            </button>
          ))}
        </div>
      </header>
      <main className="kfv-body kui-scroll">
        <div className="kfv-page">
          {error ? <p className="kui-note kui-note--danger" role="alert">收藏消息加载失败，请稍后重试。</p> : null}
          {state ? <div className="kui-empty kfv-state"><Icon name="bookmark" className="h-6 w-6" /><p>{state}</p></div> : null}
          {visible.length > 0 ? (
            <ul className="kfv-list">
              {visible.map(({ item, conversation, title }) => {
                const sender = messageSenderLabel(item.message);
                return (
                  <li key={`${item.conversation_id}-${item.message.id}`} className="kfv-item">
                    <Avatar user={item.message.sender} label={sender} size="message" />
                    <div className="kfv-item-main">
                      <div className="kfv-item-head">
                        <strong>{sender}</strong>
                        <time>{formatMessageTime(item.message.created_at)}</time>
                      </div>
                      <div className="kfv-item-content"><MessageView message={item.message} variant="compact" conversationId={item.conversation_id} onOpenImages={openImage} onOpenBundle={onOpenForwardBundle} /></div>
                      <div className="kfv-item-from">
                        <ConversationAvatar conversation={conversation} title={title} size="sm" />
                        <span>{title}</span>
                        <span>{conversation?.type === 'group' ? '群聊' : '私聊'}</span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      </main>
      {imageViewer ? <ImageViewer viewer={imageViewer} portal onClose={() => setImageViewer(null)} onNavigate={navigateImage} /> : null}
    </section>
  );
}
