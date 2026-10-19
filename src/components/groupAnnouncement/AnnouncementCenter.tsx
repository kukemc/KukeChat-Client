import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { describeAnnouncementError, isAnnouncementGone } from '@/api/groupAnnouncements';
import { cx } from '@/components/chat/desktop/runtime';
import { roleBadgeLabel } from '@/components/chat/message/messageMeta';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { ImageViewer, type ImageViewerState } from '@/components/ui/ImageViewer';
import { useIsDesktopLayout } from '@/components/ui/desktop/Modal';
import { toast } from '@/components/ui/toast';
import type { Conversation } from '@/types/api';
import type { AnnouncementConfirmStatus, GroupAnnouncement } from '@/types/groupAnnouncement';
import { AnnouncementEditor } from './AnnouncementEditor';
import { markSeen, useAnnouncementConfirmations, useAnnouncementDetail, useAnnouncementList, useConfirmAnnouncement, useDeleteAnnouncement } from './data';
import { AnnouncementImages, AnnouncementTags, AnnouncementText, authorNameOf, formatAnnouncementTime, imageThumb, NicknameEditor, PageShell, useNativeBack } from './parts';

export interface AnnouncementCenterProps {
  conversation: Conversation;
  canPublish: boolean;
  /** 旧入口传的「是不是手机整页」。现在由布局决定：桌面布局是对话框，移动布局是整页 */
  mobile?: boolean;
  /** 从聊天里的公告卡片打开：直接进这条的详情，返回即关闭 */
  initialAnnouncementId?: number | null;
  onClose: () => void;
}

type Page =
  | { kind: 'list' }
  | { kind: 'detail'; id: number }
  | { kind: 'editor'; id: number | null }
  | { kind: 'confirmations'; id: number };

/**
 * 群公告（v2）：列表 → 详情 → 编辑 / 确认统计，一个页面栈。
 * 入口：聊天头部 / 侧栏 / 群资料里的「群公告」（从列表开始），聊天里的公告卡片（从详情开始，见 GroupAnnouncementHost）。
 */
export function AnnouncementCenter({ conversation, canPublish, initialAnnouncementId = null, onClose }: AnnouncementCenterProps): JSX.Element {
  const mobile = !useIsDesktopLayout();
  const [stack, setStack] = useState<Page[]>(() => (initialAnnouncementId !== null ? [{ kind: 'detail', id: initialAnnouncementId }] : [{ kind: 'list' }]));
  const [viewer, setViewer] = useState<ImageViewerState | null>(null);
  const page = stack[stack.length - 1];
  const canGoBack = stack.length > 1;

  const push = (next: Page): void => setStack((current) => [...current, next]);
  const back = useCallback((): void => {
    if (stack.length > 1) {
      setStack((current) => current.slice(0, -1));
    } else {
      onClose();
    }
  }, [onClose, stack.length]);

  useNativeBack(mobile && viewer === null, back);

  const openImages = (announcement: GroupAnnouncement, index: number): void => {
    setViewer({ images: announcement.images.map((image) => image.url), index });
  };
  const common = { mobile, onClose, onBack: canGoBack ? back : undefined };

  let body: JSX.Element;
  if (page.kind === 'list') {
    body = <ListPage {...common} conversation={conversation} canPublish={canPublish} onOpen={(id) => push({ kind: 'detail', id })} onPublish={() => push({ kind: 'editor', id: null })} />;
  } else if (page.kind === 'detail') {
    body = (
      <DetailPage
        {...common}
        key={page.id}
        conversation={conversation}
        canPublish={canPublish}
        announcementId={page.id}
        onOpenImages={openImages}
        onEdit={() => push({ kind: 'editor', id: page.id })}
        onConfirmations={() => push({ kind: 'confirmations', id: page.id })}
        onDeleted={back}
      />
    );
  } else if (page.kind === 'editor') {
    body = (
      <EditorPage
        mobile={mobile}
        conversationId={conversation.id}
        announcementId={page.id}
        onBack={back}
        onClose={onClose}
        onSaved={(saved) => setStack((current) => {
          const rest = current.slice(0, -1);
          // 发布新公告：回到列表后直接看它的详情；修改：退回原来的详情
          return page.id === null ? [...rest, { kind: 'detail', id: saved.id }] : rest;
        })}
      />
    );
  } else {
    body = <ConfirmationsPage {...common} onBack={back} conversationId={conversation.id} announcementId={page.id} />;
  }

  return (
    <>
      {body}
      {viewer ? <ImageViewer viewer={viewer} mobile={mobile} onClose={() => setViewer(null)} onNavigate={(index) => setViewer((current) => (current ? { ...current, index } : current))} /> : null}
    </>
  );
}

