import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireOwner } from '@/lib/server/auth';
import { getReview, listFeedback } from '@/lib/server/reviews';
import { artifactFor } from '@/lib/server/reviewer';
import { signScreens } from '@/lib/server/site-screens';
import { logEvent } from '@/lib/server/events';
import { FeedbackView } from '@/components/feedback-view';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Feedback' };

export default async function FeedbackPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const review = await getReview((await params).id);
  if (!review) notFound();
  const [{ comments, reviewers }, artifact] = await Promise.all([
    listFeedback(review.id),
    artifactFor(review),
  ]);
  const shots = await signScreens(comments.flatMap((c) => c.screenshot_file_key ?? []));
  await logEvent(review.id, null, 'owner_viewed_feedback', { reviewers: reviewers.length });
  return (
    <div className="flex h-dvh flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-line bg-white px-3 py-2">
        <Link href={`/reviews/${review.id}`} className="text-sm text-muted hover:text-ink">
          ← Back
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-sm font-semibold">
          Feedback · {review.title || review.site_etld1 || 'Untitled PDF'}
        </h1>
      </header>
      {reviewers.length === 0 || !artifact ? (
        <p className="p-6 text-sm text-muted">
          No feedback yet. It appears here once a reviewer submits.
        </p>
      ) : (
        <FeedbackView
          reviewId={review.id}
          artifact={artifact}
          comments={comments.map(({ screenshot_file_key: k, ...c }) => ({
            ...c,
            screenshot_url: k ? (shots.get(k) ?? null) : null,
          }))}
          reviewers={reviewers}
        />
      )}
    </div>
  );
}
