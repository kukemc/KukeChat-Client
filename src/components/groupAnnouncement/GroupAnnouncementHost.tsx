import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { describeAnnouncementError } from '@/api/groupAnnouncements';
import { cx } from '@/components/chat/desktop/runtime';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { ImageViewer, type ImageViewerState } from '@/components/ui/ImageViewer';
import { useEscapeLayer } from '@/components/ui/desktop/Modal';
import { toast } from '@/components/ui/toast';
import { useKukeStore } from '@/store/kukeStore';
import type { Conversation } from '@/types/api';
import type { GroupAnnouncement } from '@/types/groupAnnouncement';
import { AnnouncementCenter } from './AnnouncementCenter';
import { announcementKeys, markSeen, useAnnouncementPopups, useAnnouncementUi, useConfirmAnnouncement } from './data';
import { AnnouncementImages, AnnouncementText, authorNameOf, formatAnnouncementTime, NicknameEditor } from './parts';

function isStaff(conversation: Conversation): boolean {
  return conversation.my_role === 'owner' || conversation.my_role === 'admin';
}

/**
 * 群公告的全局浮层，主界面上挂一份（ChatDashboard，和 GroupPlusHosts 并排）：
 * - 聊天里点了公告卡片（useAnnouncementUi.target）：打开那条公告的详情；
 * - 正开着的群有该弹的公告（GET /announcements/popups）：逐条弹窗。
 * 这样卡片和「进群」都不用关心自己在桌面还是移动布局、在哪个聊天面板里。
 */
export function GroupAnnouncementHost(): JSX.Element {
  const queryClient = useQueryClient();
  const target = useAnnouncementUi((state) => state.target);
  const close = useAnnouncementUi((state) => state.close);
  const visibleConversationId = useKukeStore((state) => state.visibleConversationId);
  const conversations = queryClient.getQueryData<Conversation[]>(['conversations']) ?? [];
  const targetConversation = target ? conversations.find((item) => item.id === target.conversationId) : undefined;
  const visibleConversation = visibleConversationId !== null ? conversations.find((item) => item.id === visibleConversationId) : undefined;
  const popupConversation = visibleConversation?.type === 'group' ? visibleConversation : undefined;

  return (
    <>
      {popupConversation && !targetConversation ? <PopupQueue key={popupConversation.id} conversation={popupConversation} /> : null}
      {target && targetConversation ? (
        <AnnouncementCenter
          key={`${target.conversationId}-${target.announcementId}`}
          conversation={targetConversation}
          canPublish={isStaff(targetConversation)}
          initialAnnouncementId={target.announcementId}
          onClose={close}
        />
      ) : null}
    </>
  );
}

/** 进群弹窗：一条一条弹，处理完一条（确认 / 我知道了）从队列里拿掉，下一条接着弹。 */
function PopupQueue({ conversation }: { conversation: Conversation }): JSX.Element | null {
  const queryClient = useQueryClient();
  const query = useAnnouncementPopups(conversation.id);
  const current = query.data?.[0];
  if (!current) {
    return null;
  }
  const dequeue = (): void => {
    queryClient.setQueryData<GroupAnnouncement[] | undefined>(announcementKeys.popups(conversation.id), (list) => list?.filter((item) => item.id !== current.id));
  };
  return <AnnouncementPopup key={current.id} conversation={conversation} announcement={current} onDone={dequeue} />;
}

function AnnouncementPopup({ conversation, announcement, onDone }: { conversation: Conversation; announcement: GroupAnnouncement; onDone: () => void }): JSX.Element {
  const queryClient = useQueryClient();
  const mobile = useKukeStore((state) => state.layoutMode === 'mobile');
  const confirm = useConfirmAnnouncement(conversation.id);
  const [viewer, setViewer] = useState<ImageViewerState | null>(null);
  const [confirmFailed, setConfirmFailed] = useState(false);
  const needConfirm = announcement.require_confirm && !announcement.my_confirmed;
  const name = authorNameOf(announcement);

  const acknowledge = (): void => {
    markSeen(queryClient, conversation.id, announcement.id);
    onDone();
  };
  const confirmReceived = (): void => {
    confirm.mutate(announcement.id, {
      onSuccess: () => onDone(),
      onError: (error) => {
        setConfirmFailed(true);
        toast.error(describeAnnouncementError(error, '确认失败，请稍后重试。'));
      }
    });
  };

  // 需要确认的公告只能点「确认收到」关掉；其它的 Esc 等于「我知道了」
  useEscapeLayer(viewer || needConfirm ? null : acknowledge);

  return (
    <div className={cx('kga kui kga-pop-layer', mobile && 'is-mobile')} onMouseDown={(event) => event.stopPropagation()} onContextMenu={(event) => event.stopPropagation()}>
      <section className="kga-pop" role="dialog" aria-modal="true" aria-label="群公告">
        <header className="kga-pop-head">
          <span className="kga-pop-badge"><Icon name="announcement" className="h-3.5 w-3.5" />群公告</span>
          <span className="kga-pop-group">{conversation.title || '群聊'}</span>
        </header>
        <div className="kga-pop-who">
          <Avatar user={announcement.author} label={name} size="sm" />
          <span>
            <strong>{name}</strong>
            <time>{formatAnnouncementTime(announcement.created_at)}{announcement.edited_at ? ' · 已编辑' : ''}</time>
          </span>
        </div>
        <div className="kga-pop-body scroll-soft">
          <AnnouncementText content={announcement.content} />
          <AnnouncementImages images={announcement.images} onOpen={(index) => setViewer({ images: announcement.images.map((image) => image.url), index })} />
          {announcement.guide_nickname ? <div className="kga-pop-nick"><NicknameEditor conversationId={conversation.id} currentNickname={conversation.my_nickname ?? ''} /></div> : null}
        </div>
        <footer className="kga-pop-foot">
          {needConfirm ? (
            <>
              <p className="kga-pop-hint">发布者要求群成员确认收到这条公告</p>
              <button type="button" className="kga-btn is-ink is-block is-lg" disabled={confirm.isPending} onClick={confirmReceived}>{confirm.isPending ? '确认中…' : '确认收到'}</button>
              {/* 确认请求失败（断网之类）时给一条退路，免得整个窗口被挡住；下次进群还会再弹 */}
              {confirmFailed ? <button type="button" className="kga-btn is-ghost is-block" onClick={onDone}>稍后再说</button> : null}
            </>
          ) : (
            <button type="button" className="kga-btn is-ink is-block is-lg" onClick={acknowledge}>我知道了</button>
          )}
        </footer>
      </section>
      {viewer ? <ImageViewer viewer={viewer} mobile={mobile} onClose={() => setViewer(null)} onNavigate={(index) => setViewer((value) => (value ? { ...value, index } : value))} /> : null}
    </div>
  );
}
