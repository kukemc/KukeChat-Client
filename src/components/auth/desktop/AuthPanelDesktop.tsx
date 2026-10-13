import type { ReactNode } from 'react';
import logoUrl from '@/assets/logo.png';
import { APP_NAME } from '@/config';
import { Icon } from '@/components/ui/Icon';
import { isTauriDesktopApp } from '@/utils/appMode';
import packageJson from '../../../../package.json';
import type { AuthForm } from '../authForms';
import { AuthField } from './AuthField';
import { ForgotPasswordDialog } from './ForgotPasswordDialog';

/**
 * 登录页的骨架：左边深色的品牌视觉区（网格、三圈环、缓慢移动的光），右边是跟主题走的内容。
 * overlay 盖在右边那一面上。样式在 desktop-settings.css（kau-）。
 */
function AuthShell({ overlay, children }: { overlay?: ReactNode; children: ReactNode }): JSX.Element {
  return (
    <div className="kau">
      <div className="kau-visual" aria-hidden="true">
        <span className="kau-grid" />
        <span className="kau-light" />
        <span className="kau-rings"><i /><i /><i /></span>
      </div>
      <header className="kau-brand">
        <img className="kau-logo" src={logoUrl} alt="" draggable={false} />
        <p className="kau-eyebrow">SCRATCH SOCIAL</p>
        <p className="kau-wordmark">{APP_NAME}</p>
        <p className="kau-tagline">和 Scratcher 实时沟通、分享日常、认识同好。</p>
        <p className="kau-meta"><span>v{packageJson.version}</span><span>{isTauriDesktopApp() ? 'DESKTOP' : 'EXTENSION'}</span></p>
      </header>
      <div className="kau-stage">
        <main className="kau-main kui-scroll">{children}</main>
        {overlay}
      </div>
    </div>
  );
}

function PasswordField({ label, value, onChange, visible, onToggleVisible, error, placeholder, autoComplete }: { label: string; value: string; onChange: (value: string) => void; visible: boolean; onToggleVisible: () => void; error: string; placeholder: string; autoComplete: string }): JSX.Element {
  return (
    <AuthField label={label} error={error}>
      <span className="kau-password">
        <input className="kau-input kc-allow-focus-border" value={value} onChange={(event) => onChange(event.target.value)} required type={visible ? 'text' : 'password'} autoComplete={autoComplete} aria-invalid={error ? true : undefined} placeholder={placeholder} />
        <button type="button" onClick={onToggleVisible} aria-label={visible ? '隐藏密码' : '显示密码'}><Icon name={visible ? 'eyeOff' : 'eye'} className="h-4 w-4" /></button>
      </span>
    </AuthField>
  );
}

export function AuthPanelDesktop({ form }: { form: AuthForm }): JSX.Element {
  const { isRegister, isNativeApp } = form;
  return (
    <AuthShell overlay={form.showForgotPassword ? <ForgotPasswordDialog initialUsername={form.trimmedUsername} onClose={() => form.setShowForgotPassword(false)} /> : null}>
      <form className="kau-form" onSubmit={form.submit}>
        <p className="kau-form-brand">{APP_NAME}</p>
        <p className="kau-kicker">{isRegister ? 'CREATE ACCOUNT' : 'SIGN IN'}</p>
        <h1>{isRegister ? '创建账号' : '欢迎回来'}</h1>
        <p className="kau-sub">{isRegister ? '创建你的 Scratch 聊天身份。' : '登录后继续连接你的 Scratch 社交空间。'}</p>

        <AuthField label="用户名" error={form.usernameError} hint={isRegister ? '仅可使用字母、数字、下划线、点和短横线。' : undefined}>
          <input className="kau-input kc-allow-focus-border" value={form.username} onChange={(event) => form.setUsername(event.target.value)} required autoComplete="username" aria-invalid={form.usernameError ? true : undefined} placeholder="kuke" />
        </AuthField>
        {isRegister ? (
          <AuthField label="昵称">
            <input className="kau-input kc-allow-focus-border" value={form.nickname} onChange={(event) => form.setNickname(event.target.value)} autoComplete="nickname" placeholder="显示给别人看的名字，可以不填" />
          </AuthField>
        ) : null}
        <PasswordField label="密码" value={form.password} onChange={form.setPassword} visible={form.showPassword} onToggleVisible={form.toggleShowPassword} error={form.passwordLengthError} placeholder={isRegister ? '至少 6 位' : '请输入密码'} autoComplete={isRegister ? 'new-password' : 'current-password'} />
        {isRegister ? <PasswordField label="确认密码" value={form.confirmPassword} onChange={form.setConfirmPassword} visible={form.showConfirmPassword} onToggleVisible={form.toggleShowConfirmPassword} error={form.confirmPasswordError} placeholder="再次输入密码" autoComplete="new-password" /> : null}

        {!isRegister ? (
          <div className="kau-aside">
            <p>{isNativeApp ? '登录后会自动保存本地状态。' : '普通登录不会保存登录状态。'}</p>
            <button type="button" onClick={() => form.setShowForgotPassword(true)}>忘记密码？</button>
          </div>
        ) : null}

        {form.error ? <p className="kau-alert kau-alert--danger" role="alert">{form.error}</p> : null}

        <button type="submit" className="kau-btn kau-btn--submit" disabled={form.isPending || Boolean(form.validationError)}>
          {form.isPending ? '连接中…' : isRegister ? '创建账号' : '登录'}
        </button>

        {!isRegister && !isNativeApp ? (
          <>
            <button type="button" className="kau-btn kau-btn--soft" onClick={form.startSecureLogin}><Icon name="shieldCheck" className="h-4 w-4" />安全登录（推荐使用）</button>
            <p className="kau-note">使用安全登录后，下次打开可自动同步登录状态。</p>
            {form.secureLoginMessage ? <p className="kau-alert" role="status">{form.secureLoginMessage}</p> : null}
          </>
        ) : null}

        <p className="kau-switch">
          {isRegister ? '已有账号？' : '还没有账号？'}
          <button type="button" onClick={() => form.switchMode(isRegister ? 'login' : 'register')}>{isRegister ? '返回登录' : '创建一个'}</button>
        </p>
      </form>
    </AuthShell>
  );
}

/** 启动时等待恢复上次的登录状态。 */
export function AuthRestoring(): JSX.Element {
  return (
    <AuthShell>
      <div className="kau-restoring" role="status">
        <span className="kau-spinner" aria-hidden="true" />
        <h2>正在恢复登录</h2>
        <p>正在检测本地登录状态…</p>
      </div>
    </AuthShell>
  );
}
