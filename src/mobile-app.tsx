import React from 'react';
import { createRoot } from 'react-dom/client';
import { MobileAppRoot } from '@/app/MobileAppRoot';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { useKukeStore } from '@/store/kukeStore';
import '@/styles/tailwind.css';

window.__KukeChatAppMode = 'native-mobile';
const kukeChatRoot = document.getElementById('kukechat-root');
if (kukeChatRoot) {
  kukeChatRoot.dataset.nativeApp = 'true';
}

useKukeStore.setState({
  layoutMode: 'mobile',
  layoutModeSource: 'manual',
  isOpen: true,
  isMinimized: false,
  isFullscreen: false
});

createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary allowReload>
      <MobileAppRoot />
    </ErrorBoundary>
  </React.StrictMode>
);
