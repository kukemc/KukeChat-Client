import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createGroupJoinRequest, joinGroup } from '@/api/conversations';
import { getHome } from '@/api/home';
import { ApiError } from '@/api/client';
import type { Conversation, CcwCreator, HomeGroup, HomeStats, User } from '@/types/api';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon, type IconName } from '@/components/ui/Icon';
import { MobileStatusBar } from '@/components/mobile/MobileChrome';
import { CcwCreatorsPage } from '@/components/posts/CcwCreatorsPage';
import { resolveThumbnailUrl } from '@/utils/assetUrl';
import logoUrl from '@/assets/logo.png';

interface HomePanelProps {
  currentUser: User;
  conversations: Conversation[];
  isMobile: boolean;
  onMobileBack?: () => void;
  onOpenConversation: (conversationId: number, conversation?: Conversation) => void;
  onOpenUserProfile: (user: User | null | undefined, fallbackId: number) => void;
}

interface StatDefinition {
  key: keyof HomeStats;
  label: string;
}

const WALL_STATS: StatDefinition[] = [
  { key: 'registered_users', label: '注册用户' },
  { key: 'messages', label: '累计消息' },
  { key: 'messages_last_7_days', label: '近七天消息' },
  { key: 'groups', label: '群聊总数' }
];

const MINI_STATS: StatDefinition[] = [
  { key: 'public_groups', label: '公开群聊' },
  { key: 'public_posts', label: '公开动态' },
  { key: 'friendships', label: '好友关系' },
  { key: 'post_likes', label: '动态获赞' }
];

function compactNumber(value: number): string {
  if (value >= 100000000) return `${(value / 100000000).toFixed(value >= 1000000000 ? 0 : 1)}亿`;
  if (value >= 10000) return `${(value / 10000).toFixed(value >= 100000 ? 0 : 1)}万`;
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  return new Intl.NumberFormat('zh-CN').format(value);
}

function creatorAsUser(creator: CcwCreator): User {
  return creator as User;
}

function groupTitle(group: Conversation): string {
  return group.display_title?.trim() || group.title?.trim() || `群聊 ${group.id}`;
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return '夜深了';
  if (hour < 12) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

function getPortalRoot(): Element {
  const host = document.getElementById('kukechat-shadow-host');
  const scope = host?.shadowRoot ?? document;
  return scope.querySelector('.kc-window-frame:not(.kc-window-minimized) [data-theme]')
    ?? scope.querySelector('.kc-desktop-app[data-theme]')
    ?? scope.querySelector('.kc-native-app[data-theme]')
    ?? host?.shadowRoot?.querySelector('.kc-window-frame:not(.kc-window-minimized)')
    ?? document.querySelector('.kc-window-frame:not(.kc-window-minimized)')
    ?? document.querySelector('.kc-desktop-app')
    ?? host?.shadowRoot?.getElementById('kukechat-root')
    ?? document.getElementById('kukechat-root')
    ?? document.body;
}

function groupActionLabel(group: HomeGroup): string {
  if (group.joined) return '进入群聊';
  if (group.join_request_status === 'pending') return '等待审核';
  if ((group.join_mode === 'approval' || group.join_mode === 'question') && !group.auto_approve) return '申请加入';
  return '加入群聊';
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** 数字滚动：元素进入视口后从 0 缓动递增到目标值。 */
function CountUp({ value, format = compactNumber }: { value: number; format?: (value: number) => string }): JSX.Element {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    if (prefersReducedMotion()) {
      setDisplay(value);
      return undefined;
    }
    let raf = 0;
    const run = (): void => {
      const start = performance.now();
      const duration = 1600;
      const tick = (now: number): void => {
        const t = Math.min(1, (now - start) / duration);
        const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
        setDisplay(Math.round(value * eased));
        if (t < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };
    if (!('IntersectionObserver' in window)) {
      run();
      return () => cancelAnimationFrame(raf);
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        run();
      }
    }, { threshold: 0.35 });
    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value]);
  return <span ref={ref}>{format(display)}</span>;
}

