import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { useIsDesktopLayout } from '@/components/ui/desktop/Modal';
import { resolveThumbnailUrl } from '@/utils/assetUrl';
import { RecommendedGroupJoinDialog } from './desktop/RecommendedGroupJoinDialog';
import { useRecommendedGroupJoin, type RecommendedGroupJoinModalProps } from './recommendedGroupJoin';

/** 作品里的积木推荐用户加入某个群时弹出的确认框。 */
export function RecommendedGroupJoinModal(props: RecommendedGroupJoinModalProps): JSX.Element {
  return useIsDesktopLayout() ? <RecommendedGroupJoinDialog {...props} /> : <MobileRecommendedGroupJoinModal {...props} />;
}

/** 手机布局下的版本：外观由 kc-mobile-overlay / kc-mobile-dialog 的样式接管。 */
function MobileRecommendedGroupJoinModal(props: RecommendedGroupJoinModalProps): JSX.Element {
  const { request } = props;
  const { close, group, title, lookupFailed, notFound, needsAnswer, isInviteOnly, answer, setAnswer, resultText, canJoin, primaryLabel, isJoining, join } = useRecommendedGroupJoin(props);
  const avatarUrl = resolveThumbnailUrl(group?.avatar_url);

  return (
    <div className="kc-mobile-overlay fixed inset-0 z-[2147483646] grid place-items-center p-4 [background:rgba(15,23,42,0.32)]" onMouseDown={close}>
      <div onMouseDown={(event) => event.stopPropagation()} className="kc-mobile-dialog kc-mobile-scrollable-dialog w-full max-w-[460px] overflow-hidden rounded-[28px] border shadow-float [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-text)]">
        <header className="flex items-center justify-between gap-3 border-b px-5 py-4 [border-color:var(--kc-border)]">
          <div>
            <h2 className="text-base font-bold">肝酱推荐添加群聊：</h2>
            <p className="mt-1 text-xs [color:var(--kc-muted)]">来自作品积木的群聊推荐</p>
          </div>
          <button type="button" onClick={close} className="kc-icon-button h-9 w-9" aria-label="关闭推荐加群弹窗">
            <Icon name="close" className="h-4 w-4" />
          </button>
        </header>

        <main className="space-y-4 p-5">
          <section className="rounded-[24px] border p-4 [background:var(--kc-panel-muted)] [border-color:var(--kc-border)]">
            <div className="flex items-center gap-3">
              {avatarUrl ? <img src={avatarUrl} alt={title} className="h-14 w-14 rounded-2xl border object-cover [border-color:var(--kc-border)]" /> : <Avatar label={title} size="lg" />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-bold">{title}</p>
                <p className="mt-1 text-xs [color:var(--kc-muted)]">群号 {request.groupId}{group ? ` · ${group.member_count ?? 0} 人 · ${group.category?.trim() || '未设置分类'}` : ''}</p>
              </div>
            </div>
            {group?.description?.trim() ? <p className="mt-3 line-clamp-3 text-sm leading-6 [color:var(--kc-muted)]">{group.description}</p> : null}
            {lookupFailed ? <p className="mt-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-500">无法获取该群聊信息，请确认群号是否存在或群聊是否公开。</p> : null}
            {notFound ? <p className="mt-3 rounded-2xl px-3 py-2 text-xs [background:var(--kc-panel)] [color:var(--kc-muted)]">未找到可加入的公开群聊。</p> : null}
          </section>

          {request.extraMessage ? (
            <section className="rounded-[22px] border px-4 py-3 [border-color:var(--kc-border)]">
              <p className="text-xs font-semibold [color:var(--kc-muted)]">附加消息</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{request.extraMessage}</p>
            </section>
          ) : null}

          {needsAnswer ? (
            <section className="rounded-[22px] border px-4 py-3 [border-color:var(--kc-border)]">
              <p className="text-xs font-semibold [color:var(--kc-muted)]">加群问题</p>
              <p className="mt-2 text-sm leading-6">{group?.join_question?.trim() || '请回答管理员设置的问题'}</p>
              <textarea value={answer} onChange={(event) => setAnswer(event.target.value)} rows={3} maxLength={500} className="scroll-soft mt-3 w-full resize-none rounded-2xl border px-4 py-3 text-sm leading-5 outline-none [background:var(--kc-panel-muted)] [border-color:var(--kc-border)] [color:var(--kc-text)] placeholder:[color:var(--kc-muted)] focus:[border-color:var(--kc-accent)]" placeholder="输入你的答案，管理员审核时会看到" />
            </section>
          ) : null}

          {isInviteOnly ? <p className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600">该群聊当前仅可邀请加入，无法通过推荐弹窗直接加入。</p> : null}
          {resultText ? <p className="rounded-2xl px-3 py-2 text-xs [background:var(--kc-panel-muted)] [color:var(--kc-accent)]">{resultText}</p> : null}
        </main>

        <footer className="kc-mobile-actions flex justify-end gap-2 border-t px-5 py-4 [border-color:var(--kc-border)]">
          <button type="button" onClick={close} className="rounded-2xl px-4 py-2 text-sm font-semibold transition [background:var(--kc-panel-muted)] [color:var(--kc-muted)] hover:[color:var(--kc-text)]">取消</button>
          <button type="button" onClick={join} disabled={!canJoin || isJoining} className="liquid-button rounded-2xl px-5 py-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50">
            {isJoining ? '处理中...' : primaryLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}
