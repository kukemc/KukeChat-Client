import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import type { User } from '@/types/api';

/** 标题栏「在线 N」悬停时弹出的名单。扩展浮窗和桌面端的标题栏各自负责定位，内容共用这一份。 */
export function OnlineUsersCard({ count, users, loading }: { count: number; users: User[]; loading: boolean }): JSX.Element {
  return (
    <div className="kwf-online-card">
      <div className="kui-group-title"><span>当前在线</span><span>{count} 人</span></div>
      <div className="kwf-online-list kui-scroll">
        {loading ? <p className="kwf-online-empty">正在加载在线用户…</p> : users.length === 0 ? <p className="kwf-online-empty">暂时没有在线用户</p> : null}
        {users.map((user) => {
          const name = getDisplayName(user, `用户 ${user.id}`);
          return (
            <div key={user.id} className="kwf-online-user">
              <Avatar user={user} label={name} size="sm" />
              <span>
                <b>{name}</b>
                <small>@{user.username} · ID {user.id}</small>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
