/**
 * 「我的手机」（「我的设备」会话，KukeChat-Server/docs/self-chat.md）的本地预览页：不连后端，用假接口驱动真实组件。
 *
 *   npm run dev:desktop   →   http://localhost:1420/dev/self-chat-harness.html            桌面布局
 *                             http://localhost:1420/dev/self-chat-harness.html?layout=mobile   手机布局（扩展的手机模式）
 *                             加 &theme=dark 看深色
 *
 * 假接口：GET /conversations/self、/conversations?include_self=true、消息、临时文件的开单 / 上传（XHR，模拟进度）/ complete / 下载。
 * 左边的控制栏能模拟「手机发来一条」「手机发来一个文件」、让下一次上传失败、切换直传 / 经后端。只用于开发，不会进入任何构建产物。
 */
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import '@/styles/tailwind.css';
import { getConversations } from '@/api/conversations';
import { DesktopChatPanel } from '@/components/chat/desktop/DesktopChatPanel';
import { MessagePanel } from '@/components/chat/MessagePanel';
import { ConversationList } from '@/components/chat/ConversationList';
import { GroupPlusHosts } from '@/components/groupPlus/GroupPlusHosts';
import { useSelfChatSync } from '@/components/selfChat/useSelfChatSync';
import { ConversationPane } from '@/components/shell/ConversationPane';
import { ToastHost } from '@/components/ui/toast';
import { upsertMessageIntoFirstPage, patchConversation, applyCreatedMessageToConversations, type MessagesInfiniteData } from '@/realtime/cache';
import { useKukeStore } from '@/store/kukeStore';
import { bumpSelfUnread, selfChatSnapshot } from '@/store/selfChatStore';
import type { Conversation, Message, SelfTransfer, User } from '@/types/api';

const SELF_ID = 77;
const me = { id: 1, username: 'kuke', nickname: '酷可mc' } as User;
const friend = { id: 2, username: 'aqua', nickname: '阿夸', bio: '在做弹幕游戏' } as User;
const params = new URLSearchParams(window.location.search);
const mobile = params.get('layout') === 'mobile';
const theme = params.get('theme') === 'dark' ? 'dark' : 'light';
const now = Date.now();
const iso = (offsetMs: number): string => new Date(now + offsetMs).toISOString();

let nextMessageId = 600;
let nextTransferId = 30;
const control = { failNextUpload: false, direct: false, uploadMs: 3200 };

function selfMessage(id: number, device: string, content: string, offsetMs: number, extra: Partial<Message> = {}): Message {
  return { id, conversation_id: SELF_ID, sender_id: me.id, sender: me, type: 'text', content, created_at: iso(offsetMs), metadata: { device, ...(extra.metadata ?? {}) }, ...extra } as Message;
}

function transferMessage(id: number, device: string, transfer: { id: number; name: string; size: number; content_type: string; expires_at: string }, offsetMs: number): Message {
  const expired = new Date(transfer.expires_at).getTime() <= Date.now();
  return selfMessage(id, device, `[文件] ${transfer.name}（${(transfer.size / 1048576).toFixed(1)} MB）`, offsetMs, { metadata: { device, transfer: { ...transfer, expired } } });
}

const transfers: SelfTransfer[] = [];
function rememberTransfer(meta: { id: number; name: string; size: number; content_type: string; expires_at: string }, device: string, messageId: number): void {
  transfers.unshift({ ...meta, conversation_id: SELF_ID, device, state: 'ready', expired: false, created_at: iso(0), upload_expires_at: iso(3600_000), completed_at: iso(0), message_id: messageId, download_path: `/api/v1/conversations/${SELF_ID}/transfers/${meta.id}/download` });
}

const apk = { id: 21, name: 'KukeChat-2.0.9-release-signed.apk', size: 31_457_280, content_type: 'application/vnd.android.package-archive', expires_at: iso(19 * 3600_000) };
const longName = { id: 22, name: '期末复习资料（第三单元到第七单元全部知识点整理，含往年真题与答案解析）最终版.pdf', size: 8_912_896, content_type: 'application/pdf', expires_at: iso(38 * 60_000) };
const zip = { id: 23, name: '作品素材.sb3', size: 2_621_440, content_type: 'application/octet-stream', expires_at: iso(-2 * 3600_000) };
rememberTransfer(apk, 'android', 512);
rememberTransfer(longName, 'desktop', 515);

