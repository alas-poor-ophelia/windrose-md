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

import { SUBTOOL_META, formDef, ribbonSubtoolsForForm, subtoolGate } from '../../assets/tileForm';
import { Icon } from '../shared/Icon';

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
            title={title}
            onClick={() => { if (gate !== 'disabled') onSubtoolChange(id); }}
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
