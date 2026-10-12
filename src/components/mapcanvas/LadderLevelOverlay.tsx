/**
 * LadderLevelOverlay.tsx
 *
 * Lattice ladder level chips (design 06 s10 and s4.2). On a ladder map it shows
 * one chip per rung, L0 .. maxLevel: the camera's rung is the current chip,
 * every other chip zooms to the middle of that rung's band, keeping the live
 * centre. A padlock pins the EDIT level (the rung authoring tools write to) to
 * the camera's current rung; zooming deeper keeps authoring on the locked rung,
 * zooming shallower than the lock edits the camera's rung (a finer rung is not
 * on screen). The readout shows `level: L<n>`, plus `edit: L<k>` when the two
 * differ. Renders null on classic maps.
 *
 * Mounted inside MapCanvas's provider tree (it needs `ladder` and the live
 * view controller); re-renders on live view ticks so it tracks a zoom gesture.
 */

import type { VNode } from 'preact';

import { useMapState, useMapOperations } from '../../context/MapContext';
import { useLiveViewTick } from '../../hooks/canvas/useLiveOverlayTransform';
import { resolveEditLevel, viewStateAtRung } from '../../hooks/state/layerHistoryOps';
import { getMaxZoom } from '../../core/lodFlags';
import { Icon } from '../shared/Icon';

const LadderLevelOverlay = (): VNode | null => {
  const { ladder, viewController, editLevelLock, setEditLevelLock, mapData } = useMapState();
  const { onMapDataUpdate } = useMapOperations();
  useLiveViewTick(ladder !== null ? viewController : null);

  if (ladder === null || viewController === undefined) return null;

  const live = viewController.getLive();
  const camera = ladder.activeLevel(live.zoom);
  const edit = resolveEditLevel(editLevelLock, camera);
  const locked = editLevelLock !== null;
  const levels = Array.from({ length: ladder.params.maxLevel + 1 }, (_, i) => i);

  const zoomToRung = (level: number): void => {
    const view = viewStateAtRung(viewController.getLive(), level, ladder.params, getMaxZoom(mapData));
    onMapDataUpdate?.({ viewState: view });
  };

  const toggleLock = (): void => {
    setEditLevelLock(locked ? null : camera);
  };

  // Keep chip clicks off the canvas interaction handlers.
  const stop = (e: Event): void => { e.stopPropagation(); };

  return (
    <div
      className="windrose-ladder-levels"
      role="group"
      aria-label="Ladder levels"
      onPointerDown={stop}
      onMouseDown={stop}
      onTouchStart={stop}
      onWheel={stop}
    >
      {levels.map((level) => {
        const lockClass = locked && level === editLevelLock ? ' windrose-ladder-chip-locked' : '';
        if (level === camera) {
          return (
            <span
              key={level}
              className={`windrose-breadcrumb-current windrose-ladder-chip${lockClass}`}
              aria-current="true"
            >
              {`L${level}`}
            </span>
          );
        }
        return (
          <button
            key={level}
            type="button"
            className={`windrose-breadcrumb-link windrose-ladder-chip${lockClass}`}
            aria-label={`Zoom to level ${level}`}
            onClick={() => zoomToRung(level)}
          >
            {`L${level}`}
          </button>
        );
      })}
      <button
        type="button"
        className={`windrose-ladder-lock${locked ? ' is-locked' : ''}`}
        aria-label={locked ? 'Unlock edit level' : 'Lock edit level'}
        aria-pressed={locked}
        onClick={toggleLock}
      >
        <Icon icon={locked ? 'lucide-lock' : 'lucide-lock-open'} size={14} />
      </button>
      <span className="windrose-ladder-readout">
        {`level: L${camera}`}
        {edit !== camera && <span className="windrose-ladder-readout-edit">{`edit: L${edit}`}</span>}
      </span>
    </div>
  );
};

export { LadderLevelOverlay };
