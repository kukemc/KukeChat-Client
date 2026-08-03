import { useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createBot, deleteBot, getMyBots, getPublicBots, installBot, rotateBotKey, updateBot } from '@/api/bots';
import { uploadAvatar } from '@/api/users';
import { useKukeStore } from '@/store/kukeStore';
import type { Bot, BotPayload, Conversation, User } from '@/types/api';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { BotApiDocsModal } from '@/components/bots/BotApiDocsModal';
import { BotDashboardPanel } from '@/components/bots/BotDashboardPanel';
import { BotDetailPanel } from '@/components/bots/BotDetailPanel';
import { MobileStatusBar } from '@/components/mobile/MobileChrome';
import { registerNativeBackHandler } from '@/native/back';

const SQUARE_PAGE_SIZE = 30;

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
type BotDialogMode = 'create' | 'edit' | null;

const emptyDraft: BotPayload = {
  name: '',
  avatar_url: '',
  description: '',
  functions: '',
  commands: '',
  is_public: true
};

function groupTitle(conversation: Conversation): string {
  return conversation.display_title?.trim() || conversation.title?.trim() || `群聊 ${conversation.id}`;
}

function botUser(bot: Bot): User {
  return bot.user ?? {
    id: bot.user_id,
    username: bot.name,
    nickname: bot.name,
    avatar_url: bot.avatar_url,
    is_bot: true
  };
}

function botOwner(bot: Bot): User {
  return bot.owner ?? {
    id: bot.owner_id,
    username: `用户 ${bot.owner_id}`,
    nickname: `用户 ${bot.owner_id}`,
    is_bot: false
  };
}

