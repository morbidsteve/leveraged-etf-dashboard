'use client';

/**
 * Generic shimmer skeleton — use in place of "Loading…" text. Matches
 * the visual shape of the content being awaited so layout doesn't jump
 * when real data arrives.
 */
export default function Skeleton({
  className = '',
  width,
  height = 12,
}: {
  className?: string;
  width?: string | number;
  height?: string | number;
}) {
  const style: React.CSSProperties = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
  };
  return (
    <span
      aria-hidden
      className={`inline-block rounded bg-white/10 animate-pulse ${className}`}
      style={style}
    />
  );
}
