import { useEffect, useMemo, useState } from 'react';
import { useKukeStore } from '@/store/kukeStore';
import type { Bot, Conversation, User } from '@/types/api';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { BotApiDocsModal } from '@/components/bots/BotApiDocsModal';
import { MobileStatusBar } from '@/components/mobile/MobileChrome';
import { registerNativeBackHandler } from '@/native/back';
import { useInstallBot, useMyBots, useSquareBots } from './botQueries';
import { botOwner, botUser, errorMessage, groupTitle, manageableGroups } from './botShared';
import { BotCenterDesktop } from './desktop/BotCenterDesktop';

interface BotCenterPanelProps {
  conversations: Conversation[];
  isMobile?: boolean;
  onMobileBack?: () => void;
  onOpenMobileConversation?: (conversationId: number) => void;
  onOpenBotDetail?: (botId: number) => void;
  onOpenMobileBotEditor?: (mode: 'create' | 'edit', bot?: Bot) => void;
  onOpenUserProfile?: (user: User | null | undefined, fallbackId: number) => void;
}

type BotTab = 'square' | 'mine';

function truncateCommand(value: string, maxLength = 22): string {
  return value.length > maxLength ? `${value.slice(0, Math.max(0, maxLength - 1))}…` : value;
}

function commandPreview(value?: string | null): { visible: string[]; hidden: number } {
  const lines = (value ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => ({ line, index }));
  if (lines.length === 0) {
    return { visible: [], hidden: 0 };
  }

  const sorted = [...lines].sort((left, right) => left.line.length - right.line.length || left.index - right.index);
  const visible: string[] = [];
  let used = 0;
  const budget = 70;
  const maxItems = 4;
  for (const item of sorted) {
    const clipped = truncateCommand(item.line);
    const cost = Math.min(clipped.length, 22) + 4;
    if (visible.length >= 2 && (visible.length >= maxItems || used + cost > budget)) {
      continue;
    }
    visible.push(clipped);
    used += cost;
  }

  if (visible.length === 0) {
    visible.push(truncateCommand(sorted[0].line, 34));
  }
  return { visible, hidden: Math.max(0, lines.length - visible.length) };
}

function CompactStarShape({ className = '' }: { className?: string }): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M12 2.4l2.86 5.8 6.4.93-4.63 4.51 1.09 6.37L12 17l-5.72 3.01 1.09-6.37-4.63-4.51 6.4-.93L12 2.4z" />
    </svg>
  );
}

function CompactStars({ value }: { value?: number | null }): JSX.Element | null {
  if (!value) return null;
  const normalized = Math.max(0, Math.min(5, value));
  return (
    <span className="inline-flex items-center gap-0.5 leading-none" aria-label={`${normalized.toFixed(1)} 分`}>
      {[1, 2, 3, 4, 5].map((item) => {
        const fill = Math.max(0, Math.min(1, normalized - item + 1)) * 100;
        return <span key={item} className="relative inline-grid h-3.5 w-3.5 shrink-0 place-items-center"><CompactStarShape className="h-full w-full fill-[#d7dde7]" /><span className="absolute inset-0 overflow-hidden" style={{ width: `${fill}%` }}><CompactStarShape className="h-3.5 w-3.5 fill-[#ffb300]" /></span></span>;
      })}
    </span>
  );
}

/** 机器人中心的入口：桌面布局走 desktop/ 下的新界面，移动布局是下面这份。 */
export function BotCenterPanel({ isMobile = false, ...props }: BotCenterPanelProps): JSX.Element {
  return isMobile ? <BotCenterMobile {...props} /> : <BotCenterDesktop conversations={props.conversations} />;
}

/**
 * 移动端的机器人中心：广场 / 我的机器人两个列表。
 * 详情、新建和编辑都是各自的二级页面，由外层（ChatDashboard）通过回调打开。
 */
