import Link from 'next/link';
import { requireOwner } from '@/lib/server/auth';
import { listReviews } from '@/lib/server/reviews';
import { Shell, btn } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function Reviews() {
  await requireOwner();
  const reviews = await listReviews();
  return (
    <Shell>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Your reviews</h1>
        <Link href="/reviews/new" className={btn.primary}>
          New review
        </Link>
      </div>
      {reviews.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line bg-white p-8 text-center">
          <p className="font-medium">No reviews yet.</p>
          <p className="mt-1 text-sm text-muted">
            Add your resume PDF or portfolio site, then send the link to someone whose opinion you
            trust.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-line rounded-lg bg-white ring-1 ring-line">
          {reviews.map((r) => (
            <li key={r.id}>
              <Link
                href={`/reviews/${r.id}`}
                className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-paper"
              >
                <span className="font-medium">
                  {r.title ||
                    (r.artifact_type === 'pdf' ? 'Untitled PDF' : (r.site_etld1 ?? 'Website'))}
                </span>
                <span className="text-sm text-muted">
                  {r.artifact_type === 'pdf' ? 'PDF' : 'Website'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}
