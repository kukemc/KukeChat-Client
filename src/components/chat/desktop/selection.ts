import { toast } from '@/components/ui/toast';
import type { Message } from '@/types/api';
import { isGiftMessage } from '@/utils/gift';
import { isRedPacketMessage } from '@/utils/redPacket';
import { isSelfTransferMessage } from '@/utils/selfChat';

/*
 * 多选消息的公共规则：哪些能选、一次最多选多少、按一段范围批量改。
 * 点选、Shift + 点选、「选到这里」和拖动刷选都走这里，规则只有一份。
 */

/** 合并转发一次最多 100 条（后端 ForwardBundleCreate.message_ids 的上限），范围选择和拖动刷选到这里就停。 */
export const MAX_SELECTED_MESSAGES = 100;

/** 多选出来是要合并转发的：撤回的、系统提示、红包、礼物都选不上。 */
export function isSelectableMessage(message: Message): boolean {
  // 还没发出去的本地消息（负数 id）不进多选
  // 「我的设备」的临时文件不能转发，也不进多选（self-chat.md 5.5）
  return message.id > 0 && !message.recalled_at && message.type !== 'system' && !isRedPacketMessage(message) && !isGiftMessage(message) && !isSelfTransferMessage(message);
}

export interface PaintResult {
  next: Set<number>;
  /** 选中时碰到了上限，有一部分没选上 */
  truncated: boolean;
}

/**
 * 以 base 为底，把 messages[from] 到 messages[to]（含两端）里能选的都设成 value。
 * 从 from 往 to 的方向逐条走，选中时到了上限就停 —— 离起点近的优先选上。
 */
export function paintRange(base: ReadonlySet<number>, messages: readonly Message[], from: number, to: number, value: boolean): PaintResult {
  const next = new Set(base);
  const step = to >= from ? 1 : -1;
  let truncated = false;
  for (let index = from; ; index += step) {
    const message = messages[index];
    if (message && isSelectableMessage(message)) {
      if (!value) {
        next.delete(message.id);
      } else if (!next.has(message.id)) {
        if (next.size >= MAX_SELECTED_MESSAGES) {
          truncated = true;
          break;
        }
        next.add(message.id);
      }
    }
    if (index === to) {
      break;
    }
  }
  return { next, truncated };
}

export function toastSelectionLimit(): void {
  toast.info(`一次最多选择 ${MAX_SELECTED_MESSAGES} 条消息，超出的部分没有选上`);
}
