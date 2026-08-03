import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ccwWorkDetailUrl } from '@/config';
import { getTeamupCreationPreview, saveMyTeamupProfile, uploadTeamupImage } from '@/api/teamup';
import type { CcwCreationPreview, SaveTeamupProfilePayload, TeamupProfile, TeamupSkill, TeamupSkillItem, TeamupSkillLevel } from '@/types/api';
import { Icon, type IconName } from '@/components/ui/Icon';
import { CcwCreationCard } from '@/components/ui/CcwCreationCard';
import { Markdown } from '@/components/ui/Markdown';
import { resolveThumbnailUrl } from '@/utils/assetUrl';
import { extractCcwCreationRefs, CCW_CREATION_URL_PATTERN, type CcwCreationRef } from '@/utils/ccwLinks';
import { SKILL_LEVEL_LABEL, SKILL_META } from './teamupConstants';

const SKILL_LEVELS: TeamupSkillLevel[] = ['beginner', 'skilled', 'expert'];
const MAX_IMAGES = 9;
const MAX_WORKS = 6;

interface WorkItem {
  oid: string;
  accessKey?: string;
  preview?: CcwCreationPreview;
  loading: boolean;
  error?: string;
}

interface StagedImage {
  id: string;
  url?: string;
  previewUrl: string;
  uploading: boolean;
  error?: string;
}