interface CommonPageProps {
  mobile: boolean;
  onBack?: () => void;
  onClose: () => void;
}

// ───────── 列表 ─────────

function ListPage({ mobile, onBack, onClose, conversation, canPublish, onOpen, onPublish }: CommonPageProps & { conversation: Conversation; canPublish: boolean; onOpen: (id: number) => void; onPublish: () => void }): JSX.Element {
  const query = useAnnouncementList(conversation.id);
  const announcements = query.data ?? [];
  const actions = canPublish ? (
    <button type="button" className={mobile ? 'kga-btn is-ink is-sm' : 'kui-btn kui-btn--primary kui-btn--sm kga-publish'} onClick={onPublish}>
      {mobile ? null : <Icon name="plus" className="h-3.5 w-3.5" />}发布
    </button>
  ) : null;

  return (
    <PageShell mobile={mobile} title="群公告" subtitle={conversation.title || '未命名群聊'} onBack={onBack} onClose={onClose} actions={actions}>
      {query.isLoading ? <p className="kga-status">正在加载公告…</p>
        : query.error ? <p className="kga-status is-error">公告加载失败。<button type="button" className="kga-link" onClick={() => void query.refetch()}>重试</button></p>
        : announcements.length === 0 ? (
          <div className="kga-empty">
            <span className="kga-empty-icon"><Icon name="announcement" className="h-6 w-6" /></span>
            <strong>暂无群公告</strong>
            <span>{canPublish ? '发布的公告会显示在这里，也会以卡片发到群聊里。' : '群主和管理员发布的公告会显示在这里。'}</span>
          </div>
        ) : (
          <div className="kga-list">
            {announcements.map((announcement) => {
              const thumb = announcement.images[0] ? imageThumb(announcement.images[0]) : undefined;
              const name = authorNameOf(announcement);
              return (
                <button key={announcement.id} type="button" className={cx('kga-item', !announcement.my_seen && 'is-unread')} onClick={() => onOpen(announcement.id)}>
                  <span className="kga-item-head">
                    <Avatar user={announcement.author} label={name} size="sm" />
                    <span className="kga-item-who">
                      <span className="kga-item-name">{name}</span>
                      <time>{formatAnnouncementTime(announcement.created_at)}{announcement.edited_at ? ' · 已编辑' : ''}</time>
                    </span>
                    <AnnouncementTags announcement={announcement} />
                  </span>
                  <span className="kga-item-body">
                    <span className="kga-item-text">{announcement.content}</span>
                    {thumb ? (
                      <span className="kga-item-thumb">
                        <img src={thumb} alt="" loading="lazy" decoding="async" draggable={false} />
                        {announcement.images.length > 1 ? <small>{announcement.images.length}</small> : null}
                      </span>
                    ) : null}
                  </span>
                  {canPublish && announcement.require_confirm ? (
                    <span className="kga-item-foot">已确认 {announcement.confirmed_count}/{announcement.member_count}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
    </PageShell>
  );
}

// ───────── 详情 ─────────

interface DetailPageProps extends CommonPageProps {
  conversation: Conversation;
  canPublish: boolean;
  announcementId: number;
  onOpenImages: (announcement: GroupAnnouncement, index: number) => void;
  onEdit: () => void;
  onConfirmations: () => void;
  onDeleted: () => void;
}

function DetailPage({ mobile, onBack, onClose, conversation, canPublish, announcementId, onOpenImages, onEdit, onConfirmations, onDeleted }: DetailPageProps): JSX.Element {
  const queryClient = useQueryClient();
  const query = useAnnouncementDetail(conversation.id, announcementId);
  const confirm = useConfirmAnnouncement(conversation.id);
  const remove = useDeleteAnnouncement(conversation.id);
  const announcement = query.data;
  const seenRef = useRef(false);

  // 打开详情就算看过（第 4 节：不要求确认的公告以 /seen 为准）
  useEffect(() => {
    if (!announcement || seenRef.current) {
      return;
    }
    seenRef.current = true;
    if (!announcement.my_seen) {
      markSeen(queryClient, conversation.id, announcement.id);
    }
  }, [announcement, conversation.id, queryClient]);

  const gone = !announcement && query.error && isAnnouncementGone(query.error);
  const actions = canPublish && announcement ? (
    <span className="kga-head-actions">
      <button type="button" className={mobile ? 'kga-m-icon' : 'kui-icon-btn'} title="编辑" aria-label="编辑公告" onClick={onEdit}><Icon name="edit" className="h-4 w-4" /></button>
      <button type="button" className={cx(mobile ? 'kga-m-icon' : 'kui-icon-btn', 'kga-danger')} title="删除" aria-label="删除公告" disabled={remove.isPending} onClick={() => {
        if (!window.confirm('确定要删除这条群公告吗？聊天里的公告卡片会显示「该公告已删除」。')) {
          return;
        }
        remove.mutate(announcement.id, {
          onSuccess: () => {
            toast.info('公告已删除');
            onDeleted();
          },
          onError: (error) => toast.error(describeAnnouncementError(error, '删除失败，请稍后重试。'))
        });
      }}><Icon name="trash" className="h-4 w-4" /></button>
    </span>
  ) : null;

  const confirmButton = announcement?.require_confirm ? (
    announcement.my_confirmed
      ? <span className="kga-confirmed"><Icon name="checkCircle" className="h-4 w-4" />已确认收到</span>
      : (
        <button type="button" className={cx('kga-btn is-ink', mobile && 'is-block')} disabled={confirm.isPending} onClick={() => confirm.mutate(announcement.id, {
          onSuccess: () => toast.success('已确认收到'),
          onError: (error) => toast.error(describeAnnouncementError(error, '确认失败，请稍后重试。'))
        })}>{confirm.isPending ? '确认中…' : '确认收到'}</button>
      )
  ) : null;
  const nickname = announcement?.guide_nickname ? <NicknameEditor conversationId={conversation.id} currentNickname={conversation.my_nickname ?? ''} /> : null;
  const footer = confirmButton || nickname ? <div className="kga-detail-foot">{nickname}{confirmButton}</div> : undefined;

  return (
    <PageShell mobile={mobile} title="公告详情" subtitle={conversation.title || undefined} onBack={onBack} onClose={onClose} actions={actions} footer={footer}>
      {!announcement ? (
        query.isLoading ? <p className="kga-status">正在加载公告…</p>
          : gone ? (
            <div className="kga-empty">
              <span className="kga-empty-icon"><Icon name="trash" className="h-6 w-6" /></span>
              <strong>该公告已删除</strong>
            </div>
          ) : <p className="kga-status is-error">公告加载失败。<button type="button" className="kga-link" onClick={() => void query.refetch()}>重试</button></p>
      ) : (
        <article className="kga-detail">
          <header className="kga-detail-head">
            <Avatar user={announcement.author} label={authorNameOf(announcement)} size="md" />
            <div className="kga-detail-who">
              <strong>{authorNameOf(announcement)}</strong>
              <span>
                {formatAnnouncementTime(announcement.created_at)}
                {announcement.edited_at ? <em title={`修改于 ${formatAnnouncementTime(announcement.edited_at)}`}> · 已编辑</em> : null}
              </span>
            </div>
            <AnnouncementTags announcement={announcement} />
          </header>
          <AnnouncementText content={announcement.content} className="kga-detail-text" />
          <AnnouncementImages images={announcement.images} onOpen={(index) => onOpenImages(announcement, index)} />
          {canPublish && announcement.require_confirm ? (
            <button type="button" className="kga-stat-row" onClick={onConfirmations}>
              <Icon name="users" className="h-4 w-4" />
              <span>已确认 <b>{announcement.confirmed_count}</b> 人 · 未确认 <b>{Math.max(0, announcement.member_count - announcement.confirmed_count)}</b> 人</span>
              <Icon name="chevron" className="h-3.5 w-3.5 kga-stat-arrow" />
            </button>
          ) : null}
        </article>
      )}
    </PageShell>
  );
}

// ───────── 编辑 ─────────

function EditorPage({ mobile, conversationId, announcementId, onBack, onClose, onSaved }: { mobile: boolean; conversationId: number; announcementId: number | null; onBack: () => void; onClose: () => void; onSaved: (announcement: GroupAnnouncement) => void }): JSX.Element {
  const query = useAnnouncementDetail(conversationId, announcementId ?? 0, announcementId !== null);
  if (announcementId === null) {
    return <AnnouncementEditor conversationId={conversationId} mobile={mobile} announcement={null} onBack={onBack} onClose={onClose} onSaved={onSaved} />;
  }
  if (!query.data) {
    return (
      <PageShell mobile={mobile} title="编辑群公告" onBack={onBack} onClose={onClose}>
        {query.error ? <p className="kga-status is-error">{describeAnnouncementError(query.error, '公告加载失败。')}</p> : <p className="kga-status">正在加载公告…</p>}
      </PageShell>
    );
  }
  return <AnnouncementEditor conversationId={conversationId} mobile={mobile} announcement={query.data} onBack={onBack} onClose={onClose} onSaved={onSaved} />;
}

// ───────── 确认统计 ─────────

function ConfirmationsPage({ mobile, onBack, onClose, conversationId, announcementId }: CommonPageProps & { conversationId: number; announcementId: number }): JSX.Element {
  const [status, setStatus] = useState<AnnouncementConfirmStatus>('unconfirmed');
  const detail = useAnnouncementDetail(conversationId, announcementId);
  const query = useAnnouncementConfirmations(conversationId, announcementId, status);
  const pages = query.data?.pages ?? [];
  const items = pages.flatMap((page) => page.items);
  const latest = pages[pages.length - 1];
  const confirmedCount = latest?.confirmed_count ?? detail.data?.confirmed_count ?? 0;
  const memberCount = latest?.member_count ?? detail.data?.member_count ?? 0;
  const unconfirmedCount = latest?.unconfirmed_count ?? Math.max(0, memberCount - confirmedCount);

  return (
    <PageShell mobile={mobile} title="确认情况" subtitle={memberCount ? `共 ${memberCount} 人` : undefined} onBack={onBack} onClose={onClose}>
      <div className="kga-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={status === 'unconfirmed'} className={cx(status === 'unconfirmed' && 'is-active')} onClick={() => setStatus('unconfirmed')}>未确认 <b>{unconfirmedCount}</b></button>
        <button type="button" role="tab" aria-selected={status === 'confirmed'} className={cx(status === 'confirmed' && 'is-active')} onClick={() => setStatus('confirmed')}>已确认 <b>{confirmedCount}</b></button>
      </div>
      {query.isLoading ? <p className="kga-status">正在加载…</p>
        : query.error ? <p className="kga-status is-error">{describeAnnouncementError(query.error, '加载失败，请稍后重试。')}</p>
        : items.length === 0 ? <p className="kga-status">{status === 'confirmed' ? '还没有人确认收到。' : '所有人都已确认收到。'}</p>
        : (
          <div className="kga-people">
            {items.map((item, index) => {
              const name = item.nickname?.trim() || getDisplayName(item.user, '已注销用户');
              const badge = roleBadgeLabel(item.role);
              return (
                <div key={item.user?.id ?? `gone-${index}`} className="kga-person">
                  <Avatar user={item.user} label={name} size="sm" />
                  <span className="kga-person-name">{name}</span>
                  {badge ? <span className="kga-tag">{badge}</span> : null}
                  {item.confirmed_at ? <time>{formatAnnouncementTime(item.confirmed_at)}</time> : null}
                </div>
              );
            })}
            {query.hasNextPage ? (
              <button type="button" className="kga-more" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
                {query.isFetchingNextPage ? '加载中…' : '加载更多'}
              </button>
            ) : null}
          </div>
        )}
    </PageShell>
  );
}
