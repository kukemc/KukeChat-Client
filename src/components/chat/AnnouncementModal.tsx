import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { registerNativeBackHandler } from '@/native/back';
import { createGroupAnnouncement, deleteGroupAnnouncement, getGroupAnnouncements, updateGroupAnnouncement } from '@/api/conversations';
import type { Conversation, GroupAnnouncement } from '@/types/api';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';

const ANNOUNCEMENT_URL_PATTERN = /(https?:\/\/[^\s]+)/g;

interface AnnouncementModalProps {
  conversation: Conversation;
  canPublish: boolean;
  mobile?: boolean;
  onClose: () => void;
}

function formatDateTime(value?: string): string {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function compareAnnouncements(left: GroupAnnouncement, right: GroupAnnouncement): number {
  if (left.pinned !== right.pinned) {
    return left.pinned ? -1 : 1;
  }

  return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
}

function renderAnnouncementContent(content: string): Array<string | JSX.Element> {
  const nodes: Array<string | JSX.Element> = [];
  content.split(ANNOUNCEMENT_URL_PATTERN).forEach((part, index) => {
    if (!part) {
      return;
    }
    if (/^https?:\/\/[^\s]+$/i.test(part)) {
      nodes.push(<a key={`announcement-url-${index}`} href={part} target="_blank" rel="noreferrer" className="font-bold [color:var(--kc-accent)] hover:underline [overflow-wrap:anywhere]">{part}</a>);
      return;
    }
    nodes.push(part);
  });
  return nodes;
}

export function AnnouncementModal({ conversation, canPublish, mobile = false, onClose }: AnnouncementModalProps): JSX.Element {
  const [showPublish, setShowPublish] = useState(false);
  const [content, setContent] = useState('');
  const [pinned, setPinned] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<GroupAnnouncement | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editPinned, setEditPinned] = useState(false);
  const queryClient = useQueryClient();

  const announcementsQuery = useQuery({
    queryKey: ['group-announcements', conversation.id],
    queryFn: () => getGroupAnnouncements(conversation.id),
    enabled: conversation.type === 'group'
  });

  const publishMutation = useMutation({
    mutationFn: () => createGroupAnnouncement(conversation.id, { content: content.trim(), pinned }),
    onSuccess: () => {
      setContent('');
      setPinned(false);
      setShowPublish(false);
      void queryClient.invalidateQueries({ queryKey: ['group-announcements', conversation.id] });
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (announcementId: number) => deleteGroupAnnouncement(conversation.id, announcementId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['group-announcements', conversation.id] });
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    }
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!editingAnnouncement) {
        throw new Error('No announcement selected');
      }
      return updateGroupAnnouncement(conversation.id, editingAnnouncement.id, { content: editContent.trim(), pinned: editPinned });
    },
    onSuccess: () => {
      setEditingAnnouncement(null);
      setEditContent('');
      setEditPinned(false);
      void queryClient.invalidateQueries({ queryKey: ['group-announcements', conversation.id] });
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    }
  });

  function submitPublish(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const nextContent = content.trim();
    if (!canPublish || nextContent.length === 0 || nextContent.length > 600 || publishMutation.isPending) {
      return;
    }

    publishMutation.mutate();
  }

  function deleteAnnouncement(announcement: GroupAnnouncement): void {
    if (!canPublish || deleteMutation.isPending) {
      return;
    }
    if (window.confirm('确定要删除这条群公告吗？')) {
      deleteMutation.mutate(announcement.id);
    }
  }

  function startEdit(announcement: GroupAnnouncement): void {
    if (!canPublish) {
      return;
    }
    setEditingAnnouncement(announcement);
    setEditContent(announcement.content);
    setEditPinned(announcement.pinned);
  }

  function cancelEdit(): void {
    setEditingAnnouncement(null);
    setEditContent('');
    setEditPinned(false);
  }

  function submitEdit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const nextContent = editContent.trim();
    if (!canPublish || !editingAnnouncement || nextContent.length === 0 || nextContent.length > 600 || updateMutation.isPending) {
      return;
    }
    updateMutation.mutate();
  }

  const announcements = [...(announcementsQuery.data ?? [])].sort(compareAnnouncements);
  const title = conversation.title || '未命名群聊';

  useEffect(() => {
    if (!mobile) {
      return undefined;
    }
    return registerNativeBackHandler(() => {
      if (editingAnnouncement) {
        cancelEdit();
        return true;
      }
      if (showPublish) {
        setShowPublish(false);
        return true;
      }
      onClose();
      return true;
    }, 180);
  }, [editingAnnouncement, mobile, onClose, showPublish]);

  const canSubmit = canPublish && content.trim().length > 0 && content.trim().length <= 600 && !publishMutation.isPending;
  const canSubmitEdit = canPublish && editContent.trim().length > 0 && editContent.trim().length <= 600 && !updateMutation.isPending;

  const renderAnnouncementEditor = (mode: 'publish' | 'edit'): JSX.Element => {
    const isEdit = mode === 'edit';
    const value = isEdit ? editContent : content;
    const checked = isEdit ? editPinned : pinned;
    const error = isEdit ? updateMutation.error : publishMutation.error;
    const pending = isEdit ? updateMutation.isPending : publishMutation.isPending;
    const canSubmitCurrent = isEdit ? canSubmitEdit : canSubmit;
    const close = isEdit ? cancelEdit : () => setShowPublish(false);
    return (
      <form onSubmit={isEdit ? submitEdit : submitPublish} onMouseDown={(event) => event.stopPropagation()} className={mobile ? 'flex h-full min-h-0 flex-col [background:#f2f2f4] [color:#111827]' : 'kc-mobile-dialog w-full max-w-[560px] overflow-hidden rounded-[22px] border shadow-float [background:var(--kc-window)] [border-color:var(--kc-border-strong)] [color:var(--kc-text)]'}>
        <div className={mobile ? 'flex h-[64px] shrink-0 items-center justify-between px-4 pt-[max(12px,env(safe-area-inset-top))]' : 'flex h-11 items-center justify-between border-b px-4 [background:var(--kc-titlebar)] [border-color:var(--kc-border)]'}>
          <button type="button" onClick={close} className={mobile ? 'grid h-10 w-10 place-items-center rounded-full text-[#111827] active:bg-black/5' : 'kc-icon-button h-8 w-9 hover:bg-red-500 hover:text-white'} aria-label="关闭公告编辑">
            <Icon name={mobile ? 'chevronLeft' : 'close'} className={mobile ? 'h-6 w-6' : 'h-4 w-4'} />
          </button>
          <h3 className={mobile ? 'text-[17px] font-black' : 'text-sm font-semibold'}>{isEdit ? '编辑群公告' : '发布新公告'}</h3>
          <span className="h-10 w-10" />
        </div>

        <div className={mobile ? 'min-h-0 flex-1 px-4 py-3' : 'p-5 [background:var(--kc-panel)]'}>
          <textarea
            value={value}
            onChange={(event) => {
              const next = event.target.value.slice(0, 600);
              if (isEdit) {
                setEditContent(next);
              } else {
                setContent(next);
              }
            }}
            autoFocus
            rows={10}
            placeholder="填写公告，1-600字"
            className={mobile ? 'h-full min-h-[260px] w-full resize-none rounded-[24px] border-0 bg-white px-4 py-4 text-[15px] leading-7 text-[#111827] shadow-sm outline-none placeholder:text-[#9aa3af]' : 'scroll-soft h-64 w-full resize-none rounded-[20px] border px-4 py-3 text-sm leading-6 outline-none transition [background:var(--kc-panel-muted)] [border-color:var(--kc-border)] [color:var(--kc-text)] placeholder:[color:var(--kc-muted)] focus:[border-color:var(--kc-accent)]'}
          />

          <div className={mobile ? 'mt-3 flex items-center justify-between gap-3 rounded-[20px] bg-white px-4 py-3 text-[13px] text-[#8b95a5]' : 'mt-3 flex items-center justify-between gap-3 text-xs [color:var(--kc-muted)]'}>
            <label className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-1 transition hover:[background:var(--kc-hover)]">
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) => {
                  if (isEdit) {
                    setEditPinned(event.target.checked);
                  } else {
                    setPinned(event.target.checked);
                  }
                }}
                className="h-4 w-4 accent-[var(--kc-accent)]"
              />
              <span>置顶公告</span>
            </label>
            <span>{value.trim().length}/600</span>
          </div>

          {error ? <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-500">公告保存失败。</p> : null}
        </div>

        <div className={mobile ? 'shrink-0 px-4 pb-[max(18px,env(safe-area-inset-bottom))] pt-2' : 'flex justify-end gap-3 border-t px-5 py-4 [background:var(--kc-panel)] [border-color:var(--kc-border)]'}>
          {!mobile ? <button type="button" onClick={close} className="rounded-xl border px-5 py-2 text-sm font-semibold transition [border-color:var(--kc-border-strong)] [color:var(--kc-text)] hover:[background:var(--kc-hover)]">取消</button> : null}
          <button type="submit" disabled={!canSubmitCurrent} className={mobile ? 'h-12 w-full rounded-[18px] bg-[#168bff] text-[16px] font-black text-white transition disabled:opacity-45' : 'liquid-button rounded-xl px-6 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45'}>
            {pending ? (isEdit ? '保存中...' : '发布中...') : (isEdit ? '保存' : '发布')}
          </button>
        </div>
      </form>
    );
  };

  if (mobile) {
    return (
      <div className="kc-mobile-announcement-page fixed inset-0 z-[2147483646] flex min-h-0 flex-col [background:#f2f2f4] [color:#111827]">
        <header className="flex min-h-[calc(max(44px,env(safe-area-inset-top))+64px)] shrink-0 items-end justify-between gap-3 px-4 pb-3 pt-[max(44px,env(safe-area-inset-top))]">
          <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full text-[#111827] active:bg-black/5" aria-label="返回聊天">
            <Icon name="chevronLeft" className="h-6 w-6" />
          </button>
          <div className="min-w-0 flex-1 text-center">
            <h2 className="truncate text-[17px] font-black">群公告</h2>
            <p className="mt-0.5 truncate text-[12px] font-medium text-[#8b95a5]">{title}</p>
          </div>
          {canPublish ? (
            <button type="button" onClick={() => setShowPublish(true)} className="rounded-full bg-[#168bff] px-3 py-1.5 text-[13px] font-bold text-white active:scale-95">发布</button>
          ) : <span className="h-10 w-10" />}
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(18px,env(safe-area-inset-bottom))] pt-2">
          {announcementsQuery.isLoading ? <p className="rounded-[22px] bg-white p-4 text-[14px] text-[#8b95a5] shadow-sm">正在加载公告...</p> : null}
          {announcementsQuery.error ? <p className="rounded-[22px] border border-red-500/20 bg-red-500/10 p-4 text-[14px] text-red-500">公告加载失败。</p> : null}
          {!announcementsQuery.isLoading && !announcementsQuery.error && announcements.length === 0 ? (
            <div className="grid min-h-[55vh] place-items-center text-center">
              <div>
                <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-white text-[#9aa3af] shadow-sm">
                  <Icon name="announcement" className="h-8 w-8" />
                </div>
                <p className="text-[15px] font-black text-[#111827]">暂无公告</p>
                <p className="mt-2 text-[13px] text-[#8b95a5]">群公告发布后会显示在这里。</p>
              </div>
            </div>
          ) : null}
          {announcements.length > 0 ? (
            <div className="grid gap-3">
              {announcements.map((announcement) => {
                const authorName = getDisplayName(announcement.author, announcement.author_id ? `用户 ${announcement.author_id}` : '已注销用户');
                return (
                  <article key={announcement.id} className="rounded-[26px] bg-white p-4 shadow-sm">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar user={announcement.author} label={authorName} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate text-[14px] font-black text-[#111827]">{authorName}</p>
                          <p className="mt-0.5 text-[12px] text-[#8b95a5]">{formatDateTime(announcement.created_at)}</p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {announcement.pinned ? <span className="rounded-full bg-[#eaf4ff] px-2 py-1 text-[11px] font-bold text-[#168bff]">置顶</span> : null}
                        {canPublish ? <button type="button" disabled={updateMutation.isPending} onClick={() => startEdit(announcement)} className="rounded-full bg-[#f2f4f7] px-2.5 py-1 text-[12px] font-bold text-[#4b5563] disabled:opacity-45">编辑</button> : null}
                        {canPublish ? <button type="button" disabled={deleteMutation.isPending} onClick={() => deleteAnnouncement(announcement)} className="rounded-full bg-red-500/10 px-2.5 py-1 text-[12px] font-bold text-red-500 disabled:opacity-45">删除</button> : null}
                      </div>
                    </div>
                    <p className="select-text whitespace-pre-wrap break-words text-[15px] leading-7 text-[#111827]">{renderAnnouncementContent(announcement.content)}</p>
                  </article>
                );
              })}
            </div>
          ) : null}
        </main>

        {showPublish ? <div className="fixed inset-0 z-10">{renderAnnouncementEditor('publish')}</div> : null}
        {editingAnnouncement ? <div className="fixed inset-0 z-10">{renderAnnouncementEditor('edit')}</div> : null}
      </div>
    );
  }

  return (
    <div className="kc-mobile-overlay absolute inset-0 z-20 grid place-items-center p-4 backdrop-blur-sm [background:rgba(0,0,0,0.28)]" onMouseDown={onClose}>
      <section onMouseDown={(event) => event.stopPropagation()} className="kc-mobile-dialog flex h-[min(720px,88vh)] w-full max-w-[760px] flex-col overflow-hidden rounded-md border shadow-float [background:var(--kc-window)] [border-color:var(--kc-border-strong)] [color:var(--kc-text)]">
        <header className="flex h-11 shrink-0 items-center justify-between border-b px-4 [background:var(--kc-titlebar)] [border-color:var(--kc-border)]">
          <h2 className="truncate text-sm font-semibold">{title}</h2>
          <div className="flex items-center">
            <button type="button" onClick={onClose} className="kc-icon-button h-8 w-9 hover:bg-red-500 hover:text-white" aria-label="关闭公告窗口">
              <Icon name="close" className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="flex items-center justify-between border-b px-6 py-4 [background:var(--kc-panel)] [border-color:var(--kc-border)]">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full [background:var(--kc-accent-soft)] [color:var(--kc-accent)]">
              <Icon name="announcement" className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold">群公告</p>
              <p className="mt-0.5 text-xs [color:var(--kc-muted)]">查看群主和管理员发布的公告</p>
            </div>
          </div>
          {canPublish ? (
            <button type="button" onClick={() => setShowPublish(true)} className="liquid-button shrink-0 rounded px-4 py-2 text-sm font-semibold transition">
              发布新公告
            </button>
          ) : null}
        </div>

        <div className="scroll-soft min-h-0 flex-1 overflow-y-auto p-6 [background:var(--kc-list)]">
          {announcementsQuery.isLoading ? <p className="rounded-2xl p-4 text-sm [background:var(--kc-panel)] [color:var(--kc-muted)]">正在加载公告...</p> : null}
          {announcementsQuery.error ? <p className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500">公告加载失败。</p> : null}
          {!announcementsQuery.isLoading && !announcementsQuery.error && announcements.length === 0 ? (
            <div className="grid h-full min-h-[280px] place-items-center text-center">
              <div>
                <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full [background:var(--kc-panel)] [color:var(--kc-muted)]">
                  <Icon name="announcement" className="h-7 w-7" />
                </div>
                <p className="text-sm font-semibold [color:var(--kc-text)]">暂无公告</p>
                <p className="mt-2 text-xs [color:var(--kc-muted)]">群公告发布后会显示在这里。</p>
              </div>
            </div>
          ) : null}
          {announcements.length > 0 ? (
            <div className="grid gap-4">
              {announcements.map((announcement) => {
                const authorName = getDisplayName(announcement.author, announcement.author_id ? `用户 ${announcement.author_id}` : '已注销用户');
                return (
                  <article key={announcement.id} className="rounded-[20px] border p-5 shadow-none [background:var(--kc-panel)] [border-color:var(--kc-border)]">
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar user={announcement.author} label={authorName} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{authorName}</p>
                          <p className="mt-0.5 text-xs [color:var(--kc-muted)]">{formatDateTime(announcement.created_at)}</p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {announcement.pinned ? <span className="rounded-full px-2 py-1 text-xs font-semibold [background:var(--kc-accent-soft)] [color:var(--kc-accent)]">置顶</span> : null}
                        {canPublish ? (
                          <>
                            <button type="button" disabled={updateMutation.isPending} onClick={() => startEdit(announcement)} className="rounded-full border px-2 py-1 text-xs font-semibold transition [border-color:var(--kc-border)] [color:var(--kc-text)] hover:[background:var(--kc-hover)] disabled:cursor-not-allowed disabled:opacity-45">编辑</button>
                            <button type="button" disabled={deleteMutation.isPending} onClick={() => deleteAnnouncement(announcement)} className="rounded-full border border-red-500/20 px-2 py-1 text-xs font-semibold text-red-500 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-45">删除</button>
                          </>
                        ) : null}
                      </div>
                    </div>
                    <p className="select-text whitespace-pre-wrap text-sm leading-7 [color:var(--kc-text)]">{renderAnnouncementContent(announcement.content)}</p>
                  </article>
                );
              })}
            </div>
          ) : null}
        </div>
      </section>

      {showPublish ? (
        <div className="absolute inset-0 z-10 grid place-items-center p-4 backdrop-blur-sm [background:rgba(15,23,42,0.22)]" onMouseDown={(event) => {
          event.stopPropagation();
          setShowPublish(false);
        }}>
          {renderAnnouncementEditor('publish')}
        </div>
      ) : null}

      {editingAnnouncement ? (
        <div className="absolute inset-0 z-10 grid place-items-center p-4 backdrop-blur-sm [background:rgba(15,23,42,0.22)]" onMouseDown={(event) => {
          event.stopPropagation();
          cancelEdit();
        }}>
          {renderAnnouncementEditor('edit')}
        </div>
      ) : null}
    </div>
  );
}
