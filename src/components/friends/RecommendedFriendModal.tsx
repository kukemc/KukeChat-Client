import { useQuery } from '@tanstack/react-query';
import { sendFriendRequest } from '@/api/friends';
import { getUserProfile } from '@/api/users';
import { useKukeStore, type RecommendedFriendRequest } from '@/store/kukeStore';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';


interface RecommendedFriendModalProps {
  request: RecommendedFriendRequest;
  onClose: () => void;
}


export function RecommendedFriendModal({ request, onClose }: RecommendedFriendModalProps): JSX.Element {
  const currentUser = useKukeStore((state) => state.currentUser);
  const userQuery = useQuery({ queryKey: ['user-profile', request.userId], queryFn: () => getUserProfile(request.userId), enabled: Boolean(currentUser) });

  async function requestFriend(): Promise<void> {
    if (!currentUser) {
      return;
    }
    await sendFriendRequest(request.userId);
    onClose();
  }

  const user = userQuery.data;

  return (
    <div className="kc-mobile-overlay fixed inset-0 z-[70] grid place-items-center bg-black/35 p-4 backdrop-blur-sm">
      <div className="kc-mobile-dialog kc-mobile-scrollable-dialog w-full max-w-md rounded-[30px] border p-5 shadow-2xl [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-text)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] [color:var(--kc-accent)]">Friend Recommend</p>
            <h3 className="mt-1 text-xl font-black">肝酱推荐添加好友：</h3>
          </div>
          <button type="button" onClick={onClose} className="kc-icon-button h-9 w-9" aria-label="关闭">
            <Icon name="close" className="h-4 w-4" />
          </button>
        </div>

        {userQuery.isLoading ? <p className="mt-5 rounded-2xl p-4 text-sm [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">正在加载用户资料...</p> : null}
        {userQuery.error ? <p className="mt-5 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500">无法加载该用户，可能账号不存在。</p> : null}
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
        {request.extraMessage ? <div className="mt-4 rounded-[22px] border p-4 text-sm leading-6 [border-color:var(--kc-border)] [background:var(--kc-panel-muted)]"><span className="font-bold [color:var(--kc-text)]">附加消息：</span>{request.extraMessage}</div> : null}
        <div className="kc-mobile-actions mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-2xl border px-4 py-2 text-sm font-bold [border-color:var(--kc-border)] hover:[background:var(--kc-hover)]">取消</button>
          <button type="button" onClick={() => void requestFriend()} disabled={!user || request.userId === currentUser?.id} className="liquid-button rounded-2xl px-4 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50">添加好友</button>
        </div>
      </div>
    </div>
  );
}
