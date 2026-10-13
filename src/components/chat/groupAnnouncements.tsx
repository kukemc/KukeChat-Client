import { useState } from 'react';
import { parseApiDate } from '@/utils/dateTime';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createGroupAnnouncement, deleteGroupAnnouncement, getGroupAnnouncements, updateGroupAnnouncement } from '@/api/conversations';
import type { Conversation, GroupAnnouncement } from '@/types/api';

// 群公告的数据和编辑状态。手机布局的页面和桌面布局的对话框共用，各自只管怎么画。

export interface AnnouncementModalProps {
  conversation: Conversation;
  canPublish: boolean;
  mobile?: boolean;
  onClose: () => void;
}

export const ANNOUNCEMENT_MAX_LENGTH = 600;

const ANNOUNCEMENT_URL_PATTERN = /(https?:\/\/[^\s]+)/g;

export function formatAnnouncementTime(value?: string): string {
  if (!value) {
    return '';
  }

  const date = parseApiDate(value);
  if (!date) {
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

  return (parseApiDate(right.created_at)?.getTime() ?? 0) - (parseApiDate(left.created_at)?.getTime() ?? 0);
}

/** 公告正文：把里面的网址变成可点的链接，其余原样输出。 */
export function renderAnnouncementContent(content: string, linkClassName: string): Array<string | JSX.Element> {
  const nodes: Array<string | JSX.Element> = [];
  content.split(ANNOUNCEMENT_URL_PATTERN).forEach((part, index) => {
    if (!part) {
      return;
    }
    if (/^https?:\/\/[^\s]+$/i.test(part)) {
      nodes.push(<a key={`announcement-url-${index}`} href={part} target="_blank" rel="noreferrer" className={linkClassName}>{part}</a>);
      return;
    }
    nodes.push(part);
  });
  return nodes;
}

export type GroupAnnouncements = ReturnType<typeof useGroupAnnouncements>;

export function useGroupAnnouncements(conversation: Conversation, canPublish: boolean) {
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

  const canSubmit = canPublish && content.trim().length > 0 && content.trim().length <= ANNOUNCEMENT_MAX_LENGTH && !publishMutation.isPending;
  const canSubmitEdit = canPublish && editContent.trim().length > 0 && editContent.trim().length <= ANNOUNCEMENT_MAX_LENGTH && !updateMutation.isPending;

  function submitPublish(event?: React.FormEvent<HTMLFormElement>): void {
    event?.preventDefault();
    if (canSubmit) {
      publishMutation.mutate();
    }
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

  function submitEdit(event?: React.FormEvent<HTMLFormElement>): void {
    event?.preventDefault();
    if (canSubmitEdit && editingAnnouncement) {
      updateMutation.mutate();
    }
  }

  /** 当前打开的编辑器：发布新公告或修改已有的；都没开是 null。两种模式的取值和写入口径在这里对齐。 */
  const editor = editingAnnouncement ? {
    isEdit: true,
    value: editContent,
    setValue: (next: string) => setEditContent(next.slice(0, ANNOUNCEMENT_MAX_LENGTH)),
    pinned: editPinned,
    setPinned: setEditPinned,
    error: updateMutation.error,
    pending: updateMutation.isPending,
    canSubmit: canSubmitEdit,
    submit: submitEdit,
    close: cancelEdit
  } : showPublish ? {
    isEdit: false,
    value: content,
    setValue: (next: string) => setContent(next.slice(0, ANNOUNCEMENT_MAX_LENGTH)),
    pinned,
    setPinned,
    error: publishMutation.error,
    pending: publishMutation.isPending,
    canSubmit,
    submit: submitPublish,
    close: () => setShowPublish(false)
  } : null;

  return {
    title: conversation.title || '未命名群聊',
    announcementsQuery,
    announcements: [...(announcementsQuery.data ?? [])].sort(compareAnnouncements),
    editor,
    openPublish: () => setShowPublish(true),
    startEdit,
    deleteAnnouncement,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending
  };
}
