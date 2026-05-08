'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

/** All drawers the dashboard exposes. Mirrored from app/page.tsx. */
export type DrawerView =
  | 'strategies'
  | 'monitor'
  | 'backtest'
  | 'journal'
  | 'trades'
  | 'analytics'
  | 'scanner'
  | 'calculator'
  | 'alerts'
  | 'settings'
  | 'newTrade'
  | 'options';

interface NavItem {
  /** drawer this item opens on the dashboard */
  drawer: DrawerView;
  label: string;
  icon: React.ReactNode;
  /** Marks the item as a primary action — gets accent color treatment */
  primary?: boolean;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Strategy',
    items: [
      {
        drawer: 'strategies',
        label: 'Strategies',
        primary: true,
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        ),
      },
      {
        drawer: 'monitor',
        label: 'Live monitor',
        primary: true,
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        ),
      },
      {
        drawer: 'backtest',
        label: 'Backtest',
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12a9 9 0 1018 0 9 9 0 00-18 0zM12 6v6l4 2" />
          </svg>
        ),
      },
      {
        drawer: 'journal',
        label: 'Journal',
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
        ),
      },
    ],
  },
  {
    label: 'Analyze',
    items: [
      {
        drawer: 'trades',
        label: 'Trades',
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        ),
      },
      {
        drawer: 'analytics',
        label: 'Analytics',
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        ),
      },
      {
        drawer: 'scanner',
        label: 'Scanner',
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        ),
      },
      {
        drawer: 'options',
        label: 'Options',
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h18v4H3zM3 10h18v4H3zM3 17h18v4H3z" />
          </svg>
        ),
      },
    ],
  },
  {
    label: 'Tools',
    items: [
      {
        drawer: 'calculator',
        label: 'Calculator',
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
        ),
      },
      {
        drawer: 'alerts',
        label: 'Alerts',
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
        ),
      },
      {
        drawer: 'settings',
        label: 'Settings',
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        ),
      },
    ],
  },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  /** When provided, sidebar items open drawers instead of navigating. */
  onSelectDrawer?: (view: DrawerView) => void;
  /** The currently-open drawer (for active-state highlighting). */
  activeDrawer?: DrawerView | null;
}

export default function Sidebar({ isOpen, onClose, onSelectDrawer, activeDrawer }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handleSelect = (drawer: DrawerView) => {
    onClose();
    if (onSelectDrawer) {
      // We're on the dashboard — open drawer in-place
      onSelectDrawer(drawer);
    } else {
      // We're not on the dashboard (legacy page or full-page chart) —
      // navigate to the dashboard with a query param so it auto-opens
      router.push(`/?d=${drawer}`);
    }
  };

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden" onClick={onClose} />
      )}
      <aside
        className={`
          w-60 glass-strong flex flex-col h-screen fixed left-0 top-0 z-50
          transform transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0
        `}
      >
        {/* Logo — clicking returns to a clean dashboard view (closes drawers) */}
        <div className="p-4 border-b border-white/5 flex items-center justify-between">
          <button
            onClick={() => {
              onClose();
              if (onSelectDrawer && activeDrawer) {
                // We're on dashboard with a drawer open — close it
                window.dispatchEvent(new CustomEvent('etf-close-drawer'));
              }
              // If we're on a non-dashboard page, navigate home
              if (!onSelectDrawer) {
                router.push('/');
              }
            }}
            className="text-left"
          >
            <h1 className="text-lg font-bold tracking-tight">
              <span className="text-gradient-profit">RSI</span>{' '}
              <span className="text-white">Trader</span>
            </h1>
            <p className="text-[10px] text-gray-500 mt-0.5 uppercase tracking-widest">
              Leveraged ETF
            </p>
          </button>
          <button
            onClick={onClose}
            className="lg:hidden p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-3 overflow-y-auto">
          {/* "+ New Trade" lives at the top — common quick action */}
          <button
            onClick={() => handleSelect('newTrade')}
            className="w-full btn btn-success text-sm justify-center py-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            New trade
            <kbd className="kbd ml-auto">N</kbd>
          </button>

          {NAV_SECTIONS.map((section) => (
            <div key={section.label}>
              <div className="text-[9px] font-semibold uppercase tracking-widest text-gray-500 px-2 mb-1.5">
                {section.label}
              </div>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const isActive = activeDrawer === item.drawer;
                  return (
                    <button
                      key={item.drawer}
                      onClick={() => handleSelect(item.drawer)}
                      className={`nav-link w-full ${isActive ? 'active' : ''} ${
                        item.primary && !isActive ? 'text-accent-light/80' : ''
                      }`}
                    >
                      {item.icon}
                      <span className="text-sm">{item.label}</span>
                      {item.primary && !isActive && (
                        <span className="ml-auto text-[8px] uppercase tracking-widest text-accent-light/60">
                          •
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Suppress unused warning for pathname — reserved for future "current page" highlighting */}
        <div className="hidden">{pathname}</div>

        <div className="p-3 border-t border-white/5 hidden lg:block">
          <p className="text-[10px] text-gray-500 mb-2 uppercase tracking-widest">
            Shortcuts
          </p>
          <div className="space-y-1.5 text-xs">
            <ShortcutRow label="New trade" k="N" />
            <ShortcutRow label="Calculator" k="C" />
            <ShortcutRow label="Refresh" k="R" />
            <ShortcutRow label="Search" k="/" />
            <ShortcutRow label="Close drawer" k="Esc" />
          </div>
        </div>

        <div className="p-3 border-t border-white/5">
          <p className="text-[9px] text-gray-600 leading-relaxed">
            Personal tracking only. Not financial advice. Leveraged ETFs carry significant risk.
          </p>
        </div>
      </aside>
    </>
  );
}

function ShortcutRow({ label, k }: { label: string; k: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-400">{label}</span>
      <kbd className="kbd">{k}</kbd>
    </div>
  );
}
