import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ccwWorkDetailUrl } from '@/config';
import { getTeamupCreationPreview, saveMyTeamupProfile, uploadTeamupImage } from '@/api/teamup';
import type { IconName } from '@/components/ui/Icon';
import type { CcwCreationPreview, SaveTeamupProfilePayload, TeamupProfile, TeamupSkill, TeamupSkillItem, TeamupSkillLevel } from '@/types/api';
import { resolveThumbnailUrl } from '@/utils/assetUrl';
import { extractCcwCreationRefs } from '@/utils/ccwLinks';
import { errorMessage, stripCcwLinks } from './teamupModel';

const SKILL_LEVELS: TeamupSkillLevel[] = ['beginner', 'skilled', 'expert'];
export const MAX_IMAGES = 9;
export const MAX_WORKS = 6;
const MAX_SKILLS = 8;

export type MarkdownTool = 'bold' | 'italic' | 'heading' | 'list' | 'quote' | 'code' | 'link';

export const MARKDOWN_TOOLS: Array<{ kind: MarkdownTool; icon: IconName; label: string }> = [
  { kind: 'bold', icon: 'bold', label: '加粗' },
  { kind: 'italic', icon: 'italic', label: '斜体' },
  { kind: 'heading', icon: 'heading', label: '标题' },
  { kind: 'list', icon: 'list', label: '列表' },
  { kind: 'quote', icon: 'quote', label: '引用' },
  { kind: 'code', icon: 'code', label: '代码' },
  { kind: 'link', icon: 'link', label: '链接' }
];

export interface WorkItem {
  oid: string;
  accessKey?: string;
  preview?: CcwCreationPreview;
  loading: boolean;
  error?: string;
}

export interface StagedImage {
  id: string;
  /** 上传成功后才有；提交时只带有它的图片 */
  url?: string;
  previewUrl: string;
  uploading: boolean;
  error?: string;
}

/**
 * 名片编辑器的表单状态和提交，桌面版和移动版共用。
 * 代表作不单独存：保存时把作品链接拼到介绍末尾，打开时再从介绍里解析出来。
 */
export function useTeamupEditor(profile: TeamupProfile | null, onSaved: (profile: TeamupProfile) => void) {
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

  // 新加进来的作品逐个去取预览
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
    setSkills((previous) => (previous.some((item) => item.skill === skill) ? previous.filter((item) => item.skill !== skill) : previous.length >= MAX_SKILLS ? previous : [...previous, { skill, level: 'skilled' }]));
  }

  function cycleSkillLevel(skill: TeamupSkill): void {
    setSkills((previous) => previous.map((item) => {
      if (item.skill !== skill) return item;
      const nextIndex = (SKILL_LEVELS.indexOf(item.level) + 1) % SKILL_LEVELS.length;
      return { ...item, level: SKILL_LEVELS[nextIndex] };
    }));
  }

  function toggleLookingFor(skill: TeamupSkill): void {
    setLookingFor((previous) => (previous.includes(skill) ? previous.filter((item) => item !== skill) : previous.length >= MAX_SKILLS ? previous : [...previous, skill]));
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

  /** 给选中的文字套上 Markdown 记号；没选中时插入一段占位文字，光标停在记号里面。 */
  function applyMarkdown(kind: MarkdownTool): void {
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

  return {
    headline, setHeadline,
    intro, setIntro, introRef, introPreview, setIntroPreview, applyMarkdown,
    skills, skillKeys, toggleSkill, cycleSkillLevel,
    lookingFor, toggleLookingFor,
    contactNote, setContactNote,
    images, fileInputRef, uploadImages, removeImage,
    background, setBackground, backgroundInputRef, uploadBackground,
    works, workInput, setWorkInput, addWork, removeWork,
    formError, uploading, parsingWorks, saveMutation, submit
  };
}

export type TeamupEditorState = ReturnType<typeof useTeamupEditor>;
