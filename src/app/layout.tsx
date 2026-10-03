import type { Metadata } from 'next';
import { Bricolage_Grotesque, IBM_Plex_Sans } from 'next/font/google';
import { Header } from '@/components/Header';
import './globals.css';

const display = Bricolage_Grotesque({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-bricolage',
});

const sans = IBM_Plex_Sans({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-plex',
});

export const metadata: Metadata = {
  title: { default: 'zdążą?', template: '%s · zdążą?' },
  description: 'Zdążą czy nie zdążą? Miejski rynek przewidywań na cegiełki — walutę, której nie da się kupić ani wypłacić.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="pl" className={`${display.variable} ${sans.variable}`}>
      <body className="min-h-screen bg-paper font-sans text-ink antialiased">
        <Header />
        {children}
      </body>
    </html>
  );
}
