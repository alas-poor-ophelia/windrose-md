// StageToolbars.tsx - Toolbars at the top of the map stage: the docked tool
// palette (vertical with a pop-out button in full-pane), and in block mode the
// visibility toolbar and the fog-of-war toolbar it opens.

import type { VNode, ComponentProps } from 'preact';
import { ToolPalette } from '../toolbars/ToolPalette';
import { VisibilityToolbar } from '../toolbars/VisibilityToolbar';
import { FogOfWarToolbar } from '../toolbars/FogOfWarToolbar';
import { Icon } from '../shared/Icon';
import { tooltipRef } from '../shared/obsidianTooltip';
import type { ToolPaletteBag } from './panelBags';

interface StageToolbarsProps {
  fullPane: boolean;
  toolPalette: ToolPaletteBag;
  /** False while the palette is floated (FloatingPanelsHost renders it). */
  paletteDocked: boolean;
  onPopOutPalette: (pos: { x: number; y: number }) => void;
  /** Block mode only. */
  visibility: ComponentProps<typeof VisibilityToolbar> | null;
  /** Block mode with the fog feature on only. */
  fogToolbar: ComponentProps<typeof FogOfWarToolbar> | null;
}

const StageToolbars = ({ fullPane, toolPalette, paletteDocked, onPopOutPalette, visibility, fogToolbar }: StageToolbarsProps): VNode => (
  <>
    <div className="windrose-toolbar-anchor">
      {paletteDocked && (
        <ToolPalette
          {...toolPalette}
          vertical={fullPane}
          dockButton={fullPane ? (
            <button
              className="windrose-tool-btn windrose-tool-palette-dock-btn interactive-child"
              onClick={(e) => {
                const rect = (e.currentTarget as HTMLElement).closest('.windrose-tool-palette')?.getBoundingClientRect();
                if (rect != null) onPopOutPalette({ x: rect.left, y: rect.top });
              }}
              ref={tooltipRef('Pop out tools')}
            >
              <Icon icon="lucide-maximize-2" />
            </button>
          ) : undefined}
        />
      )}

      {visibility != null && <VisibilityToolbar {...visibility} />}
    </div>

    {fogToolbar != null && <FogOfWarToolbar {...fogToolbar} />}
  </>
);

export { StageToolbars };
