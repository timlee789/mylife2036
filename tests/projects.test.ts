import { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { ensureSchema, pgliteDatabase, type Database, type Query, type Row } from '@/lib/db';
import * as pj from '@/lib/projects';
import { makeSession, passwordMatches, validSession } from '@/lib/auth';

const TODAY = '2026-11-20';
let q: Query;
let database: Database;
let p: string;

beforeEach(async () => {
  database = pgliteDatabase(new PGlite());
  q = database.query;
  await ensureSchema(q);
  await ensureSchema(q); // running it twice (every server start) changes nothing
  p = await pj.createProject(q, { title: '규영, 책에게 묻다', kind: 'youtube', summary: '책 한 권 + 질문', next_action: 'EP002 책 고르기' });
});

describe('projects', () => {
  it('updates only the fields given', async () => {
    expect(await pj.updateProject(q, p, { next_action: 'EP002 책 고르기' })).toBe('unchanged');
    expect(await pj.updateProject(q, p, { status: 'resting', vault_note: ' 10_Projects/x/00_홈 ' })).toBe('updated');
    const got = await pj.getProject(q, p, TODAY);
    expect([got.status, got.vault_note, got.summary]).toEqual(['resting', '10_Projects/x/00_홈', '책 한 권 + 질문']);
    for (const bad of [{ status: 'failed' }, { kind: 'tv' }, { title: '  ' }, { title: null }, { score: 1 }]) {
      await expect(pj.updateProject(q, p, bad)).rejects.toThrow();
    }
    await expect(pj.getProject(q, 'missing')).rejects.toMatchObject({ status: 404 });
  });
});

const PROC = [
  { title: '책·장·질문 정하기', days: 2 },
  { title: '대본 초안', days: 3 },
  { title: '대본 확정', days: 2 },
  { title: '렌더', days: 1 },
  { title: '업로드', days: 1 },
];

describe('procedure and projects', () => {
  it('keeps one ordered procedure per top project and replaces it whole', async () => {
    const steps = await pj.setProcedure(q, p, PROC);
    expect(steps.map((s) => [s.position, s.title, s.days])).toEqual(PROC.map((x, i) => [i + 1, x.title, x.days]));
    expect(await pj.setProcedure(q, p, [{ title: '하나', days: 1 }])).toHaveLength(1);
    await expect(pj.setProcedure(q, p, [{ title: ' ', days: 1 }])).rejects.toThrow();
    await expect(pj.setProcedure(q, p, [{ title: 'x', days: 0 }])).rejects.toThrow();
    expect(await pj.getProcedure(q, p)).toHaveLength(1); // a failed replace leaves the old one
  });

  it('a new project copies the procedure and lays the steps out one after another', async () => {
    await pj.setProcedure(q, p, PROC);
    const s = await pj.createSubproject(q, p, { title: '죽음의 수용소에서', start_on: '2026-11-23' }, TODAY);
    const got = await pj.getSubproject(q, s, TODAY);
    expect(got.steps.map((x) => [x.title, x.start_on, x.end_on])).toEqual([
      ['책·장·질문 정하기', '2026-11-23', '2026-11-24'],
      ['대본 초안', '2026-11-25', '2026-11-27'],
      ['대본 확정', '2026-11-28', '2026-11-29'],
      ['렌더', '2026-11-30', '2026-11-30'],
      ['업로드', '2026-12-01', '2026-12-01'],
    ]);
    expect([got.status, got.due_on, got.percent, got.current_step?.title, got.top.title]).toEqual([
      'planned', '2026-12-01', 0, '책·장·질문 정하기', '규영, 책에게 묻다',
    ]);
    // later procedure changes do not touch projects already made
    await pj.setProcedure(q, p, [{ title: '새 절차', days: 1 }]);
    expect((await pj.getSubproject(q, s, TODAY)).steps).toHaveLength(5);
  });

  it('progress follows the steps; skipped steps do not count; paused is left alone', async () => {
    await pj.setProcedure(q, p, PROC);
    const s = await pj.createSubproject(q, p, { title: 'EP002', start_on: '2026-11-20' }, TODAY);
    let got = await pj.getSubproject(q, s, TODAY);
    const [a, b, c, d, e] = got.steps.map((x) => x.id as string);
    await pj.updateStep(q, a, { status: 'doing' }, TODAY);
    expect((await pj.getSubproject(q, s, TODAY)).status).toBe('active');
    await pj.updateStep(q, a, { status: 'done' }, TODAY);
    await pj.updateStep(q, b, { status: 'skipped' }, TODAY);
    got = await pj.getSubproject(q, s, TODAY);
    expect([got.steps_done, got.steps_total, got.percent, got.current_step?.title]).toEqual([1, 4, 25, '대본 확정']);
    expect(got.steps[0].done_on).toBe(TODAY);
    for (const id of [c, d, e]) await pj.updateStep(q, id, { status: 'done' }, TODAY);
    got = await pj.getSubproject(q, s, TODAY);
    expect([got.status, got.done_on, got.percent]).toEqual(['done', TODAY, 100]);
    await pj.updateStep(q, e, { status: 'todo' }, TODAY); // reopening a step reopens the project
    got = await pj.getSubproject(q, s, TODAY);
    expect([got.status, got.done_on]).toEqual(['active', null]);
    await pj.updateSubproject(q, s, { status: 'paused' }, TODAY);
    await pj.updateStep(q, e, { status: 'doing' }, TODAY);
    expect((await pj.getSubproject(q, s, TODAY)).status).toBe('paused');
  });

  it('moving a step can push the later steps by the same days', async () => {
    await pj.setProcedure(q, p, PROC);
    const s = await pj.createSubproject(q, p, { title: 'EP003', start_on: '2026-12-01' }, TODAY);
    const steps = (await pj.getSubproject(q, s, TODAY)).steps;
    await pj.updateStep(q, steps[1].id as string, { end_on: '2026-12-07', shift_following: true }, TODAY);
    const after = (await pj.getSubproject(q, s, TODAY)).steps;
    expect(after.map((x) => x.end_on)).toEqual(['2026-12-02', '2026-12-07', '2026-12-09', '2026-12-10', '2026-12-11']);
    expect((await pj.getSubproject(q, s, TODAY)).end_on).toBe('2026-12-11'); // the bar grows past the target date
    await pj.updateStep(q, after[0].id as string, { end_on: '2026-12-03' }, TODAY); // without shift: only that step
    expect((await pj.getSubproject(q, s, TODAY)).steps[1].start_on).toBe('2026-12-03');
    await expect(pj.updateStep(q, after[0].id as string, { end_on: '2026-11-01' }, TODAY)).rejects.toThrow('before');
  });

  it('adds, reorders and removes steps', async () => {
    const s = await pj.createSubproject(q, p, { title: '절차 없이', start_on: '2026-12-01', use_procedure: false }, TODAY);
    const one = await pj.addStep(q, s, { title: '첫 단계', end_on: '2026-12-03' }, TODAY);
    const two = await pj.addStep(q, s, { title: '둘째 단계' }, TODAY);
    let steps = (await pj.getSubproject(q, s, TODAY)).steps;
    expect(steps.map((x) => [x.title, x.start_on])).toEqual([['첫 단계', '2026-12-01'], ['둘째 단계', '2026-12-04']]);
    expect(await pj.moveStep(q, two, -1)).toBe('updated');
    expect(await pj.moveStep(q, two, -1)).toBe('unchanged');
    steps = (await pj.getSubproject(q, s, TODAY)).steps;
    expect(steps.map((x) => x.title)).toEqual(['둘째 단계', '첫 단계']);
    expect(await pj.deleteStep(q, one, TODAY)).toBe(true);
    expect((await pj.getSubproject(q, s, TODAY)).steps).toHaveLength(1);
    await expect(pj.moveStep(q, two, 2)).rejects.toThrow();
  });

  it('applies the procedure to a project that has no steps yet', async () => {
    const s = await pj.createSubproject(q, p, { title: '예전 단계', start_on: '2026-11-01', use_procedure: false }, TODAY);
    await expect(pj.applyProcedure(q, s)).rejects.toThrow('no procedure');
    await pj.setProcedure(q, p, PROC);
    expect(await pj.applyProcedure(q, s)).toBe(5);
    await expect(pj.applyProcedure(q, s)).rejects.toThrow('already');
  });

  it('checks project fields and deletes softly', async () => {
    await expect(pj.createSubproject(q, p, { title: '거꾸로', start_on: '2026-12-10', due_on: '2026-12-01' }, TODAY)).rejects.toThrow();
    await expect(pj.createSubproject(q, p, { title: '먼 날', start_on: '2040-01-01' }, TODAY)).rejects.toThrow();
    await expect(pj.createSubproject(q, 'missing', { title: 'x' }, TODAY)).rejects.toMatchObject({ status: 404 });
    const s = await pj.createSubproject(q, p, { title: '오늘 시작' }, TODAY);
    expect((await pj.getSubproject(q, s, TODAY)).start_on).toBe(TODAY);
    expect(await pj.updateSubproject(q, s, { status: 'done' }, TODAY)).toBe('updated'); // no steps: chosen by hand
    expect((await pj.getSubproject(q, s, TODAY)).done_on).toBe(TODAY);
    expect(await pj.deleteSubproject(q, s)).toBe(true);
    await expect(pj.getSubproject(q, s, TODAY)).rejects.toMatchObject({ status: 404 });
    expect((await pj.exportAll(q)).tables.subprojects).toHaveLength(1);
  });

  it('the top project and overview show projects in progress and counts', async () => {
    await pj.setProcedure(q, p, PROC);
    const a = await pj.createSubproject(q, p, { title: '진행', start_on: '2026-11-18' }, TODAY);
    await pj.updateStep(q, (await pj.getSubproject(q, a, TODAY)).steps[0].id as string, { status: 'doing' }, TODAY);
    await pj.createSubproject(q, p, { title: '다음', start_on: '2027-01-05' }, TODAY);
    const done = await pj.createSubproject(q, p, { title: '끝남', start_on: '2026-11-01', use_procedure: false }, TODAY);
    await pj.updateSubproject(q, done, { status: 'done' }, TODAY);
    const top = await pj.getProject(q, p, TODAY);
    expect(top.active.map((x) => x.title)).toEqual(['진행']);
    expect(top.next_planned?.title).toBe('다음');
    expect(top.counts).toEqual({ planned: 1, active: 1, done_this_year: 1, done_total: 1 });
    expect(top.procedure).toHaveLength(5);
    const o = await pj.overview(q, TODAY);
    expect(o.subprojects).toHaveLength(3);
    expect(o.projects[0].active[0].current_step?.title).toBe('책·장·질문 정하기');
  });

  it('turns the old month phases into projects once', async () => {
    await q(`INSERT INTO project_phases(id,project_id,title,start_month,end_month,status) VALUES
      ('f1',$1,'정기 제작','2026-12','2027-03','planned'), ('f2',$1,'채널 준비','2026-11','2026-11','done')`, [p]);
    expect(await pj.convertPhases(q, TODAY)).toBe(2);
    expect(await pj.convertPhases(q, TODAY)).toBe(0);
    const subs = (await pj.getProject(q, p, TODAY)).subprojects;
    expect(subs.map((x) => [x.title, x.start_on, x.due_on, x.status, x.done_on])).toEqual([
      ['채널 준비', '2026-11-01', '2026-11-30', 'done', TODAY],
      ['정기 제작', '2026-12-01', '2027-03-31', 'planned', null],
    ]);
  });
});

describe('milestones', () => {
  it('can be moved, reached or let go', async () => {
    const m = await pj.createMilestone(q, p, { title: '구독자 1,000명', target_on: '2027-12-31' });
    await expect(pj.createMilestone(q, p, { title: '먼 목표', target_on: '2040-01-01' })).rejects.toThrow();
    expect(await pj.updateMilestone(q, m, { target_on: '2028-06-30' }, TODAY)).toBe('updated');
    await pj.updateMilestone(q, m, { status: 'reached' }, TODAY);
    let got = await pj.getProject(q, p, TODAY);
    expect([got.milestones[0].status, got.milestones[0].reached_on]).toEqual(['reached', TODAY]);
    await expect(pj.updateMilestone(q, m, { reached_on: '2026-12-01' }, TODAY)).rejects.toThrow('future');
    await pj.updateMilestone(q, m, { status: 'dropped' }, TODAY);
    got = await pj.getProject(q, p, TODAY);
    expect(got.milestones[0].reached_on).toBeNull();
    const o = await pj.overview(q, TODAY);
    expect(o.milestones).toEqual([]); // let-go milestones leave the timeline
    expect(o.upcoming_milestones).toEqual([]);
  });

  it('the overview lists projects in order with their next milestone', async () => {
    const other = await pj.createProject(q, { title: 'Collegiate SNS', kind: 'store', sort_order: 1 });
    await pj.createMilestone(q, other, { title: '게시물 100개', target_on: '2027-06-30' });
    const o = await pj.overview(q, TODAY);
    expect(o.projects.map((x) => x.title)).toEqual(['규영, 책에게 묻다', 'Collegiate SNS']);
    expect(o.projects[1].next_milestone?.title).toBe('게시물 100개');
    expect(o.upcoming_milestones[0].project_title).toBe('Collegiate SNS');
  });
});

describe('backup', () => {
  it('exports every table, including earlier versions\' data', async () => {
    const data = await pj.exportAll(q);
    expect(Object.keys(data.tables).sort()).toEqual([
      'procedure_steps', 'project_items', 'project_log', 'project_milestones', 'project_phases', 'projects', 'subproject_steps', 'subprojects',
    ]);
    expect(data.tables.projects).toHaveLength(1);
    await pj.createSubproject(q, p, { title: '하위', start_on: '2027-01-01' }, TODAY);
    await expect(q('DELETE FROM projects WHERE id=$1', [p])).rejects.toThrow(); // a top project with projects is never hard-deleted
  });
});

describe('review fixes 2026-11-21', () => {
  const steps = async (s: string) => (await pj.getSubproject(q, s, TODAY)).steps;

  it('a project with steps cannot be marked done by hand while steps remain; a note edit keeps its status', async () => {
    await pj.setProcedure(q, p, PROC);
    const s = await pj.createSubproject(q, p, { title: 'EP002', start_on: '2026-11-20' }, TODAY);
    await expect(pj.updateSubproject(q, s, { status: 'done' }, TODAY)).rejects.toThrow('남은 단계');
    const ids = (await steps(s)).map((x) => x.id as string);
    for (const id of ids) await pj.updateStep(q, id, { status: 'done' }, TODAY);
    expect((await pj.getSubproject(q, s, TODAY)).status).toBe('done');
    await pj.updateStep(q, ids[0], { note: '메모만' }, TODAY);
    expect((await pj.getSubproject(q, s, TODAY)).status).toBe('done');
    await expect(pj.updateSubproject(q, s, { status: 'active' }, TODAY)).rejects.toThrow('다시 여세요');
    // marking 'planned' while work has started becomes 'active'
    await pj.updateStep(q, ids[4], { status: 'todo' }, TODAY);
    await pj.updateSubproject(q, s, { status: 'planned' }, TODAY);
    expect((await pj.getSubproject(q, s, TODAY)).status).toBe('active');
  });

  it('resuming a paused project whose steps were all finished lands on done, at 100%', async () => {
    await pj.setProcedure(q, p, PROC);
    const s = await pj.createSubproject(q, p, { title: '쉬다 끝냄', start_on: '2026-11-20' }, TODAY);
    await pj.updateSubproject(q, s, { status: 'paused' }, TODAY);
    for (const st of await steps(s)) await pj.updateStep(q, st.id as string, { status: 'done' }, TODAY);
    expect((await pj.getSubproject(q, s, TODAY)).status).toBe('paused');
    await pj.updateSubproject(q, s, { status: 'active' }, TODAY);
    const got = await pj.getSubproject(q, s, TODAY);
    expect([got.status, got.percent, got.done_on]).toEqual(['done', 100, TODAY]);
  });

  it('two simultaneous "apply procedure" clicks add the steps once', async () => {
    await pj.setProcedure(q, p, PROC);
    const s = await pj.createSubproject(q, p, { title: '동시', start_on: '2026-12-01', use_procedure: false }, TODAY);
    const results = await Promise.allSettled([
      database.transaction((t) => pj.applyProcedure(t, s, TODAY)),
      database.transaction((t) => pj.applyProcedure(t, s, TODAY)),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(await steps(s)).toHaveLength(PROC.length);
  });

  it('a failure halfway through moving steps saves nothing, and a retry moves them all', async () => {
    await pj.setProcedure(q, p, PROC);
    const s = await pj.createSubproject(q, p, { title: '실패', start_on: '2026-12-01' }, TODAY);
    const before = await steps(s);
    let writes = 0;
    const failing = (t: Query): Query => async (text, params) => {
      if (/^\s*UPDATE subproject_steps/.test(text) && ++writes === 2) throw new Error('connection lost');
      return t(text, params);
    };
    const move = { end_on: '2026-12-07', shift_following: true };
    await expect(database.transaction((t) => pj.updateStep(failing(t), before[1].id as string, move, TODAY))).rejects.toThrow('connection lost');
    expect((await steps(s)).map((x) => x.end_on)).toEqual(before.map((x) => x.end_on));
    await database.transaction((t) => pj.updateStep(t, before[1].id as string, move, TODAY));
    expect((await steps(s)).map((x) => x.end_on)).toEqual(['2026-12-02', '2026-12-07', '2026-12-09', '2026-12-10', '2026-12-11']);
  });

  it('moving the project start can move its unfinished steps and target date with it', async () => {
    await pj.setProcedure(q, p, PROC);
    const s = await pj.createSubproject(q, p, { title: '미루기', start_on: '2026-12-01' }, TODAY);
    const first = (await steps(s))[0].id as string;
    await pj.updateStep(q, first, { status: 'done' }, TODAY);
    await pj.updateSubproject(q, s, { start_on: '2027-01-05', shift_steps: true }, TODAY);
    let got = await pj.getSubproject(q, s, TODAY);
    expect([got.start_on, got.due_on]).toEqual(['2027-01-05', '2027-01-13']); // 9-day target moved by 35 days
    expect(got.steps.map((x) => x.start_on)).toEqual(['2026-12-01', '2027-01-07', '2027-01-10', '2027-01-12', '2027-01-13']);
    // without moving the steps, the project's own timeline still covers them
    await pj.updateSubproject(q, s, { start_on: '2027-03-01', due_on: '2027-03-10' }, TODAY);
    got = await pj.getSubproject(q, s, TODAY);
    expect([got.span_start, got.span_end]).toEqual(['2026-12-01', '2027-03-10']);
  });

  it('the forecast comes from remaining steps: skipped late steps do not make the project late', async () => {
    await pj.setProcedure(q, p, PROC);
    const s = await pj.createSubproject(q, p, { title: '예측', start_on: '2026-12-01', due_on: '2026-12-04' }, TODAY);
    let got = await pj.getSubproject(q, s, TODAY);
    expect([got.forecast_on, got.late]).toEqual(['2026-12-09', true]);
    for (const st of got.steps.slice(1)) await pj.updateStep(q, st.id as string, { status: 'skipped' }, TODAY);
    got = await pj.getSubproject(q, s, TODAY);
    expect([got.forecast_on, got.late, got.end_on]).toEqual(['2026-12-02', false, '2026-12-04']);
  });

  it('one date rule for calculated and typed dates; editing a name never trips over dates', async () => {
    await pj.setProcedure(q, p, PROC);
    await expect(pj.createSubproject(q, p, { title: '너무 늦게', start_on: '2036-12-28' }, TODAY)).rejects.toThrow('2036-12-31');
    const s = await pj.createSubproject(q, p, { title: '연말', start_on: '2036-12-20' }, TODAY);
    const st = (await steps(s))[4];
    expect(await pj.updateStep(q, st.id as string, { title: '새 이름', start_on: st.start_on, end_on: st.end_on }, TODAY)).toBe('updated');
    await expect(pj.updateStep(q, (await steps(s))[0].id as string, { end_on: '2036-12-30', shift_following: true }, TODAY)).rejects.toThrow('옮긴 단계');
  });

  it('upcoming milestones are today or later; slipped ones are listed apart', async () => {
    for (let i = 1; i <= 9; i++) await pj.createMilestone(q, p, { title: `지난 ${i}`, target_on: `2026-11-0${i}` });
    await pj.createMilestone(q, p, { title: '내일', target_on: '2026-11-21' });
    const o = await pj.overview(q, TODAY);
    expect(o.upcoming_milestones.map((m) => m.title)).toEqual(['내일']);
    expect(o.overdue_milestones).toHaveLength(9);
    expect(o.projects[0].next_milestone?.title).toBe('내일');
  });
});

describe('login', () => {
  it('signs sessions and rejects forged or expired ones', () => {
    process.env.SESSION_SECRET = 'x'.repeat(40);
    process.env.SITE_PASSWORD = '비밀';
    const now = Date.UTC(2026, 10, 20);
    const { value } = makeSession(now);
    expect(validSession(value, now + 1000)).toBe(true);
    expect(validSession(value, now + 31 * 86_400_000)).toBe(false);
    expect(validSession(value.replace('v1.', 'v1.9'), now)).toBe(false);
    expect(validSession(value.slice(0, -2) + 'aa', now)).toBe(false);
    expect(validSession(undefined)).toBe(false);
    expect(passwordMatches('비밀')).toBe(true);
    expect(passwordMatches('비밀2')).toBe(false);
    expect(passwordMatches(undefined)).toBe(false);
  });
});
