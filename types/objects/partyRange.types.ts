/**
 * partyRange.types.ts
 *
 * Result shapes for the Beacon (party pin) range query.
 */

import type { Point } from '../core/geometry.types';
import type { ObjectId } from './object.types';

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
