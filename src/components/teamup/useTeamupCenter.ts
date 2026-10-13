import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  closeMyTeamupProfile,
  deleteMyTeamupProfile,
  getCurrentTeamupEvent,
  getMyTeamupProfile,
  getTeamupProfiles,
  getTeamupSkillStats,
  getTeamupStats,
  reopenMyTeamupProfile
} from '@/api/teamup';
import { getIncomingFriendRequests, getOutgoingFriendRequests } from '@/api/friends';
import type { Friendship, TeamupProfile, TeamupSkill, User } from '@/types/api';
import { useKukeStore } from '@/store/kukeStore';
import { subscribeRealtimeEvents } from '@/realtime/events';
import { hasPendingOutgoingFriendRequest, isFriendUserId } from '@/utils/friendship';
import { DISCOVERY_SIZE, PROFILE_PAGE_SIZE, errorMessage, profileActivityScore, profileUser, recommendationScore, uniqueProfiles } from './teamupModel';

export type TeamupTab = 'square' | 'mine';
export type TeamupSort = 'latest' | 'hot';

function randomSeedValue(): number {
  return Math.floor(Math.random() * 100000);
}

/**
 * 组队中心的全部数据和状态，桌面版和移动版的界面共用这一份。
 * scrollRef 挂在名片列表的滚动容器上，loadMoreRef 挂在列表末尾的哨兵上，无限加载和「返回时回到原位置」都靠它们。
 */
