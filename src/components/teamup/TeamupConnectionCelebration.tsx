import { useEffect } from 'react';
import type { User } from '@/types/api';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';

export function TeamupConnectionCelebration({ me, target, onDone }: { me: User; target: User; onDone: () => void }): JSX.Element {
  useEffect(() => {
    const handle = window.setTimeout(onDone, 2600);
    return () => window.clearTimeout(handle);
  }, [onDone]);

  return (
    <div className="kc-teamup-celebrate-backdrop fixed inset-0 z-[90] grid place-items-center bg-black/40 p-4 backdrop-blur-sm" onClick={onDone}>
      <div className="kc-teamup-celebrate-card relative flex flex-col items-center gap-5 rounded-[28px] border px-8 py-7 shadow-[0_30px_90px_rgba(15,23,42,0.32)] [background:var(--kc-panel)] [border-color:var(--kc-border)]" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center gap-4">
          <div className="kc-teamup-node kc-teamup-node-left flex flex-col items-center gap-2 rounded-[20px] border px-4 py-3 [border-color:var(--kc-border)] [background:var(--kc-panel-muted)]">
            <Avatar user={me} size="lg" />
            <span className="max-w-[88px] truncate text-xs font-bold [color:var(--kc-text)]">{getDisplayName(me)}</span>
          </div>

          <div className="relative flex h-12 w-20 items-center justify-center">
            <span className="kc-teamup-link-line absolute inset-x-1 top-1/2 h-[2px] -translate-y-1/2 [background:linear-gradient(90deg,transparent,var(--kc-accent),transparent)]" />
            <span className="kc-teamup-link-dot grid h-9 w-9 place-items-center rounded-full text-white shadow-lg [background:var(--kc-accent)]"><Icon name="userPlus" className="h-4 w-4" /></span>
          </div>

          <div className="kc-teamup-node kc-teamup-node-right flex flex-col items-center gap-2 rounded-[20px] border px-4 py-3 [border-color:var(--kc-border)] [background:var(--kc-panel-muted)]">
            <Avatar user={target} size="lg" />
            <span className="max-w-[88px] truncate text-xs font-bold [color:var(--kc-text)]">{getDisplayName(target)}</span>
          </div>
        </div>

        <div className="kc-teamup-celebrate-text text-center">
          <h3 className="text-base font-black [color:var(--kc-text)]">组队申请已发送</h3>
          <p className="mt-1 text-sm [color:var(--kc-muted)]">等待对方通过后即可开始协作 ✦</p>
        </div>
      </div>
    </div>
  );
}
