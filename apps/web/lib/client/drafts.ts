import type { CommentDraft, SyncOp } from '@ft/shared';

/**
 * Reviewer drafts (SPEC §3.2 step 9, CLAUDE.md "comments must never be silently lost").
 * Every change is written to IndexedDB first and queued; a queue entry is removed only after the
 * server ACKs that exact version. On reload, queued local changes are replayed over server state.
 */
export type QueueEntry = { op: 'upsert' | 'delete'; v: number };
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

/** Ops to send, plus the queue versions they correspond to. */
export function pendingOps(s: DraftState): { ops: SyncOp[]; versions: Record<string, number> } {
  const ops: SyncOp[] = [];
  const versions: Record<string, number> = {};
  for (const [id, q] of Object.entries(s.queue)) {
    const c = s.comments[id];
    if (q.op === 'upsert' && c) ops.push({ op: 'upsert', comment: c });
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
    if (q.op === 'delete') delete comments[id];
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

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
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
