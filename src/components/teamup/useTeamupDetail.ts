import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createTeamupComment, deleteTeamupComment, getTeamupComments, getTeamupProfile, toggleTeamupCommentLike } from '@/api/teamup';
import { acceptFriendRequest, sendFriendRequest } from '@/api/friends';
import { getConversations } from '@/api/conversations';
import { shareTeamupProfileToConversation } from '@/api/messages';
import { copyText } from '@/components/chat/info/shared';
import { getDisplayName } from '@/components/ui/Avatar';
import type { ImageViewerState } from '@/components/ui/ImageViewer';
import type { TeamupComment, TeamupProfile } from '@/types/api';
import { resolveAssetUrl } from '@/utils/assetUrl';
import { buildCommentThreads, errorMessage, profileUser, teamupShareMetadata, teamupShareText } from './teamupModel';

interface TeamupDetailOptions {
  profileId: number;
  initialProfile?: TeamupProfile | null;
  onFriendRequested: (profile: TeamupProfile) => void;
}

/** 名片详情页的数据和操作：名片、留言、加好友、分享。桌面版和移动版共用。 */
export function useTeamupDetail({ profileId, initialProfile, onFriendRequested }: TeamupDetailOptions) {
  const queryClient = useQueryClient();
  const [commentText, setCommentText] = useState('');
  const [replyTo, setReplyTo] = useState<TeamupComment | null>(null);
  const [viewer, setViewer] = useState<ImageViewerState | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareMode, setShareMode] = useState<'menu' | 'forward'>('menu');
  const [shareTargetId, setShareTargetId] = useState(0);
  const [shareDone, setShareDone] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const composerRef = useRef<HTMLInputElement | null>(null);

  const profileQuery = useQuery({
    queryKey: ['teamup', 'profile', profileId],
    queryFn: () => getTeamupProfile(profileId),
    initialData: initialProfile ?? undefined
  });
  const commentsQuery = useQuery({
    queryKey: ['teamup', 'comments', profileId],
    queryFn: () => getTeamupComments(profileId)
  });

  const profile = profileQuery.data;

  const friendMutation = useMutation({
    mutationFn: (receiverId: number) => sendFriendRequest(receiverId),
    onSuccess: (result) => {
      setActionError(null);
      // 对方已经先发过申请时，后端会直接通过，这时好友和会话列表都变了
      if (result?.status === 'accepted') {
        void queryClient.invalidateQueries({ queryKey: ['friends'] });
        void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      }
      if (profile) {
        onFriendRequested(profile);
      }
    },
    onError: (error) => setActionError(errorMessage(error))
  });

  const acceptMutation = useMutation({
    mutationFn: (requestId: number) => acceptFriendRequest(requestId),
    onSuccess: () => {
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ['friends'] });
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      if (profile) {
        onFriendRequested(profile);
      }
    },
    onError: (error) => setActionError(errorMessage(error))
  });

  const commentMutation = useMutation({
    mutationFn: (payload: { content: string; parentId?: number }) => createTeamupComment(profileId, { content: payload.content, parent_id: payload.parentId ?? null }),
    onSuccess: () => {
      setCommentText('');
      setReplyTo(null);
      void queryClient.invalidateQueries({ queryKey: ['teamup', 'comments', profileId] });
      void queryClient.invalidateQueries({ queryKey: ['teamup', 'profile', profileId] });
    },
    onError: (error) => setActionError(errorMessage(error))
  });

  const likeMutation = useMutation({
    mutationFn: (commentId: number) => toggleTeamupCommentLike(profileId, commentId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['teamup', 'comments', profileId] })
  });

  const deleteCommentMutation = useMutation({
    mutationFn: (commentId: number) => deleteTeamupComment(profileId, commentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['teamup', 'comments', profileId] });
      void queryClient.invalidateQueries({ queryKey: ['teamup', 'profile', profileId] });
    }
  });

  const conversationsQuery = useQuery({
    queryKey: ['conversations'],
    queryFn: getConversations,
    enabled: shareOpen
  });
  const conversations = conversationsQuery.data ?? [];

  const shareMutation = useMutation({
    mutationFn: () => {
      if (!profile || !shareTargetId) {
        throw new Error('请选择一个会话');
      }
      return shareTeamupProfileToConversation(shareTargetId, `[组队名片] ${getDisplayName(profileUser(profile))}`, teamupShareMetadata(profile, profileUser(profile)));
    },
    onSuccess: () => {
      setShareDone(true);
      void queryClient.invalidateQueries({ queryKey: ['messages', shareTargetId] });
      window.setTimeout(() => {
        setShareOpen(false);
        setShareDone(false);
      }, 900);
    },
    onError: (error) => setActionError(errorMessage(error))
  });

  // 打开分享面板时默认选中第一个会话
  useEffect(() => {
    if (shareOpen && !shareTargetId) {
      setShareTargetId(conversations[0]?.id ?? 0);
    }
  }, [shareOpen, conversations, shareTargetId]);

  useEffect(() => {
    if (replyTo && composerRef.current) {
      composerRef.current.focus();
    }
  }, [replyTo]);

  function openShare(): void {
    setShareMode('menu');
    setLinkCopied(false);
    setShareOpen(true);
  }

  function closeShare(): void {
    if (!shareMutation.isPending) {
      setShareOpen(false);
    }
  }

  async function copyShareLink(): Promise<void> {
    if (!profile) {
      return;
    }
    const ok = await copyText(teamupShareText(profile.id)).catch(() => false);
    if (ok) {
      setLinkCopied(true);
      window.setTimeout(() => { setLinkCopied(false); setShareOpen(false); }, 1100);
    } else {
      setActionError('复制失败，请手动复制链接。');
    }
  }

  function submitComment(): void {
    const content = commentText.trim();
    if (!content) {
      return;
    }
    commentMutation.mutate({ content, parentId: replyTo?.id });
  }

  const galleryImages = useMemo(() => (profile?.image_urls ?? []).map((url) => resolveAssetUrl(url) ?? url), [profile?.image_urls]);
  const comments = commentsQuery.data ?? [];
  const threads = useMemo(() => buildCommentThreads(comments), [comments]);

  return {
    profile, profileQuery, threads, galleryImages,
    commentText, setCommentText, replyTo, setReplyTo, composerRef, submitComment,
    viewer, setViewer,
    actionError,
    friendMutation, acceptMutation, commentMutation, likeMutation, deleteCommentMutation,
    shareOpen, setShareOpen, shareMode, setShareMode, shareTargetId, setShareTargetId, shareDone, linkCopied,
    openShare, closeShare, copyShareLink, shareMutation, conversations, conversationsQuery
  };
}

export type TeamupDetailState = ReturnType<typeof useTeamupDetail>;
