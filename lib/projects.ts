/**
 * Project rules: the flow of Tim's top projects until 2036.
 * Top project (규영, 책에게 묻다) -> projects (「죽음의 수용소에서」) -> steps of the top project's procedure.
 * Each project has its own timeline and progress; the top project shows its projects on a longer timeline.
 * This site plans the flow only.
 * The materials (episodes, photos, scripts, links) live in Obsidian.
 * Same spirit as My Life 2036: no scores, no streaks, no red. A quiet project is "resting";
 * a goal that was not reached can be moved or let go.
 */
import { randomUUID } from 'node:crypto';
import type { Query, Row } from './db';

export const KINDS = ['youtube', 'store', 'life', 'other'] as const;
export const PROJECT_STATUSES = ['active', 'resting', 'completed', 'archived'] as const;
export const SUB_STATUSES = ['planned', 'active', 'done', 'paused'] as const;
export const STEP_STATUSES = ['todo', 'doing', 'done', 'skipped'] as const;
const MAX_STEPS = 40;
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

// ---------------- dates ----------------

const DAY = 86_400_000;
export const dayNumber = (day: string) => Date.parse(`${day}T00:00:00Z`) / DAY;
export const addDays = (day: string, n: number) => new Date((dayNumber(day) + n) * DAY).toISOString().slice(0, 10);

function planDate(value: unknown, field: string): string {
  const day = parseDay(value, field);
  const year = Number(day.slice(0, 4));
  if (year < PLAN_START_YEAR || year > PLAN_END_YEAR) throw invalid(`${field} must be within ${PLAN_START_YEAR}–${PLAN_END_YEAR}`);
  return day;
}

// ---------------- procedure (the top project's standard steps) ----------------

export async function getProcedure(q: Query, projectId: string): Promise<Row[]> {
  return q('SELECT id,position,title,days FROM procedure_steps WHERE project_id=$1 ORDER BY position', [projectId]);
}

/** Replace the whole procedure. Projects already made keep their own copy of the steps. */
export async function setProcedure(q: Query, projectId: string, steps: unknown): Promise<Row[]> {
  await projectRow(q, projectId);
  if (!Array.isArray(steps) || steps.length > MAX_STEPS) throw invalid(`steps must be a list of at most ${MAX_STEPS}`);
  const clean = steps.map((step, i) => {
    if (!step || typeof step !== 'object') throw invalid('each step needs a title and days');
    const { title: t, days } = step as Record<string, unknown>;
    const d = wholeNumber(days ?? 3, 'days');
    if (d < 1 || d > 365) throw invalid('days must be 1–365');
    return { position: i + 1, title: title(t), days: d };
  });
  // One statement: the old procedure is replaced in full or not at all.
  await q(
    `WITH gone AS (DELETE FROM procedure_steps WHERE project_id=$1)
     INSERT INTO procedure_steps(id,project_id,position,title,days)
     SELECT gen_random_uuid()::text, $1, u.position, u.title, u.days
     FROM unnest($2::int[], $3::text[], $4::int[]) AS u(position,title,days)`,
    [projectId, clean.map((c) => c.position), clean.map((c) => c.title), clean.map((c) => c.days)],
  );
  return getProcedure(q, projectId);
}

// ---------------- projects under a top project ----------------

async function subRow(q: Query, id: string): Promise<Row> {
  const [row] = await q('SELECT * FROM subprojects WHERE id=$1 AND deleted_at IS NULL', [id]);
  if (!row) throw notFound('subproject');
  return row;
}

async function stepsOf(q: Query, subIds: string[]): Promise<Map<string, Row[]>> {
  const map = new Map<string, Row[]>(subIds.map((id) => [id, []]));
  if (!subIds.length) return map;
  const rows = await q(
    `SELECT id,subproject_id,position,title,start_on,end_on,status,done_on,note FROM subproject_steps
     WHERE subproject_id = ANY($1::text[]) AND deleted_at IS NULL ORDER BY position`,
    [subIds],
  );
  for (const r of rows) map.get(r.subproject_id as string)!.push(r);
  return map;
}

