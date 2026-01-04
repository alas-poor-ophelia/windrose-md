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
import type { Point } from '#types/core/geometry.types';

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { ModalPortal } = await requireModuleByName("ModalPortal.tsx");
const { SEGMENT_NAMES, SEGMENT_VERTICES, SEGMENT_TRIANGLES } = await requireModuleByName("dmtConstants.ts");

/** Segment name type (8 triangular sections) */
type SegmentName = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

/** Existing cell data structure */
interface ExistingCellData {
  segments?: Record<SegmentName, boolean>;
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
  /** Screen position to anchor the picker near */
  screenPosition?: Point;
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

  const getPoint = (vertexName: string): Point => {
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
}: SegmentPickerOverlayProps): React.ReactElement | null => {
  const [selectedSegments, setSelectedSegments] = dc.useState<Set<SegmentName>>(new Set());
  const [rememberSelection, setRememberSelection] = dc.useState(initialRememberState);
  const selectedSegmentsRef = dc.useRef<Set<SegmentName>>(selectedSegments);
  selectedSegmentsRef.current = selectedSegments;

  const [isDragging, setIsDragging] = dc.useState(false);
  const dragModeRef = dc.useRef<'add' | 'remove' | null>(null);
  const svgRef = dc.useRef<SVGSVGElement | null>(null);

  const PICKER_SIZE = 200;

  dc.useEffect(() => {
    if (isOpen && existingCell) {
      if (existingCell.segments) {
        const filled = (Object.keys(existingCell.segments) as SegmentName[]).filter(
          seg => existingCell.segments![seg]
        );
        setSelectedSegments(new Set(filled));
      } else if (existingCell.color) {
        setSelectedSegments(new Set(SEGMENT_NAMES as SegmentName[]));
      } else {
        setSelectedSegments(new Set());
      }
    } else if (isOpen) {
      if (savedSegments && savedSegments.length > 0) {
        setSelectedSegments(new Set(savedSegments));
      } else {
        setSelectedSegments(new Set());
      }
    }

    if (isOpen) {
      setRememberSelection(initialRememberState);
    }
  }, [isOpen, existingCell, savedSegments, initialRememberState]);

  dc.useEffect(() => {
    if (!isOpen) {
      setIsDragging(false);
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
  const handleSegmentInteraction = dc.useCallback((segment: SegmentName | null, isStart = false): void => {
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

  dc.useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !isOpen) return;

    let dragging = false;

    const handleStart = (e: TouchEvent | MouseEvent): void => {
      e.preventDefault();
      e.stopPropagation();

      const pos = getRelativePosition(e);
      if (!pos) return;

      const segment = getSegmentAtPoint(pos.x, pos.y);
      if (segment) {
        dragging = true;
        setIsDragging(true);
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
      setIsDragging(false);
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
    setSelectedSegments(new Set(SEGMENT_NAMES as SegmentName[]));
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
        className="dmt-segment-picker-overlay"
        onClick={handleOverlayClick}
        onTouchEnd={handleOverlayClick}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          zIndex: 1999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <div
          className="dmt-segment-picker"
          onClick={(e: Event) => e.stopPropagation()}
          onTouchEnd={(e: Event) => e.stopPropagation()}
          style={{
            backgroundColor: '#1a1a1a',
            borderRadius: '12px',
            padding: '16px',
            border: '2px solid #c4a57b',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
            minWidth: '260px'
          }}
        >
          <div style={{
            color: '#c4a57b',
            fontSize: '14px',
            fontWeight: '600',
            marginBottom: '12px',
            textAlign: 'center',
            textTransform: 'uppercase',
            letterSpacing: '1px'
          }}>
            Select Segments
          </div>

          <div style={{
            color: '#888',
            fontSize: '11px',
            textAlign: 'center',
            marginBottom: '12px'
          }}>
            Cell ({cellCoords?.x}, {cellCoords?.y})
          </div>

          <div style={{
            display: 'flex',
            justifyContent: 'center',
            marginBottom: '16px'
          }}>
            <svg
              ref={svgRef}
              width={PICKER_SIZE}
              height={PICKER_SIZE}
              viewBox={`0 0 ${PICKER_SIZE} ${PICKER_SIZE}`}
              style={{
                backgroundColor: '#2a2a2a',
                borderRadius: '8px',
                cursor: 'pointer',
                touchAction: 'none',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                WebkitTouchCallout: 'none'
              }}
            >
              <line x1={PICKER_SIZE/2} y1="0" x2={PICKER_SIZE/2} y2={PICKER_SIZE} stroke="#444" strokeWidth="1" />
              <line x1="0" y1={PICKER_SIZE/2} x2={PICKER_SIZE} y2={PICKER_SIZE/2} stroke="#444" strokeWidth="1" />
              <line x1="0" y1="0" x2={PICKER_SIZE} y2={PICKER_SIZE} stroke="#444" strokeWidth="1" />
              <line x1={PICKER_SIZE} y1="0" x2="0" y2={PICKER_SIZE} stroke="#444" strokeWidth="1" />

              {(SEGMENT_NAMES as SegmentName[]).map(segmentName => {
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

              {(SEGMENT_NAMES as SegmentName[]).map(segmentName => {
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

          <div style={{
            display: 'flex',
            gap: '8px',
            marginBottom: '16px',
            justifyContent: 'center'
          }}>
            <button
              onClick={handleSelectAll}
              style={{
                padding: '6px 12px',
                backgroundColor: '#333',
                border: '1px solid #555',
                borderRadius: '4px',
                color: '#ccc',
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              Select All
            </button>
            <button
              onClick={handleClearAll}
              style={{
                padding: '6px 12px',
                backgroundColor: '#333',
                border: '1px solid #555',
                borderRadius: '4px',
                color: '#ccc',
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              Clear All
            </button>
          </div>

          <div style={{
            color: '#888',
            fontSize: '12px',
            textAlign: 'center',
            marginBottom: '12px'
          }}>
            {selectedSegments.size} of 8 segments selected
          </div>

          <label style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            color: '#aaa',
            fontSize: '12px',
            cursor: 'pointer',
            marginBottom: '16px',
            userSelect: 'none',
            WebkitUserSelect: 'none'
          }}>
            <input
              type="checkbox"
              checked={rememberSelection}
              onChange={(e: Event) => setRememberSelection((e.target as HTMLInputElement).checked)}
              style={{
                width: '16px',
                height: '16px',
                cursor: 'pointer',
                accentColor: '#c4a57b'
              }}
            />
            Remember selection for next cell
          </label>

          <div style={{
            display: 'flex',
            gap: '12px',
            justifyContent: 'center'
          }}>
            <button
              onClick={handleCancel}
              style={{
                padding: '10px 24px',
                backgroundColor: '#333',
                border: '1px solid #555',
                borderRadius: '6px',
                color: '#ccc',
                fontSize: '14px',
                cursor: 'pointer',
                minWidth: '80px'
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              style={{
                padding: '10px 24px',
                backgroundColor: '#c4a57b',
                border: 'none',
                borderRadius: '6px',
                color: '#1a1a1a',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                minWidth: '80px'
              }}
            >
              Apply
            </button>
          </div>

          <div style={{
            color: '#666',
            fontSize: '11px',
            textAlign: 'center',
            marginTop: '12px'
          }}>
            Tap or drag to toggle segments
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};

return { SegmentPickerOverlay };
