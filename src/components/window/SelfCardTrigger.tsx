import { useCallback, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Avatar } from '@/components/ui/Avatar';
import { getDesktopPortalRoot } from '@/components/ui/desktop/Modal';
import { SelfCardDesktop } from '@/components/ui/desktop/SelfCardDesktop';
import type { User } from '@/types/api';

/**
 * 标题栏上自己的头像 + 昵称：点一下弹出「我的资料卡」，再点一下收起。扩展浮窗和桌面端的标题栏共用。
 *
 * 标题栏整条是拖动窗口的把手，所以按钮带 data-window-action —— 两边的标题栏看到它（桌面端还认 button）都不会开始拖动。
 * 卡片挂到按钮所在的那个窗口根上（扩展浮窗的外框 / 桌面端的根）：主题变量在那上面，扩展形态下它也在 Shadow DOM 里面。
 */
export function SelfCardTrigger({ user, label }: { user: User; label: string }): JSX.Element {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const cardId = useId();
  const close = useCallback((restoreFocus?: boolean) => {
    setOpen(false);
    if (restoreFocus) {
      buttonRef.current?.focus({ preventScroll: true });
    }
  }, []);
  const root = open ? buttonRef.current?.closest('.kc-window-frame, .kc-desktop-app') ?? getDesktopPortalRoot() : null;

  return (
    <>
      <h1 className="kwf-self-wrap">
        <button
          ref={buttonRef}
          type="button"
          data-window-action
          className="kwf-self"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? cardId : undefined}
          aria-label={`${label}，我的资料卡`}
          title={open ? undefined : '我的资料卡'}
          onClick={() => setOpen((value) => !value)}
        >
          <Avatar user={user} label={label} size="sm" frame />
          <span className="kwf-title">{label}</span>
        </button>
      </h1>
      {open && root ? createPortal(<SelfCardDesktop user={user} anchorRef={buttonRef} id={cardId} onClose={close} />, root) : null}
    </>
  );
}
