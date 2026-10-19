import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getCookieSession, getMe } from '@/api/auth';
import { getOnlineCount } from '@/api/users';
import { useKukeStore } from '@/store/kukeStore';
import { AuthPanel } from '@/components/auth/AuthPanel';
import { AuthRestoringScreen } from '@/components/auth/login/AuthScreen';
import { AccountSuspensionModal } from '@/components/auth/AccountSuspensionModal';
import { ChatDashboard } from '@/components/chat/ChatDashboard';
import { ToastHost } from '@/components/ui/toast';
import { clearNativeSession, loadNativeSession } from '@/native/session';
import { isTauriDesktopApp } from '@/utils/appMode';
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

    if (isTauriDesktopApp()) {
      void loadNativeSession()
        .then((session) => {
          if (isActive && session) {
            setSession(session.token, session.user);
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
      logout();
    }
  }, [logout, meQuery.error, setAccountSuspension]);

  useEffect(() => {
    if (!accountSuspension) {
      return;
    }
    void clearNativeSession().finally(() => {
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
  // 提示层全站只挂这一处：登录前（改密码、绑定之类的反馈）、登录后、被处罚时的提示都走同一条路
  const toastHost = <ToastHost />;

  if (!token || !currentUser) {
    if (isCheckingCookieSession) {
      return <><SessionRestorePanel />{suspensionModal}{toastHost}</>;
    }
    return <><AuthPanel />{suspensionModal}{toastHost}</>;
  }

  return <><ChatDashboard currentUser={currentUser} />{suspensionModal}{toastHost}</>;
}

function SessionRestorePanel(): JSX.Element {
  const isMobile = useKukeStore((state) => state.layoutMode === 'mobile');
  if (!isMobile) {
    return <AuthRestoringScreen />;
  }
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