const history: Message[] = [
  selfMessage(501, 'android', '在地铁上，先把这个链接发到电脑：https://www.ccw.site/detail/abc', -26 * 3600_000),
  transferMessage(502, 'android', zip, -26 * 3600_000 + 60_000),
  selfMessage(505, 'desktop', '收到，晚上回家看', -25 * 3600_000),
  selfMessage(508, 'web', '网页版发的一句话，也算电脑这边', -3 * 3600_000),
  selfMessage(510, 'android', '截图里那个积木顺序不对，回去改一下', -40 * 60_000),
  transferMessage(512, 'android', apk, -38 * 60_000),
  selfMessage(513, 'android', '装这个测试包，看看语音红包还会不会闪退', -37 * 60_000, { metadata: { device: 'android', quote: { message_id: 512, sender_name: '我的手机', preview: '[文件] KukeChat-2.0.9-release-signed.apk', type: 'text' } } }),
  transferMessage(515, 'desktop', longName, -30 * 60_000),
  selfMessage(516, 'desktop', '这份资料手机上也要能看，记得在 38 分钟内下载', -29 * 60_000),
  selfMessage(518, 'ios', '好的（这条是 iOS 发的）', -2 * 60_000)
];

const conversations: Conversation[] = [
  { id: SELF_ID, type: 'self', title: null, display_title: '我的设备', avatar_url: null, direct_user: null, member_count: 1, my_role: 'member', join_mode: 'invite_only', unread_count: 0, last_message: history[history.length - 1], my_pinned: false, my_do_not_disturb: false, my_message_setting: 'notify', is_friend: false, is_temporary: false, plus_tier: 'free', updated_at: history[history.length - 1].created_at },
  { id: 2, type: 'direct', title: '阿夸', display_title: '阿夸', unread_count: 1, direct_user: friend, updated_at: iso(-5 * 60_000), last_message: { id: 40, conversation_id: 2, sender_id: 2, sender: friend, type: 'text', content: '好，晚点发你', created_at: iso(-5 * 60_000) } as Message },
  { id: 3, type: 'group', title: 'Scratch 创作交流群', display_title: 'Scratch 创作交流群', member_count: 128, unread_count: 4, updated_at: iso(-20 * 60_000), last_message: { id: 90, conversation_id: 3, sender_id: 2, sender: friend, type: 'text', content: '周五晚上的接龙谁来开头', created_at: iso(-20 * 60_000) } as Message }
] as Conversation[];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const pending = new Map<number, { name: string; size: number; content_type: string; uploaded: boolean }>();

function listPayload(): unknown {
  const live = transfers.filter((item) => item.expires_at && new Date(item.expires_at).getTime() > Date.now());
  const used = live.reduce((sum, item) => sum + item.size, 0) + [...pending.values()].reduce((sum, item) => sum + item.size, 0);
  return { items: live, max_file_bytes: 1024 ** 3, quota_bytes: 5 * 1024 ** 3, used_bytes: used, free_bytes: 5 * 1024 ** 3 - used, ttl_hours: 24, direct: control.direct };
}

