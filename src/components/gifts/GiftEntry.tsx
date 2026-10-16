import { useState, type ReactNode } from 'react';
import { cx } from '@/components/chat/desktop/runtime';
import { Icon } from '@/components/ui/Icon';
import { useMuteStatus } from '@/store/moderationStore';
import { useKukeStore } from '@/store/kukeStore';
import type { ConversationMember, User } from '@/types/api';
import { useGiftsEnabled } from './data';
import { GiftGlyph } from './GiftGlyph';
import { GiftRecords } from './GiftRecords';
import { useGiftUi } from './ui';

/**
 * 礼物的各个入口。它们都只是把「送给谁、在哪个会话里」交给 useGiftUi，面板由主界面上的 GiftSendHost 画。
 * 服务端关着礼物（catalog.enabled 为 false）、或者根本没有这个接口（旧后端 404）时，这里的每一个都不出现。
 */

/** 能不能给这个人送礼：礼物开着，对方不是自己、不是机器人。成员菜单这种自己拼菜单项的地方用它。 */
export function useCanGift(user: Pick<User, 'id' | 'is_bot'> | null | undefined): boolean {
  const enabled = useGiftsEnabled();
  const meId = useKukeStore((state) => state.currentUser?.id ?? null);
  return enabled && Boolean(user) && user?.id !== meId && !user?.is_bot;
}

/** 打开送礼面板。conversationId 传 null 表示从资料卡 / 个人空间送（不落聊天消息）。 */
export function openGiftTo(user: User, conversationId: number | null, onSent?: () => void): void {
  useGiftUi.getState().openSend({ toUser: user, candidates: null, conversationId, onSent });
}

/**
 * 输入区工具栏上的「送礼物」，和红包并列；桌面和移动各一个样子（variant）。
 * 私聊就是送给对方；群里先在面板里选送给谁（members 是手头的成员列表，没加载全的话 onMembersNeeded 让外面去拉）。被禁言时不能送。
 */
export function GiftComposerButton({ conversationId, isGroup, members, directUser, variant, onCreated, onMembersNeeded }: { conversationId: number; isGroup: boolean; members: ConversationMember[]; directUser?: User | null; variant: 'desktop' | 'mobile'; onCreated?: () => void; onMembersNeeded?: () => void }): JSX.Element | null {
  const enabled = useGiftsEnabled();
  const { muted } = useMuteStatus();
  const meId = useKukeStore((state) => state.currentUser?.id ?? null);
  // 私聊里对方是机器人、或者拿不到对方是谁：没有可以送的人
  if (!enabled || (!isGroup && (!directUser || directUser.is_bot || directUser.id === meId))) {
    return null;
  }
  const open = (): void => {
    if (isGroup) {
      onMembersNeeded?.();
    }
    useGiftUi.getState().openSend({ toUser: isGroup ? null : directUser ?? null, candidates: isGroup ? members : null, conversationId, onSent: onCreated });
  };
  return variant === 'desktop'
    ? <button type="button" className="kcd-tool kgf-tool" title="送礼物" aria-label="送礼物" data-action="open-gift-composer" disabled={muted} onClick={open}><Icon name="gift" className="h-[18px] w-[18px]" /></button>
    : <button type="button" className="kc-mobile-composer-tool kgf-tool disabled:cursor-not-allowed disabled:opacity-45" aria-label="送礼物" data-action="open-gift-composer" disabled={muted} onClick={open}><Icon name="gift" className="h-6 w-6" /></button>;
}

/**
 * 资料卡、个人空间、好友资料、生日提示上的「送礼物」。从这些地方送不落聊天消息（conversation_id 为 null）。
 * className 由所在的界面给（各处的按钮长得不一样）；不给 children 时是一个小礼盒 + 「送礼物」。
 * 不能送（礼物关着、是自己、是机器人）时什么都不画。
 */
export function SendGiftButton({ user, className, children, onOpen }: { user: User | null | undefined; className?: string; children?: ReactNode; /** 打开面板之前要做的事（关掉资料卡） */ onOpen?: () => void }): JSX.Element | null {
  const can = useCanGift(user);
  if (!can || !user) {
    return null;
  }
  return (
    <button type="button" className={cx('kgf-send', className)} data-action="send-gift-to" data-user={user.id} title={user.is_birthday_today ? '今天是 Ta 的生日，送个礼物吧' : '送礼物'} onClick={(event) => {
      event.stopPropagation();
      onOpen?.();
      openGiftTo(user, null);
    }}>
      {children ?? <><GiftGlyph icon="gift" size={16} />送礼物</>}
    </button>
  );
}

/**
 * 「礼物记录」的入口（我送出的 / 收到的），放在红包记录旁边。className 由两套商店界面各自给；children 是按钮里的内容。
 */
export function GiftRecordsButton({ className, children }: { className: string; children: ReactNode }): JSX.Element | null {
  const enabled = useGiftsEnabled();
  const [open, setOpen] = useState(false);
  if (!enabled && !open) {
    return null;
  }
  return (
    <>
      <button type="button" className={className} data-action="gift-records" aria-label="礼物记录" title="礼物记录" onClick={() => setOpen(true)}>{children}</button>
      {open ? <GiftRecords onClose={() => setOpen(false)} /> : null}
    </>
  );
}
