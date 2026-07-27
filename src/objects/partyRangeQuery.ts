/**
 * partyRangeQuery.ts
 *
 * Answers "what is near the party pin?" against the map's placed markers.
 * Distances use the map's native rules (per-cell distance, diagonal rule,
 * hex distance) via geometry.getCellDistance, so results agree with the
 * measure tool and the range ring.
 *
 * Candidates are markers across all layers: objects carrying a linked note
 * form the primary results (keyed by note, deduplicated at minimum
 * distance); markers with only a label/tooltip form a separate unlinked
 * list. Everything here is in-memory map data — no vault scans.
 */

// Type-only imports
import type { MapData, PartyPin } from '#types/core/map.types';
import type { IGeometry, Point } from '#types/core/geometry.types';
import type { MapObject, ObjectId } from '#types/objects/object.types';
import type { DiagonalRule, DistanceDisplayFormat } from '#types/settings/settings.types';

import { formatDistance } from '../drawing/distanceOperations';

/** A linked note within range of the party pin */
export interface PartyRangeNoteResult {
  notePath: string;
  displayName: string;
  distanceInCells: number;
  distanceLabel: string;
  /** Nearest marker linking this note (for show-on-map affordances) */
  sourceObjectId: ObjectId;
  /** Cell position of that marker */
  position: Point;
}

/** A labeled but unlinked marker within range */
export interface PartyRangeUnlinkedResult {
  label: string;
  distanceInCells: number;
  distanceLabel: string;
  objectId: ObjectId;
  position: Point;
}

export interface PartyRangeResults {
  linked: PartyRangeNoteResult[];
  unlinked: PartyRangeUnlinkedResult[];
}

interface PartyRangeQuerySettings {
  rangeInCells: number;
  distancePerCell: number;
  distanceUnit: string;
  diagonalRule: DiagonalRule;
  displayFormat: DistanceDisplayFormat;
}

const RANGE_EPSILON = 1e-6;

/** Strip folders and extension for display, matching note-link conventions */
function noteDisplayName(notePath: string): string {
  const base = notePath.split('/').pop() ?? notePath;
  return base.replace(/\.md$/, '');
}

/** Resolve a marker's cell position (freeform objects store world coords) */
function objectCellPosition(obj: MapObject, geometry: IGeometry): Point {
  if (obj.freeform === true && obj.worldPosition) {
    return geometry.worldToGrid(obj.worldPosition.x, obj.worldPosition.y);
  }
  return obj.position;
}

/**
 * Collect the markers within range of the party pin.
 * @returns Linked notes (deduplicated, min distance first) and labeled
 *          unlinked markers, both sorted nearest-first.
 */
function queryPartyRange(
  mapData: MapData,
  geometry: IGeometry,
  pin: PartyPin,
  settings: PartyRangeQuerySettings
): PartyRangeResults {
  const { rangeInCells, distancePerCell, distanceUnit, diagonalRule, displayFormat } = settings;
  const byNote = new Map<string, PartyRangeNoteResult>();
  const unlinked: PartyRangeUnlinkedResult[] = [];

  for (const layer of mapData.layers) {
    for (const obj of layer.objects ?? []) {
      const cell = objectCellPosition(obj, geometry);
      const distance = geometry.getCellDistance(
        pin.position.x, pin.position.y, cell.x, cell.y, { diagonalRule }
      );
      if (distance > rangeInCells + RANGE_EPSILON) continue;

      const notePath = obj.linkedNote ?? null;
      if (notePath != null && notePath !== '') {
        const existing = byNote.get(notePath);
        if (!existing || distance < existing.distanceInCells) {
          byNote.set(notePath, {
            notePath,
            displayName: noteDisplayName(notePath),
            distanceInCells: distance,
            distanceLabel: formatDistance(distance, distancePerCell, distanceUnit, displayFormat),
            sourceObjectId: obj.id,
            position: cell
          });
        }
        continue;
      }

      const label = obj.customTooltip ?? obj.label ?? '';
      if (label !== '') {
        unlinked.push({
          label,
          distanceInCells: distance,
          distanceLabel: formatDistance(distance, distancePerCell, distanceUnit, displayFormat),
          objectId: obj.id,
          position: cell
        });
      }
    }
  }

  const linked = Array.from(byNote.values()).sort((a, b) => a.distanceInCells - b.distanceInCells);
  unlinked.sort((a, b) => a.distanceInCells - b.distanceInCells);
  return { linked, unlinked };
}

export { queryPartyRange, noteDisplayName };