function installFetchMock(): void {
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, window.location.origin);
    if (!url.pathname.includes('/api/v1/')) {
      return realFetch(input, init);
    }
    const path = url.pathname.replace(/^.*\/api\/v1/, '');
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : {};
    await new Promise((resolve) => window.setTimeout(resolve, 120));
    if (path === '/conversations/self') {
      return json(conversations[0]);
    }
    if (path === '/conversations') {
      // 不带 include_self 的老请求看不到它（9 节）
      return json(url.searchParams.get('include_self') === 'true' ? conversations : conversations.slice(1));
    }
    const messagesMatch = path.match(/^\/conversations\/(\d+)\/messages$/);
    if (messagesMatch && method === 'GET') {
      return json(Number(messagesMatch[1]) === SELF_ID ? history : []);
    }
    if (messagesMatch && method === 'POST') {
      nextMessageId += 1;
      const message = { ...selfMessage(nextMessageId, 'desktop', String(body.content ?? ''), 0), type: (body.type as Message['type']) ?? 'text', metadata: { ...(body.metadata as object | undefined), device: 'desktop' }, client_nonce: body.client_nonce } as Message;
      history.push(message);
      return json(message, 201);
    }
    if (path === `/conversations/${SELF_ID}/transfers` && method === 'GET') {
      return json(listPayload());
    }
    if (path === `/conversations/${SELF_ID}/transfers` && method === 'POST') {
      const size = Number(body.size);
      if (size > 1024 ** 3) {
        return json({ detail: { code: 'file_too_large', message: '文件太大了', max_file_bytes: 1024 ** 3 } }, 413);
      }
      nextTransferId += 1;
      const id = nextTransferId;
      pending.set(id, { name: String(body.name), size, content_type: String(body.content_type ?? 'application/octet-stream'), uploaded: false });
      const upload = control.direct
        ? { direct: true, method: 'PUT', url: `https://storage.example.invalid/self-transfers/1/${id}?X-Amz-Signature=fake`, headers: { 'Content-Type': 'application/octet-stream' }, expires_at: iso(15 * 60_000) }
        : { direct: false, method: 'PUT', url: `/api/v1/conversations/${SELF_ID}/transfers/${id}/content`, headers: { 'Content-Type': 'application/octet-stream' }, expires_at: iso(3600_000) };
      return json({ transfer_id: id, transfer: { id, conversation_id: SELF_ID, name: body.name, size, content_type: body.content_type ?? 'application/octet-stream', device: 'desktop', state: 'pending', expired: false, created_at: iso(0), upload_expires_at: iso(3600_000), download_path: '' }, upload }, 201);
    }
    const completeMatch = path.match(/^\/conversations\/\d+\/transfers\/(\d+)\/complete$/);
    if (completeMatch) {
      const id = Number(completeMatch[1]);
      const item = pending.get(id);
      if (!item) {
        return json({ detail: { code: 'upload_not_found', message: '上传单已作废' } }, 404);
      }
      pending.delete(id);
      const meta = { id, name: item.name, size: item.size, content_type: item.content_type, expires_at: iso(24 * 3600_000) };
      nextMessageId += 1;
      const message = { ...transferMessage(nextMessageId, 'desktop', meta, 0), client_nonce: body.client_nonce } as Message;
      history.push(message);
      rememberTransfer(meta, 'desktop', message.id);
      return json({ transfer: transfers[0], message }, 201);
    }
    const linkMatch = path.match(/^\/conversations\/\d+\/transfers\/(\d+)\/(link|download)$/);
    if (linkMatch) {
      const transfer = transfers.find((item) => item.id === Number(linkMatch[1]));
      if (!transfer || !transfer.expires_at || new Date(transfer.expires_at).getTime() <= Date.now()) {
        return json({ detail: { code: 'file_expired', message: '文件已过期' } }, 410);
      }
      if (linkMatch[2] === 'link') {
        return json({ detail: { code: 'direct_download_unavailable', message: '没开直连' } }, 409);
      }
      return new Response(new Blob([`预览页的假文件：${transfer.name}\n`], { type: 'application/octet-stream' }));
    }
    if (/\/mentions\/unread$/.test(path)) {
      return json({ items: [], total: 0 });
    }
    return json([]);
  };
}

