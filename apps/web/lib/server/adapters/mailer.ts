import 'server-only';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { MailMessage, Mailer } from '@ft/shared';
import { env } from '../env';

/** Mock: records messages in memory and, if MAIL_OUTBOX_DIR is set, as JSON files (e2e reads them). */
export const sentMail: MailMessage[] = [];
export function mockMailer(dir = env().MAIL_OUTBOX_DIR): Mailer {
  return {
    name: 'mock',
    async send(msg) {
      sentMail.push(msg);
      if (dir) {
        await mkdir(dir, { recursive: true });
        await writeFile(path.join(dir, `${Date.now()}-${randomUUID()}.json`), JSON.stringify(msg));
      }
    },
  };
}

/** Local: Supabase's bundled Mailpit inbox via its HTTP send API. */
export function localMailer(base = env().MAILPIT_URL): Mailer {
  return {
    name: 'local',
    async send(msg) {
      const res = await fetch(`${base}/api/v1/send`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          From: { Email: 'no-reply@feedback.local', Name: 'Feedback' },
          To: [{ Email: msg.to }],
          Subject: msg.subject,
          Text: msg.text,
          ...(msg.html ? { HTML: msg.html } : {}),
        }),
      });
      if (!res.ok) throw new Error(`mailpit send failed: ${res.status}`);
    },
  };
}
