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
  title: 'Netflix Clone - Watch Movies & TV Shows Online',
  description: 'A modern Netflix clone built with Next.js, TypeScript, and Supabase',
  keywords: ['netflix', 'movies', 'tv shows', 'streaming', 'entertainment'],
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

