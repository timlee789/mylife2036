import { body, handler, type Params } from '@/lib/http';
import { setProcedure } from '@/lib/projects';

export const PUT = handler<Params<'id'>>(async (q, request, { params }) => ({
  procedure: await setProcedure(q, (await params).id, (await body(request)).steps),
}));
