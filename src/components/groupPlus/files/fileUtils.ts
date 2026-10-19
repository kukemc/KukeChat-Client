import { ApiError } from '@/api/client';
import { downloadGroupFile, getGroupFileLink } from '@/api/groupPlus';
import { toast } from '@/components/ui/toast';
import { isTauriDesktopApp } from '@/utils/appMode';
import type { IconName } from '@/components/ui/Icon';
import type { GroupFileQuota } from '@/types/groupPlus';
import { parseApiDate } from '@/utils/dateTime';
import { groupPlusErrorCode } from '../data';

/** 按类型 / 扩展名选图标：只为一眼认出是什么文件，不求全。 */
export function fileIconName(contentType: string, name: string): IconName {
  const type = contentType.toLowerCase();
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '';
  if (type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) {
    return 'image';
  }
  if (type.startsWith('video/') || ['mp4', 'm4v', 'mov', 'mkv', 'avi', 'webm', 'ogv'].includes(ext)) {
    return 'video';
  }
  if (type.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'flac', 'm4a'].includes(ext)) {
    return 'mic';
  }
  if (['zip', 'rar', '7z', 'tar', 'gz', 'sb3', 'sb2', 'sprite3'].includes(ext) || type.includes('zip') || type.includes('compressed')) {
    return 'fileArchive';
  }
  if (['js', 'ts', 'json', 'py', 'html', 'css', 'xml', 'sh', 'java', 'c', 'cpp'].includes(ext)) {
    return 'code';
  }
  if (type.startsWith('text/') || ['txt', 'md', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv'].includes(ext)) {
    return 'fileText';
  }
  return 'file';
}

function extensionOf(name: string): string {
  return name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '';
}

/** 能交给 <video> 试着放的扩展名 → 用来给经服务器取回的 Blob 标类型（Chromium 主要靠嗅探容器，类型只是兜底）。 */
const PLAYABLE_VIDEO: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/mp4',
  webm: 'video/webm',
  mkv: 'video/webm',
  ogv: 'video/ogg'
};
const UNPLAYABLE_VIDEO_EXTS = ['avi', 'wmv', 'flv', 'rm', 'rmvb', 'mpg', 'mpeg', 'ts', 'vob', '3gp'];
const PLAYABLE_VIDEO_TYPES = ['video/mp4', 'video/x-m4v', 'video/webm', 'video/quicktime', 'video/x-matroska', 'video/ogg'];

/**
 * 文件能不能在应用里点开播放。看扩展名为主（上传时 content_type 常是 octet-stream）；扩展名认不出才看类型。
 * avi / wmv / flv 这类浏览器肯定放不了的不算，卡片照旧只给下载。mkv / mov 里的编码不一定能放，交给播放器报错兜底。
 */
export function isPlayableVideo(contentType: string, name: string): boolean {
  const ext = extensionOf(name);
  if (ext in PLAYABLE_VIDEO) {
    return true;
  }
  if (UNPLAYABLE_VIDEO_EXTS.includes(ext)) {
    return false;
  }
  return PLAYABLE_VIDEO_TYPES.includes(contentType.toLowerCase().split(';')[0].trim());
}

export function videoMimeOf(name: string): string {
  return PLAYABLE_VIDEO[extensionOf(name)] ?? 'video/mp4';
}

/** 过期与否自己按时间算：消息卡片里的 expires_at 是发消息时的快照，不等服务端事件。永久文件（null）不过期。 */
export function isExpiredAt(expiresAt: string | null | undefined, now: number = Date.now()): boolean {
  const time = parseApiDate(expiresAt)?.getTime();
  return time !== undefined && time <= now;
}

/**
 * 把取回的内容交给浏览器保存。当前依赖里没有文件系统插件（Capacitor 的 Filesystem / Share），
 * 所以三端统一走 a[download]：桌面（WebView2）和扩展会弹保存；Android WebView 是否落到「下载」目录取决于系统，
 * 需要在真机上确认，不行再补原生插件。objectURL 延后释放，免得保存还没开始就被回收。
 */
export function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function downloadAndSave(conversationId: number, fileId: number, name: string): Promise<void> {
  if (isTauriDesktopApp()) {
    const url = await getGroupFileLink(conversationId, fileId);
    if (url) {
      await desktopDownload(`${conversationId}-${fileId}-${Date.now()}`, url, name);
      return;
    }
  }
  const tip = toast.info(`正在下载「${name}」`, { duration: 600_000, dedupe: false });
  try {
    saveBlob(await downloadGroupFile(conversationId, fileId), name);
  } finally {
    toast.dismiss(tip);
  }
  toast.success(`「${name}」已开始保存`, { subtitle: '保存在浏览器的下载位置' });
}

