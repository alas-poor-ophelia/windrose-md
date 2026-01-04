/**
 * SizingModeSection.tsx
 *
 * Grid sizing configuration for hex maps with background images.
 * Provides Quick Setup (density presets) and Advanced (measurement) modes.
 */

import type {
  HexOrientation,
  ImageDimensions,
  GridCalculation,
  GridDensityPreset,
} from '#types/settings/settings.types';
import type {
  GridDensity,
  SizingMode,
  MeasurementMethod,
  HexBounds,
} from '#types/core/map.types';

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { useMapSettings } = await requireModuleByName("MapSettingsContext.tsx");
const { CollapsibleSection } = await requireModuleByName("CollapsibleSection.tsx");

/** Fine tune range */
interface FineTuneRange {
  min: number;
  max: number;
}

/** Context for density mode */
interface DensityModeContext {
  gridDensity: GridDensity;
  customColumns: number;
  hexBounds: HexBounds;
  imageDimensions: ImageDimensions | null;
  orientation: HexOrientation;
  handleDensityChange: (density: GridDensity) => void;
  handleCustomColumnsChange: (value: string) => void;
  GRID_DENSITY_PRESETS: Record<string, GridDensityPreset>;
  calculateGridFromColumns: (width: number, height: number, columns: number, orientation: HexOrientation) => GridCalculation;
  hexSizeToMeasurement: (hexSize: number, method: MeasurementMethod, orientation: HexOrientation) => number;
  MEASUREMENT_EDGE: MeasurementMethod;
}

/** Context for measurement mode */
interface MeasurementModeContext {
  measurementMethod: MeasurementMethod;
  measurementSize: number;
  hexBounds: HexBounds;
  imageDimensions: ImageDimensions | null;
  orientation: HexOrientation;
  fineTuneEnabled: boolean;
  fineTuneOffset: number;
  handleMeasurementMethodChange: (method: MeasurementMethod) => void;
  handleMeasurementSizeChange: (value: string) => void;
  handleFineTuneChange: (value: number) => void;
  handleFineTuneReset: () => void;
  MEASUREMENT_EDGE: MeasurementMethod;
  MEASUREMENT_CORNER: MeasurementMethod;
  measurementToHexSize: (size: number, method: MeasurementMethod, orientation: HexOrientation) => number;
  getFineTuneRange: (baseSize: number) => FineTuneRange;
}

/** Context for sizing mode section */
interface SizingModeSectionContext {
  backgroundImagePath: string | null;
  imageDimensions: ImageDimensions | null;
  sizingMode: SizingMode;
  imageOpacity: number;
  setImageOpacity: (opacity: number) => void;
  imageOffsetX: number;
  setImageOffsetX: (offset: number) => void;
  imageOffsetY: number;
  setImageOffsetY: (offset: number) => void;
  handleSizingModeChange: (mode: SizingMode) => void;
  onOpenAlignmentMode?: (offsetX: number, offsetY: number) => void;
}

/**
 * Quick Setup tab content - density presets
 */
