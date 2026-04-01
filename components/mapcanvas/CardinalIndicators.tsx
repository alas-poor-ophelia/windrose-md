/**
 * CardinalIndicators.tsx
 *
 * Renders edge-snap direction triangles and freeform drag preview diamonds
 * around a selected object. Pure rendering — no state or callbacks.
 */

/** Cardinal direction indicator positions */
interface CardinalIndicatorPositions {
  north: { x: number; y: number };
  south: { x: number; y: number };
  east: { x: number; y: number };
  west: { x: number; y: number };
}

interface CardinalIndicatorsProps {
  indicatorPositions: CardinalIndicatorPositions | null;
  isObjectSelected: boolean;
  isFreeformPreview: boolean;
  isFreeform: boolean;
}

const INDICATOR_STYLE = {
  position: 'absolute',
  pointerEvents: 'none',
  zIndex: 1000
} as const;

const ACCENT = 'var(--interactive-accent, #4a9eff)';
const DROP_SHADOW = `drop-shadow(0 0 3px ${ACCENT})`;

const CardinalIndicators = ({
  indicatorPositions,
  isObjectSelected,
  isFreeformPreview,
  isFreeform
}: CardinalIndicatorsProps): React.ReactElement | null => {
  if (!indicatorPositions || !isObjectSelected) return null;

  if (isFreeformPreview) {
    const invertToFreeform = !isFreeform;
    return (
      <>
        {(['north', 'south', 'east', 'west'] as const).map(dir => (
          <div
            key={dir}
            className={`dmt-inversion-indicator ${dir}`}
            style={{
              ...INDICATOR_STYLE,
              left: `${indicatorPositions[dir].x + 2}px`,
              top: `${indicatorPositions[dir].y + 2}px`,
              width: '8px',
              height: '8px',
              backgroundColor: ACCENT,
              transform: invertToFreeform ? 'rotate(45deg)' : 'none',
              filter: DROP_SHADOW
            }}
          />
        ))}
      </>
    );
  }

  // Edge-snap mode: directional triangles
  return (
    <>
      <div
        className="dmt-edge-snap-indicator north"
        style={{
          ...INDICATOR_STYLE,
          left: `${indicatorPositions.north.x}px`,
          top: `${indicatorPositions.north.y}px`,
          width: 0, height: 0,
          borderLeft: '6px solid transparent',
          borderRight: '6px solid transparent',
          borderBottom: `8px solid ${ACCENT}`,
          filter: DROP_SHADOW
        }}
      />
      <div
        className="dmt-edge-snap-indicator south"
        style={{
          ...INDICATOR_STYLE,
          left: `${indicatorPositions.south.x}px`,
          top: `${indicatorPositions.south.y}px`,
          width: 0, height: 0,
          borderLeft: '6px solid transparent',
          borderRight: '6px solid transparent',
          borderTop: `8px solid ${ACCENT}`,
          filter: DROP_SHADOW
        }}
      />
      <div
        className="dmt-edge-snap-indicator east"
        style={{
          ...INDICATOR_STYLE,
          left: `${indicatorPositions.east.x}px`,
          top: `${indicatorPositions.east.y}px`,
          width: 0, height: 0,
          borderTop: '6px solid transparent',
          borderBottom: '6px solid transparent',
          borderLeft: `8px solid ${ACCENT}`,
          filter: DROP_SHADOW
        }}
      />
      <div
        className="dmt-edge-snap-indicator west"
        style={{
          ...INDICATOR_STYLE,
          left: `${indicatorPositions.west.x}px`,
          top: `${indicatorPositions.west.y}px`,
          width: 0, height: 0,
          borderTop: '6px solid transparent',
          borderBottom: '6px solid transparent',
          borderRight: `8px solid ${ACCENT}`,
          filter: DROP_SHADOW
        }}
      />
    </>
  );
};

return { CardinalIndicators };
