import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { listInviteComments, resolveInvite, reviewerArtifact } from '@/lib/server/reviewer';
import { openRecordings } from '@/lib/server/recordings';
import { ReviewerApp } from '@/components/reviewer-app';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Review',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function ReviewerPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await resolveInvite(token);
  if (!ctx) notFound();
  const [comments, artifact, open] = await Promise.all([
    listInviteComments(ctx.invite.id),
    reviewerArtifact(ctx),
    ctx.invite.status === 'submitted' ? Promise.resolve([]) : openRecordings(ctx),
  ]);
  if (!artifact) notFound();
  return (
    <ReviewerApp
      token={token}
      inviteId={ctx.invite.id}
      title={ctx.review.title}
      context={ctx.review.context}
      artifact={artifact}
      nameHint={ctx.invite.name_hint}
      submittedAt={ctx.invite.status === 'submitted' ? ctx.invite.submitted_at : null}
      initialComments={comments.map(({ updatedAt: _u, ...c }) => c)}
      openRecordings={open}
    />
  );
}
