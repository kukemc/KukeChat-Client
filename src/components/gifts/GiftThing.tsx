import { cx } from '@/components/chat/desktop/runtime';
import { BubbleStage } from '@/components/shop/BubbleSample';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { useKukeStore } from '@/store/kukeStore';
import type { User } from '@/types/api';
import type { GiftItemRef, GiftRef } from '@/types/gift';
import { GiftGlyph } from './GiftGlyph';

/**
 * 「送的那样东西」长什么样，礼物卡片、礼物墙、送礼面板、记录、提示都用它：
 *   · 礼物目录里的礼物：内置的矢量图形（GiftGlyph，不认识的名字画成通用礼盒）；
 *   · 头像框：套在一个头像上的小样（给了 wearer 就套在那个人的头像上）；
 *   · 气泡：一条穿着这件皮肤的小消息。
 * 商品的 style 是不可信的，头像组件和气泡预览里各自会校验，过不了的就是没有装扮的样子。
 *
 * size 是图形的边长（头像框是头像的那一档）；气泡小样的大小由文字决定，size 只影响礼物图形。
 */
interface GiftThingProps {
  gift: GiftRef | null;
  item: GiftItemRef | null;
  /** 头像框小样套在谁的头像上；不给就用一个占位头像 */
  wearer?: User | null;
  size?: number;
  /** 头像框小样用哪一档头像 */
  avatarSize?: 'sm' | 'message' | 'md' | 'lg' | 'xl';
  /** 气泡小样里写的字 */
  sampleText?: string;
  className?: string;
}

export function GiftThing({ gift, item, wearer, size = 44, avatarSize = 'md', sampleText = '你好呀', className }: GiftThingProps): JSX.Element {
  const layout = useKukeStore((state) => state.layoutMode === 'mobile' ? 'mobile' : 'desktop');
  if (item) {
    if (item.category === 'frame') {
      return <span className={cx('kgf-thing kgf-thing--frame', className)} aria-hidden="true"><Avatar user={wearer ?? null} label={wearer ? undefined : '礼'} toneKey={wearer ? undefined : 5} size={avatarSize} frameStyle={item.style} /></span>;
    }
    if (item.category === 'bubble') {
      return <span className={cx('kgf-thing kgf-thing--bubble', className)} aria-hidden="true"><BubbleStage style={item.style} messages={[{ mine: true, text: sampleText }]} layout={layout} className="ksp-stage--slot" /></span>;
    }
    // 这个版本不认识的类别：画不出小样，给一个衣服的图标
    return <span className={cx('kgf-thing kgf-thing--unknown', className)} style={{ width: size, height: size }} aria-hidden="true"><Icon name="shirt" className="h-1/2 w-1/2" /></span>;
  }
  return <GiftGlyph icon={gift?.icon ?? ''} size={size} className={cx('kgf-thing', className)} />;
}
