export interface QuickAskTarget {
  readonly displayName: string;
}

/**
 * Reads `Workspace: brief` from the palette query. The name before the colon
 * matches a workspace exactly, ignoring case, or else as the start of exactly one.
 */
export function parseQuickAsk<T extends QuickAskTarget>(
  query: string,
  targets: ReadonlyArray<T>,
): { readonly target: T; readonly brief: string } | null {
  const match = /^([^:\n]{1,60}):(.+)$/s.exec(query.trim());
  if (match === null) return null;
  const name = match[1]!.trim().toLowerCase();
  const brief = match[2]!.trim();
  if (name.length === 0 || brief.length === 0) return null;
  const exact = targets.find((target) => target.displayName.toLowerCase() === name);
  if (exact) return { target: exact, brief };
  const prefixed = targets.filter((target) => target.displayName.toLowerCase().startsWith(name));
  return prefixed.length === 1 ? { target: prefixed[0]!, brief } : null;
}