function BotCenterMobile({ conversations, onMobileBack, onOpenBotDetail, onOpenMobileBotEditor, onOpenUserProfile }: Omit<BotCenterPanelProps, 'isMobile'>): JSX.Element {
  const openUserSpace = useKukeStore((state) => state.openUserSpace);
  const [tab, setTab] = useState<BotTab>('square');
  const [query, setQuery] = useState('');
  const [installingBot, setInstallingBot] = useState<Bot | null>(null);
  const [installGroupId, setInstallGroupId] = useState(0);
  const [showAccessDocs, setShowAccessDocs] = useState(false);

  const groups = useMemo(() => manageableGroups(conversations), [conversations]);
  const myBotsQuery = useMyBots();
  const publicBotsQuery = useSquareBots(query);
  const installMutation = useInstallBot();

  const publicBotPages = publicBotsQuery.data?.pages ?? [];
  const publicBots = useMemo(() => publicBotPages.flatMap((page) => page.items), [publicBotPages]);
  const visibleBots = tab === 'square' ? publicBots : myBotsQuery.data ?? [];
  const visibleQuery = tab === 'square' ? publicBotsQuery : myBotsQuery;
  const visibleError = installMutation.error ?? visibleQuery.error;

  function openOwnerProfile(owner: User, fallbackId: number): void {
    if (onOpenUserProfile) {
      onOpenUserProfile(owner, fallbackId);
      return;
    }
    openUserSpace(fallbackId);
  }

  useEffect(() => {
    if (!onMobileBack) {
      return undefined;
    }
    return registerNativeBackHandler(() => {
      if (installingBot) {
        closeInstallDialog();
        return true;
      }
      if (showAccessDocs) {
        setShowAccessDocs(false);
        return true;
      }
      onMobileBack();
      return true;
    }, 30);
  }, [installingBot, onMobileBack, showAccessDocs]);

  function openInstallDialog(bot: Bot): void {
    setInstallingBot(bot);
    setInstallGroupId(groups[0]?.id ?? 0);
  }

  function closeInstallDialog(): void {
    setInstallingBot(null);
    setInstallGroupId(0);
  }

  function submitInstall(): void {
    if (!installingBot || !installGroupId) return;
    installMutation.mutate({ botId: installingBot.id, conversationId: installGroupId }, { onSuccess: closeInstallDialog });
  }

  return (
    <section className="kc-qq-page flex h-full min-h-0 flex-col overflow-hidden [color:var(--kc-mobile-text,#111827)]">
      <MobileStatusBar />
      <header className="kc-qq-home-header kc-qq-sticky-home-header mx-4 shrink-0">
        <button type="button" onClick={onMobileBack} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-[#526070] shadow-sm" aria-label="返回空间">
          <Icon name="chevronLeft" className="h-5 w-5" />
        </button>
        <div className="min-w-0 text-center">
          <h1 className="text-[17px] font-black [color:var(--kc-mobile-strong,#151922)]">机器人</h1>
          <p className="text-[11px] font-bold [color:var(--kc-mobile-muted,#8b95a5)]">查看广场与我的机器人</p>
        </div>
        <button type="button" onClick={() => onOpenMobileBotEditor?.('create')} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-[#168bff] shadow-sm" aria-label="新建机器人">
          <Icon name="plus" className="h-5 w-5" />
        </button>
      </header>

      <div className="scroll-soft min-w-0 max-w-full min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 pb-[calc(var(--kc-native-safe-bottom,env(safe-area-inset-bottom))+28px)] pt-3">
        <section className="kc-qq-channel-hero kc-qq-posts-hero">
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-[#eaf4ff]">Kuke Bots</p>
            <h2 className="mt-2 text-[30px] font-black leading-none text-white">机器人</h2>
            <p className="mt-2 text-[13px] font-medium text-white/80">发现公开机器人，管理自己的机器人。</p>
            <button type="button" onClick={() => setShowAccessDocs(true)} className="mt-3 inline-flex h-9 items-center gap-2 rounded-full bg-white/18 px-3 text-[12px] font-black text-white backdrop-blur">
              <Icon name="code" className="h-4 w-4" />
              如何制作我的机器人
            </button>
          </div>
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-[26px] bg-white/18 text-white backdrop-blur"><Icon name="bot" className="h-8 w-8" /></span>
        </section>

        <div className="mt-3 rounded-[24px] p-1 shadow-sm [background:var(--kc-mobile-card,#fff)]">
          <div className="grid grid-cols-2 gap-1">
            <button type="button" onClick={() => setTab('square')} className={`h-11 rounded-[20px] text-[14px] font-black transition ${tab === 'square' ? '[background:var(--kc-accent,#168bff)] text-white shadow-sm' : '[color:var(--kc-mobile-muted,#8b95a5)]'}`}>广场</button>
            <button type="button" onClick={() => setTab('mine')} className={`h-11 rounded-[20px] text-[14px] font-black transition ${tab === 'mine' ? '[background:var(--kc-accent,#168bff)] text-white shadow-sm' : '[color:var(--kc-mobile-muted,#8b95a5)]'}`}>我的机器人</button>
          </div>
        </div>
        <label className="kc-qq-search-pill mt-3">
          <Icon name="search" className="h-5 w-5 shrink-0 [color:var(--kc-mobile-subtle,#a4adba)]" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} disabled={tab !== 'square'} className="min-w-0 flex-1 border-0 bg-transparent text-[15px] font-medium outline-none [color:var(--kc-mobile-text,#111827)] placeholder:[color:var(--kc-mobile-subtle,#a4adba)] disabled:opacity-50" placeholder="搜索机器人名称、功能或指令" />
        </label>

        {visibleError ? <p className="mt-3 rounded-[18px] bg-red-50 px-4 py-3 text-[13px] font-bold text-red-500">{errorMessage(visibleError)}</p> : null}
        {visibleQuery.isLoading ? <div className="mt-3 grid gap-3">{[0, 1, 2].map((item) => <div key={item} className="h-32 animate-pulse rounded-[24px] bg-white/80" />)}</div> : null}
        {!visibleQuery.isLoading && visibleBots.length === 0 ? <section className="kc-qq-card mt-3 grid place-items-center gap-2 px-5 py-8 text-center"><Icon name="bot" className="h-7 w-7 [color:var(--kc-mobile-subtle,#a4adba)]" /><p className="text-[15px] font-black [color:var(--kc-mobile-text,#111827)]">{tab === 'square' ? '暂无公开机器人' : '你还没有创建机器人'}</p><p className="text-[12px] font-medium [color:var(--kc-mobile-muted,#8b95a5)]">{tab === 'square' ? '之后公开的机器人会显示在这里。' : '点击右上角新建机器人。'}</p></section> : null}
        {!visibleQuery.isLoading && visibleBots.length > 0 ? (
          <div className="mt-3 grid min-w-0 max-w-full gap-3 overflow-x-hidden">
            {visibleBots.map((bot) => {
              const commands = commandPreview(bot.commands);
              const owner = botOwner(bot);
              return (
                <article key={bot.id} className="kc-qq-card min-w-0 max-w-full overflow-hidden p-4">
                  <button type="button" onClick={() => onOpenBotDetail?.(bot.id)} className="flex w-full min-w-0 max-w-full gap-3 overflow-hidden text-left active:scale-[0.99]">
                    <Avatar user={botUser(bot)} size="lg" />
                    <span className="min-w-0 flex-1 overflow-hidden">
                      <span className="flex min-w-0 max-w-full items-center gap-2 overflow-hidden"><span className="min-w-0 flex-1 truncate text-[17px] font-black [color:var(--kc-mobile-text,#111827)]">{bot.name}</span><span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${bot.online ? 'bg-emerald-100 text-emerald-700' : '[background:var(--kc-mobile-card-muted,#f4f6fa)] [color:var(--kc-mobile-muted,#8b95a5)]'}`}>{bot.online ? '在线' : '离线'}</span></span>
                      <span className="mt-1 line-clamp-2 text-[13px] font-semibold leading-5 [color:var(--kc-mobile-muted,#8b95a5)]">{bot.description || '暂无介绍'}</span>
                      <span className="mt-2 flex max-w-full flex-wrap items-center gap-1.5 break-words text-[11px] font-bold [color:var(--kc-mobile-muted,#8b95a5)]"><CompactStars value={bot.rating_average} />{bot.rating_average ? bot.rating_average.toFixed(1) : '暂无评分'} · {bot.review_count ?? 0} 评论 · {bot.install_count ?? 0} 群使用</span>
                    </span>
                    <Icon name="chevron" className="mt-4 h-5 w-5 shrink-0 text-[#8b95a5]" />
                  </button>
                  <button type="button" onClick={() => openOwnerProfile(owner, bot.owner_id)} className="mt-3 flex w-full min-w-0 max-w-full items-center gap-2.5 overflow-hidden rounded-[18px] px-3 py-2 text-left [background:var(--kc-mobile-card-muted,#f4f6fa)]">
                    <Avatar user={owner} size="sm" />
                    <span className="min-w-0 flex-1"><span className="block text-[11px] font-bold [color:var(--kc-mobile-muted,#8b95a5)]">创建者</span><span className="block truncate text-[13px] font-black [color:var(--kc-mobile-text,#111827)]">{owner.nickname || owner.username}</span></span>
                  </button>
                  <div className="mt-3 flex min-w-0 max-w-full flex-wrap gap-2 overflow-hidden">
                    {commands.visible.length > 0 ? commands.visible.slice(0, 3).map((line, index) => <span key={`${line}-${index}`} className="max-w-full truncate rounded-full px-2.5 py-1 font-mono text-[11px] font-bold [background:var(--kc-mobile-card-muted,#f4f6fa)] [color:var(--kc-mobile-muted,#526070)]">{line}</span>) : <span className="text-[12px] font-bold [color:var(--kc-mobile-muted,#8b95a5)]">暂无指令</span>}
                    {commands.hidden > 0 ? <span className="rounded-full px-2.5 py-1 text-[11px] font-black [background:var(--kc-accent-soft,#eaf4ff)] [color:var(--kc-accent,#168bff)]">+{commands.hidden}</span> : null}
                  </div>
                  <div className="mt-3 flex min-w-0 max-w-full gap-2 overflow-hidden">
                    <button type="button" onClick={() => onOpenBotDetail?.(bot.id)} className="kc-mobile-bot-card-detail-button h-10 flex-1 rounded-[16px] text-[13px] font-black [background:var(--kc-accent-soft,#eaf4ff)] [color:var(--kc-accent,#168bff)]">详情</button>
                    <button type="button" onClick={() => openInstallDialog(bot)} disabled={bot.status === 'disabled'} className="h-10 flex-1 rounded-[16px] text-[13px] font-black text-white [background:var(--kc-accent,#168bff)] disabled:opacity-50">添加到群聊</button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}
      </div>

      {installingBot ? (
        <div className="fixed inset-0 z-[2147483647] grid place-items-center bg-black/30 p-4 backdrop-blur-sm">
          <div className="kc-message-enter flex h-[min(720px,calc(100vh-32px))] w-full max-w-2xl flex-col overflow-hidden rounded-[26px] border shadow-[0_24px_80px_rgba(15,23,42,0.22)] [background:var(--kc-panel)] [border-color:var(--kc-border)]">
            <div className="flex shrink-0 items-center justify-between border-b px-5 py-4 [border-color:var(--kc-border)]">
              <div className="min-w-0">
                <h3 className="truncate text-base font-black">选择群聊</h3>
                <p className="mt-1 truncate text-xs [color:var(--kc-muted)]">将 {installingBot.name} 添加到你管理的群聊</p>
              </div>
              <button type="button" onClick={closeInstallDialog} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl transition hover:[background:var(--kc-hover)]"><Icon name="close" className="h-4 w-4" /></button>
            </div>
            <div className="scroll-soft min-h-0 flex-1 overflow-y-auto p-4">
              {groups.length > 0 ? (
                <div className="space-y-2">
                  {groups.map((group) => {
                    const active = installGroupId === group.id;
                    const title = groupTitle(group);
                    return (
                      <button key={group.id} type="button" onClick={() => setInstallGroupId(group.id)} className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition [border-color:var(--kc-border)] ${active ? '[background:var(--kc-accent-soft)] [border-color:var(--kc-accent)]' : 'hover:[background:var(--kc-hover)]'}`}>
                        <Avatar label={title} avatarUrl={group.avatar_url} size="md" />
                        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{title}</span></span>
                        <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border transition ${active ? '[background:var(--kc-accent)] [border-color:var(--kc-accent)] text-white' : '[border-color:var(--kc-border)]'}`}>{active ? <Icon name="check" className="h-3.5 w-3.5" /> : null}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="grid min-h-[220px] place-items-center text-center">
                  <div className="max-w-xs">
                    <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl [background:var(--kc-panel-muted)] [color:var(--kc-muted)]"><Icon name="users" className="h-6 w-6" /></span>
                    <h4 className="mt-3 text-sm font-black">没有可添加的群聊</h4>
                    <p className="mt-2 text-sm leading-6 [color:var(--kc-muted)]">只有你是群主或管理员的群聊才能添加机器人。</p>
                  </div>
                </div>
              )}
            </div>
            <div className="flex shrink-0 items-center justify-between gap-3 border-t px-5 py-4 [border-color:var(--kc-border)]">
              <p className="min-w-0 truncate text-xs [color:var(--kc-muted)]">{installGroupId ? `已选择：${groupTitle(groups.find((group) => group.id === installGroupId) ?? groups[0])}` : '请选择一个群聊'}</p>
              <div className="flex shrink-0 justify-end gap-2">
                <button type="button" onClick={closeInstallDialog} className="ghost-button rounded-2xl px-4 py-2.5 text-sm font-bold">取消</button>
                <button type="button" onClick={submitInstall} disabled={!installGroupId || installMutation.isPending} className="liquid-button rounded-2xl px-4 py-2.5 text-sm font-black disabled:cursor-not-allowed disabled:opacity-50">{installMutation.isPending ? '添加中...' : '添加'}</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {showAccessDocs ? <BotApiDocsModal onClose={() => setShowAccessDocs(false)} /> : null}
    </section>
  );
}