/** Progress counts every step except skipped ones. */
function progress(steps: Row[]) {
  const counted = steps.filter((s) => s.status !== 'skipped');
  const done = counted.filter((s) => s.status === 'done').length;
  const current = steps.find((s) => s.status === 'doing') ?? steps.find((s) => s.status === 'todo') ?? null;
  return {
    steps_done: done,
    steps_total: counted.length,
    percent: counted.length ? Math.round((done / counted.length) * 100) : null,
    current_step: current && { id: current.id, title: current.title, start_on: current.start_on, end_on: current.end_on, status: current.status },
  };
}

function subView(row: Row, steps: Row[]) {
  const lastEnd = steps.reduce((m, s) => ((s.end_on as string) > m ? (s.end_on as string) : m), row.due_on as string);
  return {
    id: row.id,
    project_id: row.project_id,
    title: row.title,
    status: row.status,
    start_on: row.start_on as string,
    due_on: row.due_on as string,
    end_on: lastEnd, // where the bar ends: the target date or a later scheduled step
    done_on: row.done_on,
    vault_note: row.vault_note,
    sort_order: row.sort_order,
    ...progress(steps),
  };
}

async function subprojectsOf(q: Query, projectId?: string) {
  const rows = await q(
    `SELECT * FROM subprojects WHERE deleted_at IS NULL ${projectId ? 'AND project_id=$1' : ''}
     ORDER BY start_on, sort_order, created_at`,
    projectId ? [projectId] : [],
  );
  const steps = await stepsOf(q, rows.map((r) => r.id as string));
  return rows.map((r) => subView(r, steps.get(r.id as string)!));
}

function scheduleFrom(start: string, procedure: Row[]) {
  let cursor = start;
  return procedure.map((p, i) => {
    const s = cursor;
    const e = addDays(s, Number(p.days) - 1);
    cursor = addDays(e, 1);
    return { position: i + 1, title: p.title as string, start_on: s, end_on: e };
  });
}

async function insertSteps(q: Query, subId: string, steps: { position: number; title: string; start_on: string; end_on: string }[]) {
  if (!steps.length) return;
  await q(
    `INSERT INTO subproject_steps(id,subproject_id,position,title,start_on,end_on)
     SELECT gen_random_uuid()::text, $1, u.position, u.title, u.s, u.e
     FROM unnest($2::int[], $3::text[], $4::text[], $5::text[]) AS u(position,title,s,e)`,
    [subId, steps.map((x) => x.position), steps.map((x) => x.title), steps.map((x) => x.start_on), steps.map((x) => x.end_on)],
  );
}

/**
 * A new project under a top project. Its steps are copied from the procedure and laid out one
 * after another from the start date; the target date defaults to the end of the last step.
 */
export async function createSubproject(q: Query, projectId: string, input: Record<string, unknown>, today = localToday()) {
  rejectUnknown(input, ['title', 'start_on', 'due_on', 'use_procedure', 'vault_note'], 'subproject');
  await projectRow(q, projectId);
  const start = planDate(input.start_on ?? today, 'start_on');
  const steps = input.use_procedure === false ? [] : scheduleFrom(start, await getProcedure(q, projectId));
  const due = input.due_on === undefined || input.due_on === null ? (steps.at(-1)?.end_on ?? start) : planDate(input.due_on, 'due_on');
  if (due < start) throw invalid('due_on must not be before start_on');
  const id = randomUUID();
  await q('INSERT INTO subprojects(id,project_id,title,start_on,due_on,vault_note) VALUES($1,$2,$3,$4,$5,$6)', [
    id,
    projectId,
    title(input.title),
    start,
    due,
    clean(input.vault_note),
  ]);
  await insertSteps(q, id, steps);
  return id;
}

/** Add the procedure's steps to a project that has none yet (e.g. one made before the procedure). */
export async function applyProcedure(q: Query, subId: string) {
  const sub = await subRow(q, subId);
  const [{ n }] = await q('SELECT count(*)::int AS n FROM subproject_steps WHERE subproject_id=$1 AND deleted_at IS NULL', [subId]);
  if (Number(n) > 0) throw invalid('this project already has steps');
  const steps = scheduleFrom(sub.start_on as string, await getProcedure(q, sub.project_id as string));
  if (!steps.length) throw invalid('the top project has no procedure yet');
  await insertSteps(q, subId, steps);
  return steps.length;
}

