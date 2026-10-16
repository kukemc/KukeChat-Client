import { useState } from 'react';
import { Card, Notice, Toggle, btn, inputClass } from '@/components/settings/desktop/settingsUi';
import { birthdayYears, chinaToday, clampBirthdayDay, daysInMonth, DEFAULT_BIRTHDAY, formatBirthday, isValidBirthday } from '@/utils/birthday';
import { describeBirthdayError, useClearBirthday, useMyBirthday, useSaveBirthday } from './data';

interface Draft {
  year: number;
  month: number;
  day: number;
  showYear: boolean;
}

/** 生日设置的状态和动作，桌面和移动两套界面共用。 */
function useBirthdayForm() {
  const query = useMyBirthday();
  const mine = query.data;
  const save = useSaveBirthday();
  const clear = useClearBirthday();
  // 没动过就跟着已保存的值走；没填过的停在默认的那一天（2008-05-07）
  const [draft, setDraft] = useState<Draft | null>(null);
  const [now] = useState(() => Date.now());
  const saved: Draft = mine?.birthday ? { ...mine.birthday, showYear: mine.show_year } : { ...DEFAULT_BIRTHDAY, showYear: false };
  const current = draft ?? saved;
  const hasBirthday = Boolean(mine?.birthday);
  const dateChanged = !hasBirthday || current.year !== saved.year || current.month !== saved.month || current.day !== saved.day;
  const dirty = dateChanged || current.showYear !== saved.showYear;
  const valid = isValidBirthday(current.year, current.month, current.day, now);
  const pending = save.isPending || clear.isPending;
  const canSave = dirty && valid && !pending;

  const edit = (patch: Partial<Draft>): void => {
    const next = { ...current, ...patch };
    next.day = clampBirthdayDay(next.year, next.month, next.day);
    setDraft(next);
    save.reset();
    clear.reset();
  };

  return {
    query,
    mine,
    current,
    hasBirthday,
    dirty,
    valid,
    pending,
    canSave,
    saved: save.isSuccess && !dirty,
    error: save.error ? describeBirthdayError(save.error) : clear.error ? describeBirthdayError(clear.error) : null,
    years: birthdayYears(now),
    days: Array.from({ length: daysInMonth(current.year, current.month) }, (_, index) => index + 1),
    thisYear: chinaToday(now).year,
    edit,
    submit: (): void => {
      if (canSave) {
        save.mutate({ year: current.year, month: current.month, day: current.day, show_year: current.showYear }, { onSuccess: () => setDraft(null) });
      }
    },
    remove: (): void => {
      if (!pending && hasBirthday) {
        clear.mutate(undefined, { onSuccess: () => setDraft(null) });
      }
    }
  };
}

/** 别人能看到什么：跟着「公开出生年份」的开关和现在选的日期变。 */
function visibilityText(draft: Draft): string {
  const date = formatBirthday({ month: draft.month, day: draft.day, year: null });
  return draft.showYear
    ? `别人在你的资料卡和个人主页上会看到「${formatBirthday(draft)}」，能算出你的年龄。`
    : `别人在你的资料卡和个人主页上只会看到「${date}」，看不到你是哪一年出生的。`;
}

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);

/**
 * 设置里的「生日」。年 / 月 / 日三个选择框（没填过默认停在 2008-05-07）、「公开出生年份」开关（默认关）、保存和清空。
 * 生日当天打开应用会放一段庆生动画，好友会看到「今天生日」；这些都写在说明里，免得填的人不知道会发生什么。
 * 日期随时可以改、随时可以清空，没有次数限制。
 * 这一项自己保存，不跟资料页底部的保存走。服务端没有生日功能（接口 404）、或者还没拿到时整块不出现。
 *
 *   variant="desktop"  设置 → 我的资料 里的一张卡片
 *   variant="mobile"   手机「账号资料」页里的一块
 */