function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * 桌面端：交给原生代码直接写进系统「下载」文件夹（src-tauri/src/downloads.rs），提示里显示进度，
 * 完成后给「在文件夹中显示」。WebView2 的 a[download] 会静默落盘，用户会以为点了没反应。
 */
async function desktopDownload(id: string, url: string, name: string): Promise<void> {
  const [{ invoke }, { listen }] = await Promise.all([import('@tauri-apps/api/core'), import('@tauri-apps/api/event')]);
  const tip = toast.info(`正在下载「${name}」`, { subtitle: '准备中…', duration: 600_000, dedupe: false });
  const unlisten = await listen<{ id: string; downloaded: number; total: number | null }>('kukechat-file-download-progress', (event) => {
    if (event.payload.id !== id) {
      return;
    }
    const { downloaded, total } = event.payload;
    toast.update(tip, { subtitle: total ? `${Math.floor((downloaded / total) * 100)}% · ${formatBytes(downloaded)} / ${formatBytes(total)}` : formatBytes(downloaded) });
  });
  let path: string;
  try {
    path = await invoke<string>('desktop_download_file', { id, url, name });
  } catch (error) {
    toast.dismiss(tip);
    throw new Error(typeof error === 'string' ? error : '下载失败，稍后再试。');
  } finally {
    unlisten();
  }
  toast.dismiss(tip);
  const savedName = path.split(/[\\/]/).pop() ?? name;
  toast.success(`已保存「${savedName}」`, {
    subtitle: '在「下载」文件夹里',
    actions: [{ label: '在文件夹中显示', onClick: () => void invoke('desktop_reveal_download', { path }).catch(() => toast.error('文件已不在下载文件夹里')) }]
  });
}

/** 下载失败的说法：已过期、文件已被删、没有权限都要说清，其余直接用服务端的话。 */
export function downloadErrorText(error: unknown): string {
  const code = groupPlusErrorCode(error);
  if (code === 'file_expired' || (error instanceof ApiError && error.status === 410)) {
    return '文件已过期';
  }
  if (code === 'file_not_found' || (error instanceof ApiError && error.status === 404)) {
    return '文件已不存在';
  }
  return error instanceof Error && error.message ? error.message : '下载失败，稍后再试。';
}

/**
 * 一个文件传上去会怎么存（docs/group-plus.md 第 5 节）：
 *   space  放进群空间（按群的默认保留时长，或转永久）
 *   temp   空间不够 / 没有空间：存成 24 小时临时文件，不占空间
 *   reject 连临时文件的上限都超了
 * 旧服务端没有临时文件：剩余空间和单个上限取小的那个，放不下就拒绝。
 */
export type UploadPlan = { kind: 'space' } | { kind: 'temp'; ttlHours: number } | { kind: 'reject'; maxBytes: number };

export interface FileRules {
  /** 现在还剩多少空间 */
  free: number;
  /** 临时文件单个上限；0 = 没有临时文件这回事 */
  tempMax: number;
  tempTtlHours: number;
  /** 这一档有没有群空间（Pro 没有，只能传临时文件） */
  hasSpace: boolean;
  /** 新服务端（有临时文件规则） */
  modern: boolean;
  /** 旧服务端的单文件上限 */
  legacyMax: number;
}

export function fileRules(quota: Pick<GroupFileQuota, 'quota_bytes' | 'used_bytes' | 'max_file_bytes' | 'free_bytes' | 'temp_max_bytes' | 'temp_ttl_hours'>): FileRules {
  const modern = quota.temp_max_bytes !== undefined;
  return {
    free: quota.free_bytes ?? Math.max(0, quota.quota_bytes - quota.used_bytes),
    tempMax: modern ? quota.temp_max_bytes ?? 0 : 0,
    tempTtlHours: quota.temp_ttl_hours ?? 24,
    hasSpace: quota.quota_bytes > 0,
    modern,
    legacyMax: quota.max_file_bytes
  };
}

/** reserved：同一批里已经排进去、还没传完的文件占掉的空间 */
export function planUpload(rules: FileRules, size: number, reserved = 0): UploadPlan {
  const free = Math.max(0, rules.free - reserved);
  if (!rules.modern) {
    return size <= Math.min(free, rules.legacyMax) ? { kind: 'space' } : { kind: 'reject', maxBytes: Math.min(free, rules.legacyMax) };
  }
  if (size <= free) {
    return { kind: 'space' };
  }
  if (size <= rules.tempMax) {
    return { kind: 'temp', ttlHours: rules.tempTtlHours };
  }
  return { kind: 'reject', maxBytes: Math.max(free, rules.tempMax) };
}
