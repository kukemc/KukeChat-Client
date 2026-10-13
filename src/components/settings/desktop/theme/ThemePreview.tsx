import type { CSSProperties } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Icon, type IconName } from '@/components/ui/Icon';
import { useKukeStore } from '@/store/kukeStore';
import { themeVariables, wallpaperMode, type ThemeScheme, type ThemeSettings, type WallpaperMode } from '@/theme/themes';

/**
 * 缩略图：用某一套设置自己的变量画一个迷你界面——导航栏、会话列表、消息画布，画布里一条顶栏、两条气泡和一张输入卡片。
 * 背景和材质都画出来：整窗背景的主题能看到侧栏透着图，只铺聊天区的只有右边那块有图。
 */
export function ThemeThumbnail({ settings, scheme, wallpaperUrl = null }: { settings: ThemeSettings; scheme: ThemeScheme; wallpaperUrl?: string | null }): JSX.Element {
  const variables = themeVariables(settings, scheme, wallpaperUrl, true);
  const mode = wallpaperMode(settings, scheme, wallpaperUrl);
  return (
    <span className="kth-thumb" data-mode={mode} style={variables as CSSProperties}>
      {mode !== 'none' ? <span className="kth-thumb-wall" /> : null}
      <span className="kth-thumb-rail" />
      <span className="kth-thumb-list"><i /></span>
      <span className="kth-thumb-chat">
        <span className="kth-thumb-head" />
        <span className="kth-thumb-in" />
        <span className="kth-thumb-out" />
        <span className="kth-thumb-input"><i /></span>
      </span>
    </span>
  );
}

const RAIL: IconName[] = ['message', 'contacts', 'feed', 'checkSquare'];
const CONVERSATIONS = [
  { name: 'Scratch 创作交流群', preview: '阿夸：新主题怎么样？', time: '20:14', unread: 0 },
  { name: '薄荷糖', preview: '晚点把工程发你', time: '19:52', unread: 3 },
  { name: 'KukeChat 官方交流群', preview: '周五晚上有创作接龙', time: '昨天', unread: 0 }
];

/**
 * 实时预览：拿真实界面的样式（导航栏、会话列表、聊天顶栏、气泡、输入卡片、右侧栏、菜单）拼一个缩小的窗口。
 * 它就在主题根节点里面，又和根节点带着同样的 data-kc-wallpaper，所以背景、材质、形状、密度改什么都立刻反映出来；
 * 里面的面和真界面是同一批类名，毛玻璃的对齐（ThemeEffects）也照常作用在它身上。
 */
export function ThemeStage({ mode }: { mode: WallpaperMode }): JSX.Element {
  const currentUser = useKukeStore((state) => state.currentUser);
  return (
    <div className="kth-stage" data-kc-wallpaper={mode} aria-hidden="true">
      <div className="ksh-rail">
        <div className="ksh-rail-group">
          {RAIL.map((icon, index) => <span key={icon} className={`ksh-rail-btn ${index === 0 ? 'is-active' : ''}`}><Icon name={icon} className="h-5 w-5" /></span>)}
        </div>
      </div>
      <div className="ksh-pane">
        <div className="ksh-pane-header"><span className="kui-field ksh-pane-search"><Icon name="search" className="h-3.5 w-3.5" /><span className="kth-stage-placeholder">搜索</span></span></div>
        <div className="ksh-pane-list">
          {CONVERSATIONS.map((item, index) => (
            <div key={item.name} className={`ksh-conv ${index === 0 ? 'is-active' : ''}`}>
              <Avatar label={item.name} toneKey={index + 3} size="md" />
              <span className="ksh-conv-main">
                <span className="ksh-conv-line"><span className="ksh-conv-title">{item.name}</span><span className="ksh-conv-time">{item.time}</span></span>
                <span className="ksh-conv-line"><span className="ksh-conv-preview">{item.preview}</span>{item.unread ? <span className="kui-badge">{item.unread}</span> : null}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="kcd kth-stage-chat">
        <div className="kcd-column">
          <div className="kcd-header">
            <div className="kcd-header-id">
              <Avatar label="Scratch 创作交流群" toneKey={3} size="sm" />
              <div className="kcd-header-text">
                <div className="kcd-header-title"><span className="kcd-header-name">Scratch 创作交流群</span></div>
                <div className="kcd-header-sub"><span>128 人 · 23 人在线</span></div>
              </div>
            </div>
            <div className="kcd-header-actions"><span className="kcd-icon-button"><Icon name="search" className="h-4 w-4" /></span><span className="kcd-icon-button"><Icon name="users" className="h-4 w-4" /></span></div>
          </div>
          <div className="kcd-list">
            <div className="kcd-item">
              <div className="kcd-row">
                <div className="kcd-avatar-slot"><span className="kcd-avatar"><Avatar label="阿夸" toneKey={2} size="message" /></span></div>
                <div className="kcd-main">
                  <div className="kcd-meta"><span className="kcd-meta-name">阿夸</span><span className="kcd-tag kcd-tag--admin">管理员</span></div>
                  <div className="kcd-line"><div className="kcd-content kcd-bubble">新主题怎么样？</div></div>
                </div>
              </div>
            </div>
            <div className="kcd-item">
              <div className="kcd-row is-mine">
                <div className="kcd-avatar-slot"><span className="kcd-avatar"><Avatar user={currentUser} label={currentUser ? undefined : '我'} size="message" /></span></div>
                <div className="kcd-main">
                  <div className="kcd-line"><div className="kcd-content kcd-bubble">好看，<span className="font-semibold [color:var(--kc-accent)]">@阿夸</span> 发我</div></div>
                </div>
              </div>
            </div>
          </div>
          <div className="kcd-composer-slot">
            <div className="kcd-composer kth-stage-composer">
              <span className="kth-stage-placeholder">发消息…</span>
              <span className="kcd-send kth-stage-send">发送</span>
            </div>
          </div>
        </div>
        <div className="kcd-sidebar">
          <div className="kcd-sidebar-members">
            <div className="kcd-sidebar-title"><span>成员</span><span className="kcd-sidebar-count">128</span></div>
            {['阿夸', '薄荷糖', '任务小助手'].map((name, index) => (
              <div key={name} className="kcd-member"><Avatar label={name} toneKey={index + 2} size="sm" /><span className="kcd-member-name">{name}</span></div>
            ))}
          </div>
        </div>
        <div className="kui-menu kth-stage-menu">
          <div className="kui-menu-item"><Icon name="copy" /><span>复制</span></div>
          <div className="kui-menu-item"><Icon name="bookmark" /><span>收藏</span></div>
        </div>
      </div>
    </div>
  );
}
