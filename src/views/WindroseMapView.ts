import { ItemView, type WorkspaceLeaf } from 'obsidian';
import { h, render } from 'preact';
import { AppContext } from '../context/AppContext';
import { DungeonMapTracker } from '../DungeonMapTracker';

const VIEW_TYPE_WINDROSE_MAP = 'windrose-map-view';

class WindroseMapView extends ItemView {
  private mapId = 'fullpane-test';
  private mapName = 'Full Pane Test';
  private mapType: 'grid' | 'hex' = 'grid';

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
    this.renderMap();
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
    };
  }

  async setState(state: Record<string, unknown>): Promise<void> {
    if (state?.mapId) this.mapId = state.mapId as string;
    if (state?.mapName) this.mapName = state.mapName as string;
    if (state?.mapType) this.mapType = state.mapType as 'grid' | 'hex';
    this.renderMap();
  }

  private renderMap(): void {
    render(
      h(AppContext.Provider, { value: this.app },
        h(DungeonMapTracker, {
          mapId: this.mapId,
          mapName: this.mapName,
          mapType: this.mapType,
          notePath: '',
          fullPane: true,
        })
      ),
      this.contentEl
    );
  }
}

export { VIEW_TYPE_WINDROSE_MAP, WindroseMapView };
