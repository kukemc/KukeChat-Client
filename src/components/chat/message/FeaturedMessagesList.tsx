import { useState } from 'react';
import { featuredLimitOf, useFeaturedPages, useGroupPlusInfo, useRemoveFeaturedById } from '@/components/groupPlus/data';
import { useGroupPlusUi } from '@/components/groupPlus/ui';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { ModalStatus } from '@/components/ui/desktop/Modal';
import { toast } from '@/components/ui/toast';
import { useKukeStore } from '@/store/kukeStore';
import type { Message } from '@/types/api';
import type { FeaturedMessageEntry } from '@/types/groupPlus';
import { MessageView } from './MessageView';
import { formatMessageTime, messageSenderLabel } from './messageMeta';

export interface FeaturedMessagesListProps {
  conversationId: number;
  canManage: boolean;
  isToggling: boolean;
  /** 原消息还在时的取消精华（和聊天里的菜单是同一个动作，会同步消息上的 featured 标记） */
  onToggleFeature: (message: Message) => void;
  onOpenForwardBundle: (message: Message) => void;
  onOpenImages?: (images: string[], index: number) => void;
  /** 跳转到原消息、或者点卡片去了别的页面（帖子、名片、群聊……）之后，关掉精华面板 */
  onJumped: () => void;
  mobile?: boolean;
}

/** 超过这个字数的文字在列表里折叠，给「查看全文」 */
const LONG_TEXT = 80;

/**
 * 精华列表（桌面对话框和手机整页共用，只有外框不同）。
 *
 * 数据是后端的永久精华：设为精华时已经把内容、发送人、时间固化成快照，原消息被修剪、发送人改名都不影响这里。
 * 所以这里不依赖原消息还在不在：message_exists 只决定「能不能跳转」和「用哪个接口取消」。
 * 顶部的「已用 / 上限」来自群档位详情；权益过期后用量可能超过上限，已有精华保留，只是不能再新增。
 */
