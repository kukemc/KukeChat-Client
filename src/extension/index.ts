import { closeKukeChatWindow, ensureKukeChatWindow, minimizeKukeChatWindow, toggleKukeChatFullscreen } from '@/app/windowManager';
import { emitRealtimeEvent, subscribeRealtimeEvents } from '@/realtime/events';
import type { RealtimeEvent } from '@/types/realtime';
import type { TempExtensionRegistration } from '@/types/scratch';
import { Cover, Icon, extensionId } from './assets';
import KukeChatExtension from './extension';
import { installGandiToolbarButton } from './gandiToolbar';
import { notifyScratchRealtimeEvent } from './bridge';
import { embedApi } from './embed';
import { GANDI_BLOCKS_BASE } from '@/config/env';
import { setGandiBlocksRemoteBase } from '@/gandiDsl';

// 播放器页没有宿主积木库时，积木消息从这里懒加载 gandi-blocks（docs/gandi-dsl-blocks.md）
setGandiBlocksRemoteBase(GANDI_BLOCKS_BASE);

subscribeRealtimeEvents((event) => {
  notifyScratchRealtimeEvent(event);
});

const l10n = {
  'zh-cn': {
    'kukechat.name': 'KukeChat',
    'kukechat.description': '现代化浮动聊天窗口，支持好友、群聊和实时消息。'
  },
  en: {
    'kukechat.name': 'KukeChat',
    'kukechat.description': 'Modern floating chat window with friends, groups and realtime messages.'
  }
};

const registration: TempExtensionRegistration = {
  Extension: KukeChatExtension,
  info: {
    name: 'kukechat.name',
    description: 'kukechat.description',
    extensionId,
    iconURL: Cover,
    insetIconURL: Icon,
    featured: true,
    disabled: false,
    collaborator: 'KukeChat'
  },
  l10n
};

if (typeof window !== 'undefined') {
  window.tempExt = registration;
  window.__KukeChatExtensionBridge = {
    openWindow: ensureKukeChatWindow,
    closeWindow: closeKukeChatWindow,
    minimizeWindow: minimizeKukeChatWindow,
    toggleFullscreen: toggleKukeChatFullscreen,
    notifyRealtimeEvent: (event: RealtimeEvent) => emitRealtimeEvent(event),
    embed: embedApi
  };
  installGandiToolbarButton();
}

export default KukeChatExtension;
