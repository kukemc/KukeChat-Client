/**
 * 聊天里点机器人的头像 / 名字（以及资料卡、成员列表里的机器人）时，打开这个机器人的详情页。
 *
 * 消息和成员里只有机器人的用户账号（users.is_bot），这里用 GET /bots/by-user/{user_id} 换到 bot_id，
 * 再交给 store 的 openBot：桌面版切到机器人中心打开详情，移动端由 ChatDashboard 推出机器人详情页。
 */
import { ApiError } from '@/api/client';
import { getBotByUserId } from '@/api/bots';
import { toast } from '@/components/ui/toast';
import { useKukeStore } from '@/store/kukeStore';

// 机器人的用户账号和 bot_id 一一对应且不会变，记下来下次点就不用再请求
const botIdByUserId = new Map<number, number>();
const pending = new Set<number>();

export function openBotForUser(userId: number | null | undefined): void {
  if (!userId) {
    return;
  }
  const known = botIdByUserId.get(userId);
  if (known !== undefined) {
    useKukeStore.getState().openBot(known);
    return;
  }
  if (pending.has(userId)) {
    return;
  }
  pending.add(userId);
  getBotByUserId(userId)
    .then((bot) => {
      botIdByUserId.set(userId, bot.id);
      useKukeStore.getState().openBot(bot.id);
    })
    .catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 403) {
        toast.info('这个机器人没有公开，看不了详情');
      } else if (error instanceof ApiError && error.status === 404) {
        toast.info('这个机器人已经不在了');
      } else {
        toast.error('机器人详情打开失败，请稍后重试');
      }
    })
    .finally(() => pending.delete(userId));
}
