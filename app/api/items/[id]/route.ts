import { body, handler, type Params } from '@/lib/http';
import { deleteItem, updateItem } from '@/lib/projects';

export const PATCH = handler<Params<'id'>>(async (q, request, { params }) => ({
  result: await updateItem(q, (await params).id, await body(request)),
}));
export const DELETE = handler<Params<'id'>>(async (q, _request, { params }) => {
  await deleteItem(q, (await params).id);
  return undefined;
});
