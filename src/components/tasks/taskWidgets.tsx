import { useMemo, useState } from 'react';
import type { TaskGroup, TaskPriority, User } from '@/types/api';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { PRIORITY_META, PRIORITY_ORDER, formatDueLabel } from './taskConstants';

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

// Transparent full-screen layer that closes the popover when clicking outside it.
// Reliable inside nested modals/drawers (no document listener / contains() ambiguity).
function DismissLayer({ onDismiss }: { onDismiss: () => void }): JSX.Element {
  return <div className="fixed inset-0 z-[60]" onMouseDown={onDismiss} />;
}

interface MemberSelectProps {
  members: User[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  placeholder: string;
  disabled?: boolean;
}

export function MemberSelect({ members, selectedIds, onChange, placeholder, disabled }: MemberSelectProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = useMemo(() => members.filter((user) => selectedIds.includes(user.id)), [members, selectedIds]);
  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) {
      return members;
    }
    return members.filter((user) => getDisplayName(user).toLowerCase().includes(keyword) || (user.username ?? '').toLowerCase().includes(keyword));
  }, [members, query]);

  function toggle(id: number): void {
    onChange(selectedIds.includes(id) ? selectedIds.filter((item) => item !== id) : [...selectedIds, id]);
  }

  return (
    <div className="relative min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-1.5">
        {selected.map((user) => (
          <span key={user.id} className="flex items-center gap-1 rounded-full py-0.5 pl-0.5 pr-1.5 text-xs [background:var(--kc-accent-soft)] [color:var(--kc-accent)]">
            <span className="[&>*]:!h-4 [&>*]:!w-4">
              <Avatar user={user} size="sm" />
            </span>
            <span className="max-w-[80px] truncate">{getDisplayName(user)}</span>
            {!disabled ? (
              <button type="button" onClick={() => toggle(user.id)} className="opacity-60 hover:opacity-100">
                <Icon name="close" className="h-3 w-3" />
              </button>
            ) : null}
          </span>
        ))}
        {!disabled ? (
          <button
            type="button"
            onClick={() => { setQuery(''); setOpen((value) => !value); }}
            className="flex items-center gap-1 rounded-full border border-dashed px-2 py-1 text-xs [border-color:var(--kc-border)] [color:var(--kc-muted)] hover:[background:var(--kc-hover)]"
          >
            <Icon name="plus" className="h-3 w-3" /> {placeholder}
          </button>
        ) : !selected.length ? <span className="text-xs [color:var(--kc-muted)]">未设置</span> : null}
      </div>
      {open ? (
        <>
          <DismissLayer onDismiss={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-[61] mt-1.5 w-60 rounded-xl border p-1.5 shadow-lg [background:var(--kc-panel)] [border-color:var(--kc-border)]">
            <div className="mb-1.5 flex items-center gap-1.5 rounded-lg border px-2 py-1.5 [border-color:var(--kc-border)]">
              <Icon name="search" className="h-3.5 w-3.5 [color:var(--kc-muted)]" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索成员"
                className="min-w-0 flex-1 bg-transparent text-xs outline-none [color:var(--kc-text)]"
              />
            </div>
            <div className="max-h-56 overflow-y-auto">
              {filtered.length ? filtered.map((user) => {
                const active = selectedIds.includes(user.id);
                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => toggle(user.id)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:[background:var(--kc-hover)]"
                  >
                    <span className="[&>*]:!h-6 [&>*]:!w-6">
                      <Avatar user={user} size="sm" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs [color:var(--kc-text)]">{getDisplayName(user)}</span>
                    {active ? <Icon name="check" className="h-3.5 w-3.5 [color:var(--kc-accent)]" /> : null}
                  </button>
                );
              }) : <p className="px-2 py-3 text-center text-xs [color:var(--kc-muted)]">无匹配成员</p>}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

interface GroupSelectProps {
  groups: TaskGroup[];
  value: number | null;
  onChange: (value: number | null) => void;
  onCreate?: (name: string) => Promise<void> | void;
}

export function GroupSelect({ groups, value, onChange, onCreate }: GroupSelectProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const current = groups.find((group) => group.id === value);

  async function submitCreate(): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed || !onCreate) {
      setCreating(false);
      setName('');
      return;
    }
    await onCreate(trimmed);
    setCreating(false);
    setName('');
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm [color:var(--kc-text)] hover:[background:var(--kc-hover)]"
      >
        {current ? current.name : '默认分组'}
        <Icon name="chevron" className="h-3 w-3 rotate-90 [color:var(--kc-muted)]" />
      </button>
      {open ? (
        <>
          <DismissLayer onDismiss={() => { setOpen(false); setCreating(false); }} />
          <div className="absolute left-0 top-full z-[61] mt-1 w-40 rounded-xl border p-1 shadow-lg [background:var(--kc-panel)] [border-color:var(--kc-border)]">
            <button type="button" onClick={() => { onChange(null); setOpen(false); }} className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:[background:var(--kc-hover)] [color:var(--kc-text)]">
              默认分组 {value === null ? <Icon name="check" className="h-3.5 w-3.5 [color:var(--kc-accent)]" /> : null}
            </button>
            {groups.map((group) => (
              <button key={group.id} type="button" onClick={() => { onChange(group.id); setOpen(false); }} className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:[background:var(--kc-hover)] [color:var(--kc-text)]">
                <span className="truncate">{group.name}</span>
                {value === group.id ? <Icon name="check" className="h-3.5 w-3.5 [color:var(--kc-accent)]" /> : null}
              </button>
            ))}
            {onCreate ? (
              creating ? (
                <div className="mt-1 flex items-center gap-1 border-t px-1 pt-1 [border-color:var(--kc-border)]">
                  <input
                    autoFocus
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void submitCreate(); } }}
                    placeholder="分组名称"
                    className="min-w-0 flex-1 rounded-md border px-1.5 py-1 text-xs outline-none [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-text)]"
                  />
                  <button type="button" onClick={() => void submitCreate()} className="rounded-md px-2 py-1 text-xs text-white [background:var(--kc-accent)]">确定</button>
                </div>
              ) : (
                <button type="button" onClick={() => setCreating(true)} className="mt-1 flex w-full items-center gap-1 border-t px-2 py-1.5 text-sm [border-color:var(--kc-border)] [color:var(--kc-accent)]">
                  <Icon name="plus" className="h-3.5 w-3.5" /> 新建分组
                </button>
              )
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

export function PriorityBadge({ priority, size = 'sm' }: { priority: TaskPriority; size?: 'sm' | 'md' }): JSX.Element {
  const meta = PRIORITY_META[priority];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md font-semibold ${size === 'md' ? 'px-2 py-0.5 text-xs' : 'px-1.5 py-0.5 text-[11px]'}`}
      style={{ background: meta.bg, color: meta.color }}
    >
      <span>{meta.code}</span>
      <span>{meta.label}</span>
    </span>
  );
}

export function PrioritySelect({ value, onChange }: { value: TaskPriority; onChange: (value: TaskPriority) => void }): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1.5 rounded-lg border px-2 py-1.5 [border-color:var(--kc-border)] hover:[background:var(--kc-hover)]"
      >
        <PriorityBadge priority={value} />
        <Icon name="chevron" className="h-3 w-3 rotate-90 [color:var(--kc-muted)]" />
      </button>
      {open ? (
        <>
          <DismissLayer onDismiss={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-[61] mt-1 w-36 rounded-xl border p-1 shadow-lg [background:var(--kc-panel)] [border-color:var(--kc-border)]">
            {PRIORITY_ORDER.map((priority) => (
              <button
                key={priority}
                type="button"
                onClick={() => {
                  onChange(priority);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 hover:[background:var(--kc-hover)]"
              >
                <PriorityBadge priority={priority} />
                {value === priority ? <Icon name="check" className="h-3.5 w-3.5 [color:var(--kc-accent)]" /> : null}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

export const REMIND_OPTIONS: { label: string; value: number | null }[] = [
  { label: '不提醒', value: null },
  { label: '截止时', value: 0 },
  { label: '提前 30 分钟', value: 30 },
  { label: '提前 1 小时', value: 60 },
  { label: '提前 1 天', value: 1440 }
];

interface DueDatePickerProps {
  dueAt: Date | null;
  remindOffset: number | null;
  onChange: (dueAt: Date | null, remindOffset: number | null) => void;
}

export function DueDatePicker({ dueAt, remindOffset, onChange }: DueDatePickerProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => {
    const base = dueAt ?? new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const [hasTime, setHasTime] = useState(() => (dueAt ? !(dueAt.getHours() === 0 && dueAt.getMinutes() === 0) : true));
  const [timeStr, setTimeStr] = useState(() => (dueAt ? `${pad(dueAt.getHours())}:${pad(dueAt.getMinutes())}` : '18:00'));

  const cells = useMemo(() => {
    const first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
    const gridStart = new Date(first);
    gridStart.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + index);
      return date;
    });
  }, [viewMonth]);

  function emit(date: Date | null, nextHasTime: boolean, nextTime: string, nextRemind: number | null): void {
    if (!date) {
      onChange(null, null);
      return;
    }
    const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    if (nextHasTime) {
      const [h, m] = nextTime.split(':').map((value) => Number(value));
      result.setHours(Number.isFinite(h) ? h : 18, Number.isFinite(m) ? m : 0, 0, 0);
    } else {
      result.setHours(0, 0, 0, 0);
    }
    onChange(result, nextRemind);
  }

  function quick(kind: 'today' | 'tomorrow'): void {
    const date = new Date();
    if (kind === 'tomorrow') {
      date.setDate(date.getDate() + 1);
    }
    setViewMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    emit(date, hasTime, timeStr, remindOffset);
  }

  const isSameDay = (a: Date, b: Date | null): boolean =>
    Boolean(b) && a.getFullYear() === b!.getFullYear() && a.getMonth() === b!.getMonth() && a.getDate() === b!.getDate();
  const today = new Date();
  const label = dueAt ? formatDueLabel(dueAt.toISOString()) : '';

  return (
    <div className="relative inline-flex items-center gap-1">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition ${dueAt ? '[border-color:var(--kc-accent)] [color:var(--kc-accent)]' : '[border-color:var(--kc-border)] [color:var(--kc-muted)]'} hover:[background:var(--kc-hover)]`}
      >
        <Icon name="clock" className="h-3.5 w-3.5" />
        {dueAt ? <span>{label}</span> : <span>设置截止时间</span>}
        {remindOffset !== null && dueAt ? <Icon name="bell" className="h-3 w-3" /> : null}
      </button>
      {dueAt ? (
        <button type="button" onClick={() => onChange(null, null)} className="text-xs [color:var(--kc-muted)]">清除</button>
      ) : null}

      {open ? (
        <>
          <DismissLayer onDismiss={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-[61] mt-1 w-72 rounded-xl border p-3 shadow-lg [background:var(--kc-panel)] [border-color:var(--kc-border)]">
            <div className="mb-2 flex gap-2">
              <button type="button" onClick={() => quick('today')} className="flex-1 rounded-lg border py-1 text-xs [border-color:var(--kc-border)] hover:[background:var(--kc-hover)]">今天</button>
              <button type="button" onClick={() => quick('tomorrow')} className="flex-1 rounded-lg border py-1 text-xs [border-color:var(--kc-border)] hover:[background:var(--kc-hover)]">明天</button>
            </div>

            <div className="mb-1 flex items-center justify-between">
              <span className="text-sm font-medium [color:var(--kc-text)]">{viewMonth.getFullYear()}年 {viewMonth.getMonth() + 1}月</span>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))} className="grid h-6 w-6 place-items-center rounded-md hover:[background:var(--kc-hover)]"><Icon name="chevronLeft" className="h-4 w-4 [color:var(--kc-muted)]" /></button>
                <button type="button" onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))} className="grid h-6 w-6 place-items-center rounded-md hover:[background:var(--kc-hover)]"><Icon name="chevron" className="h-4 w-4 [color:var(--kc-muted)]" /></button>
              </div>
            </div>

            <div className="mb-1 grid grid-cols-7 text-center text-[11px] [color:var(--kc-muted)]">
              {WEEKDAYS.map((day) => <span key={day} className="py-1">{day}</span>)}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {cells.map((date, index) => {
                const inMonth = date.getMonth() === viewMonth.getMonth();
                const selected = isSameDay(date, dueAt);
                const isToday = isSameDay(date, today);
                return (
                  <button
                    key={index}
                    type="button"
                    onClick={() => emit(date, hasTime, timeStr, remindOffset)}
                    className={`grid h-8 place-items-center rounded-lg text-xs transition ${selected ? 'text-white [background:var(--kc-accent)]' : isToday ? '[color:var(--kc-accent)] [background:var(--kc-accent-soft)]' : inMonth ? '[color:var(--kc-text)] hover:[background:var(--kc-hover)]' : '[color:var(--kc-muted)] opacity-50 hover:[background:var(--kc-hover)]'}`}
                  >
                    {date.getDate()}
                  </button>
                );
              })}
            </div>

            <label className="mt-2 flex items-center gap-2 text-xs [color:var(--kc-text)]">
              <input
                type="checkbox"
                checked={hasTime}
                onChange={(event) => {
                  setHasTime(event.target.checked);
                  if (dueAt) {
                    emit(dueAt, event.target.checked, timeStr, remindOffset);
                  }
                }}
              />
              具体时间
              {hasTime ? (
                <input
                  type="time"
                  value={timeStr}
                  onChange={(event) => {
                    setTimeStr(event.target.value);
                    if (dueAt) {
                      emit(dueAt, true, event.target.value, remindOffset);
                    }
                  }}
                  className="ml-auto rounded-md border px-2 py-0.5 text-xs [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-text)]"
                />
              ) : null}
            </label>

            <div className="mt-2 flex items-center gap-2 text-xs">
              <Icon name="bell" className="h-3.5 w-3.5 [color:var(--kc-muted)]" />
              <span className="[color:var(--kc-muted)]">提醒</span>
              <select
                value={remindOffset === null ? '' : String(remindOffset)}
                onChange={(event) => {
                  const next = event.target.value === '' ? null : Number(event.target.value);
                  emit(dueAt, hasTime, timeStr, next);
                }}
                className="ml-auto rounded-md border px-2 py-0.5 text-xs [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-text)]"
              >
                {REMIND_OPTIONS.map((option) => (
                  <option key={option.label} value={option.value === null ? '' : String(option.value)}>{option.label}</option>
                ))}
              </select>
            </div>

            <div className="mt-3 flex justify-end">
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-1 text-xs font-medium text-white [background:var(--kc-accent)]">确定</button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
