import type { Metadata } from 'next';
import { Inter, JetBrains_Mono, Nunito } from 'next/font/google';
import type { ReactNode } from 'react';
import { themeScript } from '@/components/theme-toggle';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const nunito = Nunito({ subsets: ['latin'], weight: ['800'], variable: '--font-nunito' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: { default: 'Popcorn', template: '%s · Popcorn' },
  description: 'Tracing, replay and regression evals for tool-calling AI agents.',
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body
        className={`${inter.variable} ${nunito.variable} ${mono.variable} font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
