import type { JuryMembership } from '@/types/jury';

export type ApplyOutlook = 'appoint' | 'review_record' | 'review';

/**
 * 提交申请之后大概会怎样（docs/jury-v2.md 2.2）。自动任命（auto_appoint）只对通过了考试、
 * 而且「没有成员记录」或「已经在审批队列里」的人生效；被拒绝过、卸任过、任期届满的人考过之后仍然进审批队列。
 * 这里只用来写提交之前的提示；提交之后界面一律以接口返回的状态为准，不靠这个推断。
 */
export function applyOutlook(membership: JuryMembership, autoAppoint: boolean, passed: boolean): ApplyOutlook {
  if (!autoAppoint || !passed) {
    return 'review';
  }
  return membership === 'none' || membership === 'applied' ? 'appoint' : 'review_record';
}

export const APPLY_OUTLOOK_TEXT: Record<ApplyOutlook, string> = {
  appoint: '提交后直接任命为见习委员',
  review_record: '你之前有过申请或任职记录，提交后仍由管理员审批',
  review: '提交后由管理员审批'
};
