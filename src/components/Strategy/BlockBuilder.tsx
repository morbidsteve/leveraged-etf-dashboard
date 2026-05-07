'use client';

import { useState } from 'react';
import {
  ConditionTree,
  ConditionLeaf,
  AndNode,
  OrNode,
  NotNode,
} from '@/types/strategy';
import { describeValue } from '@/lib/strategy/values';

/**
 * Visual drag-and-drop strategy condition builder. Drag blocks from the
 * palette into AND/OR groups in the workspace. Toggle group type by clicking
 * the operator badge. Each leaf supports inline numeric edits for its key
 * parameters (RSI period, threshold, %, etc.). For full parameter control
 * — switch to the form-based ConditionEditor in StrategyDetail.
 *
 * Implementation note: native HTML5 drag-and-drop. No external dep. Uses
 * a path-based addressing scheme (e.g. "0.2.1") so we can mutate any node
 * deep in the tree without hand-rolling a zipper.
 */

// ── Palette block templates ──────────────────────────────────────────────

interface BlockTemplate {
  id: string;
  label: string;
  category: 'momentum' | 'price' | 'time' | 'position';
  context: 'entry' | 'exit' | 'both';
  /** Build a leaf instance with default parameters. */
  make: () => ConditionLeaf;
}

const PALETTE: BlockTemplate[] = [
  {
    id: 'rsi_cross_below',
    label: 'RSI crosses below threshold',
    category: 'momentum',
    context: 'both',
    make: () => ({
      type: 'cross',
      target: { kind: 'rsi', period: 250 },
      threshold: { kind: 'literal', value: 50 },
      dir: 'below',
    }),
  },
  {
    id: 'rsi_cross_above',
    label: 'RSI crosses above threshold',
    category: 'momentum',
    context: 'both',
    make: () => ({
      type: 'cross',
      target: { kind: 'rsi', period: 250 },
      threshold: { kind: 'literal', value: 55 },
      dir: 'above',
    }),
  },
  {
    id: 'rsi_below',
    label: 'RSI is below value',
    category: 'momentum',
    context: 'both',
    make: () => ({
      type: 'compare',
      left: { kind: 'rsi', period: 250 },
      op: '<',
      right: { kind: 'literal', value: 50 },
    }),
  },
  {
    id: 'rsi_above',
    label: 'RSI is above value',
    category: 'momentum',
    context: 'both',
    make: () => ({
      type: 'compare',
      left: { kind: 'rsi', period: 250 },
      op: '>',
      right: { kind: 'literal', value: 50 },
    }),
  },
  {
    id: 'price_gt_vwap',
    label: 'Price above VWAP',
    category: 'price',
    context: 'both',
    make: () => ({
      type: 'compare',
      left: { kind: 'price' },
      op: '>',
      right: { kind: 'vwap' },
    }),
  },
  {
    id: 'price_lt_vwap',
    label: 'Price below VWAP',
    category: 'price',
    context: 'both',
    make: () => ({
      type: 'compare',
      left: { kind: 'price' },
      op: '<',
      right: { kind: 'vwap' },
    }),
  },
  {
    id: 'price_gt_ema20',
    label: 'Price above EMA(20)',
    category: 'price',
    context: 'both',
    make: () => ({
      type: 'compare',
      left: { kind: 'price' },
      op: '>',
      right: { kind: 'ema', period: 20 },
    }),
  },
  {
    id: 'price_target_pct',
    label: 'Price ≥ entry × (1 + N%)',
    category: 'position',
    context: 'exit',
    make: () => ({
      type: 'compare',
      left: { kind: 'price' },
      op: '>=',
      right: { kind: 'pct_of', base: { kind: 'entry_price' }, pct: 1.5 },
    }),
  },
  {
    id: 'price_stop_pct',
    label: 'Price ≤ entry × (1 - N%)',
    category: 'position',
    context: 'exit',
    make: () => ({
      type: 'compare',
      left: { kind: 'price' },
      op: '<=',
      right: { kind: 'pct_of', base: { kind: 'entry_price' }, pct: -1 },
    }),
  },
  {
    id: 'time_window',
    label: 'Time of day window',
    category: 'time',
    context: 'both',
    make: () => ({ type: 'time_window', start: '09:30', end: '16:00' }),
  },
  {
    id: 'minutes_since_entry',
    label: 'Held > N minutes',
    category: 'time',
    context: 'exit',
    make: () => ({
      type: 'compare',
      left: { kind: 'minutes_since_entry' },
      op: '>',
      right: { kind: 'literal', value: 30 },
    }),
  },
];

