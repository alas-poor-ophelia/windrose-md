/**
 * BoundsSection.tsx
 *
 * Map bounds configuration section for hex maps.
 * Handles column/row limits for the playable grid area.
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
}

/** Map settings context shape for this component */
interface BoundsSectionContext {
  hexBounds: HexBounds;
  boundsLocked: boolean;
  backgroundImagePath: string | null;
  handleHexBoundsChange: (field: 'maxCol' | 'maxRow', value: string) => void;
  handleBoundsLockToggle: () => void;
}

/**
 * Map bounds configuration section
 */
function BoundsSection(): React.ReactElement {
  const {
    hexBounds,
    boundsLocked,
    backgroundImagePath,
    handleHexBoundsChange,
    handleBoundsLockToggle
  } = useMapSettings() as BoundsSectionContext;

  const getPlayableAreaLabel = (): string => {
    const maxColLetter = String.fromCharCode(65 + Math.min(hexBounds.maxCol - 1, 25));
    const overflow = hexBounds.maxCol > 26 ? '+' : '';
    return `A1 to ${maxColLetter}${overflow}${hexBounds.maxRow}`;
  };

  const isDisabled = boundsLocked && !!backgroundImagePath;

  return (
    <div>
      <SettingItem
        name="Map Bounds"
        description={`Playable area: ${getPlayableAreaLabel()}${isDisabled ? ' (controlled by background image)' : ''}`}
      >
        <div style={{
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
          opacity: isDisabled ? 0.6 : 1
        }}>
          <input
            type="number"
            min="1"
            max="1000"
            value={hexBounds.maxCol}
            onChange={(e: Event) => handleHexBoundsChange('maxCol', (e.target as HTMLInputElement).value)}
            disabled={isDisabled}
            style={{
              width: '60px',
              padding: '4px 8px',
              borderRadius: '4px',
              border: '1px solid var(--background-modifier-border)',
              background: isDisabled ? 'var(--background-secondary)' : 'var(--background-primary)',
              color: isDisabled ? 'var(--text-muted)' : 'var(--text-normal)',
              fontSize: '13px'
            }}
          />
          <span style={{ color: 'var(--text-muted)' }}>×</span>
          <input
            type="number"
            min="1"
            max="1000"
            value={hexBounds.maxRow}
            onChange={(e: Event) => handleHexBoundsChange('maxRow', (e.target as HTMLInputElement).value)}
            disabled={isDisabled}
            style={{
              width: '60px',
              padding: '4px 8px',
              borderRadius: '4px',
              border: '1px solid var(--background-modifier-border)',
              background: isDisabled ? 'var(--background-secondary)' : 'var(--background-primary)',
              color: isDisabled ? 'var(--text-muted)' : 'var(--text-normal)',
              fontSize: '13px'
            }}
          />
        </div>
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
