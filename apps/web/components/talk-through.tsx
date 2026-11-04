'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import type {
  CommentDraft,
  Anchor,
  ProposedComment,
  RecordingStatus,
  TimelineSnapshot,
  TimelineTap,
} from '@ft/shared';
import { btn } from './ui';
import { anchorLabel } from '@/lib/artifact';
import { Recorder, requestMic } from '@/lib/client/recorder';
import { snapshotPdf } from '@/lib/client/pdf-timeline';
import {
  deleteRecording,
  listRecordings,
  newClientId,
  putRecording,
  type StoredRecording,
} from '@/lib/client/drafts';

/**
 * Talk-through (SPEC §3.2 steps 3–5). Audio is written to IndexedDB before upload and removed only
 * after the server ACKs; processing status is polled; results come back as a split preview.
 */
type Phase = 'idle' | 'consent' | 'recording' | 'uploading' | 'processing';
type Notice = { tone: 'info' | 'warn'; text: string; typeInstead?: boolean } | null;

export const SOURCE_LABEL: Record<string, string> = {
  tap: 'Tapped',
  ai: 'Auto-placed',
  viewport: 'On screen',
  manual: 'Typed',
};

const fmt = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function useTalkThrough(p: {
  token: string;
  inviteId: string;
  openRecordings: string[];
  knownClientIds: () => Set<string>;
  /** Website: snapshots and taps arrive from the overlay (pushSnapshot/tap) instead of DOM polling. */
  external?: boolean;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [taps, setTaps] = useState<TimelineTap[]>([]);
  const [notice, setNotice] = useState<Notice>(null);
  const [preview, setPreview] = useState<{ clientId: string; items: ProposedComment[] } | null>(
    null,
  );
  /** Preview "Re-anchor": the sheet hides, the reviewer taps the PDF, the new anchor comes back. */
  const [reanchor, setReanchor] = useState<{ clientId: string; anchor?: Anchor } | null>(null);
  const rec = useRef<Recorder | null>(null);
  const snaps = useRef<TimelineSnapshot[]>([]);
  const tapsRef = useRef<TimelineTap[]>([]);
  const polling = useRef(new Set<string>());
  const timers = useRef<ReturnType<typeof setInterval>[]>([]);
  /** Second safety net if IndexedDB is unavailable: retried from memory while the page is open. */
  const memory = useRef(new Map<string, StoredRecording>());

  const snap = useCallback(() => {
    if (p.external) return;
    const el = document.querySelector<HTMLElement>('[data-testid="pdf-scroller"]');
    if (!el || !rec.current || rec.current.paused) return;
    const s = snapshotPdf(el, rec.current.clock());
    if (s && snaps.current.length < 1200) snaps.current.push(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Website snapshot from the overlay, stamped on our clock (frames have their own clocks). */
  const pushSnapshot = useCallback((s: TimelineSnapshot) => {
    if (!rec.current || rec.current.paused || snaps.current.length >= 1200) return;
    snaps.current.push({ ...s, t: rec.current.clock() });
  }, []);

  const poll = useCallback(
    (clientId: string) => {
      if (polling.current.has(clientId)) return;
      polling.current.add(clientId);
      setPhase((ph) => (ph === 'idle' ? 'processing' : ph));
      const tick = async () => {
        let st: RecordingStatus | null = null;
        try {
          const res = await fetch(`/api/r/${p.token}/recordings/${clientId}`, {
            cache: 'no-store',
          });
          if (res.ok) st = (await res.json()) as RecordingStatus;
        } catch {
          /* offline: try again */
        }
        if (st?.status === 'ok') {
          polling.current.delete(clientId);
          setPhase('idle');
          const known = p.knownClientIds();
          const items = st.proposed.filter((c) => !known.has(c.clientId));
          if (items.length) {
            setNotice(null);
            setPreview({ clientId, items });
          } else if (!st.proposed.length)
            setNotice({
              tone: 'warn',
              text: 'We didn’t catch any words in that recording. Try again, or type your comment.',
              typeInstead: true,
            });
          return;
        }
        if (st?.status === 'failed') {
          polling.current.delete(clientId);
          setPhase('idle');
          setNotice({
            tone: 'warn',
            text: 'We couldn’t transcribe that recording. Your audio is saved. You can type your comments instead.',
            typeInstead: true,
          });
          return;
        }
        if (st?.slow)
          setNotice({
            tone: 'info',
            text: 'Your recording is saved — transcription is taking longer than usual. You can keep going or type.',
            typeInstead: true,
          });
        setTimeout(tick, st?.slow ? 5000 : 1500);
      };
      void tick();
    },
    [p],
  );

  const upload = useCallback(
    async (r: StoredRecording): Promise<boolean> => {
      const form = new FormData();
      form.set(
        'audio',
        new Blob([r.bytes], { type: r.meta.mimeType }),
        `audio.${r.meta.mimeType.includes('mp4') ? 'm4a' : 'webm'}`,
      );
      form.set('meta', JSON.stringify(r.meta));
      try {
        const res = await fetch(`/api/r/${p.token}/recordings`, { method: 'POST', body: form });
        if (res.ok) {
          memory.current.delete(r.clientId);
          await deleteRecording(r.clientId); // server has it now
          poll(r.clientId);
          return true;
        }
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          // The server refused it for good (format, size). Keep it on the device; tell them why.
          setNotice({
            tone: 'warn',
            text: body?.error?.message ?? 'That recording couldn’t be used.',
            typeInstead: true,
          });
          setPhase('idle');
          return false;
        }
      } catch {
        /* offline */
      }
      setNotice({
        tone: 'info',
        text: 'Your recording is saved on this device and will upload when you’re back online.',
      });
      setPhase('idle');
      return false;
    },
    [p.token, poll],
  );

  // On load: re-send anything still on the device, and resume polling the server's open recordings.
  useEffect(() => {
    let live = true;
    let flushing = false;
    const flush = async () => {
      if (flushing) return;
      flushing = true;
      const all = new Map(memory.current);
      for (const r of await listRecordings(p.inviteId)) all.set(r.clientId, r);
      for (const r of all.values()) if (live) await upload(r);
      flushing = false;
    };
    void flush();
    for (const id of p.openRecordings) poll(id);
    const online = () => void flush();
    window.addEventListener('online', online);
    const every = setInterval(() => void flush(), 15000);
    return () => {
      live = false;
      window.removeEventListener('online', online);
      clearInterval(every);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function begin() {
    setNotice(null);
    const mic = await requestMic();
    if (!mic.ok) {
      setPhase('idle');
      setNotice({
        tone: 'warn',
        text:
          mic.reason === 'denied'
            ? 'Your microphone is blocked. Allow it in your browser settings, or type your comments instead.'
            : 'Recording isn’t available in this browser. You can type your comments instead.',
        typeInstead: true,
      });
      return;
    }
    snaps.current = [];
    tapsRef.current = [];
    setTaps([]);
    const r = new Recorder(mic.stream, () => void stop());
    rec.current = r;
    r.start();
    setPhase('recording');
    setPaused(false);
    snap();
    const el = document.querySelector<HTMLElement>('[data-testid="pdf-scroller"]');
    let scrollT: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      if (scrollT) clearTimeout(scrollT);
      scrollT = setTimeout(snap, 250); // scroll-end snapshot
    };
    el?.addEventListener('scroll', onScroll, { passive: true });
    timers.current = [setInterval(snap, 1000), setInterval(() => setElapsed(r.elapsedMs()), 250)];
    cleanupScroll.current = () => el?.removeEventListener('scroll', onScroll);
  }
  const cleanupScroll = useRef<() => void>(() => undefined);

  function endTimers() {
    for (const t of timers.current) clearInterval(t);
    timers.current = [];
    cleanupScroll.current();
  }

  async function start() {
    let consented = false;
    try {
      consented = localStorage.getItem('ft-audio-consent') === '1';
    } catch {
      /* private mode */
    }
    if (!consented) return setPhase('consent');
    await begin();
  }

  async function agree() {
    try {
      localStorage.setItem('ft-audio-consent', '1');
    } catch {
      /* private mode */
    }
    void fetch(`/api/r/${p.token}/consent`, { method: 'POST' }).catch(() => undefined);
    await begin();
  }

  async function stop() {
    const r = rec.current;
    if (!r) return;
    snap();
    endTimers();
    const durationMs = r.elapsedMs();
    const blob = await r.stop();
    rec.current = null;
    setPhase('uploading');
    const clientId = newClientId();
    const stored: StoredRecording = {
      clientId,
      inviteId: p.inviteId,
      bytes: await blob.arrayBuffer(),
      meta: {
        clientId,
        mimeType: blob.type || r.mimeType,
        durationMs,
        timeline: { snapshots: snaps.current, taps: tapsRef.current },
      },
      savedAt: Date.now(),
    };
    memory.current.set(clientId, stored);
    if (!(await putRecording(stored)))
      console.warn('could not keep the recording on this device; keeping it in memory');
    setTaps([]);
    await upload(stored);
  }

  function cancel() {
    endTimers();
    rec.current?.cancel();
    rec.current = null;
    setTaps([]);
    setPhase('idle');
  }

  function togglePause() {
    const r = rec.current;
    if (!r) return;
    if (r.paused) r.resume();
    else r.pause();
    setPaused(r.paused);
  }

  function tap(anchor: Anchor, eid: string | null = null) {
    if (!rec.current || rec.current.paused) return;
    const t: TimelineTap = { t: rec.current.clock(), eid, fullAnchor: anchor };
    if (tapsRef.current.length >= 200) return;
    tapsRef.current = [...tapsRef.current, t];
    setTaps(tapsRef.current);
  }

  return {
    phase,
    setPhase,
    elapsed,
    paused,
    taps,
    notice,
    setNotice,
    preview,
    setPreview,
    reanchor,
    setReanchor,
    start,
    agree,
    stop,
    cancel,
    togglePause,
    tap,
    pushSnapshot,
  };
}

export type TalkThrough = ReturnType<typeof useTalkThrough>;

export function RecordingBar({ tt }: { tt: TalkThrough }) {
  if (tt.phase !== 'recording') return null;
  return (
    <div
      className="flex shrink-0 items-center gap-3 bg-ink px-3 py-2 text-sm text-white"
      role="status"
      aria-label="Recording"
    >
      <span
        className={`h-3 w-3 rounded-full bg-rec ${tt.paused ? '' : 'animate-pulse'}`}
        aria-hidden
      />
      <span className="tabular-nums">{fmt(tt.elapsed)}</span>
      <span className="hidden min-w-0 flex-1 truncate text-white/70 sm:inline">
        {tt.paused ? 'Paused' : 'Talk, and tap things to point at them'}
      </span>
      <span className="flex-1 sm:hidden" />
      <button className="rounded px-2 py-1 ring-1 ring-white/40" onClick={tt.togglePause}>
        {tt.paused ? 'Resume' : 'Pause'}
      </button>
      <button
        className="rounded bg-white px-3 py-1 font-medium text-ink"
        onClick={() => void tt.stop()}
      >
        Stop
      </button>
      <button className="rounded px-2 py-1 text-white/80 underline" onClick={tt.cancel}>
        Cancel
      </button>
    </div>
  );
}

export function TalkNotice({ tt, onType }: { tt: TalkThrough; onType: () => void }) {
  const busy = tt.phase === 'uploading' || tt.phase === 'processing';
  if (!tt.notice && !busy) return null;
  return (
    <div
      className={`flex shrink-0 flex-wrap items-center gap-2 px-3 py-2 text-sm ${tt.notice?.tone === 'warn' ? 'bg-amber-50 text-amber-950' : 'bg-blue-50 text-blue-950'}`}
      role="status"
    >
      <span className="min-w-0 flex-1">
        {tt.notice?.text ??
          (tt.phase === 'uploading'
            ? 'Saving your recording…'
            : 'Turning your recording into comments…')}
      </span>
      {tt.notice?.typeInstead && (
        <button className="font-medium underline" onClick={onType}>
          Type a comment
        </button>
      )}
      {tt.notice && (
        <button className="text-xs underline" onClick={() => tt.setNotice(null)}>
          Dismiss
        </button>
      )}
    </div>
  );
}

export function ConsentSheet({ tt }: { tt: TalkThrough }) {
  return (
    <Dialog.Root open={tt.phase === 'consent'} onOpenChange={(o) => !o && tt.setPhase('idle')}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 rounded-t-xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl md:inset-x-auto md:top-1/2 md:bottom-auto md:left-1/2 md:w-[26rem] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl">
          <Dialog.Title className="text-lg font-semibold">Before you record</Dialog.Title>
          <Dialog.Description asChild>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-ink">
              <li>Your voice is recorded while you review.</li>
              <li>It’s turned into text on this computer — it isn’t sent to an outside service.</li>
              <li>
                The person who asked for feedback can listen to it for 90 days, then it’s deleted.
              </li>
              <li>It’s never used to train AI.</li>
            </ul>
          </Dialog.Description>
          <p className="mt-3 text-xs text-muted">
            <a href="/privacy" target="_blank" rel="noopener" className="underline">
              Read the privacy notice
            </a>{' '}
            (opens in a new tab)
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close className={btn.secondary}>Not now</Dialog.Close>
            <button className={btn.primary} onClick={() => void tt.agree()}>
              Start recording
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Split preview (SPEC §3.2 step 5): edit text or delete, then "Looks good" saves them all. */
export function PreviewSheet({
  tt,
  onAccept,
}: {
  tt: TalkThrough;
  onAccept: (
    keep: CommentDraft[],
    discard: string[],
    merges: { from: string; into: string }[],
  ) => void;
}) {
  const [items, setItems] = useState<ProposedComment[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [merges, setMerges] = useState<{ from: string; into: string }[]>([]);
  const open = !!tt.preview && !tt.reanchor;
  useEffect(() => {
    setItems(tt.preview?.items ?? []);
    setRemoved([]);
    setMerges([]);
  }, [tt.preview]);
  // A re-anchor tap came back from the viewer: the reviewer pointed at it, so it's a tap anchor.
  const { reanchor, setReanchor } = tt;
  useEffect(() => {
    if (!reanchor?.anchor) return;
    const { clientId, anchor } = reanchor;
    setItems((l) => l.map((x) => (x.clientId === clientId ? { ...x, anchor, source: 'tap' } : x)));
    setReanchor(null);
  }, [reanchor, setReanchor]);

  /** Merge into the previous comment: words joined in order; the better anchor wins. */
  function mergeUp(i: number) {
    {
      const l = items;
      const prev = l[i - 1]!;
      const cur = l[i]!;
      const rank = { tap: 3, manual: 3, ai: 2, viewport: 1 } as const;
      const keepCur = rank[cur.source] > rank[prev.source];
      const merged: ProposedComment = {
        ...prev,
        text: `${prev.text.trim()} ${cur.text.trim()}`.trim(),
        transcriptOriginal: `${prev.transcriptOriginal} ${cur.transcriptOriginal}`,
        anchor: keepCur ? cur.anchor : prev.anchor,
        source: keepCur ? cur.source : prev.source,
        endMs: cur.endMs,
      };
      setMerges((m) => [...m, { from: cur.clientId, into: prev.clientId }]);
      setItems([...l.slice(0, i - 1), merged, ...l.slice(i + 1)]);
    }
  }

  function accept() {
    const base = Date.now();
    onAccept(
      items
        .filter((c) => c.text.trim())
        .map((c, i) => ({
          clientId: c.clientId,
          text: c.text.trim(),
          anchor: c.anchor,
          general: false,
          source: c.source,
          sortKey: base + i,
        })),
      [...removed, ...items.filter((c) => !c.text.trim()).map((c) => c.clientId)],
      merges,
    );
    tt.setPreview(null);
  }

  return (
    <Dialog.Root open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30" />
        <Dialog.Content
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col rounded-t-xl bg-white shadow-2xl md:inset-x-auto md:top-1/2 md:bottom-auto md:left-1/2 md:w-[32rem] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl"
        >
          <div className="border-b border-line p-4">
            <Dialog.Title className="text-lg font-semibold">Here’s what we heard</Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-muted">
              {items.length} comment{items.length === 1 ? '' : 's'}. Fix any words, or delete the
              ones you don’t want.
            </Dialog.Description>
          </div>
          <ol className="min-h-0 flex-1 divide-y divide-line overflow-auto">
            {items.map((c, i) => (
              <li key={c.clientId} className="p-4" data-testid="proposed-comment">
                <div className="flex items-center gap-2 text-xs text-muted">
                  <span className="rounded-full bg-paper px-2 py-0.5 font-medium text-ink ring-1 ring-line">
                    {SOURCE_LABEL[c.source] ?? c.source}
                  </span>
                  {c.anchor && <span>{anchorLabel(c.anchor)}</span>}
                  <button
                    className="ml-auto underline"
                    onClick={() => tt.setReanchor({ clientId: c.clientId })}
                  >
                    Re-anchor
                  </button>
                  {i > 0 && (
                    <button className="underline" onClick={() => mergeUp(i)}>
                      Merge with previous
                    </button>
                  )}
                  <button
                    className="text-red-700 underline"
                    onClick={() => {
                      setRemoved((r) => [...r, c.clientId]);
                      setItems((l) => l.filter((x) => x.clientId !== c.clientId));
                    }}
                  >
                    Delete
                  </button>
                </div>
                <label className="sr-only" htmlFor={`proposed-${i}`}>
                  Comment {i + 1}
                </label>
                <textarea
                  id={`proposed-${i}`}
                  rows={2}
                  value={c.text}
                  onChange={(e) =>
                    setItems((l) =>
                      l.map((x) =>
                        x.clientId === c.clientId ? { ...x, text: e.target.value } : x,
                      ),
                    )
                  }
                  className="mt-2 w-full rounded-md border border-line p-2 text-base"
                />
              </li>
            ))}
          </ol>
          <div className="flex justify-end gap-2 border-t border-line p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <button className={btn.primary} onClick={accept}>
              Looks good
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
