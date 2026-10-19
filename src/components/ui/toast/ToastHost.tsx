import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '@/components/chat/desktop/runtime';
import { Icon, type IconName } from '@/components/ui/Icon';
import { getDesktopPortalRoot } from '@/components/ui/desktop/Modal';
import { useKukeStore } from '@/store/kukeStore';
import { useThemeStore } from '@/theme/themeStore';
import { defaultDuration, useToastStore, type ToastItem, type ToastTone } from './toastStore';

/** 收起动画的时长，和 styles/toast.css 里的 .ktst-item.is-exiting 对齐 */
const EXIT_MS = 220;

/** 系统设了「减少动态效果」时不做进出场，收掉就是真的收掉，不能等一段不存在的动画。 */
function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const TONE_ICON: Record<ToastTone, IconName> = {
  info: 'info',
  success: 'checkCircle',
  warning: 'alert',
  error: 'alertCircle'
};

/** 提示层要挂进去的根：带 data-layout / data-theme 的那一层，主题变量和深浅色从它继承 */
const THEMED_ROOT = '.kc-window-frame, .kc-desktop-app, .kc-native-app';

/**
 * 把提示层的容器挂在 root 的最后一个子节点上，并且一直保持在最后：
 * 对话框、全屏动效、手机的二级页面也都 portal 到同一个根、z-index 也是顶格，
 * 同级同 z-index 时谁在 DOM 后面谁在上，所以别人后挂进来时把容器再挪回末尾。
 */
function useLastChildContainer(root: Element | null): HTMLElement | null {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!root) {
      return undefined;
    }
    const node = document.createElement('div');
    node.className = 'ktst-host';
    root.appendChild(node);
    setContainer(node);
    const observer = new MutationObserver(() => {
      if (root.lastElementChild !== node) {
        root.appendChild(node);
      }
    });
    observer.observe(root, { childList: true });
    return () => {
      observer.disconnect();
      node.remove();
      setContainer(null);
    };
  }, [root]);
  return container;
}

/**
 * 全站唯一的提示渲染处，挂在 ChatShell 上（扩展、桌面两种形态和扩展的手机布局都经过它）。
 * 自己在原地放一个不可见的标记，从它往上找到当前布局的根（扩展的 kc-window-frame、桌面的 kc-desktop-app、
 * 手机布局的 kc-native-app），把提示层挂到那个根的末尾：
 *   · 扩展形态下落在 Shadow DOM 的窗口根里，不受宿主页面样式影响、不会被裁掉；
 *   · z-index 顶格并且始终是根的最后一个子节点，全屏动效（礼物 tier 3、庆生）和对话框开着时也看得见；
 *   · 主题变量从带 data-layout / data-theme 的根上继承，深浅色和自定义主题都跟着走。
 *
 * 位置：桌面顶部居中（标题栏下方），手机顶部安全区下方。理由见 styles/toast.css 开头的说明。
 */
export function ToastHost(): JSX.Element {
  const items = useToastStore((state) => state.items);
  const startExit = useToastStore((state) => state.startExit);
  const remove = useToastStore((state) => state.remove);
  const setPaused = useToastStore((state) => state.setPaused);
  const isMobile = useKukeStore((state) => state.layoutMode === 'mobile');
  const performance = useThemeStore((state) => state.performance);
  const markerRef = useRef<HTMLSpanElement | null>(null);
  const [root, setRoot] = useState<Element | null>(null);

  // 布局切换（扩展浮窗的电脑 / 手机模式）时根元素一般不变，但重算一次不费事
  useLayoutEffect(() => {
    setRoot(markerRef.current?.closest(THEMED_ROOT) ?? getDesktopPortalRoot());
  }, [isMobile]);

  const container = useLastChildContainer(root);

  return (
    <>
      <span ref={markerRef} hidden />
      {container ? createPortal(
        <div className={cx('kui ktst-layer', isMobile && 'is-mobile', performance && 'is-still')} data-toast-layer="">
          {items.map((item) => <ToastCard key={item.key} item={item} still={performance} onExit={startExit} onRemove={remove} onPause={setPaused} />)}
        </div>,
        container
      ) : null}
    </>
  );
}

