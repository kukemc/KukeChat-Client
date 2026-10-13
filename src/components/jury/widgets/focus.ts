import { useEffect, useRef, type RefObject } from 'react';

/**
 * 被点的按钮点完就从页面上消失时（「展开更早的 N 条」、「提交」换成确认栏、「返回修改」），浏览器会把焦点丢回 body。
 * 评审台、练习场的快捷键只在焦点位于板块内部时生效，焦点一丢，数字键和 Ctrl+Enter 就都接不住了。
 *
 * watch 变化之后如果焦点确实丢了，把它收回到 ref 指的容器上（容器要带 tabIndex={-1}）。
 * 焦点还在别的元素上时不动它：用户自己点到别处（比如宿主页面）不会被抢回来。
 */
export function useRestoreFocus<T extends HTMLElement>(ref: RefObject<T>, watch: unknown): void {
  // 记上一次的值而不是「是不是第一次」：开发模式下 effect 会连跑两遍，挂载时不能去动焦点
  const previous = useRef(watch);
  useEffect(() => {
    if (Object.is(previous.current, watch)) {
      return;
    }
    previous.current = watch;
    const node = ref.current;
    if (!node) {
      return;
    }
    // 浮窗在 Shadow DOM 里：焦点丢了时 shadowRoot.activeElement 是 null，普通文档里是 body
    const root = node.getRootNode() as Document | ShadowRoot;
    const active = root.activeElement;
    if (!active || active === node.ownerDocument.body) {
      node.focus({ preventScroll: true });
    }
  }, [ref, watch]);
}
