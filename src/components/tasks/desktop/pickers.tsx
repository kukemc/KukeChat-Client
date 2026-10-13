/** 桌面端任务表单里的四个选择器：成员、截止时间、优先级、分组。详情和新建对话框共用。 */
import { useState } from 'react';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { ContextMenuItem, ContextMenuSeparator } from '@/components/ui/ContextMenu';
import { Icon } from '@/components/ui/Icon';
import type { TaskGroup, TaskPriority, User } from '@/types/api';
import { PRIORITY_META, PRIORITY_ORDER, formatDueLabel } from '../taskConstants';
import { useDuePicker, type DuePickerState } from '../taskPanelHooks';
import { REMIND_OPTIONS, WEEKDAYS, filterMembers, isSameDay } from '../taskPanelModel';
import { InlineInput, PopButton, PriorityTag, cx } from './parts';

/* ───────── 成员 ───────── */

function MemberList({ members, selectedIds, onToggle }: { members: User[]; selectedIds: number[]; onToggle: (id: number) => void }): JSX.Element {
  const [query, setQuery] = useState('');
  const filtered = filterMembers(members, query);
  return (
    <>
      <label className="kui-field">
        <Icon name="search" className="h-3.5 w-3.5" />
        <input autoFocus value={query} placeholder="搜索成员" onChange={(event) => setQuery(event.target.value)} />
      </label>
      <div className="ktk-member-list kui-scroll" role="listbox" aria-multiselectable="true">
        {filtered.map((user) => {
          const selected = selectedIds.includes(user.id);
          return (
            <button key={user.id} type="button" role="option" aria-selected={selected} className={cx('kui-menu-item ktk-member', selected && 'is-selected')} onClick={() => onToggle(user.id)}>
              <Avatar user={user} size="sm" />
              <span className="ktk-clip">{getDisplayName(user)}</span>
              {selected ? <Icon name="check" /> : null}
            </button>
          );
        })}
        {filtered.length === 0 ? <p className="ktk-pop-empty">无匹配成员</p> : null}
      </div>
    </>
  );
}

/** 负责人 / 关注人：已选的排成一串小标签，末尾的按钮弹出可搜索的成员列表。 */
export function MemberPicker({ members, selectedIds, onChange, placeholder, disabled = false }: { members: User[]; selectedIds: number[]; onChange: (ids: number[]) => void; placeholder: string; disabled?: boolean }): JSX.Element {
  const selected = members.filter((user) => selectedIds.includes(user.id));
  const toggle = (id: number): void => onChange(selectedIds.includes(id) ? selectedIds.filter((item) => item !== id) : [...selectedIds, id]);

  return (
    <div className="ktk-people">
      {selected.map((user) => (
        <span key={user.id} className="ktk-person">
          <Avatar user={user} size="sm" />
          <span className="ktk-clip">{getDisplayName(user)}</span>
          {disabled ? null : <button type="button" aria-label={`移除${getDisplayName(user)}`} onClick={() => toggle(user.id)}><Icon name="close" className="h-3 w-3" /></button>}
        </span>
      ))}
      {disabled ? (selected.length === 0 ? <span className="ktk-none">未设置</span> : null) : (
        <PopButton className="ktk-add" popClassName="ktk-member-pop" label={<><Icon name="plus" className="h-3 w-3" />{placeholder}</>}>
          {() => <MemberList members={members} selectedIds={selectedIds} onToggle={toggle} />}
        </PopButton>
      )}
    </div>
  );
}

/* ───────── 截止时间 ───────── */

