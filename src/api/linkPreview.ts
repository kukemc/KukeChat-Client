import { apiRequest } from './client';
import { isRecord } from './normalizers';

/**
 * 外站链接的卡片预览（KukeChat-Server 的 app/services/link_preview.py）。
 * GET /link-preview/bilibili?url=…：不是视频链接 422 unsupported_link，拿不到 502 preview_unavailable，旧后端 404。
 */
export interface BilibiliVideoPreview {
  bvid: string;
  aid: number | null;
  title: string;
  /** 封面，i*.hdslb.com 上的图；没有是 null */
  cover: string | null;
  owner_name: string | null;
  /** 时长，秒 */
  duration: number;
  views: number;
  danmaku: number;
  /** 点卡片打开的地址 */
  url: string;
}

function number(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** 回包读不出标题或地址就是 null（不画卡片）。地址只认 http(s)。 */
export function normalizeBilibiliPreview(value: unknown): BilibiliVideoPreview | null {
  if (!isRecord(value) || typeof value.title !== 'string' || !value.title.trim() || typeof value.url !== 'string' || !/^https?:\/\//i.test(value.url)) {
    return null;
  }
  const cover = typeof value.cover === 'string' && /^https?:\/\//i.test(value.cover) ? value.cover.replace(/^http:\/\//i, 'https://') : null;
  return {
    bvid: typeof value.bvid === 'string' ? value.bvid : '',
    aid: typeof value.aid === 'number' ? value.aid : null,
    title: value.title.trim(),
    cover,
    owner_name: typeof value.owner_name === 'string' && value.owner_name.trim() ? value.owner_name.trim() : null,
    duration: Math.max(0, number(value.duration)),
    views: Math.max(0, number(value.views)),
    danmaku: Math.max(0, number(value.danmaku)),
    url: value.url
  };
}

export async function getBilibiliPreview(url: string): Promise<BilibiliVideoPreview | null> {
  return normalizeBilibiliPreview(await apiRequest<unknown>(`/link-preview/bilibili?url=${encodeURIComponent(url)}`));
}
