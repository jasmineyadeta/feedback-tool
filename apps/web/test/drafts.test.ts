import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { CommentDraft, SyncRequest, SubmitRequest } from '@ft/shared';
import {
  ack,
  emptyState,
  loadLocal,
  merge,
  pendingOps,
  remove,
  saveLocal,
  sorted,
  upsert,
} from '@/lib/client/drafts';

const c = (id: string, text = `note ${id}`, sortKey = 1): CommentDraft => ({
  clientId: id,
  text,
  anchor: {
    kind: 'pdf',
    page: 1,
    textQuote: null,
    rectPdf: { x: 1, y: 2, w: 3, h: 4 },
    point: { xPct: 0.5, yPct: 0.5 },
  },
  general: false,
  sortKey,
});

describe('draft queue', () => {
  it('queues upserts and deletes, and acks only the version that was sent', () => {
    let s = upsert(emptyState(), c('aaaaaa'));
    s = upsert(s, c('bbbbbb'));
    const sent = pendingOps(s);
    expect(sent.ops).toHaveLength(2);
    // Edited again while the request was in flight: must stay queued.
    s = upsert(s, c('aaaaaa', 'edited'));
    s = ack(s, ['aaaaaa', 'bbbbbb'], sent.versions);
    expect(Object.keys(s.queue)).toEqual(['aaaaaa']);
    s = remove(s, 'aaaaaa');
    expect(pendingOps(s).ops).toEqual([{ op: 'delete', clientId: 'aaaaaa' }]);
  });

  it('merge: server is the base, queued local changes win', () => {
    let local = upsert(emptyState(), c('local1', 'offline note'));
    local = remove(local, 'server2');
    local.comments['stale1'] = c('stale1', 'acked long ago'); // not queued → server wins
    const m = merge([c('server1', 'a', 2), c('server2', 'b', 3)], local);
    expect(sorted(m).map((x) => x.clientId)).toEqual(['local1', 'server1']);
    expect(Object.keys(m.queue).sort()).toEqual(['local1', 'server2']);
  });

  it('persists to IndexedDB and restores', async () => {
    const s = upsert(emptyState(), c('persist1'));
    expect(await saveLocal('invite-1', s)).toBe(true);
    expect(await loadLocal('invite-1')).toEqual(s);
    expect(await loadLocal('invite-2')).toBeNull();
  });

  it('wire schemas reject bad payloads', () => {
    expect(SyncRequest.safeParse({ ops: [{ op: 'upsert', comment: c('ok1234') }] }).success).toBe(
      true,
    );
    expect(SyncRequest.safeParse({ ops: [] }).success).toBe(false);
    expect(
      SyncRequest.safeParse({ ops: [{ op: 'upsert', comment: { ...c('ok1234'), text: '' } }] })
        .success,
    ).toBe(false);
    expect(SyncRequest.safeParse({ ops: [{ op: 'delete', clientId: '../../etc' }] }).success).toBe(
      false,
    );
    expect(
      SyncRequest.safeParse({
        ops: [
          { op: 'upsert', comment: { ...c('ok1234'), anchor: { ...c('x').anchor, page: 31 } } },
        ],
      }).success,
    ).toBe(false);
    expect(SubmitRequest.safeParse({ name: ' Sam ', email: 'sam@example.com' }).success).toBe(true);
    expect(SubmitRequest.safeParse({ name: '', email: 'sam@example.com' }).success).toBe(false);
    expect(SubmitRequest.safeParse({ name: 'Sam', email: 'not-an-email' }).success).toBe(false);
  });
});

describe('sortKey', () => {
  it('accepts Date.now() timestamps', () => {
    expect(CommentDraft.safeParse(c('stamp1', 'x', Date.now())).success).toBe(true);
  });
});
