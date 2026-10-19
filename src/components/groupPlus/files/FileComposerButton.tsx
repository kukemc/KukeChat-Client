import { useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Icon } from '@/components/ui/Icon';
import { toast } from '@/components/ui/toast';
import { useGroupPlusInfo } from '../data';
import { queueGroupUploads } from './queue';

/**
 * 在聊天里发文件：群解锁了群文件（files.state = active）才可用，旧服务端 / 免费群 / 宽限期 / 私聊都返回 null。
 * 排进上传队列的规则同群文件面板（queue.ts）；每个文件在消息列表末尾有一张带进度、能取消的上传卡片
 * （chat/message/chatUploads.ts），传完群里落一条文件消息、原地换掉卡片，失败也在卡片上说。
 * 只有「放不下 / 存成临时文件」这类排队时的提示还用一句轻提示。
 */
export function useChatFileSender(conversationId: number, isGroup: boolean): ((files: File[]) => void) | null {
  const queryClient = useQueryClient();
  const quota = useGroupPlusInfo(isGroup ? conversationId : null, isGroup).data?.files ?? null;
  const send = useCallback((files: File[]) => {
    if (!quota || files.length === 0) {
      return;
    }
    const notice = queueGroupUploads(queryClient, conversationId, quota, files, { inChat: true });
    if (notice) {
      toast.info(notice);
    }
  }, [conversationId, queryClient, quota]);
  return isGroup && quota && quota.state === 'active' ? send : null;
}

/** 输入框工具栏上的「发送文件」。被禁言时按钮不可点（服务端也会拒绝）。onQueued：排进去之后调用（让消息列表回到最新，看得到上传卡片） */
export function FileComposerButton({ conversationId, disabled = false, onQueued }: { conversationId: number; disabled?: boolean; onQueued?: () => void }): JSX.Element | null {
  const send = useChatFileSender(conversationId, true);
  const inputRef = useRef<HTMLInputElement>(null);
  if (!send) {
    return null;
  }
  return (
    <>
      <input ref={inputRef} type="file" multiple hidden onChange={(event) => {
        const list = Array.from(event.target.files ?? []);
        event.target.value = '';
        if (list.length > 0) {
          send(list);
          onQueued?.();
        }
      }} />
      <button type="button" className="kcd-tool" title="发送文件（也可以直接拖进来）" aria-label="发送文件" disabled={disabled} onClick={() => inputRef.current?.click()}>
        <Icon name="folder" className="h-[18px] w-[18px]" />
      </button>
    </>
  );
}
