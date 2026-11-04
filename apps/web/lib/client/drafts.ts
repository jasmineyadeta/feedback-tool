import type { CommentDraft, SyncOp } from '@ft/shared';

/**
 * Reviewer drafts (SPEC §3.2 step 9, CLAUDE.md "comments must never be silently lost").
 * Every change is written to IndexedDB first and queued; a queue entry is removed only after the
 * server ACKs that exact version. On reload, queued local changes are replayed over server state.
 */
export type QueueEntry = { op: 'upsert' | 'delete' | 'merge'; v: number; into?: string };
export type DraftState = {
  comments: Record<string, CommentDraft>;
  queue: Record<string, QueueEntry>;
};

export const emptyState = (): DraftState => ({ comments: {}, queue: {} });

export function upsert(s: DraftState, c: CommentDraft): DraftState {
  const v = (s.queue[c.clientId]?.v ?? 0) + 1;
  return {
    comments: { ...s.comments, [c.clientId]: c },
    queue: { ...s.queue, [c.clientId]: { op: 'upsert', v } },
  };
}

export function remove(s: DraftState, clientId: string): DraftState {
  const { [clientId]: _gone, ...comments } = s.comments;
  const v = (s.queue[clientId]?.v ?? 0) + 1;
  return { comments, queue: { ...s.queue, [clientId]: { op: 'delete', v } } };
}

/** `from` was merged into `into` (preview): drop it locally; the server joins the originals. */
export function mergeInto(s: DraftState, from: string, into: string): DraftState {
  const { [from]: _gone, ...comments } = s.comments;
  const v = (s.queue[from]?.v ?? 0) + 1;
  return { comments, queue: { ...s.queue, [from]: { op: 'merge', v, into } } };
}

/** Ops to send, plus the queue versions they correspond to. */
export function pendingOps(s: DraftState): { ops: SyncOp[]; versions: Record<string, number> } {
  const ops: SyncOp[] = [];
  const versions: Record<string, number> = {};
  for (const [id, q] of Object.entries(s.queue)) {
    const c = s.comments[id];
    if (q.op === 'upsert' && c) ops.push({ op: 'upsert', comment: c });
    else if (q.op === 'merge' && q.into) ops.push({ op: 'merge', from: id, into: q.into });
    else ops.push({ op: 'delete', clientId: id });
    versions[id] = q.v;
  }
  return { ops, versions };
}

/** Drop queue entries the server ACKed, unless they changed again while the request was in flight. */
export function ack(s: DraftState, acked: string[], versions: Record<string, number>): DraftState {
  const queue = { ...s.queue };
  for (const id of acked) if (queue[id] && queue[id].v === versions[id]) delete queue[id];
  return { comments: s.comments, queue };
}

/** Server state is the base; local queued changes win (they haven't reached the server yet). */
export function merge(server: CommentDraft[], local: DraftState | null): DraftState {
  const comments: Record<string, CommentDraft> = {};
  for (const c of server) comments[c.clientId] = c;
  const queue = { ...(local?.queue ?? {}) };
  for (const [id, q] of Object.entries(queue)) {
    if (q.op === 'delete' || q.op === 'merge') delete comments[id];
    else if (local?.comments[id]) comments[id] = local.comments[id];
    else delete queue[id];
  }
  return { comments, queue };
}

export function sorted(s: DraftState): CommentDraft[] {
  return Object.values(s.comments).sort((a, b) => a.sortKey - b.sortKey);
}

export function newClientId(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

// ---------------------------------------------------------------- IndexedDB persistence
const DB = 'ft-drafts';
const STORE = 'invites';
const REC_STORE = 'recordings';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      if (!db.objectStoreNames.contains(REC_STORE)) db.createObjectStore(REC_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadLocal(inviteId: string): Promise<DraftState | null> {
  try {
    const db = await open();
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(inviteId);
      req.onsuccess = () => resolve((req.result as DraftState | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function saveLocal(inviteId: string, s: DraftState): Promise<boolean> {
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(s, inviteId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return true;
  } catch {
    return false;
  }
}

export async function clearLocal(inviteId: string): Promise<void> {
  try {
    const db = await open();
    db.transaction(STORE, 'readwrite').objectStore(STORE).delete(inviteId);
  } catch {
    /* nothing to clear */
  }
}

// ---------------------------------------------------------------- recordings awaiting upload ACK
export type StoredRecording = {
  clientId: string;
  inviteId: string;
  /** Raw bytes, not a Blob: Safari can't keep Blobs in IndexedDB in private browsing. */
  bytes: ArrayBuffer;
  meta: { clientId: string; mimeType: string; durationMs: number; timeline: unknown };
  savedAt: number;
};

async function tx<T>(
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(REC_STORE, mode).objectStore(REC_STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Saved before upload starts; removed only after the server ACKs (CLAUDE.md non-negotiable). */
export async function putRecording(r: StoredRecording): Promise<boolean> {
  try {
    await tx('readwrite', (s) => s.put(r, r.clientId));
    return true;
  } catch {
    return false;
  }
}

export async function listRecordings(inviteId: string): Promise<StoredRecording[]> {
  try {
    const all = await tx<StoredRecording[]>(
      'readonly',
      (s) => s.getAll() as IDBRequest<StoredRecording[]>,
    );
    return all.filter((r) => r.inviteId === inviteId).sort((a, b) => a.savedAt - b.savedAt);
  } catch {
    return [];
  }
}

export async function deleteRecording(clientId: string): Promise<void> {
  try {
    await tx('readwrite', (s) => s.delete(clientId));
  } catch {
    /* already gone */
  }
}
