import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';
import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { ToastContainer } from '@/components/toast';
import { ErrorBoundary } from '@/components/error-boundary';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'CatchUp - Return to Your Shows',
  description: 'A privacy-conscious streaming prototype for returning to shows with context.',
  keywords: ['CatchUp', 'shows', 'episodes', 'watch progress'],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-netflix-black text-white antialiased`}>
        <ErrorBoundary>
          <Providers>
            <Header />
            {children}
            <Footer />
            <ToastContainer />
          </Providers>
        </ErrorBoundary>
      </body>
    </html>
  );
}
