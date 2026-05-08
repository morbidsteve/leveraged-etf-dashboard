'use client';

import { useEffect } from 'react';
import { useSettingsStore } from '@/store';

/**
 * Applies theme + density classes to <html> based on settings. Mounts
 * once at the app root. Pure side-effect; renders nothing.
 *
 * Theme: dark (default) or light. Light flips palette via CSS overrides
 * in globals.css.
 *
 * Density: comfortable (default) or compact. Compact tightens padding
 * across cards, buttons, inputs, tables for power-user info density.
 */
export default function ThemeManager() {
  const theme = useSettingsStore((s) => s.settings.theme);
  const density = useSettingsStore((s) => s.settings.density);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const html = document.documentElement;
    html.classList.toggle('light', theme === 'light');
    html.classList.toggle('compact', density === 'compact');
  }, [theme, density]);

  return null;
}
