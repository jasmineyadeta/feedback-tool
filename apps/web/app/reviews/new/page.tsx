import { requireOwner } from '@/lib/server/auth';
import { Shell } from '@/components/ui';
import { NewReviewForm } from '@/components/new-review-form';

export default async function NewReview() {
  await requireOwner();
  return (
    <Shell>
      <h1 className="mb-6 text-2xl font-semibold">New review</h1>
      <NewReviewForm />
    </Shell>
  );
}