function parseLines(value?: string | null): string[] {
  const lines = (value ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length > 0 ? lines : [''];
}

function countNonEmptyLines(value?: string | null): number {
  return (value ?? '').split('\n').map((line) => line.trim()).filter(Boolean).length;
}

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

function formatDate(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function formatCount(value?: number): string {
  const count = value ?? 0;
  if (count >= 10000) return `${(count / 10000).toFixed(count >= 100000 ? 0 : 1)}万`;
  return count.toLocaleString('zh-CN');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '请求失败，请稍后再试';
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

export function BotCenterPanel({ conversations, isMobile = false, onMobileBack, onOpenMobileConversation, onOpenBotDetail, onOpenMobileBotEditor, onOpenUserProfile }: BotCenterPanelProps): JSX.Element {
  const queryClient = useQueryClient();
  const openUserSpace = useKukeStore((state) => state.openUserSpace);
  const [tab, setTab] = useState<BotTab>('square');
  const [query, setQuery] = useState('');
  const [dialogMode, setDialogMode] = useState<BotDialogMode>(null);
  const [editingBot, setEditingBot] = useState<Bot | null>(null);
  const [draft, setDraft] = useState<BotPayload>(emptyDraft);
  const [commandRows, setCommandRows] = useState<string[]>(['']);
  const [installingBot, setInstallingBot] = useState<Bot | null>(null);
  const [selectedBotId, setSelectedBotId] = useState<number | null>(null);
  const [dashboardBotId, setDashboardBotId] = useState<number | null>(null);
  const [deletingBot, setDeletingBot] = useState<Bot | null>(null);
  const [installGroupId, setInstallGroupId] = useState(0);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [showAccessDocs, setShowAccessDocs] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const manageableGroups = useMemo(
    () => conversations.filter((conversation) => conversation.type === 'group' && (conversation.my_role === 'owner' || conversation.my_role === 'admin')),
    [conversations]
  );

  const myBotsQuery = useQuery({ queryKey: ['bots', 'mine'], queryFn: getMyBots });
  const publicBotsQuery = useInfiniteQuery({
    queryKey: ['bots', 'square', query],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => getPublicBots(query, { limit: SQUARE_PAGE_SIZE, offset: pageParam }),
    getNextPageParam: (lastPage) => lastPage.has_more ? lastPage.offset + lastPage.items.length : undefined
  });

  const createMutation = useMutation({
    mutationFn: createBot,
    onSuccess: (result) => {
      setNewKey(result.key);
      setCopiedKey(false);
      setDialogMode(null);
      setDraft(emptyDraft);
      void queryClient.invalidateQueries({ queryKey: ['bots'] });
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ botId, payload }: { botId: number; payload: Partial<BotPayload> & { status?: 'active' | 'disabled' } }) => updateBot(botId, payload),
    onSuccess: () => {
      closeDialog();
      void queryClient.invalidateQueries({ queryKey: ['bots'] });
    }
  });

  const rotateMutation = useMutation({
    mutationFn: rotateBotKey,
    onSuccess: (result) => {
      setNewKey(result.key);
      setCopiedKey(false);
    }
  });

  const avatarMutation = useMutation({
    mutationFn: uploadAvatar,
    onSuccess: (result) => updateDraft('avatar_url', result.url)
  });

  const installMutation = useMutation({
    mutationFn: ({ botId, conversationId }: { botId: number; conversationId: number }) => installBot(botId, { conversation_id: conversationId, receive_messages: true, receive_member_events: true }),
    onSuccess: () => {
      setInstallingBot(null);
      setInstallGroupId(0);
      void queryClient.invalidateQueries({ queryKey: ['conversation-bots'] });
      void queryClient.invalidateQueries({ queryKey: ['conversation-members'] });
      void queryClient.invalidateQueries({ queryKey: ['conversation-members-page'] });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (botId: number) => deleteBot(botId),
    onSuccess: () => {
      setDeletingBot(null);
      setSelectedBotId(null);
      void queryClient.invalidateQueries({ queryKey: ['bots'] });
      void queryClient.invalidateQueries({ queryKey: ['conversation-bots'] });
      void queryClient.invalidateQueries({ queryKey: ['conversation-members'] });
    }
  });

  const publicBotPages = publicBotsQuery.data?.pages ?? [];
  const publicBots = useMemo(() => publicBotPages.flatMap((page) => page.items), [publicBotPages]);
  const squareStats = publicBotPages[0]?.stats;
  const visibleBots = tab === 'square' ? publicBots : myBotsQuery.data ?? [];
  const visibleQuery = tab === 'square' ? publicBotsQuery : myBotsQuery;
  const busy = createMutation.isPending || updateMutation.isPending || avatarMutation.isPending;
  const visibleError = createMutation.error ?? updateMutation.error ?? rotateMutation.error ?? avatarMutation.error ?? installMutation.error ?? deleteMutation.error ?? visibleQuery.error;
  const descriptionLength = draft.description?.length ?? 0;
  const functionLineCount = countNonEmptyLines(draft.functions);
  const commandCount = commandRows.map((command) => command.trim()).filter(Boolean).length;

  useEffect(() => {
    if (tab !== 'square') return;
    const target = loadMoreRef.current;
    if (!target) return;
    const scrollParent = target.closest('main');
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting) && publicBotsQuery.hasNextPage && !publicBotsQuery.isFetchingNextPage) {
        void publicBotsQuery.fetchNextPage();
      }
    }, { root: scrollParent, rootMargin: '260px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [publicBotsQuery, publicBotsQuery.hasNextPage, publicBotsQuery.isFetchingNextPage, tab]);

  function openBotDetail(botId: number): void {
    if (isMobile && onOpenBotDetail) {
      onOpenBotDetail(botId);
      return;
    }
    setSelectedBotId(botId);
  }

  function openOwnerProfile(owner: User, fallbackId: number): void {
    if (isMobile && onOpenUserProfile) {
      onOpenUserProfile(owner, fallbackId);
      return;
    }
    openUserSpace(fallbackId);
  }

  useEffect(() => {
    if (!isMobile || !onMobileBack) {
      return undefined;
    }
    return registerNativeBackHandler(() => {
      if (dialogMode) {
        closeDialog();
        return true;
      }
      if (installingBot) {
        closeInstallDialog();
        return true;
      }
      if (newKey) {
        setNewKey(null);
        return true;
      }
      if (deletingBot) {
        setDeletingBot(null);
        return true;
      }
      if (showAccessDocs) {
        setShowAccessDocs(false);
        return true;
      }
      onMobileBack();
      return true;
    }, 30);
  }, [deletingBot, dialogMode, installingBot, isMobile, newKey, onMobileBack, showAccessDocs]);

  function openCreateDialog(): void {
    if (isMobile && onOpenMobileBotEditor) {
      onOpenMobileBotEditor('create');
      return;
    }
    setEditingBot(null);
    setDraft(emptyDraft);
    setCommandRows(['']);
    setDialogMode('create');
  }

  function openEditDialog(bot: Bot): void {
    if (isMobile && onOpenMobileBotEditor) {
      onOpenMobileBotEditor('edit', bot);
      return;
    }
    setEditingBot(bot);
    setDraft({
      name: bot.name,
      avatar_url: bot.avatar_url ?? '',
      description: bot.description ?? '',
      functions: bot.functions ?? '',
      commands: bot.commands ?? '',
      is_public: bot.is_public
    });
    setCommandRows(parseLines(bot.commands));
    setDialogMode('edit');
  }

  function closeDialog(): void {
    setDialogMode(null);
    setEditingBot(null);
    setDraft(emptyDraft);
    setCommandRows(['']);
  }

  function updateDraft<K extends keyof BotPayload>(key: K, value: BotPayload[K]): void {
    setDraft((previous) => ({ ...previous, [key]: value }));
  }

  function submitBot(): void {
    const commands = commandRows.map((command) => command.trim()).filter(Boolean).join('\n');
    const payload: BotPayload = {
      name: draft.name.trim(),
      avatar_url: draft.avatar_url?.trim() || null,
      description: draft.description?.trim() || null,
      functions: draft.functions?.trim() || null,
      commands: commands || null,
      is_public: Boolean(draft.is_public)
    };
    if (!payload.name) return;
    if (dialogMode === 'edit' && editingBot) {
      updateMutation.mutate({ botId: editingBot.id, payload });
      return;
    }
    createMutation.mutate(payload);
  }

  function updateCommand(index: number, value: string): void {
    setCommandRows((previous) => previous.map((command, commandIndex) => commandIndex === index ? value : command));
  }

  function addCommand(): void {
    setCommandRows((previous) => [...previous, '']);
  }

  function removeCommand(index: number): void {
    setCommandRows((previous) => previous.length === 1 ? [''] : previous.filter((_, commandIndex) => commandIndex !== index));
  }

  function uploadBotAvatar(file?: File): void {
    if (!file) return;
    avatarMutation.mutate(file);
  }

  function openInstallDialog(bot: Bot): void {
    setInstallingBot(bot);
    setInstallGroupId(manageableGroups[0]?.id ?? 0);
  }

  function closeInstallDialog(): void {
    setInstallingBot(null);
    setInstallGroupId(0);
  }

  function submitInstall(): void {
    if (!installingBot || !installGroupId) return;
    installMutation.mutate({ botId: installingBot.id, conversationId: installGroupId });
  }

  function copyKey(): void {
    if (!newKey) return;
    void navigator.clipboard?.writeText(newKey);
    setCopiedKey(true);
    window.setTimeout(() => setCopiedKey(false), 1600);
  }

  const overlayNode = (
    <>
      {dialogMode ? (
        <div className="fixed inset-0 z-[2147483647] grid place-items-center bg-black/30 p-4 backdrop-blur-sm">
          <div className="kc-message-enter flex h-[min(760px,calc(100vh-32px))] w-full max-w-xl flex-col overflow-hidden rounded-[26px] border shadow-[0_24px_80px_rgba(15,23,42,0.22)] [background:var(--kc-panel)] [border-color:var(--kc-border)]">
            <div className="flex shrink-0 items-center justify-between border-b px-5 py-4 [border-color:var(--kc-border)]">
              <div>
                <h3 className="text-base font-black">{dialogMode === 'edit' ? '编辑机器人' : '新建机器人'}</h3>
                <p className="mt-1 text-xs [color:var(--kc-muted)]">填写机器人资料和可用指令。</p>
              </div>
              <button type="button" onClick={closeDialog} className="grid h-9 w-9 place-items-center rounded-xl transition hover:[background:var(--kc-hover)]"><Icon name="close" className="h-4 w-4" /></button>
            </div>
            <div className="scroll-soft min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
              <div className="flex items-center gap-4 rounded-2xl border p-4 [border-color:var(--kc-border)]">
                <Avatar user={{ id: editingBot?.user_id ?? 0, username: draft.name || '机器人', nickname: draft.name || '机器人', avatar_url: draft.avatar_url || undefined, is_bot: true }} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">机器人头像</p>
                  <p className="mt-1 text-xs [color:var(--kc-muted)]">上传 png、jpg、webp 或 gif 图片。</p>
                </div>
                <label className="ghost-button cursor-pointer rounded-2xl border px-4 py-2 text-sm font-bold [border-color:var(--kc-border)]">
                  {avatarMutation.isPending ? '上传中...' : '上传头像'}
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(event) => uploadBotAvatar(event.target.files?.[0])} />
                </label>
              </div>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold [color:var(--kc-muted)]">名称</span>
                <input value={draft.name} onChange={(event) => updateDraft('name', event.target.value)} placeholder="机器人名称" className="glass-input w-full rounded-2xl px-4 py-3 text-sm outline-none" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold [color:var(--kc-muted)]">介绍</span>
                <textarea value={draft.description ?? ''} onChange={(event) => updateDraft('description', event.target.value)} placeholder="简要说明这个机器人适合做什么" maxLength={500} className="glass-input h-20 w-full resize-none rounded-2xl px-4 py-3 text-sm leading-6 outline-none" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold [color:var(--kc-muted)]">功能说明</span>
                <textarea value={draft.functions ?? ''} onChange={(event) => updateDraft('functions', event.target.value)} placeholder="说明机器人支持的能力、使用场景或注意事项" maxLength={1200} className="glass-input h-24 w-full resize-none rounded-2xl px-4 py-3 text-sm leading-6 outline-none" />
              </label>
              <div className="rounded-2xl border p-4 [border-color:var(--kc-border)]">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold">可用指令</p>
                    <p className="mt-1 text-xs [color:var(--kc-muted)]">逐条添加，展示给群管理员和用户查看。</p>
                  </div>
                  <button type="button" onClick={addCommand} className="ghost-button rounded-xl border px-3 py-2 text-xs font-bold [border-color:var(--kc-border)]"><Icon name="plus" className="mr-1 inline h-3.5 w-3.5" />添加</button>
                </div>
                <div className="space-y-2">
                  {commandRows.map((command, index) => (
                    <div key={index} className="flex gap-2">
                      <input value={command} onChange={(event) => updateCommand(index, event.target.value)} placeholder={index === 0 ? '/help' : '/command'} className="glass-input min-w-0 flex-1 rounded-xl px-3 py-2 text-sm outline-none" />
                      <button type="button" onClick={() => removeCommand(index)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl transition [color:var(--kc-muted)] hover:[background:var(--kc-hover)] hover:[color:var(--kc-text)]" title="删除指令"><Icon name="trash" className="h-4 w-4" /></button>
                    </div>
                  ))}
                </div>
              </div>
              <button type="button" onClick={() => updateDraft('is_public', !draft.is_public)} className="flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition hover:[background:var(--kc-hover)] [border-color:var(--kc-border)]">
                <span>
                  <span className="block text-sm font-bold">公开到机器人广场</span>
                  <span className="mt-0.5 block text-xs [color:var(--kc-muted)]">公开后，其他群管理员可以添加这个机器人。</span>
                </span>
                <span className={`relative h-6 w-11 shrink-0 rounded-full p-0.5 transition ${draft.is_public ? '[background:var(--kc-accent)]' : '[background:var(--kc-panel-muted)]'}`}>
                  <span className={`block h-5 w-5 rounded-full bg-white shadow transition ${draft.is_public ? 'translate-x-5' : ''}`} />
                </span>
              </button>
            </div>
            <div className="flex shrink-0 justify-end gap-2 border-t px-5 py-4 [border-color:var(--kc-border)]">
              <button type="button" onClick={closeDialog} className="ghost-button rounded-2xl px-4 py-2.5 text-sm font-bold">取消</button>
              <button type="button" onClick={submitBot} disabled={!draft.name.trim() || busy} className="liquid-button rounded-2xl px-4 py-2.5 text-sm font-black disabled:cursor-not-allowed disabled:opacity-50">{busy ? '保存中...' : dialogMode === 'edit' ? '保存' : '创建'}</button>
            </div>
          </div>
        </div>
      ) : null}
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
              {manageableGroups.length > 0 ? (
                <div className="space-y-2">
                  {manageableGroups.map((group) => {
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
              <p className="min-w-0 truncate text-xs [color:var(--kc-muted)]">{installGroupId ? `已选择：${groupTitle(manageableGroups.find((group) => group.id === installGroupId) ?? manageableGroups[0])}` : '请选择一个群聊'}</p>
              <div className="flex shrink-0 justify-end gap-2">
                <button type="button" onClick={closeInstallDialog} className="ghost-button rounded-2xl px-4 py-2.5 text-sm font-bold">取消</button>
                <button type="button" onClick={submitInstall} disabled={!installGroupId || installMutation.isPending} className="liquid-button rounded-2xl px-4 py-2.5 text-sm font-black disabled:cursor-not-allowed disabled:opacity-50">{installMutation.isPending ? '添加中...' : '添加'}</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {newKey ? (
        <div className="fixed inset-0 z-[2147483647] grid place-items-center bg-black/30 p-4 backdrop-blur-sm">
          <div className="kc-message-enter w-full max-w-lg rounded-[24px] border p-5 shadow-[0_24px_80px_rgba(15,23,42,0.22)] [background:var(--kc-panel)] [border-color:var(--kc-border)]">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl [background:var(--kc-panel-muted)] [color:var(--kc-accent)]"><Icon name="shieldCheck" className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1">
                <h3 className="font-black">保存机器人 Key</h3>
                <p className="mt-1 text-sm leading-6 [color:var(--kc-muted)]">完整 Key 只显示一次。关闭前请复制保存，重置后旧 Key 会失效。</p>
                <p className="mt-3 rounded-2xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-bold leading-6 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">任何情况下都不要把机器人 Key 放到公开作品中，防止泄露；如果已经泄露，请立即重置密钥。</p>
                <p className="mt-3 break-all rounded-2xl px-3 py-2 font-mono text-xs [background:var(--kc-panel-muted)]">{newKey}</p>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={copyKey} className="ghost-button rounded-2xl border px-4 py-2 text-sm font-bold [border-color:var(--kc-border)]">{copiedKey ? '已复制' : '复制 Key'}</button>
              <button type="button" onClick={() => setNewKey(null)} className="liquid-button rounded-2xl px-4 py-2 text-sm font-black">关闭</button>
            </div>
          </div>
        </div>
      ) : null}
      {deletingBot ? (
        <div className="fixed inset-0 z-[2147483647] grid place-items-center bg-black/35 p-4 backdrop-blur-sm">
          <div className="kc-message-enter w-full max-w-md rounded-[24px] border p-5 shadow-[0_24px_80px_rgba(15,23,42,0.22)] [background:var(--kc-panel)] [border-color:var(--kc-border)]">
            <h3 className="text-base font-black text-red-600">确认删除机器人？</h3>
            <p className="mt-3 text-sm leading-6 [color:var(--kc-muted)]">将删除「{deletingBot.name}」的 Key 和所有安装记录，并从所有群聊中移出。历史消息会保留。</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setDeletingBot(null)} className="ghost-button rounded-2xl px-4 py-2 text-sm font-bold">取消</button>
              <button type="button" onClick={() => deleteMutation.mutate(deletingBot.id)} disabled={deleteMutation.isPending} className="rounded-2xl bg-red-500 px-4 py-2 text-sm font-black text-white disabled:opacity-50">{deleteMutation.isPending ? '删除中...' : '确认删除'}</button>
            </div>
          </div>
        </div>
      ) : null}
      {showAccessDocs ? <BotApiDocsModal onClose={() => setShowAccessDocs(false)} /> : null}
    </>
  );

  if (!isMobile && selectedBotId) {
    return (
      <BotDetailPanel
        botId={selectedBotId}
        conversations={conversations}
        isMobile={isMobile}
        onOpenMobileConversation={onOpenMobileConversation}
        onOpenUserProfile={onOpenUserProfile}
        onBack={() => setSelectedBotId(null)}
        onDashboard={(botId) => {
          setSelectedBotId(null);
          setDashboardBotId(botId);
        }}
        onEdit={openEditDialog}
        onDeleted={() => setSelectedBotId(null)}
        onKey={(key) => {
          setNewKey(key);
          setCopiedKey(false);
        }}
      />
    );
  }

  if (isMobile) {
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
          <button type="button" onClick={openCreateDialog} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-[#168bff] shadow-sm" aria-label="新建机器人">
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
                    <button type="button" onClick={() => openBotDetail(bot.id)} className="flex w-full min-w-0 max-w-full gap-3 overflow-hidden text-left active:scale-[0.99]">
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
                      <button type="button" onClick={() => openBotDetail(bot.id)} className="kc-mobile-bot-card-detail-button h-10 flex-1 rounded-[16px] text-[13px] font-black [background:var(--kc-accent-soft,#eaf4ff)] [color:var(--kc-accent,#168bff)]">详情</button>
                      <button type="button" onClick={() => openInstallDialog(bot)} disabled={bot.status === 'disabled'} className="h-10 flex-1 rounded-[16px] text-[13px] font-black text-white [background:var(--kc-accent,#168bff)] disabled:opacity-50">添加到群聊</button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}
        </div>

        {overlayNode}
      </section>
    );
  }

  if (dashboardBotId) {
    return <BotDashboardPanel botId={dashboardBotId} onBack={() => setDashboardBotId(null)} />;
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden [background:var(--kc-chat)] [color:var(--kc-text)]">
      <header className="shrink-0 border-b px-5 py-4 [background:var(--kc-panel)] [border-color:var(--kc-border)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-black tracking-tight">机器人广场</h2>
            <p className="mt-1 text-sm [color:var(--kc-muted)]">发现公开机器人，并添加到你管理的群聊中。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setShowAccessDocs(true)} className="ghost-button inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-black [border-color:var(--kc-border)]">
              <Icon name="code" className="h-4 w-4" />
              如何接入?
            </button>
            <button type="button" onClick={openCreateDialog} className="liquid-button inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-black">
              <Icon name="plus" className="h-4 w-4" />
              新建机器人
            </button>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4 sm:p-5">
        <div className="glass-panel mb-4 flex shrink-0 flex-wrap items-center gap-3 rounded-[24px] p-3 shadow-sm">
          <div className="relative grid w-[252px] shrink-0 grid-cols-2 rounded-2xl p-1 [background:var(--kc-panel-muted)]">
            <span className={`absolute left-1 top-1 h-[calc(100%-8px)] w-[122px] rounded-xl shadow-sm transition-transform duration-300 ease-out [background:var(--kc-panel)] ${tab === 'mine' ? 'translate-x-[122px]' : 'translate-x-0'}`} />
            <button type="button" onClick={() => setTab('square')} className={`relative z-10 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold leading-5 transition-colors duration-200 ${tab === 'square' ? '[color:var(--kc-text)]' : '[color:var(--kc-muted)] hover:[color:var(--kc-text)]'}`}>广场</button>
            <button type="button" onClick={() => setTab('mine')} className={`relative z-10 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold leading-5 transition-colors duration-200 ${tab === 'mine' ? '[color:var(--kc-text)]' : '[color:var(--kc-muted)] hover:[color:var(--kc-text)]'}`}>我的机器人</button>
          </div>
          <label className="relative min-w-full flex-1 sm:min-w-[260px]">
            <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 [color:var(--kc-muted)]" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} disabled={tab !== 'square'} placeholder="搜索机器人名称、功能或指令" className="glass-input w-full rounded-2xl py-2.5 pl-9 pr-4 text-sm outline-none disabled:opacity-60" />
          </label>
        </div>

        {tab === 'square' ? (
          <div className="mb-4 grid shrink-0 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              { label: '广场机器人', value: squareStats?.total_bots, suffix: '个', icon: 'bot' as const, tone: 'from-sky-500/16 to-cyan-400/8' },
              { label: '实时在线', value: squareStats?.online_bots, suffix: '个', icon: 'sparkles' as const, tone: 'from-emerald-500/16 to-lime-400/8' },
              { label: '已接入群聊', value: squareStats?.installed_groups, suffix: '个', icon: 'users' as const, tone: 'from-violet-500/16 to-fuchsia-400/8' },
              { label: '累计安装', value: squareStats?.total_installs, suffix: '次', icon: 'blocks' as const, tone: 'from-indigo-500/16 to-blue-400/8' },
              { label: '用户口碑', value: squareStats?.total_reviews, suffix: '条评价', icon: 'star' as const, tone: 'from-amber-500/18 to-orange-400/8' }
            ].map((item) => (
              <div key={item.label} className={`relative overflow-hidden rounded-[22px] border p-4 shadow-sm [background:var(--kc-panel)] [border-color:var(--kc-border)]`}>
                <span className={`absolute inset-0 bg-gradient-to-br ${item.tone}`} />
                <span className="relative flex items-center justify-between gap-3">
                  <span>
                    <span className="block text-xs font-black [color:var(--kc-muted)]">{item.label}</span>
                    <span className="mt-1 block text-2xl font-black tracking-tight">{formatCount(item.value)}<span className="ml-1 text-xs font-bold [color:var(--kc-muted)]">{item.suffix}</span></span>
                  </span>
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl [background:var(--kc-panel)] [color:var(--kc-accent)] shadow-sm"><Icon name={item.icon} className="h-5 w-5" /></span>
                </span>
              </div>
            ))}
          </div>
        ) : null}

        {visibleError ? <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{errorMessage(visibleError)}</div> : null}

        <main key={tab} className="scroll-soft kc-message-enter -mx-2 min-h-0 flex-1 overflow-y-auto px-2 pb-6 pt-1">
          {visibleQuery.isLoading ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((item) => <div key={item} className="h-52 animate-pulse rounded-[24px] [background:var(--kc-panel-muted)]" />)}
            </div>
          ) : null}

          {!visibleQuery.isLoading && visibleBots.length === 0 ? (
            <div className="grid min-h-[360px] place-items-center rounded-[26px] border border-dashed p-8 text-center [background:var(--kc-panel)] [border-color:var(--kc-border)]">
              <div className="max-w-sm">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl [background:var(--kc-panel-muted)] [color:var(--kc-muted)]"><Icon name="bot" className="h-7 w-7" /></span>
                <h3 className="mt-4 text-base font-black">{tab === 'square' ? '暂无公开机器人' : '你还没有创建机器人'}</h3>
                <p className="mt-2 text-sm leading-6 [color:var(--kc-muted)]">{tab === 'square' ? '之后公开的机器人会显示在这里。' : '点击右上角新建机器人，创建后可以选择是否公开到广场。'}</p>
                {tab === 'mine' ? <button type="button" onClick={openCreateDialog} className="liquid-button mt-4 rounded-2xl px-4 py-2 text-sm font-black">新建机器人</button> : null}
                {tab === 'square' && query.trim() ? <button type="button" onClick={() => setQuery('')} className="ghost-button mt-4 rounded-2xl px-4 py-2 text-sm font-bold">清空搜索</button> : null}
              </div>
            </div>
          ) : null}

          {!visibleQuery.isLoading && visibleBots.length > 0 ? (
            <>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {visibleBots.map((bot, index) => {
                  const commands = commandPreview(bot.commands);
                  const owner = botOwner(bot);
                  return (
                    <article key={bot.id} className="kc-message-enter flex min-h-[250px] flex-col rounded-[24px] border p-4 shadow-sm transition [background:var(--kc-panel)] [border-color:var(--kc-border)] hover:-translate-y-0.5 hover:shadow-[0_16px_38px_rgba(15,23,42,0.08)]" style={{ animationDelay: `${Math.min(index, 8) * 24}ms` }}>
                    <button type="button" onClick={() => setSelectedBotId(bot.id)} className="flex gap-3 text-left">
                      <Avatar user={botUser(bot)} size="lg" />
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-2">
                          <h3 className="truncate text-base font-black">{bot.name}</h3>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${bot.online ? 'bg-emerald-100 text-emerald-700' : '[background:var(--kc-panel-muted)] [color:var(--kc-muted)]'}`}>{bot.online ? '在线' : '离线'}</span>
                          {bot.status === 'disabled' ? <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">停用</span> : null}
                        </div>
                        <p className="mt-1 line-clamp-2 text-sm leading-6 [color:var(--kc-muted)]">{bot.description || '暂无介绍'}</p>
                        <p className="mt-2 inline-flex flex-wrap items-center gap-1 text-xs font-bold [color:var(--kc-muted)]"><CompactStars value={bot.rating_average} />{bot.rating_average ? bot.rating_average.toFixed(1) : '暂无评分'} · {bot.review_count ?? 0} 条评论 · {bot.install_count ?? 0} 个群在使用</p>
                      </div>
                    </button>

                    <button type="button" onClick={() => openOwnerProfile(owner, bot.owner_id)} className="mt-4 flex w-full items-center gap-2.5 rounded-2xl px-3 py-2 text-left transition [background:var(--kc-panel-muted)] hover:[background:var(--kc-hover)]">
                      <Avatar user={owner} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-bold [color:var(--kc-muted)]">创建者</p>
                        <p className="truncate text-sm font-bold">{owner.nickname || owner.username}</p>
                      </div>
                      <Icon name="chevron" className="h-4 w-4 shrink-0 [color:var(--kc-muted)]" />
                    </button>

                    <div className="mt-4 text-sm">
                      <p className="mb-2 text-xs font-bold [color:var(--kc-muted)]">可用指令</p>
                      {commands.visible.length > 0 ? (
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                          <div className="flex min-w-0 flex-nowrap gap-2 overflow-hidden">
                            {commands.visible.map((line, lineIndex) => <span key={`${line}-${lineIndex}`} title={line} className="min-w-0 max-w-[130px] shrink truncate rounded-full px-2.5 py-1 font-mono text-xs [background:var(--kc-panel-muted)]">{line}</span>)}
                          </div>
                          {commands.hidden > 0 ? <span className="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold [background:var(--kc-accent-soft)] [color:var(--kc-accent)]">+{commands.hidden}</span> : null}
                        </div>
                      ) : <p className="text-sm [color:var(--kc-muted)]">暂无指令</p>}
                    </div>

                    <div className="mt-auto pt-4">
                      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs [color:var(--kc-muted)]">
                        {bot.is_public ? <span className="rounded-full px-2.5 py-1 [background:var(--kc-accent-soft)] [color:var(--kc-accent)]">公开</span> : <span className="rounded-full px-2.5 py-1 [background:var(--kc-panel-muted)]">私有</span>}
                        {formatDate(bot.updated_at) ? <span>更新于 {formatDate(bot.updated_at)}</span> : null}
                      </div>

                      {tab === 'mine' ? (
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => setDashboardBotId(bot.id)} className="liquid-button rounded-xl px-3 py-2 text-xs font-black"><Icon name="blocks" className="mr-1 inline h-3.5 w-3.5" />仪表盘</button>
                          <button type="button" onClick={() => setSelectedBotId(bot.id)} className="ghost-button rounded-xl border px-3 py-2 text-xs font-bold [border-color:var(--kc-border)]"><Icon name="eye" className="mr-1 inline h-3.5 w-3.5" />详情</button>
                          <button type="button" onClick={() => openEditDialog(bot)} className="ghost-button rounded-xl border px-3 py-2 text-xs font-bold [border-color:var(--kc-border)]"><Icon name="edit" className="mr-1 inline h-3.5 w-3.5" />编辑</button>
                          <button type="button" onClick={() => rotateMutation.mutate(bot.id)} disabled={rotateMutation.isPending} className="ghost-button rounded-xl border px-3 py-2 text-xs font-bold [border-color:var(--kc-border)] disabled:opacity-50"><Icon name="shield" className="mr-1 inline h-3.5 w-3.5" />重置 Key</button>
                          <button type="button" onClick={() => openInstallDialog(bot)} disabled={bot.status === 'disabled'} className="liquid-button inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-black disabled:cursor-not-allowed disabled:opacity-50">
                            <Icon name="plus" className="h-3.5 w-3.5" />
                            添加到群聊
                          </button>
                          <button type="button" onClick={() => setDeletingBot(bot)} className="rounded-xl border border-red-200 px-3 py-2 text-xs font-bold text-red-600 transition hover:bg-red-50"><Icon name="trash" className="mr-1 inline h-3.5 w-3.5" />删除</button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => setSelectedBotId(bot.id)} className="ghost-button rounded-xl border px-3 py-2 text-xs font-bold [border-color:var(--kc-border)]"><Icon name="eye" className="mr-1 inline h-3.5 w-3.5" />详情</button>
                          <button type="button" onClick={() => openInstallDialog(bot)} className="liquid-button inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-black">
                            <Icon name="plus" className="h-3.5 w-3.5" />
                            添加到群聊
                          </button>
                        </div>
                      )}
                    </div>
                    </article>
                  );
                })}
              </div>
              {tab === 'square' ? (
                <div ref={loadMoreRef} className="mt-5 flex justify-center py-2">
                  {publicBotsQuery.isFetchingNextPage ? <span className="rounded-full px-4 py-2 text-sm font-bold [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">正在加载更多机器人...</span> : null}
                  {!publicBotsQuery.isFetchingNextPage && publicBotsQuery.hasNextPage ? <span className="rounded-full px-4 py-2 text-sm font-bold [color:var(--kc-muted)]">继续下滑加载更多</span> : null}
                  {!publicBotsQuery.hasNextPage ? <span className="rounded-full px-4 py-2 text-sm font-bold [color:var(--kc-muted)]">已经到底啦</span> : null}
                </div>
              ) : null}
            </>
          ) : null}
        </main>
      </div>

      {dialogMode ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4 backdrop-blur-sm">
          <div className="kc-message-enter flex max-h-[min(760px,calc(100vh-56px))] w-full max-w-2xl flex-col overflow-hidden rounded-[26px] border shadow-[0_24px_80px_rgba(15,23,42,0.22)] [background:var(--kc-panel)] [border-color:var(--kc-border)]">
            <div className="flex shrink-0 items-center justify-between border-b px-5 py-4 [border-color:var(--kc-border)]">
              <div>
                <h3 className="text-base font-black">{dialogMode === 'edit' ? '编辑机器人' : '新建机器人'}</h3>
                <p className="mt-1 text-xs [color:var(--kc-muted)]">完善展示资料、功能说明和可用指令。</p>
              </div>
              <button type="button" onClick={closeDialog} className="grid h-9 w-9 place-items-center rounded-xl transition hover:[background:var(--kc-hover)]"><Icon name="close" className="h-4 w-4" /></button>
            </div>
            <div className="scroll-soft min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
              <div className="flex items-center gap-4 rounded-2xl border p-4 [border-color:var(--kc-border)] [background:var(--kc-panel-muted)]">
                <Avatar user={{ id: editingBot?.user_id ?? 0, username: draft.name || '机器人', nickname: draft.name || '机器人', avatar_url: draft.avatar_url || undefined, is_bot: true }} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black">机器人头像</p>
                  <p className="mt-1 text-xs [color:var(--kc-muted)]">支持 png、jpg、webp、gif。</p>
                </div>
                <label className="ghost-button shrink-0 cursor-pointer rounded-2xl border px-4 py-2 text-sm font-bold [border-color:var(--kc-border)]">
                  {avatarMutation.isPending ? '上传中...' : '上传头像'}
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(event) => uploadBotAvatar(event.target.files?.[0])} />
                </label>
              </div>

              <button type="button" onClick={() => updateDraft('is_public', !draft.is_public)} className="flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition hover:[background:var(--kc-hover)] [border-color:var(--kc-border)]">
                <span className="min-w-0">
                  <span className="block text-sm font-black">公开到机器人广场</span>
                  <span className="mt-0.5 block text-xs [color:var(--kc-muted)]">公开后，其他群管理员可以添加这个机器人。</span>
                </span>
                <span className={`relative h-6 w-11 shrink-0 rounded-full p-0.5 transition ${draft.is_public ? '[background:var(--kc-accent)]' : '[background:var(--kc-panel-muted)]'}`}>
                  <span className={`block h-5 w-5 rounded-full bg-white shadow transition ${draft.is_public ? 'translate-x-5' : ''}`} />
                </span>
              </button>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-2xl px-3 py-2 [background:var(--kc-panel-muted)]"><span className="block text-base font-black">{descriptionLength}</span><span className="text-[11px] font-bold [color:var(--kc-muted)]">介绍字数</span></div>
                <div className="rounded-2xl px-3 py-2 [background:var(--kc-panel-muted)]"><span className="block text-base font-black">{functionLineCount}</span><span className="text-[11px] font-bold [color:var(--kc-muted)]">功能条目</span></div>
                <div className="rounded-2xl px-3 py-2 [background:var(--kc-panel-muted)]"><span className="block text-base font-black">{commandCount}</span><span className="text-[11px] font-bold [color:var(--kc-muted)]">指令</span></div>
              </div>

              <section className="rounded-2xl border p-4 [border-color:var(--kc-border)]">
                <div className="mb-3 flex items-start justify-between gap-4">
                  <div>
                    <h4 className="text-sm font-black">基础资料</h4>
                    <p className="mt-1 text-xs [color:var(--kc-muted)]">会显示在机器人广场和详情页。</p>
                  </div>
                  <span className="shrink-0 text-xs font-bold [color:var(--kc-muted)]">{descriptionLength}/500</span>
                </div>
                <div className="space-y-3">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-bold [color:var(--kc-muted)]">名称</span>
                    <input value={draft.name} onChange={(event) => updateDraft('name', event.target.value)} placeholder="机器人名称" className="glass-input w-full rounded-2xl px-4 py-3 text-sm outline-none" />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-bold [color:var(--kc-muted)]">介绍</span>
                    <textarea value={draft.description ?? ''} onChange={(event) => updateDraft('description', event.target.value)} placeholder={'用几句话介绍机器人适合做什么。\n支持换行，详情页会按这里的格式展示。'} maxLength={500} className="glass-input min-h-28 w-full resize-y rounded-2xl px-4 py-3 text-sm leading-6 outline-none" />
                  </label>
                </div>
              </section>

              <section className="rounded-2xl border p-4 [border-color:var(--kc-border)]">
                <h4 className="text-sm font-black">功能说明</h4>
                <p className="mt-1 text-xs leading-5 [color:var(--kc-muted)]">一行一个功能点，详情页会以列表展示。</p>
                <textarea value={draft.functions ?? ''} onChange={(event) => updateDraft('functions', event.target.value)} placeholder={'例如：\n自动回复常见问题\n支持签到、查询在线人数\n可在群聊中 @机器人 使用'} className="glass-input mt-3 min-h-24 w-full resize-y rounded-2xl px-4 py-3 text-sm leading-6 outline-none" />
              </section>

              <section className="rounded-2xl border p-4 [border-color:var(--kc-border)]">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-black">可用指令</h4>
                    <p className="mt-1 text-xs [color:var(--kc-muted)]">逐条添加，展示给群管理员和用户查看。</p>
                  </div>
                  <button type="button" onClick={addCommand} className="ghost-button shrink-0 rounded-xl border px-3 py-2 text-xs font-bold [border-color:var(--kc-border)]"><Icon name="plus" className="mr-1 inline h-3.5 w-3.5" />添加</button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {commandRows.map((command, index) => (
                    <div key={index} className="flex gap-2 rounded-2xl p-2 [background:var(--kc-panel-muted)]">
                      <input value={command} onChange={(event) => updateCommand(index, event.target.value)} placeholder={index === 0 ? '/help' : '/command'} className="glass-input min-w-0 flex-1 rounded-xl px-3 py-2 text-sm outline-none" />
                      <button type="button" onClick={() => removeCommand(index)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl transition [color:var(--kc-muted)] hover:[background:var(--kc-hover)] hover:[color:var(--kc-text)]" title="删除指令"><Icon name="trash" className="h-4 w-4" /></button>
                    </div>
                  ))}
                </div>
              </section>
            </div>
            <div className="flex shrink-0 items-center justify-between gap-3 border-t px-5 py-4 [border-color:var(--kc-border)]">
              <p className="hidden text-xs [color:var(--kc-muted)] sm:block">保存后会同步更新机器人广场和详情页展示。</p>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={closeDialog} className="ghost-button rounded-2xl px-4 py-2.5 text-sm font-bold">取消</button>
                <button type="button" onClick={submitBot} disabled={!draft.name.trim() || busy} className="liquid-button rounded-2xl px-4 py-2.5 text-sm font-black disabled:cursor-not-allowed disabled:opacity-50">{busy ? '保存中...' : dialogMode === 'edit' ? '保存' : '创建'}</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {installingBot ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/30 p-4 backdrop-blur-sm">
          <div className="kc-message-enter flex h-[min(720px,calc(100vh-96px))] w-full max-w-2xl flex-col overflow-hidden rounded-[26px] border shadow-[0_24px_80px_rgba(15,23,42,0.22)] [background:var(--kc-panel)] [border-color:var(--kc-border)]">
            <div className="flex shrink-0 items-center justify-between border-b px-5 py-4 [border-color:var(--kc-border)]">
              <div className="min-w-0">
                <h3 className="truncate text-base font-black">选择群聊</h3>
                <p className="mt-1 truncate text-xs [color:var(--kc-muted)]">将 {installingBot.name} 添加到你管理的群聊</p>
              </div>
              <button type="button" onClick={closeInstallDialog} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl transition hover:[background:var(--kc-hover)]"><Icon name="close" className="h-4 w-4" /></button>
            </div>
            <div className="scroll-soft min-h-0 flex-1 overflow-y-auto p-4">
              {manageableGroups.length > 0 ? (
                <div className="space-y-2">
                  {manageableGroups.map((group) => {
                    const active = installGroupId === group.id;
                    const title = groupTitle(group);
                    return (
                      <button key={group.id} type="button" onClick={() => setInstallGroupId(group.id)} className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition [border-color:var(--kc-border)] ${active ? '[background:var(--kc-accent-soft)] [border-color:var(--kc-accent)]' : 'hover:[background:var(--kc-hover)]'}`}>
                        <Avatar label={title} avatarUrl={group.avatar_url} size="md" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold">{title}</span>
                        </span>
                        <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border transition ${active ? '[background:var(--kc-accent)] [border-color:var(--kc-accent)] text-white' : '[border-color:var(--kc-border)]'}`}>
                          {active ? <Icon name="check" className="h-3.5 w-3.5" /> : null}
                        </span>
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
              <p className="min-w-0 truncate text-xs [color:var(--kc-muted)]">{installGroupId ? `已选择：${groupTitle(manageableGroups.find((group) => group.id === installGroupId) ?? manageableGroups[0])}` : '请选择一个群聊'}</p>
              <div className="flex shrink-0 justify-end gap-2">
              <button type="button" onClick={closeInstallDialog} className="ghost-button rounded-2xl px-4 py-2.5 text-sm font-bold">取消</button>
              <button type="button" onClick={submitInstall} disabled={!installGroupId || installMutation.isPending} className="liquid-button rounded-2xl px-4 py-2.5 text-sm font-black disabled:cursor-not-allowed disabled:opacity-50">{installMutation.isPending ? '添加中...' : '添加'}</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {newKey ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4 backdrop-blur-sm">
          <div className="kc-message-enter w-full max-w-lg rounded-[24px] border p-5 shadow-[0_24px_80px_rgba(15,23,42,0.22)] [background:var(--kc-panel)] [border-color:var(--kc-border)]">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl [background:var(--kc-panel-muted)] [color:var(--kc-accent)]"><Icon name="shieldCheck" className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1">
                <h3 className="font-black">保存机器人 Key</h3>
                <p className="mt-1 text-sm leading-6 [color:var(--kc-muted)]">完整 Key 只显示一次。关闭前请复制保存，重置后旧 Key 会失效。</p>
                <p className="mt-3 rounded-2xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-bold leading-6 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">任何情况下都不要把机器人 Key 放到公开作品中，防止泄露；如果已经泄露，请立即重置密钥。</p>
                <p className="mt-3 break-all rounded-2xl px-3 py-2 font-mono text-xs [background:var(--kc-panel-muted)]">{newKey}</p>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={copyKey} className="ghost-button rounded-2xl border px-4 py-2 text-sm font-bold [border-color:var(--kc-border)]">{copiedKey ? '已复制' : '复制 Key'}</button>
              <button type="button" onClick={() => setNewKey(null)} className="liquid-button rounded-2xl px-4 py-2 text-sm font-black">关闭</button>
            </div>
          </div>
        </div>
      ) : null}

      {deletingBot ? (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-black/35 p-4 backdrop-blur-sm">
          <div className="kc-message-enter w-full max-w-md rounded-[24px] border p-5 shadow-[0_24px_80px_rgba(15,23,42,0.22)] [background:var(--kc-panel)] [border-color:var(--kc-border)]">
            <h3 className="text-base font-black text-red-600">确认删除机器人？</h3>
            <p className="mt-3 text-sm leading-6 [color:var(--kc-muted)]">将删除「{deletingBot.name}」的 Key 和所有安装记录，并从所有群聊中移出。历史消息会保留。</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setDeletingBot(null)} className="ghost-button rounded-2xl px-4 py-2 text-sm font-bold">取消</button>
              <button type="button" onClick={() => deleteMutation.mutate(deletingBot.id)} disabled={deleteMutation.isPending} className="rounded-2xl bg-red-500 px-4 py-2 text-sm font-black text-white disabled:opacity-50">{deleteMutation.isPending ? '删除中...' : '确认删除'}</button>
            </div>
          </div>
        </div>
      ) : null}

      {showAccessDocs ? <BotApiDocsModal onClose={() => setShowAccessDocs(false)} /> : null}
    </section>
  );
}
