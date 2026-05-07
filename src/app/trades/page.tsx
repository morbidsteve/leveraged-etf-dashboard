import { redirect } from 'next/navigation';

/**
 * Legacy URL — the trades view lives in the dashboard's drawer system now.
 * Redirect preserves bookmarks and external links.
 */
export default function TradesRedirect() {
  redirect('/?d=trades');
}
