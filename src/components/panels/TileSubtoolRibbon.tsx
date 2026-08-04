/**
 * TileSubtoolRibbon.tsx
 *
 * The drawer's tile-placement subtool ribbon. Grades each placement subtool
 * for the selected tile's derived form via the lenient form×subtool matrix:
 * recommended subtools are bright (★ = default armed), 'available' ones are
 * dimmed but still clickable (manual override), and only truly impossible
 * combinations are disabled. 'autotile' is shown only for autotile forms.
 */

import type { VNode } from 'preact';
import type { TileForm } from '#types/tiles/tile.types';
import type { TileSubtoolId } from '../../assets/tileForm';

import { SUBTOOL_META, THRESHOLD_ENTRY, formDef, ribbonSubtoolsForForm, subtoolGate } from '../../assets/tileForm';
import { Icon } from '../shared/Icon';
import { tooltipRef } from '../shared/obsidianTooltip';

interface TileSubtoolRibbonProps {
  /** Selected tile's derived form, or null when nothing is selected. */
  form: TileForm | null;
  activeSubtool: TileSubtoolId | null;
  onSubtoolChange: (id: TileSubtoolId) => void;
  /**
   * Arms the built-in "Threshold" entry (§5.3) — cuts a bare gap regardless of
   * the selected tile's art. Only rendered for the 'opening' form. When present,
   * clicking it toggles WallLayer's bare-threshold placement mode.
   */
  onThreshold?: () => void;
  /** True while the built-in Threshold entry is the armed placement mode. */
  thresholdActive?: boolean;
}

const TileSubtoolRibbon = ({ form, activeSubtool, onSubtoolChange, onThreshold, thresholdActive }: TileSubtoolRibbonProps): VNode | null => {
  if (form == null) return null;

  const def = formDef(form);

  return (
    <div className="windrose-fd-subrib-tools">
      {ribbonSubtoolsForForm(form).map(id => {
        const gate = subtoolGate(form, id);
        const meta = SUBTOOL_META[id];
        const isDefault = def.defaultSubtool === id;
        const title = isDefault
          ? `${meta.title} (default)`
          : gate === 'available'
            ? `${meta.title} — not typical for this tile`
            : meta.title;
        return (
          <button
            key={id}
            className={`windrose-fd-subtool interactive-child ${activeSubtool === id ? 'on' : ''} ${gate === 'available' ? 'dim' : ''}`}
            disabled={gate === 'disabled'}
            ref={tooltipRef(title)}
            onClick={() => { if (gate !== 'disabled') onSubtoolChange(id); }}
          >
            <Icon icon={meta.icon} size={15} />
            {isDefault && <span className="windrose-fd-subtool-star">★</span>}
          </button>
        );
      })}
      {form === 'opening' && (
        <button
          key={THRESHOLD_ENTRY.id}
          className={`windrose-fd-subtool interactive-child ${thresholdActive === true ? 'on' : ''}`}
          ref={tooltipRef(THRESHOLD_ENTRY.title)}
          onClick={() => onThreshold?.()}
        >
          <Icon icon={THRESHOLD_ENTRY.icon} size={15} />
        </button>
      )}
    </div>
  );
};

export { TileSubtoolRibbon };
