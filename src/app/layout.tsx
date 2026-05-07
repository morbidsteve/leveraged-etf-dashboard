import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Leveraged ETF Command Center',
  description: 'Real-time RSI scalping dashboard for leveraged ETFs',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-ink text-white antialiased">
        {children}
      </body>
    </html>
  );
}
