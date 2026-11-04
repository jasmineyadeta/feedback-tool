import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal-page';
import { env } from '@/lib/server/env';

export const metadata: Metadata = { title: 'Contact and takedown · Feedback' };
export const dynamic = 'force-dynamic';

/** PRD §14: a clear takedown/contact route. The address comes from CONTACT_EMAIL. */
export default function Contact() {
  const email = env().CONTACT_EMAIL;
  return (
    <LegalPage title="Contact and takedown">
      <section>
        <h2>Ask for something to be removed</h2>
        <p className="mt-2">
          If a review shows your work, your words or your voice and you want it taken down, tell us
          which link it was on and what you want removed.
        </p>
        <div
          className="mt-3 rounded-md border border-line bg-paper p-3"
          data-testid="contact-email"
        >
          {email ? (
            <p>
              Email{' '}
              <a
                href={`mailto:${email}?subject=Takedown%20request`}
                className="font-medium underline"
              >
                {email}
              </a>
            </p>
          ) : (
            <p>
              No contact email is set up for this test version yet. Contact the person who sent you
              the link.
            </p>
          )}
        </div>
      </section>

      <section>
        <h2>Faster ways</h2>
        <ul>
          <li>
            Asked for feedback? Delete the review from your reviews page. That removes everything in
            it straight away.
          </li>
          <li>
            Gave feedback? Ask the person who sent you the link to delete the review, or to turn off
            your link.
          </li>
        </ul>
      </section>

      <section>
        <h2>Please don’t include</h2>
        <p className="mt-2">Passwords or private files. We’ll never ask for them.</p>
      </section>
    </LegalPage>
  );
}
