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
 * list. The map's other beacons form a third list — every beacon is
 * discoverable unless it opted out — and ignore layer scope and note
 * filters, since a beacon sits on no layer and links no note of its own.
 * Everything here is in-memory map data — no vault scans.
 */

// Type-only imports
import type { MapData, MapLayer, PartyPin } from '#types/core/map.types';
import type { IGeometry, Point } from '#types/core/geometry.types';
import type { MapObject, ObjectId } from '#types/objects/object.types';
import type { DiagonalRule, DistanceDisplayFormat } from '#types/settings/settings.types';

import { formatDistance } from '../drawing/distanceOperations';

/** Vault-side metadata for a note, sourced from Obsidian's in-memory caches */
export interface NoteMetadata {
  /** Tags without the leading #, lowercased */
  tags: string[];
  /** Frontmatter properties */
  frontmatter: Record<string, unknown>;
}

/** Metadata accessor injected by the caller; null when the note is unknown */
export type NoteMetadataAccessor = (notePath: string) => NoteMetadata | null;

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

/** Another beacon within range of this one */
export interface PartyRangeBeaconResult {
  pinId: string;
  label: string;
  color: string;
  distanceInCells: number;
  distanceLabel: string;
  position: Point;
  /** That beacon's generated note, when it has one */
  notePath?: string;
}

export interface PartyRangeResults {
  linked: PartyRangeNoteResult[];
  unlinked: PartyRangeUnlinkedResult[];
  beacons: PartyRangeBeaconResult[];
}

interface PartyRangeQuerySettings {
  rangeInCells: number;
  distancePerCell: number;
  distanceUnit: string;
  diagonalRule: DiagonalRule;
  displayFormat: DistanceDisplayFormat;
  /** Resolves note tags/frontmatter for filtering; omit to skip filters */
  noteMetadata?: NoteMetadataAccessor;
}

/**
 * The slice of map data the query reads. Narrower than MapData on purpose:
 * callers hold one memoized query per beacon, and depending on these two
 * fields alone keeps a beacon's results cached while unrelated map edits
 * (a cell painted, a view change) churn the map object.
 */
export type PartyRangeMapData = Pick<MapData, 'layers' | 'partyPins'>;

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
 * Resolve which layers the query covers. A 'selected' scope whose layer ids
 * no longer exist on the map degrades gracefully to all layers rather than
 * silently returning nothing.
 */
function resolveScopedLayers(mapData: PartyRangeMapData, pin: PartyPin): MapLayer[] {
  const scope = pin.layerScope;
  if (scope == null || scope.mode !== 'selected') return mapData.layers;
  const selected = mapData.layers.filter(layer => scope.layerIds.includes(layer.id));
  return selected.length > 0 ? selected : mapData.layers;
}

/**
 * Apply the pin's tag/property filters to a linked note's metadata.
 * Unknown notes (no metadata) fail configured filters — an unresolvable
 * link cannot demonstrate a required tag or property.
 */
function passesFilters(pin: PartyPin, notePath: string, noteMetadata?: NoteMetadataAccessor): boolean {
  const filters = pin.filters;
  const tagFilter = filters?.tags ?? [];
  const propertyFilter = filters?.properties ?? {};
  const propertyNames = Object.keys(propertyFilter);
  if (tagFilter.length === 0 && propertyNames.length === 0) return true;
  if (noteMetadata == null) return true;

  const metadata = noteMetadata(notePath);
  if (metadata == null) return false;

  if (tagFilter.length > 0) {
    const noteTags = new Set(metadata.tags.map(t => t.toLowerCase()));
    const hasTag = tagFilter.some(tag => noteTags.has(tag.replace(/^#/, '').toLowerCase()));
    if (!hasTag) return false;
  }

  for (const property of propertyNames) {
    const accepted = propertyFilter[property];
    if (accepted.length === 0) continue;
    const raw = metadata.frontmatter[property];
    const values = Array.isArray(raw) ? raw : [raw];
    const matched = values.some(value =>
      value != null && accepted.some(a => String(value).toLowerCase() === a.toLowerCase())
    );
    if (!matched) return false;
  }

  return true;
}

/** The distance settings the beacon-to-beacon query needs */
type PartyBeaconQuerySettings = Omit<PartyRangeQuerySettings, 'noteMetadata'>;

/**
 * The other beacons within range of this one, nearest first. Cheap on its
 * own, so callers can key it on the pin list alone and leave the marker
 * scan cached while a beacon drags.
 */
function queryPartyBeacons(
  partyPins: PartyPin[] | undefined,
  geometry: IGeometry,
  pin: PartyPin,
  settings: PartyBeaconQuerySettings
): PartyRangeBeaconResult[] {
  const { rangeInCells, distancePerCell, distanceUnit, diagonalRule, displayFormat } = settings;
  const beacons: PartyRangeBeaconResult[] = [];
  for (const other of partyPins ?? []) {
    if (other.id === pin.id || other.discoverable === false) continue;
    const distance = geometry.getCellDistance(
      pin.position.x, pin.position.y, other.position.x, other.position.y, { diagonalRule }
    );
    if (distance > rangeInCells + RANGE_EPSILON) continue;
    const notePath = other.partyNote?.path;
    beacons.push({
      pinId: other.id,
      label: other.label,
      color: other.color,
      distanceInCells: distance,
      distanceLabel: formatDistance(distance, distancePerCell, distanceUnit, displayFormat),
      position: other.position,
      ...(notePath != null && notePath !== '' ? { notePath } : {})
    });
  }
  beacons.sort((a, b) => a.distanceInCells - b.distanceInCells);
  return beacons;
}

/**
 * Collect the markers within range of the party pin.
 * @returns Linked notes (deduplicated, min distance first), labeled
 *          unlinked markers and discoverable beacons, all sorted nearest-first.
 */
function queryPartyRange(
  mapData: PartyRangeMapData,
  geometry: IGeometry,
  pin: PartyPin,
  settings: PartyRangeQuerySettings
): PartyRangeResults {
  const { rangeInCells, distancePerCell, distanceUnit, diagonalRule, displayFormat, noteMetadata } = settings;
  const byNote = new Map<string, PartyRangeNoteResult>();
  const unlinked: PartyRangeUnlinkedResult[] = [];

  for (const layer of resolveScopedLayers(mapData, pin)) {
    for (const obj of layer.objects ?? []) {
      const cell = objectCellPosition(obj, geometry);
      const distance = geometry.getCellDistance(
        pin.position.x, pin.position.y, cell.x, cell.y, { diagonalRule }
      );
      if (distance > rangeInCells + RANGE_EPSILON) continue;

      const notePath = obj.linkedNote ?? null;
      if (notePath != null && notePath !== '') {
        if (!passesFilters(pin, notePath, noteMetadata)) continue;
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
  const beacons = queryPartyBeacons(mapData.partyPins, geometry, pin, settings);
  return { linked, unlinked, beacons };
}

export { queryPartyRange, queryPartyBeacons, noteDisplayName };
