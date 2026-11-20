import { body, handler, type Params } from '@/lib/http';
import { getProject, updateProject } from '@/lib/projects';

export const GET = handler<Params<'id'>>(async (q, _request, { params }) => getProject(q, (await params).id));
export const PATCH = handler<Params<'id'>>(async (q, request, { params }) => {
  const { id } = await params;
  return { result: await updateProject(q, id, await body(request)), project: await getProject(q, id) };
});
