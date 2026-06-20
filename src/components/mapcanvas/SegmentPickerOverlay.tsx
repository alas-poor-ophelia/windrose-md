/**
 * SegmentPickerOverlay.tsx
 *
 * Mobile-friendly picker for segment painting (partial cell painting).
 * Shows an enlarged view of the 8 triangular segments within a cell,
 * allowing users to tap or drag to toggle individual segments.
 *
 * Used when the segmentDraw tool is active and user taps on a cell
 * on a touch device.
 */

import type { HexColor } from '#types/core/common.types';
import type { SegmentName } from '#types/core/cell.types';
import type { VNode } from 'preact';
import type { Point } from '#types/core/geometry.types';

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { ModalPortal } from '../modals/ModalPortal';
import { SEGMENT_NAMES, SEGMENT_VERTICES, SEGMENT_TRIANGLES } from '../../core/dmtConstants';




/** Existing cell data structure */
interface ExistingCellData {
  segments?: Partial<Record<SegmentName, boolean>>;
  color?: HexColor;
}

/** Props for SegmentPickerOverlay component */
export interface SegmentPickerOverlayProps {
  /** Whether the picker is visible */
  isOpen: boolean;
  /** Coordinates of the cell being edited */
  cellCoords: Point | null;
  /** Existing cell data (if editing), or null for new cell */
  existingCell: ExistingCellData | null;
  /** Currently selected paint color */
  selectedColor: HexColor;
  /** Currently selected paint opacity (0-1) */
  selectedOpacity?: number;
  /** Called with array of selected segment names and remember state */
  onConfirm: (segments: SegmentName[], remember: boolean) => void;
  /** Called when picker is dismissed */
  onCancel: () => void;
  /** Previously saved segment selection */
  savedSegments?: SegmentName[];
  /** Initial state of "remember selection" checkbox */
  initialRememberState?: boolean;
}

/**
 * Calculate triangle path for SVG rendering
 */
function getSegmentPath(segmentName: SegmentName, size: number): string {
  const [v1Name, v2Name, v3Name] = SEGMENT_TRIANGLES[segmentName];

  const getPoint = (vertexName: keyof typeof SEGMENT_VERTICES): Point => {
    const vertex = SEGMENT_VERTICES[vertexName];
    return {
      x: vertex.xRatio * size,
      y: vertex.yRatio * size
    };
  };

  const v1 = getPoint(v1Name);
  const v2 = getPoint(v2Name);
  const v3 = getPoint(v3Name);

  return `M ${v1.x} ${v1.y} L ${v2.x} ${v2.y} L ${v3.x} ${v3.y} Z`;
}

