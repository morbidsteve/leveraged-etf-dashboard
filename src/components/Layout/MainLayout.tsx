'use client';

import { ReactNode, useState, useCallback } from 'react';
import Sidebar, { DrawerView } from './Sidebar';
import { useKeyboardShortcuts } from '@/hooks';

interface MainLayoutProps {
  children: ReactNode;
  onRefresh?: () => void;
  contentClassName?: string;
  /** Pass when the page hosts drawer state — sidebar items will open
   * drawers in-place instead of navigating. */
  onSelectDrawer?: (view: DrawerView) => void;
  activeDrawer?: DrawerView | null;
}

export default function MainLayout({
  children,
  onRefresh,
  contentClassName,
  onSelectDrawer,
  activeDrawer,
}: MainLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleRefresh = useCallback(() => {
    if (onRefresh) onRefresh();
    else window.location.reload();
  }, [onRefresh]);

  // `/` routes to the Cmd+K palette so there's one universal search
  // surface. The palette listens for etf-open-palette to open itself.
  const handleSearch = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('etf-open-palette'));
    }
  }, []);

  useKeyboardShortcuts({
    onRefresh: handleRefresh,
    onSearch: handleSearch,
  });

  return (
    <div className="flex min-h-screen">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onSelectDrawer={onSelectDrawer}
        activeDrawer={activeDrawer}
      />

      <div className="fixed top-0 left-0 right-0 h-14 glass-strong flex items-center px-4 z-30 lg:hidden">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
          aria-label="Open menu"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <h1 className="ml-3 text-lg font-bold">
          <span className="text-gradient-profit">RSI</span> Trader
        </h1>
      </div>

      <main className="flex-1 lg:ml-60 pb-tabbar">
        <div className={contentClassName ?? 'p-4 pt-18 lg:p-6 lg:pt-6'}>{children}</div>
      </main>
    </div>
  );
}