export async function updateSubproject(q: Query, id: string, fields: Record<string, unknown>, today = localToday()) {
  rejectUnknown(fields, ['title', 'status', 'start_on', 'due_on', 'vault_note', 'sort_order'], 'subproject');
  const row = await subRow(q, id);
  const next: Record<string, unknown> = { ...row };
  for (const [key, raw] of Object.entries(fields)) {
    if (key === 'title') next.title = title(raw);
    else if (key === 'status') next.status = oneOf(raw, SUB_STATUSES, 'subproject status');
    else if (key === 'start_on' || key === 'due_on') next[key] = planDate(raw, key);
    else if (key === 'sort_order') next.sort_order = wholeNumber(raw, 'sort_order');
    else next.vault_note = clean(raw);
  }
  if ((next.due_on as string) < (next.start_on as string)) throw invalid('due_on must not be before start_on');
  next.done_on = next.status === 'done' ? (row.done_on ?? today) : null;
  const keys = ['title', 'status', 'start_on', 'due_on', 'done_on', 'vault_note', 'sort_order'].filter((k) => next[k] !== row[k]);
  if (!keys.length) return 'unchanged' as const;
  await q(`UPDATE subprojects SET ${keys.map((k, i) => `${k}=$${i + 2}`).join(',')}, updated_at=now() WHERE id=$1`, [
    id,
    ...keys.map((k) => next[k]),
  ]);
  return 'updated' as const;
}

/** Soft delete: the project and its steps stay in the backup export. */
export async function deleteSubproject(q: Query, id: string): Promise<boolean> {
  const [row] = await q('SELECT deleted_at FROM subprojects WHERE id=$1', [id]);
  if (!row) throw notFound('subproject');
  if (row.deleted_at !== null) return false;
  await q('UPDATE subprojects SET deleted_at=now(), updated_at=now() WHERE id=$1', [id]);
  return true;
}

export async function getSubproject(q: Query, id: string, today = localToday()) {
  const row = await subRow(q, id);
  const top = await projectRow(q, row.project_id as string);
  const steps = (await stepsOf(q, [id])).get(id)!;
  const view = subView(row, steps);
  const marks = (await milestones(q, top.id as string)).filter(
    (m) => m.status !== 'dropped' && (m.target_on as string) >= view.start_on && (m.target_on as string) <= view.end_on,
  );
  return {
    ...view,
    today,
    top: { id: top.id, title: top.title, kind: top.kind, sort_order: top.sort_order },
    steps,
    milestones: marks,
  };
}

// ---------------- steps of one project ----------------

/**
 * The project follows its steps: once any step has started it is in progress, and when every
 * counted step is done it is done. Choosing 'paused' by hand is never overridden.
 */
async function syncStatus(q: Query, subId: string, today: string) {
  const sub = await subRow(q, subId);
  if (sub.status === 'paused') return;
  const steps = (await stepsOf(q, [subId])).get(subId)!;
  const counted = steps.filter((s) => s.status !== 'skipped');
  const allDone = counted.length > 0 && counted.every((s) => s.status === 'done');
  const started = steps.some((s) => s.status === 'doing' || s.status === 'done');
  let status = sub.status as string;
  if (allDone) status = 'done';
  else if (status === 'done' || (status === 'planned' && started)) status = 'active';
  if (status === sub.status) return;
  const doneOn = status === 'done' ? counted.reduce((m, s) => ((s.done_on as string) > m ? (s.done_on as string) : m), '') || today : null;
  await q('UPDATE subprojects SET status=$2, done_on=$3, updated_at=now() WHERE id=$1', [subId, status, doneOn]);
}

async function stepRow(q: Query, id: string): Promise<Row> {
  const [row] = await q('SELECT * FROM subproject_steps WHERE id=$1 AND deleted_at IS NULL', [id]);
  if (!row) throw notFound('step');
  return row;
}

