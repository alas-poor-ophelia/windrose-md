/**
 * useWallToolSurface.ts
 *
 * Publishes the wall tool's control surface (draw/edit state + actions) to the
 * tile-drawer footer, which renders the controls. WallLayer owns the state but
 * renders no chrome.
 *
 * Loop safety: publishing sets state in the parent and re-renders the layer,
 * so the publish effect depends on PRIMITIVES ONLY plus action wrappers with a
 * fixed identity that dispatch through a latest-ref. Depending on the raw
 * callbacks made the effect re-fire after each publish, an infinite render
 * loop while drawing (Preact does not guard against it).
 */

import type { WallPath, WallToolSurface } from '#types/core/wallpath.types';

import { useEffect, useRef } from 'preact/hooks';
import { MIN_GAP_CELLS } from '../../drawing/wallGapOperations';

/** Latest closures + selection the stable surface actions dispatch through. */
interface WallSurfaceLive {
  toggleSnap: () => void;
  toggleAngleSnap: () => void;
  undoLastPoint: () => void;
  cancelDrawing: () => void;
  finishWall: () => void;
  updateWall: (wallId: string, mutate: (w: WallPath) => WallPath, suppress: boolean) => void;
  deleteSelectedWall: (wallId: string) => void;
  deselect: () => void;
  deselectGap: () => void;
  selectedWallId: string | null;
  selectedGapId: string | null;
}

/** Primitive snapshot published to the footer. */
interface WallSurfaceSnapshot {
  isWallTool: boolean;
  isDrawing: boolean;
  vertexCount: number;
  snapEnabled: boolean;
  angleSnapEnabled: boolean;
  hasAsset: boolean;
  assetForm: 'strip' | 'opening';
  assetKind: 'wall' | 'path';
  selectedWall: WallPath | null;
  selectedGap: NonNullable<WallPath['gaps']>[number] | null;
}

