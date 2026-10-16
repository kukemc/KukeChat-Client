import { BubbleStage, cardSamples, tryOnSamples } from './BubbleSample';
import { FrameStage } from './FrameSample';
import { DEFAULT_PREVIEW_TEXT } from './labels';

/**
 * 一件商品的预览，按类别换画法：气泡画成消息气泡（BubbleStage），头像框套在自己的头像上（FrameStage）。
 * 商店里出现预览的四个地方各是一种 variant，桌面和移动两套界面共用：
 *
 *   card    商品卡片
 *   slot    「我的装扮」里那一条（style 为空表示这个槽没装备）
 *   buy     确认购买的框里
 *   tryon   试穿
 */
interface ItemPreviewProps {
  category: string;
  style: unknown;
  previewText?: string | null;
  variant: 'card' | 'slot' | 'buy' | 'tryon';
  layout: 'desktop' | 'mobile';
}

export function ItemPreview({ category, style, previewText, variant, layout }: ItemPreviewProps): JSX.Element {
  if (category === 'frame') {
    return <FrameStage style={style} variant={variant === 'buy' ? 'boxed' : variant} layout={layout} />;
  }
  const text = previewText?.trim() || DEFAULT_PREVIEW_TEXT;
  if (variant === 'card') {
    return <BubbleStage style={style} messages={cardSamples(text)} layout={layout} />;
  }
  if (variant === 'tryon') {
    return <BubbleStage style={style} messages={tryOnSamples(text)} layout={layout} avatars className={layout === 'desktop' ? 'ksp-stage--boxed ksp-stage--tall' : 'ksp-stage--boxed'} />;
  }
  return <BubbleStage style={style} messages={[{ mine: true, text }]} layout={layout} className={variant === 'slot' ? 'ksp-stage--slot' : 'ksp-stage--boxed'} />;
}
