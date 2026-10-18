/**
 * Per-level surface selection for the lattice ladder: may a frame blit another
 * level's cached surface (a "drift") instead of baking its own, and if so,
 * which levels to try in what order.
 *
 * Levels ascend with fineness (0 = the root lattice). The rule a crossing frame
 * (the first frame at a new level) must keep: it never bakes synchronously, it
 * only blits a cached surface at scale and schedules the bake for when the zoom
 * settles. Zooming in only shrinks the region a coarser surface must cover, so
 * it stays usable; and under inherit-down a rung with no authored content has
 * the same fill field as its parent, so the coarser surface is correct, not
 * stale. The only frame with nothing to drift from is a canvas with nothing
 * cached (first mount), which is the one legitimate synchronous bake.
 *
 * Outside a crossing, a level that owns a surface never drifts: when that
 * surface stops fitting (pan or zoom-out past its pad) or its key changes, it
 * re-bakes, because a coarser surface lacks this rung's authored cells and
 * drifting to it mid-pan would blink that paint out.
 *
 * `driftAllowed` decides whether a frame may drift; `driftCandidates` orders
 * the cached levels to try. The renderer's usability test (key match, viewport
 * inside the scaled pad) picks the first candidate that actually serves.
 */

/**
 * May this frame blit another level's surface instead of baking its own?
 * `hasOwnSurface` is whether the level owns a surface the frame could use; the
 * cache passes "owns any entry" outside a crossing and "owns a usable entry"
 * on a crossing frame, so on a crossing a stale or out-of-pad own surface
 * counts as absent. Never over a settle's bake request (that bake must happen,
 * or a usable neighbour would starve the crisp rebuild). Level 0 drifts only
 * on a crossing frame: outside one it is the classic path and always bakes.
 */
function driftAllowed(hasOwnSurface: boolean, level: number, honourBake: boolean, crossingFrame = false): boolean {
  return !hasOwnSurface && (level > 0 || crossingFrame) && !honourBake;
}

/**
 * Drift sources to try, in order, for a frame at `level` that may drift
 * (`driftAllowed`). Nearest COARSER first: the zoom-in crossing, where a coarse
 * surface only has to cover a shrinking region. Then, only after every coarser
 * level, the nearest FINER cached levels: on a zoom-out crossing L -> L-1 with
 * no coarser surface, the L surface blitted at scale < 1 can still cover the
 * viewport for a small drift, instead of baking the crossing frame inline. The
 * caller's usability test (key match + viewport inside the scaled pad) decides
 * whether a candidate actually serves; this only orders them. Candidates are
 * consulted only while `driftAllowed` holds, so outside a crossing a finer
 * surface never stands in for a level's own. Coarser candidates stop at 0.
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

export { driftAllowed, driftCandidates };