const SegmentPickerOverlay = ({
  isOpen,
  cellCoords,
  existingCell,
  selectedColor,
  selectedOpacity = 1,
  onConfirm,
  onCancel,
  savedSegments = [],
  initialRememberState = true
}: SegmentPickerOverlayProps): VNode | null => {
  const [selectedSegments, setSelectedSegments] = useState<Set<SegmentName>>(new Set());
  const [rememberSelection, setRememberSelection] = useState(initialRememberState);
  const selectedSegmentsRef = useRef<Set<SegmentName>>(selectedSegments);
  selectedSegmentsRef.current = selectedSegments;

  const dragModeRef = useRef<'add' | 'remove' | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const PICKER_SIZE = 200;

  useEffect(() => {
    if (isOpen && existingCell) {
      if (existingCell.segments) {
        const segs = existingCell.segments;
        const filled = (Object.keys(segs) as SegmentName[]).filter(
          seg => segs[seg] === true
        );
        setSelectedSegments(new Set(filled));
      } else if (existingCell.color != null && existingCell.color !== '') {
        setSelectedSegments(new Set(SEGMENT_NAMES));
      } else {
        setSelectedSegments(new Set());
      }
    } else if (isOpen) {
      if (savedSegments.length > 0) {
        setSelectedSegments(new Set(savedSegments));
      } else {
        setSelectedSegments(new Set());
      }
    }

    if (isOpen) {
      setRememberSelection(initialRememberState);
    }
  }, [isOpen, existingCell, savedSegments, initialRememberState]);

  useEffect(() => {
    if (!isOpen) {
      dragModeRef.current = null;
    }
  }, [isOpen]);

  /**
   * Determine which segment a point is in based on angle from center
   */
  const getSegmentAtPoint = (x: number, y: number): SegmentName => {
    const centerX = PICKER_SIZE / 2;
    const centerY = PICKER_SIZE / 2;

    const dx = x - centerX;
    const dy = y - centerY;

    let angle = Math.atan2(-dy, dx) * (180 / Math.PI);
    if (angle < 0) angle += 360;

    if (angle >= 315) return 'e';
    if (angle >= 270) return 'se';
    if (angle >= 225) return 's';
    if (angle >= 180) return 'sw';
    if (angle >= 135) return 'w';
    if (angle >= 90) return 'nw';
    if (angle >= 45) return 'n';
    return 'ne';
  };

  /**
   * Get touch/mouse position relative to the SVG element
   */
  const getRelativePosition = (e: TouchEvent | MouseEvent): Point | null => {
    if (!svgRef.current) return null;

    const rect = svgRef.current.getBoundingClientRect();
    let clientX: number, clientY: number;

    if ('touches' in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if ('changedTouches' in e && e.changedTouches.length > 0) {
      clientX = e.changedTouches[0].clientX;
      clientY = e.changedTouches[0].clientY;
    } else if ('clientX' in e) {
      clientX = e.clientX;
      clientY = e.clientY;
    } else {
      return null;
    }

    const scaleX = PICKER_SIZE / rect.width;
    const scaleY = PICKER_SIZE / rect.height;

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  /**
   * Handle segment toggle (tap or drag start)
   */
  const handleSegmentInteraction = useCallback((segment: SegmentName | null, isStart = false): void => {
    if (!segment) return;

    if (isStart) {
      const isCurrentlySelected = selectedSegmentsRef.current.has(segment);
      dragModeRef.current = isCurrentlySelected ? 'remove' : 'add';
    }

    setSelectedSegments(prev => {
      const newSet = new Set(prev);
      if (dragModeRef.current === 'add') {
        newSet.add(segment);
      } else {
        newSet.delete(segment);
      }
      return newSet;
    });
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !isOpen) return undefined;

    let dragging = false;

    const handleStart = (e: TouchEvent | MouseEvent): void => {
      e.preventDefault();
      e.stopPropagation();

      const pos = getRelativePosition(e);
      if (!pos) return;

      const segment = getSegmentAtPoint(pos.x, pos.y);
      if (segment) {
        dragging = true;
        handleSegmentInteraction(segment, true);
      }
    };

    const handleMove = (e: TouchEvent | MouseEvent): void => {
      if (!dragging) return;

      e.preventDefault();
      e.stopPropagation();

      const pos = getRelativePosition(e);
      if (!pos) return;

      const segment = getSegmentAtPoint(pos.x, pos.y);
      if (segment) {
        handleSegmentInteraction(segment, false);
      }
    };

    const handleEnd = (e: TouchEvent | MouseEvent): void => {
      if (dragging) {
        e.preventDefault();
        e.stopPropagation();
      }
      dragging = false;
      dragModeRef.current = null;
    };

    svg.addEventListener('touchstart', handleStart as EventListener, { passive: false });
    svg.addEventListener('touchmove', handleMove as EventListener, { passive: false });
    svg.addEventListener('touchend', handleEnd as EventListener, { passive: false });
    svg.addEventListener('touchcancel', handleEnd as EventListener, { passive: false });
    svg.addEventListener('mousedown', handleStart as EventListener);
    svg.addEventListener('mousemove', handleMove as EventListener);
    svg.addEventListener('mouseup', handleEnd as EventListener);
    svg.addEventListener('mouseleave', handleEnd as EventListener);

    return () => {
      svg.removeEventListener('touchstart', handleStart as EventListener);
      svg.removeEventListener('touchmove', handleMove as EventListener);
      svg.removeEventListener('touchend', handleEnd as EventListener);
      svg.removeEventListener('touchcancel', handleEnd as EventListener);
      svg.removeEventListener('mousedown', handleStart as EventListener);
      svg.removeEventListener('mousemove', handleMove as EventListener);
      svg.removeEventListener('mouseup', handleEnd as EventListener);
      svg.removeEventListener('mouseleave', handleEnd as EventListener);
    };
  }, [isOpen, handleSegmentInteraction]);

  if (!isOpen) return null;

  const handleConfirm = (e: Event): void => {
    e.preventDefault();
    e.stopPropagation();
    onConfirm(Array.from(selectedSegments), rememberSelection);
  };

  const handleCancel = (e: Event): void => {
    e.preventDefault();
    e.stopPropagation();
    onCancel();
  };

  const handleOverlayClick = (e: Event): void => {
    if (e.target === e.currentTarget) {
      onCancel();
    }
  };

  const handleSelectAll = (e: Event): void => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedSegments(new Set(SEGMENT_NAMES));
  };

  const handleClearAll = (e: Event): void => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedSegments(new Set());
  };

  const segmentAngles: Record<SegmentName, number> = {
    ne: 22.5, n: 67.5, nw: 112.5, w: 157.5, sw: 202.5, s: 247.5, se: 292.5, e: 337.5
  };

  return (
    <ModalPortal>
      <div
        className="windrose-segment-picker-overlay windrose-segment-picker-backdrop"
        onClick={handleOverlayClick}
        onTouchEnd={handleOverlayClick}
      >
        <div
          className="windrose-segment-picker windrose-segment-picker-card"
          onClick={(e: Event) => e.stopPropagation()}
          onTouchEnd={(e: Event) => e.stopPropagation()}
        >
          <div className="windrose-segment-picker-title">
            Select Segments
          </div>

          <div className="windrose-segment-picker-subtitle">
            Cell ({cellCoords?.x}, {cellCoords?.y})
          </div>

          <div className="windrose-segment-picker-svg-wrap">
            <svg
              ref={svgRef}
              width={PICKER_SIZE}
              height={PICKER_SIZE}
              viewBox={`0 0 ${PICKER_SIZE} ${PICKER_SIZE}`}
              className="windrose-segment-picker-svg"
            >
              <line x1={PICKER_SIZE/2} y1="0" x2={PICKER_SIZE/2} y2={PICKER_SIZE} stroke="#444" strokeWidth="1" />
              <line x1="0" y1={PICKER_SIZE/2} x2={PICKER_SIZE} y2={PICKER_SIZE/2} stroke="#444" strokeWidth="1" />
              <line x1="0" y1="0" x2={PICKER_SIZE} y2={PICKER_SIZE} stroke="#444" strokeWidth="1" />
              <line x1={PICKER_SIZE} y1="0" x2="0" y2={PICKER_SIZE} stroke="#444" strokeWidth="1" />

              {(SEGMENT_NAMES).map(segmentName => {
                const isSelected = selectedSegments.has(segmentName);
                const path = getSegmentPath(segmentName, PICKER_SIZE);

                return (
                  <path
                    key={segmentName}
                    d={path}
                    fill={isSelected ? selectedColor : 'transparent'}
                    fillOpacity={isSelected ? selectedOpacity : 0}
                    stroke={isSelected ? '#c4a57b' : '#666'}
                    strokeWidth={isSelected ? 2 : 1}
                    style={{ pointerEvents: 'none' }}
                  />
                );
              })}

              {(SEGMENT_NAMES).map(segmentName => {
                const angle = segmentAngles[segmentName] * (Math.PI / 180);
                const labelRadius = PICKER_SIZE * 0.35;
                const labelX = PICKER_SIZE/2 + Math.cos(angle) * labelRadius;
                const labelY = PICKER_SIZE/2 - Math.sin(angle) * labelRadius;
                const isSelected = selectedSegments.has(segmentName);

                return (
                  <text
                    key={`label-${segmentName}`}
                    x={labelX}
                    y={labelY}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill={isSelected ? '#fff' : '#888'}
                    fontSize="12"
                    fontWeight={isSelected ? '600' : '400'}
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    {segmentName.toUpperCase()}
                  </text>
                );
              })}

              <circle
                cx={PICKER_SIZE/2}
                cy={PICKER_SIZE/2}
                r="4"
                fill="#c4a57b"
                style={{ pointerEvents: 'none' }}
              />
            </svg>
          </div>

          <div className="windrose-segment-picker-actions">
            <button onClick={handleSelectAll} className="windrose-segment-picker-btn">
              Select All
            </button>
            <button onClick={handleClearAll} className="windrose-segment-picker-btn">
              Clear All
            </button>
          </div>

          <div className="windrose-segment-picker-status">
            {selectedSegments.size} of 8 segments selected
          </div>

          <label className="windrose-segment-picker-remember">
            <input
              type="checkbox"
              checked={rememberSelection}
              onChange={(e: Event) => setRememberSelection((e.target as HTMLInputElement).checked)}
            />
            Remember selection for next cell
          </label>

          <div className="windrose-segment-picker-footer">
            <button onClick={handleCancel} className="windrose-segment-picker-btn-lg">
              Cancel
            </button>
            <button onClick={handleConfirm} className="windrose-segment-picker-btn-lg is-primary">
              Apply
            </button>
          </div>

          <div className="windrose-segment-picker-hint">
            Tap or drag to toggle segments
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};

export { SegmentPickerOverlay };