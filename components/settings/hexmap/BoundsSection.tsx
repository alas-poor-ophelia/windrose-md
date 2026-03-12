/**
 * BoundsSection.tsx
 *
 * Map bounds configuration section for hex maps.
 * Handles column/row limits for rectangular or radius for radial bounds.
 */

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { useMapSettings } = await requireModuleByName("MapSettingsContext.tsx");
const { SettingItem } = await requireModuleByName("SettingItem.tsx");
const { NativeToggle } = await requireModuleByName("NativeControls.tsx");

/** Hex bounds configuration */
interface HexBounds {
  maxCol: number;
  maxRow: number;
  maxRing?: number;
}

type BoundsShape = 'rectangular' | 'radial';

/** Map settings context shape for this component */
interface BoundsSectionContext {
  hexBounds: HexBounds;
  boundsShape: BoundsShape;
  boundsLocked: boolean;
  backgroundImagePath: string | null;
  handleHexBoundsChange: (field: 'maxCol' | 'maxRow', value: string) => void;
  handleBoundsShapeChange: (shape: BoundsShape) => void;
  handleRadiusChange: (value: string) => void;
  handleBoundsLockToggle: () => void;
}

/**
 * Map bounds configuration section
 */
function BoundsSection(): React.ReactElement {
  const {
    hexBounds,
    boundsShape,
    boundsLocked,
    backgroundImagePath,
    handleHexBoundsChange,
    handleBoundsShapeChange,
    handleRadiusChange,
    handleBoundsLockToggle
  } = useMapSettings() as BoundsSectionContext;

  const getPlayableAreaLabel = (): string => {
    if (boundsShape === 'radial') {
      const maxRing = hexBounds.maxRing ?? 5;
      const totalHexes = 1 + 3 * maxRing * (maxRing + 1);
      return `Radius ${maxRing} (${totalHexes} hexes)`;
    }
    const maxColLetter = String.fromCharCode(65 + Math.min(hexBounds.maxCol - 1, 25));
    const overflow = hexBounds.maxCol > 26 ? '+' : '';
    return `A1 to ${maxColLetter}${overflow}${hexBounds.maxRow}`;
  };

  const isDisabled = boundsLocked && !!backgroundImagePath;

  const inputStyle = {
    width: '60px',
    padding: '4px 8px',
    borderRadius: '4px',
    border: '1px solid var(--background-modifier-border)',
    background: isDisabled ? 'var(--background-secondary)' : 'var(--background-primary)',
    color: isDisabled ? 'var(--text-muted)' : 'var(--text-normal)',
    fontSize: '13px'
  };

  return (
    <div>
      <SettingItem
        name="Bounds Shape"
        description="Rectangular grid or hexagonal ring boundary"
      >
        <select
          value={boundsShape}
          onChange={(e: Event) => handleBoundsShapeChange((e.target as HTMLSelectElement).value as BoundsShape)}
          disabled={isDisabled}
          style={{
            padding: '4px 8px',
            borderRadius: '4px',
            border: '1px solid var(--background-modifier-border)',
            background: isDisabled ? 'var(--background-secondary)' : 'var(--background-primary)',
            color: isDisabled ? 'var(--text-muted)' : 'var(--text-normal)',
            fontSize: '13px'
          }}
        >
          <option value="rectangular">Rectangular</option>
          <option value="radial">Radial</option>
        </select>
      </SettingItem>

      <SettingItem
        name={boundsShape === 'radial' ? 'Radius' : 'Map Bounds'}
        description={`Playable area: ${getPlayableAreaLabel()}${isDisabled ? ' (controlled by background image)' : ''}`}
      >
        {boundsShape === 'radial' ? (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', opacity: isDisabled ? 0.6 : 1 }}>
            <input
              type="number"
              min="1"
              max="100"
              value={hexBounds.maxRing ?? 5}
              onChange={(e: Event) => handleRadiusChange((e.target as HTMLInputElement).value)}
              disabled={isDisabled}
              title="Number of hex rings from center"
              style={inputStyle}
            />
            <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>rings</span>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', opacity: isDisabled ? 0.6 : 1 }}>
            <input
              type="number"
              min="1"
              max="1000"
              value={hexBounds.maxCol}
              onChange={(e: Event) => handleHexBoundsChange('maxCol', (e.target as HTMLInputElement).value)}
              disabled={isDisabled}
              style={inputStyle}
            />
            <span style={{ color: 'var(--text-muted)' }}>&times;</span>
            <input
              type="number"
              min="1"
              max="1000"
              value={hexBounds.maxRow}
              onChange={(e: Event) => handleHexBoundsChange('maxRow', (e.target as HTMLInputElement).value)}
              disabled={isDisabled}
              style={inputStyle}
            />
          </div>
        )}
      </SettingItem>

      {backgroundImagePath && (
        <SettingItem
          name="Lock bounds to image"
          description="Automatically set bounds from image dimensions"
        >
          <NativeToggle
            value={boundsLocked}
            onChange={handleBoundsLockToggle}
          />
        </SettingItem>
      )}
    </div>
  );
}

return { BoundsSection };
