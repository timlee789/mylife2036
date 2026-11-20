import { body, handler, type Params } from '@/lib/http';
import { deletePhase, updatePhase } from '@/lib/projects';

export const PATCH = handler<Params<'id'>>(async (q, request, { params }) => ({
  result: await updatePhase(q, (await params).id, await body(request)),
}));
export const DELETE = handler<Params<'id'>>(async (q, _request, { params }) => {
  await deletePhase(q, (await params).id);
  return undefined;
});
