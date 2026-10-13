import type { CSSProperties } from 'react';
import { useShopPrefs } from '@/store/shopPrefs';
import { useThemeStore } from '@/theme/themeStore';
import type { User } from '@/types/api';
import { bubbleSkinOf, type BubbleSkin } from './bubbleSkin';
import { Ornament } from './ornaments';

/**
 * 气泡皮肤里「底色以外」的那几层，放在气泡里当最前面的子元素：
 *
 *   kcsk-glow          呼吸的光晕（breathe），在气泡外沿一圈
 *   kcsk-fx            裁在气泡形状里的一层，里面依次是：
 *     kcsk-fx-flow       流动的渐变（flow）
 *     kcsk-fx-pattern    纹样
 *     kcsk-fx-shine      扫过去的高光（shimmer）
 *   kcsk-orn           角饰（最多两个），骑在角上
 *
 * 全部绝对定位，不参与布局、不接鼠标；光晕和 kcsk-fx 垫在文字下面，角饰压在边框上面（它只占气泡的内边距，碰不到字）。会动的只动 transform / opacity；样式和「减少动态效果」的处理在 shop.css。
 * motion 为 false（外观里开了「性能优先」）时会动的层不渲染，角饰也不动 —— 纹样和角饰本身照常画。
 *
 * seed 用来把同屏的气泡错开，免得几十个气泡同一拍呼吸、扫光；传消息 id 就行。
 */
export function SkinDecor({ skin, motion, seed = 0 }: { skin: BubbleSkin; motion: boolean; seed?: number }): JSX.Element | null {
  const flow = motion && skin.animation === 'flow' && (skin.light.gradient || skin.dark.gradient);
  const shine = motion && skin.animation === 'shimmer';
  const glow = motion && skin.animation === 'breathe';
  if (!flow && !shine && !glow && !skin.hasPattern && skin.ornaments.length === 0) {
    return null;
  }
  const step = Math.abs(Math.trunc(seed)) % 9;
  const delay = { '--kcsk-delay': `${-(step * 0.9)}s` } as CSSProperties;
  return (
    <>
      {glow ? <span className="kcsk-glow" aria-hidden="true" style={delay} /> : null}
      {flow || shine || skin.hasPattern ? (
        <span className="kcsk-fx" aria-hidden="true" style={delay}>
          {flow ? <i className="kcsk-fx-flow" /> : null}
          {skin.hasPattern ? <i className="kcsk-fx-pattern" /> : null}
          {shine ? <i className="kcsk-fx-shine" /> : null}
        </span>
      ) : null}
      {skin.ornaments.map((ornament, index) => <Ornament key={ornament.corner} spec={ornament} motion={motion} delay={-((step + index * 4) % 9) * 0.6} />)}
    </>
  );
}

/** 聊天里两项和皮肤有关的本机设置：看不看别人的皮肤、播不播动效（外观里开了「性能优先」就不播）。 */
export function useSkinSettings(): { showOthers: boolean; motion: boolean } {
  const showOthers = useShopPrefs((state) => state.showOthersSkins);
  const performance = useThemeStore((state) => state.performance);
  return { showOthers, motion: !performance };
}

/** 一条消息的气泡该穿哪件皮肤：自己的消息看自己现在装备的，别人的看发送者对象上带的（并且没关掉「显示别人的气泡皮肤」）。 */
export function messageSkin(sender: User | null | undefined, mine: boolean, currentUser: User, showOthers: boolean): BubbleSkin | null {
  if (mine) {
    return bubbleSkinOf(currentUser);
  }
  return showOthers ? bubbleSkinOf(sender) : null;
}
