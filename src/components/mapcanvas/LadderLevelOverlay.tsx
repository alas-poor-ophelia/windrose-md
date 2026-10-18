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
 * view controller); follows a zoom gesture by subscribing to the live view and
 * re-rendering only when the camera rung changes.
 */

import type { VNode } from 'preact';
import { useEffect, useState } from 'preact/hooks';

import { useMapState, useMapOperations } from '../../context/MapContext';
import { resolveEditLevel, viewStateAtRung } from '../../hooks/state/layerHistoryOps';
import { getMaxZoom } from '../../core/lodFlags';
import { Icon } from '../shared/Icon';
import { LevelChip } from '../overlays/LevelChip';

const LadderLevelOverlay = (): VNode | null => {
  const { ladder, viewController, editLevelLock, setEditLevelLock, mapData } = useMapState();
  const { onMapDataUpdate } = useMapOperations();

  // The camera rung is state, updated from the live view subscription: Preact
  // bails out when the value is unchanged, so pans and in-band zooms never
  // re-render this overlay, only a rung crossing does.
  const [camera, setCamera] = useState(() => (
    ladder !== null && viewController !== undefined ? ladder.activeLevel(viewController.getLive().zoom) : 0
  ));
  useEffect(() => {
    if (ladder === null || viewController === undefined) return undefined;
    setCamera(ladder.activeLevel(viewController.getLive().zoom));
    return viewController.subscribeLive((view) => {
      setCamera(ladder.activeLevel(view.zoom));
    });
  }, [ladder, viewController]);

  if (ladder === null || viewController === undefined) return null;

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

  // The host spans the canvas width and is the CSS size container the row
  // queries (narrow embeds hide the readout, then the chip "L" prefixes).
  return (
    <div className="windrose-ladder-host">
      <div
        className="windrose-ladder-hud windrose-ladder-levels"
        role="group"
        aria-label="Detail levels"
        onPointerDown={stop}
        onMouseDown={stop}
        onTouchStart={stop}
        onWheel={stop}
      >
        {levels.map((level) => (
          <LevelChip
            key={level}
            level={level}
            state={level === camera ? 'current' : 'off'}
            locked={locked && level === editLevelLock}
            ariaLabel={`Zoom to level ${level}`}
            onClick={level === camera ? undefined : () => zoomToRung(level)}
          />
        ))}
        <button
          type="button"
          className={`windrose-ladder-lock${locked ? ' is-locked' : ''}`}
          aria-label="Lock edit level"
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
    </div>
  );
};

export { LadderLevelOverlay };
