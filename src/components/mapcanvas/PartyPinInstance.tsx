/**
 * PartyPinInstance.tsx
 *
 * Everything that belongs to ONE beacon: its range query, related notes,
 * travel labels, debounced beacon-note writer, range ring overlay and — when
 * it is the selected beacon — its controls card. PartyPinLayer renders one
 * instance per pin, so every beacon answers "what is in range?" for itself,
 * and a beacon whose own inputs did not change reuses its memoized query
 * while other beacons move or change.
 */

import type { VNode } from 'preact';
import type { PartyPin } from '#types/core/map.types';
import type { Point } from '#types/core/geometry.types';

import { Notice } from 'obsidian';
import { useCallback, useEffect, useMemo, useRef } from 'preact/hooks';
import type { ResolvedDistanceSettings } from '../../drawing/distanceOperations';
import { rangeUnitsToCells } from '../../drawing/rangeOperations';
import { getPartyPinIconPlacement, removePartyPin, upsertPartyPin } from '../../objects/partyPinOperations';
import { queryPartyBeacons, queryPartyRange } from '../../objects/partyRangeQuery';
import type { NoteMetadataAccessor } from '../../objects/partyRangeQuery';
import type { PartyRangeResults } from '#types/objects/partyRange.types';
import type { RelatedNotes, RelatedNotesSource } from '../../objects/partyRelatedNotes';
import { extractCacheTags, getRelatedByBacklinks, getRelatedByTags } from '../../objects/partyRelatedNotes';
import type { PartyNoteContext, PartyNoteTravelLabels } from '../../persistence/partyNoteOperations';
import {
  buildPartyNoteContent,
  buildPartyNotePath,
  deletePartyNote,
  upsertPartyNote,
  findPartyNoteByMarker,
  onPartyNoteRenamed
} from '../../persistence/partyNoteOperations';
import { openNoteInNewTab } from '../../persistence/noteOperations';
import { ConfirmModal } from '../../settings/modals/ConfirmModal';
import { PartyPinOverlay } from '../overlays/PartyPinOverlay';
import { PartyPinControls } from '../overlays/PartyPinControls';
import { useApp } from '../../context/AppContext';
import { useMapState } from '../../context/MapContext';

const EMPTY_RESULTS: PartyRangeResults = { linked: [], unlinked: [], beacons: [] };

/** Note writes coalesce bursts of edits into one file operation */
const PARTY_NOTE_SAVE_DELAY_MS = 2000;
/** Related notes shown per result before the "+N more" overflow */
const PARTY_RELATED_CAP = 5;

export interface PartyPinInstanceProps {
  pin: PartyPin;
  /** Show this beacon's controls card (it is the selected beacon) */
  showControls: boolean;
  /** Map distance rules, memoized by the layer so per-pin queries stay cached */
  distanceSettings: ResolvedDistanceSettings;
  /** Tags/frontmatter accessor for the pin's note filters */
  noteMetadata: NoteMetadataAccessor;
  /** Map-level context block for generated beacon notes */
  noteContext: PartyNoteContext;
  /** True when at least one travel mode is active for the map */
  hasTravelModes: boolean;
  /** Compact per-mode travel label for a result distance; null = none */
  travelLabelFor: (distanceInCells: number) => string | null;
  /** One explicit unit-guidance line when a selected travel mode cannot compute */
  travelHint: string | null;
  /** Cell to pulse-highlight, set only for the beacon that requested it */
  flashMarker: Point | null;
  /** Navigate/flash a result's source marker on the map */
  onShowOnMap: (position: Point) => void;
  /** Change handler for the map's party pins (history-aware) */
  onPartyPinsChange: (partyPins: PartyPin[], suppressHistory?: boolean) => void;
}

