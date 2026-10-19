import { Icon } from '@/components/ui/Icon';
import type { DeviceClass } from '@/utils/selfChat';

const sizeClass = {
  sm: 'h-8 w-8',
  message: 'h-9 w-9',
  md: 'h-10 w-10',
  mobile: 'h-11 w-11',
  lg: 'h-14 w-14'
} as const;

const iconClass = {
  sm: 'h-4 w-4',
  message: 'h-[18px] w-[18px]',
  md: 'h-5 w-5',
  mobile: 'h-[22px] w-[22px]',
  lg: 'h-7 w-7'
} as const;

/**
 * 「我的设备」的头像：墨色底上一枚细线的设备图标（手机 / 电脑），本地画，不用 avatar_url（self-chat.md 1.3）。
 * 会话列表、标题栏、左侧消息（另一类设备发的）都用它。深色主题下反过来（浅底深色图标），样式在 styles/self-chat.css。
 */
export function DeviceAvatar({ kind, size = 'md', shape = 'round', className = '' }: { kind: DeviceClass; size?: keyof typeof sizeClass; shape?: 'round' | 'squircle'; className?: string }): JSX.Element {
  const label = kind === 'phone' ? '手机' : '电脑';
  return (
    <span className={`kself-avatar ${sizeClass[size]} ${shape === 'squircle' ? 'is-squircle' : ''} ${className}`} role="img" aria-label={label}>
      <Icon name={kind === 'phone' ? 'smartphone' : 'laptop'} className={iconClass[size]} />
    </span>
  );
}
