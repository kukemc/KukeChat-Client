import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useQuery } from '@tanstack/react-query';
import { parseApiDate } from '@/utils/dateTime';
import { getAnnouncements } from '@/api/announcements';
import { resolveAssetUrl } from '@/utils/assetUrl';

// 系统公告（更新日志）的数据，手机端的公告页和桌面端的对话框共用。

export interface AnnouncementModalProps {
  /** 打开时先显示哪一条（只有桌面端用，手机端从列表进） */
  initialId?: number | null;
  mobile?: boolean;
  onClose: () => void;
}

export function formatAnnouncementDate(value?: string | null, withTime = true): string {
  if (!value) {
    return '';
  }
  // 服务端的时间不带时区、内容是 UTC：用 parseApiDate，直接 new Date 会早 8 小时
  const date = parseApiDate(value);
  if (!date) {
    return '';
  }
  const pad = (n: number): string => (n < 10 ? `0${n}` : String(n));
  const base = `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
  return withTime ? `${base} ${pad(date.getHours())}:${pad(date.getMinutes())}` : base;
}

export function useAnnouncementList() {
  return useQuery({ queryKey: ['announcement', 'list'], queryFn: getAnnouncements, staleTime: 30_000 });
}

/**
 * 正文里所有图片的地址（已解析成可直接用的 URL），顺序和正文里出现的一致。
 *
 * 只用于「点开看大图」时的左右切换：Markdown 里那张图点了之后，从这里找到
 * 同下标，大图浮层就能前后翻。识别规则和 Markdown.tsx 的图片语法保持一致
 * （`![alt](url)`，url 里不能有空格和尖括号）。
 */
export function announcementImageUrls(content?: string | null): string[] {
  if (!content) {
    return [];
  }
  const pattern = /!\[[^\]\n]{0,80}\]\(([^\s)<>]{1,500})\)/g;
  const urls: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    // 和 Markdown.tsx 一样只认 http(s) 的图片地址
    if (!/^https?:\/\//i.test(match[1]) && !match[1].startsWith('/')) {
      continue;
    }
    const resolved = resolveAssetUrl(match[1]);
    if (resolved && !urls.includes(resolved)) {
      urls.push(resolved);
    }
  }
  return urls;
}

/** 正文图片列表（带 memo），供大图浮层用。 */
export function useAnnouncementImageUrls(content?: string | null): string[] {
  return useMemo(() => announcementImageUrls(content), [content]);
}

/**
 * 封面图加载到哪一步了：没到之前放占位，到了淡入，坏了就不显示。
 * 返回的三样原样交给 <img>。
 */
export function useCoverImage(): { status: 'loading' | 'loaded' | 'failed'; ref: RefObject<HTMLImageElement>; onLoad: () => void; onError: () => void } {
  const ref = useRef<HTMLImageElement>(null);
  const [status, setStatus] = useState<'loading' | 'loaded' | 'failed'>('loading');

  // 缓存里有的图挂上去就已经加载完了，赶在第一次绘制之前认出来，不放一遍占位和淡入
  useLayoutEffect(() => {
    const image = ref.current;
    if (image?.complete) {
      setStatus(image.naturalWidth > 0 ? 'loaded' : 'failed');
    }
  }, []);

  return { status, ref, onLoad: () => setStatus('loaded'), onError: () => setStatus('failed') };
}
