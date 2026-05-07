'use client';

import { ConditionTree } from '@/types/strategy';
import { describeValue } from '@/lib/strategy/values';

/**
 * Read-only hierarchical visualization of a condition tree. Shows AND/OR/NOT
 * operators as colored junction nodes and leaves (compare/cross/time_window)
 * as labeled boxes. Renders as nested HTML with simple border connectors —
 * no SVG / layout math required.
 *
 * Used inside the strategy detail view as a "Tree view" toggle alongside
 * the form-based ConditionEditor, so users can grok complex AND/OR/NOT
 * structure at a glance.
 */
export default function ConditionTreeView({ tree }: { tree: ConditionTree }) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-fit py-2 px-1">
        <Node node={tree} />
      </div>
    </div>
  );
}

function Node({ node }: { node: ConditionTree }) {
  if (node.type === 'and' || node.type === 'or') {
    return <OpNode op={node.type} count={node.children.length} children_={node.children} />;
  }
  if (node.type === 'not') {
    return <OpNode op="not" count={1} children_={[node.child]} />;
  }
  return <Leaf node={node} />;
}

function OpNode({
  op,
  count,
  children_,
}: {
  op: 'and' | 'or' | 'not';
  count: number;
  children_: ConditionTree[];
}) {
  const colors: Record<typeof op, { bg: string; ring: string; text: string }> = {
    and: { bg: 'bg-blue-500/15', ring: 'border-blue-400/40', text: 'text-blue-300' },
    or: { bg: 'bg-purple-500/15', ring: 'border-purple-400/40', text: 'text-purple-300' },
    not: { bg: 'bg-rose-500/15', ring: 'border-rose-400/40', text: 'text-rose-300' },
  };
  const c = colors[op];
  return (
    <div className="flex flex-col items-center">
      {/* Operator badge */}
      <div
        className={`relative z-10 px-2.5 py-1 rounded-md border ${c.bg} ${c.ring} ${c.text} font-mono text-[10px] uppercase tracking-widest font-bold shadow-md`}
      >
        {op}
        {count > 1 && <span className="ml-1.5 text-[8px] text-gray-400">×{count}</span>}
      </div>

      {/* Trunk */}
      <div className="w-px h-3 bg-white/20" />

      {/* Children + connector bar */}
      <div className="relative">
        {/* Horizontal connector line spanning all children — only if multiple */}
        {children_.length > 1 && (
          <div
            className="absolute top-0 left-0 right-0 h-px bg-white/20"
            style={{ marginLeft: '1.5rem', marginRight: '1.5rem' }}
          />
        )}
        <div className="flex items-start gap-3">
          {children_.map((child, i) => (
            <div key={i} className="flex flex-col items-center">
              {/* Drop line from horizontal connector */}
              {children_.length > 1 && <div className="w-px h-3 bg-white/20" />}
              {/* Single child — short trunk to align with operator */}
              {children_.length === 1 && <div className="w-px h-1 bg-white/20" />}
              <Node node={child} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Leaf({ node }: { node: ConditionTree }) {
  if (node.type === 'compare') {
    return (
      <div className="px-2.5 py-1.5 rounded-md border border-white/10 bg-white/[0.04] text-[11px] font-mono whitespace-nowrap shadow-sm">
        <span className="text-gray-200">{describeValue(node.left)}</span>
        <span className="mx-1.5 text-accent-light font-bold">{node.op}</span>
        <span className="text-gray-200">{describeValue(node.right)}</span>
      </div>
    );
  }
  if (node.type === 'cross') {
    const arrow = node.dir === 'below' ? '↘' : '↗';
    return (
      <div className="px-2.5 py-1.5 rounded-md border border-amber-400/30 bg-amber-500/10 text-[11px] font-mono whitespace-nowrap shadow-sm">
        <span className="text-amber-300">{describeValue(node.target)}</span>
        <span className="mx-1.5 text-amber-200 font-bold">crosses {arrow} {node.dir}</span>
        <span className="text-amber-300">{describeValue(node.threshold)}</span>
      </div>
    );
  }
  if (node.type === 'time_window') {
    return (
      <div className="px-2.5 py-1.5 rounded-md border border-cyan-400/30 bg-cyan-500/10 text-[11px] font-mono whitespace-nowrap text-cyan-200 shadow-sm">
        time ∈ [{node.start}, {node.end}]
      </div>
    );
  }
  // Should be unreachable since AND/OR/NOT are handled in Node
  return null;
}
