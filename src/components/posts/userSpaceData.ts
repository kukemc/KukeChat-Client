/**
 * 个人空间的数据层：资料、动态、统计、好友关系，以及主页自定义的草稿与保存。
 * 移动端和桌面端共用，界面各写各的。
 */
import { type ChangeEvent, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ccwStudentProfileUrl } from '@/config';
import { createDirectConversation } from '@/api/conversations';
import { getFriends, getOutgoingFriendRequests, sendFriendRequest } from '@/api/friends';
import { getUserProfile, updateMyProfile, uploadProfileCover } from '@/api/users';
import { getDisplayName } from '@/components/ui/Avatar';
import type { IconName } from '@/components/ui/Icon';
import { useKukeStore } from '@/store/kukeStore';
import type { PostFeedSort, User } from '@/types/api';
import { resolveThumbnailUrl } from '@/utils/assetUrl';
import { hasPendingOutgoingFriendRequest, isFriendUserId } from '@/utils/friendship';
import { formatCompact, requestErrorMessage } from './postModel';
import { useUserPostStats, useUserPosts } from './postQueries';

export const profileLayoutOptions = [
  { value: 'classic', label: '经典名片', detail: '平衡封面和资料卡' },
  { value: 'banner', label: '沉浸封面', detail: '更高头图和大头像' },
  { value: 'compact', label: '紧凑档案', detail: '压缩头图突出动态' }
] as const;

export const profileCardStyleOptions = [
  { value: 'soft', label: '柔和', detail: '浅色卡片，适合默认封面' },
  { value: 'glass', label: '玻璃', detail: '半透明浮层，适合图片封面' },
  { value: 'solid', label: '纯色', detail: '高对比信息卡' }
] as const;

export const profileAccentPresets = ['#168bff', '#7c3aed', '#ff4f86', '#f97316', '#10b981', '#111827'] as const;

export type ProfileLayout = (typeof profileLayoutOptions)[number]['value'];
export type ProfileCardStyle = (typeof profileCardStyleOptions)[number]['value'];

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const DEFAULT_ACCENT = '#168bff';

interface ProfileDraft {
  bio: string;
  profile_title: string;
  profile_tagline: string;
  profile_status: string;
  profile_location: string;
  profile_interests: string;
  profile_layout: ProfileLayout;
  profile_card_style: ProfileCardStyle;
  profile_accent_color: string;
  profile_cover_url: string;
}

function draftFromUser(user: User | null | undefined): ProfileDraft {
  return {
    bio: user?.bio ?? '',
    profile_title: user?.profile_title ?? '',
    profile_tagline: user?.profile_tagline ?? '',
    profile_status: user?.profile_status ?? '',
    profile_location: user?.profile_location ?? '',
    profile_interests: user?.profile_interests ?? '',
    profile_layout: user?.profile_layout ?? 'classic',
    profile_card_style: user?.profile_card_style ?? 'soft',
    profile_accent_color: user?.profile_accent_color ?? DEFAULT_ACCENT,
    profile_cover_url: user?.profile_cover_pending_url ?? user?.profile_cover_url ?? ''
  };
}

function profileAccent(user: User | null | undefined): string {
  const value = user?.profile_accent_color ?? '';
  return HEX_COLOR.test(value) ? value : DEFAULT_ACCENT;
}

/** 自己看自己时，审核中的封面也要能看到。 */
function profileCover(user: User | null | undefined, isSelf: boolean): string | null {
  if (isSelf && user?.profile_cover_moderation_status === 'pending' && user.profile_cover_pending_url) {
    return user.profile_cover_pending_url;
  }
  return user?.profile_cover_url ?? null;
}

function interestList(value: string | null | undefined): string[] {
  return (value ?? '').split(/[，,\s]+/).map((item) => item.trim()).filter(Boolean).slice(0, 8);
}

function normalizeProfileLayout(value: string | null | undefined): ProfileLayout {
  return profileLayoutOptions.some((option) => option.value === value) ? value as ProfileLayout : 'classic';
}

