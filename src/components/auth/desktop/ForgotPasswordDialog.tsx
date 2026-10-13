import type { ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useForgotPassword } from '../authForms';
import { AuthField } from './AuthField';

function Header({ title, text, onClose }: { title: string; text: string; onClose: () => void }): JSX.Element {
  return (
    <header className="kau-dialog-head">
      <div>
        <h3>{title}</h3>
        <p>{text}</p>
      </div>
      <button type="button" onClick={onClose} aria-label="关闭"><Icon name="close" className="h-4 w-4" /></button>
    </header>
  );
}

/** 找回密码。流程和各步的校验都在 useForgotPassword 里，这里只是桌面端的界面；盖在登录页右半边上。 */
export function ForgotPasswordDialog({ initialUsername, onClose }: { initialUsername: string; onClose: () => void }): JSX.Element {
  const form = useForgotPassword(initialUsername);
  const { challenge } = form;
  let content: ReactNode;

  if (form.ccwDone || form.submitted) {
    content = (
      <>
        <h3>{form.ccwDone ? '密码已重置' : '申请已提交'}</h3>
        <p className="kau-dialog-text">
          {form.ccwDone
            ? `评论区验证码核实通过，账号 ${form.trimmedUsername} 的密码已重置为你设置的新密码，现在可以直接登录。`
            : '管理员会根据你提交的 CCW 主页、理由、提交 IP 和账号注册 IP 判断账号归属。审核通过后，会将账号密码重置为你填写的新密码。'}
        </p>
        <button type="button" className="kau-btn kau-btn--block" onClick={onClose}>{form.ccwDone ? '去登录' : '知道了'}</button>
      </>
    );
  } else if (form.mode === 'ccw' && challenge) {
    content = (
      <>
        <Header title="CCW 验证码快速重置" text="核实评论归属后立即重置，无需人工审核。" onClose={onClose} />
        <div className="kau-code">
          <p>你的验证码（{Math.round(challenge.expires_in / 60)} 分钟内有效）</p>
          <button type="button" title="点击复制验证码" onClick={() => form.copyCode(challenge.code)}>{challenge.code}<Icon name="copy" className="h-4 w-4" /></button>
          <span>{form.codeCopied ? '已复制到剪贴板' : '点击验证码即可复制'}</span>
        </div>
        <ol className="kau-steps">
          <li>打开<a href={challenge.comment_url} target="_blank" rel="noreferrer">指定作品的评论区</a></li>
          <li>用你绑定过的 CCW 账号发布一条评论，内容为上面的验证码</li>
          <li>在下方输入新密码并点击「验证评论并重置密码」</li>
        </ol>
        <AuthField label="新密码" error={form.newPasswordInvalid ? '新密码至少需要 6 位。' : undefined}>
          <input className="kau-input kc-allow-focus-border" value={form.newPassword} onChange={(event) => form.setNewPassword(event.target.value)} required type="text" autoComplete="off" aria-invalid={form.newPasswordInvalid || undefined} placeholder="至少 6 位" />
        </AuthField>
        {form.ccwError ? <p className="kau-alert kau-alert--warn" role="alert">{form.ccwError}</p> : null}
        <div className="kau-dialog-actions">
          <button type="button" className="kau-btn kau-btn--ghost" onClick={form.backToAppeal}>返回申诉</button>
          <button type="submit" className="kau-btn" disabled={!form.canConfirmCcw}>{form.isConfirming ? '验证中...' : form.autoVerify ? '正在自动重试，点击手动验证' : '验证评论并重置密码'}</button>
        </div>
      </>
    );
  } else {
    content = (
      <>
        <Header title="忘记密码申诉" text="提交后由后台管理员人工审核，不会自动重置密码。" onClose={onClose} />
        <AuthField
          label="账号"
          error={form.usernameInvalid ? '账号仅可使用英文字母、数字、下划线、点和短横线。' : form.lookup === 'missing' ? '账号不存在，请检查用户名是否输入正确。' : undefined}
          hint={form.lookup === 'checking' ? '正在检查账号...' : undefined}
        >
          <input className="kau-input kc-allow-focus-border" value={form.username} onChange={(event) => form.setUsername(event.target.value)} required autoComplete="username" aria-invalid={form.usernameInvalid || form.lookup === 'missing' || undefined} placeholder="请输入 KukeChat 用户名" />
        </AuthField>
        {form.lookup === 'exists' && form.ccwBound ? (
          <button type="button" className="kau-shortcut" disabled={form.isRequestingCode} onClick={form.requestCode}>
            <strong>{form.isRequestingCode ? '正在获取验证码...' : '该账号已绑定 CCW，可使用验证码快速重置'}</strong>
            无需人工审核，去 CCW 评论区发送一条验证码即可立即重置密码。
          </button>
        ) : null}
        {form.ccwError && !challenge ? <p className="kau-alert kau-alert--danger" role="alert">{form.ccwError}</p> : null}
        <AuthField label="CCW 主页链接" error={form.ccwProfileInvalid ? '请输入正确的 CCW 学生主页链接，例如 https://www.ccw.site/student/xxx' : undefined}>
          <input className="kau-input kc-allow-focus-border" value={form.ccwProfileUrl} onChange={(event) => form.setCcwProfileUrl(event.target.value)} required aria-invalid={form.ccwProfileInvalid || undefined} placeholder="https://www.ccw.site/student/xxx" />
        </AuthField>
        <AuthField label="请填写新密码" error={form.requestedPasswordInvalid ? '新密码至少需要 6 位。' : undefined}>
          <input className="kau-input kc-allow-focus-border" value={form.requestedPassword} onChange={(event) => form.setRequestedPassword(event.target.value)} required type="text" autoComplete="off" aria-invalid={form.requestedPasswordInvalid || undefined} placeholder="至少 6 位，审核通过后将使用此密码" />
        </AuthField>
        <AuthField label="申诉理由">
          <textarea className="kau-input kui-scroll kc-allow-focus-border" value={form.reason} onChange={(event) => form.setReason(event.target.value)} required placeholder="说明为什么可以证明这个账号属于你，至少 10 个字。" />
        </AuthField>
        {form.resetError ? <p className="kau-alert kau-alert--danger" role="alert">{form.resetError}</p> : null}
        <div className="kau-dialog-actions">
          <button type="button" className="kau-btn kau-btn--ghost" onClick={onClose}>取消</button>
          <button type="submit" className="kau-btn" disabled={!form.canSubmit || form.isSubmitting}>{form.isSubmitting ? '提交中...' : '提交申请'}</button>
        </div>
      </>
    );
  }

  return (
    <div className="kau-overlay" onMouseDown={onClose}>
      <form className="kau-dialog kui-scroll" role="dialog" aria-modal="true" aria-label="找回密码" onSubmit={form.submit} onMouseDown={(event) => event.stopPropagation()}>{content}</form>
    </div>
  );
}
