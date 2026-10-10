import './globals.css';
import type { Metadata } from 'next';
import { Providers } from '@/components/Providers';
import { Navbar } from '@/components/Navbar';
import { Sidebar } from '@/components/Sidebar';

export const metadata: Metadata = {
  title: 'CodeSense AI — AI-Powered GitHub Code Review & Bug Detection',
  description:
    'Smarter Code Reviews. Better Software. Real-time deterministic static analysis, machine learning risk estimation, and AI-grounded code reviews for GitHub pull requests.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-slate-950 text-slate-100 min-h-screen flex flex-col antialiased">
        <Providers>
          <Navbar />
          <div className="flex flex-1">
            <Sidebar />
            <main className="flex-1 overflow-y-auto">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
