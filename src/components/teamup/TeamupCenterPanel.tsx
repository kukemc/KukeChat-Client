import type { Friendship, TeamupProfile, User } from '@/types/api';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon, type IconName } from '@/components/ui/Icon';
import { TeamupCenterDesktop } from './desktop/TeamupCenterDesktop';
import { SKILL_META, skillLabel } from './teamupConstants';
import { formatCountdown, profileUser as profileAuthor, relativePublishedAt } from './teamupModel';
import { useTeamupCenter } from './useTeamupCenter';
import { TeamupCard } from './TeamupCard';
import { TeamupDetailPanel } from './TeamupDetailPanel';
import { TeamupEditorModal } from './TeamupEditorModal';
import { TeamupConnectionCelebration } from './TeamupConnectionCelebration';

interface TeamupCenterPanelProps {
  currentUser: User;
  friends: Friendship[];
  isMobile?: boolean;
  onMobileBack?: () => void;
}

function DiscoveryProfile({ profile, label, onOpen }: { profile: TeamupProfile; label: string; onOpen: (profile: TeamupProfile) => void }): JSX.Element {
  const user = profileAuthor(profile);
  return (
    <button type="button" onClick={() => onOpen(profile)} className="kc-teamup-discovery-card group flex w-full min-w-0 max-w-full cursor-pointer items-center gap-3 overflow-hidden rounded-[20px] p-3 text-left transition">
      <Avatar user={user} size="lg" />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <strong className="truncate text-sm [color:var(--kc-text)]">{getDisplayName(user)}</strong>
          {profile.status === 'recruiting' ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" /> : null}
        </span>
        <span className="mt-0.5 block truncate text-xs font-semibold [color:var(--kc-muted)]">{profile.headline}</span>
        <span className="mt-1 flex min-w-0 items-center gap-2 overflow-hidden text-[10px] font-bold [color:var(--kc-muted)]">
          <span className="shrink-0">{label}</span><span className="shrink-0">·</span><span className="shrink-0">{profile.view_count} 浏览</span><span className="shrink-0">·</span><span className="truncate">{profile.comment_count} 讨论</span>
        </span>
      </span>
      <Icon name="chevron" className="h-4 w-4 shrink-0 opacity-30 transition group-hover:translate-x-0.5 group-hover:opacity-70" />
    </button>
  );
}

function MetricCard({ icon, label, value, detail, accent }: { icon: IconName; label: string; value: string | number; detail: string; accent: string }): JSX.Element {
  return (
    <div className="kc-teamup-metric-card relative overflow-hidden rounded-[20px] p-4">
      <span className={`absolute -right-5 -top-5 h-20 w-20 rounded-full blur-2xl ${accent}`} />
      <div className="relative flex items-start justify-between gap-3">
        <div><p className="text-xs font-bold [color:var(--kc-muted)]">{label}</p><p className="mt-1 text-2xl font-black tracking-tight [color:var(--kc-text)]">{value}</p><p className="mt-1 text-[11px] font-semibold [color:var(--kc-muted)]">{detail}</p></div>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl [background:var(--kc-accent-soft)] [color:var(--kc-accent)]"><Icon name={icon} className="h-4 w-4" /></span>
      </div>
    </div>
  );
}

/** 组队中心的入口：桌面布局和移动布局是两套界面，数据都来自 useTeamupCenter。 */
export function TeamupCenterPanel({ currentUser, friends, isMobile, onMobileBack }: TeamupCenterPanelProps): JSX.Element {
  return isMobile
    ? <TeamupCenterMobile currentUser={currentUser} friends={friends} onMobileBack={onMobileBack} />
    : <TeamupCenterDesktop currentUser={currentUser} friends={friends} />;
}

function TeamupCenterMobile({ currentUser, friends, onMobileBack }: Omit<TeamupCenterPanelProps, 'isMobile'>): JSX.Element {
  const {
    tab, setTab, activeSkill, setActiveSkill, sort, setSort, search, searchInput, setSearchInput,
    selectedProfileId, setSelectedProfileId, selectedInitial, selectedRelation,
    editorOpen, setEditorOpen, handleEditorSaved, celebrationUser, setCelebrationUser, actionError,
    scrollRef, loadMoreRef, loadMoreIfNeeded,
    event, myProfile, skillStats, skillCounts, topSkill, totalSkillProfiles, profiles, profilesQuery,
    recommendedProfiles, latestProfiles, hotProfiles, randomProfiles, overview, shuffleRandom,
    deleteMutation, closeMutation, reopenMutation, openProfile, handleFriendRequested
  } = useTeamupCenter(currentUser, friends);

  if (selectedProfileId != null) {
    return (
      <>
        <TeamupDetailPanel
          profileId={selectedProfileId}
          initialProfile={selectedInitial}
          currentUser={currentUser}
          isFriend={selectedRelation.isFriend}
          hasPendingRequest={selectedRelation.hasPendingRequest}
          incomingRequestId={selectedRelation.incomingRequestId}
          onBack={() => setSelectedProfileId(null)}
          onEdit={() => setEditorOpen(true)}
          onFriendRequested={handleFriendRequested}
        />
        {editorOpen ? (
          <TeamupEditorModal
            profile={myProfile}
            onClose={() => setEditorOpen(false)}
            onSaved={(saved) => handleEditorSaved(saved, false)}
          />
        ) : null}
        {celebrationUser ? <TeamupConnectionCelebration me={currentUser} target={celebrationUser} onDone={() => setCelebrationUser(null)} /> : null}
      </>
    );
  }

  const showEmpty = !profilesQuery.isLoading && profiles.length === 0;

  return (
    <section className={`kc-teamup-mobile-surface flex h-full min-h-0 flex-col overflow-hidden [color:var(--kc-text)]`}>
      <header className={`kc-teamup-mobile-header relative z-10 shrink-0 border-x-0 border-t-0 px-5 py-4`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {onMobileBack ? <button type="button" onClick={onMobileBack} className="kc-mobile-back-button grid h-10 w-10 shrink-0 place-items-center rounded-full [background:var(--kc-panel-muted)] [color:var(--kc-text)]" aria-label="返回空间"><Icon name="chevronLeft" className="h-5 w-5" /></button> : null}
            <div className="min-w-0">
            <h2 className="text-xl font-black tracking-tight">GameJam 组队中心</h2>
            <p className="mt-1 text-sm [color:var(--kc-muted)]">寻找志同道合的搭档，组队完成 14 天极限创作。</p>
            </div>
          </div>
          <button type="button" onClick={() => { setTab('mine'); setEditorOpen(true); }} className="liquid-button inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-black">
            <Icon name="plus" className="h-4 w-4" />
            {myProfile ? '编辑我的名片' : '发布组队名片'}
          </button>
        </div>
      </header>

        <div ref={scrollRef} onScroll={loadMoreIfNeeded} className={`kc-teamup-mobile-scroll relative z-10 min-h-0 flex-1 overflow-y-auto p-4 sm:p-5`}>
        {event ? (
          <div className={`kc-teamup-mobile-card kc-teamup-command-hero relative mb-4 overflow-hidden rounded-[28px] p-5 sm:p-6`}>
            <span className="absolute inset-0 [background:linear-gradient(120deg,var(--kc-accent-soft),transparent_58%)]" />
            {event.cover_url ? <img src={event.cover_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-15" /> : null}
            <div className="relative flex flex-wrap items-center justify-between gap-5">
              <div className="min-w-0 max-w-xl">
                <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-black [background:var(--kc-accent-soft)] [border-color:color-mix(in_srgb,var(--kc-accent)_24%,transparent)] [color:var(--kc-accent)]"><Icon name="signal" className="h-3.5 w-3.5" />赛季匹配信号在线</span>
                <h3 className="mt-3 truncate text-2xl font-black tracking-tight sm:text-3xl">{event.title}</h3>
                {event.theme ? <p className="mt-1 line-clamp-2 text-sm [color:var(--kc-muted)]">{event.theme}</p> : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" onClick={() => { setTab('square'); scrollRef.current?.querySelector<HTMLElement>('[data-teamup-explore]')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} className="liquid-button inline-flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2 text-xs font-black"><Icon name="sparkles" className="h-3.5 w-3.5" />开始探索</button>
                  <button type="button" onClick={() => shuffleRandom()} className="ghost-button inline-flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2 text-xs font-black [border-color:var(--kc-border)]"><Icon name="feed" className="h-3.5 w-3.5" />换一批缘分</button>
                </div>
              </div>
              <div className="flex gap-3">
                {typeof event.seconds_remaining === 'number' ? (
                  <div className="rounded-[20px] border px-4 py-3 text-center [border-color:var(--kc-border)] [background:var(--kc-panel)]">
                    <span className="kc-teamup-pulse block text-xs font-bold [color:var(--kc-muted)]">距结束</span>
                    <span className="mt-0.5 block text-lg font-black [color:var(--kc-accent)]">{event.seconds_remaining > 0 ? formatCountdown(event.seconds_remaining) : '已结束'}</span>
                  </div>
                ) : null}
                <div className="rounded-[20px] border px-4 py-3 text-center [border-color:var(--kc-border)] [background:var(--kc-panel)]">
                  <span className="block text-xs font-bold [color:var(--kc-muted)]">招募中</span>
                  <span className="mt-0.5 block text-lg font-black">{event.recruiting_count}<span className="ml-1 text-xs [color:var(--kc-muted)]">/ {event.profile_count}</span></span>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {tab === 'square' && !search && activeSkill === null ? (
          <div className="mb-5 space-y-4">
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <MetricCard icon="users" label="社区名片" value={overview.profileCount ?? '—'} detail={`${overview.recruitingCount ?? '—'} 位仍在招募`} accent="bg-sky-400/25" />
              <MetricCard icon="signal" label="技能信号" value={totalSkillProfiles} detail={topSkill ? `${skillLabel(topSkill.skill)}最活跃 · ${topSkill.count} 人` : '等待更多技能名片'} accent="bg-violet-400/25" />
              <MetricCard icon="eye" label="探索热度" value={overview.engagement ?? '—'} detail="浏览与讨论加权热度" accent="bg-amber-400/25" />
              <MetricCard icon="clock" label="赛季进度" value={typeof event?.seconds_remaining === 'number' ? formatCountdown(event.seconds_remaining) : '长期开放'} detail="推荐随时间和互动实时变化" accent="bg-emerald-400/25" />
            </div>

            {recommendedProfiles.length > 0 ? (
              <section className="kc-teamup-discovery-shell rounded-[28px] p-4 sm:p-5">
                <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                  <div><span className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.16em] [color:var(--kc-accent)]"><Icon name="sparkles" className="h-3.5 w-3.5" />智能匹配流</span><h3 className="mt-1 text-xl font-black tracking-tight">此刻值得认识的人</h3><p className="mt-1 text-xs font-semibold [color:var(--kc-muted)]">综合技能互补、招募状态、发布时间与互动热度动态排序</p></div>
                  <span className="rounded-full px-3 py-1.5 text-[11px] font-bold [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">每次刷新都会重新计算</span>
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  {recommendedProfiles.map((profile, index) => <DiscoveryProfile key={profile.id} profile={profile} label={index === 0 ? '最佳匹配' : index === 1 ? '高潜搭档' : '动态推荐'} onOpen={openProfile} />)}
                </div>
              </section>
            ) : null}

            <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <section className="kc-teamup-discovery-shell min-w-0 overflow-hidden rounded-[26px] p-4">
                <div className="mb-3 flex min-w-0 items-center justify-between gap-3"><div className="min-w-0"><h3 className="flex items-center gap-2 text-base font-black"><Icon name="feed" className="h-4 w-4 shrink-0 [color:var(--kc-accent)]" />随机发现</h3><p className="mt-0.5 truncate text-[11px] font-semibold [color:var(--kc-muted)]">跳出算法，遇见意料之外的队友</p></div><button type="button" onClick={() => shuffleRandom()} className="shrink-0 cursor-pointer rounded-xl border p-2 transition hover:[background:var(--kc-hover)] [border-color:var(--kc-border)]" aria-label="换一批随机推荐"><Icon name="recall" className="h-4 w-4" /></button></div>
                <div className="min-w-0 space-y-2">{randomProfiles.map((profile) => <DiscoveryProfile key={profile.id} profile={profile} label="随机相遇" onOpen={openProfile} />)}</div>
              </section>
              <section className="kc-teamup-discovery-shell min-w-0 overflow-hidden rounded-[26px] p-4">
                <div className="mb-3"><h3 className="flex items-center gap-2 text-base font-black"><Icon name="clock" className="h-4 w-4 text-emerald-500" />刚刚加入</h3><p className="mt-0.5 text-[11px] font-semibold [color:var(--kc-muted)]">最新发布和更新的招募信号</p></div>
                <div className="min-w-0 space-y-2">{latestProfiles.slice(0, 3).map((profile) => <DiscoveryProfile key={profile.id} profile={profile} label={relativePublishedAt(profile.updated_at || profile.created_at)} onOpen={openProfile} />)}</div>
              </section>
              <section className="kc-teamup-discovery-shell min-w-0 overflow-hidden rounded-[26px] p-4">
                <div className="mb-3"><h3 className="flex items-center gap-2 text-base font-black"><Icon name="signal" className="h-4 w-4 text-amber-500" />热度上升</h3><p className="mt-0.5 text-[11px] font-semibold [color:var(--kc-muted)]">近期浏览与讨论增长更快</p></div>
                <div className="min-w-0 space-y-2">{hotProfiles.slice(0, 3).map((profile, index) => <DiscoveryProfile key={profile.id} profile={profile} label={`热力 TOP ${index + 1}`} onOpen={openProfile} />)}</div>
              </section>
            </div>

            {skillStats.length > 0 ? (
              <section className="kc-teamup-discovery-shell rounded-[26px] p-4 sm:p-5">
                <div className="mb-4 flex items-end justify-between gap-3"><div><h3 className="text-base font-black">技能雷达</h3><p className="mt-0.5 text-[11px] font-semibold [color:var(--kc-muted)]">当前赛季各方向活跃名片分布</p></div><span className="text-[11px] font-bold [color:var(--kc-muted)]">点击即可筛选</span></div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{SKILL_META.map((meta) => { const count = skillCounts.get(meta.key) ?? 0; const percentage = topSkill?.count ? Math.max(8, Math.round(count / topSkill.count * 100)) : 8; return <button key={meta.key} type="button" onClick={() => setActiveSkill(meta.key)} className="group cursor-pointer rounded-2xl border p-3 text-left transition hover:-translate-y-0.5 [background:var(--kc-panel)] [border-color:var(--kc-border)]"><span className="flex items-center justify-between text-xs font-black"><span className="inline-flex items-center gap-2"><Icon name={meta.icon} className="h-4 w-4 [color:var(--kc-accent)]" />{meta.label}</span><span>{count}</span></span><span className="mt-3 block h-1.5 overflow-hidden rounded-full [background:var(--kc-panel-muted)]"><span className="block h-full rounded-full transition-all duration-700 [background:var(--kc-accent)]" style={{ width: `${percentage}%` }} /></span></button>; })}</div>
              </section>
            ) : null}
          </div>
        ) : null}

        <div data-teamup-explore className={`kc-teamup-mobile-card mb-4 flex scroll-mt-4 flex-wrap items-center gap-3 rounded-[24px] border p-3 shadow-sm [background:var(--kc-panel)] [border-color:var(--kc-border)]`}>
          <div className="kc-teamup-mobile-tab-switch relative grid w-[220px] shrink-0 grid-cols-2 rounded-2xl p-1 [background:var(--kc-panel-muted)]">
            <span className={`absolute left-1 top-1 h-[calc(100%-8px)] w-[106px] rounded-xl shadow-sm transition-transform duration-300 ease-out [background:var(--kc-panel)] ${tab === 'mine' ? 'translate-x-[106px]' : 'translate-x-0'}`} />
            <button type="button" onClick={() => setTab('square')} className={`kc-teamup-mobile-tab relative z-10 rounded-xl px-4 py-2 text-sm font-bold transition-colors ${tab === 'square' ? 'kc-teamup-mobile-tab-active [color:var(--kc-text)]' : '[color:var(--kc-muted)]'}`}>广场</button>
            <button type="button" onClick={() => setTab('mine')} className={`kc-teamup-mobile-tab relative z-10 rounded-xl px-4 py-2 text-sm font-bold transition-colors ${tab === 'mine' ? 'kc-teamup-mobile-tab-active [color:var(--kc-text)]' : '[color:var(--kc-muted)]'}`}>我的名片</button>
          </div>
          <label className="relative min-w-full flex-1 sm:min-w-[220px]">
            <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 [color:var(--kc-muted)]" />
            <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="搜索标题或介绍关键字" className="w-full rounded-2xl border py-2.5 pl-9 pr-4 text-sm outline-none transition [background:var(--kc-panel-muted)] [border-color:transparent] [color:var(--kc-text)] placeholder:[color:var(--kc-muted)] focus:[background:var(--kc-panel)] focus:[border-color:var(--kc-accent)]" />
          </label>
          <div className="kc-teamup-mobile-sort-tabs flex shrink-0 gap-1 rounded-2xl p-1 [background:var(--kc-panel-muted)]">
            <button type="button" onClick={() => setSort('latest')} className={`kc-teamup-mobile-sort-tab rounded-xl px-3 py-1.5 text-xs font-bold transition ${sort === 'latest' ? 'kc-teamup-mobile-sort-tab-active [background:var(--kc-panel)] [color:var(--kc-text)]' : '[color:var(--kc-muted)]'}`}>最新</button>
            <button type="button" onClick={() => setSort('hot')} className={`kc-teamup-mobile-sort-tab rounded-xl px-3 py-1.5 text-xs font-bold transition ${sort === 'hot' ? 'kc-teamup-mobile-sort-tab-active [background:var(--kc-panel)] [color:var(--kc-text)]' : '[color:var(--kc-muted)]'}`}>热门</button>
          </div>
        </div>

        {tab === 'square' ? (
          <div className="mb-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => setActiveSkill(null)} className={`kc-teamup-chip-glass inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition ${activeSkill === null ? 'kc-teamup-chip-glass-active' : '[color:var(--kc-muted)]'}`}>全部</button>
            {SKILL_META.map((meta) => {
              const count = skillCounts.get(meta.key) ?? 0;
              const active = activeSkill === meta.key;
              return (
                <button key={meta.key} type="button" onClick={() => setActiveSkill(active ? null : meta.key)} className={`kc-teamup-chip-glass inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition ${active ? 'kc-teamup-chip-glass-active' : '[color:var(--kc-muted)]'}`}>
                  <Icon name={meta.icon} className="h-3.5 w-3.5" />
                  {meta.label}
                  {count > 0 ? <span className="kc-teamup-skill-count rounded-full px-1.5 py-0.5 text-[10px] [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">{count}</span> : null}
                </button>
              );
            })}
          </div>
        ) : null}

        {actionError ? <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{actionError}</div> : null}

        {tab === 'mine' && myProfile ? (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-[20px] border p-3 [border-color:var(--kc-border)] [background:var(--kc-panel)]">
            <span className="text-sm font-bold">名片管理</span>
            <span className="text-xs [color:var(--kc-muted)]">状态：{myProfile.status === 'recruiting' ? '招募中' : '已满员'} · {myProfile.moderation_status === 'approved' ? '已通过' : myProfile.moderation_status === 'pending' ? '审核中' : '未通过'}</span>
            <div className="ml-auto flex gap-2">
              {myProfile.status === 'recruiting' ? (
                <button type="button" onClick={() => closeMutation.mutate()} className="ghost-button rounded-xl border px-3 py-1.5 text-xs font-bold [border-color:var(--kc-border)]">标记满员</button>
              ) : (
                <button type="button" onClick={() => reopenMutation.mutate()} className="ghost-button rounded-xl border px-3 py-1.5 text-xs font-bold [border-color:var(--kc-border)]">重新招募</button>
              )}
              <button type="button" onClick={() => setEditorOpen(true)} className="ghost-button rounded-xl border px-3 py-1.5 text-xs font-bold [border-color:var(--kc-border)]">编辑</button>
              <button type="button" onClick={() => { if (window.confirm('确定下架名片？')) deleteMutation.mutate(); }} className="rounded-xl border border-red-200 px-3 py-1.5 text-xs font-bold text-red-600">下架</button>
            </div>
          </div>
        ) : null}

        {showEmpty ? (
          <div className="grid place-items-center rounded-[24px] border border-dashed py-16 text-center [border-color:var(--kc-border)]">
            <Icon name="users" className="h-10 w-10 [color:var(--kc-muted)]" />
            <p className="mt-3 text-sm font-bold [color:var(--kc-muted)]">{tab === 'mine' ? '你还没有发布组队名片' : activeSkill ? `暂无擅长「${skillLabel(activeSkill)}」的名片` : '还没有人发布名片，来做第一个吧'}</p>
            {tab === 'mine' ? <button type="button" onClick={() => setEditorOpen(true)} className="liquid-button mt-4 rounded-2xl px-4 py-2.5 text-sm font-black"><Icon name="plus" className="mr-1 inline h-4 w-4" />发布组队名片</button> : null}
          </div>
        ) : (
          <div className="kc-pc-stagger gap-3 [column-gap:0.75rem] columns-1 sm:columns-2 xl:columns-3">
            {profiles.map((profile) => (
              <div key={profile.id} className="mb-3 break-inside-avoid">
                <TeamupCard profile={profile} onOpen={openProfile} />
              </div>
            ))}
          </div>
        )}
        <div ref={loadMoreRef} className="flex min-h-12 items-center justify-center py-3" aria-live="polite">
          {profilesQuery.isFetchingNextPage ? <span className="text-sm font-bold [color:var(--kc-muted)]">正在加载更多...</span> : null}
          {!profilesQuery.isFetchingNextPage && profilesQuery.hasNextPage ? <button type="button" onClick={() => void profilesQuery.fetchNextPage()} className="cursor-pointer rounded-full px-4 py-2 text-sm font-bold transition hover:[background:var(--kc-panel-muted)] [color:var(--kc-muted)]">继续下滑或点击加载更多</button> : null}
          {!profilesQuery.hasNextPage && profiles.length > 0 ? <span className="text-sm font-bold [color:var(--kc-muted)]">已经到底啦</span> : null}
        </div>
      </div>

      {editorOpen && !selectedProfileId ? (
        <TeamupEditorModal
          profile={myProfile}
          onClose={() => setEditorOpen(false)}
          onSaved={(saved) => handleEditorSaved(saved, true)}
        />
      ) : null}

      {celebrationUser ? <TeamupConnectionCelebration me={currentUser} target={celebrationUser} onDone={() => setCelebrationUser(null)} /> : null}
    </section>
  );
}
