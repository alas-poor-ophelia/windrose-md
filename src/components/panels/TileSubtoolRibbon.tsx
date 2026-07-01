/**
 * TileSubtoolRibbon.tsx
 *
 * The drawer's tile-placement subtool ribbon. Shows the selected tile's derived
 * render-form as a badge and lights only the placement subtools that form
 * supports (★ = default armed); unsupported subtools are dimmed/disabled.
 *
 * Subtool selection is currently display/arming state — the line/autotile/scatter
 * placement renderers are deferred, so a chosen subtool does not yet change
 * placement behavior (the gating + badge are the shipped surface).
 */

import type { VNode } from 'preact';
import type { TileForm } from '#types/tiles/tile.types';
import type { TileSubtoolId } from '../../assets/tileForm';

import { SUBTOOL_META, formDef, formSupportsSubtool } from '../../assets/tileForm';
import { Icon } from '../shared/Icon';

const ALL_SUBTOOLS: TileSubtoolId[] = ['stamp', 'fill', 'line', 'autotile', 'scatter'];

interface TileSubtoolRibbonProps {
  /** Selected tile's derived form, or null when nothing is selected. */
  form: TileForm | null;
  activeSubtool: TileSubtoolId | null;
  onSubtoolChange: (id: TileSubtoolId) => void;
}

const TileSubtoolRibbon = ({ form, activeSubtool, onSubtoolChange }: TileSubtoolRibbonProps): VNode | null => {
  if (form == null) return null;

  const def = formDef(form);

  return (
    <div className="windrose-fd-subrib-tools">
      {ALL_SUBTOOLS.map(id => {
        const supported = formSupportsSubtool(form, id);
        const meta = SUBTOOL_META[id];
        const isDefault = def.defaultSubtool === id;
        return (
          <button
            key={id}
            className={`windrose-fd-subtool interactive-child ${activeSubtool === id ? 'on' : ''} ${supported ? '' : 'dim'}`}
            disabled={!supported}
            title={isDefault ? `${meta.title} (default)` : meta.title}
            onClick={() => { if (supported) onSubtoolChange(id); }}
          >
            <Icon icon={meta.icon} size={15} />
            {isDefault && <span className="windrose-fd-subtool-star">★</span>}
          </button>
        );
      })}
    </div>
  );
};

export { TileSubtoolRibbon };