function DensityModeContent(): React.ReactElement {
  const {
    gridDensity,
    customColumns,
    hexBounds,
    imageDimensions,
    orientation,
    handleDensityChange,
    handleCustomColumnsChange,
    GRID_DENSITY_PRESETS,
    calculateGridFromColumns,
    hexSizeToMeasurement,
    MEASUREMENT_EDGE
  } = useMapSettings() as DensityModeContext;

  return (
    <div>
      <label class="dmt-form-label" style={{ marginBottom: '8px' }}>Grid Density</label>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <label class="dmt-radio-label" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer' }}>
          <input
            type="radio"
            name="gridDensity"
            value="sparse"
            checked={gridDensity === 'sparse'}
            onChange={() => handleDensityChange('sparse')}
            style={{ marginTop: '2px' }}
          />
          <div>
            <span style={{ fontWeight: 500 }}>{GRID_DENSITY_PRESETS.sparse.label}</span>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
              {GRID_DENSITY_PRESETS.sparse.description}
            </p>
          </div>
        </label>

        <label class="dmt-radio-label" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer' }}>
          <input
            type="radio"
            name="gridDensity"
            value="medium"
            checked={gridDensity === 'medium'}
            onChange={() => handleDensityChange('medium')}
            style={{ marginTop: '2px' }}
          />
          <div>
            <span style={{ fontWeight: 500 }}>{GRID_DENSITY_PRESETS.medium.label}</span>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
              {GRID_DENSITY_PRESETS.medium.description}
            </p>
          </div>
        </label>

        <label class="dmt-radio-label" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer' }}>
          <input
            type="radio"
            name="gridDensity"
            value="dense"
            checked={gridDensity === 'dense'}
            onChange={() => handleDensityChange('dense')}
            style={{ marginTop: '2px' }}
          />
          <div>
            <span style={{ fontWeight: 500 }}>{GRID_DENSITY_PRESETS.dense.label}</span>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
              {GRID_DENSITY_PRESETS.dense.description}
            </p>
          </div>
        </label>

        <label class="dmt-radio-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <input
            type="radio"
            name="gridDensity"
            value="custom"
            checked={gridDensity === 'custom'}
            onChange={() => handleDensityChange('custom')}
          />
          <span style={{ fontWeight: 500 }}>Custom</span>
          <input
            type="number"
            min="1"
            max="200"
            value={customColumns}
            onChange={(e: Event) => handleCustomColumnsChange((e.target as HTMLInputElement).value)}
            disabled={gridDensity !== 'custom'}
            style={{
              width: '60px',
              padding: '4px 8px',
              borderRadius: '4px',
              border: '1px solid var(--background-modifier-border)',
              background: 'var(--background-primary)',
              color: 'var(--text-normal)',
              fontSize: '13px',
              opacity: gridDensity !== 'custom' ? 0.5 : 1
            }}
          />
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>columns</span>
        </label>
      </div>

      {/* Show calculated result */}
      {imageDimensions && (
        <div style={{ marginTop: '12px', padding: '8px', background: 'var(--background-secondary)', borderRadius: '4px' }}>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Result: {hexBounds.maxCol} columns × {hexBounds.maxRow} rows
            {(() => {
              const columns = gridDensity === 'custom' ? customColumns : GRID_DENSITY_PRESETS[gridDensity]?.columns || 24;
              const calc = calculateGridFromColumns(imageDimensions.width, imageDimensions.height, columns, orientation);
              return ` (~${Math.round(hexSizeToMeasurement(calc.hexSize, MEASUREMENT_EDGE, orientation))}px hex width)`;
            })()}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Advanced tab content - measurement mode
 */
function MeasurementModeContent(): React.ReactElement {
  const {
    measurementMethod,
    measurementSize,
    hexBounds,
    fineTuneOffset,
    handleMeasurementMethodChange,
    handleMeasurementSizeChange,
    handleFineTuneChange,
    handleFineTuneReset,
    MEASUREMENT_EDGE,
    MEASUREMENT_CORNER,
    measurementToHexSize,
    getFineTuneRange,
    orientation
  } = useMapSettings() as MeasurementModeContext;

  const baseHexSize = measurementToHexSize(measurementSize, measurementMethod, orientation);
  const fineTuneEnabled = fineTuneOffset !== 0;
  const effectiveHexSize = fineTuneEnabled ? baseHexSize + fineTuneOffset : baseHexSize;
  const fineTuneRange = getFineTuneRange(baseHexSize);

  return (
    <div>
      <label class="dmt-form-label" style={{ marginBottom: '8px' }}>Hex Measurement</label>

      {/* Measurement method selector */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
          <input
            type="radio"
            name="measurementMethod"
            value={MEASUREMENT_EDGE}
            checked={measurementMethod === MEASUREMENT_EDGE}
            onChange={() => handleMeasurementMethodChange(MEASUREMENT_EDGE)}
          />
          <span style={{ fontSize: '13px' }}>Edge-to-edge</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
          <input
            type="radio"
            name="measurementMethod"
            value={MEASUREMENT_CORNER}
            checked={measurementMethod === MEASUREMENT_CORNER}
            onChange={() => handleMeasurementMethodChange(MEASUREMENT_CORNER)}
          />
          <span style={{ fontSize: '13px' }}>Corner-to-corner</span>
        </label>
      </div>

      {/* Size input */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px' }}>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Size:</span>
        <input
          type="number"
          min="10"
          max="500"
          step="1"
          value={measurementSize}
          onChange={(e: Event) => handleMeasurementSizeChange((e.target as HTMLInputElement).value)}
          style={{
            width: '80px',
            padding: '4px 8px',
            borderRadius: '4px',
            border: '1px solid var(--background-modifier-border)',
            background: 'var(--background-primary)',
            color: 'var(--text-normal)',
            fontSize: '13px'
          }}
        />
        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>pixels</span>
      </div>

      {/* Calculated result */}
      <div style={{ padding: '8px', background: 'var(--background-secondary)', borderRadius: '4px', marginBottom: '12px' }}>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          Calculated Grid: {hexBounds.maxCol} columns × {hexBounds.maxRow} rows
          {` (hexSize: ${effectiveHexSize.toFixed(1)}px)`}
        </p>
      </div>

      {/* Fine-tune section */}
      <details style={{ marginTop: '12px' }}>
        <summary style={{
          cursor: 'pointer',
          fontWeight: '500',
          fontSize: '13px',
          color: 'var(--text-normal)',
          padding: '4px 0',
          userSelect: 'none'
        }}>
          ⚙ Fine-Tune Alignment
        </summary>

        <div style={{ marginTop: '8px', padding: '12px', background: 'var(--background-secondary)', borderRadius: '4px' }}>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '12px' }}>
            Adjust if hexes don't align perfectly with your image grid. Small changes can make a big difference.
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Hex size:</span>
            <input
              type="number"
              min={fineTuneRange.min}
              max={fineTuneRange.max}
              step="0.5"
              value={effectiveHexSize.toFixed(1)}
              onChange={(e: Event) => handleFineTuneChange(parseFloat((e.target as HTMLInputElement).value))}
              style={{
                width: '80px',
                padding: '4px 8px',
                borderRadius: '4px',
                border: '1px solid var(--background-modifier-border)',
                background: 'var(--background-primary)',
                color: 'var(--text-normal)',
                fontSize: '13px'
              }}
            />
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>px</span>

            {fineTuneOffset !== 0 && (
              <>
                <span style={{ fontSize: '12px', color: 'var(--text-accent)' }}>
                  ({fineTuneOffset > 0 ? '+' : ''}{fineTuneOffset.toFixed(1)})
                </span>
                <button
                  onClick={handleFineTuneReset}
                  style={{
                    padding: '4px 8px',
                    fontSize: '11px',
                    background: 'var(--interactive-normal)',
                    border: 'none',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    color: 'var(--text-normal)'
                  }}
                >
                  Reset
                </button>
              </>
            )}
          </div>
        </div>
      </details>
    </div>
  );
}

/**
 * Sizing mode section with tabbed interface
 */
function SizingModeSection(): React.ReactElement | null {
  const {
    backgroundImagePath,
    imageDimensions,
    sizingMode,
    imageOpacity,
    setImageOpacity,
    imageOffsetX,
    setImageOffsetX,
    imageOffsetY,
    setImageOffsetY,
    handleSizingModeChange,
    onOpenAlignmentMode
  } = useMapSettings() as SizingModeSectionContext;

  // Only show when image is selected and dimensions are loaded
  if (!backgroundImagePath || !imageDimensions) {
    return null;
  }

  return (
    <div style={{ marginTop: '20px' }}>
      {/* Tab buttons */}
      <div style={{
        display: 'flex',
        gap: '4px',
        borderBottom: '1px solid var(--background-modifier-border)',
        marginBottom: '16px'
      }}>
        <button
          onClick={() => handleSizingModeChange('density')}
          style={{
            flex: 1,
            padding: '8px 16px',
            background: sizingMode === 'density' ? 'var(--background-modifier-hover)' : 'transparent',
            border: 'none',
            borderBottom: sizingMode === 'density' ? '2px solid var(--interactive-accent)' : '2px solid transparent',
            color: sizingMode === 'density' ? 'var(--text-normal)' : 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: sizingMode === 'density' ? '600' : '400',
            transition: 'all 0.2s'
          }}
        >
          Quick Setup
        </button>
        <button
          onClick={() => handleSizingModeChange('measurement')}
          style={{
            flex: 1,
            padding: '8px 16px',
            background: sizingMode === 'measurement' ? 'var(--background-modifier-hover)' : 'transparent',
            border: 'none',
            borderBottom: sizingMode === 'measurement' ? '2px solid var(--interactive-accent)' : '2px solid transparent',
            color: sizingMode === 'measurement' ? 'var(--text-normal)' : 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: sizingMode === 'measurement' ? '600' : '400',
            transition: 'all 0.2s'
          }}
        >
          Advanced
        </button>
      </div>

      {/* Tab content */}
      {sizingMode === 'density' && <DensityModeContent />}
      {sizingMode === 'measurement' && <MeasurementModeContent />}

      {/* Opacity slider */}
      <div style={{ marginTop: '16px' }}>
        <label class="dmt-form-label" style={{ marginBottom: '8px', display: 'block' }}>
          Image Opacity: {Math.round(imageOpacity * 100)}%
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <input
            type="range"
            min="0"
            max="100"
            value={Math.round(imageOpacity * 100)}
            onChange={(e: Event) => setImageOpacity(parseInt((e.target as HTMLInputElement).value, 10) / 100)}
            style={{
              flex: 1,
              height: '6px',
              cursor: 'pointer',
              accentColor: 'var(--interactive-accent)'
            }}
          />
          <span style={{
            fontSize: '12px',
            color: 'var(--text-muted)',
            minWidth: '35px',
            textAlign: 'right'
          }}>
            {Math.round(imageOpacity * 100)}%
          </span>
        </div>
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
          Lower opacity makes the grid more visible over the image
        </p>
      </div>

      {/* Image offset controls - collapsible, starts collapsed */}
      <CollapsibleSection
        title="Image Offset"
        defaultOpen={false}
        subtitle={`X: ${imageOffsetX}, Y: ${imageOffsetY}`}
      >
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '8px' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>X:</span>
            <input
              type="number"
              value={imageOffsetX}
              onChange={(e: Event) => setImageOffsetX(parseInt((e.target as HTMLInputElement).value, 10) || 0)}
              class="dmt-number-input"
              style={{
                width: '80px',
                padding: '4px 8px',
                borderRadius: '4px',
                border: '1px solid var(--background-modifier-border)',
                background: 'var(--background-primary)',
                color: 'var(--text-normal)',
                fontSize: '13px'
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Y:</span>
            <input
              type="number"
              value={imageOffsetY}
              onChange={(e: Event) => setImageOffsetY(parseInt((e.target as HTMLInputElement).value, 10) || 0)}
              class="dmt-number-input"
              style={{
                width: '80px',
                padding: '4px 8px',
                borderRadius: '4px',
                border: '1px solid var(--background-modifier-border)',
                background: 'var(--background-primary)',
                color: 'var(--text-normal)',
                fontSize: '13px'
              }}
            />
          </div>
        </div>
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>
          Fine-tune image position relative to grid center
        </p>
        <button
          onClick={() => onOpenAlignmentMode?.(imageOffsetX, imageOffsetY)}
          style={{
            padding: '6px 12px',
            fontSize: '12px',
            fontWeight: '500',
            background: 'var(--interactive-normal)',
            color: 'var(--text-normal)',
            border: '1px solid var(--background-modifier-border)',
            borderRadius: '4px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
          onMouseEnter={(e: Event) => (e.target as HTMLElement).style.background = 'var(--interactive-hover)'}
          onMouseLeave={(e: Event) => (e.target as HTMLElement).style.background = 'var(--interactive-normal)'}
        >
          <span>📍</span>
          <span>Adjust Position Interactively</span>
        </button>
      </CollapsibleSection>
    </div>
  );
}

return { SizingModeSection, DensityModeContent, MeasurementModeContent };
