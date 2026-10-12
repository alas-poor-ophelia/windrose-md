/**
 * LadderSection.tsx
 *
 * Lattice ladder settings for a hex map (design 06, section 10). Shown only
 * while the ladder capability flag is on. Edits m / minCellPx / maxLevel into
 * the settings reducer; the save path writes them as the top-level
 * `mapData.lod`, merged over whatever is stored (distanceOverrides kept).
 *
 * - "Opens at L<n>" readout, recomputed from the pending edits.
 * - m is read-only once the map has depth content (rung >= 1 cells or homed
 *   elements): changing it would re-key every authored rung.
 * - maxLevel never drops below the deepest authored rung (the quarantine rule
 *   in isDepthQuarantined), so a save can never quarantine the map.
 * - Whole section disabled on a map with classic sub-hex maps (design s9).
 */

import type { VNode } from 'preact';

import { useModalShell, useHexGrid } from '../../../context/MapSettingsContext';
import { SettingItem } from '../SettingItem';
import { DEFAULTS } from '../../../core/dmtConstants';
import { deepestAuthoredRung, hasDepthContent, hasSubHexChildren, ladderOpensAt } from '../../../core/lodFlags';
import { LADDER_DEFAULTS, LADDER_M_ALLOWLIST } from '../../../geometry/core/lattice';

const MIN_CELL_PX_FLOOR = 8;
const MAX_LEVEL_CEILING = 6;

function LadderSection(): VNode | null {
  const { mapData } = useModalShell();
  const { lod, setLadderConfig } = useHexGrid();

  if (mapData === null || mapData.mapType !== 'hex') return null;

  const sectionDisabled = hasSubHexChildren(mapData);
  const mLocked = sectionDisabled || hasDepthContent(mapData);
  const deepest = deepestAuthoredRung(mapData);
  const minMaxLevel = Math.min(deepest, MAX_LEVEL_CEILING);

  const effective = lod ?? LADDER_DEFAULTS;
  const openZoom = mapData.viewState?.zoom ?? DEFAULTS.initialZoom;
  const opensAt = ladderOpensAt(mapData.hexSize ?? DEFAULTS.hexSize, effective, openZoom);

  const controlStyle = (disabled: boolean): Record<string, string> => ({
    width: '70px',
    padding: '4px 8px',
    borderRadius: '4px',
    border: '1px solid var(--background-modifier-border)',
    background: disabled ? 'var(--background-secondary)' : 'var(--background-primary)',
    color: disabled ? 'var(--text-muted)' : 'var(--text-normal)',
    fontSize: '13px'
  });

  // Both handlers run on the native change event (bare Preact: onChange is
  // NOT per-keystroke), so typing is free and the clamp applies on commit.
  // The clamped value is written back into the field: an entry under the
  // floor, or a cleared field, must never show a number the map will not hold.
  const handleMinCellPx = (input: HTMLInputElement): void => {
    const n = Math.round(Number(input.value));
    if (input.value.trim() === '' || !Number.isFinite(n)) {
      input.value = String(effective.minCellPx);
      return;
    }
    const next = Math.max(MIN_CELL_PX_FLOOR, n);
    input.value = String(next);
    setLadderConfig({ minCellPx: next });
  };

  const handleMaxLevel = (input: HTMLInputElement): void => {
    const n = Math.round(Number(input.value));
    if (input.value.trim() === '' || !Number.isFinite(n)) {
      input.value = String(effective.maxLevel);
      return;
    }
    const next = Math.min(MAX_LEVEL_CEILING, Math.max(minMaxLevel, n));
    input.value = String(next);
    setLadderConfig({ maxLevel: next });
  };

  const sectionReason = sectionDisabled ? ' (this map has sub-maps)' : '';

  return (
    <div style={{ opacity: sectionDisabled ? 0.6 : 1 }}>
      <SettingItem
        name="Detail ladder"
        description={`Opens at L${opensAt}${sectionReason}`}
      />

      <SettingItem
        name="Subdivision"
        description={`Child hexes per parent edge on each deeper level${mLocked && !sectionDisabled ? ' (fixed once the map has depth content)' : ''}`}
      >
        <select
          value={String(effective.m)}
          onChange={(e: Event) => setLadderConfig({ m: Number((e.target as HTMLSelectElement).value) })}
          disabled={mLocked}
          style={controlStyle(mLocked)}
        >
          {LADDER_M_ALLOWLIST.map((m: number) => (
            <option key={m} value={String(m)}>{m}</option>
          ))}
        </select>
      </SettingItem>

      <SettingItem
        name="Minimum cell size"
        description="On-screen width in pixels at which the map steps down a level"
      >
        <input
          type="number"
          min={String(MIN_CELL_PX_FLOOR)}
          step="1"
          value={lod !== null ? String(lod.minCellPx) : ''}
          placeholder={String(LADDER_DEFAULTS.minCellPx)}
          onChange={(e: Event) => handleMinCellPx(e.target as HTMLInputElement)}
          disabled={sectionDisabled}
          style={controlStyle(sectionDisabled)}
        />
      </SettingItem>

      <SettingItem
        name="Deepest level"
        description={`Deepest level that can be painted${deepest > 0 ? ` (at least ${deepest}, which holds content)` : ''}`}
      >
        <input
          type="number"
          min={String(minMaxLevel)}
          max={String(MAX_LEVEL_CEILING)}
          step="1"
          value={lod !== null ? String(lod.maxLevel) : ''}
          placeholder={String(LADDER_DEFAULTS.maxLevel)}
          onChange={(e: Event) => handleMaxLevel(e.target as HTMLInputElement)}
          disabled={sectionDisabled}
          style={controlStyle(sectionDisabled)}
        />
      </SettingItem>
    </div>
  );
}

export { LadderSection };
