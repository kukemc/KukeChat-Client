import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Icon } from '@/components/ui/Icon';
import { toast } from '@/components/ui/toast';
import { useGroupPlusInfo } from '../data';
import { useGroupFileUploads } from '../uploads';
import { queueGroupUploads } from './queue';

/**
 * 输入框工具栏上的「上传群文件」：群解锁了群文件（files.state = active）才出现，旧服务端 / 免费群 / 宽限期都不出现。
 * 选完文件直接排进上传队列（规则同群文件面板，见 queue.ts），传完群里会落一条文件消息；
 * 进度在群文件面板里看，这里只在开始和失败时各提示一句。被禁言时按钮不可点（服务端也会拒绝）。
 */
export function FileComposerButton({ conversationId, disabled = false }: { conversationId: number; disabled?: boolean }): JSX.Element | null {
  const queryClient = useQueryClient();
  const quota = useGroupPlusInfo(conversationId).data?.files ?? null;
  const inputRef = useRef<HTMLInputElement>(null);
  const tasks = useGroupFileUploads((state) => state.tasks);
  const reported = useRef(new Set<number>());

  // 从这里发起的上传失败了，提示一句（面板关着的时候用户看不到任务列表）
  useEffect(() => {
    for (const task of tasks) {
      if (task.conversationId === conversationId && task.status === 'failed' && !reported.current.has(task.id)) {
        reported.current.add(task.id);
        toast.error(`「${task.name}」上传失败：${task.error ?? '请稍后再试。'}`);
      }
    }
  }, [tasks, conversationId]);

  if (!quota || quota.state !== 'active') {
    return null;
  }
  return (
    <>
      <input ref={inputRef} type="file" multiple hidden onChange={(event) => {
        const list = Array.from(event.target.files ?? []);
        event.target.value = '';
        if (list.length === 0) {
          return;
        }
        const notice = queueGroupUploads(queryClient, conversationId, quota, list);
        if (notice) {
          toast.info(notice);
        } else {
          toast.info(list.length > 1 ? `正在上传 ${list.length} 个文件…` : `正在上传「${list[0].name}」…`);
        }
      }} />
      <button type="button" className="kcd-tool" title="上传群文件" aria-label="上传群文件" disabled={disabled} onClick={() => inputRef.current?.click()}>
        <Icon name="folder" className="h-[18px] w-[18px]" />
      </button>
    </>
  );
}