// ── Path-based tree mutation helpers ─────────────────────────────────────

type Path = number[];

function getNode(tree: ConditionTree, path: Path): ConditionTree | null {
  if (path.length === 0) return tree;
  if (tree.type === 'and' || tree.type === 'or') {
    const [head, ...rest] = path;
    if (head < 0 || head >= tree.children.length) return null;
    return getNode(tree.children[head], rest);
  }
  if (tree.type === 'not') {
    const [head, ...rest] = path;
    if (head !== 0) return null;
    return getNode(tree.child, rest);
  }
  return null;
}

function setNode(
  tree: ConditionTree,
  path: Path,
  replacement: ConditionTree
): ConditionTree {
  if (path.length === 0) return replacement;
  if (tree.type === 'and' || tree.type === 'or') {
    const [head, ...rest] = path;
    const newChildren = tree.children.map((c, i) =>
      i === head ? setNode(c, rest, replacement) : c
    );
    return { ...tree, children: newChildren };
  }
  if (tree.type === 'not') {
    const [head, ...rest] = path;
    if (head !== 0) return tree;
    return { ...tree, child: setNode(tree.child, rest, replacement) };
  }
  return tree;
}

function deleteAt(tree: ConditionTree, path: Path): ConditionTree {
  if (path.length === 0) return tree; // can't delete root
  // Get parent path + child index
  const parentPath = path.slice(0, -1);
  const childIdx = path[path.length - 1];
  const parent = getNode(tree, parentPath);
  if (!parent) return tree;

  if (parent.type === 'and' || parent.type === 'or') {
    const newChildren = parent.children.filter((_, i) => i !== childIdx);
    // If a group is left with 0 or 1 children, collapse it
    if (newChildren.length === 1 && parentPath.length > 0) {
      // Replace parent with its sole remaining child
      return setNode(tree, parentPath, newChildren[0]);
    }
    return setNode(tree, parentPath, { ...parent, children: newChildren });
  }
  return tree;
}

function appendChild(
  tree: ConditionTree,
  groupPath: Path,
  child: ConditionTree
): ConditionTree {
  const group = getNode(tree, groupPath);
  if (!group || (group.type !== 'and' && group.type !== 'or')) return tree;
  const newGroup = { ...group, children: [...group.children, child] };
  return setNode(tree, groupPath, newGroup);
}

function toggleGroupType(tree: ConditionTree, groupPath: Path): ConditionTree {
  const group = getNode(tree, groupPath);
  if (!group) return tree;
  if (group.type === 'and') return setNode(tree, groupPath, { ...group, type: 'or' });
  if (group.type === 'or') return setNode(tree, groupPath, { ...group, type: 'and' });
  return tree;
}

// ── Component ────────────────────────────────────────────────────────────

interface Props {
  value: ConditionTree;
  onChange: (next: ConditionTree) => void;
  context: 'entry' | 'exit';
}

