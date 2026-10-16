import { cx } from '@/components/chat/desktop/runtime';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { useKukeStore } from '@/store/kukeStore';
import { BubbleStage, type SampleMessage } from './BubbleSample';
import { bubbleSkinOf } from './skin/bubbleSkin';

/**
 * 商店里的头像框预览：把商品的 style 套在当前用户自己的头像上（ui/Avatar 的 frameStyle）。
 * 用的就是聊天里那个头像组件，所以环、光、装饰、动效和真聊天里看到的是同一个样子。
 *
 *   card    商品卡片：一个大的，旁边一个消息行里那么大的（头像框在小尺寸下长什么样也得看得到）
 *   slot    「我的装扮」里那一条
 *   boxed   确认购买的框里：垫一块消息画布的颜色
 *   tryon   试穿：大头像 + 几档常见的尺寸 + 一小段聊天（自己的消息带着框，气泡是现在装备的那件）
 */

const TRY_ON_SIZES = [{ size: 'lg', label: '资料卡' }, { size: 'md', label: '个人主页' }, { size: 'message', label: '聊天' }, { size: 'sm', label: '标题栏' }] as const;

const TRY_ON_MESSAGES: SampleMessage[] = [
  { mine: true, text: '换了个新头像框' },
  { mine: false, text: '好看！在哪换的' },
  { mine: true, text: '商店里，用 CCW 金币换的。' }
];

interface FrameStageProps {
  /** 商品的 style；null / undefined 表示不套头像框 */
  style?: unknown;
  variant: 'card' | 'slot' | 'boxed' | 'tryon';
  layout: 'desktop' | 'mobile';
  className?: string;
}

export function FrameStage({ style, variant, layout, className }: FrameStageProps): JSX.Element {
  const currentUser = useKukeStore((state) => state.currentUser);
  const label = currentUser ? undefined : '我';
  const frameStyle = style ?? null;

  if (variant === 'tryon') {
    return (
      <div className={cx('ksp-ftry', layout === 'mobile' && 'ksp-ftry--mobile', className)} aria-hidden="true">
        <div className="ksp-ftry-hero">
          <Avatar user={currentUser} label={label} size="xl" frameStyle={frameStyle} />
          <div className="ksp-ftry-id">
            <b>{getDisplayName(currentUser, '我')}</b>
            {currentUser?.username ? <span>@{currentUser.username}</span> : null}
          </div>
        </div>
        <div className="ksp-ftry-sizes">
          {TRY_ON_SIZES.map(({ size, label: caption }) => (
            <figure key={size}>
              <Avatar user={currentUser} label={label} size={size} frameStyle={frameStyle} />
              <figcaption>{caption}</figcaption>
            </figure>
          ))}
        </div>
        <BubbleStage skin={bubbleSkinOf(currentUser)} messages={TRY_ON_MESSAGES} layout={layout} avatars both={false} frameStyle={frameStyle} />
      </div>
    );
  }

  const large = variant === 'slot' || layout === 'mobile' ? 'lg' : 'xl';
  return (
    <div className={cx('ksp-fstage', `ksp-fstage--${variant}`, layout === 'mobile' && 'ksp-fstage--mobile', className)} aria-hidden="true">
      <Avatar user={currentUser} label={label} size={large} frameStyle={frameStyle} />
      {variant === 'card' ? <Avatar user={currentUser} label={label} size="message" frameStyle={frameStyle} /> : null}
    </div>
  );
}
