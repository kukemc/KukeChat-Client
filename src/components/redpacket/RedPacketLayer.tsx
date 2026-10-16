import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type SyntheticEvent } from 'react';
import { createPortal } from 'react-dom';
import { cx, useEvent } from '@/components/chat/desktop/runtime';
import { getDesktopPortalRoot, useEscapeLayer } from '@/components/ui/desktop/Modal';
import { registerNativeBackHandler } from '@/native/back';
import { useRedPacketMotion } from './ui';

function stop(event: SyntheticEvent): void {
  event.stopPropagation();
}

/**
 * 红包几个弹层共用的外壳：一层遮罩，里面的东西居中（移动布局下面板贴底升起，样式在 redpacket.css）。
 *
 * 挂到哪：从自己所在的位置往上找聊天面板（桌面 .kcd、移动 .kc-mobile-panel）或移动端商店页（.ksp-m），铺满它；
 * 都不在就挂到窗口根上（桌面的商店页；移动布局是带 data-layout 的那一层）。触发它的地方在消息行、输入框表单里面，留在原地会被后面的行盖住，
 * 所以要 portal；portal 之后事件还会沿 React 树冒回去，这里拦掉（否则在弹层里双击、右键、粘贴、回车提交，
 * 会触发消息行的引用、菜单和输入框表单的粘贴、发送）。
 *
 * locked 为 true 时遮罩、Esc、系统返回键都不关它（请求还在路上）。
 */
export function RedPacketLayer({ label, onClose, locked = false, className, children }: { label: string; onClose: () => void; locked?: boolean; className?: string; children: ReactNode }): JSX.Element {
  const markerRef = useRef<HTMLSpanElement>(null);
  const [host, setHost] = useState<{ element: Element; fixed: boolean } | null>(null);
  const motion = useRedPacketMotion();
  const close = useEvent(() => {
    if (!locked) {
      onClose();
    }
  });

  useLayoutEffect(() => {
    const panel = markerRef.current?.closest('.kcd, .kc-mobile-panel, .ksp-m');
    // 要落在带 data-layout 的根里面，主题变量才取得到
    const root = markerRef.current?.closest('[data-layout="mobile"]') ?? getDesktopPortalRoot();
    setHost(panel ? { element: panel, fixed: false } : { element: root, fixed: true });
  }, []);

  useEscapeLayer(locked ? null : onClose);

  // 系统返回键：先关弹层
  useEffect(() => registerNativeBackHandler(() => {
    close();
    return true;
  }, 120), [close]);

  return (
    <>
      <span ref={markerRef} hidden />
      {host ? createPortal(
        <div
          className={cx('krp krp-backdrop kui', host.fixed && 'is-fixed', !motion && 'is-still', className)}
          onClick={(event) => {
            event.stopPropagation();
            if (event.target === event.currentTarget) {
              close();
            }
          }}
          onMouseDown={stop}
          onDoubleClick={stop}
          onContextMenu={stop}
          onPaste={stop}
          onKeyDown={stop}
          onKeyUp={stop}
          onInput={stop}
          onSubmit={stop}
        >
          <div role="dialog" aria-modal="true" aria-label={label} className="krp-stage">{children}</div>
        </div>,
        host.element
      ) : null}
    </>
  );
}