function normalizeProfileCardStyle(value: string | null | undefined): ProfileCardStyle {
  return profileCardStyleOptions.some((option) => option.value === value) ? value as ProfileCardStyle : 'soft';
}

export function useUserSpace({ profileUser, fallbackId, currentUser, onClose }: { profileUser: User | null | undefined; fallbackId: number; currentUser: User; onClose: () => void }) {
  const isSelf = fallbackId === currentUser.id;
  const queryClient = useQueryClient();
  const setCurrentUser = useKukeStore((state) => state.setCurrentUser);
  const setActiveConversationId = useKukeStore((state) => state.setActiveConversationId);
  const setWorkspaceView = useKukeStore((state) => state.setWorkspaceView);
  const [editingProfile, setEditingProfile] = useState(false);
  const [postSort, setPostSort] = useState<PostFeedSort>('latest');
  const profileQuery = useQuery({
    queryKey: ['users', fallbackId],
    queryFn: () => getUserProfile(fallbackId),
    initialData: profileUser ?? (isSelf ? currentUser : undefined),
    staleTime: 30_000,
    // 封面在审核时轮询，结果出来就停
    refetchInterval: (query) => (query.state.data?.profile_cover_moderation_status === 'pending' ? 3_000 : false)
  });
  const postsQuery = useUserPosts(fallbackId, postSort);
  const stats = useUserPostStats(fallbackId);
  const friendsQuery = useQuery({ queryKey: ['friends'], queryFn: getFriends, enabled: !isSelf });
  const outgoingFriendRequestsQuery = useQuery({ queryKey: ['friend-requests', 'outgoing'], queryFn: getOutgoingFriendRequests, enabled: !isSelf });
  const posts = useMemo(() => postsQuery.data?.pages.flat() ?? [], [postsQuery.data]);
  const displayUser = profileQuery.data ?? profileUser ?? (isSelf ? currentUser : null);
  const [profileDraft, setProfileDraft] = useState(() => draftFromUser(displayUser));

  // 没在编辑时，草稿跟着服务器上的资料走
  useEffect(() => {
    if (!displayUser || editingProfile) {
      return;
    }
    setProfileDraft(draftFromUser(displayUser));
  }, [editingProfile, displayUser]);

  const saveProfileMutation = useMutation({
    mutationFn: updateMyProfile,
    onSuccess: (updatedUser) => {
      setCurrentUser(updatedUser);
      queryClient.setQueryData(['users', fallbackId], updatedUser);
      void queryClient.invalidateQueries({ queryKey: ['me'] });
      setEditingProfile(false);
    }
  });
  const coverMutation = useMutation({
    mutationFn: uploadProfileCover,
    onSuccess: (response) => setProfileDraft((draft) => ({ ...draft, profile_cover_url: response.url }))
  });
  const friendRequestMutation = useMutation({
    mutationFn: sendFriendRequest,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['friends'] });
      void queryClient.invalidateQueries({ queryKey: ['friend-requests'] });
    }
  });
  const directMutation = useMutation({
    mutationFn: createDirectConversation,
    onSuccess: (conversation) => {
      setActiveConversationId(conversation.id);
      setWorkspaceView('chat');
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      onClose();
    }
  });

  // 编辑时页面上的每一项都取草稿里的值，所以改什么立刻就能看到效果
  const shown = editingProfile ? profileDraft : displayUser;
  const isFriend = isFriendUserId(friendsQuery.data ?? [], fallbackId, currentUser.id);
  const hasPendingFriendRequest = hasPendingOutgoingFriendRequest(outgoingFriendRequestsQuery.data ?? [], fallbackId);
  const friendButtonDisabled = isFriend ? directMutation.isPending : hasPendingFriendRequest || friendRequestMutation.isPending || friendsQuery.isLoading || outgoingFriendRequestsQuery.isLoading;
  const hasCcwAccount = Boolean(displayUser?.ccw_student_oid);
  const metricCards: Array<{ label: string; value: string; icon: IconName }> = hasCcwAccount ? [
    { label: '关注', value: formatCompact(displayUser?.ccw_following_count), icon: 'users' },
    { label: '粉丝', value: formatCompact(displayUser?.ccw_follower_count), icon: 'ccw' },
    { label: '获赞', value: formatCompact(displayUser?.ccw_like_count), icon: 'like' }
  ] : [
    { label: '动态', value: formatCompact(stats.post_count), icon: 'feed' },
    { label: '获赞', value: formatCompact(stats.like_count), icon: 'like' },
    { label: '评论', value: formatCompact(stats.comment_count), icon: 'message' }
  ];

  function updateDraft<K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]): void {
    setProfileDraft((draft) => ({ ...draft, [key]: value }));
  }

  function chooseCover(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    if (file) {
      coverMutation.mutate(file);
    }
    event.target.value = '';
  }

  function handleFriendAction(): void {
    if (isSelf || friendButtonDisabled) {
      return;
    }
    if (isFriend) {
      directMutation.mutate({ user_id: fallbackId, temporary: false });
      return;
    }
    friendRequestMutation.mutate(fallbackId);
  }

  return {
    isSelf,
    displayUser,
    displayName: getDisplayName(displayUser, isSelf ? getDisplayName(currentUser) : `用户 ${fallbackId}`),
    editingProfile,
    setEditingProfile,
    profileDraft,
    updateDraft,
    chooseCover,
    saveProfile: () => saveProfileMutation.mutate(profileDraft),
    savePending: saveProfileMutation.isPending,
    coverPending: coverMutation.isPending,
    coverError: coverMutation.error ? (coverMutation.error instanceof Error ? coverMutation.error.message : '封面上传失败，请稍后重试。') : null,
    saveError: saveProfileMutation.error ? (saveProfileMutation.error instanceof Error ? saveProfileMutation.error.message : '保存失败，请检查输入后重试。') : null,
    profileTitle: shown?.profile_title?.trim() || (isSelf ? '我的空间' : '个人主页'),
    profileTagline: shown?.profile_tagline?.trim(),
    profileStatus: shown?.profile_status?.trim(),
    profileBio: shown?.bio?.trim(),
    profileLocation: shown?.profile_location?.trim(),
    interests: interestList(shown?.profile_interests),
    profileLayout: normalizeProfileLayout(shown?.profile_layout),
    profileCardStyle: normalizeProfileCardStyle(shown?.profile_card_style),
    accent: editingProfile && HEX_COLOR.test(profileDraft.profile_accent_color) ? profileDraft.profile_accent_color : profileAccent(displayUser),
    coverUrl: editingProfile ? (profileDraft.profile_cover_url || null) : profileCover(displayUser, isSelf),
    coverModeration: isSelf ? displayUser?.profile_cover_moderation_status ?? null : null,
    stats,
    metricCards,
    hasCcwAccount,
    ccwProfileUrl: displayUser?.ccw_student_oid ? ccwStudentProfileUrl(displayUser.ccw_student_oid) : null,
    ccwAvatarUrl: resolveThumbnailUrl(displayUser?.ccw_avatar_url),
    ccwPrimaryStats: [
      { label: '粉丝', value: displayUser?.ccw_follower_count },
      { label: '获赞', value: displayUser?.ccw_like_count },
      { label: '浏览', value: displayUser?.ccw_view_count }
    ],
    ccwSecondaryStats: [
      { label: '关注', value: displayUser?.ccw_following_count },
      { label: '收藏', value: displayUser?.ccw_favorite_count },
      { label: '作品', value: displayUser?.ccw_creation_count }
    ],
    postSort,
    setPostSort,
    posts,
    postsLoading: postsQuery.isLoading,
    hasMorePosts: postsQuery.hasNextPage,
    loadMorePosts: () => void postsQuery.fetchNextPage(),
    isFriend,
    friendButtonDisabled,
    friendButtonLabel: isFriend ? (directMutation.isPending ? '打开中' : '发消息') : hasPendingFriendRequest ? '已申请' : friendRequestMutation.isPending ? '发送中' : '加好友',
    friendError: friendRequestMutation.error ? requestErrorMessage(friendRequestMutation.error, '好友申请发送失败') : directMutation.error ? requestErrorMessage(directMutation.error, '发起私聊失败') : null,
    handleFriendAction
  };
}
