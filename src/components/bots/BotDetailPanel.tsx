import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createBotReviewReply, deleteBot, getBot, getBotReviews, installBot, rotateBotKey, toggleBotReviewLike, toggleBotReviewReplyLike, upsertBotReview } from '@/api/bots';
import { createDirectConversation } from '@/api/conversations';
import { shareBotToConversation } from '@/api/messages';
import { useKukeStore } from '@/store/kukeStore';
import type { Bot, BotReview, BotReviewReply, BotShareCardMetadata, Conversation, MessageMetadata, User } from '@/types/api';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { MobileStatusBar } from '@/components/mobile/MobileChrome';

interface BotDetailPanelProps {
  botId: number;
  conversations: Conversation[];
  onBack?: () => void;
  onDashboard?: (botId: number) => void;
  onEdit: (bot: Bot) => void;
  onDeleted: () => void;
  onKey: (key: string) => void;
  isMobile?: boolean;
  onOpenMobileConversation?: (conversationId: number, conversation?: Conversation) => void;
  onOpenUserProfile?: (user: User | null | undefined, fallbackId: number) => void;
}

function botUser(bot: Bot): User {
  return bot.user ?? { id: bot.user_id, username: bot.name, nickname: bot.name, avatar_url: bot.avatar_url, is_bot: true };
}

function userName(user?: User | null): string {
  return user?.nickname || user?.username || (user?.id ? `用户 ${user.id}` : '用户');
}

function groupTitle(conversation: Conversation): string {
  return conversation.display_title?.trim() || conversation.title?.trim() || `群聊 ${conversation.id}`;
}

function lines(value?: string | null): string[] {
  return (value ?? '').split('\n').map((item) => item.trim()).filter(Boolean);
}


function conversationTitle(conversation: Conversation, currentUser?: User | null): string {
  if (conversation.type === 'group') {
    return conversation.display_title?.trim() || conversation.title?.trim() || `群聊 ${conversation.id}`;
  }
  const other = conversation.direct_user ?? conversation.members?.find((member) => member.user_id !== currentUser?.id)?.user;
  return conversation.display_title?.trim() || other?.nickname || other?.username || conversation.title || '私聊';
}


function botShareMetadata(bot: Bot): MessageMetadata {
  const card: BotShareCardMetadata = {
    type: 'bot',
    bot_id: bot.id,
    user_id: bot.user_id,
    name: bot.name,
    avatar_url: bot.avatar_url ?? null,
    description: bot.description ?? null,
    commands: bot.commands ?? null,
    rating_average: bot.rating_average ?? null,
    review_count: bot.review_count ?? 0,
    install_count: bot.install_count ?? 0,
    online: Boolean(bot.online)
  };
  return { share_card: card };
}

function formatDate(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '请求失败，请稍后再试';
}


function clampRating(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(5, value));
}


function ratingLabel(value: number): string {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
}


function StarShape({ className = '' }: { className?: string }): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M12 2.4l2.86 5.8 6.4.93-4.63 4.51 1.09 6.37L12 17l-5.72 3.01 1.09-6.37-4.63-4.51 6.4-.93L12 2.4z" />
    </svg>
  );
}


function StarRating({ value, size = 'sm' }: { value: number; size?: 'sm' | 'md' | 'lg' }): JSX.Element {
  const normalized = clampRating(value);
  const sizeClass = size === 'lg' ? 'h-7 w-7' : size === 'md' ? 'h-5 w-5' : 'h-4 w-4';
  return (
    <span className="inline-flex items-center gap-1 leading-none" aria-label={`${ratingLabel(normalized)} 分`}>
      {[1, 2, 3, 4, 5].map((item) => {
        const fill = Math.max(0, Math.min(1, normalized - item + 1)) * 100;
        return (
          <span key={item} className={`relative inline-grid shrink-0 place-items-center ${sizeClass}`} aria-hidden="true">
            <StarShape className="h-full w-full fill-slate-300/80 dark:fill-white/20" />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill}%` }}>
              <StarShape className={`${sizeClass} fill-[#ffb300] drop-shadow-[0_1px_0_rgba(0,0,0,0.18)] dark:drop-shadow-[0_0_10px_rgba(255,179,0,0.22)]`} />
            </span>
          </span>
        );
      })}
    </span>
  );
}


function RatingInput({ value, onChange }: { value: number; onChange: (value: number) => void }): JSX.Element {
  return (
    <div className="kc-mobile-bot-rating-input relative inline-flex h-16 items-center rounded-[22px] border px-4 shadow-inner [background:var(--kc-panel-muted)] [border-color:var(--kc-border)]" role="radiogroup" aria-label="我的评分">
      <StarRating value={value} size="lg" />
      <div className="absolute inset-x-4 inset-y-0 grid grid-cols-10">
        {Array.from({ length: 10 }, (_, index) => {
          const score = (index + 1) / 2;
          return (
            <button
              key={score}
              type="button"
              aria-label={`${ratingLabel(score)} 分`}
              aria-checked={value === score}
              role="radio"
              onClick={() => onChange(score)}
              className="h-full min-w-0 cursor-pointer rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#168bff]"
            />
          );
        })}
      </div>
    </div>
  );
}


