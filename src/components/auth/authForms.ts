import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { confirmCcwReset, createCcwResetChallenge, getCookieSession, getRememberedUsername, login, lookupAccount, openSecureLoginPopup, register, setRememberedUsername, setRememberIpLogin, submitPasswordResetRequest } from '@/api/auth';
import { ApiError, accountSuspensionFromError } from '@/api/client';
import { SECURE_LOGIN_ORIGIN } from '@/config';
import { configureNativeBackgroundRealtime } from '@/native/backgroundRealtime';
import { saveNativeSession } from '@/native/session';
import { useKukeStore } from '@/store/kukeStore';
import type { CcwPasswordChallengeInfo } from '@/types/api';
import { isNativeMobileApp, isTauriDesktopApp } from '@/utils/appMode';

/** 登录 / 注册、找回密码的状态与请求。桌面和移动两套界面共用，界面只管怎么画。 */

export type AuthMode = 'login' | 'register';

const USERNAME_PATTERN = /^[A-Za-z0-9_.-]+$/;
const USERNAME_FORMAT_ERROR = '用户名仅可使用英文字母、数字、下划线、点和短横线。';

export function authErrorMessage(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) {
    if (error.message.includes('String should match pattern') || error.message.includes('pattern')) {
      return USERNAME_FORMAT_ERROR;
    }
    return error.message;
  }

  return '请求失败，请检查服务器是否启动。';
}

export function useAuthForm() {
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
  const isRegister = mode === 'register';
  const isNativeApp = isNativeMobileApp() || isTauriDesktopApp();
  const trimmedUsername = username.trim();
  const usernameFormatError = isRegister && trimmedUsername.length > 0 && !USERNAME_PATTERN.test(trimmedUsername) ? USERNAME_FORMAT_ERROR : '';
  const usernameLengthError = isRegister && trimmedUsername.length > 0 && (trimmedUsername.length < 3 || trimmedUsername.length > 50) ? '用户名长度需要在 3 到 50 个字符之间。' : '';
  const usernameError = usernameFormatError || usernameLengthError;
  const passwordLengthError = isRegister && password.length > 0 && password.length < 6 ? '密码至少需要 6 位。' : '';
  const confirmPasswordError = isRegister && confirmPassword.length > 0 && password !== confirmPassword ? '两次输入的密码不一致。' : '';
  const validationError = usernameError || passwordLengthError || confirmPasswordError;

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

  return {
    isRegister, isNativeApp, trimmedUsername,
    username, setUsername, nickname, setNickname,
    password, setPassword, confirmPassword, setConfirmPassword,
    showPassword, toggleShowPassword: () => setShowPassword((value) => !value),
    showConfirmPassword, toggleShowConfirmPassword: () => setShowConfirmPassword((value) => !value),
    showForgotPassword, setShowForgotPassword,
    usernameError, passwordLengthError, confirmPasswordError, validationError,
    error: authMutation.error ? authErrorMessage(authMutation.error) : '',
    isPending: authMutation.isPending,
    secureLoginMessage,
    submit, switchMode, startSecureLogin
  };
}

export type AuthForm = ReturnType<typeof useAuthForm>;

/**
 * 找回密码。两条路：账号绑定过 CCW 的，去评论区发验证码自助重置（mode 为 'ccw'）；
 * 否则填申诉表单，由管理员人工审核（mode 为 'appeal'）。
 */
export function useForgotPassword(initialUsername: string) {
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
  const usernameInvalid = trimmedUsername.length > 0 && !USERNAME_PATTERN.test(trimmedUsername);
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
    onError: (error) => setCcwError(authErrorMessage(error))
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
        setCcwError(authErrorMessage(error));
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

  return {
    trimmedUsername, username, setUsername, usernameInvalid, lookup, ccwBound,
    mode, challenge, submitted, ccwDone, autoVerify,
    ccwProfileUrl, setCcwProfileUrl, ccwProfileInvalid,
    requestedPassword, setRequestedPassword, requestedPasswordInvalid: requestedPassword.length > 0 && requestedPassword.length < 6,
    reason, setReason,
    newPassword, setNewPassword, newPasswordInvalid: newPassword.length > 0 && newPassword.length < 6,
    ccwError, codeCopied, copyCode,
    canSubmit, canConfirmCcw,
    resetError: resetMutation.error ? authErrorMessage(resetMutation.error) : '',
    isSubmitting: resetMutation.isPending,
    isConfirming: confirmMutation.isPending,
    isRequestingCode: challengeMutation.isPending,
    requestCode: () => {
      setCcwError('');
      challengeMutation.mutate();
    },
    backToAppeal: () => {
      setMode('appeal');
      setAutoVerify(false);
    },
    submit
  };
}

export type ForgotPasswordForm = ReturnType<typeof useForgotPassword>;
