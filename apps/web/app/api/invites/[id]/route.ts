import { z } from 'zod';
import { currentUser } from '@/lib/server/supabase';
import { notFound, ok, parseJson, unauthorized } from '@/lib/server/http';
import { deleteInvite, getOwnedInvite, revokeInvite } from '@/lib/server/reviews';
import { handle } from '@/lib/server/route';

const Patch = z.object({ action: z.literal('revoke') });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    if (!(await currentUser())) return unauthorized();
    const inv = await getOwnedInvite((await params).id);
    if (!inv) return notFound();
    const p = await parseJson(req, Patch);
    if (!p.ok) return p.res;
    await revokeInvite(inv.id);
    return ok({ revoked: true });
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    if (!(await currentUser())) return unauthorized();
    const inv = await getOwnedInvite((await params).id);
    if (!inv) return notFound();
    await deleteInvite(inv);
    return ok({ deleted: true });
  });
}
