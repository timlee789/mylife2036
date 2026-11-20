/**
 * Project rules: the flow of four long-running projects until 2036.
 * This site plans the flow only: phases on a timeline, milestones, the next step.
 * The materials (episodes, photos, scripts, links) live in Obsidian.
 * Same spirit as My Life 2036: no scores, no streaks, no red. A quiet project is "resting";
 * a goal that was not reached can be moved or let go.
 */
import { randomUUID } from 'node:crypto';
import type { Query, Row } from './db';

export const KINDS = ['youtube', 'store', 'life', 'other'] as const;
export const PROJECT_STATUSES = ['active', 'resting', 'completed', 'archived'] as const;
export const PHASE_STATUSES = ['planned', 'active', 'done', 'paused'] as const;
export const MILESTONE_STATUSES = ['planned', 'reached', 'dropped'] as const;
export const PLAN_START_YEAR = 2026;
export const PLAN_END_YEAR = 2036;
export const TIMEZONE = 'America/New_York';

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
const invalid = (message: string) => new AppError(422, 'invalid_request', message);
const notFound = (what: string) => new AppError(404, 'not_found', `${what} does not exist`);

export function localToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function parseDay(value: unknown, field = 'date'): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw invalid(`${field} must be YYYY-MM-DD`);
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) throw invalid(`${field} is not a real date`);
  return value;
}

const dayOrNull = (value: unknown, field: string) => (value === null || value === undefined ? null : parseDay(value, field));

function title(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw invalid('title must not be blank');
  return value.trim();
}

/** Blank optional text is stored as NULL so the screen has one 'empty' to check. */
function clean(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw invalid('text expected');
  return value.trim() || null;
}

function text(value: unknown, field: string): string {
  if (typeof value !== 'string') throw invalid(`${field} must be text`);
  return value.trim();
}

function wholeNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) throw invalid(`${field} must be a whole number`);
  return value;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (!allowed.includes(value as T)) throw invalid(`invalid ${field}`);
  return value as T;
}

function notFuture(day: string | null, today: string, field: string) {
  if (day !== null && day > today) throw invalid(`${field} cannot be in the future`);
}

function rejectUnknown(fields: Record<string, unknown>, allowed: string[], what: string) {
  const unknown = Object.keys(fields).filter((k) => !allowed.includes(k));
  if (unknown.length) throw invalid(`unknown ${what} fields: ${unknown.sort().join(', ')}`);
}

async function projectRow(q: Query, id: string): Promise<Row> {
  const [row] = await q('SELECT * FROM projects WHERE id=$1', [id]);
  if (!row) throw notFound('project');
  return row;
}

// ---------------- projects ----------------

const PROJECT_TEXT = ['summary', 'purpose', 'current_focus', 'next_action'] as const;