export function BirthdaySetting({ variant }: { variant: 'desktop' | 'mobile' }): JSX.Element | null {
  const form = useBirthdayForm();
  if (!form.mine) {
    return null;
  }
  const { current } = form;
  const mobile = variant === 'mobile';
  const selectClass = mobile ? 'kc-qq-input kbd-select' : `${inputClass} kbd-select`;
  const selects = (
    <div className="kbd-date" data-birthday="date">
      <label className="kbd-date-field"><span>年</span>
        <select className={selectClass} data-field="year" aria-label="出生年份" value={current.year} disabled={form.pending} onChange={(event) => form.edit({ year: Number(event.target.value) })}>
          {form.years.map((year) => <option key={year} value={year}>{year}</option>)}
        </select>
      </label>
      <label className="kbd-date-field"><span>月</span>
        <select className={selectClass} data-field="month" aria-label="出生月份" value={current.month} disabled={form.pending} onChange={(event) => form.edit({ month: Number(event.target.value) })}>
          {MONTHS.map((month) => <option key={month} value={month}>{month}</option>)}
        </select>
      </label>
      <label className="kbd-date-field"><span>日</span>
        <select className={selectClass} data-field="day" aria-label="出生日" value={current.day} disabled={form.pending} onChange={(event) => form.edit({ day: Number(event.target.value) })}>
          {form.days.map((day) => <option key={day} value={day}>{day}</option>)}
        </select>
      </label>
    </div>
  );
  const invalidNote = !form.valid ? (current.year === form.thisYear ? '这个日期还没到，生日不能填在未来。' : '这个日期不对。') : null;
  const status = form.mine.birthday ? `已填：${formatBirthday(form.mine.birthday)}` : '还没有填';

  if (mobile) {
    return (
      <section className="kc-qq-card kbd-setting kbd-setting--mobile grid gap-3 p-4" data-birthday="setting">
        <div>
          <p className="kc-qq-section-title">生日</p>
          <p className="kbd-setting-desc">生日当天打开 KukeChat 会有一段庆生动画，好友也会看到「今天生日」。{status}。</p>
        </div>
        {selects}
        <div className="kbd-switch-row">
          <span className="min-w-0 flex-1"><span className="kbd-switch-title">公开出生年份</span><span className="kbd-switch-desc" data-birthday="visibility">{visibilityText(current)}</span></span>
          <Toggle checked={current.showYear} disabled={form.pending} label="公开出生年份" onChange={(showYear) => form.edit({ showYear })} />
        </div>
        {invalidNote ? <p className="kbd-setting-error" role="alert">{invalidNote}</p> : null}
        {form.error ? <p className="kbd-setting-error" role="alert" data-birthday="error">{form.error}</p> : null}
        {form.saved ? <p className="kbd-setting-ok" role="status">生日已保存。</p> : null}
        <div className="kbd-setting-actions">
          {form.hasBirthday ? <button type="button" className="kbd-m-btn" data-action="birthday-clear" disabled={form.pending} onClick={form.remove}>清空</button> : null}
          <button type="button" className="kbd-m-btn is-primary" data-action="birthday-save" disabled={!form.canSave} onClick={form.submit}>{form.pending ? '保存中…' : '保存生日'}</button>
        </div>
      </section>
    );
  }

  return (
    <div data-birthday="setting" className="kbd-setting">
      <Card title="生日" description={`生日当天打开 KukeChat 会有一段庆生动画，好友也会看到「今天生日」。${status}。`} padded>
        <div className="grid gap-3">
          {selects}
          <div className="kbd-switch-row">
            <span className="min-w-0 flex-1"><span className="kbd-switch-title">公开出生年份</span><span className="kbd-switch-desc" data-birthday="visibility">{visibilityText(current)}</span></span>
            <Toggle checked={current.showYear} disabled={form.pending} label="公开出生年份" onChange={(showYear) => form.edit({ showYear })} />
          </div>
          {invalidNote ? <Notice tone="error">{invalidNote}</Notice> : null}
          {form.error ? <Notice tone="error"><span data-birthday="error">{form.error}</span></Notice> : null}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {form.saved ? <span className="mr-auto text-xs [color:var(--kc-muted)]">已保存</span> : null}
            {form.hasBirthday ? <button type="button" className={btn.ghost} data-action="birthday-clear" disabled={form.pending} onClick={form.remove}>清空生日</button> : null}
            <button type="button" className={btn.primary} data-action="birthday-save" disabled={!form.canSave} onClick={form.submit}>{form.pending ? '保存中…' : '保存'}</button>
          </div>
        </div>
      </Card>
    </div>
  );
}
