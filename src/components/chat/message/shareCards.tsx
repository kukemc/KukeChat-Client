import { useMutation, useQueryClient } from '@tanstack/react-query';
import { acceptInvite } from '@/api/invites';
import { useKukeStore } from '@/store/kukeStore';
import type { BotShareCardMetadata, Conversation, GroupShareCardMetadata, Message, PostShareCardMetadata, TeamupShareCardMetadata, TeamupSkill, UserShareCardMetadata } from '@/types/api';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { toast } from '@/components/ui/toast';
import { resolveThumbnailUrl } from '@/utils/assetUrl';
import { FORWARD_PREVIEW_LIMIT } from './constants';
import { parseForwardBundle, snapshotPreview } from './messageMeta';
import { CcwCreationCards } from './messageText';

export function ForwardBundleCard({ message, onOpen }: { message: Message; onOpen: () => void }): JSX.Element {
  const bundle = parseForwardBundle(message);
  const previews = bundle.snapshots.slice(0, FORWARD_PREVIEW_LIMIT);

  return (
    <button type="button" onClick={onOpen} className="block w-72 max-w-full overflow-hidden rounded-2xl border p-0 text-left shadow-none transition hover:-translate-y-0.5 hover:shadow-sm [background:var(--kc-panel)] [border-color:var(--kc-border)]">
      <div className="px-3.5 py-3">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl [background:var(--kc-accent-soft)] [color:var(--kc-accent)]">
            <Icon name="message" className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold [color:var(--kc-text)]">{bundle.title}</p>
            {bundle.note ? <p className="mt-0.5 truncate text-xs [color:var(--kc-muted)]">{bundle.note}</p> : null}
          </div>
        </div>
        <div className="mt-3 grid gap-1.5">
          {previews.length > 0 ? previews.map((snapshot, index) => (
            <p key={`${snapshot.id ?? index}-${snapshot.senderName}`} className="truncate text-xs [color:var(--kc-muted)]">
              <span className="font-semibold [color:var(--kc-text)]">{snapshot.senderName}：</span>{snapshotPreview(snapshot)}
            </p>
          )) : <p className="text-xs [color:var(--kc-muted)]">暂无可预览内容</p>}
        </div>
      </div>
      <div className="flex items-center justify-between border-t px-3.5 py-2 text-xs [border-color:var(--kc-border)] [color:var(--kc-muted)]">
        <span>查看{bundle.count || bundle.snapshots.length}条转发消息</span>
        <Icon name="chevron" className="h-3.5 w-3.5" />
      </div>
    </button>
  );
}

export function GroupShareCardPreview({ card }: { card: GroupShareCardMetadata }): JSX.Element {
  return (
    <div className="w-72 max-w-full overflow-hidden rounded-2xl border text-left [background:var(--kc-panel)] [border-color:var(--kc-border)]">
      <div className="flex items-center gap-3 p-3.5">
        <GroupShareAvatar card={card} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold [color:var(--kc-text)]">{card.title}</p>
          <p className="mt-0.5 truncate text-xs [color:var(--kc-muted)]">群号 {card.conversation_id} · {card.member_count ?? 0} 人</p>
        </div>
      </div>
      <div className="border-t px-3.5 py-2 text-xs [border-color:var(--kc-border)] [color:var(--kc-muted)]">群聊名片</div>
    </div>
  );
}

export function GroupShareAvatar({ card }: { card: GroupShareCardMetadata }): JSX.Element {
  const avatarSrc = resolveThumbnailUrl(card.avatar_url);
  if (avatarSrc) {
    return <img src={avatarSrc} alt={card.title} className="h-11 w-11 shrink-0 rounded-2xl border object-cover [border-color:var(--kc-border)]" />;
  }
  return <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border text-base font-black [background:var(--kc-accent-soft)] [border-color:var(--kc-border)] [color:var(--kc-accent)]">{card.title.trim().slice(0, 1) || '群'}</div>;
}