export async function createProject(q: Query, input: Record<string, unknown>): Promise<string> {
  rejectUnknown(input, ['title', 'kind', 'vault_note', 'sort_order', ...PROJECT_TEXT], 'project');
  const id = randomUUID();
  await q(
    `INSERT INTO projects(id,title,kind,summary,purpose,current_focus,next_action,vault_note,sort_order)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      id,
      title(input.title),
      oneOf(input.kind, KINDS, 'project kind'),
      ...PROJECT_TEXT.map((k) => text(input[k] ?? '', k)),
      clean(input.vault_note),
      input.sort_order === undefined ? 0 : wholeNumber(input.sort_order, 'sort_order'),
    ],
  );
  return id;
}

/** Change only the fields given. Returns 'updated' or 'unchanged'. */
export async function updateProject(q: Query, id: string, fields: Record<string, unknown>): Promise<'updated' | 'unchanged'> {
  rejectUnknown(fields, ['title', 'kind', 'status', 'vault_note', 'sort_order', ...PROJECT_TEXT], 'project');
  const row = await projectRow(q, id);
  const changed: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(fields)) {
    let value: unknown;
    if (key === 'title') value = title(raw);
    else if (key === 'kind') value = oneOf(raw, KINDS, 'project kind');
    else if (key === 'status') value = oneOf(raw, PROJECT_STATUSES, 'project status');
    else if (key === 'vault_note') value = clean(raw);
    else if (key === 'sort_order') value = wholeNumber(raw, 'sort_order');
    else value = text(raw, key);
    if (row[key] !== value) changed[key] = value;
  }
  const keys = Object.keys(changed);
  if (!keys.length) return 'unchanged';
  await q(`UPDATE projects SET ${keys.map((k, i) => `${k}=$${i + 2}`).join(',')}, updated_at=now() WHERE id=$1`, [
    id,
    ...Object.values(changed),
  ]);
  return 'updated';
}

function parseMonth(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) throw invalid(`${field} must be YYYY-MM`);
  const year = Number(value.slice(0, 4));
  if (year < PLAN_START_YEAR || year > PLAN_END_YEAR) throw invalid(`${field} must be within ${PLAN_START_YEAR}–${PLAN_END_YEAR}`);
  return value;
}

async function phases(q: Query, projectId?: string): Promise<Row[]> {
  const where = projectId ? 'AND f.project_id=$1' : '';
  return q(
    `SELECT f.id,f.project_id,p.title AS project_title,p.kind AS project_kind,f.title,f.start_month,f.end_month,f.status,f.goal
     FROM project_phases f JOIN projects p ON p.id=f.project_id
     WHERE f.deleted_at IS NULL ${where}
     ORDER BY f.start_month, f.sort_order, f.created_at`,
    projectId ? [projectId] : [],
  );
}

async function milestones(q: Query, projectId?: string): Promise<Row[]> {
  const where = projectId ? 'WHERE m.project_id=$1' : '';
  return q(
    `SELECT m.id,m.project_id,p.title AS project_title,m.title,m.target_on,m.status,m.reached_on,m.note
     FROM project_milestones m JOIN projects p ON p.id=m.project_id ${where}
     ORDER BY m.target_on, m.created_at`,
    projectId ? [projectId] : [],
  );
}

function card(row: Row, projectPhases: Row[], projectMilestones: Row[], today: string) {
  const month = today.slice(0, 7);
  const now = projectPhases.filter((f) => f.status === 'active' || (f.status === 'planned' && (f.start_month as string) <= month && (f.end_month as string) >= month));
  const next = projectPhases.find((f) => f.status === 'planned' && (f.start_month as string) > month) ?? null;
  const goal = projectMilestones.find((m) => m.status === 'planned') ?? null;
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    summary: row.summary,
    purpose: row.purpose,
    status: row.status,
    current_focus: row.current_focus,
    next_action: row.next_action,
    vault_note: row.vault_note,
    sort_order: row.sort_order,
    now_phases: now.map((f) => ({ id: f.id, title: f.title, end_month: f.end_month })),
    next_phase: next && { id: next.id, title: next.title, start_month: next.start_month },
    next_milestone: goal && { id: goal.id, title: goal.title, target_on: goal.target_on },
  };
}

/** The home screen: where each project stands, the timeline, and the milestones ahead. */
export async function overview(q: Query, today = localToday()) {
  const rows = await q('SELECT * FROM projects ORDER BY sort_order, created_at');
  const allPhases = await phases(q);
  const allMilestones = await milestones(q);
  return {
    today,
    projects: rows.map((row) =>
      card(row, allPhases.filter((f) => f.project_id === row.id), allMilestones.filter((m) => m.project_id === row.id), today),
    ),
    phases: allPhases,
    milestones: allMilestones.filter((m) => m.status !== 'dropped'),
    upcoming_milestones: allMilestones.filter((m) => m.status === 'planned').slice(0, 8),
  };
}

export async function getProject(q: Query, id: string, today = localToday()) {
  const row = await projectRow(q, id);
  const projectPhases = await phases(q, id);
  const projectMilestones = await milestones(q, id);
  return { ...card(row, projectPhases, projectMilestones, today), today, phases: projectPhases, milestones: projectMilestones };
}

// ---------------- phases ----------------

const PHASE_FIELDS = ['title', 'start_month', 'end_month', 'status', 'goal', 'sort_order'];

export async function createPhase(q: Query, projectId: string, input: Record<string, unknown>): Promise<string> {
  rejectUnknown(input, PHASE_FIELDS, 'phase');
  await projectRow(q, projectId);
  const start = parseMonth(input.start_month, 'start_month');
  const end = input.end_month === undefined || input.end_month === null ? start : parseMonth(input.end_month, 'end_month');
  if (end < start) throw invalid('end_month must not be before start_month');
  const id = randomUUID();
  await q(
    'INSERT INTO project_phases(id,project_id,title,start_month,end_month,status,goal,sort_order) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
    [
      id,
      projectId,
      title(input.title),
      start,
      end,
      oneOf(input.status ?? 'planned', PHASE_STATUSES, 'phase status'),
      clean(input.goal),
      input.sort_order === undefined ? 0 : wholeNumber(input.sort_order, 'sort_order'),
    ],
  );
  return id;
}

/** Change only the fields given; null clears the goal. */
export async function updatePhase(q: Query, id: string, fields: Record<string, unknown>) {
  rejectUnknown(fields, PHASE_FIELDS, 'phase');
  const [row] = await q('SELECT * FROM project_phases WHERE id=$1 AND deleted_at IS NULL', [id]);
  if (!row) throw notFound('phase');
  const next: Record<string, unknown> = { ...row };
  for (const [key, raw] of Object.entries(fields)) {
    if (key === 'title') next.title = title(raw);
    else if (key === 'start_month' || key === 'end_month') next[key] = parseMonth(raw, key);
    else if (key === 'status') next.status = oneOf(raw, PHASE_STATUSES, 'phase status');
    else if (key === 'sort_order') next.sort_order = wholeNumber(raw, 'sort_order');
    else next.goal = clean(raw);
  }
  if ((next.end_month as string) < (next.start_month as string)) throw invalid('end_month must not be before start_month');
  const keys = PHASE_FIELDS.filter((k) => next[k] !== row[k]);
  if (!keys.length) return 'unchanged' as const;
  await q(`UPDATE project_phases SET ${keys.map((k, i) => `${k}=$${i + 2}`).join(',')}, updated_at=now() WHERE id=$1`, [
    id,
    ...keys.map((k) => next[k]),
  ]);
  return 'updated' as const;
}

/** Soft delete: the row stays in the database and the backup export. */
export async function deletePhase(q: Query, id: string): Promise<boolean> {
  const [row] = await q('SELECT deleted_at FROM project_phases WHERE id=$1', [id]);
  if (!row) throw notFound('phase');
  if (row.deleted_at !== null) return false;
  await q('UPDATE project_phases SET deleted_at=now(), updated_at=now() WHERE id=$1', [id]);
  return true;
}

// ---------------- milestones ----------------

function planDay(value: unknown): string {
  const day = parseDay(value, 'target_on');
  const year = Number(day.slice(0, 4));
  if (year < PLAN_START_YEAR || year > PLAN_END_YEAR) throw invalid(`target_on must be within ${PLAN_START_YEAR}–${PLAN_END_YEAR}`);
  return day;
}

export async function createMilestone(q: Query, projectId: string, input: Record<string, unknown>): Promise<string> {
  rejectUnknown(input, ['title', 'target_on', 'note'], 'milestone');
  await projectRow(q, projectId);
  const id = randomUUID();
  await q('INSERT INTO project_milestones(id,project_id,title,target_on,note) VALUES($1,$2,$3,$4,$5)', [
    id,
    projectId,
    title(input.title),
    planDay(input.target_on),
    clean(input.note),
  ]);
  return id;
}

/** 'reached' dates it today unless reached_on is given. Moving the date is always allowed. */
export async function updateMilestone(q: Query, id: string, fields: Record<string, unknown>, today = localToday()) {
  rejectUnknown(fields, ['title', 'target_on', 'status', 'reached_on', 'note'], 'milestone');
  const [row] = await q('SELECT * FROM project_milestones WHERE id=$1', [id]);
  if (!row) throw notFound('milestone');
  const next: Record<string, unknown> = { ...row };
  for (const [key, raw] of Object.entries(fields)) {
    if (key === 'title') next.title = title(raw);
    else if (key === 'target_on') next.target_on = planDay(raw);
    else if (key === 'status') next.status = oneOf(raw, MILESTONE_STATUSES, 'milestone status');
    else if (key === 'reached_on') next.reached_on = dayOrNull(raw, 'reached_on');
    else next.note = clean(raw);
  }
  next.reached_on = next.status === 'reached' ? (next.reached_on ?? today) : null;
  notFuture(next.reached_on as string | null, today, 'reached_on');
  const keys = ['title', 'target_on', 'status', 'reached_on', 'note'].filter((k) => next[k] !== row[k]);
  if (!keys.length) return 'unchanged' as const;
  await q(`UPDATE project_milestones SET ${keys.map((k, i) => `${k}=$${i + 2}`).join(',')}, updated_at=now() WHERE id=$1`, [
    id,
    ...keys.map((k) => next[k]),
  ]);
  return 'updated' as const;
}

/** Every row, including deleted phases and the first version's items and log, as a backup. */
export async function exportAll(q: Query) {
  const tables: Record<string, Row[]> = {};
  for (const t of ['projects', 'project_phases', 'project_milestones', 'project_items', 'project_log']) {
    tables[t] = await q(`SELECT * FROM ${t} ORDER BY created_at`);
  }
  return { app: 'mylife2036-projects', exported_at: new Date().toISOString(), tables };
}
