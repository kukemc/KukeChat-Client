import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { isRecord } from '@/api/normalizers';
import { cx } from '@/components/chat/desktop/runtime';
import { Icon } from '@/components/ui/Icon';
import { getDesktopPortalRoot } from '@/components/ui/desktop/Modal';
import { subscribeRealtimeEvents } from '@/realtime/events';
import { useKukeStore } from '@/store/kukeStore';
import type { ShopOverview } from '@/types/shop';
import { KNOWN_CATEGORIES, shopKeys, slotOfCategory, useEquipItem } from './data';
import { describeEquipError } from './labels';

interface GrantToast {
  id: number;
  sku: string;
  name: string;
  category: string;
  source: string;
  /** 点了「换上」之后的结果 */
  state: 'idle' | 'equipping' | 'equipped' | 'failed';
  error?: string;
}

const LIFETIME_MS = 12_000;
const MAX_TOASTS = 3;
const SOURCE_TEXT: Record<string, string> = { level: '升级解锁', grant: '收到赠送' };

/**
 * 「我得到了一件装扮」的提示（实时事件 shop.item.granted：被赠送，或升级后自动解锁）。
 * 不管用户正停在哪个页面都会出现，所以挂在主界面上而不是商店页里；可以当场换上，也可以去商店看看。
 * 缓存的刷新在 data.ts 的 handleShopEvent，这里只管提示。
 */
export function ShopGrantToasts(): JSX.Element | null {
  const isMobile = useKukeStore((state) => state.layoutMode === 'mobile');
  const openShop = useKukeStore((state) => state.openShop);
  const queryClient = useQueryClient();
  const equip = useEquipItem();
  const [toasts, setToasts] = useState<GrantToast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, number>());

  const dismiss = (id: number): void => {
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  };
  const expireLater = (id: number, delay: number): void => {
    const previous = timers.current.get(id);
    if (previous !== undefined) {
      window.clearTimeout(previous);
    }
    timers.current.set(id, window.setTimeout(() => {
      timers.current.delete(id);
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, delay));
  };

  useEffect(() => {
    const pending = timers.current;
    const unsubscribe = subscribeRealtimeEvents((event) => {
      if (event.rawType !== 'shop.item.granted' || !isRecord(event.data) || !isRecord(event.data.item)) {
        return;
      }
      const item = event.data.item;
      // 这个版本不认识的类别不提示：点了也没有地方看、没法换上
      if (typeof item.sku !== 'string' || typeof item.category !== 'string' || !KNOWN_CATEGORIES.has(item.category)) {
        return;
      }
      const id = nextId.current++;
      const toast: GrantToast = { id, sku: item.sku, name: typeof item.name === 'string' && item.name ? item.name : '新装扮', category: item.category, source: typeof event.data.source === 'string' ? event.data.source : '', state: 'idle' };
      setToasts((current) => [...current.slice(-(MAX_TOASTS - 1)), toast]);
      expireLater(id, LIFETIME_MS);
    });
    return () => {
      unsubscribe();
      pending.forEach((timer) => window.clearTimeout(timer));
      pending.clear();
    };
  }, []);

  if (toasts.length === 0) {
    return null;
  }

  const patch = (id: number, change: Partial<GrantToast>): void => setToasts((current) => current.map((toast) => (toast.id === id ? { ...toast, ...change } : toast)));
  const wear = (toast: GrantToast): void => {
    const categories = queryClient.getQueryData<ShopOverview | null>(shopKeys.overview)?.categories ?? [];
    patch(toast.id, { state: 'equipping' });
    equip.mutate({ slot: slotOfCategory(categories, toast.category), sku: toast.sku }, {
      onSuccess: () => {
        patch(toast.id, { state: 'equipped' });
        expireLater(toast.id, 2600);
      },
      onError: (error) => {
        patch(toast.id, { state: 'failed', error: describeEquipError(error) });
        expireLater(toast.id, 6000);
      }
    });
  };

  const node = (
    <div className={cx('kui ksp-grants', isMobile && 'is-mobile')} aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className="ksp-grant" role="status" data-shop="grant-toast" data-state={toast.state}>
          <span className="ksp-grant-icon"><Icon name={toast.state === 'equipped' ? 'check' : 'sparkles'} className="h-4 w-4" /></span>
          <div className="ksp-grant-main">
            <b>{toast.state === 'equipped' ? `已换上「${toast.name}」` : `获得新装扮「${toast.name}」`}</b>
            <span>{toast.state === 'failed' ? toast.error : toast.state === 'equipped' ? '你发出的消息已经是这个气泡了' : SOURCE_TEXT[toast.source] ?? '已经放进你的装扮里'}</span>
            {toast.state === 'idle' || toast.state === 'equipping' || toast.state === 'failed' ? (
              <div className="ksp-grant-actions">
                <button type="button" className="ksp-grant-btn is-primary" data-action="grant-equip" disabled={toast.state === 'equipping'} onClick={() => wear(toast)}>{toast.state === 'equipping' ? '换上中…' : toast.state === 'failed' ? '再试一次' : '现在换上'}</button>
                <button type="button" className="ksp-grant-btn" data-action="grant-open" onClick={() => {
                  dismiss(toast.id);
                  openShop();
                }}>去商店看看</button>
              </div>
            ) : null}
          </div>
          <button type="button" className="ksp-grant-close" aria-label="关闭提示" onClick={() => dismiss(toast.id)}><Icon name="close" className="h-3.5 w-3.5" /></button>
        </div>
      ))}
    </div>
  );
  // 移动布局下各个二级页面是挂到窗口根上的全屏层，提示也得挂过去才不会被它们盖住
  return isMobile ? createPortal(node, getDesktopPortalRoot()) : node;
}