function stripCcwLinks(text: string): string {
  return text.replace(CCW_CREATION_URL_PATTERN, ' ').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function refKey(ref: CcwCreationRef): string {
  return `${ref.oid}:${ref.accessKey ?? ''}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '请求失败，请稍后再试';
}

export function TeamupEditorModal({ profile, onClose, onSaved, isMobile }: { profile: TeamupProfile | null; onClose: () => void; onSaved: (profile: TeamupProfile) => void; isMobile?: boolean }): JSX.Element {
  const [headline, setHeadline] = useState(profile?.headline ?? '');
  const [intro, setIntro] = useState(() => stripCcwLinks(profile?.intro ?? ''));
  const [skills, setSkills] = useState<TeamupSkillItem[]>(profile?.skills ?? []);
  const [lookingFor, setLookingFor] = useState<TeamupSkill[]>(profile?.looking_for ?? []);
  const [contactNote, setContactNote] = useState(profile?.contact_note ?? '');
  const [images, setImages] = useState<StagedImage[]>(() => (profile?.image_urls ?? []).map((url, index) => ({ id: `existing-${index}`, url, previewUrl: resolveThumbnailUrl(url) ?? url, uploading: false })));
  const [background, setBackground] = useState<StagedImage | null>(() => (profile?.background_url ? { id: 'existing-bg', url: profile.background_url, previewUrl: resolveThumbnailUrl(profile.background_url) ?? profile.background_url, uploading: false } : null));
  const [works, setWorks] = useState<WorkItem[]>(() => extractCcwCreationRefs(profile?.intro ?? '', MAX_WORKS).map((ref) => ({ oid: ref.oid, accessKey: ref.accessKey, loading: true })));
  const [workInput, setWorkInput] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [introPreview, setIntroPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const backgroundInputRef = useRef<HTMLInputElement | null>(null);
  const introRef = useRef<HTMLTextAreaElement | null>(null);

  const saveMutation = useMutation({
    mutationFn: (payload: SaveTeamupProfilePayload) => saveMyTeamupProfile(payload),
    onSuccess: (saved) => onSaved(saved),
    onError: (error) => setFormError(errorMessage(error))
  });

  useEffect(() => {
    const pending = works.filter((work) => work.loading && work.preview === undefined && work.error === undefined);
    if (pending.length === 0) {
      return;
    }
    let cancelled = false;
    for (const work of pending) {
      void getTeamupCreationPreview(work.oid, work.accessKey)
        .then((preview) => {
          if (cancelled) return;
          setWorks((previous) => previous.map((item) => (item.oid === work.oid ? { ...item, preview, loading: false } : item)));
        })
        .catch(() => {
          if (cancelled) return;
          setWorks((previous) => previous.map((item) => (item.oid === work.oid ? { ...item, error: '解析失败', loading: false } : item)));
        });
    }
    return () => {
      cancelled = true;
    };
  }, [works]);

  const skillKeys = useMemo(() => new Set(skills.map((item) => item.skill)), [skills]);

  function toggleSkill(skill: TeamupSkill): void {
    setSkills((previous) => (previous.some((item) => item.skill === skill) ? previous.filter((item) => item.skill !== skill) : previous.length >= 8 ? previous : [...previous, { skill, level: 'skilled' }]));
  }

  function cycleSkillLevel(skill: TeamupSkill): void {
    setSkills((previous) => previous.map((item) => {
      if (item.skill !== skill) return item;
      const nextIndex = (SKILL_LEVELS.indexOf(item.level) + 1) % SKILL_LEVELS.length;
      return { ...item, level: SKILL_LEVELS[nextIndex] };
    }));
  }

  function toggleLookingFor(skill: TeamupSkill): void {
    setLookingFor((previous) => (previous.includes(skill) ? previous.filter((item) => item !== skill) : previous.length >= 8 ? previous : [...previous, skill]));
  }

  function addWork(): void {
    const refs = extractCcwCreationRefs(workInput, 1);
    if (refs.length === 0) {
      setFormError('请输入有效的 CCW 作品链接');
      return;
    }
    const ref = refs[0];
    if (works.some((item) => item.oid === ref.oid)) {
      setWorkInput('');
      return;
    }
    if (works.length >= MAX_WORKS) {
      setFormError(`最多添加 ${MAX_WORKS} 个代表作`);
      return;
    }
    setFormError(null);
    setWorks((previous) => [...previous, { oid: ref.oid, accessKey: ref.accessKey, loading: true }]);
    setWorkInput('');
  }

  function removeWork(oid: string): void {
    setWorks((previous) => previous.filter((item) => item.oid !== oid));
  }

  function uploadImages(files: FileList | null): void {
    if (!files || files.length === 0) {
      return;
    }
    const remaining = MAX_IMAGES - images.length;
    const selected = Array.from(files).slice(0, Math.max(0, remaining));
    for (const file of selected) {
      const id = `staged-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const previewUrl = URL.createObjectURL(file);
      setImages((previous) => [...previous, { id, previewUrl, uploading: true }]);
      void uploadTeamupImage(file)
        .then((result) => {
          setImages((previous) => previous.map((item) => (item.id === id ? { ...item, url: result.url, previewUrl: resolveThumbnailUrl(result.url, result.thumbnail_url) ?? result.url, uploading: false } : item)));
        })
        .catch((error: unknown) => {
          setImages((previous) => previous.map((item) => (item.id === id ? { ...item, uploading: false, error: errorMessage(error) } : item)));
        });
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function removeImage(id: string): void {
    setImages((previous) => previous.filter((item) => item.id !== id));
  }

  function uploadBackground(files: FileList | null): void {
    const file = files?.[0];
    if (!file) {
      return;
    }
    const id = `bg-${Date.now()}`;
    setBackground({ id, previewUrl: URL.createObjectURL(file), uploading: true });
    void uploadTeamupImage(file)
      .then((result) => {
        setBackground({ id, url: result.url, previewUrl: resolveThumbnailUrl(result.url, result.thumbnail_url) ?? result.url, uploading: false });
      })
      .catch((error: unknown) => {
        setBackground({ id, previewUrl: '', uploading: false, error: errorMessage(error) });
      });
    if (backgroundInputRef.current) {
      backgroundInputRef.current.value = '';
    }
  }

  function applyMarkdown(kind: 'bold' | 'italic' | 'heading' | 'list' | 'quote' | 'link' | 'code'): void {
    const textarea = introRef.current;
    if (!textarea) {
      return;
    }
    const start = textarea.selectionStart ?? intro.length;
    const end = textarea.selectionEnd ?? intro.length;
    const selected = intro.slice(start, end);
    let replacement = selected;
    let caretOffset = 0;
    switch (kind) {
      case 'bold':
        replacement = `**${selected || '加粗文字'}**`;
        caretOffset = selected ? 0 : 2;
        break;
      case 'italic':
        replacement = `*${selected || '斜体文字'}*`;
        caretOffset = selected ? 0 : 1;
        break;
      case 'heading':
        replacement = `## ${selected || '小标题'}`;
        break;
      case 'list':
        replacement = (selected || '列表项').split('\n').map((line) => `- ${line}`).join('\n');
        break;
      case 'quote':
        replacement = `> ${selected || '引用内容'}`;
        break;
      case 'code':
        replacement = selected.includes('\n') ? `\`\`\`\n${selected || '代码'}\n\`\`\`` : `\`${selected || '代码'}\``;
        caretOffset = selected ? 0 : 1;
        break;
      case 'link':
        replacement = `[${selected || '链接文字'}](https://)`;
        break;
    }
    const next = intro.slice(0, start) + replacement + intro.slice(end);
    setIntro(next);
    requestAnimationFrame(() => {
      const node = introRef.current;
      if (!node) {
        return;
      }
      node.focus();
      const cursor = selected ? start + replacement.length : start + replacement.length - caretOffset;
      node.setSelectionRange(cursor, cursor);
    });
  }

  const uploading = images.some((item) => item.uploading) || (background?.uploading ?? false);
  const parsingWorks = works.some((item) => item.loading);

  function submit(): void {
    const trimmedHeadline = headline.trim();
    if (!trimmedHeadline) {
      setFormError('请填写一句话招募标题');
      return;
    }
    const readyImages = images.filter((item) => item.url).map((item) => item.url as string);
    if (uploading) {
      setFormError('图片还在上传中，请稍候');
      return;
    }
    const workLinks = works.map((work) => ccwWorkDetailUrl(work.oid, work.accessKey));
    const combinedIntro = [stripCcwLinks(intro), ...workLinks].filter(Boolean).join('\n').trim();
    setFormError(null);
    saveMutation.mutate({
      headline: trimmedHeadline,
      intro: combinedIntro,
      skills,
      looking_for: lookingFor,
      image_urls: readyImages,
      background_url: background?.url ?? null,
      contact_note: contactNote.trim() || null,
      status: profile?.status ?? 'recruiting'
    });
  }

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/35 p-4 backdrop-blur-sm">
      <div className={`kc-pc-dialog flex max-h-[min(840px,calc(100vh-48px))] w-full ${isMobile ? 'max-w-lg' : 'max-w-3xl'} flex-col overflow-hidden rounded-[26px] border shadow-[0_24px_80px_rgba(15,23,42,0.22)] [background:var(--kc-panel)] [border-color:var(--kc-border)]`}>
        <div className="flex shrink-0 items-center justify-between border-b px-5 py-4 [border-color:var(--kc-border)]">
          <div>
            <h3 className="text-base font-black [color:var(--kc-text)]">{profile ? '编辑组队名片' : '发布组队名片'}</h3>
            <p className="mt-1 text-xs [color:var(--kc-muted)]">完善资料后将提交审核，通过后展示在组队广场。</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl transition hover:[background:var(--kc-hover)]"><Icon name="close" className="h-4 w-4" /></button>
        </div>

        <div className="scroll-soft kc-pc-stagger min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          {formError ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{formError}</div> : null}

          <div className="block">
            <span className="mb-1.5 block text-xs font-bold [color:var(--kc-muted)]">名片背景图 <span className="font-semibold opacity-70">将作为名片详情页背景，经过审核</span></span>
            {background ? (
              <div className="group relative h-32 overflow-hidden rounded-2xl border [border-color:var(--kc-border)] [background:var(--kc-panel-muted)]">
                {background.previewUrl ? <img src={background.previewUrl} alt="" className="h-full w-full object-cover" /> : null}
                {background.uploading ? <span className="absolute inset-0 grid place-items-center bg-black/40 text-xs font-bold text-white">上传中…</span> : null}
                {background.error ? <span className="absolute inset-0 grid place-items-center bg-red-500/60 p-2 text-center text-[11px] font-bold text-white">{background.error}</span> : null}
                <div className="absolute right-2 top-2 flex gap-1.5 opacity-0 transition group-hover:opacity-100">
                  <button type="button" onClick={() => backgroundInputRef.current?.click()} className="rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-bold text-white">更换</button>
                  <button type="button" onClick={() => setBackground(null)} className="grid h-6 w-6 place-items-center rounded-full bg-black/55 text-white"><Icon name="close" className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => backgroundInputRef.current?.click()} className="flex h-24 w-full items-center justify-center gap-2 rounded-2xl border border-dashed text-sm font-bold [border-color:var(--kc-border)] [color:var(--kc-muted)] transition hover:[background:var(--kc-hover)] hover:[color:var(--kc-accent)]">
                <Icon name="image" className="h-5 w-5" />上传背景图
              </button>
            )}
            <input ref={backgroundInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(event) => uploadBackground(event.target.files)} />
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs font-bold [color:var(--kc-muted)]">一句话招募标题 <span className="text-red-500">*</span></span>
            <input value={headline} onChange={(event) => setHeadline(event.target.value)} maxLength={120} placeholder="例如：寻找擅长像素美术的搭档，一起做 Roguelike" className="glass-input w-full rounded-2xl px-4 py-3 text-sm outline-none" />
          </label>

          <div className="block">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-bold [color:var(--kc-muted)]">个人介绍 <span className="font-semibold opacity-70">支持 Markdown</span></span>
              <div className="flex items-center gap-1 rounded-full p-0.5 text-xs font-bold [background:var(--kc-panel-muted)]">
                <button type="button" onClick={() => setIntroPreview(false)} className={`rounded-full px-2.5 py-1 transition ${introPreview ? '[color:var(--kc-muted)]' : 'shadow-sm [background:var(--kc-panel)] [color:var(--kc-accent)]'}`}>编辑</button>
                <button type="button" onClick={() => setIntroPreview(true)} className={`rounded-full px-2.5 py-1 transition ${introPreview ? 'shadow-sm [background:var(--kc-panel)] [color:var(--kc-accent)]' : '[color:var(--kc-muted)]'}`}>预览</button>
              </div>
            </div>
            {introPreview ? (
              <div className="min-h-44 rounded-2xl border px-4 py-3 text-sm [border-color:var(--kc-border)] [background:var(--kc-panel-muted)]">
                {intro.trim() ? <Markdown content={intro} className="[color:var(--kc-text)]" /> : <span className="text-sm [color:var(--kc-muted)]">暂无内容，切换到“编辑”开始撰写。</span>}
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border [border-color:var(--kc-border)] focus-within:[border-color:var(--kc-accent)]">
                <div className="flex flex-wrap items-center gap-0.5 border-b px-2 py-1.5 [border-color:var(--kc-border)] [background:var(--kc-panel-muted)]">
                  {([
                    { kind: 'bold', icon: 'bold', label: '加粗' },
                    { kind: 'italic', icon: 'italic', label: '斜体' },
                    { kind: 'heading', icon: 'heading', label: '标题' },
                    { kind: 'list', icon: 'list', label: '列表' },
                    { kind: 'quote', icon: 'quote', label: '引用' },
                    { kind: 'code', icon: 'code', label: '代码' },
                    { kind: 'link', icon: 'link', label: '链接' }
                  ] as Array<{ kind: 'bold' | 'italic' | 'heading' | 'list' | 'quote' | 'code' | 'link'; icon: IconName; label: string }>).map((tool) => (
                    <button key={tool.kind} type="button" title={tool.label} onClick={() => applyMarkdown(tool.kind)} className="grid h-7 w-7 place-items-center rounded-lg [color:var(--kc-muted)] transition hover:[background:var(--kc-panel)] hover:[color:var(--kc-accent)]">
                      <Icon name={tool.icon} className="h-3.5 w-3.5" />
                    </button>
                  ))}
                </div>
                <textarea ref={introRef} value={intro} onChange={(event) => setIntro(event.target.value)} maxLength={2000} placeholder={'介绍你的经验、风格、可投入时间和期待的合作方式。\n\n支持 **加粗**、*斜体*、## 标题、- 列表、> 引用、`代码` 等 Markdown 语法。'} className="block min-h-44 w-full resize-y bg-transparent px-4 py-3 text-sm leading-6 outline-none [color:var(--kc-text)]" />
              </div>
            )}
            <div className="mt-1 text-right text-[11px] [color:var(--kc-muted)]">{intro.length}/2000</div>
          </div>

          <section className="rounded-2xl border p-4 [border-color:var(--kc-border)]">
            <h4 className="text-sm font-black [color:var(--kc-text)]">我擅长（点击标签可切换熟练度）</h4>
            <div className="mt-3 flex flex-wrap gap-2">
              {SKILL_META.map((meta) => {
                const active = skillKeys.has(meta.key);
                const item = skills.find((entry) => entry.skill === meta.key);
                return (
                  <span key={meta.key} className={`kc-pc-chip inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition ${active ? 'kc-pc-chip-active [background:var(--kc-accent-soft)] [border-color:var(--kc-accent)] [color:var(--kc-accent)]' : '[border-color:var(--kc-border)] [color:var(--kc-muted)]'}`}>
                    <button type="button" onClick={() => (active ? cycleSkillLevel(meta.key) : toggleSkill(meta.key))} className="inline-flex items-center gap-1.5">
                      <Icon name={meta.icon} className="h-3.5 w-3.5" />
                      {meta.label}
                      {active && item ? <span className="rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] [color:var(--kc-accent)]">{SKILL_LEVEL_LABEL[item.level]}</span> : null}
                    </button>
                    {active ? <button type="button" onClick={() => toggleSkill(meta.key)} className="grid h-3.5 w-3.5 place-items-center opacity-60 hover:opacity-100"><Icon name="close" className="h-3 w-3" /></button> : null}
                  </span>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border p-4 [border-color:var(--kc-border)]">
            <h4 className="text-sm font-black [color:var(--kc-text)]">我想找</h4>
            <div className="mt-3 flex flex-wrap gap-2">
              {SKILL_META.map((meta) => {
                const active = lookingFor.includes(meta.key);
                return (
                  <button key={meta.key} type="button" onClick={() => toggleLookingFor(meta.key)} className={`kc-pc-chip inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition ${active ? 'kc-pc-chip-active [background:var(--kc-accent-soft)] [border-color:var(--kc-accent)] [color:var(--kc-accent)]' : '[border-color:var(--kc-border)] [color:var(--kc-muted)]'}`}>
                    <Icon name={meta.icon} className="h-3.5 w-3.5" />
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border p-4 [border-color:var(--kc-border)]">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-black [color:var(--kc-text)]">配图</h4>
              <span className="text-xs [color:var(--kc-muted)]">{images.length}/{MAX_IMAGES}</span>
            </div>
            <p className="mt-1 text-xs [color:var(--kc-muted)]">图片会经过审核，通过后才会公开展示。</p>
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {images.map((image) => (
                <div key={image.id} className="group relative aspect-square overflow-hidden rounded-2xl border [border-color:var(--kc-border)] [background:var(--kc-panel-muted)]">
                  <img src={image.previewUrl} alt="" className="h-full w-full object-cover" />
                  {image.uploading ? <span className="absolute inset-0 grid place-items-center bg-black/40 text-xs font-bold text-white">上传中…</span> : null}
                  {image.error ? <span className="absolute inset-0 grid place-items-center bg-red-500/60 p-1 text-center text-[10px] font-bold text-white">{image.error}</span> : null}
                  <button type="button" onClick={() => removeImage(image.id)} className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-black/55 text-white opacity-0 transition group-hover:opacity-100"><Icon name="close" className="h-3.5 w-3.5" /></button>
                </div>
              ))}
              {images.length < MAX_IMAGES ? (
                <button type="button" onClick={() => fileInputRef.current?.click()} className="grid aspect-square place-items-center rounded-2xl border border-dashed [border-color:var(--kc-border)] [color:var(--kc-muted)] transition hover:[background:var(--kc-hover)] hover:[color:var(--kc-accent)]">
                  <span className="grid place-items-center"><Icon name="plus" className="h-5 w-5" /><span className="mt-1 text-[11px] font-bold">添加</span></span>
                </button>
              ) : null}
            </div>
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple className="hidden" onChange={(event) => uploadImages(event.target.files)} />
          </section>

          <section className="rounded-2xl border p-4 [border-color:var(--kc-border)]">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-black [color:var(--kc-text)]">代表作</h4>
              <span className="text-xs [color:var(--kc-muted)]">{works.length}/{MAX_WORKS}</span>
            </div>
            <p className="mt-1 text-xs [color:var(--kc-muted)]">粘贴 CCW 作品链接，自动解析为作品卡片。</p>
            <div className="mt-3 flex gap-2">
              <input value={workInput} onChange={(event) => setWorkInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addWork(); } }} placeholder="https://www.ccw.site/detail/..." className="glass-input min-w-0 flex-1 rounded-2xl px-4 py-2.5 text-sm outline-none" />
              <button type="button" onClick={addWork} className="liquid-button shrink-0 rounded-2xl px-4 py-2.5 text-sm font-black"><Icon name="plus" className="mr-1 inline h-3.5 w-3.5" />添加</button>
            </div>
            <div className="mt-3 space-y-2">
              {works.map((work) => (
                <div key={work.oid} className="kc-pc-card-motion relative">
                  {work.loading ? (
                    <div className="flex items-center gap-3 rounded-[20px] border p-3 [border-color:var(--kc-border)] [background:var(--kc-panel-muted)]">
                      <span className="h-16 w-28 shrink-0 animate-pulse rounded-2xl [background:var(--kc-panel)]" />
                      <div className="flex-1 space-y-2"><span className="block h-3 w-1/2 animate-pulse rounded [background:var(--kc-panel)]" /><span className="block h-3 w-2/3 animate-pulse rounded [background:var(--kc-panel)]" /></div>
                    </div>
                  ) : work.error ? (
                    <div className="flex items-center justify-between rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                      <span>作品解析失败：{work.oid}</span>
                      <button type="button" onClick={() => removeWork(work.oid)} className="rounded-lg px-2 py-1 text-xs font-bold hover:bg-red-100">移除</button>
                    </div>
                  ) : (
                    <>
                      <CcwCreationCard oid={work.oid} accessKey={work.accessKey} preview={work.preview} />
                      <button type="button" onClick={() => removeWork(work.oid)} className="absolute right-2 top-2 z-10 grid h-7 w-7 place-items-center rounded-full bg-black/55 text-white transition hover:bg-black/70"><Icon name="close" className="h-3.5 w-3.5" /></button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </section>

          <label className="block">
            <span className="mb-1.5 block text-xs font-bold [color:var(--kc-muted)]">联系备注</span>
            <input value={contactNote} onChange={(event) => setContactNote(event.target.value)} maxLength={200} placeholder="例如：优先加好友私聊，或说明你的时区/在线时间" className="glass-input w-full rounded-2xl px-4 py-3 text-sm outline-none" />
          </label>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t px-5 py-4 [border-color:var(--kc-border)]">
          <p className="hidden text-xs [color:var(--kc-muted)] sm:block">{parsingWorks ? '正在解析代表作…' : '保存后会重新进入审核。'}</p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="ghost-button rounded-2xl px-4 py-2.5 text-sm font-bold">取消</button>
            <button type="button" onClick={submit} disabled={!headline.trim() || uploading || saveMutation.isPending} className="liquid-button rounded-2xl px-4 py-2.5 text-sm font-black disabled:cursor-not-allowed disabled:opacity-50">{saveMutation.isPending ? '提交中…' : profile ? '保存名片' : '发布名片'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