export async function addStep(q: Query, subId: string, input: Record<string, unknown>, today = localToday()) {
  rejectUnknown(input, ['title', 'start_on', 'end_on'], 'step');
  const sub = await subRow(q, subId);
  const [last] = await q(
    'SELECT max(position) AS p, max(end_on) AS e FROM subproject_steps WHERE subproject_id=$1 AND deleted_at IS NULL',
    [subId],
  );
  const start = input.start_on ? planDate(input.start_on, 'start_on') : last?.e ? addDays(last.e as string, 1) : (sub.start_on as string);
  const end = input.end_on ? planDate(input.end_on, 'end_on') : start;
  if (end < start) throw invalid('end_on must not be before start_on');
  const id = randomUUID();
  await q('INSERT INTO subproject_steps(id,subproject_id,position,title,start_on,end_on) VALUES($1,$2,$3,$4,$5,$6)', [
    id,
    subId,
    Number(last?.p ?? 0) + 1,
    title(input.title),
    start,
    end,
  ]);
  await syncStatus(q, subId, today);
  return id;
}

/**
 * Change only the fields given. 'done' dates the step today; any other status clears that date.
 * With shift_following, moving this step's end moves every later step by the same number of days.
 */
export async function updateStep(q: Query, id: string, fields: Record<string, unknown>, today = localToday()) {
  rejectUnknown(fields, ['title', 'start_on', 'end_on', 'status', 'note', 'shift_following'], 'step');
  const row = await stepRow(q, id);
  const next: Record<string, unknown> = { ...row };
  for (const [key, raw] of Object.entries(fields)) {
    if (key === 'shift_following') continue;
    if (key === 'title') next.title = title(raw);
    else if (key === 'start_on' || key === 'end_on') next[key] = planDate(raw, key);
    else if (key === 'status') next.status = oneOf(raw, STEP_STATUSES, 'step status');
    else next.note = clean(raw);
  }
  if ((next.end_on as string) < (next.start_on as string)) throw invalid('end_on must not be before start_on');
  next.done_on = next.status === 'done' ? (row.done_on ?? today) : null;
  const keys = ['title', 'start_on', 'end_on', 'status', 'done_on', 'note'].filter((k) => next[k] !== row[k]);
  if (!keys.length) return 'unchanged' as const;
  await q(`UPDATE subproject_steps SET ${keys.map((k, i) => `${k}=$${i + 2}`).join(',')}, updated_at=now() WHERE id=$1`, [
    id,
    ...keys.map((k) => next[k]),
  ]);
  const delta = dayNumber(next.end_on as string) - dayNumber(row.end_on as string);
  if (fields.shift_following === true && delta !== 0) {
    await q(
      `UPDATE subproject_steps SET start_on=to_char(start_on::date + $3::int, 'YYYY-MM-DD'),
         end_on=to_char(end_on::date + $3::int, 'YYYY-MM-DD'), updated_at=now()
       WHERE subproject_id=$1 AND position>$2 AND deleted_at IS NULL AND status<>'done'`,
      [row.subproject_id, row.position, delta],
    );
  }
  await syncStatus(q, row.subproject_id as string, today);
  return 'updated' as const;
}

/** Swap a step with its neighbour above (-1) or below (1). */
export async function moveStep(q: Query, id: string, direction: unknown) {
  const dir = oneOf(String(direction), ['-1', '1'], 'direction') === '-1' ? -1 : 1;
  const row = await stepRow(q, id);
  const [other] = await q(
    `SELECT id, position FROM subproject_steps WHERE subproject_id=$1 AND deleted_at IS NULL
     AND position ${dir < 0 ? '<' : '>'} $2 ORDER BY position ${dir < 0 ? 'DESC' : 'ASC'} LIMIT 1`,
    [row.subproject_id, row.position],
  );
  if (!other) return 'unchanged' as const;
  await q(
    `UPDATE subproject_steps SET position = CASE WHEN id=$1 THEN $4::int ELSE $3::int END, updated_at=now() WHERE id IN ($1,$2)`,
    [id, other.id, row.position, other.position],
  );
  return 'updated' as const;
}

export async function deleteStep(q: Query, id: string, today = localToday()): Promise<boolean> {
  const [row] = await q('SELECT subproject_id, deleted_at FROM subproject_steps WHERE id=$1', [id]);
  if (!row) throw notFound('step');
  if (row.deleted_at !== null) return false;
  await q('UPDATE subproject_steps SET deleted_at=now(), updated_at=now() WHERE id=$1', [id]);
  await syncStatus(q, row.subproject_id as string, today);
  return true;
}

