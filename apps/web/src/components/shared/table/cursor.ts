// Cursor pagination over `Paged<T>` = { items, nextCursor } (05 §0): keeps the cursors of visited pages so "back" works.
import { useCallback, useState } from "react";

export type CursorState = { cursors: (string | null)[] };

export const initialCursorState: CursorState = { cursors: [null] };

export function currentCursor(state: CursorState): string | null {
  return state.cursors[state.cursors.length - 1] ?? null;
}

export function pageIndex(state: CursorState): number {
  return state.cursors.length - 1;
}

export function nextPage(state: CursorState, nextCursor: string | null): CursorState {
  return nextCursor === null ? state : { cursors: [...state.cursors, nextCursor] };
}

export function previousPage(state: CursorState): CursorState {
  return state.cursors.length > 1 ? { cursors: state.cursors.slice(0, -1) } : state;
}

/** `cursor` goes into the list query; call `reset()` when search/filters change. */
export function useCursorPagination() {
  const [state, setState] = useState<CursorState>(initialCursorState);
  return {
    cursor: currentCursor(state),
    pageIndex: pageIndex(state),
    hasPrevious: state.cursors.length > 1,
    next: useCallback((nextCursor: string | null) => setState((s) => nextPage(s, nextCursor)), []),
    previous: useCallback(() => setState(previousPage), []),
    reset: useCallback(() => setState(initialCursorState), []),
  };
}