/** 上传走 XMLHttpRequest（要进度）：拦下发往 /content 和假存储地址的 PUT，按时间推进度 */
function installXhrMock(): void {
  const RealXHR = window.XMLHttpRequest;
  class FakeUploadXHR extends RealXHR {
    private fakeUrl: string | null = null;
    private fakeStatus = 0;
    private fakeBody = '';
    private aborted = false;
    open(method: string, url: string | URL, ...rest: unknown[]): void {
      const href = String(url);
      if (method.toUpperCase() === 'PUT' && (/\/transfers\/\d+\/content$/.test(href) || href.includes('storage.example.invalid'))) {
        this.fakeUrl = href;
        return;
      }
      (RealXHR.prototype.open as (...args: unknown[]) => void).call(this, method, url, ...rest);
    }
    setRequestHeader(name: string, value: string): void {
      if (!this.fakeUrl) {
        super.setRequestHeader(name, value);
      }
    }
    get status(): number {
      return this.fakeUrl ? this.fakeStatus : super.status;
    }
    get responseText(): string {
      return this.fakeUrl ? this.fakeBody : super.responseText;
    }
    getResponseHeader(name: string): string | null {
      return this.fakeUrl ? null : super.getResponseHeader(name);
    }
    abort(): void {
      if (!this.fakeUrl) {
        super.abort();
        return;
      }
      this.aborted = true;
      this.onabort?.call(this, new ProgressEvent('abort'));
    }
    send(body?: Document | XMLHttpRequestBodyInit | null): void {
      if (!this.fakeUrl) {
        super.send(body);
        return;
      }
      const total = body instanceof Blob ? body.size : 0;
      const started = performance.now();
      const fail = control.failNextUpload;
      control.failNextUpload = false;
      const tick = (): void => {
        if (this.aborted) {
          return;
        }
        const ratio = Math.min(1, (performance.now() - started) / control.uploadMs);
        (this.upload.onprogress as ((event: ProgressEvent) => void) | null)?.(new ProgressEvent('progress', { lengthComputable: true, loaded: Math.round(total * (fail ? Math.min(ratio, 0.46) : ratio)), total }));
        if (fail && ratio >= 0.46) {
          this.onerror?.call(this, new ProgressEvent('error'));
          return;
        }
        if (ratio < 1) {
          window.setTimeout(tick, 120);
          return;
        }
        const id = Number(this.fakeUrl?.match(/(\d+)(?:\/content|\?)/)?.[1]);
        const item = pending.get(id);
        if (item) {
          item.uploaded = true;
        }
        this.fakeStatus = 200;
        this.fakeBody = this.fakeUrl?.includes('/content') ? JSON.stringify({ transfer_id: id, uploaded_bytes: total }) : '';
        this.onload?.call(this, new ProgressEvent('load'));
      };
      window.setTimeout(tick, 120);
    }
  }
  window.XMLHttpRequest = FakeUploadXHR as unknown as typeof XMLHttpRequest;
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, staleTime: Infinity } } });

/** 模拟另一台设备（手机）发来一条：和 realtime/client.ts 里「我的设备」那段做的一样 */
function receiveFromPhone(kind: 'text' | 'file'): void {
  nextMessageId += 1;
  let message: Message;
  if (kind === 'file') {
    nextTransferId += 1;
    const meta = { id: nextTransferId, name: `IMG_${nextTransferId}.HEIC 原图打包.zip`, size: 52_428_800, content_type: 'application/zip', expires_at: iso(24 * 3600_000) };
    message = transferMessage(nextMessageId, 'android', meta, Date.now() - now);
    rememberTransfer(meta, 'android', message.id);
  } else {
    message = selfMessage(nextMessageId, 'android', '手机这边刚拍的，回头整理一下', Date.now() - now);
  }
  history.push(message);
  const visible = useKukeStore.getState().visibleConversationId === SELF_ID;
  if (!visible) {
    bumpSelfUnread(message.id);
  }
  const unread = visible ? 0 : selfChatSnapshot().unread;
  queryClient.setQueryData<Conversation[] | undefined>(['conversations'], (current) => patchConversation(applyCreatedMessageToConversations(current, message, useKukeStore.getState().visibleConversationId, true, null), SELF_ID, (item) => ({ ...item, unread_count: unread })));
  queryClient.setQueryData<MessagesInfiniteData | undefined>(['messages', SELF_ID], (current) => upsertMessageIntoFirstPage(current, message));
}