function JoinRequestDialog({ group, pending, error, onSubmit, onClose }: { group: HomeGroup; pending: boolean; error: string; onSubmit: (answer: string) => void; onClose: () => void }): JSX.Element {
  const [answer, setAnswer] = useState('');
  const titleId = useId();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const needsAnswer = group.join_mode === 'question' && !group.auto_approve;
  useEffect(() => {
    inputRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape' && !pending) onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, pending]);
  const modal = (
    <div className="pointer-events-auto fixed inset-0 z-[2147483647] grid place-items-center bg-slate-950/35 p-4 backdrop-blur-sm" onMouseDown={() => !pending && onClose()}>
      <section role="dialog" aria-modal="true" aria-labelledby={titleId} onMouseDown={(event) => event.stopPropagation()} className="w-full max-w-[460px] overflow-hidden rounded-[28px] border shadow-float [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-text)]">
        <header className="flex items-center justify-between border-b px-5 py-4 [border-color:var(--kc-border)]">
          <div><h2 id={titleId} className="text-base font-bold">申请加入 {groupTitle(group)}</h2><p className="mt-1 text-xs [color:var(--kc-muted)]">申请会发送给群管理员审核</p></div>
          <button type="button" onClick={onClose} disabled={pending} className="kc-icon-button h-9 w-9" aria-label="关闭加群申请"><Icon name="close" className="h-4 w-4" /></button>
        </header>
        <div className="space-y-4 p-5">
          <div className="rounded-[22px] border p-4 [background:var(--kc-panel-muted)] [border-color:var(--kc-border)]">
            <p className="text-sm font-semibold">{needsAnswer ? group.join_question?.trim() || '请回答群管理员设置的问题' : '向管理员简单介绍一下你自己。'}</p>
            <textarea ref={inputRef} value={answer} onChange={(event) => setAnswer(event.target.value.slice(0, 500))} rows={4} placeholder={needsAnswer ? '输入你的答案' : '可选：填写申请说明'} className="scroll-soft mt-3 w-full resize-none rounded-2xl border px-4 py-3 text-sm leading-6 outline-none [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-text)] focus:[border-color:var(--kc-accent)]" />
          </div>
          {error ? <p className="rounded-2xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-500">{error}</p> : null}
        </div>
        <footer className="flex justify-end gap-2 border-t px-5 py-4 [border-color:var(--kc-border)]">
          <button type="button" onClick={onClose} disabled={pending} className="rounded-2xl px-4 py-2 text-sm font-semibold [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">取消</button>
          <button type="button" onClick={() => onSubmit(answer.trim())} disabled={pending || (needsAnswer && !answer.trim())} className="liquid-button rounded-2xl px-5 py-2 text-sm font-bold disabled:opacity-50">{pending ? '提交中...' : '提交申请'}</button>
        </footer>
      </section>
    </div>
  );
  return createPortal(modal, getPortalRoot());
}

/** 首屏背景里漂浮的霓虹聊天气泡，呼应品牌图标。 */
function NeonBubble(): JSX.Element {
  return (
    <svg className="kc-neon-bubble" viewBox="0 0 240 220" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="kc-neon-bubble-stroke" x1="0" y1="0" x2="240" y2="220" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8b5cff" />
          <stop offset=".55" stopColor="#38c8ff" />
          <stop offset="1" stopColor="#c05cff" />
        </linearGradient>
      </defs>
      <path className="kc-neon-bubble-body" d="M120 18C64 18 26 54 26 102c0 30 15 56 39 71-2 12-7 22-15 29 14-1 28-6 38-13 10 3 21 5 32 5 56 0 94-36 94-84s-38-92-94-92Z" stroke="url(#kc-neon-bubble-stroke)" strokeWidth="5" strokeLinejoin="round" />
      <circle className="kc-neon-bubble-eye" cx="92" cy="98" r="11" fill="#8b5cff" />
      <circle className="kc-neon-bubble-eye" cx="148" cy="98" r="11" fill="#38c8ff" />
    </svg>
  );
}

export function HomePanel({ currentUser, conversations, isMobile, onMobileBack, onOpenConversation, onOpenUserProfile }: HomePanelProps): JSX.Element {
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 2_147_483_647));
  const [joinTarget, setJoinTarget] = useState<HomeGroup | null>(null);
  const [joinError, setJoinError] = useState('');
  const [joinErrorGroupId, setJoinErrorGroupId] = useState<number | null>(null);
  const [creatorsOpen, setCreatorsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const groupsRef = useRef<HTMLElement>(null);
  const creatorsRef = useRef<HTMLElement>(null);
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['home', seed], queryFn: () => getHome(seed), placeholderData: keepPreviousData, staleTime: 60_000 });
  const data = query.data;

  useEffect(() => {
    const root = scrollRef.current;
    if (!root || !('IntersectionObserver' in window)) return undefined;
    const nodes = root.querySelectorAll('.kc-neon-reveal:not(.is-in)');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          observer.unobserve(entry.target);
        }
      });
    }, { root, rootMargin: '12% 0px 8% 0px', threshold: 0.05 });
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [data?.recommendation_seed, creatorsOpen]);

  const joinMutation = useMutation({
    mutationFn: (group: HomeGroup) => joinGroup(group.id),
    onSuccess: (conversation) => {
      setJoinError('');
      setJoinErrorGroupId(null);
      queryClient.setQueryData<Conversation[] | undefined>(['conversations'], (current) => current?.some((item) => item.id === conversation.id) ? current : [...(current ?? []), conversation]);
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      void queryClient.invalidateQueries({ queryKey: ['home'] });
      onOpenConversation(conversation.id, conversation);
    },
    onError: (error, group) => {
      setJoinErrorGroupId(group.id);
      setJoinError(error instanceof ApiError ? error.message : '加入群聊失败，请稍后重试。');
    }
  });
  const requestMutation = useMutation({
    mutationFn: ({ group, answer }: { group: HomeGroup; answer: string }) => createGroupJoinRequest(group.id, { message: group.join_mode === 'question' ? undefined : answer || undefined, answer: group.join_mode === 'question' ? answer : undefined }),
    onSuccess: () => {
      setJoinTarget(null);
      setJoinError('');
      void queryClient.invalidateQueries({ queryKey: ['home'] });
      void queryClient.invalidateQueries({ queryKey: ['group-join-requests'] });
    },
    onError: (error) => setJoinError(error instanceof ApiError ? error.message : '加群申请提交失败，请稍后重试。')
  });

  function openGroup(group: HomeGroup): void {
    setJoinError('');
    setJoinErrorGroupId(null);
    if (group.joined) {
      const known = conversations.find((item) => item.id === group.id) ?? group;
      onOpenConversation(group.id, known);
      return;
    }
    if (group.join_request_status === 'pending') return;
    if ((group.join_mode === 'approval' || group.join_mode === 'question') && !group.auto_approve) {
      setJoinTarget(group);
      return;
    }
    joinMutation.mutate(group);
  }

  function scrollTo(ref: React.RefObject<HTMLElement | null>): void {
    ref.current?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  }

  if (creatorsOpen) {
    return <CcwCreatorsPage isMobile={isMobile} onBack={() => setCreatorsOpen(false)} onOpenUserSpace={onOpenUserProfile} />;
  }

  const stats = data?.stats;
  const weeklyShare = stats?.messages ? Math.min(100, Math.round((stats.messages_last_7_days / stats.messages) * 100)) : 0;
  const miniMax = stats ? Math.max(stats.public_groups, stats.public_posts, stats.friendships, stats.post_likes, 1) : 1;

  return (
    <section className={`kc-neon-home h-full min-h-0 overflow-hidden ${isMobile ? 'kc-neon-mobile' : ''}`}>
      {isMobile ? <MobileStatusBar /> : null}
      <div ref={scrollRef} className="kc-neon-scroll scroll-soft h-full overflow-y-auto">
        <div className="kc-neon-sky" aria-hidden="true">
          <span className="kc-neon-stars stars-a" /><span className="kc-neon-stars stars-b" />
          <span className="kc-neon-haze haze-a" /><span className="kc-neon-haze haze-b" /><span className="kc-neon-haze haze-c" />
        </div>

        <nav className="kc-neon-nav">
          <div className="kc-neon-brand">
            {isMobile && onMobileBack ? <button type="button" onClick={onMobileBack} className="kc-neon-back" aria-label="返回空间"><Icon name="chevronLeft" className="h-5 w-5" /></button> : null}
            <img src={logoUrl} alt="KukeChat" className="kc-neon-logo" />
            <strong>KukeChat</strong>
          </div>
          <span className="kc-neon-status"><i />社区运行中</span>
        </nav>

        <header className="kc-neon-hero">
          <NeonBubble />
          <div className="kc-neon-hero-inner">
            <img src={logoUrl} alt="" className="kc-neon-hero-logo kc-neon-rise" style={{ '--d': '40ms' } as CSSProperties} />
            <span className="kc-neon-pill kc-neon-rise" style={{ '--d': '140ms' } as CSSProperties}><i />社区实时数据</span>
            <h1 className="kc-neon-rise" style={{ '--d': '240ms' } as CSSProperties}>每一条消息<br />都让这里更热闹</h1>
            <p className="kc-neon-rise" style={{ '--d': '340ms' } as CSSProperties}>{greeting()}，{getDisplayName(currentUser)}。这是你与同好们共同生活的社区，下面的每一组数字，都在此刻真实跳动。</p>
            <div className="kc-neon-actions kc-neon-rise" style={{ '--d': '440ms' } as CSSProperties}>
              <button type="button" onClick={() => scrollTo(groupsRef)} className="kc-neon-btn-main">逛逛人气群聊<Icon name="chevron" className="h-4 w-4" /></button>
              <button type="button" onClick={() => scrollTo(creatorsRef)} className="kc-neon-btn-side">认识入驻大佬</button>
            </div>
          </div>

          <div className="kc-neon-wall kc-neon-rise" style={{ '--d': '560ms' } as CSSProperties}>
            {WALL_STATS.map((stat) => (
              <div key={stat.key} className="kc-neon-wall-item">
                <strong>{stats ? <CountUp value={stats[stat.key]} /> : '···'}</strong>
                <span>{stat.label}</span>
              </div>
            ))}
          </div>
          <p className="kc-neon-wall-note kc-neon-rise" style={{ '--d': '640ms' } as CSSProperties}>消息数据为平台当前在册消息，每个群聊仅保留最新 1000 条，实际累计发送量远高于此。</p>
        </header>

        <main className="kc-neon-main">
          {query.isLoading && !data ? <div className="kc-neon-state"><span className="kc-neon-loader" /><p>正在加载社区数据…</p></div> : null}
          {query.isError && !data ? <div className="kc-neon-state"><Icon name="signal" className="h-7 w-7" /><p>暂时无法获取主页数据</p><button type="button" onClick={() => void query.refetch()}>重新加载</button></div> : null}

          {stats ? (
            <section className="kc-neon-section kc-neon-reveal">
              <div className="kc-neon-section-head">
                <h2>平台脉搏</h2>
                <p>社区规模与活跃度的实时截面，每一次刷新都是最新的样子。</p>
              </div>

              <div className="kc-neon-pulse">
                <div className="kc-neon-pulse-figure">
                  <strong><CountUp value={weeklyShare} format={(v) => `${v}%`} /></strong>
                  <span>本周消息活跃度</span>
                  <small>近七天消息 {compactNumber(stats.messages_last_7_days)} · 累计 {compactNumber(stats.messages)}</small>
                </div>
                <div className="kc-neon-pulse-wave" aria-hidden="true">
                  <svg viewBox="0 0 1200 180" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="kc-neon-wave-line" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0" stopColor="#8b5cff" /><stop offset=".5" stopColor="#38c8ff" /><stop offset="1" stopColor="#c05cff" />
                      </linearGradient>
                      <linearGradient id="kc-neon-wave-fill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="#8b5cff" stopOpacity=".22" /><stop offset="1" stopColor="#8b5cff" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path className="kc-neon-wave-area" d="M0,130 C120,50 240,160 380,95 C520,30 640,150 790,85 C940,25 1080,120 1200,60 L1200,180 L0,180 Z" fill="url(#kc-neon-wave-fill)" />
                    <path className="kc-neon-wave-path" d="M0,130 C120,50 240,160 380,95 C520,30 640,150 790,85 C940,25 1080,120 1200,60" fill="none" stroke="url(#kc-neon-wave-line)" strokeWidth="2.5" strokeLinecap="round" />
                    <path className="kc-neon-wave-ghost" d="M0,150 C140,90 260,175 400,120 C540,70 680,168 820,115 C960,65 1090,140 1200,95" fill="none" stroke="rgba(139,92,255,.25)" strokeWidth="1.5" />
                  </svg>
                </div>
              </div>

              <div className="kc-neon-minis">
                {MINI_STATS.map((stat) => (
                  <div key={stat.key} className="kc-neon-mini">
                    <span className="kc-neon-mini-label">{stat.label}</span>
                    <strong><CountUp value={stats[stat.key]} /></strong>
                    <i><b style={{ '--w': `${Math.max(6, Math.round((stats[stat.key] / miniMax) * 100))}%` } as CSSProperties} /></i>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section ref={groupsRef} className="kc-neon-section kc-neon-reveal kc-neon-groups">
            <div className="kc-neon-section-head">
              <h2>人气群聊</h2>
              <p>按成员规模、近期活跃与更新热度加权推荐。</p>
              <button type="button" disabled={query.isFetching} onClick={() => setSeed(Math.floor(Math.random() * 2_147_483_647))} className="kc-neon-btn-refresh"><Icon name="recall" className={`h-4 w-4 ${query.isFetching ? 'animate-spin' : ''}`} />换一批</button>
            </div>

            <ol key={data?.recommendation_seed} className="kc-neon-rank">
              {(data?.groups ?? []).map((group, index) => {
                const title = groupTitle(group);
                const avatar = resolveThumbnailUrl(group.avatar_url);
                const busy = joinMutation.isPending && joinMutation.variables?.id === group.id;
                return (
                  <li key={group.id} className="kc-neon-rank-row" style={{ '--i': index } as CSSProperties}>
                    <span className="kc-neon-rank-no">{String(index + 1).padStart(2, '0')}</span>
                    <span className="kc-neon-rank-avatar">{avatar ? <img src={avatar} alt={title} /> : <Avatar label={title} size="lg" />}</span>
                    <div className="kc-neon-rank-copy">
                      <h3>{title}<em>{group.category?.trim() || '开放社区'}</em></h3>
                      <p>{group.description?.trim() || group.announcement?.trim() || '欢迎加入这个公开群聊，与社区成员一起交流。'}</p>
                      {joinErrorGroupId === group.id && joinError ? <span className="kc-neon-rank-error" role="alert">{joinError}</span> : null}
                    </div>
                    <div className="kc-neon-rank-figures">
                      <span><strong>{compactNumber(group.member_count ?? 0)}</strong>成员</span>
                      <span><strong>{compactNumber(group.recent_message_count)}</strong>本周消息</span>
                      <span><strong>{compactNumber(group.heat_score)}</strong>热度</span>
                    </div>
                    <button type="button" onClick={() => openGroup(group)} disabled={busy || group.join_request_status === 'pending'} className={group.joined ? 'is-joined' : ''}>
                      {busy ? '正在加入…' : groupActionLabel(group)}<Icon name={group.joined ? 'message' : group.join_request_status === 'pending' ? 'clock' : 'plus'} className="h-4 w-4" />
                    </button>
                  </li>
                );
              })}
            </ol>
            {data && data.groups.length === 0 ? <div className="kc-neon-state"><Icon name="contacts" className="h-7 w-7" /><p>暂时还没有可推荐的公开群聊</p></div> : null}
          </section>

          <section ref={creatorsRef} className="kc-neon-section kc-neon-reveal kc-neon-creators">
            <div className="kc-neon-section-head">
              <h2>大佬入住</h2>
              <p>已绑定创作社区且粉丝破千的创作者，在这里与你近距离交流。</p>
              <button type="button" onClick={() => setCreatorsOpen(true)} className="kc-neon-btn-refresh">查看全部 {data?.creator_total ?? 0} 位<Icon name="chevron" className="h-4 w-4" /></button>
            </div>

            <div className="kc-neon-creator-grid">
              {(data?.creators ?? []).map((creator, index) => {
                const user = creatorAsUser(creator);
                return (
                  <button key={creator.id} type="button" onClick={() => onOpenUserProfile(user, creator.id)} className="kc-neon-creator" style={{ '--i': index } as CSSProperties}>
                    <span className="kc-neon-creator-ring"><span className="kc-neon-creator-avatar"><Avatar user={user} avatarUrl={creator.avatar_url || creator.ccw_avatar_url} size="lg" /></span><i><Icon name="check" className="h-2.5 w-2.5" /></i></span>
                    <strong>{creator.ccw_name || getDisplayName(user)}</strong>
                    <span className="kc-neon-creator-id">@{creator.username}</span>
                    <span className="kc-neon-creator-stats"><b>{compactNumber(creator.ccw_follower_count)}</b> 粉丝 · <b>{compactNumber(creator.ccw_like_count ?? 0)}</b> 获赞</span>
                    <span className="kc-neon-creator-cta" aria-hidden="true"><Icon name="chevron" className="h-3.5 w-3.5" /></span>
                  </button>
                );
              })}
            </div>
          </section>

          <footer className="kc-neon-footer">
            <img src={logoUrl} alt="" className="kc-neon-logo" />
            <p>连接兴趣、创作和协作</p>
            <small>数据由 KukeChat 实时统计</small>
          </footer>
        </main>
      </div>
      {joinTarget ? <JoinRequestDialog group={joinTarget} pending={requestMutation.isPending} error={joinError} onSubmit={(answer) => requestMutation.mutate({ group: joinTarget, answer })} onClose={() => { setJoinTarget(null); setJoinError(''); setJoinErrorGroupId(null); }} /> : null}
    </section>
  );
}
