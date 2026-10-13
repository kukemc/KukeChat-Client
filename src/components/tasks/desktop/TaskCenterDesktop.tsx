import { ContextMenuItem } from '@/components/ui/ContextMenu';
import { Icon } from '@/components/ui/Icon';
import type { User } from '@/types/api';
import { QUICK_NAV, SCOPE_NAV, type TaskScopeNavItem } from '../taskConstants';
import { useTaskCenter, type TaskCenterState } from '../taskHooks';
import { COL_LABELS, COL_ORDER, FILTER_LABELS, GROUP_KEYS, GROUP_LABELS, NAV_TITLES, SORT_KEYS, SORT_LABELS, STATUS_FILTERS, VIEW_MODES, type ViewMode } from '../taskModel';
import { MenuButton, cx } from './parts';
import { TaskBoardView } from './TaskBoardView';
import { TaskDetailDesktop } from './TaskDetailDesktop';
import { TaskEditorDesktop } from './TaskEditorDesktop';
import { TaskActivityFeed, TaskOverview } from './TaskFeedViews';
import { TaskListView } from './TaskListView';

const VIEW_LABELS: Record<ViewMode, string> = { list: '列表', board: '看板', dashboard: '仪表盘' };

function NavItems({ items, center }: { items: TaskScopeNavItem[]; center: TaskCenterState }): JSX.Element {
  return (
    <nav>
      {items.map((item) => (
        <button key={item.key} type="button" className={cx('ktk-nav-item', center.nav === item.key && 'is-active')} aria-current={center.nav === item.key ? 'page' : undefined} onClick={() => center.setNav(item.key)}>
          <Icon name={item.icon} />{item.label}
        </button>
      ))}
    </nav>
  );
}

/** 列表上方的一行：按状态筛选；列表视图再多出排序、分组、显示哪些列。 */
function Tools({ center }: { center: TaskCenterState }): JSX.Element {
  return (
    <div className="ktk-tools">
      <div className="kui-segment" role="radiogroup" aria-label="任务状态">
        {STATUS_FILTERS.map((key) => (
          <button key={key} type="button" role="radio" aria-checked={center.statusFilter === key} className={center.statusFilter === key ? 'is-active' : undefined} onClick={() => center.setStatusFilter(key)}>{FILTER_LABELS[key]}</button>
        ))}
      </div>
      {center.view === 'list' ? (
        <>
          <MenuButton icon="filter" text={`排序：${SORT_LABELS[center.sortBy]}`}>
            {(close) => SORT_KEYS.map((key) => (
              <ContextMenuItem key={key} label={SORT_LABELS[key]} selected={center.sortBy === key} onClick={() => {
                center.setSortBy(key);
                close();
              }} />
            ))}
          </MenuButton>
          <MenuButton icon="list" text={`分组：${GROUP_LABELS[center.groupBy]}`}>
            {(close) => GROUP_KEYS.map((key) => (
              <ContextMenuItem key={key} label={GROUP_LABELS[key]} selected={center.groupBy === key} onClick={() => {
                center.setGroupBy(key);
                close();
              }} />
            ))}
          </MenuButton>
          {/* 多选：点一项只切换那一列，菜单不收起 */}
          <MenuButton icon="settings" text="显示字段">
            {() => COL_ORDER.map((key) => <ContextMenuItem key={key} label={COL_LABELS[key]} selected={center.visibleCols.has(key)} onClick={() => center.toggleCol(key)} />)}
          </MenuButton>
        </>
      ) : null}
    </div>
  );
}

/**
 * 任务中心（桌面）。左边一栏选范围，中间是任务（列表 / 看板 / 仪表盘，或动态），
 * 点开的任务详情停在右侧；窗口窄到放不下时详情改成盖上来的抽屉。
 */
export function TaskCenterDesktop({ currentUser }: { currentUser: User }): JSX.Element {
  const center = useTaskCenter();
  const { nav, view, selectedTaskId, composer } = center;
  const listing = nav !== 'activity';
  const closeDetail = (): void => center.setSelectedTaskId(null);

  return (
    <div className="ktk">
      <aside className="ktk-nav">
        <h1 className="ktk-nav-title">任务</h1>
        <NavItems items={SCOPE_NAV} center={center} />
        <div className="kui-group-title">快速访问</div>
        <NavItems items={QUICK_NAV} center={center} />
      </aside>

      <section className="ktk-main">
        <header className="ktk-bar">
          <h2>{NAV_TITLES[nav]}</h2>
          {listing ? (
            <div className="kui-segment" role="radiogroup" aria-label="视图">
              {VIEW_MODES.map((mode) => (
                <button key={mode} type="button" role="radio" aria-checked={view === mode} className={view === mode ? 'is-active' : undefined} onClick={() => center.setView(mode)}>{VIEW_LABELS[mode]}</button>
              ))}
            </div>
          ) : null}
          <span className="ktk-spacer" />
          {center.canCreate ? <button type="button" className="kui-btn kui-btn--primary" onClick={() => center.openComposer(null)}><Icon name="plus" className="h-4 w-4" />新建任务</button> : null}
        </header>

        <div className="ktk-body">
          <div className="ktk-pane">
            {listing && view !== 'dashboard' ? <Tools center={center} /> : null}
            <div className="ktk-content kui-scroll">
              {!listing ? <TaskActivityFeed activities={center.activities} loading={center.activitiesLoading} onOpenTask={center.setSelectedTaskId} />
                : view === 'dashboard' ? <TaskOverview data={center.dashboard} />
                  : view === 'board' ? <TaskBoardView center={center} />
                    : <TaskListView center={center} />}
            </div>
          </div>
          {selectedTaskId != null ? (
            <>
              <div className="ktk-side-scrim" onClick={closeDetail} />
              <aside className="ktk-side">
                {/* 换一条任务就换一个实例：没发出去的评论、上一条的报错不该跟过来 */}
                <TaskDetailDesktop key={selectedTaskId} taskId={selectedTaskId} onClose={closeDetail} onOpenTask={center.setSelectedTaskId} onCreateSubtask={center.openSubtaskComposer} />
              </aside>
            </>
          ) : null}
        </div>
      </section>

      {composer ? (
        <TaskEditorDesktop
          conversationId={composer.conversationId}
          currentUser={currentUser}
          defaultParentId={composer.parentId}
          initialGroupId={composer.groupId}
          onClose={center.closeComposer}
          onCreated={center.refresh}
        />
      ) : null}
    </div>
  );
}
