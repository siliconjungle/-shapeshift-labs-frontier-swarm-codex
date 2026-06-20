import { isObject, nonNegativeNumber, readStringArray } from './common.js';

export function inferredLineageSignalCounts(
  value: Record<string, unknown>,
  summary: Record<string, unknown>
): { inferredEvents: number; moved: number; renamed: number; deleted: number; ambiguous: number; unmatchedAdded: number } {
  const counts = emptyLineageSignalCounts();
  const sources = summary === value ? [value] : [value, summary];
  for (const source of sources) {
    for (const event of lineageEventSignals(source)) addLineageSignal(counts, event);
    for (const code of [...readStringArray(source.reasonCodes), ...readStringArray(source.reasons)]) {
      addLineageSignal(counts, code);
    }
    for (const symbol of readChangedSymbols(source)) addChangedSymbolSignal(counts, symbol);
  }
  return counts;
}

export function lineageEventSignals(value: Record<string, unknown>): string[] {
  return [
    ...readStringArray(value.eventKinds),
    ...readEventObjects(value.events).map((event) => String(event.eventKind ?? event.kind ?? event.changeKind ?? event.status ?? ''))
  ];
}

export function readEventObjects(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isObject) as Record<string, unknown>[] : [];
}

export function hasLineageSignalToken(value: string): boolean {
  const token = normalizeLineageToken(value);
  return Boolean(token) && (
    token.includes('moved') ||
    token === 'move' ||
    token.startsWith('move-') ||
    token.endsWith('-move') ||
    token.includes('renamed') ||
    token.includes('rename') ||
    token.includes('deleted') ||
    token.includes('delete') ||
    token.includes('removed') ||
    token.includes('remove') ||
    token.includes('ambiguous') ||
    token.includes('unmatched-added') ||
    token.includes('added-unmatched') ||
    token.includes('unmatched-added-anchor') ||
    token.includes('unmatched') && token.includes('add') ||
    token.includes('inferred') ||
    token.includes('recreated')
  );
}

function emptyLineageSignalCounts(): { inferredEvents: number; moved: number; renamed: number; deleted: number; ambiguous: number; unmatchedAdded: number } {
  return {
    inferredEvents: 0,
    moved: 0,
    renamed: 0,
    deleted: 0,
    ambiguous: 0,
    unmatchedAdded: 0
  };
}

function readChangedSymbols(value: Record<string, unknown>): Record<string, unknown>[] {
  return Array.isArray(value.changedSymbols) ? value.changedSymbols.filter(isObject) as Record<string, unknown>[] : [];
}

function addLineageSignal(
  counts: { inferredEvents: number; moved: number; renamed: number; deleted: number; ambiguous: number; unmatchedAdded: number },
  value: string
): void {
  const token = normalizeLineageToken(value);
  if (!token) return;
  let matched = false;
  if (token.includes('moved') || token === 'move' || token.startsWith('move-') || token.endsWith('-move')) {
    counts.moved = Math.max(counts.moved, 1);
    matched = true;
  }
  if (token.includes('renamed') || token.includes('rename')) {
    counts.renamed = Math.max(counts.renamed, 1);
    matched = true;
  }
  if (token.includes('deleted') || token.includes('delete') || token.includes('removed') || token.includes('remove')) {
    counts.deleted = Math.max(counts.deleted, 1);
    matched = true;
  }
  if (token.includes('ambiguous')) {
    counts.ambiguous = Math.max(counts.ambiguous, 1);
    matched = true;
  }
  if (
    token.includes('unmatched-added') ||
    token.includes('added-unmatched') ||
    token.includes('unmatched-added-anchor') ||
    token.includes('unmatched') && token.includes('add')
  ) {
    counts.unmatchedAdded = Math.max(counts.unmatchedAdded, 1);
    matched = true;
  }
  if (matched || token.includes('inferred') || token.includes('recreated')) {
    counts.inferredEvents = Math.max(counts.inferredEvents, 1);
  }
}

function addChangedSymbolSignal(
  counts: { inferredEvents: number; moved: number; renamed: number; deleted: number; ambiguous: number; unmatchedAdded: number },
  symbol: Record<string, unknown>
): void {
  const changeKind = normalizeLineageToken(symbol.changeKind);
  const status = normalizeLineageToken([
    symbol.status,
    symbol.readiness,
    symbol.lineageStatus,
    symbol.matchStatus,
    symbol.reason,
    symbol.reasonCode
  ].filter((entry) => entry !== undefined).join(' '));
  let matched = false;
  let inferred = false;
  if (changeKind.includes('removed') || changeKind.includes('remove') || changeKind.includes('deleted') || changeKind.includes('delete')) {
    counts.deleted += 1;
    matched = true;
  }
  if (status.includes('ambiguous') || nonNegativeNumber(symbol.candidateCount) > 1 || readArrayLength(symbol.candidates) > 1) {
    counts.ambiguous += 1;
    matched = true;
    inferred = true;
  }
  if (
    (changeKind.includes('added') || changeKind.includes('add')) &&
    (status.includes('unmatched') || status.includes('no-match') || status.includes('unresolved'))
  ) {
    counts.unmatchedAdded += 1;
    matched = true;
    inferred = true;
  }
  if (matched && (inferred || status.includes('inferred'))) counts.inferredEvents += 1;
}

function normalizeLineageToken(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/[_\s]+/g, '-');
}

function readArrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}
