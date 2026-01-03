'use client';

import { ReactNode, useState, useCallback } from 'react';
import Sidebar from './Sidebar';
import { useKeyboardShortcuts } from '@/hooks';

interface MainLayoutProps {
  children: ReactNode;
  onRefresh?: () => void;
}

export default function MainLayout({ children, onRefresh }: MainLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const handleRefresh = useCallback(() => {
    if (onRefresh) {
      onRefresh();
    } else {
      // Default: refresh the page data
      window.location.reload();
    }
  }, [onRefresh]);

  const handleSearch = useCallback(() => {
    setShowSearch(true);
  }, []);

  // Global keyboard shortcuts
  useKeyboardShortcuts({
    onRefresh: handleRefresh,
    onSearch: handleSearch,
  });

  return (
    <div className="flex min-h-screen bg-dark-bg">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Search Modal */}
      {showSearch && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-20"
          onClick={() => setShowSearch(false)}
        >
          <div
            className="bg-dark-card border border-dark-border rounded-lg w-full max-w-lg mx-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4">
              <input
                type="text"
                placeholder="Search trades, tickers..."
                className="input w-full text-lg"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setShowSearch(false);
                }}
              />
              <p className="text-xs text-gray-500 mt-2">
                Press <kbd className="kbd">Esc</kbd> to close
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Mobile header with hamburger menu */}
      <div className="fixed top-0 left-0 right-0 h-14 bg-dark-card border-b border-dark-border flex items-center px-4 z-30 lg:hidden">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 text-gray-400 hover:text-white hover:bg-dark-hover rounded-lg transition-colors"
          aria-label="Open menu"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <h1 className="ml-3 text-lg font-bold text-white">
          <span className="text-profit">TQQQ</span> Trader
        </h1>
      </div>

      <main className="flex-1 lg:ml-64">
        {/* Add top padding on mobile to account for fixed header */}
        <div className="p-4 pt-18 lg:p-6 lg:pt-6">
          {children}
        </div>
      </main>
    </div>
  );
}