function BotReviewComment({ botId, review, currentUser, nestedReply, onChanged }: { botId: number; review: BotReview; currentUser: User; nestedReply?: BotReviewReply; onChanged: () => void }): JSX.Element {
  const queryClient = useQueryClient();
  const openUserSpace = useKukeStore((state) => state.openUserSpace);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const isReply = Boolean(nestedReply);
  const item = nestedReply ?? review;
  const moderationStatus = item.moderation_status ?? 'approved';
  const author = item.user;
  const authorName = userName(author);
  const likeMutation = useMutation({
    mutationFn: () => isReply ? toggleBotReviewReplyLike(botId, review.id, item.id) : toggleBotReviewLike(botId, review.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bots', botId, 'reviews'] });
      onChanged();
    }
  });
  const replyMutation = useMutation({
    mutationFn: () => createBotReviewReply(botId, review.id, { content: replyContent.trim(), parent_id: isReply ? item.id : null }),
    onSuccess: () => {
      setReplyContent('');
      setReplyOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['bots', botId, 'reviews'] });
      onChanged();
    }
  });

  return (
    <div className={`${isReply ? 'py-2' : 'border-b py-3 last:border-b-0 [border-color:var(--kc-border)]'} flex items-start gap-3`}>
      <button type="button" onClick={() => openUserSpace(item.user_id)} className={`${isReply ? 'mt-1' : 'mt-0.5'} shrink-0 rounded-full`}>
        <Avatar user={author ?? { id: item.user_id, username: `用户 ${item.user_id}` }} size={isReply ? 'sm' : 'md'} />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <button type="button" onClick={() => openUserSpace(item.user_id)} className={`${isReply ? 'text-[13px]' : 'text-sm'} max-w-full truncate text-left font-bold [color:var(--kc-text)] hover:[color:var(--kc-accent)]`}>{authorName}</button>
          {isReply && nestedReply?.parent_author ? <><span className="text-xs font-semibold [color:var(--kc-muted)]">回复</span><span className="max-w-[180px] truncate text-xs font-bold [color:var(--kc-accent)]">@{userName(nestedReply.parent_author)}</span></> : null}
          {!isReply ? <StarRating value={review.rating} /> : null}
          {moderationStatus === 'pending' ? <span className="rounded-full px-2 py-0.5 text-[11px] font-bold text-amber-700 [background:#fff7d6]">审核中</span> : null}
          {moderationStatus === 'rejected' ? <span className="rounded-full px-2 py-0.5 text-[11px] font-bold text-red-600 [background:#fee2e2]">未通过</span> : null}
        </div>
        <p className="kc-mobile-bot-review-content mt-1 select-text whitespace-pre-wrap break-words text-[14px] leading-6 [color:var(--kc-text)]">{item.content || (isReply ? '' : '这个用户只留下了评分。')}</p>
        <div className={`${isReply ? 'mt-1.5' : 'mt-2'} flex flex-wrap items-center gap-3 text-xs font-semibold [color:var(--kc-muted)]`}>
          <span>{formatDate(item.updated_at || item.created_at) || formatDate(item.created_at)}</span>
          <button type="button" onClick={() => likeMutation.mutate()} disabled={likeMutation.isPending} className={`inline-flex items-center gap-1 hover:text-rose-500 disabled:opacity-50 ${item.liked_by_me ? 'text-rose-500' : ''}`}><Icon name="like" className="h-3.5 w-3.5" /> {item.like_count || 0}</button>
          <button type="button" onClick={() => setReplyOpen((open) => !open)} className="hover:[color:var(--kc-accent)]">回复</button>
        </div>
        {replyOpen ? (
          <div className="mt-3 rounded-2xl border p-2 [background:var(--kc-panel-muted)] [border-color:var(--kc-border)]">
            <div className="mb-2 flex items-center justify-between gap-2 px-1 text-xs font-semibold [color:var(--kc-muted)]"><span className="truncate">回复 <span className="font-bold [color:var(--kc-accent)]">@{authorName}</span></span><button type="button" onClick={() => { setReplyOpen(false); setReplyContent(''); }} className="shrink-0 hover:[color:var(--kc-text)]">取消</button></div>
            <div className="flex min-w-0 items-center gap-2">
              <input value={replyContent} onChange={(event) => setReplyContent(event.target.value)} maxLength={500} placeholder={`回复 ${authorName}...`} className="h-9 w-full min-w-0 rounded-xl border px-3 text-sm outline-none [background:var(--kc-panel)] [border-color:var(--kc-border)] focus:[border-color:var(--kc-accent)]" />
              <button type="button" onClick={() => replyMutation.mutate()} disabled={!replyContent.trim() || replyMutation.isPending} className="shrink-0 rounded-xl bg-[#168bff] px-3 py-1.5 text-sm font-bold text-white disabled:bg-slate-200 disabled:text-slate-400">{replyMutation.isPending ? '发送中' : '发送'}</button>
            </div>
            {replyMutation.error ? <p className="mt-2 px-1 text-xs font-semibold text-red-600">{errorMessage(replyMutation.error)}</p> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}


function BotReviewThread({ botId, review, currentUser, onChanged }: { botId: number; review: BotReview; currentUser: User; onChanged: () => void }): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const replies = review.replies ?? [];
  const visibleReplies = expanded ? replies : replies.slice(0, 2);
  return (
    <div>
      <BotReviewComment botId={botId} review={review} currentUser={currentUser} onChanged={onChanged} />
      {replies.length ? (
        <div className="-mt-1 mb-2 ml-[52px] rounded-[18px] px-3 py-1.5 [background:color-mix(in_srgb,var(--kc-panel-muted)_42%,var(--kc-panel)_58%)]">
          {visibleReplies.map((reply) => <BotReviewComment key={reply.id} botId={botId} review={review} currentUser={currentUser} nestedReply={reply} onChanged={onChanged} />)}
          {replies.length > 2 ? <button type="button" onClick={() => setExpanded((value) => !value)} className="mb-1 ml-10 mt-1 text-xs font-semibold [color:var(--kc-muted)] hover:[color:var(--kc-accent)]">{expanded ? '收起回复' : `共${replies.length}条回复，点击查看`}</button> : null}
        </div>
      ) : null}
    </div>
  );
}

export function BotDetailPanel({ botId, conversations, onBack, onDashboard, onEdit, onDeleted, onKey, isMobile = false, onOpenMobileConversation, onOpenUserProfile }: BotDetailPanelProps): JSX.Element {
  const queryClient = useQueryClient();
  const currentUser = useKukeStore((state) => state.currentUser);
  const openUserSpace = useKukeStore((state) => state.openUserSpace);
  const setActiveConversationId = useKukeStore((state) => state.setActiveConversationId);
  const [rating, setRating] = useState(5);
  const [content, setContent] = useState('');
  const [installGroupId, setInstallGroupId] = useState(0);
  const [installSelectOpen, setInstallSelectOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareTargetId, setShareTargetId] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [ownerActionsOpen, setOwnerActionsOpen] = useState(false);

  const botQuery = useQuery({ queryKey: ['bots', 'detail', botId], queryFn: () => getBot(botId) });
  const reviewsQuery = useQuery({ queryKey: ['bots', botId, 'reviews'], queryFn: () => getBotReviews(botId) });
  const bot = botQuery.data;
  const isOwner = Boolean(bot && currentUser?.id === bot.owner_id);
  const manageableGroups = useMemo(() => conversations.filter((conversation) => conversation.type === 'group' && (conversation.my_role === 'owner' || conversation.my_role === 'admin')), [conversations]);

  useEffect(() => {
    if (!bot?.my_review) return;
    setRating(bot.my_review.rating);
    setContent(bot.my_review.content ?? '');
  }, [bot?.my_review]);

  useEffect(() => {
    setInstallGroupId(manageableGroups[0]?.id ?? 0);
  }, [manageableGroups]);

  useEffect(() => {
    setShareTargetId(conversations[0]?.id ?? 0);
  }, [conversations]);

  useEffect(() => {
    setOwnerActionsOpen(false);
  }, [botId]);

  const reviewMutation = useMutation({
    mutationFn: () => upsertBotReview(botId, { rating, content: content.trim() || null }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bots', 'detail', botId] });
      void queryClient.invalidateQueries({ queryKey: ['bots', botId, 'reviews'] });
      void queryClient.invalidateQueries({ queryKey: ['bots'] });
    }
  });

  const rotateMutation = useMutation({
    mutationFn: () => rotateBotKey(botId),
    onSuccess: (result) => onKey(result.key)
  });

  const installMutation = useMutation({
    mutationFn: () => installBot(botId, { conversation_id: installGroupId, receive_messages: true, receive_member_events: true }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['conversation-bots'] });
      void queryClient.invalidateQueries({ queryKey: ['conversation-members'] });
      void queryClient.invalidateQueries({ queryKey: ['conversation-members-page'] });
    }
  });

  const shareMutation = useMutation({
    mutationFn: () => {
      if (!bot || !shareTargetId) {
        throw new Error('请选择要发送的会话');
      }
      const content = `[机器人] ${bot.name}：${bot.description?.trim() || '这个机器人还没有写介绍'}`.slice(0, 500);
      return shareBotToConversation(shareTargetId, content, botShareMetadata(bot));
    },
    onSuccess: () => {
      setShareOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['messages', shareTargetId] });
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    }
  });

  const directMutation = useMutation({
    mutationFn: () => {
      if (!bot) {
        throw new Error('机器人不存在');
      }
      return createDirectConversation({ user_id: bot.user_id, temporary: true });
    },
    onSuccess: (conversation) => {
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      if (isMobile && onOpenMobileConversation) {
        onOpenMobileConversation(conversation.id, conversation);
        return;
      }
      setActiveConversationId(conversation.id);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteBot(botId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bots'] });
      void queryClient.invalidateQueries({ queryKey: ['conversation-bots'] });
      void queryClient.invalidateQueries({ queryKey: ['conversation-members'] });
      onDeleted();
    }
  });

  if (botQuery.isLoading || !bot) {
    return <div className="grid h-full place-items-center [background:var(--kc-chat)]"><div className="h-40 w-72 animate-pulse rounded-[28px] [background:var(--kc-panel-muted)]" /></div>;
  }

  const reviewError = reviewMutation.error ?? rotateMutation.error ?? installMutation.error ?? shareMutation.error ?? directMutation.error ?? deleteMutation.error ?? botQuery.error ?? reviewsQuery.error;
  const commandLines = lines(bot.commands);
  const functionLines = lines(bot.functions);
  const selectedGroup = manageableGroups.find((group) => group.id === installGroupId) ?? manageableGroups[0];
  const shareTarget = conversations.find((conversation) => conversation.id === shareTargetId) ?? conversations[0];
  const owner = bot.owner ?? { id: bot.owner_id, username: `用户 ${bot.owner_id}`, nickname: `用户 ${bot.owner_id}`, is_bot: false };

  function openOwnerProfile(): void {
    if (isMobile && onOpenUserProfile) {
      onOpenUserProfile(owner, owner.id);
      return;
    }
    openUserSpace(owner.id);
  }

  if (isMobile) {
    return (
      <section className="kc-qq-page flex h-full min-h-0 flex-col overflow-hidden [color:var(--kc-mobile-text,#111827)]">
        <MobileStatusBar />
        <header className="kc-qq-home-header kc-qq-sticky-home-header mx-4 shrink-0">
          <button type="button" onClick={onBack} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-[#526070] shadow-sm" aria-label="返回机器人列表"><Icon name="chevronLeft" className="h-5 w-5" /></button>
          <div className="min-w-0 text-center"><h1 className="truncate text-[17px] font-black [color:var(--kc-mobile-strong,#151922)]">{bot.name}</h1><p className="text-[11px] font-bold [color:var(--kc-mobile-muted,#8b95a5)]">机器人详情</p></div>
          <button type="button" onClick={() => setShareOpen(true)} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-[#526070] shadow-sm" aria-label="分享机器人"><Icon name="send" className="h-5 w-5" /></button>
        </header>
        <main className="scroll-soft min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(var(--kc-native-safe-bottom,env(safe-area-inset-bottom))+28px)] pt-3">
          {reviewError ? <p className="mb-3 rounded-[18px] bg-red-50 px-4 py-3 text-[13px] font-bold text-red-500">{errorMessage(reviewError)}</p> : null}
          <section className="kc-qq-card p-4">
            <div className="flex gap-3">
              <Avatar user={botUser(bot)} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2"><h2 className="truncate text-[20px] font-black [color:var(--kc-mobile-text,#111827)]">{bot.name}</h2><span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${bot.online ? 'bg-emerald-100 text-emerald-700' : '[background:var(--kc-mobile-card-muted,#f4f6fa)] [color:var(--kc-mobile-muted,#8b95a5)]'}`}>{bot.online ? '在线' : '离线'}</span></div>
                <p className="mt-1 text-[13px] font-semibold leading-5 [color:var(--kc-mobile-muted,#8b95a5)]">{bot.description || '这个机器人还没有写介绍'}</p>
              </div>
            </div>
            <button type="button" onClick={openOwnerProfile} className="mt-3 flex w-full min-w-0 items-center gap-2.5 rounded-[18px] px-3 py-2 text-left [background:var(--kc-mobile-card-muted,#f4f6fa)] active:scale-[0.99]">
              <Avatar user={owner} size="sm" />
              <span className="min-w-0 flex-1"><span className="block text-[11px] font-bold [color:var(--kc-mobile-muted,#8b95a5)]">创建者</span><span className="block truncate text-[13px] font-black [color:var(--kc-mobile-text,#111827)]">{userName(owner)}</span></span>
              <Icon name="chevron" className="h-4 w-4 shrink-0 [color:var(--kc-mobile-muted,#8b95a5)]" />
            </button>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px] font-bold [color:var(--kc-mobile-muted,#8b95a5)]">
              <div className="rounded-[16px] px-2 py-2 [background:var(--kc-mobile-card-muted,#f4f6fa)]"><p className="text-[17px] font-black [color:var(--kc-mobile-text,#111827)]">{bot.rating_average ? bot.rating_average.toFixed(1) : '-'}</p><p>评分</p></div>
              <div className="rounded-[16px] px-2 py-2 [background:var(--kc-mobile-card-muted,#f4f6fa)]"><p className="text-[17px] font-black [color:var(--kc-mobile-text,#111827)]">{bot.review_count ?? 0}</p><p>评论</p></div>
              <div className="rounded-[16px] px-2 py-2 [background:var(--kc-mobile-card-muted,#f4f6fa)]"><p className="text-[17px] font-black [color:var(--kc-mobile-text,#111827)]">{bot.install_count ?? 0}</p><p>群使用</p></div>
            </div>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => directMutation.mutate()} disabled={directMutation.isPending || bot.status === 'disabled'} className="h-11 flex-1 rounded-[18px] bg-[#168bff] text-[14px] font-black text-white disabled:opacity-50">私信</button>
              {isOwner ? <button type="button" onClick={() => onEdit(bot)} className="h-11 flex-1 rounded-[18px] text-[14px] font-black [background:var(--kc-accent-soft,#eaf4ff)] [color:var(--kc-accent,#168bff)]">编辑</button> : null}
            </div>
          </section>
          <section className="kc-qq-card mt-3 p-4"><h3 className="text-[16px] font-black [color:var(--kc-mobile-text,#111827)]">全部指令</h3>{commandLines.length ? <div className="mt-3 flex flex-wrap gap-2">{commandLines.map((command) => <span key={command} className="max-w-full truncate rounded-full px-3 py-1.5 font-mono text-[12px] font-bold [background:var(--kc-mobile-card-muted,#f4f6fa)] [color:var(--kc-mobile-muted,#526070)]">{command}</span>)}</div> : <p className="mt-3 text-[13px] font-semibold [color:var(--kc-mobile-muted,#8b95a5)]">暂无指令</p>}</section>
          <section className="kc-qq-card mt-3 p-4"><h3 className="text-[16px] font-black [color:var(--kc-mobile-text,#111827)]">功能说明</h3>{functionLines.length ? <ul className="mt-3 space-y-2 text-[13px] font-semibold leading-6 [color:var(--kc-mobile-muted,#8b95a5)]">{functionLines.map((line) => <li key={line}>• {line}</li>)}</ul> : <p className="mt-3 text-[13px] font-semibold [color:var(--kc-mobile-muted,#8b95a5)]">暂无功能说明</p>}</section>
          <section className="kc-qq-card kc-mobile-bot-install-card mt-3 p-4"><h3 className="text-[16px] font-black [color:var(--kc-mobile-text,#111827)]">添加到群聊</h3>{manageableGroups.length ? <><div className="scroll-soft mt-3 grid max-h-[34vh] gap-2 overflow-y-auto pr-1">{manageableGroups.map((group) => { const active = group.id === installGroupId; return <button key={group.id} type="button" onClick={() => setInstallGroupId(group.id)} className={`kc-mobile-bot-install-option flex items-center gap-2 rounded-[18px] px-3 py-2.5 text-left ${active ? 'is-selected [background:var(--kc-accent-soft,#eaf4ff)] [color:var(--kc-accent,#168bff)]' : '[background:var(--kc-mobile-card-muted,#f4f6fa)] [color:var(--kc-mobile-text,#111827)]'}`}><Avatar label={groupTitle(group)} avatarUrl={group.avatar_url} size="sm" /><span className="min-w-0 flex-1 truncate text-[13px] font-black">{groupTitle(group)}</span>{active ? <Icon name="check" className="h-4 w-4" /> : null}</button>; })}</div><button type="button" onClick={() => installMutation.mutate()} disabled={!installGroupId || installMutation.isPending || bot.status === 'disabled'} className="mt-3 h-11 w-full rounded-[18px] text-[14px] font-black text-white [background:var(--kc-accent,#168bff)] disabled:opacity-50">添加到群聊</button></> : <p className="mt-3 text-[13px] font-semibold leading-6 [color:var(--kc-mobile-muted,#8b95a5)]">只有你是群主或管理员的群聊才能添加机器人。</p>}</section>
          <section className="kc-qq-card kc-mobile-bot-comments mt-3 p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-[16px] font-black [color:var(--kc-mobile-text,#111827)]">评论区</h3>
              <span className="text-[12px] font-bold [color:var(--kc-mobile-muted,#8b95a5)]">{bot.review_count ?? 0} 条评论</span>
            </div>
            {!isOwner ? (
              <div className="mt-4 rounded-[22px] border p-3 [background:var(--kc-mobile-card-muted,#f4f6fa)] [border-color:var(--kc-mobile-border,rgba(15,23,42,.06))]">
                <p className="text-[13px] font-black [color:var(--kc-mobile-text,#111827)]">我的评分</p>
                <div className="mt-3 flex flex-wrap items-center gap-3"><RatingInput value={rating} onChange={setRating} /><span className="text-[13px] font-black text-amber-600">{ratingLabel(rating)} 分</span></div>
                <textarea value={content} onChange={(event) => setContent(event.target.value)} maxLength={500} placeholder="写下你的评价，可随时修改" className="mt-3 h-24 w-full resize-none rounded-[18px] border px-3 py-3 text-[14px] font-semibold leading-6 outline-none [background:var(--kc-mobile-card,#ffffff)] [border-color:var(--kc-mobile-border,rgba(15,23,42,.06))] [color:var(--kc-mobile-text,#111827)] placeholder:[color:var(--kc-mobile-muted,#8b95a5)] focus:[border-color:var(--kc-accent,#168bff)]" />
                <div className="mt-3 flex justify-end"><button type="button" onClick={() => reviewMutation.mutate()} disabled={reviewMutation.isPending} className="h-10 rounded-[16px] px-4 text-[13px] font-black text-white [background:var(--kc-accent,#168bff)] disabled:opacity-50">{bot.my_review ? '更新评论' : '发布评论'}</button></div>
              </div>
            ) : <p className="mt-3 rounded-[18px] px-4 py-3 text-[13px] font-semibold [background:var(--kc-mobile-card-muted,#f4f6fa)] [color:var(--kc-mobile-muted,#8b95a5)]">创建者不能给自己的机器人评分。</p>}
            <div className="mt-4 space-y-3">
              {currentUser && (reviewsQuery.data ?? []).length ? (reviewsQuery.data ?? []).map((review) => <BotReviewThread key={review.id} botId={botId} review={review} currentUser={currentUser} onChanged={() => { void queryClient.invalidateQueries({ queryKey: ['bots', 'detail', botId] }); }} />) : <p className="rounded-[18px] px-4 py-5 text-center text-[13px] font-semibold [background:var(--kc-mobile-card-muted,#f4f6fa)] [color:var(--kc-mobile-muted,#8b95a5)]">暂无评论</p>}
            </div>
          </section>
        </main>
      </section>
    );
  }

  return (
    <section className="scroll-soft h-full overflow-y-auto [background:var(--kc-chat)] [color:var(--kc-text)]">
      <div className="mx-auto max-w-5xl p-4 sm:p-6">
        <button type="button" onClick={onBack} className="ghost-button kc-message-enter mb-4 inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-bold"><Icon name="chevronLeft" className="h-4 w-4" />返回机器人广场</button>

        {reviewError ? <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{errorMessage(reviewError)}</div> : null}

        <header className="kc-message-enter relative z-30 rounded-[30px] border p-5 shadow-sm [background:var(--kc-panel)] [border-color:var(--kc-border)]" style={{ animationDelay: '40ms' }}>
          <div className="flex flex-col gap-5 md:flex-row md:items-start">
            <Avatar user={botUser(bot)} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-black">{bot.name}</h2>
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${bot.online ? 'bg-emerald-100 text-emerald-700' : '[background:var(--kc-panel-muted)] [color:var(--kc-muted)]'}`}>{bot.online ? '机器人在线' : '机器人离线'}</span>
                {bot.is_public ? <span className="rounded-full px-2.5 py-1 text-xs font-bold [background:var(--kc-accent-soft)] [color:var(--kc-accent)]">公开</span> : <span className="rounded-full px-2.5 py-1 text-xs font-bold [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">私有</span>}
                {bot.status === 'disabled' ? <span className="rounded-full px-2.5 py-1 text-xs font-bold [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">停用</span> : null}
              </div>
              <p className="mt-2 max-w-3xl whitespace-pre-wrap break-words text-sm leading-6 [color:var(--kc-muted)]">{bot.description || '这个机器人还没有写介绍'}</p>
              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm [color:var(--kc-muted)]">
                <span className="inline-flex items-center gap-1.5 font-bold [color:var(--kc-text)]">{bot.rating_average ? <StarRating value={bot.rating_average} /> : null}{bot.rating_average ? bot.rating_average.toFixed(1) : '暂无评分'}<span className="font-normal [color:var(--kc-muted)]">({bot.review_count ?? 0} 条评论)</span></span>
                <span>{bot.install_count ?? 0} 个群在使用</span>
                <span>更新于 {formatDate(bot.updated_at) || '未知'}</span>
                <button type="button" onClick={openOwnerProfile} className="inline-flex items-center gap-1.5 font-bold [color:var(--kc-accent)]"><Avatar user={owner} size="sm" />创建者：{userName(owner)}</button>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2 md:justify-end">
              <button type="button" onClick={() => directMutation.mutate()} disabled={directMutation.isPending || bot.status === 'disabled'} className="liquid-button inline-flex items-center gap-1.5 rounded-2xl px-4 py-2 text-sm font-black disabled:opacity-50"><Icon name="message" className="h-4 w-4" />私信</button>
              {isOwner ? (
                <>
                  {onDashboard ? <button type="button" onClick={() => onDashboard(bot.id)} className="inline-flex items-center gap-1.5 rounded-2xl border px-4 py-2 text-sm font-black transition [background:var(--kc-accent-soft)] [border-color:var(--kc-accent-soft)] [color:var(--kc-accent)] hover:brightness-95"><Icon name="blocks" className="h-4 w-4" />仪表盘</button> : null}
                  <div className="relative" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOwnerActionsOpen(false); }}>
                    <button type="button" onClick={() => setOwnerActionsOpen((open) => !open)} className="ghost-button inline-flex items-center gap-1.5 rounded-2xl border px-4 py-2 text-sm font-bold [border-color:var(--kc-border)]"><Icon name="more" className="h-4 w-4" />管理</button>
                    {ownerActionsOpen ? (
                      <div className="absolute right-0 top-[calc(100%+10px)] z-50 w-48 overflow-hidden rounded-2xl border p-1.5 shadow-[0_18px_48px_rgba(15,23,42,0.16)] [background:var(--kc-panel)] [border-color:var(--kc-border)]">
                        <button type="button" onClick={() => { setOwnerActionsOpen(false); setShareOpen(true); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-bold transition hover:[background:var(--kc-hover)]"><Icon name="share" className="h-4 w-4 [color:var(--kc-muted)]" />分享机器人</button>
                        <button type="button" onClick={() => { setOwnerActionsOpen(false); onEdit(bot); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-bold transition hover:[background:var(--kc-hover)]"><Icon name="edit" className="h-4 w-4 [color:var(--kc-muted)]" />编辑资料</button>
                        <button type="button" onClick={() => { setOwnerActionsOpen(false); rotateMutation.mutate(); }} disabled={rotateMutation.isPending} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-bold transition hover:[background:var(--kc-hover)] disabled:opacity-50"><Icon name="shield" className="h-4 w-4 [color:var(--kc-muted)]" />重置 Key</button>
                        <div className="my-1 h-px [background:var(--kc-border)]" />
                        <button type="button" onClick={() => { setOwnerActionsOpen(false); setConfirmDelete(true); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-black text-red-600 transition hover:bg-red-50"><Icon name="trash" className="h-4 w-4" />删除机器人</button>
                      </div>
                    ) : null}
                  </div>
                </>
              ) : (
                <button type="button" onClick={() => setShareOpen(true)} className="ghost-button inline-flex items-center gap-1.5 rounded-2xl border px-4 py-2 text-sm font-bold [border-color:var(--kc-border)]"><Icon name="share" className="h-4 w-4" />分享</button>
              )}
            </div>
          </div>
        </header>

        <div className="relative z-0 mt-4 grid gap-4 lg:grid-cols-[1fr_340px]">
          <main className="space-y-4">
            <section className="kc-message-enter rounded-[26px] border p-5 [background:var(--kc-panel)] [border-color:var(--kc-border)]" style={{ animationDelay: '90ms' }}>
              <h3 className="text-base font-black">全部指令</h3>
              {commandLines.length ? <div className="mt-3 flex flex-wrap gap-2">{commandLines.map((command) => <span key={command} className="max-w-full break-all rounded-full px-3 py-1.5 font-mono text-xs leading-5 [background:var(--kc-panel-muted)]">{command}</span>)}</div> : <p className="mt-3 text-sm [color:var(--kc-muted)]">暂无指令</p>}
            </section>

            <section className="kc-message-enter rounded-[26px] border p-5 [background:var(--kc-panel)] [border-color:var(--kc-border)]" style={{ animationDelay: '130ms' }}>
              <h3 className="text-base font-black">功能说明</h3>
              {functionLines.length ? <ul className="mt-3 space-y-2 text-sm leading-6 [color:var(--kc-muted)]">{functionLines.map((line) => <li key={line}>• {line}</li>)}</ul> : <p className="mt-3 text-sm [color:var(--kc-muted)]">暂无功能说明</p>}
            </section>

            <section className="kc-message-enter rounded-[26px] border p-5 [background:var(--kc-panel)] [border-color:var(--kc-border)]" style={{ animationDelay: '170ms' }}>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-black">评论区</h3>
                <span className="text-sm [color:var(--kc-muted)]">{bot.review_count ?? 0} 条评论</span>
              </div>
              {!isOwner ? (
                <div className="mt-4 rounded-2xl border p-4 [border-color:var(--kc-border)]">
                  <p className="text-sm font-bold">我的评分</p>
                  <div className="mt-3 flex flex-wrap items-center gap-3"><RatingInput value={rating} onChange={setRating} /><span className="text-sm font-bold text-amber-600">{ratingLabel(rating)} 分</span></div>
                  <textarea value={content} onChange={(event) => setContent(event.target.value)} maxLength={500} placeholder="写下你的评价，可随时修改" className="glass-input mt-3 h-24 w-full resize-none rounded-2xl px-4 py-3 text-sm leading-6 outline-none" />
                  <div className="mt-3 flex justify-end"><button type="button" onClick={() => reviewMutation.mutate()} disabled={reviewMutation.isPending} className="liquid-button rounded-2xl px-4 py-2 text-sm font-black disabled:opacity-50">{bot.my_review ? '更新评论' : '发布评论'}</button></div>
                </div>
              ) : <p className="mt-3 rounded-2xl px-4 py-3 text-sm [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">创建者不能给自己的机器人评分。</p>}

              <div className="mt-4 space-y-3">
                {currentUser && (reviewsQuery.data ?? []).length ? (reviewsQuery.data ?? []).map((review) => <BotReviewThread key={review.id} botId={botId} review={review} currentUser={currentUser} onChanged={() => { void queryClient.invalidateQueries({ queryKey: ['bots', 'detail', botId] }); }} />) : <p className="rounded-2xl px-4 py-5 text-center text-sm [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">暂无评论</p>}
              </div>
            </section>
          </main>

          <aside className="space-y-4">
            <section className="kc-message-enter rounded-[26px] border p-5 [background:var(--kc-panel)] [border-color:var(--kc-border)]" style={{ animationDelay: '210ms' }}>
              <h3 className="text-base font-black">添加到群聊</h3>
              {manageableGroups.length ? (
                <>
                  <div className="relative mt-3">
                    <button type="button" onClick={() => setInstallSelectOpen((open) => !open)} className="glass-input flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left text-sm outline-none transition hover:[background:var(--kc-hover)]">
                      <span className="flex min-w-0 items-center gap-2">
                        <Avatar label={groupTitle(selectedGroup)} avatarUrl={selectedGroup?.avatar_url} size="sm" />
                        <span className="truncate font-bold">{selectedGroup ? groupTitle(selectedGroup) : '选择群聊'}</span>
                      </span>
                      <Icon name="chevron" className={`h-4 w-4 shrink-0 transition ${installSelectOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {installSelectOpen ? (
                      <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-20 max-h-64 overflow-hidden rounded-2xl border shadow-[0_18px_48px_rgba(15,23,42,0.16)] [background:var(--kc-panel)] [border-color:var(--kc-border)]">
                        <div className="scroll-soft max-h-64 overflow-y-auto p-1.5">
                          {manageableGroups.map((group) => {
                            const active = group.id === installGroupId;
                            return (
                              <button key={group.id} type="button" onClick={() => { setInstallGroupId(group.id); setInstallSelectOpen(false); }} className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition ${active ? '[background:var(--kc-accent-soft)] [color:var(--kc-accent)]' : 'hover:[background:var(--kc-hover)]'}`}>
                                <Avatar label={groupTitle(group)} avatarUrl={group.avatar_url} size="sm" />
                                <span className="min-w-0 flex-1 truncate font-bold">{groupTitle(group)}</span>
                                {active ? <Icon name="check" className="h-4 w-4 shrink-0" /> : null}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <button type="button" onClick={() => installMutation.mutate()} disabled={!installGroupId || installMutation.isPending || bot.status === 'disabled'} className="liquid-button mt-3 w-full rounded-2xl px-4 py-2.5 text-sm font-black disabled:opacity-50">添加到群聊</button>
                </>
              ) : <p className="mt-3 text-sm leading-6 [color:var(--kc-muted)]">只有你是群主或管理员的群聊才能添加机器人。</p>}
            </section>
          </aside>
        </div>
      </div>

      {confirmDelete ? (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-black/35 p-4 backdrop-blur-sm">
          <div className="kc-message-enter w-full max-w-md rounded-[24px] border p-5 shadow-[0_24px_80px_rgba(15,23,42,0.22)] [background:var(--kc-panel)] [border-color:var(--kc-border)]">
            <h3 className="text-base font-black text-red-600">确认删除机器人？</h3>
            <p className="mt-3 text-sm leading-6 [color:var(--kc-muted)]">删除后机器人 Key 会失效，并会从所有已安装群聊中移出。历史消息会保留，但该机器人不能再被使用。</p>
            <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setConfirmDelete(false)} className="ghost-button rounded-2xl px-4 py-2 text-sm font-bold">取消</button><button type="button" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending} className="rounded-2xl bg-red-500 px-4 py-2 text-sm font-black text-white disabled:opacity-50">{deleteMutation.isPending ? '删除中...' : '确认删除'}</button></div>
          </div>
        </div>
      ) : null}

      {shareOpen ? (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-black/35 p-4 backdrop-blur-sm">
          <div className="kc-message-enter w-full max-w-lg rounded-[26px] border p-5 shadow-[0_24px_80px_rgba(15,23,42,0.22)] [background:var(--kc-panel)] [border-color:var(--kc-border)]">
            <div className="flex items-center justify-between gap-3"><h3 className="text-base font-black">分享机器人</h3><button type="button" onClick={() => setShareOpen(false)} className="grid h-9 w-9 place-items-center rounded-full transition hover:[background:var(--kc-hover)]"><Icon name="close" className="h-4 w-4" /></button></div>
            <p className="mt-2 text-sm [color:var(--kc-muted)]">选择一个群聊或好友，发送机器人名片。对方点击名片即可打开详情页。</p>
            <div className="mt-4 rounded-2xl border p-2 [background:var(--kc-panel-muted)] [border-color:var(--kc-border)]">
              <div className="scroll-soft max-h-72 space-y-1 overflow-y-auto">
                {conversations.length === 0 ? <p className="px-3 py-5 text-center text-sm [color:var(--kc-muted)]">暂无可分享的会话</p> : null}
                {conversations.map((conversation) => {
                  const active = conversation.id === shareTargetId;
                  const title = conversationTitle(conversation, currentUser);
                  return (
                    <button key={conversation.id} type="button" onClick={() => setShareTargetId(conversation.id)} className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition ${active ? '[background:var(--kc-accent-soft)] [color:var(--kc-accent)]' : 'hover:[background:var(--kc-hover)]'}`}>
                      <Avatar label={title} avatarUrl={conversation.avatar_url ?? conversation.direct_user?.avatar_url} size="sm" />
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{title}</span><span className="mt-0.5 block text-xs [color:var(--kc-muted)]">{conversation.type === 'group' ? `群聊 · ${conversation.member_count ?? 0} 人` : '好友/私聊'}</span></span>
                      {active ? <Icon name="check" className="h-4 w-4 shrink-0" /> : null}
                    </button>
                  );
                })}
              </div>
            </div>
            {shareTarget ? <p className="mt-3 text-xs [color:var(--kc-muted)]">将发送到：{conversationTitle(shareTarget, currentUser)}</p> : null}
            <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setShareOpen(false)} className="ghost-button rounded-2xl px-4 py-2 text-sm font-bold">取消</button><button type="button" onClick={() => shareMutation.mutate()} disabled={!shareTargetId || shareMutation.isPending} className="liquid-button rounded-2xl px-4 py-2 text-sm font-black disabled:opacity-50">{shareMutation.isPending ? '发送中...' : '发送名片'}</button></div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
