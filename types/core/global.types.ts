interface WindroseMcpOps {
  setTool: (toolId: string) => void;
  setColor: (color: string) => void;
  setOpacity: (opacity: number) => void;
  paintCell: (x: number, y: number, color?: string, opacity?: number) => boolean;
  paintCells: (cells: Array<{ x: number; y: number; color?: string; opacity?: number }>) => number;
  eraseCell: (x: number, y: number) => boolean;
  getCells: () => Array<{ x: number; y: number; color: string; opacity: number }>;
  undo: () => boolean;
  redo: () => boolean;
  selectLayer: (layerId: string) => void;
  forceSave: () => void;
}

interface WindroseMcpInstance {
  mapId: string;
  mapName: string;
  mapType: string;
  viewState: { x: number; y: number; zoom: number };
  activeLayerId: string;
  layerCount: number;
  layerIds: string[];
  currentTool: string;
  selectedColor: string;
  selectedOpacity: number;
  canUndo: boolean;
  canRedo: boolean;
  saveStatus: string;
  isExpanded: boolean;
  dataFilePath: string;
  notePath: string;
  timestamp: number;
  ops: WindroseMcpOps;
}

interface WindroseGlobal {
  obsidian?: unknown;
  version?: string;
  ready?: boolean;
  pendingNavigate?: { consumed: boolean; [key: string]: unknown };
  renderPreview?: (el: HTMLElement, linkPath: string, app: unknown) => void;
  unmountPreview?: (el: HTMLElement) => void;
  mcpInstances?: Record<string, WindroseMcpInstance>;
}

declare global {
  interface Window {
    __windrose?: WindroseGlobal;
  }
}

export type { WindroseMcpOps, WindroseMcpInstance, WindroseGlobal };
