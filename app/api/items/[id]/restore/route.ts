import { handler, type Params } from '@/lib/http';
import { restoreItem } from '@/lib/projects';

export const POST = handler<Params<'id'>>(async (q, _request, { params }) => ({ restored: await restoreItem(q, (await params).id) }));
