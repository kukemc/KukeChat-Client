import { useState, type ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useMuteStatus } from '@/store/moderationStore';
import { useRedPacketAvailable, useRedPacketEnabled } from './data';
import { RedPacketRecords } from './RedPacketRecords';
import { SendRedPacketDialog } from './SendRedPacketDialog';

/**
 * 输入区工具栏上的「发红包」，桌面和移动各一个样子（variant），弹窗是同一个。
 * 服务端关着红包（config.enabled 为 false）、或者根本没有这个接口（旧后端 404）时不出现。被禁言时不能发（但仍然可以抢）。
 */
export function RedPacketComposerButton({ conversationId, isGroup, variant, onCreated }: { conversationId: number; isGroup: boolean; variant: 'desktop' | 'mobile'; onCreated?: () => void }): JSX.Element | null {
  const enabled = useRedPacketEnabled();
  const { muted } = useMuteStatus();
  const [open, setOpen] = useState(false);
  // 弹窗开着的时候开关被关掉：入口先留着，弹窗里会说发不了，关掉弹窗后入口再消失
  if (!enabled && !open) {
    return null;
  }
  return (
    <>
      {variant === 'desktop'
        ? <button type="button" className="kcd-tool krp-tool" title="发红包" aria-label="发红包" data-action="open-red-packet-composer" disabled={muted} onClick={() => setOpen(true)}><Icon name="redPacket" className="h-[18px] w-[18px]" /></button>
        : <button type="button" className="kc-mobile-composer-tool krp-tool disabled:cursor-not-allowed disabled:opacity-45" aria-label="发红包" data-action="open-red-packet-composer" disabled={muted} onClick={() => setOpen(true)}><Icon name="redPacket" className="h-6 w-6" /></button>}
      {open ? <SendRedPacketDialog conversationId={conversationId} isGroup={isGroup} onCreated={onCreated} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/**
 * 商店页上的「红包记录」入口。服务端有红包接口就出现，哪怕现在关着（以前收发的还在）。
 * className 由两套商店界面各自给；children 是按钮里的内容。
 */
export function RedPacketRecordsButton({ className, children }: { className: string; children: ReactNode }): JSX.Element | null {
  const available = useRedPacketAvailable();
  const [open, setOpen] = useState(false);
  if (!available) {
    return null;
  }
  return (
    <>
      <button type="button" className={className} data-action="red-packet-records" aria-label="红包记录" title="红包记录" onClick={() => setOpen(true)}>{children}</button>
      {open ? <RedPacketRecords onClose={() => setOpen(false)} /> : null}
    </>
  );
}
