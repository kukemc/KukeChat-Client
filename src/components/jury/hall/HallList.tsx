import { useMemo } from 'react';
import { cx } from '@/components/chat/desktop/runtime';
import { Icon } from '@/components/ui/Icon';
import type { HallPost, HallPostKind, HallPostsQuery, HallPostStatus } from '@/types/juryHall';
import { useJury } from '../context';
import { useHallPosts } from '../data/hall';
import { errorText } from '../data/queries';
import { TIER_LABEL } from '../labels';
import { Card, Loading, LoadError, SectionFrame, StateBlock } from '../widgets/Frame';
import { Pager } from '../widgets/Pager';
import { HallGuide, RealNameNotice, useHallRole } from './HallGuide';
import { HallPerson } from './HallPerson';
import { formatAgo, HALL_KIND_SHORT, HALL_STATUS_FILTERS, HIDDEN_POST_TEXT, isHiddenPost, statusTag } from './labels';
import { ProposalMini } from './Proposal';

const PAGE_SIZE = 20;

export interface HallListState {
  kind: HallPostKind | 'all';
  status: HallPostStatus | 'all';
  sort: 'active' | 'new';
  offset: number;
}

export const HALL_LIST_INITIAL: HallListState = { kind: 'all', status: 'all', sort: 'active', offset: 0 };

const KINDS: Array<{ value: HallListState['kind']; label: string }> = [
  { value: 'all', label: '全部' }, { value: 'announcement', label: '公告' }, { value: 'proposal', label: '规则提案' }, { value: 'discussion', label: '讨论' }
];

