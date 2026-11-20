import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateMyProfile } from '@/api/users';
import { Row, Toggle } from '@/components/settings/desktop/settingsUi';
import { useKukeStore } from '@/store/kukeStore';
import type { ProfileUpdatePayload } from '@/types/api';

type Flag = 'share_ccw_activity' | 'ccw_discoverable';

/** 一个开关一行。老版本服务端不返回这两个字段，按默认值「开」处理。 */
function FlagRow({ flag, title, description }: { flag: Flag; title: string; description: string }): JSX.Element {
  const queryClient = useQueryClient();
  const value = useKukeStore((state) => state.currentUser?.[flag] !== false);
  const setCurrentUser = useKukeStore((state) => state.setCurrentUser);
  const save = useMutation({
    mutationFn: (on: boolean) => updateMyProfile({ [flag]: on } as ProfileUpdatePayload),
    onSuccess: (updated) => {
      setCurrentUser(updated);
      void queryClient.invalidateQueries({ queryKey: ['me'] });
    }
  });
  return (
    <Row icon="gamepad" title={title} description={save.isError ? '保存失败，请重试。' : description}>
      <Toggle label={title} checked={save.isPending ? save.variables : value} disabled={save.isPending} onChange={(on) => save.mutate(on)} />
    </Row>
  );
}

/**
 * 设置里「在共创世界上」的两个隐私开关（后端 docs/ccw-social.md）。
 * 状态由油猴脚本 KukeChat for CCW 在共创世界页面上上报；没装脚本时这两项没有效果，但设置照样能改。
 */
export function CcwPrivacyRows(): JSX.Element {
  return (
    <>
      <FlagRow flag="share_ccw_activity" title="公开我正在玩的作品"
        description="装了 KukeChat for CCW 脚本后，你在共创世界上玩或创作的作品会显示在你的名字旁边，所有人都能看到。关掉后立刻隐藏。" />
      <FlagRow flag="ccw_discoverable" title="允许从共创世界主页找到我"
        description="别人在你的共创世界主页、评论区里能看到你的 KukeChat，并直接加好友、发私信。关掉后对别人显示为没有 KukeChat。" />
    </>
  );
}
