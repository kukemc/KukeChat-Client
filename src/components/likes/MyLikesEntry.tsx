import { useCallback, useState } from 'react';
import { useIsDesktopLayout } from '@/components/ui/desktop/Modal';
import type { User } from '@/types/api';
import { LikedByDialog, MobileLikedByPage } from './LikedByList';
import { MyLikesButton } from './ProfileLikeButton';

/**
 * 自己的个人空间上的那一块：我的总赞数 + 今天的 +N，点了打开「谁赞了我」（桌面是对话框，手机是一整页）。
 * 自己的资料卡不用这个：那里的名单是在卡片里就地展开的（ui/desktop/SelfCardDesktop.tsx）。
 */
export function MyLikesEntry({ user, className, onOpenUser }: { user: User | null | undefined; className?: string; /** 点了名单里的某个人。这时名单已经关掉了 */ onOpenUser: (user: User) => void }): JSX.Element | null {
  const desktop = useIsDesktopLayout();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  if (!user) {
    return null;
  }
  const openUser = (target: User): void => {
    setOpen(false);
    onOpenUser(target);
  };
  return (
    <>
      <MyLikesButton user={user} open={open} className={className} onPress={() => setOpen(true)} />
      {open ? (desktop ? <LikedByDialog user={user} onOpenUser={openUser} onClose={close} /> : <MobileLikedByPage user={user} onOpenUser={openUser} onClose={close} />) : null}
    </>
  );
}