function Calendar({ dueAt, remindOffset, picker, onDone }: { dueAt: Date | null; remindOffset: number | null; picker: DuePickerState; onDone: () => void }): JSX.Element {
  const today = new Date();
  const { viewMonth } = picker;
  return (
    <>
      <div className="ktk-cal-head">
        <strong>{viewMonth.getFullYear()} 年 {viewMonth.getMonth() + 1} 月</strong>
        <button type="button" className="kui-btn kui-btn--sm" onClick={() => picker.pickQuick('today')}>今天</button>
        <button type="button" className="kui-btn kui-btn--sm" onClick={() => picker.pickQuick('tomorrow')}>明天</button>
        <button type="button" className="kui-icon-btn ktk-icon-btn" aria-label="上个月" onClick={() => picker.shiftMonth(-1)}><Icon name="chevronLeft" className="h-4 w-4" /></button>
        <button type="button" className="kui-icon-btn ktk-icon-btn" aria-label="下个月" onClick={() => picker.shiftMonth(1)}><Icon name="chevron" className="h-4 w-4" /></button>
      </div>
      <div className="ktk-cal-grid ktk-cal-week">
        {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
      </div>
      <div className="ktk-cal-grid">
        {picker.cells.map((date) => (
          <button
            key={date.getTime()}
            type="button"
            className={cx('ktk-day', date.getMonth() !== viewMonth.getMonth() && 'is-out', isSameDay(date, today) && 'is-today', isSameDay(date, dueAt) && 'is-selected')}
            onClick={() => picker.pickDate(date)}
          >
            {date.getDate()}
          </button>
        ))}
      </div>
      <div className="ktk-cal-options">
        <label className="kui-row">
          <span className="kui-row-label">具体时间</span>
          {picker.hasTime ? <input type="time" className="kui-input ktk-cal-control" value={picker.time} aria-label="截止的具体时间" onChange={(event) => picker.setTime(event.target.value)} /> : null}
          <input type="checkbox" role="switch" className="kui-switch" checked={picker.hasTime} onChange={(event) => picker.setHasTime(event.target.checked)} />
        </label>
        <label className="kui-row">
          <span className="kui-row-label">提醒</span>
          <select className="kui-select ktk-cal-control" value={remindOffset === null ? '' : String(remindOffset)} onChange={(event) => picker.setRemind(event.target.value === '' ? null : Number(event.target.value))}>
            {REMIND_OPTIONS.map((option) => <option key={option.label} value={option.value === null ? '' : String(option.value)}>{option.label}</option>)}
          </select>
        </label>
      </div>
      <div className="ktk-cal-foot">
        <button type="button" className="kui-btn kui-btn--primary kui-btn--sm" onClick={onDone}>确定</button>
      </div>
    </>
  );
}

/** 截止时间：一个按钮显示当前值，点开是月历 + 具体时间 + 提醒。每改一处立即生效，「确定」只是收起。 */
export function DuePicker({ dueAt, remindOffset, overdue = false, onChange }: { dueAt: Date | null; remindOffset: number | null; overdue?: boolean; onChange: (dueAt: Date | null, remindOffset: number | null) => void }): JSX.Element {
  const picker = useDuePicker(dueAt, remindOffset, onChange);
  return (
    <span className="ktk-value-group">
      <PopButton
        className={cx('ktk-value', !dueAt && 'is-empty', overdue && 'is-overdue')}
        popClassName="ktk-cal"
        label={<><Icon name="clock" className="h-3.5 w-3.5" /><span>{dueAt ? formatDueLabel(dueAt.toISOString()) : '设置截止时间'}</span>{dueAt && remindOffset !== null ? <Icon name="bell" className="h-3 w-3" /> : null}</>}
      >
        {(close) => <Calendar dueAt={dueAt} remindOffset={remindOffset} picker={picker} onDone={close} />}
      </PopButton>
      {dueAt ? <button type="button" className="kui-icon-btn ktk-icon-btn" aria-label="清除截止时间" title="清除截止时间" onClick={() => onChange(null, null)}><Icon name="close" className="h-3.5 w-3.5" /></button> : null}
    </span>
  );
}

/* ───────── 优先级 ───────── */

export function PriorityPicker({ value, onChange }: { value: TaskPriority; onChange: (value: TaskPriority) => void }): JSX.Element {
  return (
    <PopButton className="ktk-value" popClassName="kui-menu" label={<><PriorityTag priority={value} /><Icon name="chevron" className="ktk-caret" /></>}>
      {(close) => PRIORITY_ORDER.map((priority) => (
        <ContextMenuItem
          key={priority}
          label={PRIORITY_META[priority].label}
          suffix={PRIORITY_META[priority].code}
          selected={priority === value}
          onClick={() => {
            onChange(priority);
            close();
          }}
        />
      ))}
    </PopButton>
  );
}

/* ───────── 分组 ───────── */

function GroupMenu({ groups, value, onPick, onCreate }: { groups: TaskGroup[]; value: number | null; onPick: (value: number | null) => void; onCreate?: (name: string) => void }): JSX.Element {
  const [creating, setCreating] = useState(false);
  return (
    <>
      <ContextMenuItem label="默认分组" selected={value === null} onClick={() => onPick(null)} />
      {groups.map((group) => <ContextMenuItem key={group.id} label={group.name} selected={group.id === value} onClick={() => onPick(group.id)} />)}
      {onCreate ? (
        <>
          <ContextMenuSeparator />
          {creating
            ? <InlineInput className="ktk-menu-input" placeholder="分组名称，回车确定" onSubmit={onCreate} onCancel={() => setCreating(false)} />
            : <ContextMenuItem icon="plus" label="新建分组" onClick={() => setCreating(true)} />}
        </>
      ) : null}
    </>
  );
}

/** 任务放在哪个自定义分组。onCreate 给了就能在菜单里顺手新建一个分组并选中它。 */
export function GroupPicker({ groups, value, onChange, onCreate }: { groups: TaskGroup[]; value: number | null; onChange: (value: number | null) => void; onCreate?: (name: string) => void }): JSX.Element {
  const current = groups.find((group) => group.id === value);
  return (
    <PopButton className="ktk-value" popClassName="kui-menu ktk-group-menu" label={<><span className="ktk-clip">{current ? current.name : '默认分组'}</span><Icon name="chevron" className="ktk-caret" /></>}>
      {(close) => (
        <GroupMenu
          groups={groups}
          value={value}
          onPick={(next) => {
            onChange(next);
            close();
          }}
          onCreate={onCreate ? (name) => {
            onCreate(name);
            close();
          } : undefined}
        />
      )}
    </PopButton>
  );
}
