'use client';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let reply: Response;
  try {
    reply = await fetch(`/api${path}`, {
      method,
      headers: { 'X-PM-Request': '1', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, 'offline', '서버에 연결할 수 없습니다. 인터넷 연결을 확인해 주세요.');
  }
  if (reply.status === 401) {
    window.location.href = '/login';
    throw new ApiError(401, 'login_required', '로그인이 필요합니다.');
  }
  if (reply.status === 204) return undefined as T;
  const data = await reply.json().catch(() => null);
  if (!reply.ok) throw new ApiError(reply.status, data?.code ?? 'unknown', data?.message ?? '요청을 처리하지 못했습니다.');
  return data as T;
}

export function messageOf(problem: unknown): string {
  return problem instanceof ApiError ? problem.message : '알 수 없는 문제가 생겼습니다.';
}

export type ProjectKind = 'youtube' | 'store' | 'life' | 'other';
export type ProjectStatus = 'active' | 'resting' | 'completed' | 'archived';
export type PhaseStatus = 'planned' | 'active' | 'done' | 'paused';
export type MilestoneStatus = 'planned' | 'reached' | 'dropped';

export interface ProjectFields {
  title: string;
  kind: ProjectKind;
  summary: string;
  purpose: string;
  current_focus: string;
  next_action: string;
  vault_note: string | null;
}

export interface ProjectCard extends ProjectFields {
  id: string;
  status: ProjectStatus;
  sort_order: number;
  now_phases: { id: string; title: string; end_month: string }[];
  next_phase: { id: string; title: string; start_month: string } | null;
  next_milestone: { id: string; title: string; target_on: string } | null;
}

export interface Phase {
  id: string;
  project_id: string;
  project_title: string;
  project_kind: ProjectKind;
  title: string;
  start_month: string;
  end_month: string;
  status: PhaseStatus;
  goal: string | null;
}

export interface Milestone {
  id: string;
  project_id: string;
  project_title: string;
  title: string;
  target_on: string;
  status: MilestoneStatus;
  reached_on: string | null;
  note: string | null;
}

export interface ProjectOverview {
  today: string;
  projects: ProjectCard[];
  phases: Phase[];
  milestones: Milestone[];
  upcoming_milestones: Milestone[];
}

export interface ProjectDetail extends ProjectCard {
  today: string;
  phases: Phase[];
  milestones: Milestone[];
}

export interface NewPhase {
  title: string;
  start_month: string;
  end_month: string;
  status?: PhaseStatus;
  goal?: string | null;
}

export const projectApi = {
  overview: () => request<ProjectOverview>('GET', '/projects'),
  detail: (id: string) => request<ProjectDetail>('GET', `/projects/${id}`),
  create: (fields: ProjectFields & { sort_order?: number }) => request<{ id: string }>('POST', '/projects', fields),
  update: (id: string, fields: Partial<ProjectFields & { status: ProjectStatus }>) => request<unknown>('PATCH', `/projects/${id}`, fields),
  addPhase: (projectId: string, phase: NewPhase) => request<{ id: string }>('POST', `/projects/${projectId}/phases`, phase),
  updatePhase: (id: string, fields: Partial<NewPhase>) => request<unknown>('PATCH', `/phases/${id}`, fields),
  deletePhase: (id: string) => request<void>('DELETE', `/phases/${id}`),
  addMilestone: (projectId: string, title: string, target_on: string) =>
    request<{ id: string }>('POST', `/projects/${projectId}/milestones`, { title, target_on }),
  updateMilestone: (id: string, fields: Partial<Pick<Milestone, 'title' | 'target_on' | 'status' | 'note'>>) =>
    request<unknown>('PATCH', `/milestones/${id}`, fields),
  exportAll: () => request<unknown>('GET', '/export'),
  logout: () => request<unknown>('POST', '/logout'),
};
