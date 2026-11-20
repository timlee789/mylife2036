import { body, handler, type Params } from '@/lib/http';
import { deleteStep, updateStep } from '@/lib/projects';

export const PATCH = handler<Params<'id'>>(async (q, request, { params }) => ({
  result: await updateStep(q, (await params).id, await body(request)),
}));
export const DELETE = handler<Params<'id'>>(async (q, _request, { params }) => {
  await deleteStep(q, (await params).id);
  return undefined;
});
