import { body, handler, type Params } from '@/lib/http';
import { deleteSubproject, getSubproject, updateSubproject } from '@/lib/projects';

export const GET = handler<Params<'id'>>(async (q, _request, { params }) => getSubproject(q, (await params).id));
export const PATCH = handler<Params<'id'>>(async (q, request, { params }) => ({
  result: await updateSubproject(q, (await params).id, await body(request)),
}));
export const DELETE = handler<Params<'id'>>(async (q, _request, { params }) => {
  await deleteSubproject(q, (await params).id);
  return undefined;
});
