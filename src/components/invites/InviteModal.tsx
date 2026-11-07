import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { useIsDesktopLayout } from '@/components/ui/desktop/Modal';
import { InviteDialog } from './desktop/InviteDialog';
import { INVITE_ANSWER_MAX, useInvite, type InviteModalProps } from './inviteData';

/** 打开邀请链接后的确认框：显示对方是哪个群 / 哪个人，确认后加入或加好友。 */
export function InviteModal(props: InviteModalProps): JSX.Element {
  return useIsDesktopLayout() ? <InviteDialog {...props} /> : <MobileInviteModal {...props} />;
}

/** 手机布局下的版本：外观由 kc-mobile-overlay / kc-mobile-dialog 的样式接管。 */
function MobileInviteModal(props: InviteModalProps): JSX.Element {
  const { onClose } = props;
  const { isLoading, failed, title, group, user, needsAnswer, joinQuestion, answer, setAnswer, hint, hintTone, errorText, submitted, acceptLabel, acceptDisabled, accept } = useInvite(props);

  return (
    <div className="kc-mobile-overlay fixed inset-0 z-[70] grid place-items-center bg-black/35 p-4 backdrop-blur-sm">
      <div className="kc-mobile-dialog kc-mobile-scrollable-dialog w-full max-w-md rounded-[30px] border p-5 shadow-2xl [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-text)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] [color:var(--kc-accent)]">KukeChat Invite</p>
            <h3 className="mt-1 text-xl font-black">{title}</h3>
          </div>
          <button type="button" onClick={onClose} className="kc-icon-button h-9 w-9" aria-label="关闭"><Icon name="close" className="h-4 w-4" /></button>
        </div>
        {isLoading ? <p className="mt-5 rounded-2xl p-4 text-sm [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">正在解析邀请链接...</p> : null}
        {failed ? <p className="mt-5 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500">邀请链接无效或已不可用。</p> : null}
        {group ? (
          <div className="mt-5 rounded-[24px] border p-4 [background:var(--kc-panel-muted)] [border-color:var(--kc-border)]">
            <div className="flex items-center gap-3">
              <Avatar label={group.title ?? '群聊'} avatarUrl={group.avatar_url} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-black">{group.title || '未命名群聊'} ({group.member_count ?? 0})</p>
                <p className="mt-1 text-xs [color:var(--kc-muted)]">群号 {group.id} · {group.category || '未设置'}</p>
              </div>
            </div>
            <p className="mt-4 rounded-2xl px-3 py-2 text-sm leading-6 [background:var(--kc-panel)] [color:var(--kc-muted)]">{group.description?.trim() || '这个群还没有简介。'}</p>
          </div>
        ) : null}
        {needsAnswer ? (
          <section className="mt-4 rounded-[22px] border px-4 py-3 [border-color:var(--kc-border)]">
            <p className="text-xs font-semibold [color:var(--kc-muted)]">入群问题</p>
            <p className="mt-2 text-sm leading-6">{joinQuestion}</p>
            <textarea value={answer} onChange={(event) => setAnswer(event.target.value)} rows={3} maxLength={INVITE_ANSWER_MAX} className="scroll-soft mt-3 w-full resize-none rounded-2xl border px-4 py-3 text-sm leading-5 outline-none [background:var(--kc-panel-muted)] [border-color:var(--kc-border)] [color:var(--kc-text)] placeholder:[color:var(--kc-muted)] focus:[border-color:var(--kc-accent)]" placeholder="输入你的回答（必填），管理员审核时会看到" />
          </section>
        ) : null}
        {hint ? <p className={`mt-4 rounded-2xl px-3 py-2 text-xs leading-5 ${hintTone === 'warn' ? 'border border-amber-500/30 bg-amber-500/10 text-amber-600' : hintTone === 'success' ? '[background:var(--kc-accent-soft)] [color:var(--kc-accent)]' : '[background:var(--kc-panel-muted)] [color:var(--kc-muted)]'}`}>{hint}</p> : null}
        {errorText ? <p className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-500" role="alert">{errorText}</p> : null}
        {user ? (
          <div className="mt-5 rounded-[24px] border p-4 [background:var(--kc-panel-muted)] [border-color:var(--kc-border)]">
            <div className="flex items-center gap-3">
              <Avatar user={user} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-black">{getDisplayName(user)}</p>
                <p className="mt-1 text-xs [color:var(--kc-muted)]">账号 {user.id} · @{user.username}</p>
              </div>
            </div>
            <p className="mt-4 rounded-2xl px-3 py-2 text-sm leading-6 [background:var(--kc-panel)] [color:var(--kc-muted)]">{user.bio?.trim() || '咕咕咕~'}</p>
          </div>
        ) : null}
        <div className="kc-mobile-actions mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-2xl border px-4 py-2 text-sm font-bold [border-color:var(--kc-border)] hover:[background:var(--kc-hover)]">{submitted ? '关闭' : '稍后再说'}</button>
          <button type="button" onClick={accept} disabled={acceptDisabled} className="liquid-button rounded-2xl px-4 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50">
            {acceptLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
