/** 处罚、举报额度相关的接口类型。字段含义以 KukeChat-Server 的 docs/moderation-v2.md 为准。风纪委员的类型在 ./jury.ts。 */

export type PenaltyKind = 'none' | 'notice' | 'warning' | 'mute' | 'ban';
export type AppealStatus = 'none' | 'pending' | 'accepted' | 'rejected';

export interface ViolationRead {
  id: number;
  category: string;
  category_label: string;
  /** 0–4；0 表示只处理内容不记分 */
  level: number;
  points: number;
  points_total: number;
  source: 'auto' | 'report' | 'jury' | 'admin';
  target_type?: string | null;
  target_id?: number | null;
  conversation_id?: number | null;
  summary?: string | null;
  status: 'active' | 'revoked';
  penalty_kind: PenaltyKind;
  penalty_ends_at?: string | null;
  penalty_permanent?: boolean;
  under_review?: boolean;
  appeal_status: AppealStatus;
  /** 处理申诉的人写的说明 */
  appeal_note?: string | null;
  // —— 风纪 v2 三期（docs/jury-v2.md 3.2）：申诉走到哪一步、谁裁决的。旧后端没有这三个字段 ——
  /** senior 资深委员复审中 / admin 等管理员处理 */
  appeal_stage?: 'senior' | 'admin' | (string & {}) | null;
  /** upheld 维持 / reduced 减轻（保留记录，解除禁言或封禁）/ revoked 撤销 */
  appeal_result?: 'upheld' | 'reduced' | 'revoked' | (string & {}) | null;
  appeal_decided_by?: 'senior' | 'admin' | (string & {}) | null;
  can_appeal: boolean;
  created_at: string;
  expires_at?: string | null;
}

export interface ModerationBan {
  reason?: string | null;
  banned_until?: string | null;
  permanent?: boolean;
}

export interface ModerationStanding {
  points: number;
  point_window_days: number;
  muted_until: string | null;
  mute_reason?: string | null;
  next_threshold: number | null;
  next_penalty: string | null;
  ban?: ModerationBan | null;
  violations?: ViolationRead[];
}

export interface ModerationRules {
  point_window_days: number;
  categories: Array<{ key: string; label: string; level: number }>;
  levels: Array<{ level: number; points: number; penalty: string }>;
  ladder: Array<{ threshold: number; penalty: string }>;
}

export interface ReportOptions {
  reasons: Array<{ reason: string; details_required: boolean }>;
  details_min_length: number;
  max_evidence_messages: number;
  max_attachments: number;
}

export interface ReportQuota {
  daily_quota: number;
  used_today: number;
  remaining_today: number;
}
