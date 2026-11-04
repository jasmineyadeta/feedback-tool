'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { GENERAL_NOTE_ID, LIMITS, type CommentDraft, type PdfAnchor } from '@ft/shared';
import { PdfViewer, type PdfMarker } from './pdf-viewer';
import { SiteViewer, type SiteFocus, type SiteMarker } from './site-viewer';
import { ScreenshotViewer, type ShotMarker } from './screenshot-viewer';
import { anchorLabel, quoteOf, type ReviewerArtifact } from '@/lib/artifact';
import { btn } from './ui';
import {
  ConsentSheet,
  PreviewSheet,
  RecordingBar,
  TalkNotice,
  useTalkThrough,
} from './talk-through';
import {
  ack,
  clearLocal,
  loadLocal,
  merge,
  mergeInto,
  newClientId,
  pendingOps,
  remove,
  saveLocal,
  sorted,
  upsert,
  type DraftState,
} from '@/lib/client/drafts';

type Props = {
  token: string;
  inviteId: string;
  title: string;
  context: string;
  artifact: ReviewerArtifact;
  nameHint: string;
  submittedAt: string | null;
  initialComments: CommentDraft[];
  openRecordings: string[];
};

type SaveStatus = 'idle' | 'saving' | 'saved' | 'offline' | 'error';
type DraftAnchor = NonNullable<CommentDraft['anchor']>;
type Composer = { clientId: string | null; anchor: DraftAnchor; text: string };

const SAVE_LABEL: Record<SaveStatus, string> = {
  idle: '',
  saving: 'Saving…',
  saved: 'All changes saved',
  offline: 'Offline — saved on this device, will sync',
  error: 'Not saved to the server yet — kept on this device',
};

