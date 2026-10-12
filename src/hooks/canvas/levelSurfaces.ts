/**
 * Per-level surface selection for the lattice ladder.
 *
 * Design .claude/lod-rd/06-integration-design.md section 3.1, decision D17:
 * a level crossing is a DRIFT, not a rebuild. Levels ascend with fineness
 * (0 = the root lattice). When the newly active level has no cached surface
 * yet, the nearest coarser cached surface is scale-blitted in the crossing
 * frame, exactly as a stale snapshot is blitted while zoom drifts today, and
 * the fresh bake of the new level is scheduled at settle. Zooming in only
 * shrinks the region the coarse snapshot must cover, so it stays usable; and
 * under inherit-down a rung with no authored content has a fill field that is
 * identical to its parent's, so the coarse surface is not stale but correct.
 *
 * The only case with no drift source is an empty cache (first mount), which
 * is the one legitimate synchronous bake.
 */

interface DriftSource<T> {
  level: number;
  entry: T;
}

/**
 * The surface to blit for `level`: the entry for that level if cached, else the
 * nearest coarser level's entry, else null.
 */
function pickDriftSource<T>(entries: ReadonlyMap<number, T>, level: number): DriftSource<T> | null {
  for (let candidate = level; candidate >= 0; candidate--) {
    const entry = entries.get(candidate);
    if (entry !== undefined) return { level: candidate, entry };
  }
  return null;
}

/**
 * May this frame blit a coarser surface instead of baking the level's own?
 * Only while the level owns NO surface (a crossing in progress: never baked, or
 * evicted) and no settle has asked it to bake. A level that owns a surface which
 * merely stopped fitting (pan or zoom-out past its pad) or whose key changed
 * bakes synchronously, like the classic level-0 path: a coarser surface lacks
 * this rung's authored cells, so drifting to it would blink that paint out
 * (kgc.19). Level 0 never drifts.
 */
function driftAllowed(hasOwnSurface: boolean, level: number, honourBake: boolean): boolean {
  return !hasOwnSurface && level > 0 && !honourBake;
}

/**
 * Drift sources to try, in order, for a frame at `level` that may drift
 * (`driftAllowed`). Nearest COARSER first (D17: the zoom-in crossing, where a
 * coarse snapshot only has to cover a shrinking region). Then, only after every
 * coarser level, the nearest FINER cached levels (kgc.23 i): on a zoom-out
 * crossing L -> L-1 with no coarser surface, the L surface blitted at scale < 1
 * can still cover the viewport for a small drift, instead of baking the crossing
 * frame inline. The caller's usability test (key match + viewport inside the
 * scaled pad) decides whether a candidate actually serves; this only orders them.
 * The kgc.19 rule is untouched: candidates are consulted only while the level
 * owns no surface, so a finer surface never stands in for the level's own.
 * Coarser candidates stop at level 0, as the pre-kgc.23 loop did.
 */
function driftCandidates(level: number, cachedLevels: Iterable<number>): number[] {
  const coarser: number[] = [];
  const finer: number[] = [];
  for (const cached of cachedLevels) {
    if (cached > level) finer.push(cached);
    else if (cached < level && cached >= 0) coarser.push(cached);
  }
  coarser.sort((a, b) => b - a);
  finer.sort((a, b) => a - b);
  return [...coarser, ...finer];
}

export type { DriftSource };
export { pickDriftSource, driftAllowed, driftCandidates };
