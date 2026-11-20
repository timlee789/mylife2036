/**
 * Project rules: four long-running projects seen together until 2036.
 * Same spirit as My Life 2036: no scores, no streaks, no red. A quiet project is "resting";
 * a goal that was not reached can be moved or let go.
 */
import { randomUUID } from 'node:crypto';
import type { Query, Row } from './db';

export const KINDS = ['youtube', 'store', 'life', 'other'] as const;
export const PROJECT_STATUSES = ['active', 'resting', 'completed', 'archived'] as const;
export const STAGES = ['idea', 'prep', 'make', 'finish', 'done', 'hold'] as const;
export const MILESTONE_STATUSES = ['planned', 'reached', 'dropped'] as const;
export const PLAN_START_YEAR = 2026;
export const PLAN_END_YEAR = 2036;
export const TIMEZONE = 'America/New_York';
const RECENT_LOG = 30;

export type Kind = (typeof KINDS)[number];
export type Stage = (typeof STAGES)[number];

// Same words as the screen (components/projectWords.ts), so the log reads like the board.
export const STAGE_NAMES: Record<Kind, Record<Stage, string>> = {
  youtube: { idea: '아이디어', prep: '대본', make: '제작', finish: '편집·검토', done: '업로드 완료', hold: '보류' },
  store: { idea: '아이디어', prep: '기획', make: '제작', finish: '검토', done: '게시 완료', hold: '보류' },
  life: { idea: '아이디어', prep: '준비', make: '진행', finish: '마무리', done: '완료', hold: '보류' },
  other: { idea: '아이디어', prep: '준비', make: '제작', finish: '마무리', done: '완료', hold: '보류' },
};

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

const ITEM_COLUMNS = 'id,title,series,stage,due_on,done_on,link,note,sort_order';