export function ReviewerApp(p: Props) {
  const [state, setState] = useState<DraftState>(() => merge(p.initialComments, null));
  const ref = useRef(state);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [submittedAt, setSubmittedAt] = useState(p.submittedAt);
  const [picking, setPicking] = useState(false);
  const [selection, setSelection] = useState<PdfAnchor | null>(null);
  const [composer, setComposer] = useState<Composer | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [coach, setCoach] = useState(false);
  const [focus, setFocus] = useState<SiteFocus | null>(null);
  const art = p.artifact;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef<Promise<boolean> | null>(null);
  const readOnly = !!submittedAt;

  const sync = useCallback(async (): Promise<boolean> => {
    if (inflight.current) {
      await inflight.current;
    }
    const { ops, versions } = pendingOps(ref.current);
    if (!ops.length) {
      setStatus((s) => (s === 'idle' ? s : 'saved'));
      return true;
    }
    setStatus('saving');
    const run = (async () => {
      try {
        const res = await fetch(`/api/r/${p.token}/sync`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ops }),
        });
        if (!res.ok) {
          if (res.status === 409) {
            const body = (await res.json().catch(() => null)) as {
              error?: { code?: string };
            } | null;
            if (body?.error?.code === 'submitted') window.location.reload();
          }
          setStatus('error');
          return false;
        }
        const { acked } = (await res.json()) as { acked: string[] };
        ref.current = ack(ref.current, acked, versions);
        setState(ref.current);
        await saveLocal(p.inviteId, ref.current);
        const more = Object.keys(ref.current.queue).length > 0;
        setStatus(more ? 'saving' : 'saved');
        return true;
      } catch {
        setStatus('offline');
        return false;
      }
    })();
    inflight.current = run;
    const okd = await run;
    inflight.current = null;
    if (okd && Object.keys(ref.current.queue).length) return sync();
    return okd;
  }, [p.token, p.inviteId]);

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void sync(), 1000);
  }, [sync]);

  const commit = useCallback(
    (next: DraftState) => {
      ref.current = next;
      setState(next);
      void saveLocal(p.inviteId, next).then((ok) => !ok && console.warn('local draft save failed'));
      schedule();
    },
    [p.inviteId, schedule],
  );

  // Restore: replay anything still queued on this device over what the server has.
  useEffect(() => {
    let live = true;
    (async () => {
      if (readOnly) {
        await clearLocal(p.inviteId);
        setReady(true);
        return;
      }
      const local = await loadLocal(p.inviteId);
      if (!live) return;
      ref.current = merge(p.initialComments, local);
      setState(ref.current);
      await saveLocal(p.inviteId, ref.current);
      setReady(true);
      if (Object.keys(ref.current.queue).length) void sync();
    })();
    try {
      setCoach(!readOnly && localStorage.getItem('ft-coach-pdf') !== '1');
    } catch {
      setCoach(!readOnly);
    }
    const online = () => void sync();
    window.addEventListener('online', online);
    const retry = setInterval(() => {
      if (Object.keys(ref.current.queue).length && !inflight.current) void sync();
    }, 15000);
    return () => {
      live = false;
      window.removeEventListener('online', online);
      clearInterval(retry);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const list = useMemo(() => sorted(state).filter((c) => !c.general), [state]);
  const general = state.comments[GENERAL_NOTE_ID]?.text ?? '';
  const markers: PdfMarker[] = list.flatMap((c, i) =>
    c.anchor?.kind === 'pdf'
      ? [{ id: c.clientId, n: i + 1, anchor: c.anchor, active: c.clientId === active }]
      : [],
  );
  const siteMarkers: SiteMarker[] = list.flatMap((c, i) =>
    c.anchor?.kind === 'dom' ? [{ id: c.clientId, n: i + 1, anchor: c.anchor }] : [],
  );
  const shotMarkers: ShotMarker[] = list.flatMap((c, i) =>
    c.anchor?.kind === 'screenshot'
      ? [{ id: c.clientId, n: i + 1, anchor: c.anchor, active: c.clientId === active }]
      : [],
  );
  const pending = Object.keys(state.queue).length;
  const tt = useTalkThrough({
    token: p.token,
    inviteId: p.inviteId,
    openRecordings: readOnly ? [] : p.openRecordings,
    knownClientIds: () =>
      new Set([...Object.keys(ref.current.comments), ...Object.keys(ref.current.queue)]),
    external: art.kind !== 'pdf',
  });
  const recording = tt.phase === 'recording';
  const reanchoring = !!tt.reanchor && !tt.reanchor.anchor;
  const tapMarkers: PdfMarker[] = tt.taps.flatMap((t, i) =>
    t.fullAnchor.kind === 'pdf'
      ? [{ id: `tap-${i}`, n: i + 1, anchor: t.fullAnchor, active: true, label: `Tap ${i + 1}` }]
      : [],
  );
  const busyRecording = recording || tt.phase === 'uploading';

  // Escape cancels "tap the spot" mode.
  useEffect(() => {
    if (!picking) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPicking(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [picking]);

  function dismissCoach() {
    setCoach(false);
    try {
      localStorage.setItem('ft-coach-pdf', '1');
    } catch {
      /* private mode */
    }
  }

  function saveComposer() {
    if (!composer) return;
    const text = composer.text.trim();
    if (!text) return;
    const prev = composer.clientId ? state.comments[composer.clientId] : null;
    commit(
      upsert(ref.current, {
        clientId: composer.clientId ?? newClientId(),
        text: text.slice(0, LIMITS.commentMaxChars),
        anchor: composer.anchor,
        general: false,
        sortKey: prev?.sortKey ?? Date.now(),
      }),
    );
    setComposer(null);
  }

  function setGeneral(text: string) {
    if (text.trim())
      commit(
        upsert(ref.current, {
          clientId: GENERAL_NOTE_ID,
          text: text.slice(0, LIMITS.commentMaxChars),
          anchor: null,
          general: true,
          sortKey: 1e15,
        }),
      );
    else if (ref.current.comments[GENERAL_NOTE_ID]) commit(remove(ref.current, GENERAL_NOTE_ID));
  }

  function focusComment(id: string) {
    setActive(id);
    setListOpen(false);
    const c = ref.current.comments[id];
    if (art.kind === 'site' && c?.anchor) {
      const n = list.findIndex((x) => x.clientId === id) + 1;
      setFocus((f) => ({ anchor: c.anchor!, label: String(n), seq: (f?.seq ?? 0) + 1 }));
      return;
    }
    document
      .getElementById(`marker-${id}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  }

  const header = (
    <header className="flex shrink-0 items-center gap-3 border-b border-line bg-white px-3 py-2">
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-sm font-semibold">
          {p.title || (art.kind === 'pdf' ? 'PDF review' : 'Website review')}
        </h1>
        {p.context && (
          <button
            className="text-xs text-muted underline"
            aria-expanded={contextOpen}
            onClick={() => setContextOpen((v) => !v)}
          >
            {contextOpen ? 'Hide context' : 'What to look at'}
          </button>
        )}
      </div>
      <span className="hidden text-xs text-muted sm:inline" role="status" aria-live="polite">
        {readOnly ? 'Submitted' : SAVE_LABEL[status]}
      </span>
      {!readOnly && (
        <div className="hidden gap-2 md:flex">
          <button
            className={`${btn.primary} bg-rec`}
            disabled={busyRecording}
            onClick={() => void tt.start()}
          >
            Record
          </button>
          <button
            className={btn.secondary}
            disabled={busyRecording}
            onClick={() => setPicking((v) => !v)}
          >
            {picking ? 'Cancel' : 'Add comment'}
          </button>
          <button
            className={btn.secondary}
            disabled={busyRecording}
            onClick={() => setSubmitOpen(true)}
          >
            Submit
          </button>
        </div>
      )}
    </header>
  );

  return (
    <div className="flex h-dvh flex-col">
      {header}
      {contextOpen && (
        <p className="max-h-40 shrink-0 overflow-auto whitespace-pre-wrap border-b border-line bg-white px-3 py-2 text-sm">
          {p.context}
        </p>
      )}
      {readOnly && (
        <p className="shrink-0 bg-green-50 px-3 py-2 text-sm text-green-900" role="status">
          Thanks — your feedback was sent on {new Date(submittedAt!).toLocaleDateString()}. You can
          close this page.
        </p>
      )}
      <RecordingBar tt={tt} />
      <TalkNotice
        tt={tt}
        onType={() => {
          tt.setNotice(null);
          setPicking(true);
        }}
      />
      {reanchoring && (
        <p
          className="flex shrink-0 items-center gap-3 bg-accent px-3 py-2 text-sm text-white"
          role="status"
        >
          <span className="flex-1 text-center">Tap the spot this comment is about.</span>
          <button className="underline" onClick={() => tt.setReanchor(null)}>
            Cancel
          </button>
        </p>
      )}
      {picking && !recording && (
        <p className="shrink-0 bg-accent px-3 py-2 text-center text-sm text-white" role="status">
          Tap the spot your comment is about.
          <span className="sr-only">
            {' '}
            With a keyboard, press Tab to reach it, then Enter. Press Escape to cancel.
          </span>
        </p>
      )}
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          {art.kind === 'screenshot' ? (
            <ScreenshotViewer
              audience="reviewer"
              screens={art.screens}
              pagePath={art.pagePath}
              markers={[
                ...shotMarkers,
                ...(recording
                  ? tt.taps.flatMap((t, i) =>
                      t.fullAnchor.kind === 'screenshot'
                        ? [{ id: `tap-${i}`, n: i + 1, anchor: t.fullAnchor, active: true }]
                        : [],
                    )
                  : []),
              ]}
              picking={picking || recording || reanchoring}
              recording={recording && !tt.paused}
              onSnapshot={tt.pushSnapshot}
              onPick={(anchor) => {
                if (recording) return tt.tap(anchor);
                if (reanchoring) return tt.setReanchor({ clientId: tt.reanchor!.clientId, anchor });
                setPicking(false);
                setComposer({ clientId: null, anchor, text: '' });
              }}
              onMarker={(id) => {
                setActive(id);
                setListOpen(true);
              }}
            />
          ) : art.kind === 'site' ? (
            <SiteViewer
              enterUrl={art.enterUrl}
              proxyOrigin={art.proxyOrigin}
              markers={siteMarkers}
              mode={
                recording
                  ? tt.paused
                    ? 'browse' // paused: the site works normally (menus, buttons)
                    : 'record'
                  : picking || reanchoring
                    ? 'pick'
                    : 'browse'
              }
              focus={focus}
              onTap={(t) => tt.tap(t.fullAnchor, t.eid)}
              onSnapshot={tt.pushSnapshot}
              onPick={(anchor) => {
                if (reanchoring) return tt.setReanchor({ clientId: tt.reanchor!.clientId, anchor });
                setPicking(false);
                setComposer({ clientId: null, anchor, text: '' });
              }}
            />
          ) : (
            <PdfViewer
              url={art.url}
              pageCount={art.pageCount}
              markers={recording ? [...markers, ...tapMarkers] : markers}
              picking={picking || recording || reanchoring}
              onPick={(anchor) => {
                if (recording) return tt.tap(anchor);
                if (reanchoring) return tt.setReanchor({ clientId: tt.reanchor!.clientId, anchor });
                setPicking(false);
                setComposer({ clientId: null, anchor, text: '' });
              }}
              onSelection={readOnly ? undefined : setSelection}
              onMarker={(id) => {
                setActive(id);
                setListOpen(true);
              }}
            />
          )}
        </div>
        <aside
          className={`${listOpen ? 'fixed inset-x-0 bottom-0 z-30 max-h-[70dvh] rounded-t-xl shadow-2xl' : 'hidden'} flex-col overflow-auto border-l border-line bg-white md:static md:flex md:max-h-none md:w-80 md:rounded-none md:shadow-none`}
          aria-label="Your comments"
        >
          <div className="sticky top-0 flex items-center justify-between border-b border-line bg-white px-4 py-3">
            <h2 className="text-sm font-semibold">Your comments ({list.length})</h2>
            <button className="text-sm text-muted md:hidden" onClick={() => setListOpen(false)}>
              Close
            </button>
          </div>
          {list.length === 0 && (
            <p className="p-4 text-sm text-muted">
              {readOnly ? 'No pinned comments.' : 'Nothing yet. Tap “Add comment” to start.'}
            </p>
          )}
          <ol className="divide-y divide-line">
            {list.map((c, i) => (
              <li
                key={c.clientId}
                className={`p-4 text-sm ${active === c.clientId ? 'bg-blue-50' : ''}`}
                data-testid="reviewer-comment"
              >
                <button className="block w-full text-left" onClick={() => focusComment(c.clientId)}>
                  <span className="text-xs text-muted">
                    {i + 1} · {anchorLabel(c.anchor)}
                    {state.queue[c.clientId] ? ' · not synced yet' : ''}
                  </span>
                  {quoteOf(c.anchor) && (
                    <span className="mt-1 block truncate border-l-2 border-amber-300 pl-2 text-xs text-muted">
                      {quoteOf(c.anchor)}
                    </span>
                  )}
                  <span className="mt-1 block whitespace-pre-wrap">{c.text}</span>
                </button>
                {!readOnly && (
                  <div className="mt-2 flex gap-3 text-xs">
                    <button
                      className="underline"
                      onClick={() =>
                        setComposer({ clientId: c.clientId, anchor: c.anchor!, text: c.text })
                      }
                    >
                      Edit
                    </button>
                    <button
                      className="text-red-700 underline"
                      onClick={() => commit(remove(ref.current, c.clientId))}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ol>
          {readOnly && general && (
            <div className="border-t border-line p-4 text-sm">
              <h3 className="text-xs font-semibold text-muted">General note</h3>
              <p className="mt-1 whitespace-pre-wrap">{general}</p>
            </div>
          )}
        </aside>
      </div>

      {/* Mobile action bar */}
      {!readOnly && (
        <nav
          className={`${recording ? 'hidden' : 'grid'} shrink-0 grid-cols-4 gap-1.5 border-t border-line bg-white p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden`}
        >
          <button
            className={`${btn.primary} bg-rec px-2`}
            disabled={busyRecording}
            onClick={() => void tt.start()}
          >
            Record
          </button>
          <button
            className={`${btn.secondary} px-2`}
            disabled={busyRecording}
            onClick={() => setPicking((v) => !v)}
          >
            {picking ? 'Cancel' : 'Add comment'}
          </button>
          <button className={`${btn.secondary} px-2`} onClick={() => setListOpen(true)}>
            Comments ({list.length})
          </button>
          <button
            className={`${btn.secondary} px-2`}
            disabled={busyRecording}
            onClick={() => setSubmitOpen(true)}
          >
            Submit
          </button>
        </nav>
      )}
      {readOnly && (
        <nav className="shrink-0 border-t border-line bg-white p-2 md:hidden">
          <button className={`${btn.secondary} w-full`} onClick={() => setListOpen(true)}>
            Your comments ({list.length})
          </button>
        </nav>
      )}

      {selection && !composer && !picking && (
        <button
          className={`${btn.primary} fixed bottom-20 left-1/2 z-20 -translate-x-1/2 shadow-lg md:bottom-16`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setComposer({ clientId: null, anchor: selection, text: '' });
            setSelection(null);
            window.getSelection()?.removeAllRanges();
          }}
        >
          Comment on selection
        </button>
      )}

      {coach && ready && (
        <div className="fixed inset-x-3 top-16 z-20 mx-auto max-w-sm rounded-lg bg-ink p-4 text-sm text-white shadow-xl md:right-6 md:left-auto">
          <p>Hit record and talk.</p>
          <p>Tap things to point at them.</p>
          <p>That’s it.</p>
          <button className="mt-3 text-sm font-medium underline" onClick={dismissCoach}>
            Got it
          </button>
        </div>
      )}

      {composer && (
        <div
          className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl md:inset-x-auto md:right-6 md:bottom-6 md:w-96 md:rounded-lg md:border"
          role="dialog"
          aria-label="Comment"
          onKeyDown={(e) => e.key === 'Escape' && setComposer(null)}
        >
          <p className="text-xs text-muted">
            {anchorLabel(composer.anchor)}
            {quoteOf(composer.anchor) ? ` · “${quoteOf(composer.anchor)!.slice(0, 60)}”` : ''}
          </p>
          <label htmlFor="composer" className="sr-only">
            Your comment
          </label>
          <textarea
            id="composer"
            autoFocus
            rows={4}
            maxLength={LIMITS.commentMaxChars}
            value={composer.text}
            onChange={(e) => setComposer({ ...composer, text: e.target.value })}
            className="mt-2 w-full rounded-md border border-line p-2 text-base"
            placeholder="What do you think about this part?"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button className={btn.secondary} onClick={() => setComposer(null)}>
              Cancel
            </button>
            <button className={btn.primary} disabled={!composer.text.trim()} onClick={saveComposer}>
              Save comment
            </button>
          </div>
        </div>
      )}

      <ConsentSheet tt={tt} />
      <PreviewSheet
        tt={tt}
        onAccept={(keep, discard, merges) => {
          let next = ref.current;
          for (const m of merges) next = mergeInto(next, m.from, m.into);
          for (const c of keep) next = upsert(next, c);
          for (const id of discard) next = remove(next, id);
          commit(next);
        }}
      />
      <SubmitSheet
        open={submitOpen}
        onOpenChange={setSubmitOpen}
        nameHint={p.nameHint}
        count={list.length}
        general={general}
        onGeneral={setGeneral}
        pending={pending}
        flush={sync}
        token={p.token}
        onDone={(at) => {
          setSubmittedAt(at);
          setSubmitOpen(false);
          void clearLocal(p.inviteId);
        }}
      />
    </div>
  );
}

function SubmitSheet(p: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  nameHint: string;
  count: number;
  general: string;
  onGeneral: (t: string) => void;
  pending: number;
  flush: () => Promise<boolean>;
  token: string;
  onDone: (submittedAt: string) => void;
}) {
  const [name, setName] = useState(p.nameHint);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const empty = p.count === 0 && !p.general.trim();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (!(await p.flush())) {
        setError('We couldn’t save your latest changes yet. Check your connection and try again.');
        return;
      }
      const res = await fetch(`/api/r/${p.token}/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, email }),
      });
      const body = (await res.json().catch(() => null)) as {
        submittedAt?: string;
        error?: { message: string };
      } | null;
      if (!res.ok || !body?.submittedAt) {
        setError(body?.error?.message ?? 'Something went wrong. Try again in a moment.');
        return;
      }
      p.onDone(body.submittedAt);
    } catch {
      setError('You seem to be offline. Your comments are saved on this device — try again soon.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root open={p.open} onOpenChange={p.onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[90dvh] overflow-auto rounded-t-xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl md:inset-x-auto md:top-1/2 md:bottom-auto md:left-1/2 md:w-[28rem] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl">
          <Dialog.Title className="text-lg font-semibold">Send your feedback</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted">
            {p.count} comment{p.count === 1 ? '' : 's'}. Once you send, you can’t make changes.
          </Dialog.Description>
          <form onSubmit={submit} className="mt-4 space-y-3">
            <label className="block text-sm">
              <span className="font-medium">General note (optional)</span>
              <textarea
                rows={3}
                maxLength={LIMITS.commentMaxChars}
                defaultValue={p.general}
                onChange={(e) => p.onGeneral(e.target.value)}
                className="mt-1 w-full rounded-md border border-line p-2 text-base"
                placeholder="Overall impressions, anything not tied to one spot"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Your name</span>
              <input
                required
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                className="mt-1 w-full rounded-md border border-line p-2 text-base"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Your email</span>
              <input
                required
                type="email"
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className="mt-1 w-full rounded-md border border-line p-2 text-base"
              />
              <span className="mt-1 block text-xs text-muted">
                Shared with the person who asked for feedback, so they can thank you.
              </span>
            </label>
            {error && (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            )}
            {empty && (
              <p className="text-sm text-muted">Add at least one comment or a general note.</p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Dialog.Close className={btn.secondary} type="button">
                Keep reviewing
              </Dialog.Close>
              <button className={btn.primary} disabled={busy || empty}>
                {busy ? 'Sending…' : 'Submit'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
