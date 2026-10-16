import { ApiError } from '@/api/client';
import { downloadGroupFile } from '@/api/groupPlus';
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
  if (type.startsWith('video/') || ['mp4', 'mov', 'mkv', 'avi', 'webm'].includes(ext)) {
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
  saveBlob(await downloadGroupFile(conversationId, fileId), name);
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
