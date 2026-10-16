import { memo } from 'react';
import { Icon, type IconName } from '@/components/ui/Icon';
import type { WorkspaceView } from '@/store/kukeStore';

interface NavRailProps {
  view: WorkspaceView;
  unreadCount: number;
  hasUnseenAnnouncement: boolean;
  /** 在任风纪委员当前可评审的案件数，显示在「风纪」入口上 */
  juryPendingCount?: number;
  /** 当前连接的服务端有没有商店（docs/shop.md）。没有就不显示入口 */
  shopAvailable?: boolean;
  /** 有没有可看的排行榜（活跃 / 心意 / 风纪至少一个开着）。没有就不显示入口 */
  rankingAvailable?: boolean;
  onNavigate: (view: WorkspaceView) => void;
  onCreateGroup: () => void;
  onOpenAnnouncement: () => void;
  onOpenSettings: () => void;
}

const PRIMARY: Array<{ view: WorkspaceView; label: string; icon: IconName }> = [
  { view: 'chat', label: '聊天', icon: 'message' },
  { view: 'contacts', label: '联系人', icon: 'contacts' },
  { view: 'posts', label: '动态', icon: 'feed' },
  { view: 'teamup', label: '组队中心', icon: 'users' },
  { view: 'bots', label: '机器人', icon: 'bot' },
  { view: 'jury', label: '风纪', icon: 'scale' },
  { view: 'shop', label: '商店', icon: 'store' },
  { view: 'ranking', label: '排行榜', icon: 'trophy' },
  { view: 'home', label: '主页', icon: 'home' }
];

const SECONDARY: Array<{ view: WorkspaceView; label: string; icon: IconName }> = [
  { view: 'tasks', label: '任务', icon: 'checkSquare' },
  { view: 'favorites', label: '收藏', icon: 'star' }
];

function RailButton({ label, icon, active = false, badge, dot = false, onClick }: { label: string; icon: IconName; active?: boolean; badge?: number; dot?: boolean; onClick: () => void }): JSX.Element {
  return (
    <button type="button" className={active ? 'ksh-rail-btn is-active' : 'ksh-rail-btn'} title={label} aria-label={label} aria-current={active ? 'page' : undefined} onClick={onClick}>
      <Icon name={icon} className="h-5 w-5" />
      {badge ? <span className="kui-badge ksh-rail-badge">{badge > 99 ? '99+' : badge}</span> : dot ? <span className="kui-dot ksh-rail-badge" /> : null}
    </button>
  );
}

/** 桌面端最左侧的导航栏：上面是各个工作区，下面是工具入口。 */
function NavRailInner({ view, unreadCount, hasUnseenAnnouncement, juryPendingCount, shopAvailable = false, rankingAvailable = false, onNavigate, onCreateGroup, onOpenAnnouncement, onOpenSettings }: NavRailProps): JSX.Element {
  return (
    <nav className="ksh-rail" aria-label="主导航">
      <div className="ksh-rail-group">
        {PRIMARY.filter((item) => (item.view !== 'shop' || shopAvailable || view === 'shop') && (item.view !== 'ranking' || rankingAvailable || view === 'ranking')).map((item) => <RailButton key={item.view} label={item.label} icon={item.icon} active={view === item.view} badge={item.view === 'chat' ? unreadCount : item.view === 'jury' ? juryPendingCount : undefined} onClick={() => onNavigate(item.view)} />)}
      </div>
      <div className="ksh-rail-group">
        <RailButton label="创建群聊" icon="plus" onClick={onCreateGroup} />
        {SECONDARY.map((item) => <RailButton key={item.view} label={item.label} icon={item.icon} active={view === item.view} onClick={() => onNavigate(item.view)} />)}
        <RailButton label="公告" icon="announcement" dot={hasUnseenAnnouncement} onClick={onOpenAnnouncement} />
        <RailButton label="设置" icon="settings" active={view === 'settings'} onClick={onOpenSettings} />
      </div>
    </nav>
  );
}

export const NavRail = memo(NavRailInner);
