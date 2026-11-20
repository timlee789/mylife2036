import { handler, type Params } from '@/lib/http';
import { applyProcedure } from '@/lib/projects';

export const POST = handler<Params<'id'>>(async (q, _request, { params }) => ({ steps: await applyProcedure(q, (await params).id) }));
