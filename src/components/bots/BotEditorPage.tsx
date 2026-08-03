import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createBot, updateBot } from '@/api/bots';
import { uploadAvatar } from '@/api/users';
import type { Bot, BotPayload } from '@/types/api';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { MobileStatusBar } from '@/components/mobile/MobileChrome';
import { BotApiDocsModal } from '@/components/bots/BotApiDocsModal';
import { registerNativeBackHandler } from '@/native/back';

interface BotEditorPageProps {
  mode: 'create' | 'edit';
  bot?: Bot | null;
  onBack: () => void;
}

const emptyDraft: BotPayload = {
  name: '',
  avatar_url: '',
  description: '',
  functions: '',
  commands: '',
  is_public: true
};

function parseLines(value?: string | null): string[] {
  const lines = (value ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length > 0 ? lines : [''];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '请求失败，请稍后再试';
}

function draftFromBot(bot?: Bot | null): BotPayload {
  if (!bot) return emptyDraft;
  return {
    name: bot.name,
    avatar_url: bot.avatar_url ?? '',
    description: bot.description ?? '',
    functions: bot.functions ?? '',
    commands: bot.commands ?? '',
    is_public: bot.is_public
  };
}

export function BotEditorPage({ mode, bot, onBack }: BotEditorPageProps): JSX.Element {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<BotPayload>(() => draftFromBot(bot));
  const [commandRows, setCommandRows] = useState<string[]>(() => parseLines(bot?.commands));
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [showAccessDocs, setShowAccessDocs] = useState(false);

  useEffect(() => {
    setDraft(draftFromBot(bot));
    setCommandRows(parseLines(bot?.commands));
  }, [bot]);

  const createMutation = useMutation({
    mutationFn: createBot,
    onSuccess: (result) => {
      setNewKey(result.key);
      setCopiedKey(false);
      setDraft(emptyDraft);
      setCommandRows(['']);
      void queryClient.invalidateQueries({ queryKey: ['bots'] });
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ botId, payload }: { botId: number; payload: Partial<BotPayload> & { status?: 'active' | 'disabled' } }) => updateBot(botId, payload),
    onSuccess: (updatedBot) => {
      void queryClient.invalidateQueries({ queryKey: ['bots'] });
      void queryClient.invalidateQueries({ queryKey: ['bots', 'detail', updatedBot.id] });
      onBack();
    }
  });

  const avatarMutation = useMutation({
    mutationFn: uploadAvatar,
    onSuccess: (result) => updateDraft('avatar_url', result.url)
  });

  const busy = createMutation.isPending || updateMutation.isPending || avatarMutation.isPending;
  const visibleError = createMutation.error ?? updateMutation.error ?? avatarMutation.error;

  useEffect(() => {
    return registerNativeBackHandler(() => {
      if (showAccessDocs) {
        setShowAccessDocs(false);
        return true;
      }
      if (newKey) {
        setNewKey(null);
        return true;
      }
      onBack();
      return true;
    }, 40);
  }, [newKey, onBack, showAccessDocs]);

  function updateDraft<K extends keyof BotPayload>(key: K, value: BotPayload[K]): void {
    setDraft((previous) => ({ ...previous, [key]: value }));
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
    if (mode === 'edit' && bot) {
      updateMutation.mutate({ botId: bot.id, payload });
      return;
    }
    createMutation.mutate(payload);
  }

  function copyKey(): void {
    if (!newKey) return;
    void navigator.clipboard?.writeText(newKey);
    setCopiedKey(true);
    window.setTimeout(() => setCopiedKey(false), 1600);
  }

  return (
    <section className="kc-qq-page flex h-full min-h-0 flex-col overflow-hidden [color:var(--kc-mobile-text,#111827)]">
      <MobileStatusBar />
      <header className="kc-qq-home-header kc-qq-sticky-home-header mx-4 shrink-0">
        <button type="button" onClick={onBack} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-[#526070] shadow-sm" aria-label="返回机器人列表">
          <Icon name="chevronLeft" className="h-5 w-5" />
        </button>
        <div className="min-w-0 text-center">
          <h1 className="text-[17px] font-black [color:var(--kc-mobile-strong,#151922)]">{mode === 'edit' ? '编辑机器人' : '新建机器人'}</h1>
          <p className="text-[11px] font-bold [color:var(--kc-mobile-muted,#8b95a5)]">填写资料、指令与公开状态</p>
        </div>
        <button type="button" onClick={() => setShowAccessDocs(true)} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-[#168bff] shadow-sm" aria-label="如何接入机器人">
          <Icon name="code" className="h-5 w-5" />
        </button>
      </header>

      <div className="scroll-soft min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(var(--kc-native-safe-bottom,env(safe-area-inset-bottom))+24px)] pt-3">
        <section className="kc-qq-channel-hero kc-qq-posts-hero">
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-[#eaf4ff]">Kuke Bots</p>
            <h2 className="mt-2 text-[28px] font-black leading-none text-white">{mode === 'edit' ? '编辑机器人' : '制作机器人'}</h2>
            <p className="mt-2 text-[13px] font-medium text-white/80">先创建资料，再使用机器人 Key 接入 Scratch 扩展或 Bot API。</p>
            <button type="button" onClick={() => setShowAccessDocs(true)} className="mt-3 inline-flex h-9 items-center gap-2 rounded-full bg-white/18 px-3 text-[12px] font-black text-white backdrop-blur">
              <Icon name="code" className="h-4 w-4" />
              如何制作我的机器人
            </button>
          </div>
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-[26px] bg-white/18 text-white backdrop-blur"><Icon name="bot" className="h-8 w-8" /></span>
        </section>

        {visibleError ? <p className="mt-3 rounded-[18px] bg-red-50 px-4 py-3 text-[13px] font-bold text-red-500">{errorMessage(visibleError)}</p> : null}

        <section className="mt-3 space-y-3 rounded-[28px] p-4 shadow-sm [background:var(--kc-mobile-card,#fff)]">
          <div className="flex items-center gap-4 rounded-[24px] p-4 [background:var(--kc-mobile-card-muted,#f4f6fa)]">
            <Avatar user={{ id: bot?.user_id ?? 0, username: draft.name || '机器人', nickname: draft.name || '机器人', avatar_url: draft.avatar_url || undefined, is_bot: true }} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-black [color:var(--kc-mobile-text,#111827)]">机器人头像</p>
              <p className="mt-1 text-[12px] font-bold [color:var(--kc-mobile-muted,#8b95a5)]">上传 png、jpg、webp 或 gif 图片。</p>
            </div>
            <label className="shrink-0 cursor-pointer rounded-[18px] px-3 py-2 text-[12px] font-black shadow-sm [background:var(--kc-mobile-card,#fff)] [color:var(--kc-accent,#168bff)]">
              {avatarMutation.isPending ? '上传中' : '上传'}
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(event) => uploadBotAvatar(event.target.files?.[0])} />
            </label>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-[12px] font-black [color:var(--kc-mobile-muted,#8b95a5)]">名称</span>
            <input value={draft.name} onChange={(event) => updateDraft('name', event.target.value)} placeholder="机器人名称" className="h-12 w-full rounded-[18px] px-4 text-[15px] font-bold outline-none [background:var(--kc-mobile-card-muted,#f4f6fa)] [color:var(--kc-mobile-text,#111827)] placeholder:[color:var(--kc-mobile-subtle,#a4adba)]" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-black [color:var(--kc-mobile-muted,#8b95a5)]">介绍</span>
            <textarea value={draft.description ?? ''} onChange={(event) => updateDraft('description', event.target.value)} placeholder="简要说明这个机器人适合做什么" maxLength={500} className="h-24 w-full resize-none rounded-[18px] px-4 py-3 text-[15px] font-bold leading-6 outline-none [background:var(--kc-mobile-card-muted,#f4f6fa)] [color:var(--kc-mobile-text,#111827)] placeholder:[color:var(--kc-mobile-subtle,#a4adba)]" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-black [color:var(--kc-mobile-muted,#8b95a5)]">功能说明</span>
            <textarea value={draft.functions ?? ''} onChange={(event) => updateDraft('functions', event.target.value)} placeholder="说明机器人支持的能力、使用场景或注意事项" maxLength={1200} className="h-28 w-full resize-none rounded-[18px] px-4 py-3 text-[15px] font-bold leading-6 outline-none [background:var(--kc-mobile-card-muted,#f4f6fa)] [color:var(--kc-mobile-text,#111827)] placeholder:[color:var(--kc-mobile-subtle,#a4adba)]" />
          </label>

          <div className="rounded-[24px] p-4 [background:var(--kc-mobile-card-muted,#f4f6fa)]">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-[15px] font-black [color:var(--kc-mobile-text,#111827)]">可用指令</p>
                <p className="mt-1 text-[12px] font-bold [color:var(--kc-mobile-muted,#8b95a5)]">逐条添加，展示给群管理员和用户查看。</p>
              </div>
              <button type="button" onClick={addCommand} className="shrink-0 rounded-[16px] px-3 py-2 text-[12px] font-black shadow-sm [background:var(--kc-mobile-card,#fff)] [color:var(--kc-accent,#168bff)]"><Icon name="plus" className="mr-1 inline h-3.5 w-3.5" />添加</button>
            </div>
            <div className="space-y-2">
              {commandRows.map((command, index) => (
                <div key={index} className="flex gap-2">
                  <input value={command} onChange={(event) => updateCommand(index, event.target.value)} placeholder={index === 0 ? '/help' : '/command'} className="min-w-0 flex-1 rounded-[16px] px-3 py-2.5 font-mono text-[13px] font-bold outline-none [background:var(--kc-mobile-card,#fff)] [color:var(--kc-mobile-text,#111827)] placeholder:[color:var(--kc-mobile-subtle,#a4adba)]" />
                  <button type="button" onClick={() => removeCommand(index)} className="grid h-10 w-10 shrink-0 place-items-center rounded-[16px] bg-white text-[#8b95a5] shadow-sm" aria-label="删除指令"><Icon name="trash" className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
          </div>

          <button type="button" onClick={() => updateDraft('is_public', !draft.is_public)} className="flex w-full items-center justify-between rounded-[24px] px-4 py-3 text-left [background:var(--kc-mobile-card-muted,#f4f6fa)]">
            <span>
              <span className="block text-[15px] font-black [color:var(--kc-mobile-text,#111827)]">公开到机器人广场</span>
              <span className="mt-0.5 block text-[12px] font-bold [color:var(--kc-mobile-muted,#8b95a5)]">公开后，其他群管理员可以添加这个机器人。</span>
            </span>
            <span className={`relative h-6 w-11 shrink-0 rounded-full p-0.5 transition ${draft.is_public ? 'bg-[#168bff]' : 'bg-[#d7dde7]'}`}>
              <span className={`block h-5 w-5 rounded-full bg-white shadow transition ${draft.is_public ? 'translate-x-5' : ''}`} />
            </span>
          </button>
        </section>
      </div>

      <div className="shrink-0 border-t px-4 pb-[calc(var(--kc-native-safe-bottom,env(safe-area-inset-bottom))+10px)] pt-3 backdrop-blur [background:color-mix(in_srgb,var(--kc-mobile-card,#fff)_94%,transparent)] [border-color:var(--kc-mobile-border,rgba(0,0,0,0.05))]">
        <div className="flex gap-2">
          <button type="button" onClick={onBack} className="h-12 flex-1 rounded-[20px] text-[15px] font-black [background:var(--kc-mobile-card-muted,#f4f6fa)] [color:var(--kc-mobile-muted,#526070)]">取消</button>
          <button type="button" onClick={submitBot} disabled={!draft.name.trim() || busy} className="h-12 flex-1 rounded-[20px] text-[15px] font-black text-white [background:var(--kc-accent,#168bff)] disabled:opacity-50">{busy ? '保存中...' : mode === 'edit' ? '保存' : '创建'}</button>
        </div>
      </div>

      {newKey ? (
        <div className="fixed inset-0 z-[2147483647] grid place-items-center bg-black/30 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-[26px] bg-white p-5 shadow-[0_24px_80px_rgba(15,23,42,0.24)]">
            <span className="grid h-11 w-11 place-items-center rounded-[18px] bg-[#eaf4ff] text-[#168bff]"><Icon name="shieldCheck" className="h-5 w-5" /></span>
            <h3 className="mt-4 text-[17px] font-black text-[#111827]">保存机器人 Key</h3>
            <p className="mt-2 text-[13px] font-bold leading-6 text-[#8b95a5]">完整 Key 只显示一次。关闭前请复制保存，重置后旧 Key 会失效。</p>
            <p className="mt-3 break-all rounded-[18px] bg-[#f4f6fa] px-3 py-2 font-mono text-[12px] text-[#111827]">{newKey}</p>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={copyKey} className="h-11 flex-1 rounded-[18px] bg-[#f4f6fa] text-[14px] font-black text-[#526070]">{copiedKey ? '已复制' : '复制 Key'}</button>
              <button type="button" onClick={onBack} className="h-11 flex-1 rounded-[18px] bg-[#168bff] text-[14px] font-black text-white">完成</button>
            </div>
          </div>
        </div>
      ) : null}
      {showAccessDocs ? <BotApiDocsModal onClose={() => setShowAccessDocs(false)} /> : null}
    </section>
  );
}