function useWallToolSurface(
  onSurfaceChange: ((surface: WallToolSurface | null) => void) | undefined,
  live: WallSurfaceLive,
  snapshot: WallSurfaceSnapshot,
): void {
  const liveRef = useRef(live);
  liveRef.current = live;

  const surfaceActions = useRef({
    toggleSnap: () => liveRef.current.toggleSnap(),
    toggleAngleSnap: () => liveRef.current.toggleAngleSnap(),
    undoLastPoint: () => liveRef.current.undoLastPoint(),
    cancelDrawing: () => liveRef.current.cancelDrawing(),
    finishWall: () => liveRef.current.finishWall(),
    setWidth: (v: number) => {
      const id = liveRef.current.selectedWallId;
      if (id != null) liveRef.current.updateWall(id, w => ({ ...w, widthScale: v }), false);
    },
    toggleFlip: () => {
      const id = liveRef.current.selectedWallId;
      if (id != null) liveRef.current.updateWall(id, w => ({ ...w, flip: w.flip !== true }), false);
    },
    deleteWall: () => {
      const id = liveRef.current.selectedWallId;
      if (id != null) liveRef.current.deleteSelectedWall(id);
    },
    deselect: () => liveRef.current.deselect(),
    // --- selected-gap actions ---
    setGapWidth: (cells: number) => {
      const id = liveRef.current.selectedWallId;
      const gid = liveRef.current.selectedGapId;
      if (id == null || gid == null) return;
      const w = Math.max(MIN_GAP_CELLS, cells);
      liveRef.current.updateWall(id, wall => ({
        ...wall,
        gaps: (wall.gaps ?? []).map(g => (g.id === gid ? { ...g, widthCells: w, widthLocked: true } : g)),
      }), false);
    },
    toggleGapFlip: () => {
      const id = liveRef.current.selectedWallId;
      const gid = liveRef.current.selectedGapId;
      if (id == null || gid == null) return;
      liveRef.current.updateWall(id, wall => ({
        ...wall,
        gaps: (wall.gaps ?? []).map(g =>
          g.id === gid && g.tile != null ? { ...g, tile: { ...g.tile, flip: g.tile.flip !== true } } : g),
      }), false);
    },
    unbindGap: () => {
      const id = liveRef.current.selectedWallId;
      const gid = liveRef.current.selectedGapId;
      if (id == null || gid == null) return;
      liveRef.current.updateWall(id, wall => ({
        ...wall,
        gaps: (wall.gaps ?? []).map(g => {
          if (g.id !== gid) return g;
          const next = { ...g };
          delete next.tile;
          return next;
        }),
      }), false);
    },
    deleteGap: () => {
      const id = liveRef.current.selectedWallId;
      const gid = liveRef.current.selectedGapId;
      if (id == null || gid == null) return;
      liveRef.current.updateWall(id, wall => ({
        ...wall,
        gaps: (wall.gaps ?? []).filter(g => g.id !== gid),
      }), false);
      liveRef.current.deselectGap();
    },
    deselectGap: () => liveRef.current.deselectGap(),
  }).current;

  // Primitives only (per the loop-safety note above).
  const {
    isWallTool, isDrawing, vertexCount, snapEnabled, angleSnapEnabled,
    hasAsset, assetForm, assetKind, selectedWall, selectedGap,
  } = snapshot;
  const hasSelectedWall = selectedWall != null;
  const editVertexCount = selectedWall?.vertices.length ?? 0;
  const editWidthScale = selectedWall?.widthScale ?? 1;
  const editFlip = selectedWall?.flip === true;
  const hasSelectedGap = selectedGap != null;
  const gapWidthCells = selectedGap?.widthCells ?? 1;
  const gapBound = selectedGap?.tile != null;
  const gapFlip = selectedGap?.tile?.flip === true;
  useEffect(() => {
    if (onSurfaceChange == null) return;
    if (!isWallTool) { onSurfaceChange(null); return; }
    const inEdit = !isDrawing && hasSelectedWall;
    onSurfaceChange({
      mode: inEdit ? 'edit' : 'draw',
      hasAsset,
      assetForm,
      assetKind,
      isDrawing,
      vertexCount,
      snapEnabled,
      angleSnapEnabled,
      canFinish: vertexCount >= 2,
      toggleSnap: surfaceActions.toggleSnap,
      toggleAngleSnap: surfaceActions.toggleAngleSnap,
      undoLastPoint: surfaceActions.undoLastPoint,
      cancelDrawing: surfaceActions.cancelDrawing,
      finishWall: surfaceActions.finishWall,
      edit: inEdit
        ? {
            vertexCount: editVertexCount,
            widthScale: editWidthScale,
            flip: editFlip,
            setWidth: surfaceActions.setWidth,
            toggleFlip: surfaceActions.toggleFlip,
            deleteWall: surfaceActions.deleteWall,
            deselect: surfaceActions.deselect,
            gap: inEdit && hasSelectedGap
              ? {
                  widthCells: gapWidthCells,
                  flip: gapFlip,
                  bound: gapBound,
                  setWidth: surfaceActions.setGapWidth,
                  toggleFlip: surfaceActions.toggleGapFlip,
                  unbind: surfaceActions.unbindGap,
                  deleteGap: surfaceActions.deleteGap,
                  deselectGap: surfaceActions.deselectGap,
                }
              : null,
          }
        : null,
    });
  }, [
    onSurfaceChange, isWallTool, isDrawing, vertexCount, snapEnabled, angleSnapEnabled,
    hasAsset, assetForm, assetKind, hasSelectedWall, editVertexCount, editWidthScale, editFlip,
    hasSelectedGap, gapWidthCells, gapBound, gapFlip,
    surfaceActions,
  ]);
  // Clear the surface on unmount so a stale footer can't linger.
  useEffect(() => () => onSurfaceChange?.(null), [onSurfaceChange]);
}

export { useWallToolSurface };
export type { WallSurfaceLive, WallSurfaceSnapshot };