function ToastCard({ item, still, onExit, onRemove, onPause }: {
  item: ToastItem;
  still: boolean;
  onExit: (key: number) => void;
  onRemove: (key: number) => void;
  onPause: (key: number, paused: boolean) => void;
}): JSX.Element {
  // stamp 变了（重复出现、鼠标移开）就要重新起表，所以依赖里带上它
  const { key, tone, actions, duration, paused, exiting, stamp } = item;

  // 「性能优先」或系统减少了动态效果时不放收起动画，收到就是收掉
  const instant = still || prefersReducedMotion();
  const close = useRef(() => undefined as void);
  close.current = () => {
    if (instant) {
      onRemove(key);
      return;
    }
    onExit(key);
  };

  const wait = duration ?? defaultDuration(tone, actions);

  // 到点收起
  useEffect(() => {
    if (exiting || paused) {
      return undefined;
    }
    const timer = window.setTimeout(() => close.current(), wait);
    return () => window.clearTimeout(timer);
  }, [exiting, paused, stamp, wait]);

  // 进入「正在收起」（手动关、到点、被新提示挤出去）之后，放完动画再真的从队列里去掉。
  // 动画本身在 CSS 里；收起中又被同样的提示顶了回来时 exiting 变回 false，这个定时器随之取消。
  useEffect(() => {
    if (!exiting) {
      return undefined;
    }
    const timer = window.setTimeout(() => onRemove(key), instant ? 0 : EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [exiting, instant, key, onRemove]);

  const dismiss = (): void => close.current();

  const icon = TONE_ICON[tone];
  return (
    <div className={cx('ktst-slot', exiting && 'is-exiting')} style={{ '--ktst-exit': `${EXIT_MS}ms` } as CSSProperties}>
      <div className="ktst-clip">
        <div
          className={cx('ktst-item', `is-${tone}`, exiting && 'is-exiting', still && 'is-still')}
          role={tone === 'error' ? 'alert' : 'status'}
          aria-live={tone === 'error' ? 'assertive' : 'polite'}
          data-toast={tone}
          style={{ '--ktst-exit': `${EXIT_MS}ms` } as CSSProperties}
          onMouseEnter={() => onPause(key, true)}
          onMouseLeave={() => onPause(key, false)}
          onFocusCapture={() => onPause(key, true)}
          onBlurCapture={() => onPause(key, false)}
        >
          {item.leading ? <span className="ktst-leading">{item.leading}</span> : null}
          {/* 带了图形（礼物、头像、勋章……）时不再叠一个语气图标：两个图标并排是多余的 */}
          {item.leading ? null : <span className={cx('ktst-icon', `ktst-icon--${tone}`)} aria-hidden="true"><Icon name={icon} className="h-4 w-4" /></span>}
          <div className="ktst-main">
            <p className="ktst-text">
              {item.message}
              {item.repeat > 1 ? <span key={item.repeat} className="ktst-repeat">×{item.repeat}</span> : null}
            </p>
            {item.subtitle ? <p className="ktst-subtitle">{item.subtitle}</p> : null}
            {actions && actions.length > 0 ? (
              <div className="ktst-actions">
                {actions.map((action, index) => (
                  <button
                    key={`${index}-${action.label}`}
                    type="button"
                    className={cx('ktst-btn', index === 0 && 'is-primary')}
                    data-action="toast-action"
                    disabled={action.disabled}
                    onClick={() => {
                      if (!action.keepOpen) {
                        dismiss();
                      }
                      action.onClick();
                    }}
                  >{action.label}</button>
                ))}
              </div>
            ) : null}
          </div>
          <button type="button" className="ktst-close" aria-label="关闭提示" data-action="toast-close" onClick={dismiss}><Icon name="close" className="h-3.5 w-3.5" /></button>
        </div>
      </div>
    </div>
  );
}