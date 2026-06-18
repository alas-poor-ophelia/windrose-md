import { ItemView, Notice, type WorkspaceLeaf } from 'obsidian';
import { h, render } from 'preact';
import { AppContext } from '../context/AppContext';
import { DungeonMapTracker } from '../DungeonMapTracker';
import { listMaps } from '../persistence/fileOperations';
import type { MapListEntry } from '../persistence/fileOperations';
import type { MapType } from '#types/core/map.types';

const VIEW_TYPE_WINDROSE_MAP = 'windrose-map-view';

class WindroseMapView extends ItemView {
  private mapId = '';
  private mapName = '';
  private mapType: MapType = 'grid';
  private floatingPanels: Record<string, unknown> = {};

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_WINDROSE_MAP;
  }

  getDisplayText(): string {
    return this.mapName || 'Windrose Map';
  }

  getIcon(): string {
    return 'compass';
  }

  async onOpen(): Promise<void> {
    this.contentEl.addClass('windrose-full-pane');

    this.addAction('copy', 'Copy as map block', () => {
      if (!this.mapId) {
        new Notice('No map selected');
        return;
      }
      const block = [
        '```windrose-map',
        `id: ${this.mapId}`,
        `name: ${this.mapName}`,
        `type: ${this.mapType}`,
        '```'
      ].join('\n');
      void navigator.clipboard.writeText(block);
      new Notice('Map block copied to clipboard');
    });

    if (this.mapId) {
      this.renderMap();
    } else {
      await this.renderPicker();
    }
  }

  async onClose(): Promise<void> {
    render(null, this.contentEl);
  }

  onResize(): void {
    window.dispatchEvent(new Event('resize'));
  }

  getState(): Record<string, unknown> {
    return {
      mapId: this.mapId,
      mapName: this.mapName,
      mapType: this.mapType,
      floatingPanels: this.floatingPanels,
    };
  }

  async setState(state: Record<string, unknown>): Promise<void> {
    if (state?.mapId) this.mapId = state.mapId as string;
    if (state?.mapName) this.mapName = state.mapName as string;
    if (state?.mapType) this.mapType = state.mapType as MapType;
    if (state?.floatingPanels) this.floatingPanels = state.floatingPanels as Record<string, unknown>;

    if (this.mapId) {
      this.renderMap();
    } else {
      await this.renderPicker();
    }
  }

  private selectMap(id: string, name: string, type: MapType): void {
    this.mapId = id;
    this.mapName = name;
    this.mapType = type;
    this.renderMap();
    this.app.workspace.requestSaveLayout();
  }

  private handleMapChange = (id: string, name: string, type: MapType): void => {
    this.selectMap(id, name, type);
  };

  private handleNameChange = (name: string): void => {
    this.mapName = name;
    this.leaf.updateHeader();
    this.titleEl.textContent = this.getDisplayText();
    this.app.workspace.requestSaveLayout();
  };

  private handlePanelStateChange = (state: Record<string, unknown>): void => {
    this.floatingPanels = state;
    this.app.workspace.requestSaveLayout();
  };

  private async renderPicker(): Promise<void> {
    const maps = await listMaps(this.app);
    render(
      h(FullPaneMapPicker, {
        maps,
        onSelect: (entry: MapListEntry) => this.selectMap(entry.id, entry.name, entry.type),
      }),
      this.contentEl
    );
  }

  private renderMap(): void {
    render(
      h(AppContext.Provider, { value: this.app },
        h(DungeonMapTracker, {
          key: this.mapId,
          mapId: this.mapId,
          mapName: this.mapName,
          mapType: this.mapType,
          notePath: '',
          fullPane: true,
          onMapChange: this.handleMapChange,
          onNameChange: this.handleNameChange,
          savedPanelState: this.floatingPanels,
          onPanelStateChange: this.handlePanelStateChange,
        })
      ),
      this.contentEl
    );
    this.leaf.updateHeader();
    this.titleEl.textContent = this.getDisplayText();
  }
}

interface PickerProps {
  maps: MapListEntry[];
  onSelect: (entry: MapListEntry) => void;
}

function FullPaneMapPicker({ maps, onSelect }: PickerProps) {
  if (maps.length === 0) {
    return h('div', { className: 'windrose-fullpane-picker' },
      h('div', { className: 'windrose-fullpane-picker-icon' }, '🧭'),
      h('div', { className: 'windrose-fullpane-picker-title' }, 'No maps found'),
      h('div', { className: 'windrose-fullpane-picker-hint' },
        'Create a map using the ',
        h('code', null, '```windrose-map```'),
        ' code block in any note.'
      )
    );
  }

  return h('div', { className: 'windrose-fullpane-picker' },
    h('div', { className: 'windrose-fullpane-picker-title' }, 'Select a map to open'),
    h('div', { className: 'windrose-fullpane-picker-list' },
      maps.map(entry =>
        h('button', {
          key: entry.id,
          className: 'windrose-fullpane-picker-item',
          onClick: () => onSelect(entry),
        },
          h('span', { className: 'windrose-fullpane-picker-item-name' }, entry.name || entry.id),
          h('span', { className: 'windrose-fullpane-picker-item-type' }, entry.type)
        )
      )
    )
  );
}

export { VIEW_TYPE_WINDROSE_MAP, WindroseMapView };
