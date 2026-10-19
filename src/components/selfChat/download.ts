import { ApiError } from '@/api/client';
import { downloadSelfTransferViaServer, getSelfTransferLink, selfChatErrorCode } from '@/api/selfChat';
import { desktopDownload, saveBlob } from '@/components/groupPlus/files/fileUtils';
import { toast } from '@/components/ui/toast';
import { isTauriDesktopApp } from '@/utils/appMode';

/**
 * 下载一个临时文件（self-chat.md 5.2）：优先要 5 分钟有效的直连地址（/link），服务器没开直连（409）再走带鉴权的 /download。
 * 桌面端交给原生下载（写进「下载」文件夹，提示里有进度）；网页 / 扩展把直连地址交给浏览器下载
 * （地址被签成 attachment，不会把当前页面跳走），经后端的那条只能整份取回再保存。
 * 过期（410）、不存在（404）照常抛出，由卡片置灰。
 */
export async function downloadSelfTransfer(conversationId: number, transferId: number, name: string): Promise<void> {
  const url = await getSelfTransferLink(conversationId, transferId);
  if (url && isTauriDesktopApp()) {
    await desktopDownload(`self-${conversationId}-${transferId}-${Date.now()}`, url, name);
    return;
  }
  if (url) {
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    toast.success(`「${name}」开始下载`, { subtitle: '保存在浏览器的下载位置' });
    return;
  }
  const tip = toast.info(`正在下载「${name}」`, { duration: 600_000, dedupe: false });
  try {
    saveBlob(await downloadSelfTransferViaServer(conversationId, transferId), name);
  } finally {
    toast.dismiss(tip);
  }
  toast.success(`「${name}」已开始保存`, { subtitle: '保存在浏览器的下载位置' });
}

/** 下载失败是不是因为文件没了（过期、被撤回、过期太久记录被清掉）：卡片据此变成「已过期」 */
export function isTransferGoneError(error: unknown): boolean {
  const code = selfChatErrorCode(error);
  return code === 'file_expired' || code === 'transfer_not_found' || (error instanceof ApiError && (error.status === 410 || error.status === 404));
}

export function transferDownloadErrorText(error: unknown): string {
  if (isTransferGoneError(error)) {
    return '文件已过期';
  }
  if (selfChatErrorCode(error) === 'upload_incomplete') {
    return '文件还没传完，稍后再试';
  }
  return error instanceof Error && error.message ? error.message : '下载失败，稍后再试。';
}
