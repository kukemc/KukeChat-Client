import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import type { LevelTitleTier } from '@/types/api';
import { Dialog } from '../controls';
import { useInfo } from '../infoContext';
import { useGroupSettings } from '../infoData';

const MAX_TIERS = 12;
const MAX_LEVEL = 100;
const MAX_TITLE_LENGTH = 8;

interface DraftTier {
  key: number;
  minLevel: string;
  title: string;
}

/** 和服务端同一套规则，先在本地拦一遍，省得提交了才知道哪里不对。 */
function validate(tiers: DraftTier[]): string {
  const levels = tiers.map((tier) => Number(tier.minLevel));
  if (tiers.some((tier) => !tier.title.trim())) return '每一档都要填头衔。';
  if (levels.some((level) => !Number.isInteger(level) || level < 1 || level > MAX_LEVEL)) return `起始等级要在 1 到 ${MAX_LEVEL} 之间。`;
  if (new Set(levels).size !== levels.length) return '不能有两档从同一个等级开始。';
  if (!levels.includes(1)) return '必须有一档从 1 级开始。';
  return '';
}

/** 等级头衔分档：每一档从某个等级起生效，直到下一档开始。 */
export function LevelTitlesDialog(): JSX.Element {
  const { conversation, closeDialog } = useInfo();
  const settings = useGroupSettings();
  const [tiers, setTiers] = useState<DraftTier[]>(() => (conversation.level_titles ?? []).map((tier, index) => ({ key: index, minLevel: String(tier.min_level), title: tier.title })));
  const [nextKey, setNextKey] = useState(tiers.length);
  const [error, setError] = useState('');
  const sorted = [...tiers].sort((left, right) => Number(left.minLevel) - Number(right.minLevel));

  const update = (key: number, patch: Partial<DraftTier>): void => {
    setError('');
    setTiers((current) => current.map((tier) => (tier.key === key ? { ...tier, ...patch } : tier)));
  };

  function addTier(): void {
    // 新的一档默认接在最高一档后面 10 级
    const highest = Math.max(0, ...tiers.map((tier) => Number(tier.minLevel) || 0));
    setTiers((current) => [...current, { key: nextKey, minLevel: String(Math.min(MAX_LEVEL, highest ? highest + 10 : 1)), title: '' }]);
    setNextKey((key) => key + 1);
    setError('');
  }

  function save(next: LevelTitleTier[]): void {
    // 等服务端收下再关：被文本审核拦下时要留在这里改
    settings.save({ level_titles: next }, undefined, closeDialog);
  }

  function submit(): void {
    const problem = validate(tiers);
    if (problem) {
      setError(problem);
      return;
    }
    save(sorted.map((tier) => ({ min_level: Number(tier.minLevel), title: tier.title.trim() })));
  }

  return (
    <Dialog
      title="等级头衔"
      onClose={closeDialog}
      footer={(
        <>
          <button type="button" className="kui-btn kui-btn--ghost" style={{ marginRight: 'auto' }} disabled={settings.pending} onClick={() => {
            if (window.confirm('恢复成默认的头衔分档吗？现在的设置会被替换。')) {
              save([]);
            }
          }}>恢复默认</button>
          <button type="button" className="kui-btn" onClick={closeDialog}>取消</button>
          <button type="button" className="kui-btn kui-btn--primary" disabled={settings.pending || tiers.length === 0} onClick={submit}>保存</button>
        </>
      )}
    >
      <p className="kci-hint">每一档从填写的等级开始生效，一直到下一档为止。最高 {MAX_LEVEL} 级，最多 {MAX_TIERS} 档。</p>
      <div className="kci-tiers">
        {sorted.map((tier, index) => {
          const next = sorted[index + 1];
          const from = Number(tier.minLevel) || 0;
          const to = next ? (Number(next.minLevel) || 0) - 1 : MAX_LEVEL;
          return (
            <div key={tier.key} className="kci-tier">
              <span>LV</span>
              <input className="kui-input" inputMode="numeric" aria-label="起始等级" value={tier.minLevel} onChange={(event) => update(tier.key, { minLevel: event.target.value.replace(/\D/g, '').slice(0, 3) })} />
              <span className="kci-tier-range">{to > from ? `– ${to}` : ''}</span>
              <input className="kui-input" aria-label="头衔" placeholder="头衔" maxLength={MAX_TITLE_LENGTH} value={tier.title} onChange={(event) => update(tier.key, { title: event.target.value })} />
              <button type="button" className="kui-icon-btn" aria-label="删除这一档" disabled={tiers.length <= 1} onClick={() => {
                setError('');
                setTiers((current) => current.filter((item) => item.key !== tier.key));
              }}><Icon name="trash" className="h-4 w-4" /></button>
            </div>
          );
        })}
      </div>
      {error ? <p className="kui-note kui-note--danger" role="alert">{error}</p> : null}
      <div><button type="button" className="kui-btn kui-btn--sm" disabled={tiers.length >= MAX_TIERS} onClick={addTier}><Icon name="plus" className="h-3.5 w-3.5" />添加一档</button></div>
    </Dialog>
  );
}
