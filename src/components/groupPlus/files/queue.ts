import type { QueryClient } from '@tanstack/react-query';
import type { GroupFileQuota } from '@/types/groupPlus';
import { formatFileSize } from '../tier';
import { useGroupFileUploads } from '../uploads';
import { fileRules, planUpload } from './fileUtils';

/**
 * 把选中的文件排进上传队列：群文件面板的「选择文件 / 拖进来」和输入框工具栏的上传按钮共用。
 * 逐个按 planUpload 判断放进群空间、存成临时文件，还是超过上限不能传；返回一句要告诉用户的话（没有就是 null）。
 * 同一批里已经排进去、还没传完的文件也占空间，免得每个都单独通过、合起来超额。
 */
export function queueGroupUploads(queryClient: QueryClient, conversationId: number, quota: GroupFileQuota, list: File[], options: { permanent?: boolean; folderId?: number | null } = {}): string | null {
  if (quota.state !== 'active') {
    return quota.state === 'grace' ? '宽限期内只能查看、下载和删除，不能上传。' : '这个群还没有解锁群文件。';
  }
  const rules = fileRules(quota);
  const { tasks, start } = useGroupFileUploads.getState();
  let reserved = tasks.filter((task) => task.conversationId === conversationId && task.status === 'uploading' && !task.temporary).reduce((sum, task) => sum + task.size, 0);
  let notice: string | null = null;
  let temps = 0;
  for (const file of list) {
    if (file.size <= 0) {
      notice = `「${file.name}」是空文件，不能上传。`;
      continue;
    }
    const plan = planUpload(rules, file.size, reserved);
    if (plan.kind === 'reject') {
      notice = rules.modern && rules.tempMax > 0
        ? `「${file.name}」有 ${formatFileSize(file.size)}，${rules.hasSpace ? '群空间放不下，' : ''}临时文件单个最大 ${formatFileSize(rules.tempMax)}。`
        : `「${file.name}」有 ${formatFileSize(file.size)}，现在最大能传 ${formatFileSize(plan.maxBytes)}。`;
      continue;
    }
    if (plan.kind === 'space') {
      reserved += file.size;
    } else {
      temps += 1;
    }
    start(queryClient, conversationId, file, { permanent: plan.kind === 'space' && options.permanent === true, temporary: plan.kind === 'temp', direct: quota.direct === true, folderId: options.folderId ?? null });
  }
  if (temps > 0 && rules.hasSpace && notice === null) {
    // 临时文件不进文件夹（5.5）：服务端会放到根目录
    notice = `群空间不够，${temps > 1 ? `这 ${temps} 个文件` : '这个文件'}存为 ${rules.tempTtlHours} 小时临时文件${options.folderId ? '，放在根目录' : ''}。`;
  }
  return notice;
}
