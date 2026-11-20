import { closeKukeChatWindow, ensureKukeChatWindow } from '@/app/windowManager';
import { createDirectConversation } from '@/api/conversations';
import { useKukeStore, type ThemeMode, type WorkspaceView } from '@/store/kukeStore';
import type { KukeChatEmbedApi, KukeChatEmbedRect } from '@/types/scratch';

/**
 * 嵌入模式：油猴脚本 KukeChat for CCW 把 KukeChat 窗口停靠进共创世界的消息中心（KukeChat-Server docs/ccw-social.md）。
 *
 * 停靠时窗口的位置和大小由宿主给，宿主那边再往 Shadow DOM 里注入样式去掉标题栏、图标栏，换成共创世界的配色。
 * 停靠前记下用户自己的浮窗位置，取消停靠时恢复 —— 停靠不能把下次在作品里打开的浮窗挪走。
 */
let docked = false;
let saved: { position: { x: number; y: number }; size: { width: number; height: number }; themeMode: ThemeMode } | null = null;

const VIEWS: readonly WorkspaceView[] = ['chat', 'contacts', 'posts', 'space', 'favorites', 'bots', 'home', 'teamup', 'tasks', 'jury', 'shop', 'level', 'ranking', 'settings'];

function hostElement(): HTMLElement | null {
  return document.getElementById('kukechat-shadow-host');
}

function dock(rect: KukeChatEmbedRect): void {
  const store = useKukeStore.getState();
  if (!docked) {
    saved = { position: { ...store.position }, size: { ...store.size }, themeMode: store.themeMode };
    docked = true;
    // 共创世界是深色站：停靠期间固定深色，取消停靠时恢复
    store.setThemeMode('dark');
  }
  store.setWindowPosition({ x: Math.round(rect.x), y: Math.round(rect.y) });
  store.setWindowSize({ width: Math.round(rect.width), height: Math.round(rect.height) });
  ensureKukeChatWindow();
  hostElement()?.setAttribute('data-kc-docked', 'true');
}

function undock(): void {
  if (!docked) return;
  docked = false;
  closeKukeChatWindow();
  hostElement()?.removeAttribute('data-kc-docked');
  if (saved) {
    const store = useKukeStore.getState();
    store.setWindowPosition(saved.position);
    store.setWindowSize(saved.size);
    store.setThemeMode(saved.themeMode);
    saved = null;
  }
}

export const embedApi: KukeChatEmbedApi = {
  version: 1,
  dock,
  undock,
  isDocked: () => docked,
  setView: (view) => {
    if ((VIEWS as readonly string[]).includes(view)) useKukeStore.getState().setWorkspaceView(view as WorkspaceView);
  },
  openConversation: (conversationId) => {
    useKukeStore.getState().setActiveConversationId(conversationId);
  },
  openDirect: async (userId) => {
    const conversation = await createDirectConversation({ user_id: userId, temporary: true });
    useKukeStore.getState().setActiveConversationId(conversation.id);
  },
  onUnread: (listener) => {
    listener(useKukeStore.getState().unreadCount);
    let last = useKukeStore.getState().unreadCount;
    return useKukeStore.subscribe((state) => {
      if (state.unreadCount === last) return;
      last = state.unreadCount;
      listener(last);
    });
  },
  isLoggedIn: () => Boolean(useKukeStore.getState().token)
};
