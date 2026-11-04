import { notFound, ok } from '@/lib/server/http';
import { resolveInvite } from '@/lib/server/reviewer';
import { adminClient } from '@/lib/server/supabase';
import { handle } from '@/lib/server/route';

type Ctx = { params: Promise<{ token: string }> };

/** Records that the reviewer read the audio disclosure (SPEC §3.2 step 3). */
export async function POST(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const ctx = await resolveInvite((await params).token);
    if (!ctx) return notFound();
    await adminClient()
      .from('reviewer_invites')
      .update({ audio_consent_at: new Date().toISOString() })
      .eq('id', ctx.invite.id)
      .is('audio_consent_at', null);
    return ok({ consented: true });
  });
}
