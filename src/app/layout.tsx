import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Leveraged ETF Command Center',
  description: 'Real-time RSI scalping dashboard for leveraged ETFs',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'ETF Watch',
    statusBarStyle: 'black-translucent',
  },
  // The modern equivalent of apple-mobile-web-app-capable. Next's
  // appleWebApp helper still emits the deprecated apple-* form for
  // iOS compat; this adds the standards-track tag alongside it.
  other: {
    'mobile-web-app-capable': 'yes',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#06070a',
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
