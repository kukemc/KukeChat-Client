import type { IconName } from '@/components/ui/Icon';
import type { TeamupSkill, TeamupSkillLevel } from '@/types/api';

export interface SkillMeta {
  key: TeamupSkill;
  label: string;
  icon: IconName;
}

export const SKILL_META: SkillMeta[] = [
  { key: 'program', label: '程序', icon: 'code' },
  { key: 'art', label: '美术', icon: 'image' },
  { key: 'design', label: '策划', icon: 'sparkles' },
  { key: 'music', label: '音乐音效', icon: 'volume' },
  { key: 'writing', label: '文案剧情', icon: 'quote' },
  { key: 'test', label: '测试', icon: 'shieldCheck' },
  { key: 'other', label: '其他', icon: 'star' }
];

const SKILL_MAP = new Map<TeamupSkill, SkillMeta>(SKILL_META.map((item) => [item.key, item]));

export function skillMeta(skill: TeamupSkill): SkillMeta {
  return SKILL_MAP.get(skill) ?? { key: skill, label: skill, icon: 'star' };
}

export function skillLabel(skill: TeamupSkill): string {
  return skillMeta(skill).label;
}

export const SKILL_LEVEL_LABEL: Record<TeamupSkillLevel, string> = {
  beginner: '入门',
  skilled: '熟练',
  expert: '精通'
};
