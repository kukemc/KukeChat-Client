import { useState, type SyntheticEvent } from 'react';
import { createPortal } from 'react-dom';
import { useMutation } from '@tanstack/react-query';
import { rejectGroupJoinRequest } from '@/api/conversations';
import { Icon } from '@/components/ui/Icon';
import { getDesktopPortalRoot, Modal, useIsDesktopLayout } from '@/components/ui/desktop/Modal';
import type { GroupJoinRequest } from '@/types/api';
import { JOIN_REJECT_NOTE_MAX, normalizeDecisionNote } from './groupJoin';

interface RejectJoinRequestDialogProps {
  /** 申请人的名字，有就写进说明里 */
  applicantName?: string;
  pending: boolean;
  error?: string | null;
  onConfirm: (note: string | null) => void;
  onClose: () => void;
}

// 对话框挂在窗口根上，但 React 的事件仍会沿组件树冒泡：
// 不拦住的话，在里面点一下会被外层「点遮罩关闭」的入群申请弹窗当成点到了外面
function stop(event: SyntheticEvent): void {
  event.stopPropagation();
}

/** 拒绝入群申请前的确认框：可以写一句拒绝理由（选填），申请人会看到。像手机 QQ 那样。 */
export function RejectJoinRequestDialog(props: RejectJoinRequestDialogProps): JSX.Element {
  const desktop = useIsDesktopLayout();
  return createPortal(
    <div className="contents" onMouseDown={stop} onClick={stop}>
      {desktop ? <DesktopRejectDialog {...props} /> : <MobileRejectDialog {...props} />}
    </div>,
    getDesktopPortalRoot()
  );
}

function useNote(): [string, (value: string) => void] {
  const [note, setNote] = useState('');
  return [note, (value: string) => setNote(value.slice(0, JOIN_REJECT_NOTE_MAX))];
}

function DesktopRejectDialog({ applicantName, pending, error, onConfirm, onClose }: RejectJoinRequestDialogProps): JSX.Element {
  const [note, setNote] = useNote();
  return (
    <Modal
      title="拒绝入群申请"
      subtitle={applicantName}
      className="kmd-modal--sm"
      bodyClassName="kmd-form"
      raised
      dismissOnBackdrop={!note.trim() && !pending}
      dismissOnEscape={!pending}
      onClose={onClose}
      onSubmit={() => {
        if (!pending) onConfirm(normalizeDecisionNote(note));
      }}
      footer={(
        <>
          <button type="button" className="kui-btn kui-btn--ghost" disabled={pending} onClick={onClose}>取消</button>
          <button type="submit" className="kui-btn kui-btn--danger" disabled={pending}>{pending ? '处理中…' : '拒绝'}</button>
        </>
      )}
    >
      <label className="kmd-field">
        <span className="kmd-label">拒绝理由</span>
        <textarea
          className="kui-textarea kui-scroll"
          rows={3}
          value={note}
          maxLength={JOIN_REJECT_NOTE_MAX}
          autoFocus
          placeholder="拒绝理由（选填）"
          onChange={(event) => setNote(event.target.value)}
          onKeyDown={(event) => {
            // 回车直接拒绝，Shift+回车换行；输入法组词时的回车不算
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              if (!pending) onConfirm(normalizeDecisionNote(note));
            }
          }}
        />
      </label>
      <p className="kui-note">{note.length}/{JOIN_REJECT_NOTE_MAX} · 申请人会看到这条理由，也可以空着。</p>
      {error ? <p className="kui-note kui-note--danger" role="alert">{error}</p> : null}
    </Modal>
  );
}

function MobileRejectDialog({ applicantName, pending, error, onConfirm, onClose }: RejectJoinRequestDialogProps): JSX.Element {
  const [note, setNote] = useNote();
  return (
    <div className="kc-mobile-overlay fixed inset-0 z-[2147483646] grid place-items-center p-4 [background:rgba(15,23,42,0.32)]" onMouseDown={() => {
      if (!pending && !note.trim()) onClose();
    }}>
      <div onMouseDown={stop} role="dialog" aria-modal="true" aria-label="拒绝入群申请" className="kc-mobile-dialog w-full max-w-[420px] overflow-hidden rounded-[28px] border shadow-float [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-text)]">
        <header className="flex items-center justify-between gap-3 px-5 pt-5">
          <div className="min-w-0">
            <h2 className="text-base font-bold">拒绝入群申请</h2>
            {applicantName ? <p className="mt-1 truncate text-xs [color:var(--kc-muted)]">{applicantName}</p> : null}
          </div>
          <button type="button" onClick={onClose} disabled={pending} className="kc-icon-button h-9 w-9" aria-label="关闭"><Icon name="close" className="h-4 w-4" /></button>
        </header>
        <div className="px-5 pt-4">
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            maxLength={JOIN_REJECT_NOTE_MAX}
            placeholder="拒绝理由（选填）"
            className="scroll-soft w-full resize-none rounded-2xl border px-4 py-3 text-sm leading-5 outline-none [background:var(--kc-panel-muted)] [border-color:var(--kc-border)] [color:var(--kc-text)] placeholder:[color:var(--kc-muted)] focus:[border-color:var(--kc-accent)]"
          />
          <p className="mt-1 text-right text-[11px] [color:var(--kc-muted)]">{note.length}/{JOIN_REJECT_NOTE_MAX}</p>
          {error ? <p className="mt-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-500" role="alert">{error}</p> : null}
        </div>
        <footer className="kc-mobile-actions flex justify-end gap-2 px-5 pb-5 pt-3">
          <button type="button" onClick={onClose} disabled={pending} className="rounded-2xl px-4 py-2 text-sm font-semibold transition [background:var(--kc-panel-muted)] [color:var(--kc-muted)] hover:[color:var(--kc-text)]">取消</button>
          <button type="button" onClick={() => onConfirm(normalizeDecisionNote(note))} disabled={pending} className="rounded-2xl bg-red-500 px-5 py-2 text-sm font-bold text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50">
            {pending ? '处理中...' : '拒绝'}
          </button>
        </footer>
      </div>
    </div>
  );
}

interface RejectTarget {
  id: number;
  name?: string;
}

/**
 * 拒绝入群申请的整套流程：ask(id) 弹出确认框，确认后带上理由去拒绝，成功后关框。
 * 把返回的 dialog 渲染在组件里任意位置即可（它自己挂到窗口根上）。失败时框不关，错误写在框里。
 */
export function useRejectJoinRequest({ onSuccess }: { onSuccess?: (request: GroupJoinRequest) => void } = {}) {
  const [target, setTarget] = useState<RejectTarget | null>(null);
  const mutation = useMutation({
    mutationFn: ({ id, note }: { id: number; note: string | null }) => rejectGroupJoinRequest(id, { decision_note: note }),
    onSuccess: (request) => {
      setTarget(null);
      onSuccess?.(request);
    }
  });
  const close = (): void => {
    if (!mutation.isPending) {
      setTarget(null);
      mutation.reset();
    }
  };
  const dialog = target ? (
    <RejectJoinRequestDialog
      key={target.id}
      applicantName={target.name}
      pending={mutation.isPending}
      error={mutation.isError ? '拒绝入群申请失败，请稍后重试。' : null}
      onConfirm={(note) => mutation.mutate({ id: target.id, note })}
      onClose={close}
    />
  ) : null;

  return {
    /** 弹出确认框。name 是申请人名字，只用来显示 */
    ask: (id: number, name?: string): void => {
      if (!id) return;
      mutation.reset();
      setTarget({ id, name });
    },
    dialog,
    isPending: mutation.isPending
  };
}
