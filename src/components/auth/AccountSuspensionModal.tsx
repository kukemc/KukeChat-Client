import { useState } from 'react';
import type { AccountSuspension } from '@/types/api';
import { PenaltyCenterModal } from '@/components/moderation/PenaltyCenter';
import { formatChinaDateTime } from '@/utils/dateTime';
import { Icon } from '@/components/ui/Icon';
import { useKukeStore } from '@/store/kukeStore';

export function AccountSuspensionModal({ notice, onClose }: { notice: AccountSuspension; onClose: () => void }): JSX.Element {
  const [showPenalties, setShowPenalties] = useState(false);
  const isMobile = useKukeStore((state) => state.layoutMode === 'mobile');
  if (showPenalties && notice.appeal_token) {
    return <PenaltyCenterModal token={notice.appeal_token} onClose={() => setShowPenalties(false)} />;
  }
  // 设备封禁（换账号也登不上）和账号封禁共用这一层，只换措辞
  const isDevice = notice.code === 'device_banned';
  const copy = isDevice
    ? { title: '此设备已被限制使用', text: '这台设备暂时无法登录或继续使用 KukeChat，换账号登录也一样。', reasonLabel: '限制原因', periodLabel: '限制期限', permanent: '永久限制' }
    : { title: '账号已被封禁', text: '当前账号暂时无法登录或继续使用 KukeChat。', reasonLabel: '封禁原因', periodLabel: '封禁期限', permanent: '永久封禁' };
  const reason = notice.reason?.trim() || '管理员未提供具体原因';
  const period = notice.permanent || !notice.banned_until ? copy.permanent : `至 ${formatChinaDateTime(notice.banned_until)}（中国时间）`;
  if (!isMobile) {
    return (
      <div className="kau-overlay kau-overlay--top">
        <section role="alertdialog" aria-modal="true" aria-labelledby="account-suspension-title" className="kau-dialog kau-suspension kui-scroll">
          <span className="kau-suspension-mark"><Icon name="shield" className="h-6 w-6" /></span>
          <h2 id="account-suspension-title">{copy.title}</h2>
          <p className="kau-dialog-text">{copy.text}</p>
          <dl>
            <dt>{copy.reasonLabel}</dt>
            <dd>{reason}</dd>
            <dt>{copy.periodLabel}</dt>
            <dd>{period}</dd>
          </dl>
          {notice.appeal_token ? <button type="button" className="kau-btn kau-btn--outline kau-btn--block" onClick={() => setShowPenalties(true)}>查看处罚并申诉</button> : null}
          <button type="button" className="kau-btn kau-btn--dark kau-btn--block" onClick={onClose}>知道了</button>
        </section>
      </div>
    );
  }
  return (
    <div className="fixed inset-0 z-[2147483647] grid place-items-center bg-slate-950/35 p-5 backdrop-blur-md">
      <section role="alertdialog" aria-modal="true" aria-labelledby="account-suspension-title" className="w-full max-w-[430px] overflow-hidden rounded-[28px] border border-white/60 bg-white/95 shadow-[0_30px_90px_rgba(15,23,42,0.28)] backdrop-saturate-150">
        <div className="p-6 sm:p-7">
          <div className="grid h-12 w-12 place-items-center rounded-[18px] bg-red-50 text-red-500">
            <Icon name="shield" className="h-6 w-6" />
          </div>
          <h2 id="account-suspension-title" className="mt-5 text-[24px] font-black tracking-[-0.03em] text-slate-950">{copy.title}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">{copy.text}</p>

          <div className="mt-5 grid gap-3 rounded-[20px] bg-slate-50 p-4">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{copy.reasonLabel}</span>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm font-semibold leading-6 text-slate-800">{reason}</p>
            </div>
            <div className="h-px bg-slate-200/80" />
            <div>
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{copy.periodLabel}</span>
              <p className="mt-1 text-sm font-black text-slate-900">{period}</p>
            </div>
          </div>

          {notice.appeal_token ? <button type="button" onClick={() => setShowPenalties(true)} className="mt-6 h-12 w-full rounded-[17px] border border-slate-200 text-sm font-black text-slate-800 transition hover:bg-slate-50 active:scale-[0.99]">查看处罚并申诉</button> : null}
          <button type="button" onClick={onClose} className="mt-3 h-12 w-full rounded-[17px] bg-slate-950 text-sm font-black text-white transition hover:bg-slate-800 active:scale-[0.99]">知道了</button>
        </div>
      </section>
    </div>
  );
}