export default function BlockBuilder({ value, onChange, context }: Props) {
  const [draggingPaletteId, setDraggingPaletteId] = useState<string | null>(null);
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);

  const visiblePalette = PALETTE.filter(
    (b) => b.context === 'both' || b.context === context
  );

  // Ensure root is a group — wrap leaves into a single-child AND
  const rootTree: ConditionTree =
    value.type === 'and' || value.type === 'or'
      ? value
      : { type: 'and', children: [value] };

  const handlePaletteDragStart = (id: string) => (e: React.DragEvent) => {
    setDraggingPaletteId(id);
    e.dataTransfer.setData('text/strategy-block', id);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleDropOnGroup = (groupPath: Path) => (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const id = e.dataTransfer.getData('text/strategy-block') || draggingPaletteId;
    setDraggingPaletteId(null);
    setDragOverPath(null);
    if (!id) return;
    const tpl = PALETTE.find((b) => b.id === id);
    if (!tpl) return;
    const newLeaf = tpl.make();
    onChange(appendChild(rootTree, groupPath, newLeaf));
  };

  const handleAddNestedGroup = (groupPath: Path) => () => {
    const newGroup: AndNode = { type: 'and', children: [] };
    onChange(appendChild(rootTree, groupPath, newGroup));
  };

  const handleToggleGroup = (groupPath: Path) => () => {
    onChange(toggleGroupType(rootTree, groupPath));
  };

  const handleDelete = (path: Path) => () => {
    onChange(deleteAt(rootTree, path));
  };

  const handleEditLeaf = (path: Path, patch: Partial<ConditionLeaf>) => {
    const node = getNode(rootTree, path);
    if (!node || (node.type !== 'compare' && node.type !== 'cross' && node.type !== 'time_window')) return;
    onChange(setNode(rootTree, path, { ...node, ...patch } as ConditionLeaf));
  };

  return (
    <div className="space-y-3">
      {/* Palette */}
      <div className="rounded-lg border border-white/10 bg-black/30 p-2.5">
        <div className="text-[9px] uppercase tracking-widest text-gray-500 mb-2">
          Block palette · drag onto a group
        </div>
        <div className="flex flex-wrap gap-1.5">
          {visiblePalette.map((b) => (
            <div
              key={b.id}
              draggable
              onDragStart={handlePaletteDragStart(b.id)}
              onDragEnd={() => setDraggingPaletteId(null)}
              className={`px-2.5 py-1.5 rounded-md border cursor-grab active:cursor-grabbing select-none text-[11px] font-medium ${
                draggingPaletteId === b.id
                  ? 'bg-accent/20 border-accent/60 text-accent-light'
                  : categoryStyle(b.category)
              }`}
              title="Drag onto a group"
            >
              {b.label}
            </div>
          ))}
        </div>
      </div>

      {/* Workspace */}
      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
        <div className="text-[9px] uppercase tracking-widest text-gray-500 mb-2">
          Workspace · drop into a group · click ∧/∨ to flip
        </div>
        <GroupView
          group={rootTree as AndNode | OrNode}
          path={[]}
          onDropOnGroup={handleDropOnGroup}
          onAddNestedGroup={handleAddNestedGroup}
          onToggleGroup={handleToggleGroup}
          onDelete={handleDelete}
          onEditLeaf={handleEditLeaf}
          dragOverPath={dragOverPath}
          setDragOverPath={setDragOverPath}
          isRoot
        />
      </div>
    </div>
  );
}

// ── Group view (recursive) ───────────────────────────────────────────────

