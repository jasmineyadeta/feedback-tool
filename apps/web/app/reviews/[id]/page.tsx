import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireOwner } from '@/lib/server/auth';
import { getReview, listInvites } from '@/lib/server/reviews';
import { Shell } from '@/components/ui';
import { InvitePanel } from '@/components/invite-panel';
import { DeleteReview } from '@/components/delete-review';

export const dynamic = 'force-dynamic';

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const review = await getReview((await params).id);
  if (!review) notFound();
  const invites = await listInvites(review.id);
  const submitted = invites.filter((i) => i.status === 'submitted').length;
  return (
    <Shell>
      <Link href="/reviews" className="text-sm text-muted hover:text-ink">
        ← All reviews
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">{review.title || 'Untitled PDF'}</h1>
      <p className="mt-1 text-sm text-muted">
        PDF
        {review.pdf_page_count
          ? ` · ${review.pdf_page_count} page${review.pdf_page_count > 1 ? 's' : ''}`
          : ''}
      </p>
      {review.context && (
        <p className="mt-4 max-w-2xl whitespace-pre-wrap rounded-md bg-white p-4 text-sm ring-1 ring-line">
          {review.context}
        </p>
      )}

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Feedback</h2>
          {submitted > 0 && (
            <Link href={`/reviews/${review.id}/feedback`} className="text-sm font-medium underline">
              Open feedback ({submitted})
            </Link>
          )}
        </div>
        {submitted === 0 && (
          <p className="mt-1 text-sm text-muted">Feedback appears here once a reviewer submits.</p>
        )}
      </section>

      <InvitePanel reviewId={review.id} initial={invites} />
      <DeleteReview reviewId={review.id} />
    </Shell>
  );
}
