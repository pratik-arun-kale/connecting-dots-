import type { Metadata } from 'next';
import Link from 'next/link';
import { ContactEmail, LegalPage } from '@/components/legal/legal-page';

export const metadata: Metadata = { title: 'Terms · Connecting Dots' };

export default function TermsPage() {
  return (
    <LegalPage title="Terms" updated="25 November 2026">
      <p>
        These terms cover your use of Connecting Dots (the dashboard, the browser extension and the server behind them),
        a beta run by one person, an individual based in India. By creating an account you agree to them. How your data is
        handled is in the <Link href="/privacy">privacy policy</Link>.
      </p>

      <h2>It&apos;s a beta</h2>
      <ul>
        <li>It&apos;s free while in beta, and it may change, break, or stop. We&apos;ll try to give notice before anything you saved goes away.</li>
        <li>Keep your own copy of anything you can&apos;t afford to lose.</li>
        <li>Ask AI&apos;s answers are written by an AI model from your notes and can be wrong. Check anything that matters.</li>
      </ul>

      <h2>Your content</h2>
      <ul>
        <li>What you save stays yours. You allow us to store and process it only to run the service for you: saving it, indexing it, searching it and answering your questions.</li>
        <li>Save only what you have the right to keep. Conversations you capture come from AI services with their own terms; following those is up to you.</li>
      </ul>

      <h2>Your account</h2>
      <ul>
        <li>You need to be 18 or older. Keep your password to yourself; you&apos;re responsible for what happens under your account.</li>
        <li>You can delete your account at any time in Settings.</li>
      </ul>

      <h2>Don&apos;t</h2>
      <ul>
        <li>Use it for anything illegal, or to store content that is illegal or infringes someone else&apos;s rights.</li>
        <li>Try to reach other people&apos;s data, overload or attack the service, or get around its limits.</li>
      </ul>
      <p>We may suspend an account that does these things.</p>

      <h2>No warranty</h2>
      <p>
        The service is provided &quot;as is&quot;, without warranties of any kind. To the extent the law allows, we aren&apos;t
        liable for lost data, lost profits or indirect damages arising from its use, and our total liability is limited
        to what you paid for it (nothing, during the beta).
      </p>

      <h2>Changes, law and contact</h2>
      <p>
        If these terms change in a way that matters, we&apos;ll tell you before it applies; using the service afterwards
        means you accept the new terms. These terms are governed by the laws of India. Questions: <ContactEmail />.
      </p>
    </LegalPage>
  );
}
