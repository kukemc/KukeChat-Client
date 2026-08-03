import type { AccountSuspension } from '@/types/api';
import { formatChinaDateTime } from '@/utils/dateTime';
import { Icon } from '@/components/ui/Icon';

export function AccountSuspensionModal({ notice, onClose }: { notice: AccountSuspension; onClose: () => void }): JSX.Element {
  return (
    <div className="fixed inset-0 z-[2147483647] grid place-items-center bg-slate-950/35 p-5 backdrop-blur-md">
      <section role="alertdialog" aria-modal="true" aria-labelledby="account-suspension-title" className="w-full max-w-[430px] overflow-hidden rounded-[28px] border border-white/60 bg-white/95 shadow-[0_30px_90px_rgba(15,23,42,0.28)] backdrop-saturate-150">
        <div className="p-6 sm:p-7">
          <div className="grid h-12 w-12 place-items-center rounded-[18px] bg-red-50 text-red-500">
            <Icon name="shield" className="h-6 w-6" />
          </div>
          <h2 id="account-suspension-title" className="mt-5 text-[24px] font-black tracking-[-0.03em] text-slate-950">账号已被封禁</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">当前账号暂时无法登录或继续使用 KukeChat。</p>

          <div className="mt-5 grid gap-3 rounded-[20px] bg-slate-50 p-4">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">封禁原因</span>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm font-semibold leading-6 text-slate-800">{notice.reason?.trim() || '管理员未提供具体原因'}</p>
            </div>
            <div className="h-px bg-slate-200/80" />
            <div>
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">封禁期限</span>
              <p className="mt-1 text-sm font-black text-slate-900">{notice.permanent || !notice.banned_until ? '永久封禁' : `至 ${formatChinaDateTime(notice.banned_until)}（中国时间）`}</p>
            </div>
          </div>

          <button type="button" onClick={onClose} className="mt-6 h-12 w-full rounded-[17px] bg-slate-950 text-sm font-black text-white transition hover:bg-slate-800 active:scale-[0.99]">知道了</button>
        </div>
      </section>
    </div>
  );
}