export function useTeamupCenter(currentUser: User, friends: Friendship[]) {
  const queryClient = useQueryClient();
  const pendingTeamupProfileId = useKukeStore((state) => state.pendingTeamupProfileId);
  const clearPendingTeamupProfile = useKukeStore((state) => state.clearPendingTeamupProfile);

  const [tab, setTab] = useState<TeamupTab>('square');
  const [activeSkill, setActiveSkill] = useState<TeamupSkill | null>(null);
  const [sort, setSort] = useState<TeamupSort>('latest');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [celebrationUser, setCelebrationUser] = useState<User | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [randomSeed, setRandomSeed] = useState(randomSeedValue);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const returnScrollTopRef = useRef<number | null>(null);

  useEffect(() => {
    const handle = window.setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(handle);
  }, [searchInput]);

  // 从聊天里的名片卡片、分享链接跳过来
  useEffect(() => {
    if (pendingTeamupProfileId != null) {
      setSelectedProfileId(pendingTeamupProfileId);
      clearPendingTeamupProfile(pendingTeamupProfileId);
    }
  }, [pendingTeamupProfileId, clearPendingTeamupProfile]);

  const eventQuery = useQuery({ queryKey: ['teamup', 'event'], queryFn: getCurrentTeamupEvent });
  const skillsQuery = useQuery({ queryKey: ['teamup', 'skills'], queryFn: getTeamupSkillStats });
  const statsQuery = useQuery({ queryKey: ['teamup', 'stats'], queryFn: getTeamupStats });
  const profilesQuery = useInfiniteQuery({
    queryKey: ['teamup', 'profiles', tab, activeSkill, sort, search],
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) => getTeamupProfiles({ scope: tab, skill: activeSkill, sort, search, beforeId: pageParam, limit: PROFILE_PAGE_SIZE }),
    getNextPageParam: (lastPage) => lastPage.length === PROFILE_PAGE_SIZE ? lastPage[lastPage.length - 1]?.id : undefined
  });
  const latestDiscoveryQuery = useQuery({
    queryKey: ['teamup', 'discovery', 'latest'],
    queryFn: () => getTeamupProfiles({ scope: 'square', sort: 'latest', limit: DISCOVERY_SIZE })
  });
  const hotDiscoveryQuery = useQuery({
    queryKey: ['teamup', 'discovery', 'hot'],
    queryFn: () => getTeamupProfiles({ scope: 'square', sort: 'hot', limit: DISCOVERY_SIZE })
  });
  const myProfileQuery = useQuery({ queryKey: ['teamup', 'me'], queryFn: getMyTeamupProfile });
  const outgoingRequestsQuery = useQuery({ queryKey: ['friends', 'outgoing'], queryFn: getOutgoingFriendRequests });
  const incomingRequestsQuery = useQuery({ queryKey: ['friends', 'incoming'], queryFn: getIncomingFriendRequests });

  useEffect(() => {
    const unsubscribe = subscribeRealtimeEvents((event) => {
      if (event.rawType.startsWith('teamup.')) {
        void queryClient.invalidateQueries({ queryKey: ['teamup'] });
      }
    });
    return unsubscribe;
  }, [queryClient]);

  useEffect(() => {
    const target = loadMoreRef.current;
    const scrollRoot = scrollRef.current;
    if (!target || !scrollRoot) {
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting) && profilesQuery.hasNextPage && !profilesQuery.isFetchingNextPage) {
        void profilesQuery.fetchNextPage();
      }
    }, { root: scrollRoot, rootMargin: '300px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [profilesQuery.fetchNextPage, profilesQuery.hasNextPage, profilesQuery.isFetchingNextPage]);

  // 一页不够铺满屏幕时哨兵不会再触发，这里补一次
  useEffect(() => {
    const scrollRoot = scrollRef.current;
    if (!scrollRoot || !profilesQuery.hasNextPage || profilesQuery.isFetchingNextPage) return;
    const frame = window.requestAnimationFrame(() => {
      const remaining = scrollRoot.scrollHeight - scrollRoot.scrollTop - scrollRoot.clientHeight;
      if (remaining <= 300) void profilesQuery.fetchNextPage();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [profilesQuery.data?.pages.length, profilesQuery.fetchNextPage, profilesQuery.hasNextPage, profilesQuery.isFetchingNextPage]);

  // 从名片详情返回时，列表回到点进去之前的位置
  useLayoutEffect(() => {
    if (selectedProfileId !== null || returnScrollTopRef.current === null || !scrollRef.current) return;
    scrollRef.current.scrollTop = returnScrollTopRef.current;
    returnScrollTopRef.current = null;
  }, [selectedProfileId]);

  const outgoingRequests = outgoingRequestsQuery.data ?? [];
  const incomingRequests = incomingRequestsQuery.data ?? [];
  const myProfile = myProfileQuery.data ?? null;
  const skillStats = skillsQuery.data ?? [];

  const skillCounts = useMemo(() => {
    const map = new Map<TeamupSkill, number>();
    for (const stat of skillsQuery.data ?? []) {
      map.set(stat.skill, stat.count);
    }
    return map;
  }, [skillsQuery.data]);

  const event = eventQuery.data ?? null;
  const profilePages = profilesQuery.data?.pages ?? [];
  const profiles = useMemo(() => profilePages.flat(), [profilePages]);
  const discoveryPool = useMemo(() => uniqueProfiles([latestDiscoveryQuery.data ?? [], hotDiscoveryQuery.data ?? []]), [latestDiscoveryQuery.data, hotDiscoveryQuery.data]);
  const discoveryNow = useMemo(() => Date.now(), [latestDiscoveryQuery.data, hotDiscoveryQuery.data]);
  const recommendedProfiles = useMemo(() => [...discoveryPool].filter((profile) => !profile.is_self).sort((a, b) => recommendationScore(b, myProfile, discoveryNow) - recommendationScore(a, myProfile, discoveryNow)).slice(0, 4), [discoveryNow, discoveryPool, myProfile]);
  const latestProfiles = useMemo(() => [...(latestDiscoveryQuery.data ?? [])].filter((profile) => !profile.is_self).slice(0, 4), [latestDiscoveryQuery.data]);
  const hotProfiles = useMemo(() => [...(hotDiscoveryQuery.data ?? [])].filter((profile) => !profile.is_self).sort((a, b) => profileActivityScore(b, discoveryNow) - profileActivityScore(a, discoveryNow)).slice(0, 4), [discoveryNow, hotDiscoveryQuery.data]);
  const randomProfiles = useMemo(() => [...discoveryPool].filter((profile) => !profile.is_self).sort((a, b) => ((a.id * 9301 + randomSeed) % 233280) - ((b.id * 9301 + randomSeed) % 233280)).slice(0, 3), [discoveryPool, randomSeed]);
  const totalSkillProfiles = skillStats.reduce((sum, stat) => sum + stat.count, 0);
  const topSkill = [...skillStats].sort((a, b) => b.count - a.count)[0];
  // 概览里的名片数和热度只认统计接口。没取到时是 null，界面显示占位；
  // 不能拿本地已加载的名片来数——首屏只取了最新、最热各十几张，数出来永远是二十来张。
  const stats = statsQuery.data ?? null;
  const overview = {
    profileCount: stats ? stats.profile_count : null,
    recruitingCount: stats ? stats.recruiting_count : null,
    engagement: stats ? stats.total_view_count + stats.total_comment_count * 3 : null
  };

  const deleteMutation = useMutation({
    mutationFn: deleteMyTeamupProfile,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['teamup'] });
      setSelectedProfileId(null);
    },
    onError: (error) => setActionError(errorMessage(error))
  });
  const closeMutation = useMutation({
    mutationFn: closeMyTeamupProfile,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['teamup'] }),
    onError: (error) => setActionError(errorMessage(error))
  });
  const reopenMutation = useMutation({
    mutationFn: reopenMyTeamupProfile,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['teamup'] }),
    onError: (error) => setActionError(errorMessage(error))
  });

  function handleFriendRequested(profile: TeamupProfile): void {
    setCelebrationUser(profileUser(profile));
    void queryClient.invalidateQueries({ queryKey: ['friends'] });
  }

  function openProfile(profile: TeamupProfile): void {
    returnScrollTopRef.current = scrollRef.current?.scrollTop ?? 0;
    setSelectedProfileId(profile.id);
  }

  function loadMoreIfNeeded(): void {
    const scrollRoot = scrollRef.current;
    if (!scrollRoot || !profilesQuery.hasNextPage || profilesQuery.isFetchingNextPage) return;
    const remaining = scrollRoot.scrollHeight - scrollRoot.scrollTop - scrollRoot.clientHeight;
    if (remaining <= 600) void profilesQuery.fetchNextPage();
  }

  /** 编辑器保存之后：刷新所有组队数据；从列表里发起的保存顺手打开保存好的名片。 */
  function handleEditorSaved(saved: TeamupProfile, openSaved: boolean): void {
    setEditorOpen(false);
    void queryClient.invalidateQueries({ queryKey: ['teamup'] });
    if (openSaved) {
      setSelectedProfileId(saved.id);
    }
  }

  // 详情页打开时先用列表里已有的那份数据垫着，好友关系也按它判断
  const selectedInitial = selectedProfileId == null ? null : profiles.find((item) => item.id === selectedProfileId) ?? (myProfile?.id === selectedProfileId ? myProfile : null);
  const selectedRelation = {
    isFriend: selectedInitial ? isFriendUserId(friends, selectedInitial.user_id, currentUser.id) : false,
    hasPendingRequest: selectedInitial ? hasPendingOutgoingFriendRequest(outgoingRequests, selectedInitial.user_id) : false,
    incomingRequestId: selectedInitial ? incomingRequests.find((request) => request.requester_id === selectedInitial.user_id && request.status === 'pending')?.id ?? null : null
  };

  return {
    tab, setTab,
    activeSkill, setActiveSkill,
    sort, setSort,
    search, searchInput, setSearchInput,
    selectedProfileId, setSelectedProfileId, selectedInitial, selectedRelation,
    editorOpen, setEditorOpen, handleEditorSaved,
    celebrationUser, setCelebrationUser,
    actionError,
    scrollRef, loadMoreRef, loadMoreIfNeeded,
    event, myProfile, skillStats, skillCounts, topSkill, totalSkillProfiles,
    profiles, profilesQuery,
    discoveryLoading: latestDiscoveryQuery.isLoading || hotDiscoveryQuery.isLoading,
    discoveryPool, recommendedProfiles, latestProfiles, hotProfiles, randomProfiles, overview,
    shuffleRandom: () => setRandomSeed(randomSeedValue()),
    deleteMutation, closeMutation, reopenMutation,
    openProfile, handleFriendRequested
  };
}

export type TeamupCenterState = ReturnType<typeof useTeamupCenter>;
