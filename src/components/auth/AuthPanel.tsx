import { useKukeStore } from '@/store/kukeStore';
import { Icon } from '@/components/ui/Icon';
import { useAuthForm, useForgotPassword } from './authForms';
import { ForgotPasswordDialog } from './desktop/ForgotPasswordDialog';
import { AuthScreen } from './login/AuthScreen';

/** 表单状态放在这一层：扩展里切换电脑 / 手机模式时，已经填的内容不丢。 */
export function AuthPanel(): JSX.Element {
  const isMobile = useKukeStore((state) => state.layoutMode === 'mobile');
  const form = useAuthForm();
  const closeForgot = (): void => form.setShowForgotPassword(false);
  if (isMobile) {
    return <AuthScreen form={form} kind="phone" overlay={form.showForgotPassword ? <MobileForgotPasswordModal initialUsername={form.trimmedUsername} onClose={closeForgot} /> : null} />;
  }
  return <AuthScreen form={form} kind="desk" overlay={form.showForgotPassword ? <ForgotPasswordDialog initialUsername={form.trimmedUsername} onClose={closeForgot} /> : null} />;
}

function MobileForgotPasswordModal({ initialUsername, onClose }: { initialUsername: string; onClose: () => void }): JSX.Element {
  const form = useForgotPassword(initialUsername);
  const { challenge } = form;
  const inputClass = (invalid: boolean): string => `h-11 w-full rounded-xl border px-4 text-sm outline-none ${invalid ? 'border-red-300' : 'border-slate-200'}`;

  return (
    <div className="kc-mobile-overlay absolute inset-0 z-20 grid place-items-center bg-slate-950/35 p-4" onMouseDown={onClose}>
      <form onSubmit={form.submit} onMouseDown={(event) => event.stopPropagation()} className="kc-mobile-dialog kc-mobile-scrollable-dialog w-full max-w-[430px] rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
        {form.ccwDone ? (
          <>
            <h3 className="text-xl font-black text-slate-950">密码已重置</h3>
            <p className="mt-3 text-sm leading-6 text-slate-500">评论区验证码核实通过，账号 {form.trimmedUsername} 的密码已重置为你设置的新密码，现在可以直接登录。</p>
            <button type="button" onClick={onClose} className="mt-6 h-11 w-full rounded-xl bg-blue-600 text-sm font-black text-white transition hover:bg-blue-500">去登录</button>
          </>
        ) : form.submitted ? (
          <>
            <h3 className="text-xl font-black text-slate-950">申请已提交</h3>
            <p className="mt-3 text-sm leading-6 text-slate-500">管理员会根据你提交的 CCW 主页、理由、提交 IP 和账号注册 IP 判断账号归属。审核通过后，会将账号密码重置为你填写的新密码。</p>
            <button type="button" onClick={onClose} className="mt-6 h-11 w-full rounded-xl bg-blue-600 text-sm font-black text-white transition hover:bg-blue-500">知道了</button>
          </>
        ) : form.mode === 'ccw' && challenge ? (
          <>
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-black text-slate-950">CCW 验证码快速重置</h3>
                <p className="mt-2 text-sm text-slate-500">核实评论归属后立即重置，无需人工审核。</p>
              </div>
              <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100" aria-label="关闭">
                <Icon name="close" className="h-4 w-4" />
              </button>
            </div>
            <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
              <p className="text-xs font-bold text-slate-500">你的验证码（{Math.round(challenge.expires_in / 60)} 分钟内有效）</p>
              <button type="button" onClick={() => form.copyCode(challenge.code)} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl py-1 text-2xl font-black tracking-[0.2em] text-blue-600 transition hover:bg-blue-100/70" title="点击复制验证码">
                {challenge.code}<Icon name="copy" className="h-4 w-4 opacity-60" />
              </button>
              <p className="mt-1 text-center text-[11px] text-blue-500/80">{form.codeCopied ? '已复制到剪贴板' : '点击验证码即可复制'}</p>
            </div>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-600">
              <li>打开<a href={challenge.comment_url} target="_blank" rel="noreferrer" className="mx-1 font-bold text-blue-600 underline">指定作品的评论区</a></li>
              <li>用你绑定过的 CCW 账号发布一条评论，内容为上面的验证码</li>
              <li>在下方输入新密码并点击「验证评论并重置密码」</li>
            </ol>
            <label className="mt-4 block">
              <span className="mb-2 block text-sm font-bold text-slate-700">新密码</span>
              <input value={form.newPassword} onChange={(event) => form.setNewPassword(event.target.value)} required type="text" className={inputClass(form.newPasswordInvalid)} placeholder="至少 6 位" />
              {form.newPasswordInvalid ? <p className="mt-2 text-xs text-red-500">新密码至少需要 6 位。</p> : null}
            </label>
            {form.ccwError ? <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-700">{form.ccwError}</p> : null}
            <div className="kc-mobile-actions mt-6 flex justify-end gap-3">
              <button type="button" onClick={form.backToAppeal} className="rounded-xl px-4 py-2 text-sm font-bold text-slate-500 transition hover:bg-slate-100">返回申诉</button>
              <button type="submit" disabled={!form.canConfirmCcw} className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-black text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60">{form.isConfirming ? '验证中...' : form.autoVerify ? '正在自动重试，点击手动验证' : '验证评论并重置密码'}</button>
            </div>
          </>
        ) : (
          <>
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-black text-slate-950">忘记密码申诉</h3>
                <p className="mt-2 text-sm text-slate-500">提交后由后台管理员人工审核，不会自动重置密码。</p>
              </div>
              <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100" aria-label="关闭">
                <Icon name="close" className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-4">
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-700">账号</span>
                <input value={form.username} onChange={(event) => form.setUsername(event.target.value)} required className={inputClass(form.usernameInvalid || form.lookup === 'missing')} placeholder="请输入 KukeChat 用户名" />
                {form.usernameInvalid ? <p className="mt-2 text-xs text-red-500">账号仅可使用英文字母、数字、下划线、点和短横线。</p> : null}
                {!form.usernameInvalid && form.lookup === 'checking' ? <p className="mt-2 text-xs text-slate-400">正在检查账号...</p> : null}
                {!form.usernameInvalid && form.lookup === 'missing' ? <p className="mt-2 text-xs text-red-500">账号不存在，请检查用户名是否输入正确。</p> : null}
              </label>
              {form.lookup === 'exists' && form.ccwBound ? (
                <button type="button" onClick={form.requestCode} disabled={form.isRequestingCode} className="rounded-2xl border border-blue-200 bg-blue-50/70 px-4 py-3 text-left transition hover:border-blue-300 hover:bg-blue-50">
                  <span className="block text-sm font-black text-blue-700">{form.isRequestingCode ? '正在获取验证码...' : '该账号已绑定 CCW，可使用验证码快速重置'}</span>
                  <span className="mt-1 block text-xs leading-5 text-blue-600/80">无需人工审核，去 CCW 评论区发送一条验证码即可立即重置密码。</span>
                </button>
              ) : null}
              {form.ccwError && !challenge ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{form.ccwError}</p> : null}
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-700">CCW 主页链接</span>
                <input value={form.ccwProfileUrl} onChange={(event) => form.setCcwProfileUrl(event.target.value)} required className={inputClass(form.ccwProfileInvalid)} placeholder="https://www.ccw.site/student/xxx" />
                {form.ccwProfileInvalid ? <p className="mt-2 text-xs text-red-500">请输入正确的 CCW 学生主页链接，例如 https://www.ccw.site/student/xxx</p> : null}
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-700">请填写新密码</span>
                <input value={form.requestedPassword} onChange={(event) => form.setRequestedPassword(event.target.value)} required type="text" className={inputClass(form.requestedPasswordInvalid)} placeholder="至少 6 位，审核通过后将使用此密码" />
                {form.requestedPasswordInvalid ? <p className="mt-2 text-xs text-red-500">新密码至少需要 6 位。</p> : null}
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-700">申诉理由</span>
                <textarea value={form.reason} onChange={(event) => form.setReason(event.target.value)} required className="min-h-24 w-full resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none" placeholder="说明为什么可以证明这个账号属于你，至少 10 个字。" />
              </label>
            </div>
            {form.resetError ? <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{form.resetError}</p> : null}
            <div className="kc-mobile-actions mt-6 flex justify-end gap-3">
              <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-bold text-slate-500 transition hover:bg-slate-100">取消</button>
              <button type="submit" disabled={!form.canSubmit || form.isSubmitting} className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-black text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60">{form.isSubmitting ? '提交中...' : '提交申请'}</button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
