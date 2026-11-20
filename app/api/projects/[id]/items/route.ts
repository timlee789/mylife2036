import { body, handler, type Params } from '@/lib/http';
import { createItem } from '@/lib/projects';

export const POST = handler<Params<'id'>>(
  async (q, request, { params }) => ({ id: await createItem(q, (await params).id, await body(request)) }),
  201,
);
