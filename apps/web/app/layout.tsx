import type { Metadata, Viewport } from 'next';
import { connection } from 'next/server';
import type { ReactNode } from 'react';

// Fonts are bundled with the app instead of loaded from Google (no visitor data sent to Google).
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import '@fontsource/nunito/500.css';
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Doodle Board',
  description: 'Tablica online dla korepetytorów i ich uczniów.',
  referrer: 'no-referrer',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Render every page per request, so the CSP nonce from proxy.ts can be applied to Next.js scripts.
  await connection();
  return (
    <html lang="pl">
      <body>{children}</body>
    </html>
  );
}