function Filters({ list, onChange }: { list: HallListState; onChange: (list: HallListState) => void }): JSX.Element {
  const set = (patch: Partial<HallListState>): void => onChange({ ...list, ...patch, offset: 0 });
  const dirty = list.kind !== 'all' || list.status !== 'all';
  return (
    <div className="kjr-filters">
      <div className="kui-segment" role="tablist" aria-label="帖子类型">
        {KINDS.map((item) => <button key={item.value} type="button" role="tab" data-kind={item.value} aria-selected={list.kind === item.value} className={list.kind === item.value ? 'is-active' : undefined} onClick={() => set({ kind: item.value })}>{item.label}</button>)}
      </div>
      <select className="kui-select" aria-label="按状态筛选" data-filter="status" value={list.status} onChange={(event) => set({ status: event.target.value as HallListState['status'] })}>
        <option value="all">全部状态</option>
        {HALL_STATUS_FILTERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select>
      {dirty ? <button type="button" className="kui-btn kui-btn--ghost kui-btn--sm" onClick={() => onChange({ ...HALL_LIST_INITIAL, sort: list.sort })}>清除筛选</button> : null}
      <select className="kui-select kjr-hall-sort" aria-label="排序" data-filter="sort" value={list.sort} onChange={(event) => set({ sort: event.target.value as HallListState['sort'] })}>
        <option value="active">最近活跃</option>
        <option value="new">最新发布</option>
      </select>
    </div>
  );
}

function PostRow({ post, onOpen }: { post: HallPost; onOpen: (postId: number) => void }): JSX.Element {
  const tag = statusTag(post);
  const hidden = isHiddenPost(post);
  return (
    <li>
      <button type="button" className={cx('kjr-hall-row', post.pinned && 'is-pinned', hidden && 'is-hidden')} data-post={post.id} data-kind={post.kind} data-status={post.status} data-state={post.state ?? 'visible'} onClick={() => onOpen(post.id)}>
        <span className="kjr-hall-row-main">
          <span className="kjr-hall-row-head">
            {post.pinned ? <span className="kui-tag kui-tag--accent"><Icon name="pin" className="h-3 w-3" />置顶</span> : null}
            <span className={cx('kui-tag', post.kind === 'announcement' && 'kui-tag--accent')}>{HALL_KIND_SHORT[post.kind]}</span>
            {tag ? <span className={cx('kui-tag', tag.tone)}>{tag.text}</span> : null}
            {hidden ? <span className="kui-tag kui-tag--warn">已折叠</span> : null}
            <span className="kjr-hall-row-title">{post.title}</span>
          </span>
          {/* 被折叠的帖子没有正文；列表里的正文是截断过的（content_truncated），全文在详情里 */}
          <span className="kjr-hall-row-excerpt">{hidden || post.content === null ? HIDDEN_POST_TEXT : `${post.content}${post.content_truncated ? '…' : ''}`}</span>
          <span className="kjr-hall-row-meta">
            <HallPerson user={post.author} size="xs" interactive={false} />
            <span>{post.kind === 'announcement' ? '管理员' : post.author_tier ? `${TIER_LABEL[post.author_tier] ?? post.author_tier}委员` : '不在任'}</span>
            <span>最后活动 {formatAgo(post.updated_at)}</span>
            <span className="kjr-hall-row-count"><Icon name="message" className="h-3.5 w-3.5" />{post.comment_count}</span>
            {post.mine ? <span className="kui-tag kui-tag--accent">我发的</span> : null}
          </span>
        </span>
        {post.vote ? <ProposalMini post={post} vote={post.vote} /> : null}
      </button>
    </li>
  );
}

/**
 * 议事厅首页：公告、规则提案和讨论的列表。所有登录用户可读；
 * 右上角的「发帖」只给在任的正式 / 资深委员，其他身份在那里看到的是自己现在能做什么。
 */
export function HallList({ list, notice = null, onListChange, onOpen, onCompose }: { list: HallListState; /** 回到列表时要交代的一句话（比如刚才在看的帖子被删了） */ notice?: string | null; onListChange: (list: HallListState) => void; onOpen: (postId: number) => void; onCompose: () => void }): JSX.Element {
  const { nav } = useJury();
  const role = useHallRole();
  const params = useMemo<HallPostsQuery>(() => ({
    limit: PAGE_SIZE,
    offset: list.offset,
    sort: list.sort,
    ...(list.kind !== 'all' ? { kind: list.kind } : {}),
    ...(list.status !== 'all' ? { status: list.status } : {})
  }), [list]);
  const query = useHallPosts(params);
  const items = query.data?.items ?? [];
  const filtered = list.kind !== 'all' || list.status !== 'all';

  const action = role === 'member' ? <button type="button" className="kui-btn kui-btn--primary" data-action="hall-compose" onClick={onCompose}><Icon name="edit" className="h-4 w-4" />发帖</button>
    : role === 'guest' ? <button type="button" className="kui-btn" data-action="hall-join" onClick={() => nav.goSection('overview')}>成为委员后可以参与</button>
    : <span className="kjr-meta" data-role="hall-cannot-post">{role === 'trainee' ? '见习委员可以评论和表决' : '受处罚期间只能阅读'}</span>;

  return (
    <SectionFrame title="议事厅" subtitle="公告、规则提案和讨论 —— 社区在这里商量规则" actions={action}>
      <div className="kjr-hall-layout">
        <div className="kjr-hall-main">
          {notice ? <p className="kui-note kui-note--warn" role="status" data-role="hall-notice">{notice}</p> : null}
          <RealNameNotice />
          <Card className="kjr-hall-board">
            <Filters list={list} onChange={onListChange} />
            {query.isLoading ? <Loading compact />
              : !query.data ? <LoadError compact message={errorText(query.error, '议事厅加载失败，请稍后再试。')} onRetry={() => void query.refetch()} />
              : items.length === 0 ? (
                <StateBlock icon="announcement" title={filtered ? '没有符合条件的帖子' : '议事厅里还没有帖子'} compact actions={filtered ? <button type="button" className="kui-btn kui-btn--sm" onClick={() => onListChange({ ...HALL_LIST_INITIAL, sort: list.sort })}>清除筛选</button> : role === 'member' ? <button type="button" className="kui-btn kui-btn--primary kui-btn--sm" onClick={onCompose}>发第一个帖子</button> : undefined}>
                  {filtered ? '换一个筛选条件试试。' : '对规则有想法、评审时遇到了拿不准的情况，都可以拿到这里来说。正式和资深委员可以发起提案和讨论。'}
                </StateBlock>
              ) : (
                <>
                  <ul className="kjr-hall-list" aria-label="帖子列表">
                    {items.map((post) => <PostRow key={post.id} post={post} onOpen={onOpen} />)}
                  </ul>
                  <Pager total={query.data.total} limit={PAGE_SIZE} offset={list.offset} busy={query.isPlaceholderData} onChange={(offset) => onListChange({ ...list, offset })} />
                </>
              )}
          </Card>
        </div>
        <aside className="kjr-hall-side">
          <HallGuide />
        </aside>
      </div>
    </SectionFrame>
  );
}
