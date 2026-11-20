import type { MilestoneStatus, ProjectKind, ProjectStatus, StepStatus, SubStatus } from './api';

export const KIND_NAMES: Record<ProjectKind, string> = {
  youtube: 'YouTube',
  store: '매장 SNS',
  life: '삶 기획',
  other: '기타',
};

export const STATUS_NAMES: Record<ProjectStatus, string> = {
  active: '진행 중',
  resting: '쉬는 중',
  completed: '마침',
  archived: '보관',
};

export const SUB_NAMES: Record<SubStatus, string> = {
  planned: '예정',
  active: '진행 중',
  done: '마침',
  paused: '쉬는 중',
};

export const STEP_NAMES: Record<StepStatus, string> = {
  todo: '할 일',
  doing: '진행 중',
  done: '완료',
  skipped: '건너뜀',
};

export const MILESTONE_NAMES: Record<MilestoneStatus, string> = {
  planned: '가는 중',
  reached: '달성',
  dropped: '내려놓음',
};

// Obsidian opens a note from this address when the vault is registered in the Obsidian app.
export const VAULT_NAME = 'AIFilmStudio';

export function obsidianLink(note: string): string {
  return `obsidian://open?vault=${encodeURIComponent(VAULT_NAME)}&file=${encodeURIComponent(note)}`;
}

export const PLAN_END = '2036-11-09';
export const FIRST_YEAR = 2026;
export const LAST_YEAR = 2036;

export function shortDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const thisYear = new Date().getFullYear();
  return y === thisYear ? `${m}월 ${d}일` : `${y}년 ${m}월 ${d}일`;
}

export function monthOf(day: string): string {
  const [y, m] = day.split('-').map(Number);
  return `${y}년 ${m}월`;
}

/** Days since 1970-01-01, so every timeline lays dates out on one axis. */
export function dayNumber(day: string): number {
  return Date.parse(`${day}T00:00:00Z`) / 86_400_000;
}

export function fromDayNumber(n: number): string {
  return new Date(n * 86_400_000).toISOString().slice(0, 10);
}

export function addDays(day: string, n: number): string {
  return fromDayNumber(dayNumber(day) + n);
}

export function dateRange(start: string, end: string): string {
  return start === end ? shortDay(start) : `${shortDay(start)} – ${shortDay(end)}`;
}

/** "3일" or "2주" style length of an inclusive date range. */
export function lengthOf(start: string, end: string): string {
  const days = dayNumber(end) - dayNumber(start) + 1;
  return days % 7 === 0 ? `${days / 7}주` : `${days}일`;
}

/** "9년 11개월": time left until the plan's last day, counted in whole months. */
export function timeLeft(today: string): string {
  const [ty, tm, td] = today.split('-').map(Number);
  const [ey, em, ed] = PLAN_END.split('-').map(Number);
  let months = (ey - ty) * 12 + (em - tm) - (ed < td ? 1 : 0);
  if (months <= 0) return '마지막 달';
  const years = Math.floor(months / 12);
  months %= 12;
  return [years ? `${years}년` : '', months ? `${months}개월` : ''].filter(Boolean).join(' ');
}
