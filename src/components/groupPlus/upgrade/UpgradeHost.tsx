import { useQuery } from '@tanstack/react-query';
import { getConversations } from '@/api/conversations';
import type { Conversation } from '@/types/api';
import { useGroupPlusUi } from '../ui';
import { UpgradePanel } from './UpgradePanel';

const NONE: Conversation[] = [];

/**
 * 群升级面板的宿主：主界面上挂一份（GroupPlusHosts）。入口只往 useGroupPlusUi 里放「哪个群」。
 * 会话对象只订阅缓存、不主动请求（enabled: false），和消息行里群名片的做法一致。
 */
export function GroupUpgradeHost(): JSX.Element | null {
  const target = useGroupPlusUi((state) => state.upgrade);
  const close = useGroupPlusUi((state) => state.closeUpgrade);
  const { data } = useQuery({ queryKey: ['conversations'], queryFn: getConversations, enabled: false });
  if (!target) {
    return null;
  }
  const conversation = (data ?? NONE).find((item) => item.id === target.conversationId);
  // 私聊没有群升级；会话不在缓存里（刚退群）也不画
  if (!conversation || conversation.type !== 'group') {
    return null;
  }
  // key：换了群就是一个新的面板，选的档位、报价不带过去
  return <UpgradePanel key={`${conversation.id}-${target.reason ?? 'manual'}`} conversation={conversation} reason={target.reason ?? 'manual'} focusTier={target.focusTier} onClose={close} />;
}
