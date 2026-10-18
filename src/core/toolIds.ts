/**
 * toolIds.ts
 *
 * The runtime twin of the `ToolId` union, for callers that receive a tool id as
 * a plain string (the MCP bridge, deep links, scripts). `satisfies` keeps the
 * table complete: adding a member to `ToolId` without listing it here is a
 * compile error, and a stray key is one too.
 *
 * The paint tool's id is `draw` (palette "Paint cells"); there is no `paint`.
 */

import type { ToolId } from '#types/tools/tool.types';

const TOOL_ID_TABLE = {
  select: true,
  areaSelect: true,
  draw: true,
  freehand: true,
  erase: true,
  rectangle: true,
  circle: true,
  clearArea: true,
  diagonalFill: true,
  edgeDraw: true,
  edgeErase: true,
  edgeLine: true,
  segmentDraw: true,
  addObject: true,
  addText: true,
  addNote: true,
  partyPin: true,
  regionPaint: true,
  regionBoundary: true,
  shape: true,
  tilePaint: true,
  outline: true,
  wall: true,
  measure: true
} as const satisfies Record<ToolId, true>;

function isToolId(value: unknown): value is ToolId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(TOOL_ID_TABLE, value);
}

export { isToolId };
