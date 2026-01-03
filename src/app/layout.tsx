import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Leveraged ETF Trading Dashboard',
  description: 'Track and analyze leveraged ETF trades with real-time RSI indicators',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-dark-bg text-white antialiased">
        {children}
      </body>
    </html>
  );
}
