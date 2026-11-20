import type { MilestoneStatus, PhaseStatus, ProjectKind, ProjectStatus } from './api';

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

export const PHASE_NAMES: Record<PhaseStatus, string> = {
  planned: '예정',
  active: '진행 중',
  done: '마침',
  paused: '쉬는 중',
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

/** "2026년 12월 – 2027년 3월", or one month when start and end are the same. */
export function monthRange(start: string, end: string): string {
  if (start === end) return monthOf(start);
  const [sy] = start.split('-');
  const [ey, em] = end.split('-').map(Number);
  return sy === String(ey) ? `${monthOf(start)} – ${em}월` : `${monthOf(start)} – ${monthOf(end)}`;
}

/** Months since year 0, so ranges can be laid out on one axis. */
export function monthIndex(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return y * 12 + (m - 1);
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
