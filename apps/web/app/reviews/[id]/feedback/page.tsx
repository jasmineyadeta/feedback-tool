import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireOwner } from '@/lib/server/auth';
import { getReview, listFeedback, signedPdfUrl } from '@/lib/server/reviews';
import { logEvent } from '@/lib/server/events';
import { FeedbackView } from '@/components/feedback-view';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Feedback' };

export default async function FeedbackPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const review = await getReview((await params).id);
  if (!review) notFound();
  const [{ comments, reviewers }, pdfUrl] = await Promise.all([
    listFeedback(review.id),
    signedPdfUrl(review),
  ]);
  await logEvent(review.id, null, 'owner_viewed_feedback', { reviewers: reviewers.length });
  return (
    <div className="flex h-dvh flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-line bg-white px-3 py-2">
        <Link href={`/reviews/${review.id}`} className="text-sm text-muted hover:text-ink">
          ← Back
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-sm font-semibold">
          Feedback · {review.title || 'Untitled PDF'}
        </h1>
      </header>
      {reviewers.length === 0 || !pdfUrl ? (
        <p className="p-6 text-sm text-muted">
          No feedback yet. It appears here once a reviewer submits.
        </p>
      ) : (
        <FeedbackView
          reviewId={review.id}
          pdfUrl={pdfUrl}
          pageCount={review.pdf_page_count ?? 1}
          comments={comments}
          reviewers={reviewers}
        />
      )}
    </div>
  );
}