export function PostShareCardPreview({ card }: { card: PostShareCardMetadata }): JSX.Element {
  const imageUrl = card.image_urls?.[0];
  const imageSrc = resolveThumbnailUrl(imageUrl);
  const hasContent = Boolean(card.content?.trim());
  return (
    <div className="w-[min(300px,72vw)] max-w-full overflow-hidden rounded-[22px] border text-left shadow-none [background:var(--kc-panel)] [border-color:rgba(148,163,184,0.28)]">
      <div className="flex items-center gap-2.5 px-3.5 pb-2 pt-3.5">
        <Avatar user={null} label={card.author_name} avatarUrl={card.author_avatar_url} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold [color:var(--kc-text)]">{card.author_name} 的动态</p>
          <p className="mt-0.5 truncate text-xs [color:var(--kc-muted)]">分享自动态</p>
        </div>
      </div>
      <div className="px-3.5 pb-3">
        <div className="min-w-0 overflow-hidden rounded-2xl px-3 py-2.5 [background:var(--kc-panel-muted)]">
          {hasContent ? <><p className="line-clamp-3 whitespace-pre-wrap break-words text-sm leading-6 [color:var(--kc-text)]">{card.content}</p><CcwCreationCards previews={card.ccw_creations} compact /></> : <p className="text-sm leading-6 [color:var(--kc-muted)]">分享了一条图片动态</p>}
          {imageSrc ? <img src={imageSrc} alt="动态图片" className="mt-2 h-24 w-full rounded-xl object-cover" /> : null}
        </div>
      </div>
      <div className="flex items-center justify-between border-t px-3.5 py-2 text-xs [border-color:rgba(148,163,184,0.22)] [color:var(--kc-muted)]">
        <span>动态空间</span>
        <Icon name="chevron" className="h-4 w-4" />
      </div>
    </div>
  );
}

export function PostShareCard({ card, onOpenPost }: { card: PostShareCardMetadata; onOpenPost?: (postId: number) => void }): JSX.Element {
  const openPost = useKukeStore((state) => state.openPost);
  return (
    <button type="button" onClick={() => onOpenPost ? onOpenPost(card.post_id) : openPost(card.post_id)} className="mt-1 block max-w-full cursor-pointer rounded-[22px] text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-200">
      <PostShareCardPreview card={card} />
    </button>
  );
}

export function BotShareAvatar({ card }: { card: BotShareCardMetadata }): JSX.Element {
  const avatar = resolveThumbnailUrl(card.avatar_url);
  if (avatar) {
    return <img src={avatar} alt={card.name} className="h-12 w-12 shrink-0 rounded-2xl border object-cover [border-color:var(--kc-border)]" />;
  }
  return <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border text-base font-black [background:var(--kc-accent-soft)] [border-color:var(--kc-border)] [color:var(--kc-accent)]">{card.name.trim().slice(0, 1) || '机'}</span>;
}

export function BotShareCardPreview({ card }: { card: BotShareCardMetadata }): JSX.Element {
  const commands = (card.commands ?? '').split('\n').map((item) => item.trim()).filter(Boolean).slice(0, 2);
  return (
    <div className="w-[min(320px,74vw)] max-w-full overflow-hidden rounded-[22px] border text-left shadow-none [background:var(--kc-panel)] [border-color:rgba(148,163,184,0.28)]">
      <div className="flex items-center gap-3 px-3.5 pb-2 pt-3.5">
        <BotShareAvatar card={card} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2"><p className="truncate text-sm font-black [color:var(--kc-text)]">{card.name}</p><span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${card.online ? 'bg-emerald-100 text-emerald-700' : '[background:var(--kc-panel-muted)] [color:var(--kc-muted)]'}`}>{card.online ? '在线' : '离线'}</span></div>
          <p className="mt-0.5 truncate text-xs [color:var(--kc-muted)]">{card.install_count ?? 0} 个群在使用 · {card.rating_average ? `${card.rating_average.toFixed(1)} 分` : '暂无评分'}</p>
        </div>
      </div>
      <div className="px-3.5 pb-3">
        <div className="min-w-0 overflow-hidden rounded-2xl px-3 py-2.5 [background:var(--kc-panel-muted)]">
          <p className="line-clamp-2 break-words text-sm leading-6 [color:var(--kc-text)]">{card.description?.trim() || '这个机器人还没有写介绍'}</p>
          {commands.length ? <div className="mt-2 flex gap-1.5 overflow-hidden">{commands.map((command) => <span key={command} className="max-w-[120px] truncate rounded-full px-2 py-1 font-mono text-[11px] [background:var(--kc-panel)] [color:var(--kc-muted)]">{command}</span>)}</div> : null}
        </div>
      </div>
      <div className="flex items-center justify-between border-t px-3.5 py-2 text-xs [border-color:rgba(148,163,184,0.22)] [color:var(--kc-muted)]">
        <span>机器人名片</span>
        <Icon name="chevron" className="h-4 w-4" />
      </div>
    </div>
  );
}

export function BotShareCard({ card }: { card: BotShareCardMetadata }): JSX.Element {
  const openBot = useKukeStore((state) => state.openBot);
  return (
    <button type="button" onClick={() => openBot(card.bot_id)} className="mt-1 block max-w-full cursor-pointer rounded-[22px] text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-200">
      <BotShareCardPreview card={card} />
    </button>
  );
}

