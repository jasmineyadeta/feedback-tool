'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import * as Dialog from '@radix-ui/react-dialog';
import { btn } from './ui';

export function DeleteReview({ reviewId }: { reviewId: string }) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  async function del() {
    const res = await fetch(`/api/reviews/${reviewId}`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirm: text }),
    }).catch(() => null);
    if (!res?.ok) return setError("We couldn't delete the review. Try again.");
    router.push('/reviews');
    router.refresh();
  }
  return (
    <section className="mt-12 border-t border-line pt-6">
      <Dialog.Root>
        <Dialog.Trigger className={btn.danger}>Delete review</Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/30" />
          <Dialog.Content className="fixed left-1/2 top-1/2 w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-6 shadow-lg">
            <Dialog.Title className="text-lg font-semibold">Delete this review?</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-muted">
              This permanently deletes the file, every reviewer link, all comments and recordings.
              Type <strong>delete</strong> to confirm.
            </Dialog.Description>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-label="Type delete to confirm"
              className="mt-4 w-full rounded-md border border-line px-3 py-2"
            />
            {error && (
              <p role="alert" className="mt-2 text-sm text-red-700">
                {error}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <Dialog.Close className={btn.secondary}>Cancel</Dialog.Close>
              <button
                type="button"
                className={btn.danger}
                disabled={text.trim().toLowerCase() !== 'delete'}
                onClick={del}
              >
                Delete forever
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}
