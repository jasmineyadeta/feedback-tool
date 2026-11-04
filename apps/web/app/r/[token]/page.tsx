import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { listInviteComments, resolveInvite, reviewerPdfUrl } from '@/lib/server/reviewer';
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
  const [comments, pdfUrl, open] = await Promise.all([
    listInviteComments(ctx.invite.id),
    reviewerPdfUrl(ctx),
    ctx.invite.status === 'submitted' ? Promise.resolve([]) : openRecordings(ctx),
  ]);
  if (!pdfUrl) notFound();
  return (
    <ReviewerApp
      token={token}
      inviteId={ctx.invite.id}
      title={ctx.review.title}
      context={ctx.review.context}
      pageCount={ctx.review.pdf_page_count ?? 1}
      pdfUrl={pdfUrl}
      nameHint={ctx.invite.name_hint}
      submittedAt={ctx.invite.status === 'submitted' ? ctx.invite.submitted_at : null}
      initialComments={comments.map(({ updatedAt: _u, ...c }) => c)}
      openRecordings={open}
    />
  );
}
