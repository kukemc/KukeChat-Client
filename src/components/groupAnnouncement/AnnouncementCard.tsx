import { announcementCardOf } from '@/api/groupAnnouncements';
import { cx } from '@/components/chat/desktop/runtime';
import { resolveMessageImagePreviewUrl } from '@/components/chat/message/messageMeta';
import { Icon } from '@/components/ui/Icon';
import type { Message } from '@/types/api';
import type { AnnouncementCardInfo } from '@/types/groupAnnouncement';
import { resolveAssetUrl } from '@/utils/assetUrl';
import { openAnnouncementDetail, useAnnouncementUi } from './data';

export { announcementCardOf };

/**
 * 聊天里的公告卡片（docs/group-announcements.md 第 5 节）：发布、修改公告时服务端以系统消息发出来。
 * 点开是公告详情；公告删了（metadata.deleted，或者这次运行里收到了删除事件）就变成灰的「该公告已删除」，不能点。
 * 它是系统消息：没有回应、引用、转发、多选（菜单那边按 type === 'system' 排除）。
 *
 * readonly：精华、收藏、合并转发详情这些只读的地方，只画不点。
 */
export function AnnouncementCard({ message, card, readonly = false }: { message: Message; card: AnnouncementCardInfo; readonly?: boolean }): JSX.Element {
  const deletedLocally = useAnnouncementUi((state) => Boolean(state.deleted[card.announcementId]));
  const deleted = card.deleted || deletedLocally;
  const thumb = resolveAssetUrl(card.imageThumbnailUrl) ?? resolveMessageImagePreviewUrl(card.imageUrl);
  const clickable = !deleted && !readonly;

  const inner = (
    <>
      <span className="kga-card-head">
        <span className="kga-card-badge"><Icon name="announcement" className="h-3 w-3" />群公告</span>
        {card.action === 'updated' && !deleted ? <span className="kga-card-flag">公告已更新</span> : null}
        {card.requireConfirm && !deleted ? <span className="kga-card-flag">需确认</span> : null}
      </span>
      {deleted ? <span className="kga-card-gone">该公告已删除</span> : (
        <span className="kga-card-body">
          <span className="kga-card-text">{card.summary || '（无正文）'}</span>
          {thumb ? (
            <span className="kga-card-thumb">
              <img src={thumb} alt="" loading="lazy" decoding="async" draggable={false} />
              {card.imageCount > 1 ? <small>{card.imageCount}</small> : null}
            </span>
          ) : null}
        </span>
      )}
      <span className="kga-card-foot">
        <span>{card.authorName}</span>
        {clickable ? <span className="kga-card-more">查看公告<Icon name="chevron" className="h-3 w-3" /></span> : null}
      </span>
    </>
  );

  if (!clickable) {
    return <div className={cx('kga kga-card', deleted && 'is-deleted')} aria-label="群公告">{inner}</div>;
  }
  return (
    <button
      type="button"
      className="kga kga-card"
      aria-label="查看群公告"
      onClick={(event) => {
        event.stopPropagation();
        openAnnouncementDetail(message.conversation_id, card.announcementId);
      }}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      {inner}
    </button>
  );
}
