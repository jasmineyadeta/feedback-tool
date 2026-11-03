'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LIMITS } from '@ft/shared/limits';
import { btn } from './ui';

type Err = { error?: { message?: string } };
async function errMsg(res: Response | null): Promise<string> {
  const b = (await res?.json().catch(() => null)) as Err | null;
  return b?.error?.message ?? "We couldn't reach the server. Check your connection and try again.";
}

export function NewReviewForm() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const file = fd.get('file');
    if (!(file instanceof File) || file.size === 0) return setError('Choose a PDF to upload.');
    if (file.size > LIMITS.pdfMaxBytes)
      return setError('That PDF is larger than 15 MB. Export a smaller version and try again.');
    setBusy('Creating review…');
    const res = await fetch('/api/reviews', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        artifactType: 'pdf',
        title: fd.get('title'),
        context: fd.get('context'),
      }),
    }).catch(() => null);
    if (!res?.ok) {
      setBusy(null);
      return setError(await errMsg(res));
    }
    const { id, upload } = (await res.json()) as { id: string; upload: { url: string } };
    setBusy('Uploading…');
    const put = await fetch(upload.url, {
      method: 'PUT',
      headers: { 'content-type': 'application/pdf', 'x-upsert': 'true' },
      body: file,
    }).catch(() => null);
    if (!put?.ok) {
      setBusy(null);
      return setError('The upload failed. Check your connection and try again.');
    }
    setBusy('Checking your PDF…');
    const fin = await fetch(`/api/reviews/${id}/pdf`, { method: 'POST' }).catch(() => null);
    if (!fin?.ok) {
      setBusy(null);
      setError(await errMsg(fin));
      await fetch(`/api/reviews/${id}`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirm: 'delete' }),
      }).catch(() => null);
      return;
    }
    router.push(`/reviews/${id}`);
  }

  return (
    <form onSubmit={submit} className="flex max-w-xl flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">What should reviewers look at?</legend>
        <div className="flex gap-2 text-sm">
          <span className="rounded-md bg-ink px-3 py-1.5 font-medium text-white">PDF</span>
          <span
            className="rounded-md border border-line px-3 py-1.5 text-muted"
            title="Arrives in the next milestone"
          >
            Website (coming soon)
          </span>
        </div>
      </fieldset>
      <label className="flex flex-col gap-1 text-sm font-medium">
        PDF (up to 15 MB, 30 pages)
        <input
          name="file"
          type="file"
          accept="application/pdf,.pdf"
          required
          className="text-sm font-normal"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Title <span className="font-normal text-muted">optional</span>
        <input
          name="title"
          maxLength={LIMITS.titleMaxChars}
          className="rounded-md border border-line bg-white px-3 py-2 text-base font-normal"
          placeholder="Resume, fall 2026"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Context for reviewers <span className="font-normal text-muted">optional</span>
        <textarea
          name="context"
          maxLength={LIMITS.contextMaxChars}
          rows={3}
          className="rounded-md border border-line bg-white px-3 py-2 text-base font-normal"
          placeholder="I'm applying for associate product manager roles at fintech companies."
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <div>
        <button type="submit" disabled={!!busy} className={btn.primary}>
          {busy ?? 'Create review'}
        </button>
      </div>
    </form>
  );
}
