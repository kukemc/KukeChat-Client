import { Icon } from '@/components/ui/Icon';
import type { Friendship, TeamupSkill, User } from '@/types/api';
import { SKILL_META, skillLabel } from '../teamupConstants';
import { formatCountdown } from '../teamupModel';
import { useTeamupCenter, type TeamupCenterState } from '../useTeamupCenter';
import { TeamupCelebration } from './TeamupCelebration';
import { TeamupDetailDesktop } from './TeamupDetailDesktop';
import { TeamupDiscovery } from './TeamupDiscovery';
import { TeamupEditorDesktop } from './TeamupEditorDesktop';
import { TeamupProfileCard } from './TeamupProfileCard';
import { moderationLabel, statusLabel } from './teamupUi';

/** 左栏：广场 / 我的名片，下面是各技能方向的名片数（点一下按它筛选）。 */
function Sidebar({ center, onShowSquare, onShowMine }: { center: TeamupCenterState; onShowSquare: (skill: TeamupSkill | null) => void; onShowMine: () => void }): JSX.Element {
  const { tab, activeSkill, myProfile, skillCounts, topSkill } = center;
  const inSquare = tab === 'square';
  return (
    <aside className="ktu-side kui-scroll">
      <div className="ktu-side-head">
        <h2>GameJam 组队中心</h2>
        <p>寻找志同道合的搭档，组队完成 14 天极限创作。</p>
      </div>
      <nav className="ktu-nav" aria-label="组队中心">
        <button type="button" className={`ktu-nav-item ${inSquare && activeSkill === null ? 'is-active' : ''}`} onClick={() => onShowSquare(null)}>
          <Icon name="users" />
          <span className="ktu-nav-label">名片广场</span>
        </button>
        <button type="button" className={`ktu-nav-item ${tab === 'mine' ? 'is-active' : ''}`} onClick={onShowMine}>
          <Icon name="profile" />
          <span className="ktu-nav-label">我的名片</span>
          <span className="ktu-nav-count">{myProfile ? (myProfile.moderation_status === 'approved' ? statusLabel(myProfile.status) : moderationLabel(myProfile.moderation_status)) : '未发布'}</span>
        </button>
      </nav>
      <div className="ktu-side-title">技能方向</div>
      <nav className="ktu-nav" aria-label="按技能筛选">
        {SKILL_META.map((meta) => {
          const count = skillCounts.get(meta.key) ?? 0;
          const active = inSquare && activeSkill === meta.key;
          return (
            <button key={meta.key} type="button" className={`ktu-nav-item ${active ? 'is-active' : ''}`} aria-pressed={active} onClick={() => onShowSquare(active ? null : meta.key)}>
              <Icon name={meta.icon} />
              <span className="ktu-nav-label">{meta.label}</span>
              {/* 各方向名片数的相对多少，最多的那个画满 */}
              <span className="ktu-nav-meter" aria-hidden="true"><i style={{ width: `${topSkill?.count ? Math.round((count / topSkill.count) * 100) : 0}%` }} /></span>
              <span className="ktu-nav-count">{count}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

/** 当前赛季：标题、主题、倒计时和本季招募人数。 */
function Season({ center, onExplore }: { center: TeamupCenterState; onExplore: () => void }): JSX.Element | null {
  const { event } = center;
  if (!event) {
    return null;
  }
  return (
    <section className="ktu-panel ktu-season">
      {event.cover_url ? <img src={event.cover_url} alt="" className="ktu-season-cover" /> : null}
      <div className="ktu-season-text">
        <span className="kui-tag kui-tag--accent">当前赛季</span>
        <h3>{event.title}</h3>
        {event.theme ? <p>{event.theme}</p> : null}
      </div>
      <dl className="ktu-season-figures">
        {typeof event.seconds_remaining === 'number' ? (
          <div>
            <dt>距结束</dt>
            <dd>{event.seconds_remaining > 0 ? formatCountdown(event.seconds_remaining) : '已结束'}</dd>
          </div>
        ) : null}
        <div>
          <dt>招募中</dt>
          <dd>{event.recruiting_count}<small> / {event.profile_count}</small></dd>
        </div>
      </dl>
      <div className="ktu-season-actions">
        <button type="button" className="kui-btn" onClick={onExplore}>开始探索</button>
        <button type="button" className="kui-btn kui-btn--ghost" onClick={center.shuffleRandom}><Icon name="recall" className="h-3.5 w-3.5" />换一批缘分</button>
      </div>
    </section>
  );
}

function listTitle(center: TeamupCenterState): string {
  if (center.tab === 'mine') return '我的名片';
  if (center.activeSkill) return `擅长「${skillLabel(center.activeSkill)}」的名片`;
  return center.search ? '搜索结果' : '全部名片';
}

function emptyText(center: TeamupCenterState): string {
  if (center.tab === 'mine') return '你还没有发布组队名片';
  return center.activeSkill ? `暂无擅长「${skillLabel(center.activeSkill)}」的名片` : '还没有人发布名片，来做第一个吧';
}

/** 桌面端的组队中心：左栏选范围，右边是赛季、推荐和名片列表。 */
export function TeamupCenterDesktop({ currentUser, friends }: { currentUser: User; friends: Friendship[] }): JSX.Element {
  const center = useTeamupCenter(currentUser, friends);
  const { tab, setTab, activeSkill, setActiveSkill, sort, setSort, search, searchInput, setSearchInput, selectedProfileId, myProfile, profiles, profilesQuery, scrollRef, loadMoreRef } = center;

  const editor = center.editorOpen
    ? <TeamupEditorDesktop profile={myProfile} onClose={() => center.setEditorOpen(false)} onSaved={(saved) => center.handleEditorSaved(saved, selectedProfileId == null)} />
    : null;
  const celebration = center.celebrationUser
    ? <TeamupCelebration me={currentUser} target={center.celebrationUser} onDone={() => center.setCelebrationUser(null)} />
    : null;

  if (selectedProfileId != null) {
    return (
      <TeamupDetailDesktop
        profileId={selectedProfileId}
        initialProfile={center.selectedInitial}
        currentUser={currentUser}
        {...center.selectedRelation}
        onBack={() => center.setSelectedProfileId(null)}
        onEdit={() => center.setEditorOpen(true)}
        onFriendRequested={center.handleFriendRequested}
      >
        {editor}
        {celebration}
      </TeamupDetailDesktop>
    );
  }

  function showSquare(skill: TeamupSkill | null): void {
    setTab('square');
    setActiveSkill(skill);
  }

  function showMine(): void {
    // 「我的名片」不分技能：带着广场上的筛选过去，自己的名片可能被筛掉
    setActiveSkill(null);
    setTab('mine');
  }

  function explore(): void {
    setTab('square');
    scrollRef.current?.querySelector<HTMLElement>('[data-teamup-explore]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const loadFailed = profilesQuery.isError && profiles.length === 0;
  // 概况和推荐要等数据到了再出，不然先闪一排 0；整页都没取到时也不摆一排 0
  const showDiscovery = tab === 'square' && !search && activeSkill === null && !center.discoveryLoading && !loadFailed;
  const showEmpty = !profilesQuery.isLoading && !loadFailed && profiles.length === 0;

  return (
    <section className="ktu">
      <div className="ktu-shell">
        <div className="ktu-frame">
          <Sidebar center={center} onShowSquare={showSquare} onShowMine={showMine} />
          <div className="ktu-main">
            <header className="ktu-bar">
              <h2>{tab === 'mine' ? '我的名片' : activeSkill ? skillLabel(activeSkill) : '名片广场'}</h2>
              <label className="kui-field ktu-bar-search">
                <Icon name="search" className="h-3.5 w-3.5 flex-none" />
                <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="搜索标题或介绍关键字" aria-label="搜索名片" />
              </label>
              <div className="kui-segment" role="radiogroup" aria-label="排序">
                <button type="button" role="radio" aria-checked={sort === 'latest'} className={sort === 'latest' ? 'is-active' : undefined} onClick={() => setSort('latest')}>最新</button>
                <button type="button" role="radio" aria-checked={sort === 'hot'} className={sort === 'hot' ? 'is-active' : undefined} onClick={() => setSort('hot')}>热门</button>
              </div>
              <button type="button" className="kui-btn kui-btn--primary" onClick={() => { showMine(); center.setEditorOpen(true); }}>
                <Icon name={myProfile ? 'edit' : 'plus'} className="h-3.5 w-3.5" />
                {myProfile ? '编辑我的名片' : '发布组队名片'}
              </button>
            </header>

            <div ref={scrollRef} onScroll={center.loadMoreIfNeeded} className="ktu-body kui-scroll">
              <div className="ktu-page">
                <Season center={center} onExplore={explore} />
                {showDiscovery ? <TeamupDiscovery center={center} /> : null}

                <div data-teamup-explore className="ktu-list-head">
                  <h3>{listTitle(center)}</h3>
                  <span>{sort === 'hot' ? '按热度排序' : '按发布时间排序'}</span>
                </div>

                {center.actionError ? <p className="kui-note kui-note--danger" role="alert">{center.actionError}</p> : null}

                {tab === 'mine' && myProfile ? (
                  <div className="ktu-panel ktu-manage">
                    <strong>名片管理</strong>
                    <span>状态：{statusLabel(myProfile.status)} · {moderationLabel(myProfile.moderation_status)}</span>
                    <div className="ktu-manage-actions">
                      {myProfile.status === 'recruiting'
                        ? <button type="button" className="kui-btn kui-btn--sm" onClick={() => center.closeMutation.mutate()}>标记满员</button>
                        : <button type="button" className="kui-btn kui-btn--sm" onClick={() => center.reopenMutation.mutate()}>重新招募</button>}
                      <button type="button" className="kui-btn kui-btn--sm" onClick={() => center.setEditorOpen(true)}>编辑</button>
                      <button type="button" className="kui-btn kui-btn--sm kui-btn--danger" onClick={() => { if (window.confirm('确定下架名片？')) center.deleteMutation.mutate(); }}>下架</button>
                    </div>
                  </div>
                ) : null}

                {loadFailed ? (
                  <div className="kui-empty ktu-empty">
                    <Icon name="signal" className="h-7 w-7" />
                    <p>名片加载失败，请稍后再试</p>
                    <button type="button" className="kui-btn" onClick={() => void profilesQuery.refetch()}>重新加载</button>
                  </div>
                ) : showEmpty ? (
                  <div className="kui-empty ktu-empty">
                    <Icon name="users" className="h-7 w-7" />
                    <p>{emptyText(center)}</p>
                    {tab === 'mine' ? <button type="button" className="kui-btn kui-btn--primary" onClick={() => center.setEditorOpen(true)}><Icon name="plus" className="h-3.5 w-3.5" />发布组队名片</button> : null}
                  </div>
                ) : (
                  <div className="ktu-cards">
                    {profiles.map((profile) => <TeamupProfileCard key={profile.id} profile={profile} onOpen={center.openProfile} />)}
                  </div>
                )}

                <div ref={loadMoreRef} className="ktu-more" aria-live="polite">
                  {profilesQuery.isLoading ? <span>正在加载名片…</span> : null}
                  {profilesQuery.isFetchingNextPage ? <span>正在加载更多…</span> : null}
                  {!profilesQuery.isFetchingNextPage && profilesQuery.hasNextPage ? <button type="button" className="kui-btn kui-btn--ghost kui-btn--sm" onClick={() => void profilesQuery.fetchNextPage()}>继续下滑或点击加载更多</button> : null}
                  {!profilesQuery.hasNextPage && profiles.length > 0 ? <span>已经到底啦</span> : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {editor}
      {celebration}
    </section>
  );
}
