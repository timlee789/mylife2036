import { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { ensureSchema, type Query, type Row } from '@/lib/db';
import * as pj from '@/lib/projects';
import { makeSession, passwordMatches, validSession } from '@/lib/auth';

const TODAY = '2026-11-20';
let q: Query;
let p: string;

beforeEach(async () => {
  const db = new PGlite();
  q = async (text, params = []) => (await db.query<Row>(text, params)).rows;
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

describe('phases', () => {
  const phase = (title: string, start_month: string, end_month: string, status = 'planned') =>
    pj.createPhase(q, p, { title, start_month, end_month, status });

  it('lays phases on months and tells what is now and what comes next', async () => {
    await phase('채널 준비', '2026-11', '2026-11', 'done');
    await phase('정기 제작', '2026-12', '2027-03');
    await phase('지금 하는 일', '2026-10', '2026-12', 'active');
    const got = await pj.getProject(q, p, TODAY);
    expect(got.phases.map((f) => f.title)).toEqual(['지금 하는 일', '채널 준비', '정기 제작']);
    expect(got.now_phases.map((f) => f.title)).toEqual(['지금 하는 일']);
    expect(got.next_phase?.title).toBe('정기 제작');
    const o = await pj.overview(q, TODAY);
    expect(o.phases).toHaveLength(3);
    expect(o.projects[0].next_phase?.title).toBe('정기 제작');
  });

  it('a planned phase that covers this month counts as now', async () => {
    await phase('이번 달 걸친 단계', '2026-11', '2027-01');
    expect((await pj.getProject(q, p, TODAY)).now_phases.map((f) => f.title)).toEqual(['이번 달 걸친 단계']);
  });

  it('checks months and keeps the end after the start', async () => {
    await expect(phase('거꾸로', '2027-03', '2027-01')).rejects.toThrow('before');
    await expect(phase('잘못된 달', '2026-13', '2027-01')).rejects.toThrow();
    await expect(phase('너무 먼', '2040-01', '2040-02')).rejects.toThrow();
    await expect(pj.createPhase(q, p, { title: '상태', start_month: '2027-01', status: 'failed' })).rejects.toThrow();
    const one = await pj.createPhase(q, p, { title: '한 달', start_month: '2027-02' });
    expect((await pj.getProject(q, p, TODAY)).phases[0].end_month).toBe('2027-02'); // end defaults to start
    await expect(pj.updatePhase(q, one, { end_month: '2027-01' })).rejects.toThrow('before');
    await expect(q("INSERT INTO project_phases(id,project_id,title,start_month,end_month) VALUES('x',$1,'t','2027-05','2027-04')", [p])).rejects.toThrow();
  });

  it('edits, clears the goal with null, and deletes softly', async () => {
    const id = await pj.createPhase(q, p, { title: '정기 제작', start_month: '2026-12', end_month: '2027-03', goal: '월 2편 리듬' });
    expect(await pj.updatePhase(q, id, { title: '정기 제작' })).toBe('unchanged');
    expect(await pj.updatePhase(q, id, { status: 'active', end_month: '2027-06', goal: null })).toBe('updated');
    const row = (await pj.getProject(q, p, TODAY)).phases[0];
    expect([row.status, row.end_month, row.goal]).toEqual(['active', '2027-06', null]);
    expect(await pj.deletePhase(q, id)).toBe(true);
    expect(await pj.deletePhase(q, id)).toBe(false);
    expect((await pj.getProject(q, p, TODAY)).phases).toEqual([]);
    await expect(pj.updatePhase(q, id, { title: 'x' })).rejects.toMatchObject({ status: 404 });
    expect((await pj.exportAll(q)).tables.project_phases).toHaveLength(1); // still in the backup
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
  it('exports every table, including the first version\'s items and log', async () => {
    const data = await pj.exportAll(q);
    expect(Object.keys(data.tables).sort()).toEqual(['project_items', 'project_log', 'project_milestones', 'project_phases', 'projects']);
    expect(data.tables.projects).toHaveLength(1);
    await pj.createPhase(q, p, { title: '단계', start_month: '2027-01' });
    await expect(q('DELETE FROM projects WHERE id=$1', [p])).rejects.toThrow(); // a project with phases is never hard-deleted
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