// ---------------- top projects: cards, overview, one top project ----------------

async function milestones(q: Query, projectId?: string): Promise<Row[]> {
  const where = projectId ? 'WHERE m.project_id=$1' : '';
  return q(
    `SELECT m.id,m.project_id,p.title AS project_title,m.title,m.target_on,m.status,m.reached_on,m.note
     FROM project_milestones m JOIN projects p ON p.id=m.project_id ${where}
     ORDER BY m.target_on, m.created_at`,
    projectId ? [projectId] : [],
  );
}

type Sub = ReturnType<typeof subView>;

function card(row: Row, subs: Sub[], projectMilestones: Row[], today: string) {
  const goal = projectMilestones.find((m) => m.status === 'planned') ?? null;
  const upcoming = subs.filter((s) => s.status === 'planned').sort((a, b) => (a.start_on as string).localeCompare(b.start_on as string));
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
    active: subs.filter((s) => s.status === 'active'),
    next_planned: upcoming[0] ?? null,
    counts: {
      planned: upcoming.length,
      active: subs.filter((s) => s.status === 'active').length,
      done_this_year: subs.filter((s) => s.status === 'done' && (s.done_on as string).startsWith(today.slice(0, 4))).length,
      done_total: subs.filter((s) => s.status === 'done').length,
    },
    next_milestone: goal && { id: goal.id, title: goal.title, target_on: goal.target_on },
  };
}

/** The home screen: every top project, its projects in progress, and the long timeline. */
export async function overview(q: Query, today = localToday()) {
  const rows = await q('SELECT * FROM projects ORDER BY sort_order, created_at');
  const subs = await subprojectsOf(q);
  const allMilestones = await milestones(q);
  return {
    today,
    projects: rows.map((row) =>
      card(row, subs.filter((s) => s.project_id === row.id), allMilestones.filter((m) => m.project_id === row.id), today),
    ),
    subprojects: subs,
    milestones: allMilestones.filter((m) => m.status !== 'dropped'),
    upcoming_milestones: allMilestones.filter((m) => m.status === 'planned').slice(0, 8),
  };
}

export async function getProject(q: Query, id: string, today = localToday()) {
  const row = await projectRow(q, id);
  const subs = await subprojectsOf(q, id);
  const projectMilestones = await milestones(q, id);
  return {
    ...card(row, subs, projectMilestones, today),
    today,
    subprojects: subs,
    procedure: await getProcedure(q, id),
    milestones: projectMilestones,
  };
}

/**
 * One-time move of the second version's month phases into projects (same id, so running it twice
 * changes nothing). A phase becomes a project from the 1st of its start month to the end of its last month.
 */
export async function convertPhases(q: Query, today = localToday()): Promise<number> {
  const phases = await q('SELECT * FROM project_phases WHERE deleted_at IS NULL');
  let made = 0;
  for (const f of phases) {
    const start = `${f.start_month}-01`;
    const due = addDays(`${addDays(`${f.end_month}-28`, 4).slice(0, 7)}-01`, -1);
    const status = f.status as string;
    const doneOn = status === 'done' ? (due < today ? due : today) : null;
    const result = await q(
      `INSERT INTO subprojects(id,project_id,title,status,start_on,due_on,done_on,sort_order)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING RETURNING id`,
      [f.id, f.project_id, f.title, status, start, due, doneOn, f.sort_order],
    );
    made += result.length;
  }
  return made;
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

/** Every row, including deleted ones and the earlier versions' phases, items and log, as a backup. */
export async function exportAll(q: Query) {
  const tables: Record<string, Row[]> = {};
  for (const t of ['projects', 'procedure_steps', 'subprojects', 'subproject_steps', 'project_milestones', 'project_phases', 'project_items', 'project_log']) {
    tables[t] = await q(`SELECT * FROM ${t} ORDER BY 1`);
  }
  return { app: 'mylife2036-projects', exported_at: new Date().toISOString(), tables };
}