async function items(q: Query, projectId: string): Promise<Row[]> {
  return q(
    `SELECT ${ITEM_COLUMNS} FROM project_items WHERE project_id=$1 AND deleted_at IS NULL
     ORDER BY (stage='done'), done_on DESC NULLS LAST, sort_order, created_at`,
    [projectId],
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

async function recentLog(q: Query, projectId: string | null, limit: number): Promise<Row[]> {
  const where = projectId ? 'WHERE l.project_id=$2' : '';
  return q(
    `SELECT l.id,l.project_id,p.title AS project_title,l.item_id,l.logged_on,l.kind,l.text,l.minutes
     FROM project_log l JOIN projects p ON p.id=l.project_id ${where}
     ORDER BY l.logged_on DESC, l.id DESC LIMIT $1`,
    projectId ? [limit, projectId] : [limit],
  );
}

async function summary(q: Query, row: Row, today: string) {
  const list = await items(q, row.id as string);
  const stageCounts = Object.fromEntries(STAGES.map((s) => [s, 0])) as Record<Stage, number>;
  for (const item of list) stageCounts[item.stage as Stage] += 1;
  const doneDays = list.map((i) => i.done_on as string | null).filter((d): d is string => !!d);
  const [last] = await q('SELECT max(logged_on) AS last FROM project_log WHERE project_id=$1', [row.id]);
  const [next] = await q(
    `SELECT id,title,target_on FROM project_milestones WHERE project_id=$1 AND status='planned' ORDER BY target_on LIMIT 1`,
    [row.id],
  );
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
    stage_counts: stageCounts,
    done_this_month: doneDays.filter((d) => d.startsWith(today.slice(0, 7))).length,
    done_this_year: doneDays.filter((d) => d.startsWith(today.slice(0, 4))).length,
    done_total: doneDays.length,
    last_activity_on: (last?.last as string | null) ?? null,
    next_milestone: next ?? null,
    in_progress: list
      .filter((i) => ['prep', 'make', 'finish'].includes(i.stage as string))
      .slice(0, 3)
      .map((i) => ({ id: i.id, title: i.title, stage: i.stage, due_on: i.due_on })),
    items: list,
  };
}

/** Everything for the home screen: cards, the 2026–2036 roadmap, goals and recent work. */
export async function overview(q: Query, today = localToday()) {
  const rows = await q('SELECT * FROM projects ORDER BY sort_order, created_at');
  const cards = [];
  for (const row of rows) {
    const { items: _items, ...card } = await summary(q, row, today);
    cards.push(card);
  }
  const done: Record<string, Record<string, number>> = {};
  for (const r of await q(
    `SELECT project_id, substr(done_on,1,4) AS y, count(*)::int AS n FROM project_items
     WHERE deleted_at IS NULL AND done_on IS NOT NULL GROUP BY project_id, y`,
  )) {
    (done[r.project_id as string] ??= {})[r.y as string] = Number(r.n);
  }
  const all = await milestones(q);
  const years = [];
  for (let y = PLAN_START_YEAR; y <= PLAN_END_YEAR; y++) years.push(y);
  return {
    today,
    projects: cards,
    roadmap: { years, done_by_year: done, milestones: all.filter((m) => m.status !== 'dropped') },
    upcoming_milestones: all.filter((m) => m.status === 'planned').slice(0, 8),
    recent_log: await recentLog(q, null, 12),
  };
}

export async function getProject(q: Query, id: string, today = localToday()) {
  const row = await projectRow(q, id);
  return { ...(await summary(q, row, today)), today, milestones: await milestones(q, id), log: await recentLog(q, id, RECENT_LOG) };
}

// ---------------- work items ----------------

const ITEM_FIELDS = ['title', 'series', 'stage', 'due_on', 'done_on', 'link', 'note', 'sort_order'];

export async function createItem(q: Query, projectId: string, input: Record<string, unknown>, today = localToday()): Promise<string> {
  rejectUnknown(input, ITEM_FIELDS, 'item');
  await projectRow(q, projectId);
  const stage = oneOf(input.stage ?? 'idea', STAGES, 'stage');
  let doneOn = dayOrNull(input.done_on, 'done_on');
  if (stage === 'done') doneOn = doneOn ?? today;
  else if (doneOn !== null) throw invalid('done_on is only for finished work');
  notFuture(doneOn, today, 'done_on');
  const name = title(input.title);
  const id = randomUUID();
  // One statement, so the item and its log line are saved together or not at all.
  await q(
    `WITH item AS (
       INSERT INTO project_items(id,project_id,title,series,stage,due_on,done_on,link,note,sort_order)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id)
     INSERT INTO project_log(project_id,item_id,logged_on,kind,text) SELECT $2, id, $11, 'created', $12 FROM item`,
    [
      id,
      projectId,
      name,
      clean(input.series),
      stage,
      dayOrNull(input.due_on, 'due_on'),
      doneOn,
      clean(input.link),
      clean(input.note),
      input.sort_order === undefined ? 0 : wholeNumber(input.sort_order, 'sort_order'),
      doneOn ?? today,
      stage === 'done' ? `완료로 등록: ${name}` : `새 작업: ${name}`,
    ],
  );
  return id;
}

/**
 * Change only the fields given; null clears an optional field.
 * Moving to 'done' dates it today unless done_on is given; leaving 'done' clears the date.
 * A stage change writes one line to the project log.
 */
export async function updateItem(q: Query, id: string, fields: Record<string, unknown>, today = localToday()) {
  rejectUnknown(fields, ITEM_FIELDS, 'item');
  const [row] = await q(
    `SELECT i.*, p.kind FROM project_items i JOIN projects p ON p.id=i.project_id WHERE i.id=$1 AND i.deleted_at IS NULL`,
    [id],
  );
  if (!row) throw notFound('item');
  const next: Record<string, unknown> = { ...row };
  for (const [key, raw] of Object.entries(fields)) {
    if (key === 'title') next.title = title(raw);
    else if (key === 'stage') next.stage = oneOf(raw, STAGES, 'stage');
    else if (key === 'due_on' || key === 'done_on') next[key] = dayOrNull(raw, key);
    else if (key === 'sort_order') next.sort_order = wholeNumber(raw, 'sort_order');
    else next[key] = clean(raw);
  }
  if (next.stage === 'done') next.done_on = next.done_on ?? today;
  else if (fields.done_on !== undefined && fields.done_on !== null) throw invalid('done_on is only for finished work');
  else next.done_on = null;
  notFuture(next.done_on as string | null, today, 'done_on');

  const changed = ITEM_FIELDS.filter((k) => next[k] !== row[k]);
  if (!changed.length) return 'unchanged' as const;
  const values = changed.map((k) => next[k]);
  const set = changed.map((k, i) => `${k}=$${i + 2}`).join(',');
  if (changed.includes('stage')) {
    const names = STAGE_NAMES[row.kind as Kind];
    const n = changed.length + 2;
    await q(
      `WITH item AS (UPDATE project_items SET ${set}, updated_at=now() WHERE id=$1 RETURNING project_id)
       INSERT INTO project_log(project_id,item_id,logged_on,kind,text) SELECT project_id, $1, $${n}, 'stage', $${n + 1} FROM item`,
      [
        id,
        ...values,
        (next.done_on as string | null) ?? today,
        `${next.title}: ${names[row.stage as Stage]} → ${names[next.stage as Stage]}`,
      ],
    );
  } else {
    await q(`UPDATE project_items SET ${set}, updated_at=now() WHERE id=$1`, [id, ...values]);
  }
  return 'updated' as const;
}

/** Soft delete: the row and its log lines stay in the database and the export. */
export async function deleteItem(q: Query, id: string): Promise<boolean> {
  const [row] = await q('SELECT deleted_at FROM project_items WHERE id=$1', [id]);
  if (!row) throw notFound('item');
  if (row.deleted_at !== null) return false;
  await q('UPDATE project_items SET deleted_at=now(), updated_at=now() WHERE id=$1', [id]);
  return true;
}

export async function restoreItem(q: Query, id: string): Promise<boolean> {
  const [row] = await q('SELECT deleted_at FROM project_items WHERE id=$1', [id]);
  if (!row) throw notFound('item');
  if (row.deleted_at === null) return false;
  await q('UPDATE project_items SET deleted_at=NULL, updated_at=now() WHERE id=$1', [id]);
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
  const set = keys.map((k, i) => `${k}=$${i + 2}`).join(',');
  const values = keys.map((k) => next[k]);
  if (keys.includes('status') && next.status === 'reached') {
    const n = keys.length + 2;
    await q(
      `WITH m AS (UPDATE project_milestones SET ${set}, updated_at=now() WHERE id=$1 RETURNING project_id)
       INSERT INTO project_log(project_id,logged_on,kind,text) SELECT project_id, $${n}, 'milestone', $${n + 1} FROM m`,
      [id, ...values, next.reached_on, `목표 달성: ${next.title}`],
    );
  } else {
    await q(`UPDATE project_milestones SET ${set}, updated_at=now() WHERE id=$1`, [id, ...values]);
  }
  return 'updated' as const;
}

// ---------------- work log ----------------

export async function addLog(q: Query, projectId: string, input: Record<string, unknown>, today = localToday()): Promise<number> {
  rejectUnknown(input, ['text', 'logged_on', 'minutes'], 'log');
  await projectRow(q, projectId);
  const day = input.logged_on === undefined || input.logged_on === null ? today : parseDay(input.logged_on, 'logged_on');
  notFuture(day, today, 'logged_on');
  let minutes: number | null = null;
  if (input.minutes !== undefined && input.minutes !== null) {
    minutes = wholeNumber(input.minutes, 'minutes');
    if (minutes < 0) throw invalid('invalid minutes');
  }
  const [row] = await q(
    `INSERT INTO project_log(project_id,logged_on,kind,text,minutes) VALUES($1,$2,'note',$3,$4) RETURNING id`,
    [projectId, day, title(input.text), minutes],
  );
  return Number(row.id);
}

/** Every row, including deleted items, as a backup the owner can keep anywhere. */
export async function exportAll(q: Query) {
  const tables: Record<string, Row[]> = {};
  for (const t of ['projects', 'project_items', 'project_milestones', 'project_log']) {
    tables[t] = await q(`SELECT * FROM ${t} ORDER BY created_at`);
  }
  return { app: 'mylife2036-projects', exported_at: new Date().toISOString(), tables };
}
