import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { getDesktopPortalRoot, useEscapeLayer } from '@/components/ui/desktop/Modal';
import { registerNativeBackHandler } from '@/native/back';
import { useKukeStore } from '@/store/kukeStore';
import { GIFT_SCENE_MS, GiftScene } from './GiftScene';
import { SendGiftDialog } from './SendGiftDialog';
import { useGiftMotion, useGiftUi, type GiftEffect } from './ui';

/** 主界面上唯一的送礼面板：谁要送礼就往 useGiftUi 里放一个目标（openSend），这里把面板画出来。 */
export function GiftSendHost(): JSX.Element | null {
  const target = useGiftUi((state) => state.sendTarget);
  const close = useGiftUi((state) => state.closeSend);
  if (!target) {
    return null;
  }
  // key：换了收礼人 / 会话就是一个新的面板，里面选的东西、写的留言不带过去
  return <SendGiftDialog key={`${target.conversationId ?? 'profile'}-${target.toUser?.id ?? 'pick'}`} target={target} onClose={close} />;
}

function Scene({ effect }: { effect: GiftEffect }): JSX.Element {
  return <GiftScene tier={effect.tier} icon={effect.icon} name={effect.name} count={effect.count} fromName={effect.fromName} toName={effect.toName} />;
}

/** 全屏那一层：tier 3 的动效铺满整个窗口，点一下（或者 Esc、系统返回键）跳过。 */
function FullscreenEffect({ effect, onDone }: { effect: GiftEffect; onDone: () => void }): JSX.Element {
  useEscapeLayer(onDone);
  useEffect(() => registerNativeBackHandler(() => {
    onDone();
    return true;
  }, 130), [onDone]);
  return createPortal(
    <div className="kgf-fullscreen" role="presentation" data-gift-effect="3" data-gift-id={effect.id} title="点一下跳过" onClick={onDone}>
      <Scene effect={effect} />
      <span className="kgf-fullscreen-skip">点一下跳过</span>
    </div>,
    getDesktopPortalRoot()
  );
}

/**
 * 礼物动效的调度，整个应用挂一个（主界面上）。队列在 useGiftUi 里，这里只管「正在播的那一个」：
 *   · 到点了把它从队列里拿掉，下一个接着播 —— 同一时间只播一个；
 *   · 它所在的会话已经不在眼前了（切走了）：不播，直接丢掉；
 *   · tier 3 在这里画（全屏，可以点击跳过）；tier 2 由那个会话的聊天面板里的 GiftStage 画，这里只负责计时。
 * 中途开了「性能优先」或者系统的「减少动态效果」：把队列清空。
 */
export function GiftEffectsHost(): JSX.Element | null {
  const current = useGiftUi((state) => state.queue[0] ?? null);
  const finish = useGiftUi((state) => state.finish);
  const visibleConversationId = useKukeStore((state) => state.visibleConversationId);
  const motion = useGiftMotion();
  const playable = current !== null && motion && current.conversationId === visibleConversationId;

  useEffect(() => {
    if (!current) {
      return undefined;
    }
    if (!playable) {
      finish(current.id);
      return undefined;
    }
    const timer = window.setTimeout(() => finish(current.id), GIFT_SCENE_MS[current.tier] + 120);
    return () => window.clearTimeout(timer);
  }, [current, finish, playable]);

  if (!current || !playable || current.tier !== 3) {
    return null;
  }
  return <FullscreenEffect key={current.id} effect={current} onDone={() => finish(current.id)} />;
}

/**
 * 聊天面板里的那一层：正在播的是这个会话里的 tier 2 动效时，把它画在消息区上面（不挡操作，pointer-events: none）。
 * 桌面和移动的聊天面板各放一个。什么时候开始、什么时候结束由 GiftEffectsHost 定。
 */
export function GiftStage({ conversationId }: { conversationId: number }): JSX.Element | null {
  const current = useGiftUi((state) => state.queue[0] ?? null);
  if (!current || current.tier !== 2 || current.conversationId !== conversationId) {
    return null;
  }
  return <div key={current.id} className="kgf-stage" aria-hidden="true" data-gift-effect="2" data-gift-id={current.id}><Scene effect={current} /></div>;
}
