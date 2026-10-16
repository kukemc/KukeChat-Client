import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createUserInvite } from '@/api/invites';
import { updateMyPresence, updateMyProfile, uploadAvatar, uploadProfileCover } from '@/api/users';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { useKukeStore } from '@/store/kukeStore';
import type { PresenceStatus, User } from '@/types/api';
import { resolveAssetUrl } from '@/utils/assetUrl';
import { presenceLabel, presenceOptions } from '@/utils/presence';
import { BirthdaySetting } from '@/components/birthday/BirthdaySetting';
import { PokeSetting } from './PokeSetting';
import { Card, Choice, Field, Notice, SettingsPage, btn, inputClass, textareaClass } from './settingsUi';

const ACCENTS = ['#168bff', '#7c3aed', '#ff4f86', '#f97316', '#10b981', '#111827'] as const;
const LAYOUTS = [{ value: 'classic', label: '经典' }, { value: 'banner', label: '沉浸封面' }, { value: 'compact', label: '紧凑' }] as const;
const CARD_STYLES = [{ value: 'soft', label: '柔和' }, { value: 'glass', label: '玻璃' }, { value: 'solid', label: '纯色' }] as const;
type Layout = (typeof LAYOUTS)[number]['value'];
type CardStyle = (typeof CARD_STYLES)[number]['value'];

interface Draft {
  nickname: string; avatar_url: string; bio: string; profile_title: string; profile_tagline: string; profile_status: string;
  profile_location: string; profile_interests: string; profile_layout: Layout; profile_card_style: CardStyle;
  profile_accent_color: string; profile_cover_url: string;
}

function fromUser(user: User): Draft {
  return {
    nickname: user.nickname ?? '', avatar_url: user.avatar_url ?? '', bio: user.bio ?? '',
    profile_title: user.profile_title ?? '', profile_tagline: user.profile_tagline ?? '', profile_status: user.profile_status ?? '',
    profile_location: user.profile_location ?? '', profile_interests: user.profile_interests ?? '',
    profile_layout: LAYOUTS.some((o) => o.value === user.profile_layout) ? user.profile_layout as Layout : 'classic',
    profile_card_style: CARD_STYLES.some((o) => o.value === user.profile_card_style) ? user.profile_card_style as CardStyle : 'soft',
    profile_accent_color: user.profile_accent_color ?? '#168bff',
    profile_cover_url: user.profile_cover_pending_url ?? user.profile_cover_url ?? ''
  };
}

function parseTags(value: string): string[] {
  const seen = new Set<string>();
  return value.split(/[，,\n]+/).map((tag) => tag.trim()).filter((tag) => tag && !seen.has(tag.toLowerCase()) && seen.add(tag.toLowerCase()));
}

function TagEditor({ value, onChange }: { value: string; onChange: (value: string) => void }): JSX.Element {
  const [draft, setDraft] = useState('');
  const tags = parseTags(value);
  const add = (): void => { onChange([...tags, ...parseTags(draft)].filter((t, i, all) => all.findIndex((x) => x.toLowerCase() === t.toLowerCase()) === i).join(', ')); setDraft(''); };
  return (
    <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-xl border px-2 py-1.5 [background:var(--kc-panel)] [border-color:var(--kc-border)] focus-within:[border-color:var(--kc-accent)]">
      {tags.map((tag, index) => (
        <span key={`${tag}-${index}`} className="inline-flex h-7 items-center gap-1 rounded-lg pl-2.5 pr-1 text-xs font-semibold [background:var(--kc-accent-soft)] [color:var(--kc-accent)]">
          {tag}
          <button type="button" aria-label={`删除标签 ${tag}`} onClick={() => onChange(tags.filter((_, i) => i !== index).join(', '))} className="grid h-5 w-5 place-items-center rounded-md hover:bg-black/10"><Icon name="close" className="h-3 w-3" /></button>
        </span>
      ))}
      <input value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={() => draft.trim() && add()}
        onKeyDown={(event) => { if ((event.key === 'Enter' || event.key === ',' || event.key === '，') && draft.trim()) { event.preventDefault(); add(); } else if (event.key === 'Backspace' && !draft && tags.length) { onChange(tags.slice(0, -1).join(', ')); } }}
        placeholder={tags.length ? '' : '输入后按回车添加，例如：编程、音乐'} className="h-7 min-w-[120px] flex-1 bg-transparent px-1 text-sm outline-none [color:var(--kc-text)] placeholder:[color:var(--kc-muted)]" />
    </div>
  );
}