function GroupView({
  group,
  path,
  onDropOnGroup,
  onAddNestedGroup,
  onToggleGroup,
  onDelete,
  onEditLeaf,
  dragOverPath,
  setDragOverPath,
  isRoot = false,
}: {
  group: AndNode | OrNode;
  path: Path;
  onDropOnGroup: (path: Path) => (e: React.DragEvent) => void;
  onAddNestedGroup: (path: Path) => () => void;
  onToggleGroup: (path: Path) => () => void;
  onDelete: (path: Path) => () => void;
  onEditLeaf: (path: Path, patch: Partial<ConditionLeaf>) => void;
  dragOverPath: string | null;
  setDragOverPath: (p: string | null) => void;
  isRoot?: boolean;
}) {
  const pathKey = path.join('.');
  const isOver = dragOverPath === pathKey;
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOverPath(pathKey);
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={() => {
        if (dragOverPath === pathKey) setDragOverPath(null);
      }}
      onDrop={onDropOnGroup(path)}
      className={`rounded-lg border-2 transition-all p-2 ${
        isOver
          ? 'border-accent bg-accent/10'
          : 'border-dashed border-white/10 bg-black/20'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={onToggleGroup(path)}
          className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-widest font-bold border ${
            group.type === 'and'
              ? 'bg-blue-500/15 border-blue-400/40 text-blue-300'
              : 'bg-purple-500/15 border-purple-400/40 text-purple-300'
          } hover:opacity-80`}
          title="Click to toggle AND ↔ OR"
        >
          {group.type === 'and' ? '∧ AND' : '∨ OR'}
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={onAddNestedGroup(path)}
            className="text-[10px] uppercase tracking-widest text-gray-500 hover:text-accent-light"
            title="Add a nested AND group"
          >
            + group
          </button>
          {!isRoot && (
            <button
              onClick={onDelete(path)}
              className="text-[10px] uppercase tracking-widest text-loss hover:text-loss-light"
              title="Remove this group"
            >
              ×
            </button>
          )}
        </div>
      </div>
      {group.children.length === 0 ? (
        <div className="text-[11px] text-gray-500 italic text-center py-3 border border-dashed border-white/10 rounded">
          Drop blocks here
        </div>
      ) : (
        <div className="space-y-1.5 ml-2">
          {group.children.map((child, i) => {
            const childPath = [...path, i];
            if (child.type === 'and' || child.type === 'or') {
              return (
                <GroupView
                  key={i}
                  group={child}
                  path={childPath}
                  onDropOnGroup={onDropOnGroup}
                  onAddNestedGroup={onAddNestedGroup}
                  onToggleGroup={onToggleGroup}
                  onDelete={onDelete}
                  onEditLeaf={onEditLeaf}
                  dragOverPath={dragOverPath}
                  setDragOverPath={setDragOverPath}
                />
              );
            }
            if (child.type === 'not') {
              return (
                <div key={i} className="text-[11px] text-gray-500 italic px-2 py-1">
                  NOT (...) — edit in form view
                </div>
              );
            }
            return (
              <LeafView
                key={i}
                leaf={child}
                onDelete={onDelete(childPath)}
                onEdit={(patch) => onEditLeaf(childPath, patch)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Leaf view with inline number edits ───────────────────────────────────

function LeafView({
  leaf,
  onDelete,
  onEdit,
}: {
  leaf: ConditionLeaf;
  onDelete: () => void;
  onEdit: (patch: Partial<ConditionLeaf>) => void;
}) {
  // Compose inline editable + read-only segments based on leaf type
  if (leaf.type === 'compare') {
    return (
      <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md border border-white/10 bg-white/[0.04]">
        <div className="flex items-center gap-1.5 text-[11px] font-mono flex-wrap">
          <ValueChip
            value={leaf.left}
            onPeriodChange={(period) => {
              if (leaf.left.kind === 'rsi' || leaf.left.kind === 'ema' || leaf.left.kind === 'sma') {
                onEdit({ left: { ...leaf.left, period } } as Partial<ConditionLeaf>);
              }
            }}
            onPctChange={(pct) => {
              if (leaf.left.kind === 'pct_of') {
                onEdit({ left: { ...leaf.left, pct } } as Partial<ConditionLeaf>);
              }
            }}
          />
          <span className="text-accent-light font-bold">{leaf.op}</span>
          <ValueChip
            value={leaf.right}
            onLiteralChange={(value) => {
              if (leaf.right.kind === 'literal') {
                onEdit({ right: { ...leaf.right, value } } as Partial<ConditionLeaf>);
              }
            }}
            onPeriodChange={(period) => {
              if (leaf.right.kind === 'rsi' || leaf.right.kind === 'ema' || leaf.right.kind === 'sma') {
                onEdit({ right: { ...leaf.right, period } } as Partial<ConditionLeaf>);
              }
            }}
            onPctChange={(pct) => {
              if (leaf.right.kind === 'pct_of') {
                onEdit({ right: { ...leaf.right, pct } } as Partial<ConditionLeaf>);
              }
            }}
          />
        </div>
        <button
          onClick={onDelete}
          className="text-loss hover:text-loss-light text-xs shrink-0 px-1"
          title="Remove"
        >
          ×
        </button>
      </div>
    );
  }
  if (leaf.type === 'cross') {
    return (
      <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md border border-amber-400/30 bg-amber-500/10">
        <div className="flex items-center gap-1.5 text-[11px] font-mono text-amber-200 flex-wrap">
          <ValueChip
            value={leaf.target}
            onPeriodChange={(period) => {
              if (leaf.target.kind === 'rsi' || leaf.target.kind === 'ema' || leaf.target.kind === 'sma') {
                onEdit({ target: { ...leaf.target, period } } as Partial<ConditionLeaf>);
              }
            }}
          />
          <span className="font-bold">crosses {leaf.dir === 'below' ? '↘' : '↗'} {leaf.dir}</span>
          <ValueChip
            value={leaf.threshold}
            onLiteralChange={(value) => {
              if (leaf.threshold.kind === 'literal') {
                onEdit({ threshold: { ...leaf.threshold, value } } as Partial<ConditionLeaf>);
              }
            }}
          />
        </div>
        <button
          onClick={onDelete}
          className="text-loss hover:text-loss-light text-xs shrink-0 px-1"
          title="Remove"
        >
          ×
        </button>
      </div>
    );
  }
  if (leaf.type === 'time_window') {
    return (
      <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md border border-cyan-400/30 bg-cyan-500/10">
        <div className="flex items-center gap-1.5 text-[11px] font-mono text-cyan-200">
          time ∈ [
          <input
            type="text"
            value={leaf.start}
            onChange={(e) => onEdit({ start: e.target.value } as Partial<ConditionLeaf>)}
            className="bg-transparent w-12 text-center font-mono text-cyan-100 border-b border-cyan-400/40 focus:outline-none focus:border-cyan-300"
          />
          ,
          <input
            type="text"
            value={leaf.end}
            onChange={(e) => onEdit({ end: e.target.value } as Partial<ConditionLeaf>)}
            className="bg-transparent w-12 text-center font-mono text-cyan-100 border-b border-cyan-400/40 focus:outline-none focus:border-cyan-300"
          />
          ]
        </div>
        <button
          onClick={onDelete}
          className="text-loss hover:text-loss-light text-xs shrink-0 px-1"
          title="Remove"
        >
          ×
        </button>
      </div>
    );
  }
  return null;
}

function ValueChip({
  value,
  onLiteralChange,
  onPeriodChange,
  onPctChange,
}: {
  value: ConditionLeaf extends { left: infer V } ? V : never | unknown;
  onLiteralChange?: (n: number) => void;
  onPeriodChange?: (n: number) => void;
  onPctChange?: (n: number) => void;
}) {
  // We narrow on the actual ValueRef union below
  const v = value as import('@/types/strategy').ValueRef;

  if (v.kind === 'literal' && onLiteralChange) {
    return (
      <input
        type="number"
        value={v.value}
        onChange={(e) => onLiteralChange(Number(e.target.value))}
        className="bg-transparent w-14 text-center font-mono border-b border-white/30 focus:outline-none focus:border-accent text-white"
      />
    );
  }
  if ((v.kind === 'rsi' || v.kind === 'ema' || v.kind === 'sma') && onPeriodChange) {
    return (
      <span className="inline-flex items-center gap-0.5">
        {v.kind}(
        <input
          type="number"
          value={v.period}
          onChange={(e) => onPeriodChange(Math.max(2, Number(e.target.value)))}
          className="bg-transparent w-10 text-center font-mono border-b border-white/30 focus:outline-none focus:border-accent text-white"
        />
        )
      </span>
    );
  }
  if (v.kind === 'pct_of' && onPctChange) {
    return (
      <span className="inline-flex items-center gap-0.5">
        {describeValue(v.base)} × (1 +
        <input
          type="number"
          step="0.1"
          value={v.pct}
          onChange={(e) => onPctChange(Number(e.target.value))}
          className="bg-transparent w-12 text-center font-mono border-b border-white/30 focus:outline-none focus:border-accent text-white"
        />
        %)
      </span>
    );
  }
  return <span>{describeValue(v)}</span>;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function categoryStyle(c: BlockTemplate['category']): string {
  switch (c) {
    case 'momentum':
      return 'bg-amber-500/10 border border-amber-400/30 text-amber-200 hover:bg-amber-500/20';
    case 'price':
      return 'bg-emerald-500/10 border border-emerald-400/30 text-emerald-200 hover:bg-emerald-500/20';
    case 'time':
      return 'bg-cyan-500/10 border border-cyan-400/30 text-cyan-200 hover:bg-cyan-500/20';
    case 'position':
      return 'bg-rose-500/10 border border-rose-400/30 text-rose-200 hover:bg-rose-500/20';
  }
}
