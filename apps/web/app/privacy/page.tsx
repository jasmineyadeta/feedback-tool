import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/legal-page';

export const metadata: Metadata = { title: 'Privacy · Feedback' };

/**
 * Phase A wording (SPEC §8 M6): everything runs on one computer, so audio and AI stay here.
 * M7 must rewrite the "Where it runs" section with the cloud provider's current terms.
 */
export default function Privacy() {
  return (
    <LegalPage title="Privacy">
      <p>
        This is a test version of the tool. It runs on one computer, run by the person who sent you
        the link. Nothing you share is sent to an outside AI or cloud service.
      </p>

      <section>
        <h2>If you’re giving feedback</h2>
        <ul>
          <li>
            You don’t need an account. Your link is private, and it can be turned off at any time.
          </li>
          <li>
            We keep your comments, and the name and email you enter when you send them. Both are
            shared with the person who asked for feedback, so they can read and thank you.
          </li>
          <li>
            Your comments and unsent recordings are kept in your browser until they are safely
            saved, so nothing is lost if your connection drops.
          </li>
        </ul>
      </section>

      <section>
        <h2>Voice recordings</h2>
        <ul>
          <li>We only record after you agree, and only while you choose to record.</li>
          <li>
            Your audio stays on this computer. It’s turned into text here, and the AI that matches
            what you said to the page also runs here.
          </li>
          <li>
            The person who asked for feedback can listen to it for 90 days. Then the audio is
            deleted. The text of your comments stays until they delete the review.
          </li>
          <li>Recordings and comments are never used to train AI.</li>
        </ul>
      </section>

      <section>
        <h2>If you’re asking for feedback</h2>
        <ul>
          <li>
            We keep your email address so you can sign in, and the PDFs and website addresses you
            share.
          </li>
          <li>
            For websites, this computer opens the page to check it works, and takes screenshots of
            the pages reviewers commented on, so you can still see their comments if the page
            changes.
          </li>
          <li>
            Deleting a review deletes everything in it: comments, recordings, files and screenshots.
          </li>
        </ul>
      </section>

      <section>
        <h2>What we don’t do</h2>
        <ul>
          <li>No ads, no tracking tools, and nothing is listed in search engines.</li>
          <li>
            We count simple events, like “a review was sent”, to see if the tool works. These never
            include what you wrote, what you said, email addresses or full page addresses.
          </li>
          <li>We only work with public pages. We never ask for passwords to other sites.</li>
        </ul>
      </section>

      <p>
        Want something removed? See{' '}
        <Link href="/contact" className="font-medium underline">
          Contact and takedown
        </Link>
        .
      </p>
    </LegalPage>
  );
}
