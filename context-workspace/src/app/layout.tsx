import type { Metadata } from 'next';
import { Literata } from 'next/font/google';
import { AppProviders } from '@/providers/app-providers';
import './globals.css';

// Note bodies only — the interface stays on the system sans. Consumers use
// the --font-note token (globals.css), never this variable directly, so
// swapping the face means changing this import and nothing else.
const noteFont = Literata({ subsets: ['latin'], display: 'swap', variable: '--font-note-face' });

export const metadata: Metadata = {
  title: 'Context Workspace',
  description: 'AI-powered developer context workspace dashboard',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`h-full antialiased ${noteFont.variable}`} suppressHydrationWarning>
      <head>
        {/* Applies the persisted (or system) theme before React hydrates —
            without this, the page would flash light-then-dark (or vice
            versa) on every load for anyone who's chosen dark mode.
            suppressHydrationWarning on <html> above is required because
            this script mutates the class attribute pre-hydration. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem('cw-theme');var t=s?JSON.parse(s).state.theme:null;if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}if(t==='dark'){document.documentElement.classList.add('dark');}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
