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

const item = (title = 'EP002', extra: Record<string, unknown> = {}) => pj.createItem(q, p, { title, ...extra }, TODAY);

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

  it('moves work through stages, dates finished work and logs each move', async () => {
    const i = await item('EP002', { stage: 'prep' });
    expect(await pj.updateItem(q, i, { stage: 'make' }, TODAY)).toBe('updated');
    expect(await pj.updateItem(q, i, { stage: 'make' }, TODAY)).toBe('unchanged');
    await pj.updateItem(q, i, { stage: 'done' }, TODAY);
    const got = await pj.getProject(q, p, TODAY);
    expect(got.items[0].done_on).toBe(TODAY);
    expect([got.done_this_month, got.done_this_year, got.done_total]).toEqual([1, 1, 1]);
    expect(got.last_activity_on).toBe(TODAY);
    const texts = got.log.map((l) => l.text);
    expect(texts).toContain('EP002: 제작 → 업로드 완료');
    expect(texts).toContain('EP002: 대본 → 제작');
    await pj.updateItem(q, i, { stage: 'finish' }, TODAY);
    expect((await pj.getProject(q, p, TODAY)).items[0].done_on).toBeNull();
  });

  it('keeps finished dates honest', async () => {
    const old = await item('EP001', { stage: 'done', done_on: '2026-11-18' });
    expect((await pj.getProject(q, p, TODAY)).log[0].logged_on).toBe('2026-11-18');
    await expect(item('미래', { stage: 'done', done_on: '2026-11-21' })).rejects.toThrow('future');
    await expect(item('아직', { stage: 'idea', done_on: '2026-11-01' })).rejects.toThrow('only for finished');
    await expect(pj.updateItem(q, old, { done_on: '2026-12-01' }, TODAY)).rejects.toThrow('future');
    await expect(item('날짜', { due_on: '2026-2-1' })).rejects.toThrow();
    await expect(item('날짜', { due_on: '2026-02-30' })).rejects.toThrow();
    await expect(item('단계', { stage: 'published' })).rejects.toThrow();
  });

  it('clears optional fields with null and deletes softly', async () => {
    const i = await item('EP002', { series: '책 시리즈', link: 'https://youtu.be/x', note: '메모' });
    await pj.updateItem(q, i, { note: null, series: '  ' }, TODAY);
    const row = (await pj.getProject(q, p, TODAY)).items[0];
    expect([row.note, row.series, row.link]).toEqual([null, null, 'https://youtu.be/x']);
    expect(await pj.deleteItem(q, i)).toBe(true);
    expect(await pj.deleteItem(q, i)).toBe(false);
    expect((await pj.getProject(q, p, TODAY)).items).toEqual([]);
    await expect(pj.updateItem(q, i, { stage: 'make' }, TODAY)).rejects.toMatchObject({ status: 404 });
    expect(await pj.restoreItem(q, i)).toBe(true);
    expect((await pj.getProject(q, p, TODAY)).items).toHaveLength(1);
  });

  it('lets goals be moved, reached or let go', async () => {
    const m = await pj.createMilestone(q, p, { title: '구독자 1,000명', target_on: '2027-12-31' });
    await expect(pj.createMilestone(q, p, { title: '먼 목표', target_on: '2040-01-01' })).rejects.toThrow();
    expect(await pj.updateMilestone(q, m, { target_on: '2028-06-30' }, TODAY)).toBe('updated');
    await pj.updateMilestone(q, m, { status: 'reached' }, TODAY);
    let got = await pj.getProject(q, p, TODAY);
    expect([got.milestones[0].status, got.milestones[0].reached_on]).toEqual(['reached', TODAY]);
    expect(got.log[0].text).toBe('목표 달성: 구독자 1,000명');
    await pj.updateMilestone(q, m, { status: 'dropped' }, TODAY);
    got = await pj.getProject(q, p, TODAY);
    expect(got.milestones[0].reached_on).toBeNull();
    const o = await pj.overview(q, TODAY);
    expect(o.roadmap.milestones).toEqual([]);
    expect(o.upcoming_milestones).toEqual([]);
  });

  it('builds the overview and the 2026–2036 roadmap', async () => {
    const other = await pj.createProject(q, { title: 'Collegiate SNS', kind: 'store', sort_order: 1 });
    await item('EP001', { stage: 'done', done_on: '2026-11-18' });
    await item('EP002', { stage: 'make' });
    await pj.createItem(q, other, { title: '메뉴 사진' }, TODAY);
    await pj.createMilestone(q, other, { title: '게시물 100개', target_on: '2027-06-30' });
    await pj.addLog(q, other, { text: '사진 촬영', minutes: 40 }, TODAY);
    const o = await pj.overview(q, TODAY);
    expect(o.projects.map((x) => x.title)).toEqual(['규영, 책에게 묻다', 'Collegiate SNS']);
    expect([o.projects[0].stage_counts.done, o.projects[0].stage_counts.make]).toEqual([1, 1]);
    expect(o.projects[0].in_progress.map((x) => x.title)).toEqual(['EP002']);
    expect(o.roadmap.years).toHaveLength(11);
    expect(o.roadmap.done_by_year[p]).toEqual({ '2026': 1 });
    expect(o.projects[1].next_milestone?.title).toBe('게시물 100개');
    expect(o.recent_log[0].minutes).toBe(40);
  });

  it('checks work log lines', async () => {
    await expect(pj.addLog(q, p, { text: '내일 일', logged_on: '2026-11-21' }, TODAY)).rejects.toThrow();
    await expect(pj.addLog(q, p, { text: '  ' }, TODAY)).rejects.toThrow();
    await expect(pj.addLog(q, p, { text: '음수', minutes: -1 }, TODAY)).rejects.toThrow();
    await pj.addLog(q, p, { text: '대본 초안', logged_on: '2026-11-19' }, TODAY);
    expect((await pj.getProject(q, p, TODAY)).last_activity_on).toBe('2026-11-19');
  });

  it('exports every table and the database backs up the rules', async () => {
    await item('EP002', { note: '메모' });
    const data = await pj.exportAll(q);
    expect(data.tables.projects).toHaveLength(1);
    expect(data.tables.project_items[0].note).toBe('메모');
    await expect(q(`INSERT INTO project_items(id,project_id,title,stage) VALUES('x',$1,'t','done')`, [p])).rejects.toThrow();
    await expect(q('DELETE FROM projects WHERE id=$1', [p])).rejects.toThrow();
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
