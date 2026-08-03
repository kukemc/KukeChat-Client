import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getCookieSession, getMe } from '@/api/auth';
import { getOnlineCount } from '@/api/users';
import { useKukeStore } from '@/store/kukeStore';
import { AuthPanel } from '@/components/auth/AuthPanel';
import { AccountSuspensionModal } from '@/components/auth/AccountSuspensionModal';
import { ChatDashboard } from '@/components/chat/ChatDashboard';
import { clearNativeSession, loadNativeSession } from '@/native/session';
import { configureNativeBackgroundRealtime, stopNativeBackgroundRealtime } from '@/native/backgroundRealtime';
import { isNativeMobileApp, isTauriDesktopApp } from '@/utils/appMode';
import { accountSuspensionFromError } from '@/api/client';

export function ChatShell(): JSX.Element {
  const token = useKukeStore((state) => state.token);
  const currentUser = useKukeStore((state) => state.currentUser);
  const setCurrentUser = useKukeStore((state) => state.setCurrentUser);
  const setSession = useKukeStore((state) => state.setSession);
  const logout = useKukeStore((state) => state.logout);
  const setOnlineCount = useKukeStore((state) => state.setOnlineCount);
  const accountSuspension = useKukeStore((state) => state.accountSuspension);
  const setAccountSuspension = useKukeStore((state) => state.setAccountSuspension);
  const [isCheckingCookieSession, setIsCheckingCookieSession] = useState(() => !token);

  const meQuery = useQuery({
    queryKey: ['me', token],
    queryFn: getMe,
    enabled: Boolean(token),
    retry: false
  });

  useEffect(() => {
    if (token) {
      setIsCheckingCookieSession(false);
      return;
    }
    if (accountSuspension) {
      setIsCheckingCookieSession(false);
      return;
    }

    let isActive = true;
    setIsCheckingCookieSession(true);

    if (isNativeMobileApp() || isTauriDesktopApp()) {
      void loadNativeSession()
        .then((session) => {
          if (isActive && session) {
            setSession(session.token, session.user);
            void configureNativeBackgroundRealtime(session.token, session.user.id, true);
            return;
          }
          if (isActive) {
            setIsCheckingCookieSession(false);
          }
        })
        .catch(() => {
          if (isActive) {
            setIsCheckingCookieSession(false);
          }
        });
      return () => {
        isActive = false;
      };
    }

    void getCookieSession()
      .then((session) => {
        if (isActive) {
          setSession(session.token, session.user);
          if (isNativeMobileApp()) {
            void configureNativeBackgroundRealtime(session.token, session.user.id, true);
          }
        }
      })
      .catch((error: unknown) => {
        if (isActive) {
          const suspension = accountSuspensionFromError(error);
          if (suspension) {
            setAccountSuspension(suspension);
          }
          setIsCheckingCookieSession(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [accountSuspension, setAccountSuspension, setSession, token]);

  useEffect(() => {
    if (meQuery.data) {
      setCurrentUser(meQuery.data);
    }
  }, [meQuery.data, setCurrentUser]);

  useEffect(() => {
    if (meQuery.error) {
      const suspension = accountSuspensionFromError(meQuery.error);
      if (suspension) {
        setAccountSuspension(suspension);
        return;
      }
      void clearNativeSession();
      void stopNativeBackgroundRealtime(true);
      logout();
    }
  }, [logout, meQuery.error, setAccountSuspension]);

  useEffect(() => {
    if (!accountSuspension) {
      return;
    }
    void Promise.all([clearNativeSession(), stopNativeBackgroundRealtime(true)]).finally(() => {
      logout();
    });
  }, [accountSuspension, logout]);

  useEffect(() => {
    if (!token || !currentUser) {
      setOnlineCount(0);
      return;
    }
    void getOnlineCount().then(setOnlineCount).catch(() => undefined);
  }, [currentUser, setOnlineCount, token]);

  const suspensionModal = accountSuspension ? <AccountSuspensionModal notice={accountSuspension} onClose={() => setAccountSuspension(null)} /> : null;

  if (!token || !currentUser) {
    if (isCheckingCookieSession) {
      return <><SessionRestorePanel />{suspensionModal}</>;
    }
    return <><AuthPanel />{suspensionModal}</>;
  }

  return <><ChatDashboard currentUser={currentUser} />{suspensionModal}</>;
}

function SessionRestorePanel(): JSX.Element {
  return (
    <div className="grid h-full place-items-center bg-white px-8 text-center text-slate-700">
      <div>
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
        <h2 className="text-lg font-black text-slate-950">正在恢复登录</h2>
        <p className="mt-2 text-sm text-slate-500">正在检测本地登录状态...</p>
      </div>
    </div>
  );
}