export function FeaturedMessagesList({ conversationId, canManage, isToggling, onToggleFeature, onOpenForwardBundle, onOpenImages, onJumped, mobile = false }: FeaturedMessagesListProps): JSX.Element {
  const pages = useFeaturedPages(conversationId);
  const info = useGroupPlusInfo(conversationId).data ?? null;
  const removeById = useRemoveFeaturedById(conversationId);
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set());
  const entries: FeaturedMessageEntry[] = pages.data?.pages.flatMap((page) => page.items) ?? [];
  const total = pages.data?.pages[0]?.total ?? entries.length;

  const used = info?.usage.featured_count ?? total;
  const limit = info?.limits.featured_limit ?? null;
  const over = limit !== null && used > limit;
  const full = limit !== null && used >= limit;
  const percent = limit && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  function toggleExpanded(id: number): void {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function jump(entry: FeaturedMessageEntry): void {
    if (entry.message_id === null) {
      return;
    }
    useKukeStore.getState().requestJumpToMessage(conversationId, entry.message_id);
    onJumped();
  }

  function remove(entry: FeaturedMessageEntry): void {
    if (entry.message_exists && entry.message_id !== null) {
      onToggleFeature(entry.message);
      return;
    }
    // 原消息已经被修剪：只能按精华 id 取消
    removeById.mutate(entry.id, {
      onError: (error) => {
        const limitInfo = featuredLimitOf(error);
        toast.show({ tone: 'error', message: limitInfo ? '精华数量已达上限。' : error instanceof Error && error.message ? error.message : '取消精华失败，请稍后重试。' });
      }
    });
  }

  const busy = isToggling || removeById.isPending;

  const quota = (
    <div className={`kfm-head${full ? ' is-full' : ''}`}>
      <div className="kfm-head-row">
        <span className="kfm-count"><b>{used}</b> 条精华{limit !== null ? <small>上限 {limit}</small> : null}</span>
        {info && info.can_purchase && full ? (
          <button type="button" className="kfm-upgrade" onClick={() => useGroupPlusUi.getState().openUpgrade({ conversationId, reason: 'featured' })}>升级存更多</button>
        ) : null}
      </div>
      {limit !== null ? <div className="kfm-bar" role="progressbar" aria-valuemin={0} aria-valuemax={limit} aria-valuenow={Math.min(used, limit)} aria-label="精华用量"><span style={{ width: `${Math.max(percent, used > 0 ? 1 : 0)}%` }} /></div> : null}
      {over ? <p className="kfm-hint">已超出当前上限，已有精华保留，不能再新增。续费或升级后可继续添加。</p> : full ? <p className="kfm-hint">精华已达上限，不能再设置新的精华。</p> : null}
    </div>
  );

  const loadMore = pages.hasNextPage ? (
    <button type="button" className="kfm-more" disabled={pages.isFetchingNextPage} onClick={() => void pages.fetchNextPage()}>
      {pages.isFetchingNextPage ? '加载中…' : '加载更多精华'}
    </button>
  ) : null;

  let state: JSX.Element | null = null;
  if (pages.isLoading) {
    state = <ModalStatus>正在加载精华消息…</ModalStatus>;
  } else if (pages.error) {
    state = (
      <div className="kui-empty">
        <ModalStatus tone="error">精华消息加载失败，请稍后重试。</ModalStatus>
        <button type="button" className="kui-btn kui-btn--ghost kui-btn--sm" onClick={() => void pages.refetch()}>重试</button>
      </div>
    );
  } else if (entries.length === 0) {
    state = (
      <div className="kui-empty kmd-empty">
        <Icon name="star" className="h-7 w-7" />
        <strong>暂无精华消息</strong>
        <span>群主或管理员设为精华的消息会永久保存在这里。</span>
      </div>
    );
  }

  const items = entries.map((entry) => {
    const message = entry.message;
    const isLong = message.type === 'text' && message.content.length > LONG_TEXT;
    const canFull = !entry.recalled && !entry.snapshot_missing && (isLong || !entry.message_exists);
    const open = expanded.has(entry.id);
    const setter = entry.set_by?.nickname || entry.set_by?.username;
    const body = entry.recalled ? (
      <span className="kmv-notice">消息已撤回</span>
    ) : entry.snapshot_missing ? (
      <span className="kmv-notice">原消息已被清理，内容无法恢复</span>
    ) : (
      <MessageView message={message} variant={open ? 'full' : 'compact'} conversationId={conversationId} onOpenImages={onOpenImages} onOpenBundle={onOpenForwardBundle} onNavigate={onJumped} />
    );
    const name = messageSenderLabel(message);
    const actions = (
      <div className="kfm-actions">
        {entry.message_exists && entry.message_id !== null && !entry.recalled ? <button type="button" className="kfm-btn" onClick={() => jump(entry)}>跳转到原消息</button> : null}
        {canFull ? <button type="button" className="kfm-btn" onClick={() => toggleExpanded(entry.id)}>{open ? '收起' : '查看全文'}</button> : null}
        {canManage ? <button type="button" className="kfm-btn kfm-btn--danger" disabled={busy} onClick={() => remove(entry)}>移出精华</button> : null}
      </div>
    );
    // 一条精华一张卡片：头像、发送人和时间，操作靠右；内容和名字对齐；最下面一行是谁设的精华
    return (
      <article key={entry.id} className={`kfm-card${entry.recalled || entry.snapshot_missing ? ' is-dim' : ''}`}>
        <header className="kfm-card-head">
          <Avatar user={message.sender} label={name} size="sm" />
          <span className="kfm-who"><b>{name}</b><time>{formatMessageTime(message.created_at)}</time></span>
          {mobile ? null : actions}
        </header>
        <div className="kfm-card-body">{body}</div>
        <footer className="kfm-card-foot">
          <span><Icon name="star" className="h-3 w-3" />{setter ? `${setter} 设为精华` : '设为精华'} · {formatMessageTime(entry.created_at)}</span>
          {mobile ? actions : null}
        </footer>
      </article>
    );
  });

  return (
    <div className={`kfm${mobile ? ' kfm--mobile' : ''}`}>
      {quota}
      {state}
      {items.length > 0 ? <div className="kfm-list">{items}</div> : null}
      {removeById.error ? <ModalStatus tone="error">取消精华失败，请稍后重试。</ModalStatus> : null}
      {loadMore}
    </div>
  );
}