function Preview({ user, draft }: { user: User; draft: Draft }): JSX.Element {
  const cover = draft.profile_cover_url ? resolveAssetUrl(draft.profile_cover_url) : null;
  const accent = /^#[0-9a-f]{6}$/i.test(draft.profile_accent_color) ? draft.profile_accent_color : '#168bff';
  const tags = parseTags(draft.profile_interests);
  return (
    <div className="overflow-hidden rounded-2xl border [background:var(--kc-panel)] [border-color:var(--kc-border)]">
      <div className="h-24" style={{ background: cover ? `url(${cover}) center/cover` : `linear-gradient(135deg, ${accent}, #7c8cff 55%, #ff7eb3)` }} />
      <div className="px-4 pb-4">
        <div className="-mt-8 inline-block rounded-full p-1 [background:var(--kc-panel)]"><Avatar user={{ ...user, avatar_url: draft.avatar_url || user.avatar_url, nickname: draft.nickname || user.nickname }} size="lg" /></div>
        <p className="mt-1 truncate text-base font-semibold [color:var(--kc-text)]">{draft.nickname || getDisplayName(user)}</p>
        <p className="truncate text-xs [color:var(--kc-muted)]">@{user.username} · ID {user.id}</p>
        {draft.profile_tagline ? <p className="mt-2 text-xs font-semibold" style={{ color: accent }}>{draft.profile_tagline}</p> : null}
        <p className="mt-2 line-clamp-3 text-[13px] leading-5 [color:var(--kc-muted)]">{draft.bio || '还没有填写简介'}</p>
        {tags.length ? <div className="mt-3 flex flex-wrap gap-1">{tags.slice(0, 6).map((tag) => <span key={tag} className="rounded-md px-2 py-0.5 text-[11px] font-semibold text-white" style={{ background: accent }}>{tag}</span>)}</div> : null}
      </div>
    </div>
  );
}

