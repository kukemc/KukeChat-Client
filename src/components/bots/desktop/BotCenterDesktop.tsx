import { useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useKukeStore } from '@/store/kukeStore';
import type { Bot, Conversation } from '@/types/api';
import { useRotateBotKey } from '../botQueries';
import { errorMessage } from '../botShared';
import { BotApiDocs } from './BotApiDocs';
import { BotDashboard } from './BotDashboard';
import { BotDetail } from './BotDetail';
import { DeleteDialog, InstallDialog, KeyDialog, ShareDialog } from './BotDialogs';
import { BotEditorDesktop } from './BotEditorDesktop';
import { BotOverview } from './BotOverview';
import { BotSidebar, type BotTab } from './BotSidebar';
import type { BotActions } from './botUi';

type DialogState =
  | { kind: 'install' | 'share' | 'delete'; bot: Bot }
  | { kind: 'key'; value: string }
  | { kind: 'docs' }
  | null;

/**
 * 桌面端的机器人中心。左边一栏是广场 / 我的机器人，右边是选中机器人的详情或仪表盘，没选时是概览；
 * 新建和编辑是占满整块区域的编辑页。选中项、当前页面和所有弹窗的状态都收在这里。
 */
export function BotCenterDesktop({ conversations }: { conversations: Conversation[] }): JSX.Element {
  const currentUser = useKukeStore((state) => state.currentUser);
  const openUserSpace = useKukeStore((state) => state.openUserSpace);
  const [tab, setTab] = useState<BotTab>('square');
  const [keyword, setKeyword] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showDashboard, setShowDashboard] = useState(false);
  /** 正在编辑的机器人；{ bot: null } 是新建 */
  const [editing, setEditing] = useState<{ bot: Bot | null } | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [notice, setNotice] = useState('');
  const rotate = useRotateBotKey();
  const rotateKey = rotate.mutate;

  const actions = useMemo<BotActions>(() => ({
    select: (botId) => {
      setSelectedId(botId);
      setShowDashboard(false);
      setNotice('');
    },
    openDashboard: (botId) => {
      setSelectedId(botId);
      setShowDashboard(true);
      setNotice('');
    },
    create: () => setEditing({ bot: null }),
    edit: (bot) => setEditing({ bot }),
    install: (bot) => setDialog({ kind: 'install', bot }),
    share: (bot) => setDialog({ kind: 'share', bot }),
    remove: (bot) => setDialog({ kind: 'delete', bot }),
    rotateKey: (bot) => rotateKey(bot.id, {
      onSuccess: (result) => setDialog({ kind: 'key', value: result.key }),
      onError: (error) => setNotice(errorMessage(error))
    }),
    openDocs: () => setDialog({ kind: 'docs' }),
    openUser: openUserSpace,
    report: (error) => setNotice(error ? errorMessage(error) : '')
  }), [openUserSpace, rotateKey]);

  // 从别处（聊天里的机器人名片、通知）跳过来：openBot 把要看的机器人放在 pendingBotId，这里接住打开它的详情
  const pendingBotId = useKukeStore((state) => state.pendingBotId);
  const clearPendingBot = useKukeStore((state) => state.clearPendingBot);
  useEffect(() => {
    if (pendingBotId === null) return;
    setEditing(null);
    actions.select(pendingBotId);
    clearPendingBot(pendingBotId);
  }, [actions, clearPendingBot, pendingBotId]);

  const closeDialog = (): void => setDialog(null);

  return (
    <section className={editing ? 'kui kcb-center is-editing' : 'kui kcb-center'}>
      {/* 编辑页盖在上面，下面的列表和详情只是藏起来：回来时滚动位置和选中项都还在 */}
      {editing ? <BotEditorDesktop key={editing.bot?.id ?? 'new'} bot={editing.bot} onBack={() => setEditing(null)} /> : null}
      <BotSidebar tab={tab} keyword={keyword} selectedId={selectedId} currentUserId={currentUser?.id} actions={actions} onTabChange={setTab} onKeywordChange={setKeyword} />

      <div className="kcb-pane">
        {notice ? (
          <p className="kcb-notice" role="alert">
            <span>{notice}</span>
            <button type="button" aria-label="关闭提示" onClick={() => setNotice('')}><Icon name="close" className="h-3.5 w-3.5" /></button>
          </p>
        ) : null}
        {selectedId === null ? <BotOverview keyword={keyword} actions={actions} onShowMine={() => setTab('mine')} /> : null}
        {selectedId !== null && showDashboard ? <BotDashboard key={selectedId} botId={selectedId} actions={actions} onBack={() => setShowDashboard(false)} /> : null}
        {selectedId !== null && !showDashboard ? <BotDetail key={selectedId} botId={selectedId} currentUserId={currentUser?.id} actions={actions} /> : null}
      </div>

      {dialog?.kind === 'install' ? <InstallDialog bot={dialog.bot} conversations={conversations} onClose={closeDialog} /> : null}
      {dialog?.kind === 'share' ? <ShareDialog bot={dialog.bot} conversations={conversations} currentUser={currentUser} onClose={closeDialog} /> : null}
      {dialog?.kind === 'delete' ? (
        <DeleteDialog bot={dialog.bot} onClose={closeDialog} onDeleted={() => {
          // 删掉的正是右边开着的那个：回到概览，别停在一个已经不存在的详情上
          if (dialog.bot.id === selectedId) {
            setSelectedId(null);
            setShowDashboard(false);
          }
          closeDialog();
        }} />
      ) : null}
      {dialog?.kind === 'key' ? <KeyDialog botKey={dialog.value} onClose={closeDialog} /> : null}
      {dialog?.kind === 'docs' ? <BotApiDocs onClose={closeDialog} /> : null}
    </section>
  );
}
