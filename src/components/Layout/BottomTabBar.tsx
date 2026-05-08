'use client';

/**
 * Mobile-only bottom tab bar. Five primary actions for the most common
 * day-trader gestures. Hidden on lg+ where the sidebar takes over.
 *
 * Each tab dispatches the etf-open-drawer event the dashboard already
 * listens for. The "Chart" tab closes any open drawer to bring the user
 * back to the main view.
 */
export default function BottomTabBar({ activeDrawer }: { activeDrawer: string | null }) {
  const tabs: { id: string; label: string; view: string | null; icon: React.ReactElement }[] = [
    { id: 'chart', label: 'Chart', view: null, icon: chartIcon },
    {
      id: 'monitor',
      label: 'Monitor',
      view: 'monitor',
      icon: monitorIcon,
    },
    {
      id: 'strategies',
      label: 'Strategies',
      view: 'strategies',
      icon: strategiesIcon,
    },
    {
      id: 'alerts',
      label: 'Alerts',
      view: 'alerts',
      icon: alertsIcon,
    },
    {
      id: 'settings',
      label: 'More',
      view: 'settings',
      icon: moreIcon,
    },
  ];

  const handleClick = (view: string | null) => {
    if (view === null) {
      window.dispatchEvent(new CustomEvent('etf-close-drawer'));
    } else {
      window.dispatchEvent(new CustomEvent('etf-open-drawer', { detail: view }));
    }
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 lg:hidden glass-strong border-t border-white/10 grid grid-cols-5 pb-safe"
      role="navigation"
      aria-label="Primary navigation"
    >
      {tabs.map((t) => {
        const active =
          t.view === null ? activeDrawer === null : activeDrawer === t.view;
        return (
          <button
            key={t.id}
            onClick={() => handleClick(t.view)}
            className={`flex flex-col items-center justify-center gap-0.5 py-2 transition ${
              active
                ? 'text-accent-light'
                : 'text-gray-500 hover:text-white active:bg-white/5'
            }`}
            style={{ minHeight: 56 }}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {t.icon}
            </svg>
            <span className="text-[10px] uppercase tracking-widest">{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

const chartIcon = (
  <path
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={2}
    d="M7 12l3-3 3 3 4-4M8 21h13M3 21V3"
  />
);
const monitorIcon = (
  <>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
    />
  </>
);
const strategiesIcon = (
  <path
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={2}
    d="M13 10V3L4 14h7v7l9-11h-7z"
  />
);
const alertsIcon = (
  <path
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={2}
    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
  />
);
const moreIcon = (
  <path
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={2}
    d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z"
  />
);