export function ProfileSection({ user, compact }: { user: User; compact: boolean }): JSX.Element {
  const queryClient = useQueryClient();
  const setCurrentUser = useKukeStore((state) => state.setCurrentUser);
  const original = useMemo(() => fromUser(user), [user]);
  const [draft, setDraft] = useState<Draft>(original);
  // `user` refreshes on presence changes and realtime pushes; only follow it while there are no unsaved edits.
  const previousOriginal = useRef(original);
  useEffect(() => {
    const before = previousOriginal.current;
    previousOriginal.current = original;
    setDraft((current) => (JSON.stringify(current) === JSON.stringify(before) ? original : current));
  }, [original]);
  const set = (patch: Partial<Draft>): void => setDraft((current) => ({ ...current, ...patch }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(original);
  const avatarInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const [shareState, setShareState] = useState<'idle' | 'copied' | string>('idle');

  const save = useMutation({
    mutationFn: updateMyProfile,
    onSuccess: (updated) => { setCurrentUser(updated); void queryClient.invalidateQueries({ queryKey: ['me'] }); }
  });
  const avatar = useMutation({ mutationFn: uploadAvatar, onSuccess: (response) => set({ avatar_url: response.url }) });
  const cover = useMutation({ mutationFn: uploadProfileCover, onSuccess: (response) => set({ profile_cover_url: response.url }) });

  const [presence, setPresence] = useState<PresenceStatus>(user.presence_status ?? 'online');
  const [presenceText, setPresenceText] = useState(user.presence_text ?? '');
  useEffect(() => { setPresence(user.presence_status ?? 'online'); setPresenceText(user.presence_text ?? ''); }, [user.presence_status, user.presence_text]);
  const presenceMutation = useMutation({
    mutationFn: updateMyPresence,
    onSuccess: (updated) => {
      setCurrentUser(updated);
      void queryClient.invalidateQueries({ queryKey: ['me'] });
      void queryClient.invalidateQueries({ queryKey: ['online-users'] });
    }
  });
  const savePresence = (status: PresenceStatus, text: string): void => {
    if (status === 'custom' && !text.trim()) return;
    presenceMutation.mutate({ presence_status: status, presence_text: text.trim() || null });
  };

  const pick = (mutation: typeof avatar) => (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) mutation.mutate(file);
  };

  async function share(): Promise<void> {
    try {
      const invite = await createUserInvite(user.id);
      await navigator.clipboard.writeText(`${window.location.origin}/?invite=${invite.token}`);
      setShareState('copied');
      window.setTimeout(() => setShareState('idle'), 1800);
    } catch (error) {
      setShareState(error instanceof Error ? error.message : '分享链接生成失败');
    }
  }

  return (
    <SettingsPage title="我的资料" description="别人在名片和个人主页上看到的内容。" wide>
      <div className={`grid items-start gap-4 ${compact ? '' : 'grid-cols-[minmax(0,1fr)_280px]'}`}>
        <div className="grid gap-4">
          <Card title="基本资料" padded>
            <input ref={avatarInput} type="file" accept="image/*" hidden onChange={pick(avatar)} />
            <input ref={coverInput} type="file" accept="image/*" hidden onChange={pick(cover)} />
            <div className="flex flex-wrap items-center gap-3">
              <Avatar user={{ ...user, avatar_url: draft.avatar_url || user.avatar_url }} size="lg" />
              <div className="flex flex-wrap gap-2">
                <button type="button" className={btn.secondary} disabled={avatar.isPending} onClick={() => avatarInput.current?.click()}><Icon name="upload" className="h-4 w-4" />{avatar.isPending ? '上传中…' : '更换头像'}</button>
                <button type="button" className={btn.secondary} disabled={cover.isPending} onClick={() => coverInput.current?.click()}><Icon name="image" className="h-4 w-4" />{cover.isPending ? '上传中…' : '主页背景图'}</button>
                {draft.profile_cover_url ? <button type="button" className={btn.ghost} onClick={() => set({ profile_cover_url: '' })}>移除背景</button> : null}
              </div>
            </div>
            {avatar.error || cover.error ? <div className="mt-3"><Notice tone="error">图片上传失败，请换一张图片或稍后再试。</Notice></div> : null}
            <div className="mt-4 grid gap-3">
              <Field label="昵称"><input className={inputClass} value={draft.nickname} maxLength={50} onChange={(event) => set({ nickname: event.target.value })} placeholder={user.username} /></Field>
              <Field label="简介"><textarea className={textareaClass} rows={3} value={draft.bio} onChange={(event) => set({ bio: event.target.value })} placeholder="介绍一下自己吧" /></Field>
            </div>
          </Card>

          <Card title="个人主页" description="显示在你的个人主页顶部。" padded>
            <div className="grid gap-3">
              <div className={`grid gap-3 ${compact ? '' : 'grid-cols-2'}`}>
                <Field label="主页标题"><input className={inputClass} value={draft.profile_title} onChange={(event) => set({ profile_title: event.target.value })} placeholder="我的空间" /></Field>
                <Field label="主页状态"><input className={inputClass} value={draft.profile_status} onChange={(event) => set({ profile_status: event.target.value })} placeholder="今天在线" /></Field>
                <Field label="一句话介绍"><input className={inputClass} value={draft.profile_tagline} onChange={(event) => set({ profile_tagline: event.target.value })} placeholder="例如：独立游戏制作中" /></Field>
                <Field label="所在地"><input className={inputClass} value={draft.profile_location} onChange={(event) => set({ profile_location: event.target.value })} placeholder="可选" /></Field>
              </div>
              <Field label="兴趣标签"><TagEditor value={draft.profile_interests} onChange={(value) => set({ profile_interests: value })} /></Field>
              <div className={`grid gap-3 ${compact ? '' : 'grid-cols-2'}`}>
                <Field label="页面布局"><Choice value={draft.profile_layout} options={[...LAYOUTS]} onChange={(value) => set({ profile_layout: value })} /></Field>
                <Field label="卡片风格"><Choice value={draft.profile_card_style} options={[...CARD_STYLES]} onChange={(value) => set({ profile_card_style: value })} /></Field>
              </div>
              <Field label="强调色">
                <div className="flex flex-wrap items-center gap-2">
                  {ACCENTS.map((color) => (
                    <button key={color} type="button" aria-label={`强调色 ${color}`} onClick={() => set({ profile_accent_color: color })} className="grid h-8 w-8 place-items-center rounded-full ring-offset-2 transition [--tw-ring-offset-color:var(--kc-panel)]" style={{ background: color, boxShadow: draft.profile_accent_color === color ? `0 0 0 2px var(--kc-panel), 0 0 0 4px ${color}` : undefined }}>
                      {draft.profile_accent_color === color ? <Icon name="check" className="h-4 w-4 text-white" /> : null}
                    </button>
                  ))}
                  <label className="relative grid h-8 w-8 cursor-pointer place-items-center rounded-full border border-dashed [border-color:var(--kc-border)] [color:var(--kc-muted)]" title="自定义颜色">
                    <Icon name="palette" className="h-4 w-4" />
                    <input type="color" value={/^#[0-9a-f]{6}$/i.test(draft.profile_accent_color) ? draft.profile_accent_color : '#168bff'} onChange={(event) => set({ profile_accent_color: event.target.value })} className="absolute inset-0 cursor-pointer opacity-0" />
                  </label>
                </div>
              </Field>
            </div>
          </Card>

          <Card title="在线状态" description={`当前：${presenceLabel(presence, presenceText, true)}。修改后立即生效。`} padded>
            <div className={`grid gap-2 ${compact ? 'grid-cols-2' : 'grid-cols-3'}`}>
              {presenceOptions.map((option) => (
                <button key={option.value} type="button" disabled={presenceMutation.isPending}
                  onClick={() => { setPresence(option.value); if (option.value !== 'custom') { setPresenceText(''); savePresence(option.value, ''); } else if (presenceText.trim()) savePresence('custom', presenceText); }}
                  className={`rounded-xl border px-3 py-2 text-left transition disabled:opacity-60 ${presence === option.value ? '[border-color:var(--kc-accent)] [background:var(--kc-accent-soft)]' : '[border-color:var(--kc-border)] hover:[background:var(--kc-hover)]'}`}>
                  <span className="block text-[13px] font-semibold [color:var(--kc-text)]">{option.label}</span>
                  <span className="block truncate text-[11px] [color:var(--kc-muted)]">{option.detail}</span>
                </button>
              ))}
            </div>
            <div className="mt-3">
              <Field label="自定义状态文字" hint="例如：正在画新角色。按回车或离开输入框保存。">
                <input className={inputClass} maxLength={40} value={presenceText} onChange={(event) => setPresenceText(event.target.value)}
                  onKeyDown={(event) => { if (event.key === 'Enter') (event.target as HTMLInputElement).blur(); }}
                  onBlur={() => { if (presenceText !== (user.presence_text ?? '')) { const status = presenceText.trim() ? 'custom' : presence === 'custom' ? 'online' : presence; setPresence(status); savePresence(status, presenceText); } }} />
              </Field>
            </div>
            {presenceMutation.error ? <div className="mt-3"><Notice tone="error">在线状态保存失败，请稍后再试。</Notice></div> : null}
          </Card>
          <PokeSetting user={user} />
          {/* 生日：自己保存，不跟底部的保存条走。服务端没有这个功能时整张卡片不出现 */}
          <BirthdaySetting variant="desktop" />
        </div>

        <aside className={`grid gap-3 ${compact ? '' : 'sticky top-0'}`}>
          <p className="text-xs font-semibold [color:var(--kc-muted)]">预览</p>
          <Preview user={user} draft={draft} />
          <button type="button" className={btn.secondary} onClick={() => void share()}><Icon name="copy" className="h-4 w-4" />{shareState === 'copied' ? '已复制主页链接' : '复制个人主页链接'}</button>
          {shareState !== 'idle' && shareState !== 'copied' ? <Notice tone="error">{shareState}</Notice> : null}
        </aside>
      </div>

      {dirty || save.isPending || save.isError ? (
        <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 shadow-[0_-8px_28px_rgba(15,23,42,.10)] [background:var(--kc-panel)] [border-color:var(--kc-border)]">
          <span className="text-[13px] [color:var(--kc-text)]">{save.isError ? <span className="text-red-500">保存失败：{save.error instanceof Error ? save.error.message : '请稍后再试'}</span> : '有未保存的修改'}</span>
          <div className="flex gap-2">
            <button type="button" className={btn.ghost} disabled={save.isPending} onClick={() => { setDraft(original); save.reset(); }}>撤销</button>
            <button type="button" className={btn.primary} disabled={save.isPending || !dirty} onClick={() => save.mutate(draft)}>{save.isPending ? '保存中…' : '保存修改'}</button>
          </div>
        </div>
      ) : save.isSuccess ? <Notice tone="success">资料已保存。</Notice> : null}
    </SettingsPage>
  );
}