function Controls({ onToggleList }: { onToggleList?: () => void }): JSX.Element {
  const [, force] = useState(0);
  const button = 'rounded-lg border px-3 py-2 text-left text-xs [border-color:var(--kc-border-strong)] hover:[background:var(--kc-hover)]';
  return (
    <aside data-harness="controls" className="flex w-[176px] shrink-0 flex-col gap-2 border-r p-3 text-sm [background:var(--kc-list)] [border-color:var(--kc-border)] [color:var(--kc-text)]">
      <strong>预览控制</strong>
      <button type="button" data-harness="phone-text" className={button} onClick={() => receiveFromPhone('text')}>手机发来一条</button>
      <button type="button" data-harness="phone-file" className={button} onClick={() => receiveFromPhone('file')}>手机发来一个文件</button>
      <button type="button" data-harness="fail-next" className={button} onClick={() => { control.failNextUpload = true; force((value) => value + 1); }}>下一次上传在 46% 断网{control.failNextUpload ? ' ✓' : ''}</button>
      <button type="button" data-harness="direct" className={button} onClick={() => { control.direct = !control.direct; void queryClient.invalidateQueries({ queryKey: ['self-transfers'] }); force((value) => value + 1); }}>上传：{control.direct ? '直传存储' : '经后端'}</button>
      <button type="button" data-harness="open-other" className={button} onClick={() => useKukeStore.setState({ activeConversationId: 2 })}>切到别的会话</button>
      <button type="button" data-harness="open-self" className={button} onClick={() => useKukeStore.setState({ activeConversationId: SELF_ID })}>回到「我的手机」</button>
      {onToggleList ? <button type="button" className={button} onClick={onToggleList}>会话列表 / 聊天</button> : null}
    </aside>
  );
}

function Harness(): JSX.Element {
  const live = useQuery({ queryKey: ['conversations'], queryFn: getConversations }).data ?? [];
  useSelfChatSync(live, me.id);
  const [showList, setShowList] = useState(false);
  if (mobile) {
    return (
      <div data-theme={theme} className="flex h-full [background:var(--kc-window)]">
        <Controls onToggleList={() => setShowList((value) => !value)} />
        <div className="grid flex-1 place-items-center">
          <main data-theme={theme} data-layout="mobile" data-font-scale={1} data-harness="phone" className="kc-window-frame" style={{ position: 'relative', width: 390, height: 'min(100%, 800px)', overflow: 'hidden', transform: 'translateZ(0)', color: 'var(--kc-mobile-text)', animation: 'none' }}>
            <div className="kc-native-app" style={{ position: 'relative', height: '100%', width: '100%', overflow: 'hidden', background: 'var(--kc-mobile-bg)' }}>
              {showList
                ? <ConversationList conversations={live} isLoading={false} currentUser={me} onCreateGroup={() => undefined} onOpenGlobalSearch={() => undefined} onSelectConversation={(conversation) => { useKukeStore.setState({ activeConversationId: conversation.id }); setShowList(false); }} />
                : <MessagePanel conversations={live} currentUser={me} members={[]} friends={[]} isMobile onBack={() => setShowList(true)} />}
              <GroupPlusHosts />
              <ToastHost />
            </div>
          </main>
        </div>
      </div>
    );
  }
  return (
    <main data-theme={theme} data-layout="desktop" data-font-scale={1} className="flex h-full min-h-0 [background:var(--kc-window)] [color:var(--kc-text)]">
      <Controls />
      <div style={{ display: 'grid', width: 268, flex: 'none' }}><ConversationPane conversations={live} isLoading={false} currentUser={me} onCreateGroup={() => undefined} onOpenGlobalSearch={() => undefined} /></div>
      <div className="relative min-w-0 flex-1" data-kc-surface="page">
        <DesktopChatPanel conversations={live} currentUser={me} currentRole="member" members={[]} />
      </div>
      <GroupPlusHosts />
      <ToastHost />
    </main>
  );
}

installFetchMock();
installXhrMock();
// 预览页每次都从「上次看到 509」开始：手机后来发的 510 / 512 / 513 / 518 算 4 条未读
try {
  window.localStorage.setItem(`kukechat:self-chat:v1:${me.id}`, JSON.stringify({ conversationId: SELF_ID, lastSeenId: 509, countedUpTo: 509, unread: 0 }));
} catch {
  // 隐私模式下存不了：从 0 开始
}
useKukeStore.setState({ token: 'harness', currentUser: me, activeConversationId: params.get('c') ? Number(params.get('c')) : mobile ? SELF_ID : 2, layoutMode: mobile ? 'mobile' : 'desktop', themeMode: theme });
Object.assign(window, { __harness: { store: useKukeStore, queryClient, control, receiveFromPhone } });

createRoot(document.getElementById('root') as HTMLElement).render(
  <QueryClientProvider client={queryClient}>
    <Harness />
  </QueryClientProvider>
);
