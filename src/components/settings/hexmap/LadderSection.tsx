/**
 * LadderSection.tsx
 *
 * Detail-level settings for a hex map (internally the lattice ladder, design
 * 06 section 10). Shown while the capability flag is on, or whenever the map
 * already has detail levels (showsDetailLevelSettings). An explicit "Enable
 * detail levels" toggle is the opt-in, behind a version-compatibility
 * confirmation: a classic hex map never gains a `lod` block from a nudged
 * number. The parameters (m / minCellPx / maxLevel) show only while the
 * toggle is on; the save path turns toggle + edits into a LadderPatch
 * (ladderSettingsPatch: set / remove / keep, distanceOverrides kept).
 *
 * - Toggle disabled on a map with depth content (it cannot be switched off)
 *   or with classic sub-hex maps (design s9), with the reason in its description.
 * - "Opens at L<n>" readout, recomputed from the pending edits.
 * - m is read-only once the map has depth content (rung >= 1 cells or homed
 *   elements): changing it would re-key every authored rung.
 * - maxLevel never drops below the deepest authored rung (the quarantine rule
 *   in isDepthQuarantined), so a save can never quarantine the map.
 */

import type { VNode } from 'preact';
import { useState } from 'preact/hooks';

import { useModalShell, useHexGrid } from '../../../context/MapSettingsContext';
import { getApp } from '../../../core/settingsAccessor';
import { confirmEnableDetailLevels } from '../../modals/confirmEnableDetailLevels';
import { SettingItem } from '../SettingItem';
import { NativeToggle, NativeDropdown } from '../NativeControls';
import { DEFAULTS } from '../../../core/dmtConstants';
import { deepestAuthoredRung, hasDepthContent, hasSubHexChildren, ladderOpensAt } from '../../../core/lodFlags';
import { LADDER_DEFAULTS, LADDER_M_ALLOWLIST, MAX_LADDER_LEVEL } from '../../../geometry/core/lattice';

const MIN_CELL_PX_FLOOR = 8;
/** Shared with the quarantine rule and createGeometryLadder (lattice.ts). */
const MAX_LEVEL_CEILING = MAX_LADDER_LEVEL;

function LadderSection(): VNode | null {
  const { mapData } = useModalShell();
  const { lod, setLadderConfig, ladderEnabled, setLadderEnabled } = useHexGrid();

  // Why the last typed value changed on commit (the field is rewritten to the held value).
  const [clampHint, setClampHint] = useState<string | null>(null);
  // Bumped when the enable confirmation is cancelled: remounts the native
  // toggle, which flipped itself on click, back to the held value.
  const [toggleKey, setToggleKey] = useState(0);

  if (mapData === null || mapData.mapType !== 'hex') return null;

  const sectionDisabled = hasSubHexChildren(mapData);
  const depth = hasDepthContent(mapData);
  const toggleDisabled = sectionDisabled || depth;
  const mLocked = sectionDisabled || depth;
  const deepest = deepestAuthoredRung(mapData);
  const minMaxLevel = Math.min(deepest, MAX_LEVEL_CEILING);

  const effective = lod ?? LADDER_DEFAULTS;
  const openZoom = mapData.viewState?.zoom ?? DEFAULTS.initialZoom;
  const opensAt = ladderOpensAt(mapData.hexSize ?? DEFAULTS.hexSize, effective, openZoom);

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
    setClampHint(next !== n ? `Minimum cell size cannot go below ${MIN_CELL_PX_FLOOR} pixels, so ${n} was raised to ${next}.` : null);
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
    if (next === n) setClampHint(null);
    else if (n < minMaxLevel) setClampHint(`Deepest level cannot go below ${minMaxLevel}, which holds content. Remove that content to lower it.`);
    else setClampHint(`Deepest level cannot go above ${MAX_LEVEL_CEILING}.`);
    setLadderConfig({ maxLevel: next });
  };

  // Turning detail levels ON for a map that does not have them yet asks first:
  // older Windrose versions drop `lod` on save. Cancel leaves the map as it is.
  const handleToggle = (next: boolean): void => {
    if (!next || mapData.lod != null) {
      setLadderEnabled(next);
      return;
    }
    void confirmEnableDetailLevels(getApp()).then((confirmed) => {
      if (confirmed) setLadderEnabled(true);
      else setToggleKey(k => k + 1);
    });
  };

  const toggleReason = sectionDisabled
    ? ' (unavailable while this map has sub-maps)'
    : depth ? ' (stays on while this map has content above level 0; remove that content to turn it off)' : '';
  const opensAtText = ladderEnabled ? `. Opens at level ${opensAt}` : '';

  return (
    <div style={{ opacity: sectionDisabled ? 0.6 : 1 }}>
      <SettingItem
        name="Enable detail levels"
        description={`Lets this map add finer hexes as you zoom in${opensAtText}${toggleReason}`}
      >
        <NativeToggle
          key={toggleKey}
          value={ladderEnabled}
          onChange={handleToggle}
          disabled={toggleDisabled}
        />
      </SettingItem>

      {ladderEnabled && (
        <>
          <SettingItem
            name="Child hexes per parent edge"
            description={`How many child hexes each hex splits into per edge on each deeper level${mLocked && !sectionDisabled ? '. This cannot change once the map has content above level 0' : ''}`}
          >
            <NativeDropdown
              value={String(effective.m)}
              options={LADDER_M_ALLOWLIST.map((m: number) => ({ value: String(m), label: String(m) }))}
              onChange={(v: string) => setLadderConfig({ m: Number(v) })}
              disabled={mLocked}
            />
          </SettingItem>

          <SettingItem
            name="Minimum cell size"
            description={`On-screen width in pixels at which the map steps down a level (at least ${MIN_CELL_PX_FLOOR})`}
          >
            <input
              type="number"
              className="windrose-ladder-number"
              min={String(MIN_CELL_PX_FLOOR)}
              step="1"
              value={lod !== null ? String(lod.minCellPx) : ''}
              placeholder={String(LADDER_DEFAULTS.minCellPx)}
              onChange={(e: Event) => handleMinCellPx(e.target as HTMLInputElement)}
              disabled={sectionDisabled}
            />
          </SettingItem>

          <SettingItem
            name="Deepest level"
            description={`Deepest level that can be painted${deepest > 0 ? ` (at least ${deepest}, which holds content)` : ''}`}
          >
            <input
              type="number"
              className="windrose-ladder-number"
              min={String(minMaxLevel)}
              max={String(MAX_LEVEL_CEILING)}
              step="1"
              value={lod !== null ? String(lod.maxLevel) : ''}
              placeholder={String(LADDER_DEFAULTS.maxLevel)}
              onChange={(e: Event) => handleMaxLevel(e.target as HTMLInputElement)}
              disabled={sectionDisabled}
            />
          </SettingItem>
          {clampHint !== null && <div className="windrose-ladder-hint" role="status">{clampHint}</div>}
          {sectionDisabled && (
            <div className="windrose-ladder-hint">These settings are locked while this map has sub-maps.</div>
          )}
        </>
      )}
    </div>
  );
}

export { LadderSection };
