import { useId, useRef, type CSSProperties, type RefObject } from 'react';
import logoUrl from '@/assets/logo.png';
import { CcwCreatorsPage } from '@/components/posts/CcwCreatorsPage';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import type { Conversation, HomeGroup, HomeStats, User } from '@/types/api';
import { MINI_STATS, WALL_STATS, compactNumber, creatorAsUser, greeting, groupActionLabel, groupSummary, groupTitle, miniStatMax, prefersReducedMotion, weeklyMessageShare } from '../homeModel';
import { useHome, useJoinRequestForm, type HomeState } from '../useHome';

interface HomeDesktopProps {
  currentUser: User;
  conversations: Conversation[];
  onOpenConversation: (conversationId: number, conversation?: Conversation) => void;
  onOpenUserProfile: (user: User | null | undefined, fallbackId: number) => void;
}

const ANSWER_MAX = 500;

function meterStyle(percent: number): CSSProperties {
  return { width: `${Math.max(0, Math.min(100, percent))}%` };
}

/** 社区概况：上面一排是规模，下面一排是本周活跃度和四个互动指标。 */
function Overview({ stats }: { stats: HomeStats }): JSX.Element {
  const share = weeklyMessageShare(stats);
  const miniMax = miniStatMax(stats);
  return (
    <section className="khm-panel">
      <div className="khm-wall">
        {WALL_STATS.map((stat) => (
          <div key={stat.key}>
            <span>{stat.label}</span>
            <strong>{compactNumber(stats[stat.key])}</strong>
          </div>
        ))}
      </div>
      <div className="khm-pulse">
        <div className="khm-pulse-week">
          <span>本周消息活跃度</span>
          <strong>{share}%</strong>
          <i className="khm-meter"><b style={meterStyle(share)} /></i>
          <small>近七天消息 {compactNumber(stats.messages_last_7_days)} · 累计 {compactNumber(stats.messages)}</small>
        </div>
        {MINI_STATS.map((stat) => (
          <div key={stat.key}>
            <span>{stat.label}</span>
            <strong>{compactNumber(stats[stat.key])}</strong>
            {/* 四个指标之间的相对多少，最多的那个画满 */}
            <i className="khm-meter"><b style={meterStyle(Math.max(6, Math.round((stats[stat.key] / miniMax) * 100)))} /></i>
          </div>
        ))}
      </div>
    </section>
  );
}

function GroupRow({ group, index, home }: { group: HomeGroup; index: number; home: HomeState }): JSX.Element {
  const title = groupTitle(group);
  const busy = home.joinMutation.isPending && home.joinMutation.variables?.id === group.id;
  const waiting = group.join_request_status === 'pending';
  return (
    <li className="khm-group">
      <span className={`khm-group-rank ${index < 3 ? 'is-top' : ''}`}>{String(index + 1).padStart(2, '0')}</span>
      <Avatar label={title} avatarUrl={group.avatar_url} toneKey={group.id} size="md" />
      <div className="khm-group-text">
        <h4><span>{title}</span><em className="kui-tag">{group.category?.trim() || '开放社区'}</em></h4>
        <p>{groupSummary(group)}</p>
        {home.joinErrorGroupId === group.id && home.joinError ? <p className="khm-group-error" role="alert">{home.joinError}</p> : null}
      </div>
      <div className="khm-group-figures">
        <span><strong>{compactNumber(group.member_count ?? 0)}</strong>成员</span>
        <span><strong>{compactNumber(group.recent_message_count)}</strong>本周消息</span>
        <span><strong>{compactNumber(group.heat_score)}</strong>热度</span>
      </div>
      <button type="button" className={`kui-btn kui-btn--sm ${group.joined || waiting ? '' : 'kui-btn--primary'}`} disabled={busy || waiting} onClick={() => home.openGroup(group)}>
        {busy ? '正在加入…' : groupActionLabel(group)}
      </button>
    </li>
  );
}

/** 需要审核或回答问题的群：填一段申请说明（或答案）再提交。 */
function JoinDialog({ group, home }: { group: HomeGroup; home: HomeState }): JSX.Element {
  const pending = home.requestMutation.isPending;
  const { answer, setAnswer, inputRef, needsAnswer } = useJoinRequestForm(group, pending, home.closeJoinDialog);
  const titleId = useId();
  return (
    <div className="kui-backdrop" onMouseDown={() => !pending && home.closeJoinDialog()}>
      <section role="dialog" aria-modal="true" aria-labelledby={titleId} className="kui-dialog khm-join" onMouseDown={(event) => event.stopPropagation()}>
        <header className="kui-dialog-header">
          <span id={titleId} className="khm-clip">申请加入 {groupTitle(group)}</span>
          <button type="button" className="kui-icon-btn" aria-label="关闭加群申请" disabled={pending} onClick={home.closeJoinDialog}><Icon name="close" className="h-4 w-4" /></button>
        </header>
        <div className="kui-dialog-body khm-join-body">
          <p className="khm-join-question">{needsAnswer ? group.join_question?.trim() || '请回答群管理员设置的问题' : '向管理员简单介绍一下你自己。'}</p>
          <textarea ref={inputRef} className="kui-textarea kui-scroll" rows={4} value={answer} placeholder={needsAnswer ? '输入你的答案' : '可选：填写申请说明'} onChange={(event) => setAnswer(event.target.value.slice(0, ANSWER_MAX))} />
          <p className="khm-join-hint"><span>申请会发送给群管理员审核</span><span>{answer.length}/{ANSWER_MAX}</span></p>
          {home.joinError ? <p className="kui-note kui-note--danger" role="alert">{home.joinError}</p> : null}
        </div>
        <footer className="kui-dialog-footer">
          <button type="button" className="kui-btn" disabled={pending} onClick={home.closeJoinDialog}>取消</button>
          <button type="button" className="kui-btn kui-btn--primary" disabled={pending || (needsAnswer && !answer.trim())} onClick={() => home.requestMutation.mutate({ group, answer: answer.trim() })}>{pending ? '提交中...' : '提交申请'}</button>
        </footer>
      </section>
    </div>
  );
}

