import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { confirmCcwReset, createCcwResetChallenge, getCookieSession, getRememberedUsername, login, lookupAccount, openSecureLoginPopup, register, setRememberedUsername, setRememberIpLogin, submitPasswordResetRequest } from '@/api/auth';
import { SECURE_LOGIN_ORIGIN } from '@/config';
import { ApiError } from '@/api/client';
import { accountSuspensionFromError } from '@/api/client';
import type { CcwPasswordChallengeInfo } from '@/types/api';
import { useKukeStore } from '@/store/kukeStore';
import { Icon } from '@/components/ui/Icon';
import { MobileStatusBar } from '@/components/mobile/MobileChrome';
import { saveNativeSession } from '@/native/session';
import { configureNativeBackgroundRealtime } from '@/native/backgroundRealtime';
import { isNativeMobileApp, isTauriDesktopApp } from '@/utils/appMode';

type AuthMode = 'login' | 'register';

function errorMessage(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) {
    if (error.message.includes('String should match pattern') || error.message.includes('pattern')) {
      return '用户名仅可使用英文字母、数字、下划线、点和短横线。';
    }
    return error.message;
  }

  return '请求失败，请检查服务器是否启动。';
}

export function AuthPanel(): JSX.Element {
  const [mode, setMode] = useState<AuthMode>('login');
  const [username, setUsername] = useState(() => getRememberedUsername());
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [secureLoginMessage, setSecureLoginMessage] = useState('');
  const setSession = useKukeStore((state) => state.setSession);
  const setAccountSuspension = useKukeStore((state) => state.setAccountSuspension);
  const layoutMode = useKukeStore((state) => state.layoutMode);
  const isRegister = mode === 'register';
  const isMobile = layoutMode === 'mobile';
  const isNativeApp = isNativeMobileApp() || isTauriDesktopApp();
  const trimmedUsername = username.trim();
  const usernameFormatError = isRegister && trimmedUsername.length > 0 && !/^[A-Za-z0-9_.-]+$/.test(trimmedUsername) ? '用户名仅可使用英文字母、数字、下划线、点和短横线。' : '';
  const usernameLengthError = isRegister && trimmedUsername.length > 0 && (trimmedUsername.length < 3 || trimmedUsername.length > 50) ? '用户名长度需要在 3 到 50 个字符之间。' : '';
  const passwordLengthError = isRegister && password.length > 0 && password.length < 6 ? '密码至少需要 6 位。' : '';
  const confirmPasswordError = isRegister && confirmPassword.length > 0 && password !== confirmPassword ? '两次输入的密码不一致。' : '';
  const validationError = usernameFormatError || usernameLengthError || passwordLengthError || confirmPasswordError;

  const authMutation = useMutation({
    mutationFn: async () => {
      if (validationError) {
        throw new Error(validationError);
      }
      if (mode === 'login') {
        return login({ username: trimmedUsername, password, rememberMe: isNativeApp });
      }
      if (password !== confirmPassword) {
        throw new Error('两次输入的密码不一致。');
      }

      return register({ username: trimmedUsername, nickname, password });
    },
    onSuccess: (session) => {
      if (isNativeApp) {
        void saveNativeSession(session);
        void configureNativeBackgroundRealtime(session.token, session.user.id, true);
        setRememberedUsername(trimmedUsername);
      } else if (mode === 'login') {
        setRememberIpLogin(false);
      } else {
        setRememberIpLogin(true);
        setRememberedUsername(trimmedUsername);
      }
      setSession(session.token, session.user);
    },
    onError: (error) => {
      const suspension = accountSuspensionFromError(error);
      if (suspension) setAccountSuspension(suspension);
    }
  });

  const cookieSessionMutation = useMutation({
    mutationFn: getCookieSession,
    onSuccess: (session) => {
      if (isNativeApp) {
        void saveNativeSession(session);
        void configureNativeBackgroundRealtime(session.token, session.user.id, true);
      }
      setSession(session.token, session.user);
    },
    onError: (error) => {
      const suspension = accountSuspensionFromError(error);
      if (suspension) {
        setAccountSuspension(suspension);
        return;
      }
      setSecureLoginMessage('没有检测到有效的安全登录会话，请先在弹窗中完成登录。');
    }
  });

  useEffect(() => {
    function handleMessage(event: MessageEvent): void {
      if (event.origin !== SECURE_LOGIN_ORIGIN) {
        return;
      }
      if ((event.data as { type?: string } | null)?.type === 'kukechat.cookie-login.success') {
        setSecureLoginMessage('登录成功，正在同步会话...');
        cookieSessionMutation.mutate();
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [cookieSessionMutation]);

  function submit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    authMutation.mutate();
  }

  function switchMode(nextMode: AuthMode): void {
    setMode(nextMode);
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);
    authMutation.reset();
  }

  function startSecureLogin(): void {
    setSecureLoginMessage('');
    const popup = openSecureLoginPopup();
    if (!popup) {
      setSecureLoginMessage('浏览器阻止了登录弹窗，请允许弹窗后重试。');
    }
  }

  if (isMobile) {
    return (
      <div className="kc-mobile-auth-native h-full overflow-hidden bg-[#f1f3f8] text-[#111827]">
        {!isNativeApp ? <MobileStatusBar /> : null}
        <main className={`kc-qq-scroll overflow-y-auto px-5 pb-6 ${isNativeApp ? 'h-full pt-6' : 'h-[calc(100%-30px)] pt-4'}`}>
          <section className="kc-ios-page-push mx-auto flex min-h-full max-w-[340px] flex-col justify-center py-5">
            <div className="mb-7">
              <div className="grid h-14 w-14 place-items-center rounded-[22px] bg-[#168bff] text-white shadow-[0_16px_34px_rgba(22,139,255,0.30)]">
                <Icon name="message" className="h-7 w-7" />
              </div>
              <h1 className="mt-5 text-[30px] font-black leading-tight tracking-[-0.04em] text-[#101828]">{isRegister ? '创建 KukeChat' : '登录 KukeChat'}</h1>
              <p className="mt-2 text-[14px] leading-6 text-[#7b8494]">{isRegister ? '设置一个账号，开始和朋友聊天。' : '欢迎回来，继续你的聊天。'}</p>
            </div>

            <form onSubmit={submit} className="grid gap-3">
              <section className="rounded-[28px] bg-white p-4 shadow-[0_1px_0_rgba(15,23,42,0.04)]">
                <label className="block">
                  <span className="mb-2 block text-[13px] font-bold text-[#667085]">用户名</span>
                  <input value={username} onChange={(event) => setUsername(event.target.value)} required className={`h-11 w-full rounded-[16px] border bg-[#f6f8fc] px-3.5 text-[15px] font-semibold text-[#111827] outline-none transition placeholder:text-[#a4adba] focus:bg-white ${validationError && (usernameFormatError || usernameLengthError) ? 'border-red-300 focus:border-red-400' : 'border-transparent focus:border-[#168bff]'}`} placeholder="请输入用户名" />
                  {isRegister ? <p className={`mt-2 text-[11px] ${usernameFormatError || usernameLengthError ? 'text-red-500' : 'text-[#98a2b3]'}`}>{usernameFormatError || usernameLengthError || '字母、数字、下划线、点和短横线。'}</p> : null}
                </label>
                {isRegister ? (
                  <label className="kc-ios-field-enter mt-3 block">
                    <span className="mb-2 block text-[13px] font-bold text-[#667085]">昵称</span>
                    <input value={nickname} onChange={(event) => setNickname(event.target.value)} className="h-11 w-full rounded-[16px] border border-transparent bg-[#f6f8fc] px-3.5 text-[15px] font-semibold text-[#111827] outline-none transition placeholder:text-[#a4adba] focus:border-[#168bff] focus:bg-white" placeholder="显示名称" />
                  </label>
                ) : null}
              </section>

              <section className="rounded-[28px] bg-white p-4 shadow-[0_1px_0_rgba(15,23,42,0.04)]">
                <MobilePasswordField label="密码" value={password} onChange={setPassword} visible={showPassword} onToggleVisible={() => setShowPassword((value) => !value)} error={passwordLengthError} placeholder="至少 6 位" />
                {isRegister ? <MobilePasswordField label="确认密码" value={confirmPassword} onChange={setConfirmPassword} visible={showConfirmPassword} onToggleVisible={() => setShowConfirmPassword((value) => !value)} error={confirmPasswordError} placeholder="再次输入密码" className="mt-3" /> : null}
              </section>

              {!isRegister ? <button type="button" onClick={() => setShowForgotPassword(true)} className="justify-self-end rounded-full px-2 py-1 text-[13px] font-bold text-[#168bff]">忘记密码?</button> : null}
              {authMutation.error ? <p className="rounded-[20px] bg-red-50 px-4 py-3 text-[13px] leading-5 text-red-500">{errorMessage(authMutation.error)}</p> : null}

              <button disabled={authMutation.isPending || Boolean(validationError)} className="mt-2 h-12 rounded-[18px] bg-[#168bff] text-[15px] font-black text-white shadow-[0_14px_30px_rgba(22,139,255,0.30)] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55" type="submit">
                {authMutation.isPending ? '连接中...' : isRegister ? '创建账号' : '登录'}
              </button>

              {!isRegister && !isNativeApp ? (
                <>
                  <button type="button" onClick={startSecureLogin} className="h-11 rounded-[18px] bg-white text-[14px] font-black text-[#168bff] shadow-[0_1px_0_rgba(15,23,42,0.04)] transition active:scale-[0.98]">安全登录</button>
                  {secureLoginMessage ? <p className="rounded-[18px] bg-white px-4 py-3 text-[12px] leading-5 text-[#667085]">{secureLoginMessage}</p> : null}
                </>
              ) : null}

              <button type="button" onClick={() => switchMode(isRegister ? 'login' : 'register')} className="mt-1 rounded-[18px] px-4 py-3 text-[14px] font-bold text-[#667085] transition active:scale-[0.98]">
                {isRegister ? '已有账号，去登录' : '没有账号，创建一个'}
              </button>
            </form>
          </section>
          {showForgotPassword ? <ForgotPasswordModal initialUsername={trimmedUsername} onClose={() => setShowForgotPassword(false)} /> : null}
        </main>
      </div>
    );
  }

  return (
    <div className="kc-mobile-auth grid h-full grid-cols-[56px_minmax(0,1fr)] overflow-hidden bg-white text-[#111827] sm:grid-cols-[88px_minmax(0,1fr)]">
      <aside className="relative overflow-hidden bg-[#0c1422] text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_92%,rgba(147,51,234,0.30),transparent_34%),linear-gradient(180deg,#172235_0%,#0c1422_54%,#05070c_100%)]" />
        <div className="auth-orb absolute -left-10 bottom-10 h-32 w-32 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="relative z-10 flex h-full flex-col items-center justify-between py-7">
          <div className="auth-rise grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/10 shadow-[0_16px_42px_rgba(37,99,235,0.24)] backdrop-blur">
            <Icon name="message" className="h-5 w-5 text-blue-100" />
          </div>
          <div className="hidden -rotate-90 whitespace-nowrap text-xs font-semibold tracking-[0.26em] text-white/35 sm:block">SCRATCH SOCIAL</div>
          <span className="h-1.5 w-1.5 rounded-full bg-blue-400 shadow-[0_0_18px_rgba(96,165,250,0.9)]" />
        </div>
      </aside>

      <main className="kc-mobile-auth-main relative flex min-h-0 items-center justify-center overflow-y-auto bg-white px-7 py-10 sm:px-12">
        <div className="pointer-events-none absolute bottom-0 left-0 h-56 w-56 rounded-full bg-violet-100/60 blur-3xl" />
        <form onSubmit={submit} className="kc-mobile-auth-card auth-card-enter relative z-10 w-full max-w-[385px]">
          <div className="mb-10">
            <h2 className="text-3xl font-black tracking-tight text-slate-950">{isRegister ? '创建账号' : '欢迎回来'}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-500">{isRegister ? '创建你的 Scratch 聊天身份。' : '登录后继续连接你的 Scratch 社交空间。'}</p>
          </div>

          <div className="grid gap-4">
            <label className="group block">
              <span className="mb-2 block text-sm font-bold text-slate-700">用户名</span>
              <input value={username} onChange={(event) => setUsername(event.target.value)} required className={`h-12 w-full rounded-xl border bg-[#eef4ff] px-4 text-sm text-slate-950 shadow-inner outline-none transition duration-300 placeholder:text-slate-400 focus:bg-white ${validationError && (usernameFormatError || usernameLengthError) ? 'border-red-300 focus:border-red-500 focus:shadow-[0_0_0_4px_rgba(239,68,68,0.10)]' : 'border-slate-200 focus:border-blue-500 focus:shadow-[0_0_0_4px_rgba(37,99,235,0.10)]'}`} placeholder="kuke" />
              {isRegister ? <p className={`mt-2 text-xs ${usernameFormatError || usernameLengthError ? 'text-red-500' : 'text-slate-400'}`}>{usernameFormatError || usernameLengthError || '仅可使用字母、数字、下划线、点和短横线。'}</p> : null}
            </label>

            {isRegister ? (
              <label className="group block auth-field-enter">
                <span className="mb-2 block text-sm font-bold text-slate-700">昵称</span>
                <input value={nickname} onChange={(event) => setNickname(event.target.value)} className="h-12 w-full rounded-xl border border-slate-200 bg-[#eef4ff] px-4 text-sm text-slate-950 shadow-inner outline-none transition duration-300 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:shadow-[0_0_0_4px_rgba(37,99,235,0.10)]" placeholder="酷可" />
              </label>
            ) : null}

            <PasswordField label="密码" value={password} onChange={setPassword} visible={showPassword} onToggleVisible={() => setShowPassword((value) => !value)} error={passwordLengthError} placeholder="至少 6 位" />

            {isRegister ? (
              <PasswordField label="确认密码" value={confirmPassword} onChange={setConfirmPassword} visible={showConfirmPassword} onToggleVisible={() => setShowConfirmPassword((value) => !value)} error={confirmPasswordError} placeholder="再次输入密码" />
            ) : null}
          </div>

          {!isRegister ? (
            <div className="mt-5 flex items-center justify-between text-sm">
              <p className="max-w-[220px] leading-5 text-slate-500">{isNativeApp ? '登录后会自动保存本地状态。' : '普通登录不会保存登录状态。'}</p>
              <button type="button" onClick={() => setShowForgotPassword(true)} className="font-semibold text-blue-600 transition hover:text-blue-500">忘记密码?</button>
            </div>
          ) : null}

          {authMutation.error ? <p className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{errorMessage(authMutation.error)}</p> : null}

          <button disabled={authMutation.isPending || Boolean(validationError)} className="mt-7 h-12 w-full rounded-xl bg-blue-600 px-5 text-sm font-black text-white shadow-[0_18px_38px_rgba(37,99,235,0.30)] transition duration-300 hover:-translate-y-0.5 hover:bg-blue-500 hover:shadow-[0_22px_48px_rgba(37,99,235,0.36)] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60" type="submit">
            {authMutation.isPending ? '连接中...' : isRegister ? '立即创建' : '立即登录'}
          </button>

          {!isRegister && !isNativeApp ? (
            <>
              <button type="button" onClick={startSecureLogin} className="mt-3 h-11 w-full rounded-xl border border-blue-200 bg-blue-50 px-5 text-sm font-black text-blue-700 transition hover:border-blue-300 hover:bg-blue-100">
                安全登录（推荐使用）
              </button>
              <p className="mt-2 text-center text-xs leading-5 text-slate-500">使用安全登录后，下次打开可自动同步登录状态。</p>
              {secureLoginMessage ? <p className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">{secureLoginMessage}</p> : null}
            </>
          ) : null}

          <button type="button" onClick={() => switchMode(isRegister ? 'login' : 'register')} className="mt-4 w-full rounded-xl px-4 py-3 text-sm font-bold text-slate-500 transition hover:bg-slate-100 hover:text-slate-950">
            {isRegister ? '已有账号？返回登录' : '没有账号？创建一个'}
          </button>
        </form>
        {showForgotPassword ? <ForgotPasswordModal initialUsername={trimmedUsername} onClose={() => setShowForgotPassword(false)} /> : null}
      </main>
    </div>
  );
}


function PasswordField({ label, value, onChange, visible, onToggleVisible, error, placeholder }: { label: string; value: string; onChange: (value: string) => void; visible: boolean; onToggleVisible: () => void; error?: string; placeholder: string }): JSX.Element {
  return (
    <label className="group block">
      <span className="mb-2 block text-sm font-bold text-slate-700">{label}</span>
      <span className="relative block">
        <input value={value} onChange={(event) => onChange(event.target.value)} required type={visible ? 'text' : 'password'} className={`h-12 w-full rounded-xl border bg-[#eef4ff] px-4 pr-12 text-sm text-slate-950 shadow-inner outline-none transition duration-300 placeholder:text-slate-400 focus:bg-white ${error ? 'border-red-300 focus:border-red-500 focus:shadow-[0_0_0_4px_rgba(239,68,68,0.10)]' : 'border-slate-200 focus:border-blue-500 focus:shadow-[0_0_0_4px_rgba(37,99,235,0.10)]'}`} placeholder={placeholder} />
        <button type="button" onClick={onToggleVisible} className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-slate-500 transition hover:bg-white hover:text-blue-600" aria-label={visible ? '隐藏密码' : '显示密码'}>
          <Icon name={visible ? 'eyeOff' : 'eye'} className="h-4 w-4" />
        </button>
      </span>
      {error ? <p className="mt-2 text-xs text-red-500">{error}</p> : null}
    </label>
  );
}


function MobilePasswordField({ label, value, onChange, visible, onToggleVisible, error, placeholder, className = '' }: { label: string; value: string; onChange: (value: string) => void; visible: boolean; onToggleVisible: () => void; error?: string; placeholder: string; className?: string }): JSX.Element {
  return (
    <label className={`block ${className}`}>
      <span className="mb-2 block text-[13px] font-bold text-[#667085]">{label}</span>
      <span className="relative block">
        <input value={value} onChange={(event) => onChange(event.target.value)} required type={visible ? 'text' : 'password'} className={`h-11 w-full rounded-[16px] border bg-[#f6f8fc] px-3.5 pr-11 text-[15px] font-semibold text-[#111827] outline-none transition placeholder:text-[#a4adba] focus:bg-white ${error ? 'border-red-300 focus:border-red-400' : 'border-transparent focus:border-[#168bff]'}`} placeholder={placeholder} />
        <button type="button" onClick={onToggleVisible} className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-[#98a2b3] transition active:scale-95" aria-label={visible ? '隐藏密码' : '显示密码'}>
          <Icon name={visible ? 'eyeOff' : 'eye'} className="h-4 w-4" />
        </button>
      </span>
      {error ? <p className="mt-2 text-[11px] text-red-500">{error}</p> : null}
    </label>
  );
}


function ForgotPasswordModal({ initialUsername, onClose }: { initialUsername: string; onClose: () => void }): JSX.Element {
  const [username, setUsername] = useState(initialUsername);
  const [lookup, setLookup] = useState<'idle' | 'checking' | 'exists' | 'missing'>('idle');
  const [ccwBound, setCcwBound] = useState(false);
  const [mode, setMode] = useState<'appeal' | 'ccw'>('appeal');
  const [ccwProfileUrl, setCcwProfileUrl] = useState('');
  const [requestedPassword, setRequestedPassword] = useState('');
  const [reason, setReason] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [challenge, setChallenge] = useState<CcwPasswordChallengeInfo | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [ccwError, setCcwError] = useState('');
  const [ccwDone, setCcwDone] = useState(false);
  const [autoVerify, setAutoVerify] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  function copyCode(code: string): void {
    void navigator.clipboard?.writeText(code).then(() => {
      setCodeCopied(true);
      window.setTimeout(() => setCodeCopied(false), 2000);
    });
  }

  const trimmedUsername = username.trim();
  const usernameInvalid = trimmedUsername.length > 0 && !/^[A-Za-z0-9_.-]+$/.test(trimmedUsername);
  const usernameCheckable = trimmedUsername.length >= 3 && !usernameInvalid;

  useEffect(() => {
    setMode('appeal');
    setChallenge(null);
    setCcwError('');
    setCcwDone(false);
    setAutoVerify(false);
    if (!usernameCheckable) {
      setLookup('idle');
      setCcwBound(false);
      return undefined;
    }
    setLookup('checking');
    const timer = window.setTimeout(() => {
      lookupAccount(trimmedUsername)
        .then((result) => {
          setLookup(result.exists ? 'exists' : 'missing');
          setCcwBound(result.ccw_bound);
        })
        .catch(() => setLookup('idle'));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [trimmedUsername, usernameCheckable]);

  const resetMutation = useMutation({
    mutationFn: () => submitPasswordResetRequest({ username: trimmedUsername, ccw_profile_url: ccwProfileUrl.trim(), requested_password: requestedPassword, reason: reason.trim() }),
    onSuccess: () => setSubmitted(true)
  });
  const challengeMutation = useMutation({
    mutationFn: () => createCcwResetChallenge(trimmedUsername),
    onSuccess: (info) => {
      setChallenge(info);
      setMode('ccw');
      setCcwError('');
    },
    onError: (error) => setCcwError(errorMessage(error))
  });
  const confirmMutation = useMutation({
    mutationFn: () => confirmCcwReset({ username: trimmedUsername, code: challenge?.code ?? '', new_password: newPassword }),
    onSuccess: () => {
      setAutoVerify(false);
      setCcwDone(true);
      setCcwError('');
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 404 && challenge) {
        setCcwError('暂未在评论区检测到验证码，已开启每 5 秒自动重试；确认评论发送成功后会自动完成重置。');
        setAutoVerify(true);
      } else {
        setAutoVerify(false);
        setCcwError(errorMessage(error));
      }
    }
  });

  useEffect(() => {
    if (!autoVerify || !challenge || ccwDone) return undefined;
    const timer = window.setInterval(() => {
      if (!confirmMutation.isPending) confirmMutation.mutate();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [autoVerify, challenge, ccwDone, confirmMutation]);

  const ccwProfileInvalid = ccwProfileUrl.trim().length > 0 && !/^https:\/\/www\.ccw\.site\/student\/[^\s/]+\/?$/.test(ccwProfileUrl.trim());
  const canSubmit = usernameCheckable && lookup === 'exists' && ccwProfileUrl.trim().length >= 8 && !ccwProfileInvalid && requestedPassword.length >= 6 && reason.trim().length >= 10;
  const canConfirmCcw = Boolean(challenge) && newPassword.length >= 6 && !confirmMutation.isPending;

  function submit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (mode === 'ccw') {
      if (canConfirmCcw) {
        setCcwError('');
        confirmMutation.mutate();
      }
      return;
    }
    if (canSubmit) {
      resetMutation.mutate();
    }
  }

  const inputClass = (invalid: boolean): string => `h-11 w-full rounded-xl border px-4 text-sm outline-none ${invalid ? 'border-red-300' : 'border-slate-200'}`;

  return (
    <div className="kc-mobile-overlay absolute inset-0 z-20 grid place-items-center bg-slate-950/35 p-4" onMouseDown={onClose}>
      <form onSubmit={submit} onMouseDown={(event) => event.stopPropagation()} className="kc-mobile-dialog kc-mobile-scrollable-dialog w-full max-w-[430px] rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
        {ccwDone ? (
          <>
            <h3 className="text-xl font-black text-slate-950">密码已重置</h3>
            <p className="mt-3 text-sm leading-6 text-slate-500">评论区验证码核实通过，账号 {trimmedUsername} 的密码已重置为你设置的新密码，现在可以直接登录。</p>
            <button type="button" onClick={onClose} className="mt-6 h-11 w-full rounded-xl bg-blue-600 text-sm font-black text-white transition hover:bg-blue-500">去登录</button>
          </>
        ) : submitted ? (
          <>
            <h3 className="text-xl font-black text-slate-950">申请已提交</h3>
            <p className="mt-3 text-sm leading-6 text-slate-500">管理员会根据你提交的 CCW 主页、理由、提交 IP 和账号注册 IP 判断账号归属。审核通过后，会将账号密码重置为你填写的新密码。</p>
            <button type="button" onClick={onClose} className="mt-6 h-11 w-full rounded-xl bg-blue-600 text-sm font-black text-white transition hover:bg-blue-500">知道了</button>
          </>
        ) : mode === 'ccw' && challenge ? (
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
              <button type="button" onClick={() => copyCode(challenge.code)} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl py-1 text-2xl font-black tracking-[0.2em] text-blue-600 transition hover:bg-blue-100/70" title="点击复制验证码">
                {challenge.code}<Icon name="copy" className="h-4 w-4 opacity-60" />
              </button>
              <p className="mt-1 text-center text-[11px] text-blue-500/80">{codeCopied ? '已复制到剪贴板' : '点击验证码即可复制'}</p>
            </div>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-600">
              <li>打开<a href={challenge.comment_url} target="_blank" rel="noreferrer" className="mx-1 font-bold text-blue-600 underline">指定作品的评论区</a></li>
              <li>用你绑定过的 CCW 账号发布一条评论，内容为上面的验证码</li>
              <li>在下方输入新密码并点击「验证评论并重置密码」</li>
            </ol>
            <label className="mt-4 block">
              <span className="mb-2 block text-sm font-bold text-slate-700">新密码</span>
              <input value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required type="text" className={inputClass(newPassword.length > 0 && newPassword.length < 6)} placeholder="至少 6 位" />
              {newPassword.length > 0 && newPassword.length < 6 ? <p className="mt-2 text-xs text-red-500">新密码至少需要 6 位。</p> : null}
            </label>
            {ccwError ? <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-700">{ccwError}</p> : null}
            <div className="kc-mobile-actions mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => { setMode('appeal'); setAutoVerify(false); }} className="rounded-xl px-4 py-2 text-sm font-bold text-slate-500 transition hover:bg-slate-100">返回申诉</button>
              <button type="submit" disabled={!canConfirmCcw} className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-black text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60">{confirmMutation.isPending ? '验证中...' : autoVerify ? '正在自动重试，点击手动验证' : '验证评论并重置密码'}</button>
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
                <input value={username} onChange={(event) => setUsername(event.target.value)} required className={inputClass(usernameInvalid || lookup === 'missing')} placeholder="请输入 KukeChat 用户名" />
                {usernameInvalid ? <p className="mt-2 text-xs text-red-500">账号仅可使用英文字母、数字、下划线、点和短横线。</p> : null}
                {!usernameInvalid && lookup === 'checking' ? <p className="mt-2 text-xs text-slate-400">正在检查账号...</p> : null}
                {!usernameInvalid && lookup === 'missing' ? <p className="mt-2 text-xs text-red-500">账号不存在，请检查用户名是否输入正确。</p> : null}
              </label>
              {lookup === 'exists' && ccwBound ? (
                <button type="button" onClick={() => { setCcwError(''); challengeMutation.mutate(); }} disabled={challengeMutation.isPending} className="rounded-2xl border border-blue-200 bg-blue-50/70 px-4 py-3 text-left transition hover:border-blue-300 hover:bg-blue-50">
                  <span className="block text-sm font-black text-blue-700">{challengeMutation.isPending ? '正在获取验证码...' : '该账号已绑定 CCW，可使用验证码快速重置'}</span>
                  <span className="mt-1 block text-xs leading-5 text-blue-600/80">无需人工审核，去 CCW 评论区发送一条验证码即可立即重置密码。</span>
                </button>
              ) : null}
              {ccwError && !challenge ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{ccwError}</p> : null}
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-700">CCW 主页链接</span>
                <input value={ccwProfileUrl} onChange={(event) => setCcwProfileUrl(event.target.value)} required className={inputClass(ccwProfileInvalid)} placeholder="https://www.ccw.site/student/xxx" />
                {ccwProfileInvalid ? <p className="mt-2 text-xs text-red-500">请输入正确的 CCW 学生主页链接，例如 https://www.ccw.site/student/xxx</p> : null}
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-700">请填写新密码</span>
                <input value={requestedPassword} onChange={(event) => setRequestedPassword(event.target.value)} required type="text" className={inputClass(requestedPassword.length > 0 && requestedPassword.length < 6)} placeholder="至少 6 位，审核通过后将使用此密码" />
                {requestedPassword.length > 0 && requestedPassword.length < 6 ? <p className="mt-2 text-xs text-red-500">新密码至少需要 6 位。</p> : null}
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-700">申诉理由</span>
                <textarea value={reason} onChange={(event) => setReason(event.target.value)} required className="min-h-24 w-full resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none" placeholder="说明为什么可以证明这个账号属于你，至少 10 个字。" />
              </label>
            </div>
            {resetMutation.error ? <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{errorMessage(resetMutation.error)}</p> : null}
            <div className="kc-mobile-actions mt-6 flex justify-end gap-3">
              <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-bold text-slate-500 transition hover:bg-slate-100">取消</button>
              <button type="submit" disabled={!canSubmit || resetMutation.isPending} className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-black text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60">{resetMutation.isPending ? '提交中...' : '提交申请'}</button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
