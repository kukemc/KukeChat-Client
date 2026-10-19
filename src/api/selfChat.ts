import type { Conversation, Message, SelfTransfer, SelfTransferCreated, SelfTransferList } from '@/types/api';
import { useKukeStore } from '@/store/kukeStore';
import { normalizeSelfConversation } from '@/utils/selfChat';
import { ApiError, apiDownloadBlob, apiPutWithProgress, apiRequest, putToSignedUrl } from './client';
import { isRecord } from './normalizers';

/*
 * 「我的设备」会话的接口（KukeChat-Server/docs/self-chat.md）。
 *
 * 会话本身：GET /conversations/self 负责创建（服务端不会在别处替我们建），之后 GET /conversations?include_self=true 才会带上它。
 * 旧后端没有这个接口（/conversations/self 会被当成 /conversations/{id} 的参数校验失败 422，或者 404）：
 * 记下来，之后不再请求，整个功能悄悄不出现。
 */

/** detail 里的 code（新接口的错误是 { code, message }） */
export function selfChatErrorCode(error: unknown): string | null {
  const detail = selfChatErrorDetail(error);
  return typeof detail.code === 'string' ? detail.code : null;
}

export function selfChatErrorDetail(error: unknown): Record<string, unknown> {
  if (!(error instanceof ApiError) || !isRecord(error.detail)) {
    return {};
  }
  return isRecord(error.detail.detail) ? error.detail.detail : error.detail;
}

export async function getSelfConversation(): Promise<Conversation> {
  return normalizeSelfConversation(await apiRequest<Conversation>('/conversations/self'));
}

type SelfSupport = { token: string; state: 'supported'; conversation: Conversation } | { token: string; state: 'unsupported' } | { token: string; state: 'pending'; promise: Promise<Conversation | null> };

let support: SelfSupport | null = null;

/**
 * 确保「我的设备」会话已经建好，返回它；后端不支持返回 null。
 * 每次登录只成功请求一次；网络错误、5xx 不记，下次拉会话列表时再试。
 */
export function ensureSelfConversation(): Promise<Conversation | null> {
  const token = useKukeStore.getState().token ?? '';
  if (support && support.token === token) {
    if (support.state === 'supported') {
      return Promise.resolve(support.conversation);
    }
    if (support.state === 'unsupported') {
      return Promise.resolve(null);
    }
    return support.promise;
  }
  const promise = getSelfConversation().then((conversation) => {
    if (support?.token === token) {
      support = conversation.type === 'self' ? { token, state: 'supported', conversation } : { token, state: 'unsupported' };
    }
    return conversation.type === 'self' ? conversation : null;
  }, (error: unknown) => {
    // 旧后端：路由不存在（404 / 405），或者 self 被当成会话 id 校验失败（422）
    const missing = error instanceof ApiError && (error.status === 404 || error.status === 405 || error.status === 422);
    if (support?.token === token) {
      support = missing ? { token, state: 'unsupported' } : null;
    }
    return null;
  });
  support = { token, state: 'pending', promise };
  return promise;
}

// ───────── 临时文件（第 5 节） ─────────

export async function getSelfTransfers(conversationId: number): Promise<SelfTransferList> {
  const response = await apiRequest<SelfTransferList>(`/conversations/${conversationId}/transfers`, { cache: 'no-store' });
  return {
    items: Array.isArray(response?.items) ? response.items : [],
    max_file_bytes: typeof response?.max_file_bytes === 'number' ? response.max_file_bytes : 0,
    quota_bytes: typeof response?.quota_bytes === 'number' ? response.quota_bytes : 0,
    used_bytes: typeof response?.used_bytes === 'number' ? response.used_bytes : 0,
    free_bytes: typeof response?.free_bytes === 'number' ? response.free_bytes : 0,
    ttl_hours: typeof response?.ttl_hours === 'number' ? response.ttl_hours : 24,
    direct: response?.direct === true
  };
}

export async function createSelfTransfer(conversationId: number, file: { name: string; size: number; type?: string }): Promise<SelfTransferCreated> {
  return apiRequest<SelfTransferCreated>(`/conversations/${conversationId}/transfers`, {
    method: 'POST',
    body: { name: file.name || 'file', size: file.size, content_type: file.type || null }
  });
}

/**
 * 把文件字节传上去（5.1 第 2 步）。direct 是对象存储的预签名地址：原样带 upload.headers，不能带鉴权；
 * 否则是后端的 /content（相对路径），和别的 API 请求一样带登录和证明头。
 */
export async function uploadSelfTransferContent(created: SelfTransferCreated, file: Blob, onProgress?: (loaded: number, total: number) => void, signal?: AbortSignal): Promise<void> {
  const { upload } = created;
  if (upload.direct) {
    await putToSignedUrl(upload.url, upload.headers ?? {}, file, onProgress, signal);
    return;
  }
  // 证明里的 path 是 /api/v1 之后那段：/conversations/{cid}/transfers/{tid}/content
  const path = upload.url.replace(/^https?:\/\/[^/]+/i, '').replace(/^\/api\/v1(?=\/)/, '');
  await apiPutWithProgress<unknown>(path, file, upload.headers ?? {}, onProgress, signal);
}

export async function completeSelfTransfer(conversationId: number, transferId: number, clientNonce: string): Promise<{ transfer: SelfTransfer; message: Message | null }> {
  const response = await apiRequest<{ transfer: SelfTransfer; message?: Message | null }>(`/conversations/${conversationId}/transfers/${transferId}/complete`, {
    method: 'POST',
    body: { client_nonce: clientNonce }
  });
  return { transfer: response.transfer, message: response.message ?? null };
}

/** 直连下载地址（5 分钟有效）；服务器没开直连（409 direct_download_unavailable）返回 null，改用 /download */
export async function getSelfTransferLink(conversationId: number, transferId: number): Promise<string | null> {
  try {
    const response = await apiRequest<unknown>(`/conversations/${conversationId}/transfers/${transferId}/link`);
    return isRecord(response) && typeof response.url === 'string' ? response.url : null;
  } catch (error) {
    if (selfChatErrorCode(error) === 'direct_download_unavailable') {
      return null;
    }
    throw error;
  }
}

/** 经后端带鉴权取回整份（没开直连时） */
export function downloadSelfTransferViaServer(conversationId: number, transferId: number): Promise<Blob> {
  return apiDownloadBlob(`/conversations/${conversationId}/transfers/${transferId}/download`);
}
