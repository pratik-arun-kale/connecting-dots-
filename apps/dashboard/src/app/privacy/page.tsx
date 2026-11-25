import type { Metadata } from 'next';
import { ContactEmail, LegalPage } from '@/components/legal/legal-page';

export const metadata: Metadata = { title: 'Privacy policy · Connecting Dots' };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="25 November 2026">
      <p>
        Connecting Dots is a beta run by one person, an individual based in India. It saves the AI conversations,
        passages and notes you choose to keep, and lets you search them and ask questions about them. This page says
        what is collected, where it goes, and how to remove it. Questions or requests: <ContactEmail />.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Your account:</strong> your email address and a hash of your password (never the password itself), when you signed up, last signed in and confirmed your email.</li>
        <li><strong>What you save:</strong> conversations and passages you capture with the extension (with the page&apos;s address and title, and the question you asked when the extension can find it), notes you write, titles you give them, and your projects.</li>
        <li><strong>A search index of what you save:</strong> your notes split into passages, each with a list of numbers that describes its meaning, plus words learned from your notes to correct typos in searches. It&apos;s made on our own server; no other company sees it.</li>
        <li><strong>Searches and Ask AI questions:</strong> used to answer you, not stored. Our logs record that a request happened (its address, status and timing) but never what you searched for or asked.</li>
        <li><strong>Technical data:</strong> your IP address, used briefly in memory to limit sign-in attempts; our hosting providers&apos; request logs, which include IP addresses.</li>
      </ul>
      <p>No advertising, no analytics or tracking scripts, and nothing is sold or shared for marketing.</p>

      <h2>The browser extension</h2>
      <ul>
        <li>It runs only on chatgpt.com, chat.openai.com, claude.ai and gemini.google.com.</li>
        <li>It reads a page&apos;s conversation only when you capture it or save a passage, and sends what you saved to your account. It doesn&apos;t record your browsing.</li>
        <li>It keeps your sign-in, the last project you used, and captures waiting to upload in Chrome&apos;s storage on your computer.</li>
      </ul>

      <h2>Who processes your data</h2>
      <ul>
        <li><strong>Neon</strong> stores the database: your account, everything you save and its search index (Sydney, Australia).</li>
        <li><strong>Google Cloud Run</strong> runs the server that handles your requests.</li>
        <li><strong>Vercel</strong> serves the dashboard website and passes your requests to the server.</li>
        <li><strong>Resend</strong> sends account emails (confirming your address, resetting your password).</li>
        <li>
          <strong>OpenAI</strong> writes Ask AI&apos;s answers. <strong>When you use Ask AI, your question and up to a few
          excerpts from your notes are sent to OpenAI</strong>; OpenAI&apos;s API terms say this data isn&apos;t used to train their
          models. Search and the rest of the app never send your notes to OpenAI.
        </li>
      </ul>
      <p>These companies process data only to run this service, and some of them are outside India.</p>

      <h2>Your browser</h2>
      <p>
        One sign-in cookie (essential, readable only by our server). The dashboard also remembers your account name, theme
        and last project in your browser&apos;s local storage. There are no other cookies.
      </p>

      <h2>How long we keep it, and deleting it</h2>
      <ul>
        <li>Anything you delete goes to the Trash and is removed for good after 30 days, or sooner if you empty it.</li>
        <li>
          <strong>Delete your account</strong> in Settings and your account and everything in it, including the Trash and the
          search index, is removed straight away. Our database provider keeps a short restore history, which deleted data
          drops out of once that window passes.
        </li>
        <li>You can ask for a copy of your data, or for any of it to be corrected or deleted, at <ContactEmail />.</li>
      </ul>

      <h2>Security</h2>
      <p>
        Traffic is encrypted (HTTPS), passwords are stored as Argon2 hashes, and each account can only reach its own data.
        No system is perfectly secure; if something goes wrong that affects your data, we&apos;ll tell you.
      </p>

      <h2>Chrome Web Store</h2>
      <p>
        The use of information received from Google APIs and the browser extension adheres to the Chrome Web Store User Data
        Policy, including the Limited Use requirements. Data the extension collects is used only to provide the features
        you use, is never sold, never used for advertising or credit decisions, and is never read by people except to
        handle a support request you send, for security, or when the law requires it.
      </p>

      <h2>Age</h2>
      <p>Connecting Dots is for people 18 or older.</p>

      <h2>Changes and contact</h2>
      <p>
        If this policy changes in a way that matters, we&apos;ll say so in the app or by email before it applies. For any
        privacy question or complaint, including as your grievance contact under India&apos;s Digital Personal Data
        Protection Act, write to <ContactEmail />.
      </p>
    </LegalPage>
  );
}
