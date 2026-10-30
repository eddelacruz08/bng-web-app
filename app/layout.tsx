import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';

import { AppProviders } from '@/components/Providers';

import './globals.css';

const alfa = localFont({ src: './fonts/AlfaSlabOne-Regular.ttf', variable: '--font-alfa', display: 'swap' });
const rye = localFont({ src: './fonts/Rye-Regular.ttf', variable: '--font-rye', display: 'swap' });
const spectral = localFont({
  src: [
    { path: './fonts/Spectral-Regular.ttf', weight: '400', style: 'normal' },
    { path: './fonts/Spectral-Italic.ttf', weight: '400', style: 'italic' },
    { path: './fonts/Spectral-SemiBold.ttf', weight: '600', style: 'normal' },
    { path: './fonts/Spectral-Bold.ttf', weight: '700', style: 'normal' },
  ],
  variable: '--font-spectral',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Classic Bingo',
  description: 'Local-network bingo: host from a browser or a phone, play from either. Numbers 1 to 75, no internet needed.',
  applicationName: 'Classic Bingo',
  appleWebApp: { capable: true, title: 'Classic Bingo', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  themeColor: '#7a1e2b',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${alfa.variable} ${rye.variable} ${spectral.variable}`}>
      <body className="min-h-full antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
