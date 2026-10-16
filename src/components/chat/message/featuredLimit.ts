import { featuredLimitOf } from '@/components/groupPlus/data';
import { useGroupPlusUi } from '@/components/groupPlus/ui';
import { toast } from '@/components/ui/toast';

/**
 * 设精华被拒（409 featured_limit）时的提示。
 * 为什么单独处理：这不是「出错了请重试」，而是「这个群的精华满了」，用户要知道已用多少、上限多少，
 * 并且有办法解决 —— 能买升级的人（群主 / 管理员）直接给「去升级」。
 * 返回 true 表示这是个超限错误、已经提示过了，调用方不用再显示通用的失败文字。
 */
export function reportFeaturedLimit(error: unknown, conversationId: number, canUpgrade: boolean): boolean {
  const limit = featuredLimitOf(error);
  if (!limit) {
    return false;
  }
  toast.show({
    tone: 'warning',
    message: `精华已达上限（已用 ${limit.used} / 上限 ${limit.limit}）。${canUpgrade ? '升级群档位后可以存更多。' : '请联系群主升级群档位。'}`,
    actions: canUpgrade ? [{ label: '去升级', onClick: () => useGroupPlusUi.getState().openUpgrade({ conversationId, reason: 'featured' }) }] : undefined
  });
  return true;
}
