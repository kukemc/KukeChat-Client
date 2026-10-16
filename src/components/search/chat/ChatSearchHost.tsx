import { useEffect } from 'react';
import { useGroupPlusUi, type ChatSearchTarget } from '@/components/groupPlus/ui';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/desktop/Modal';
import { registerNativeBackHandler } from '@/native/back';
import { useKukeStore } from '@/store/kukeStore';
import { ChatSearchPanel } from './ChatSearchPanel';
import { useChatSearch } from './useChatSearch';

/**
 * 聊天记录搜索的宿主：聊天头部的「聊天记录」按钮和全局搜索都只往 useGroupPlusUi 里放目标，由这里画。
 * 目标变了（比如从一个会话换到另一个）就是一个全新的面板，搜索条件不带过去。
 */
export function ChatSearchHost(): JSX.Element | null {
  const target = useGroupPlusUi((state) => state.chatSearch);
  if (!target) {
    return null;
  }
  return <ChatSearchSurface key={`${target.conversationId ?? 'all'}-${target.keyword ?? ''}`} target={target} />;
}

function ChatSearchSurface({ target }: { target: ChatSearchTarget }): JSX.Element {
  const close = useGroupPlusUi((state) => state.closeChatSearch);
  const mobile = useKukeStore((state) => state.layoutMode === 'mobile');
  const state = useChatSearch(target);
  const inConversation = state.scopeId !== null;
  // 全局模式点进了某个会话：返回箭头回到聚合列表；从会话里直接打开的没有上一层
  const canBackToSummary = inConversation && target.conversationId === null;
  const title = inConversation ? state.scopeTitle || target.title || '聊天记录' : '搜索聊天记录';

  useEffect(() => {
    if (!mobile) {
      return undefined;
    }
    return registerNativeBackHandler(() => {
      if (canBackToSummary) {
        state.backToSummary();
      } else {
        close();
      }
      return true;
    }, 170);
  }, [mobile, canBackToSummary, close, state]);

  if (!mobile) {
    return (
      <Modal
        title={title}
        subtitle={inConversation ? '聊天记录' : '按会话查看命中'}
        className="kmd-modal--xl kmd-modal--tall kcs-modal"
        bodyClassName="kcs-body"
        onBack={canBackToSummary ? state.backToSummary : undefined}
        onClose={close}
      >
        <ChatSearchPanel state={state} mobile={false} onClose={close} />
      </Modal>
    );
  }

  // 不用 portal：宿主挂在主界面里，已经在带主题变量的根下面，fixed 铺满即可
  return (
    <div className="kcs-page">
      <header className="kcs-page-head">
        <button type="button" className="kcs-page-back" aria-label={canBackToSummary ? '返回会话列表' : '返回'} onClick={canBackToSummary ? state.backToSummary : close}>
          <Icon name="chevronLeft" className="h-6 w-6" />
        </button>
        <div className="kcs-page-title">
          <h2>{title}</h2>
          <p>{inConversation ? '搜索这个会话的聊天记录' : '只搜索你自己的会话'}</p>
        </div>
        <span className="kcs-page-spacer" />
      </header>
      <ChatSearchPanel state={state} mobile onClose={close} />
    </div>
  );
}