/** 桌面端的主页：社区概况、推荐的公开群和入驻的创作者。 */
export function HomeDesktop({ currentUser, conversations, onOpenConversation, onOpenUserProfile }: HomeDesktopProps): JSX.Element {
  const home = useHome(conversations, onOpenConversation);
  const groupsRef = useRef<HTMLElement>(null);
  const creatorsRef = useRef<HTMLElement>(null);
  const { data, query } = home;

  if (home.creatorsOpen) {
    return <CcwCreatorsPage isMobile={false} onBack={() => home.setCreatorsOpen(false)} onOpenUserSpace={onOpenUserProfile} />;
  }

  function scrollTo(ref: RefObject<HTMLElement>): void {
    ref.current?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  }

  return (
    <section className="khm">
      <div className="khm-shell">
        <div className="khm-main">
          <header className="khm-bar">
            <img src={logoUrl} alt="" />
            <h2>KukeChat</h2>
            <button type="button" className="kui-btn kui-btn--ghost kui-btn--sm" onClick={() => scrollTo(groupsRef)}>人气群聊</button>
            <button type="button" className="kui-btn kui-btn--ghost kui-btn--sm" onClick={() => scrollTo(creatorsRef)}>大佬入住</button>
            <span className="khm-status"><i />社区运行中</span>
          </header>

          <div className="khm-body kui-scroll">
            <div className="khm-page">
              <div className="khm-hello">
                <h1>{greeting()}，{getDisplayName(currentUser)}</h1>
                <p>这是你与同好们共同生活的社区，下面的每一组数字，都在此刻真实跳动。</p>
              </div>

              {query.isLoading && !data ? <p className="kui-empty khm-state">正在加载社区数据…</p> : null}
              {query.isError && !data ? (
                <div className="kui-empty khm-state">
                  <Icon name="signal" className="h-6 w-6" />
                  <p>暂时无法获取主页数据</p>
                  <button type="button" className="kui-btn" onClick={() => void query.refetch()}>重新加载</button>
                </div>
              ) : null}

              {data ? (
                <>
                  <Overview stats={data.stats} />
                  <p className="khm-footnote">消息数据为平台当前在册消息，每个群聊仅保留最新 1000 条，实际累计发送量远高于此。</p>

                  <div className="khm-columns">
                    <section ref={groupsRef} className="khm-panel khm-section">
                      <header className="khm-section-head">
                        <div>
                          <h3>人气群聊</h3>
                          <p>按成员规模、近期活跃与更新热度加权推荐。</p>
                        </div>
                        <button type="button" className="kui-btn kui-btn--sm" disabled={query.isFetching} onClick={home.reshuffle}><Icon name="refresh" className={`h-3.5 w-3.5 ${query.isFetching ? 'animate-spin' : ''}`} />换一批</button>
                      </header>
                      {data.groups.length === 0
                        ? <p className="kui-empty">暂时还没有可推荐的公开群聊</p>
                        : <ol className="khm-groups">{data.groups.map((group, index) => <GroupRow key={group.id} group={group} index={index} home={home} />)}</ol>}
                    </section>

                    <section ref={creatorsRef} className="khm-panel khm-section">
                      <header className="khm-section-head">
                        <div>
                          <h3>大佬入住</h3>
                          <p>已绑定创作社区且粉丝破千的创作者，在这里与你近距离交流。</p>
                        </div>
                        <button type="button" className="kui-link khm-more" onClick={() => home.setCreatorsOpen(true)}>查看全部 {data.creator_total ?? 0} 位<Icon name="chevron" className="h-3 w-3" /></button>
                      </header>
                      {data.creators.length === 0 ? <p className="kui-empty">还没有入驻的创作者</p> : null}
                      <div className="khm-creators">
                        {data.creators.map((creator) => {
                          const user = creatorAsUser(creator);
                          return (
                            <button key={creator.id} type="button" className="khm-creator" onClick={() => onOpenUserProfile(user, creator.id)}>
                              <span className="khm-creator-avatar"><Avatar user={user} avatarUrl={creator.avatar_url || creator.ccw_avatar_url} size="message" /><i title="已绑定创作社区"><Icon name="check" /></i></span>
                              <span className="khm-creator-text">
                                <strong>{creator.ccw_name || getDisplayName(user)}</strong>
                                <span>@{creator.username}</span>
                              </span>
                              <span className="khm-creator-figures">
                                <span><b>{compactNumber(creator.ccw_follower_count)}</b> 粉丝</span>
                                <span><b>{compactNumber(creator.ccw_like_count ?? 0)}</b> 获赞</span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  </div>
                </>
              ) : null}

              <footer className="khm-foot">连接兴趣、创作和协作 · 数据由 KukeChat 实时统计</footer>
            </div>
          </div>
        </div>
      </div>
      {home.joinTarget ? <JoinDialog group={home.joinTarget} home={home} /> : null}
    </section>
  );
}