const PartyPinInstance = ({
  pin,
  showControls,
  distanceSettings,
  noteMetadata,
  noteContext,
  hasTravelModes,
  travelLabelFor,
  travelHint,
  flashMarker,
  onShowOnMap,
  onPartyPinsChange
}: PartyPinInstanceProps): VNode | null => {
  const app = useApp();
  const { mapData, geometry, canvasRef, viewController } = useMapState();

  // Latest pins for commits that resume after an await (note creation, the
  // removal confirm dialog): another beacon may have moved meanwhile, and a
  // captured array would write its old position back.
  const pinsRef = useRef<PartyPin[]>([]);
  pinsRef.current = mapData?.partyPins ?? [];

  const rangeInCells = rangeUnitsToCells(pin.range, distanceSettings.distancePerCell);
  // The marker scan only reads layers; depending on that alone keeps this
  // beacon's results cached while other beacons churn the map object. The
  // pin list changes on every drag tick of any beacon, so the cheap
  // beacon-to-beacon check is a separate memo and the two merge below.
  const layers = mapData?.layers ?? null;
  const partyPins = mapData?.partyPins;

  const markerResults = useMemo((): PartyRangeResults => {
    if (!layers || !geometry) return EMPTY_RESULTS;
    return queryPartyRange({ layers }, geometry, pin, {
      rangeInCells,
      distancePerCell: distanceSettings.distancePerCell,
      distanceUnit: distanceSettings.distanceUnit,
      diagonalRule: distanceSettings.gridDiagonalRule,
      displayFormat: distanceSettings.displayFormat,
      noteMetadata
    });
  }, [layers, geometry, pin, rangeInCells, distanceSettings, noteMetadata]);

  const beaconResults = useMemo(() => {
    if (!geometry) return EMPTY_RESULTS.beacons;
    return queryPartyBeacons(partyPins, geometry, pin, {
      rangeInCells,
      distancePerCell: distanceSettings.distancePerCell,
      distanceUnit: distanceSettings.distanceUnit,
      diagonalRule: distanceSettings.gridDiagonalRule,
      displayFormat: distanceSettings.displayFormat
    });
  }, [partyPins, geometry, pin, rangeInCells, distanceSettings]);

  const results = useMemo(
    (): PartyRangeResults => ({ linked: markerResults.linked, unlinked: markerResults.unlinked, beacons: beaconResults }),
    [markerResults, beaconResults]
  );

  // Where this beacon's icon sits when it shares its cell with others
  const iconPlacement = useMemo(
    () => geometry ? getPartyPinIconPlacement(partyPins, pin, geometry) : undefined,
    [partyPins, pin, geometry]
  );

  /** Per-result travel labels for the beacon note's Travel column */
  const travelLabels = useMemo((): PartyNoteTravelLabels | undefined => {
    if (!hasTravelModes) return undefined;
    const linked = new Map<string, string>();
    for (const result of results.linked) {
      const label = travelLabelFor(result.distanceInCells);
      if (label != null) linked.set(result.notePath, label);
    }
    const unlinked = new Map<string, string>();
    for (const result of results.unlinked) {
      const label = travelLabelFor(result.distanceInCells);
      if (label != null) unlinked.set(result.objectId, label);
    }
    const beacons = new Map<string, string>();
    for (const result of results.beacons) {
      const label = travelLabelFor(result.distanceInCells);
      if (label != null) beacons.set(result.pinId, label);
    }
    return { linked, unlinked, beacons };
  }, [hasTravelModes, results, travelLabelFor]);

  // Related notes per result (tags or backlinks), for the beacon note table.
  // Keyed on the marker scan, not the merged results: beacon churn must
  // never re-run the vault-wide tag table below.
  const linkedResults = markerResults.linked;
  const relatedMap = useMemo((): Map<string, RelatedNotes> | undefined => {
    const mode = pin.relatedMode ?? 'off';
    if (mode === 'off' || linkedResults.length === 0) return undefined;
    // Materialize the vault-wide tag table ONCE per recompute: getRelatedByTags
    // iterates noteTags() fully per result, so a per-call generator would
    // rescan every markdown file for every in-range note (O(results × vault)).
    const noteTagsTable: Array<[string, string[]]> = mode === 'tags'
      ? app.vault.getMarkdownFiles().map(file =>
        [file.path, extractCacheTags(app.metadataCache.getFileCache(file))])
      : [];
    const source: RelatedNotesSource = {
      noteTags: () => noteTagsTable,
      resolvedLinks: () => app.metadataCache.resolvedLinks
    };
    const excludePaths = pin.partyNote?.path != null && pin.partyNote.path !== '' ? [pin.partyNote.path] : [];
    const map = new Map<string, RelatedNotes>();
    for (const result of linkedResults) {
      map.set(result.notePath, mode === 'tags'
        ? getRelatedByTags(source, result.notePath, { cap: PARTY_RELATED_CAP, excludeTags: pin.filters?.tags, excludePaths })
        : getRelatedByBacklinks(source, result.notePath, { cap: PARTY_RELATED_CAP, excludePaths }));
    }
    return map;
  }, [pin, linkedResults, app]);

  const inRangeMarkers = useMemo(
    () => [...results.linked, ...results.unlinked, ...results.beacons].map(r => r.position),
    [results]
  );

  // Note content doubles as the change signal: the debounced write below
  // only re-arms when the rendered content actually differs
  const noteContent = useMemo(() => {
    if (pin.partyNote?.enabled !== true) return null;
    return buildPartyNoteContent(pin, results, noteContext, relatedMap, travelLabels);
  }, [pin, results, noteContext, relatedMap, travelLabels]);

  // Pin removal must not race the debounced writer: a timer firing between
  // the note's trashing and the removal commit would resurrect the file via
  // upsert's recreate-on-manual-delete path. The flag suppresses in-flight
  // writes during removal and resets whenever a live pin re-arms the writer
  // (undo of a removal included).
  const suppressNoteWritesRef = useRef(false);
  // Guards the reset below: while a removal awaits its confirm dialog
  // (unbounded), dep changes (another in-range marker moving, say) re-run the
  // writer effect — without this flag that re-run would clear the suppression
  // and a timer firing between deletePartyNote and the removal commit would
  // resurrect the just-trashed note.
  const removalInFlightRef = useRef(false);

  useEffect(() => {
    if (noteContent == null || pin.partyNote == null) return undefined;
    if (!removalInFlightRef.current) suppressNoteWritesRef.current = false;
    const pinForWrite = pin;
    const timer = window.setTimeout(() => {
      if (suppressNoteWritesRef.current) return;
      upsertPartyNote(app, pinForWrite, noteContent).catch((error: unknown) => {
        console.error('[Windrose] Beacon note write failed:', error);
      });
    }, PARTY_NOTE_SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [noteContent, pin, app]);

  // Follow the note when it is renamed or moved: a live rename is broadcast
  // from main.ts; a rename that happened while this map was closed is found
  // again by the note's ownership marker.
  const notePath = pin.partyNote?.path ?? '';
  useEffect(() => {
    if (notePath === '') return undefined;
    const repoint = (newPath: string): void => {
      const current = pinsRef.current.find(p => p.id === pin.id);
      if (current?.partyNote == null || current.partyNote.path === newPath) return;
      onPartyPinsChange(upsertPartyPin(pinsRef.current, { ...current, partyNote: { ...current.partyNote, path: newPath } }));
    };
    if (app.vault.getAbstractFileByPath(notePath) == null) {
      const moved = findPartyNoteByMarker(app, pin.id);
      if (moved != null) repoint(moved.path);
    }
    return onPartyNoteRenamed((oldPath, newPath) => {
      if (oldPath === notePath) repoint(newPath);
    });
  }, [notePath, pin.id, app, onPartyPinsChange]);

  const handleCreatePartyNote = useCallback(async (folder: string): Promise<void> => {
    const path = buildPartyNotePath(folder, pin.label);
    const updatedPin: PartyPin = { ...pin, partyNote: { enabled: true, path } };
    const outcome = await upsertPartyNote(app, updatedPin, buildPartyNoteContent(updatedPin, results, noteContext, relatedMap, travelLabels));
    if (outcome === 'blocked') {
      new Notice(`A note already exists at ${path} — choose another folder or rename the beacon.`);
      return;
    }
    onPartyPinsChange(upsertPartyPin(pinsRef.current, updatedPin));
  }, [pin, results, noteContext, relatedMap, travelLabels, app, onPartyPinsChange]);

  const handleOpenPartyNote = useCallback(async (): Promise<void> => {
    const path = pin.partyNote?.path;
    if (path == null || path === '') return;
    // Flush the pending debounced write first, so the tab never opens a
    // missing or stale file (upsert is change-detected — no churn)
    if (pin.partyNote?.enabled === true) {
      await upsertPartyNote(app, pin, buildPartyNoteContent(pin, results, noteContext, relatedMap, travelLabels));
    }
    await openNoteInNewTab(path);
  }, [pin, results, noteContext, relatedMap, travelLabels, app]);

  const handleRecalculate = useCallback((): void => {
    if (pin.partyNote?.enabled !== true) return;
    void upsertPartyNote(app, pin, buildPartyNoteContent(pin, results, noteContext, relatedMap, travelLabels))
      .then(outcome => {
        if (outcome === 'blocked') new Notice('Beacon note is blocked by an unrelated file at its path.');
      });
  }, [pin, results, noteContext, relatedMap, travelLabels, app]);

  const handleRemovePin = useCallback(async (): Promise<void> => {
    suppressNoteWritesRef.current = true;
    removalInFlightRef.current = true;
    try {
      if (pin.partyNote?.path != null && pin.partyNote.path !== '') {
        const alsoDeleteNote = await new ConfirmModal(app, {
          message: `Also delete the beacon note at "${pin.partyNote.path}"?\nThe beacon is removed either way.`,
          confirmText: 'Delete note',
          cancelText: 'Keep note',
          isDestructive: true
        }).openAndGetValue();
        if (alsoDeleteNote) {
          const outcome = await deletePartyNote(app, pin);
          if (outcome === 'not-owned') {
            new Notice('The file at the note path was not generated by this beacon — leaving it untouched.');
          }
        }
      }
      onPartyPinsChange(removePartyPin(pinsRef.current, pin.id));
    } finally {
      // Suppression itself stays armed — the writer effect clears it when a
      // live pin (undo of this removal included) re-arms the writer.
      removalInFlightRef.current = false;
    }
  }, [pin, app, onPartyPinsChange]);

  if (!mapData || !geometry) return null;

  return (
    <>
      <PartyPinOverlay
        pin={pin}
        iconPlacement={iconPlacement}
        labelVisible={iconPlacement?.sharesCell !== true || showControls}
        rangeInCells={rangeInCells}
        diagonalRule={distanceSettings.gridDiagonalRule}
        inRangeMarkers={inRangeMarkers}
        flashMarker={flashMarker}
        geometry={geometry}
        mapData={mapData}
        canvasRef={canvasRef}
        viewController={viewController}
      />
      {showControls && (
        <PartyPinControls
          pin={pin}
          partyPins={mapData.partyPins ?? []}
          distanceUnit={distanceSettings.distanceUnit}
          results={results}
          travelLabelFor={travelLabelFor}
          travelHint={travelHint}
          geometry={geometry}
          mapData={mapData}
          canvasRef={canvasRef}
          viewController={viewController}
          onPartyPinsChange={onPartyPinsChange}
          onShowOnMap={onShowOnMap}
          onCreatePartyNote={handleCreatePartyNote}
          onOpenPartyNote={() => { void handleOpenPartyNote(); }}
          onRecalculate={handleRecalculate}
          onRemovePin={() => { void handleRemovePin(); }}
        />
      )}
    </>
  );
};

export { PartyPinInstance };