export function UserShareAvatar({ card }: { card: UserShareCardMetadata }): JSX.Element {
  const avatar = resolveThumbnailUrl(card.avatar_url);
  if (avatar) {
    return <img src={avatar} alt={card.name} className="h-12 w-12 shrink-0 rounded-2xl border object-cover [border-color:var(--kc-border)]" />;
  }
  return <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border text-base font-black [background:var(--kc-accent-soft)] [border-color:var(--kc-border)] [color:var(--kc-accent)]">{card.name.trim().slice(0, 1) || '友'}</span>;
}

export function UserShareCardPreview({ card }: { card: UserShareCardMetadata }): JSX.Element {
  const title = card.profile_title?.trim() || '个人主页';
  const tagline = card.profile_tagline?.trim() || card.profile_status?.trim() || card.bio?.trim() || '查看这个用户的主页资料';
  return (
    <div className="w-[min(320px,74vw)] max-w-full overflow-hidden rounded-[22px] border text-left shadow-none [background:var(--kc-panel)] [border-color:rgba(148,163,184,0.28)]">
      <div className="flex items-center gap-3 px-3.5 pb-2 pt-3.5">
        <UserShareAvatar card={card} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-black [color:var(--kc-text)]">{card.name}</p>
            {card.ccw_student_oid ? <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold [background:var(--kc-accent-soft)] [color:var(--kc-accent)]">CCW</span> : null}
          </div>
          <p className="mt-0.5 truncate text-xs [color:var(--kc-muted)]">{card.username ? `@${card.username}` : `用户 ${card.user_id}`}</p>
        </div>
      </div>
      <div className="px-3.5 pb-3">
        <div className="min-w-0 overflow-hidden rounded-2xl px-3 py-2.5 [background:var(--kc-panel-muted)]">
          <p className="truncate text-xs font-bold [color:var(--kc-accent)]">{title}</p>
          <p className="mt-1 line-clamp-2 break-words text-sm leading-6 [color:var(--kc-text)]">{tagline}</p>
          {card.ccw_name?.trim() ? <p className="mt-2 truncate text-[11px] font-semibold [color:var(--kc-muted)]">已绑定 CCW：{card.ccw_name}</p> : null}
        </div>
      </div>
      <div className="flex items-center justify-between border-t px-3.5 py-2 text-xs [border-color:rgba(148,163,184,0.22)] [color:var(--kc-muted)]">
        <span>个人名片</span>
        <Icon name="chevron" className="h-4 w-4" />
      </div>
    </div>
  );
}

export function UserShareCard({ card }: { card: UserShareCardMetadata }): JSX.Element {
  const openUserSpace = useKukeStore((state) => state.openUserSpace);
  return (
    <button type="button" onClick={() => openUserSpace(card.user_id)} className="mt-1 block max-w-full cursor-pointer rounded-[22px] text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-200">
      <UserShareCardPreview card={card} />
    </button>
  );
}

export const TEAMUP_SHARE_SKILL_LABEL: Record<TeamupSkill, string> = {
  program: '程序',
  art: '美术',
  design: '策划',
  music: '音乐音效',
  writing: '文案剧情',
  test: '测试',
  other: '其他'
};

export function TeamupShareAvatar({ card }: { card: TeamupShareCardMetadata }): JSX.Element {
  const avatar = resolveThumbnailUrl(card.avatar_url);
  if (avatar) {
    return <img src={avatar} alt={card.name} className="h-12 w-12 shrink-0 rounded-2xl border object-cover [border-color:var(--kc-border)]" />;
  }
  return <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border text-base font-black [background:var(--kc-accent-soft)] [border-color:var(--kc-border)] [color:var(--kc-accent)]">{card.name.trim().slice(0, 1) || '队'}</span>;
}

export function TeamupShareCardPreview({ card }: { card: TeamupShareCardMetadata }): JSX.Element {
  const cover = resolveThumbnailUrl(card.cover_url);
  const skills = (card.skills ?? []).slice(0, 4);
  const lookingFor = (card.looking_for ?? []).slice(0, 3);
  return (
    <div className="w-[min(320px,74vw)] max-w-full overflow-hidden rounded-[22px] border text-left shadow-none [background:var(--kc-panel)] [border-color:rgba(148,163,184,0.28)]">
      {cover ? (
        <div className="relative h-20 w-full overflow-hidden">
          <img src={cover} alt="" className="h-full w-full object-cover" />
          <span className="absolute inset-0 [background:linear-gradient(180deg,transparent_30%,color-mix(in_srgb,var(--kc-panel)_80%,transparent))]" />
        </div>
      ) : (
        <div className="relative h-12 w-full overflow-hidden [background:linear-gradient(120deg,color-mix(in_srgb,var(--kc-accent)_22%,transparent),transparent)]" />
      )}
      <div className="relative z-10 flex items-end gap-3 px-3.5 pb-2 -mt-7">
        <span className="relative z-10 rounded-2xl ring-2 ring-white shadow-[0_4px_12px_rgba(15,23,42,0.18)] dark:ring-[color:var(--kc-panel)]"><TeamupShareAvatar card={card} /></span>
        <div className="min-w-0 flex-1 pb-0.5">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-black [color:var(--kc-text)]">{card.name}</p>
            {card.status === 'recruiting' ? <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700"><span className="h-1 w-1 rounded-full bg-emerald-500" />招募中</span> : null}
          </div>
        </div>
      </div>
      <div className="px-3.5 pb-3">
        {card.headline ? <p className="line-clamp-2 break-words text-sm font-bold leading-5 [color:var(--kc-text)]">{card.headline}</p> : null}
        {skills.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {skills.map((skill) => <span key={skill} className="rounded-md px-1.5 py-0.5 text-[10px] font-bold [background:var(--kc-accent-soft)] [color:var(--kc-accent)]">{TEAMUP_SHARE_SKILL_LABEL[skill] ?? skill}</span>)}
          </div>
        ) : null}
        {lookingFor.length > 0 ? <p className="mt-2 truncate text-[11px] font-semibold [color:var(--kc-muted)]">想找：{lookingFor.map((skill) => TEAMUP_SHARE_SKILL_LABEL[skill] ?? skill).join('、')}</p> : null}
      </div>
      <div className="flex items-center justify-between border-t px-3.5 py-2 text-xs [border-color:rgba(148,163,184,0.22)] [color:var(--kc-muted)]">
        <span className="inline-flex items-center gap-1"><Icon name="users" className="h-3.5 w-3.5" />组队名片{card.creation_count ? ` · ${card.creation_count} 代表作` : ''}</span>
        <Icon name="chevron" className="h-4 w-4" />
      </div>
    </div>
  );
}

export function TeamupShareCard({ card }: { card: TeamupShareCardMetadata }): JSX.Element {
  const openTeamupProfile = useKukeStore((state) => state.openTeamupProfile);
  return (
    <button type="button" onClick={() => openTeamupProfile(card.profile_id)} className="mt-1 block max-w-full cursor-pointer rounded-[22px] text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-200">
      <TeamupShareCardPreview card={card} />
    </button>
  );
}

export function GroupShareCard({ card, conversations, onError }: { card: GroupShareCardMetadata; conversations: Conversation[]; onError: (message: string) => void }): JSX.Element {
  const queryClient = useQueryClient();
  const setActiveConversationId = useKukeStore((state) => state.setActiveConversationId);
  const joinedConversation = conversations.find((item) => item.id === card.conversation_id);
  const acceptMutation = useMutation({
    mutationFn: async () => {
      if (!card.invite_token) {
        throw new Error('这张群名片缺少邀请凭证');
      }
      return acceptInvite(card.invite_token);
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      void queryClient.invalidateQueries({ queryKey: ['group-join-requests'] });
      setActiveConversationId(result.conversation_id ?? card.conversation_id);
      toast.success(result.status === 'joined' ? '已加入群聊' : '已处理群邀请');
    },
    onError: (error) => onError(error instanceof Error ? error.message : '加入群聊失败，请稍后重试。')
  });

  const actionLabel = joinedConversation ? '打开群聊' : acceptMutation.isPending ? '加入中...' : '加入群聊';

  return (
    <article className="w-80 max-w-full overflow-hidden rounded-2xl border text-left shadow-none [background:var(--kc-panel)] [border-color:var(--kc-border)]">
      <div className="p-3.5">
        <div className="flex items-center gap-3">
          <GroupShareAvatar card={card} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold [color:var(--kc-text)]">{card.title}</p>
            <p className="mt-0.5 truncate text-xs [color:var(--kc-muted)]">群号 {card.conversation_id} · {card.member_count ?? 0} 人 · {card.category?.trim() || '未设置'}</p>
          </div>
        </div>
        <p className="mt-3 line-clamp-2 rounded-xl px-3 py-2 text-xs leading-5 [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">{card.description?.trim() || '这个群还没有简介。'}</p>
      </div>
      <div className="flex items-center justify-between gap-3 border-t px-3.5 py-2.5 [border-color:var(--kc-border)]">
        <span className="text-xs [color:var(--kc-muted)]">群聊名片</span>
        <button type="button" disabled={acceptMutation.isPending || (!joinedConversation && !card.invite_token)} onClick={() => joinedConversation ? setActiveConversationId(card.conversation_id) : acceptMutation.mutate()} className="rounded-xl px-3 py-1.5 text-xs font-semibold transition [background:var(--kc-accent-soft)] [color:var(--kc-accent)] hover:[background:var(--kc-hover)] disabled:cursor-not-allowed disabled:opacity-45">
          {actionLabel}
        </button>
      </div>
    </article>
  );
}
