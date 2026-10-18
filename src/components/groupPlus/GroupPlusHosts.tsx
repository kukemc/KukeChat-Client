import { ChatSearchHost } from '@/components/search/chat/ChatSearchHost';
import { GroupFilesHost } from './files/FilesHost';
import { GroupVideoHost } from './files/VideoPlayer';
import { GroupTodoDetailHost } from './todo/TodoDetailHost';
import { GroupUpgradeHost } from './upgrade/UpgradeHost';

/**
 * 群升级相关的全局浮层，主界面上挂一份（ChatDashboard，和 GiftSendHost 并排）。
 * 入口只往 useGroupPlusUi 里放「哪个群」，面板由这里画。
 */
export function GroupPlusHosts(): JSX.Element {
  return (
    <>
      <GroupUpgradeHost />
      <GroupFilesHost />
      <ChatSearchHost />
      <GroupTodoDetailHost />
      {/* 放最后：从群文件面板里点开的视频要压在面板上面 */}
      <GroupVideoHost />
    </>
  );
}
