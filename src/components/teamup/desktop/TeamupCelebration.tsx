import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import type { User } from '@/types/api';
import { useCelebrationTimer } from '../TeamupConnectionCelebration';

/** 发出组队申请后的提示：两个人的头像连在一起，停一会儿自己消失，点一下也会关。 */
export function TeamupCelebration({ me, target, onDone }: { me: User; target: User; onDone: () => void }): JSX.Element {
  useCelebrationTimer(onDone);
  return (
    <div className="kui-backdrop" onClick={onDone}>
      <div role="status" className="kui-dialog ktu-celebrate">
        <div className="ktu-celebrate-pair">
          <span><Avatar user={me} size="lg" /><b>{getDisplayName(me)}</b></span>
          <i><Icon name="userPlus" className="h-4 w-4" /></i>
          <span><Avatar user={target} size="lg" /><b>{getDisplayName(target)}</b></span>
        </div>
        <h3>组队申请已发送</h3>
        <p>等待对方通过后即可开始协作</p>
      </div>
    </div>
  );
}
