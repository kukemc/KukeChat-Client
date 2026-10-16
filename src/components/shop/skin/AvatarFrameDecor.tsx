import type { CSSProperties } from 'react';
import { useThemeStore } from '@/theme/themeStore';
import type { AvatarFrame } from './avatarFrame';
import { FrameOrnament } from './frameOrnaments';

/**
 * 头像框画在头像外面的那几层。由 ui/Avatar 在头像外面套一层 .kcaf（和头像一样大、不改变布局）之后放进去：
 *
 *   kcaf-glow          外发光：环外面一圈柔和的光。pulse 时它慢慢呼吸
 *   kcaf-orn--back     垫在头像后面的装饰（猫耳、恶魔角、翅膀）
 *   （头像本身）
 *   kcaf-ring          环：一块铺了底色的方块，用 mask 把中间挖空。spin 时里面一层渐变慢慢转，shimmer 时一道弧形的光绕着走
 *   kcaf-orn           压在环上面的装饰
 *
 * 全部绝对定位、不接鼠标，向外探出去而不占位置。聊天里同屏可能有几十个带框的头像，所以会动的只动 transform / opacity，
 * 节奏都慢，用 seed（传用户 id）把不同人的错开；样式和「减少动态效果」的处理在 shop.css。
 * 外观里开了「性能优先」时会动的层不渲染、装饰不动，环、光、装饰本身照常画。
 */
export function AvatarFrameDecor({ frame, seed = 0 }: { frame: AvatarFrame; seed?: number }): JSX.Element {
  const motion = !useThemeStore((state) => state.performance);
  const spin = motion && frame.animation === 'spin' && (frame.light.gradient || frame.dark.gradient);
  const shine = motion && frame.animation === 'shimmer';
  const pulse = motion && frame.animation === 'pulse';
  const step = Math.abs(Math.trunc(seed)) % 9;
  const delay = { '--kcaf-delay': `${-(step * 0.9)}s` } as CSSProperties;
  const back = frame.pieces.filter((piece) => piece.back);
  const front = frame.pieces.filter((piece) => !piece.back);
  return (
    <>
      {frame.hasGlow ? <span className={pulse ? 'kcaf-glow kcaf-glow--pulse' : 'kcaf-glow'} style={delay} aria-hidden="true" /> : null}
      {back.map((piece, index) => <FrameOrnament key={piece.id} piece={piece} motion={motion} delay={-((step + index * 2) % 9) * 0.6} />)}
      <span className={`kcaf-ring${spin ? ' kcaf-ring--spin' : ''}${frame.gap === 0 ? ' kcaf-ring--tight' : ''}`} style={delay} aria-hidden="true">
        {spin ? <i className="kcaf-spin" /> : null}
        {shine ? <i className="kcaf-shine" /> : null}
      </span>
      {front.map((piece, index) => <FrameOrnament key={piece.id} piece={piece} motion={motion} delay={-((step + index * 4 + 1) % 9) * 0.6} />)}
    </>
  );
}
