/**
 * MapSettingsModal.tsx
 *
 * Modal for configuring per-map settings and UI preferences.
 * Organized into tabs:
 * 1. Appearance - Color customization
 * 2. Hex Grid (hex maps only) - Bounds, coordinate display, and background image
 * 3. Measurement - Distance settings
 * 4. Preferences - UI state persistence options
 *
 * Features:
 * - Draggable by header
 * - Resizable (size persists across sessions)
 */

import type { MapType } from '#types/core/map.types';

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { ModalPortal } = await requireModuleByName("ModalPortal.tsx");
const { MapSettingsProvider, useMapSettings } = await requireModuleByName("MapSettingsContext.tsx");
const { AppearanceTab } = await requireModuleByName("AppearanceTab.tsx");
const { HexGridTab } = await requireModuleByName("HexGridTab.tsx");
const { GridBackgroundTab } = await requireModuleByName("GridBackgroundTab.tsx");
const { MeasurementTab } = await requireModuleByName("MeasurementTab.tsx");
const { PreferencesTab } = await requireModuleByName("PreferencesTab.tsx");
const { ResizeConfirmDialog } = await requireModuleByName("ResizeConfirmDialog.tsx");

/** Tab configuration */
interface SettingsTab {
  id: string;
  label: string;
}

/** Modal size */
interface ModalSize {
  width: number;
  height: number;
}

/** Modal position */
interface ModalPosition {
  x: number | null;
  y: number | null;
}

/** Drag offset */
interface DragOffset {
  x: number;
  y: number;
}

/** Resize start reference */
interface ResizeStart {
  x: number;
  y: number;
  width: number;
  height: number;
  posX: number;
  posY: number;
}

/** Resize edge direction */
type ResizeEdge = 'e' | 'w' | 's' | 'se' | 'sw' | null;

/** Props for MapSettingsModal */
export interface MapSettingsModalProps {
  isOpen: boolean;
  mapData: unknown;
  mapType: MapType;
  globalSettings: Record<string, unknown>;
  onSave: (updates: Record<string, unknown>) => void;
  onCancel: () => void;
}

const MODAL_SIZE_KEY = 'windrose-settings-modal-size';
const DEFAULT_WIDTH = 520;
const DEFAULT_HEIGHT = 500;
const MIN_WIDTH = 480;
const MIN_HEIGHT = 350;
const MAX_WIDTH = 800;
const MAX_HEIGHT = 800;

/**
 * Load persisted modal size from localStorage
 */
function loadPersistedSize(): ModalSize {
  try {
    const stored = localStorage.getItem(MODAL_SIZE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        width: Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, parsed.width || DEFAULT_WIDTH)),
        height: Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, parsed.height || DEFAULT_HEIGHT))
      };
    }
  } catch {
    // Ignore parse errors
  }
  return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
}

/**
 * Save modal size to localStorage
 */
function savePersistedSize(width: number, height: number): void {
  try {
    localStorage.setItem(MODAL_SIZE_KEY, JSON.stringify({ width, height }));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Inner modal content that uses the settings context
 */
function MapSettingsModalContent(): React.ReactElement | null {
  const {
    isOpen,
    activeTab,
    setActiveTab,
    tabs,
    mapType,
    isLoading,
    handleSave,
    handleCancel,
    mouseDownTargetRef
  } = useMapSettings();

  const [position, setPosition] = dc.useState<ModalPosition>({ x: null, y: null });
  const [size, setSize] = dc.useState<ModalSize>(loadPersistedSize);

  const [isDragging, setIsDragging] = dc.useState(false);
  const [dragOffset, setDragOffset] = dc.useState<DragOffset>({ x: 0, y: 0 });

  const [isResizing, setIsResizing] = dc.useState(false);
  const [resizeEdge, setResizeEdge] = dc.useState<ResizeEdge>(null);
  const resizeStartRef = dc.useRef<ResizeStart>({ x: 0, y: 0, width: 0, height: 0, posX: 0, posY: 0 });

  const modalRef = dc.useRef<HTMLDivElement | null>(null);

  dc.useEffect(() => {
    if (isOpen) {
      setPosition({ x: null, y: null });
    }
  }, [isOpen]);

  const handleDragStart = dc.useCallback((e: MouseEvent): void => {
    if (!(e.target as HTMLElement).closest('.dmt-modal-header')) return;

    e.preventDefault();

    const modalRect = modalRef.current?.getBoundingClientRect();
    if (!modalRect) return;

    const actualX = position.x ?? (window.innerWidth - modalRect.width) / 2;
    const actualY = position.y ?? (window.innerHeight - modalRect.height) / 2;

    setDragOffset({
      x: e.clientX - actualX,
      y: e.clientY - actualY
    });
    setIsDragging(true);
  }, [position]);

  dc.useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent): void => {
      const newX = e.clientX - dragOffset.x;
      const newY = e.clientY - dragOffset.y;

      const maxX = window.innerWidth - size.width;
      const maxY = window.innerHeight - size.height;

      setPosition({
        x: Math.max(0, Math.min(maxX, newX)),
        y: Math.max(0, Math.min(maxY, newY))
      });
    };

    const handleMouseUp = (): void => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset, size]);

  const handleResizeStart = dc.useCallback((e: MouseEvent, edge: ResizeEdge): void => {
    e.preventDefault();
    e.stopPropagation();

    const modalRect = modalRef.current?.getBoundingClientRect();
    if (!modalRect) return;

    const actualX = position.x ?? (window.innerWidth - modalRect.width) / 2;
    const actualY = position.y ?? (window.innerHeight - modalRect.height) / 2;

    resizeStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      width: size.width,
      height: size.height,
      posX: actualX,
      posY: actualY
    };

    setResizeEdge(edge);
    setIsResizing(true);
  }, [position, size]);

  dc.useEffect(() => {
    if (!isResizing || !resizeEdge) return;

    const handleMouseMove = (e: MouseEvent): void => {
      const start = resizeStartRef.current;
      const deltaX = e.clientX - start.x;
      const deltaY = e.clientY - start.y;

      let newWidth = start.width;
      let newHeight = start.height;
      let newX = start.posX;
      let newY = start.posY;

      if (resizeEdge.includes('e')) {
        newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, start.width + deltaX));
      }
      if (resizeEdge.includes('w')) {
        const widthDelta = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, start.width - deltaX)) - start.width;
        newWidth = start.width + widthDelta;
        newX = start.posX - widthDelta;
      }
      if (resizeEdge.includes('s')) {
        newHeight = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, start.height + deltaY));
      }

      newX = Math.max(0, Math.min(window.innerWidth - newWidth, newX));
      newY = Math.max(0, Math.min(window.innerHeight - newHeight, newY));

      setSize({ width: newWidth, height: newHeight });
      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = (): void => {
      setIsResizing(false);
      setResizeEdge(null);
      savePersistedSize(size.width, size.height);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, resizeEdge, size]);

  if (!isOpen) return null;

  const actualLeft = position.x ?? `calc(50% - ${size.width / 2}px)`;
  const actualTop = position.y ?? `calc(50% - ${size.height / 2}px)`;

  const getCursor = (): string => {
    if (isDragging) return 'grabbing';
    if (isResizing) {
      if (resizeEdge === 'e' || resizeEdge === 'w') return 'ew-resize';
      if (resizeEdge === 's') return 'ns-resize';
      return 'nwse-resize';
    }
    return 'default';
  };

  return (
    <ModalPortal>
      <div
        class="dmt-modal-overlay"
        onMouseDown={(e: MouseEvent) => { mouseDownTargetRef.current = e.target; }}
        onClick={(e: MouseEvent) => {
          if (mouseDownTargetRef.current === e.target) {
            handleCancel();
          }
          mouseDownTargetRef.current = null;
        }}
        style={{ cursor: getCursor() }}
      >
        <div
          ref={modalRef}
          class="dmt-modal-content dmt-settings-modal"
          onClick={(e: MouseEvent) => e.stopPropagation()}
          style={{
            position: 'fixed',
            left: typeof actualLeft === 'number' ? `${actualLeft}px` : actualLeft,
            top: typeof actualTop === 'number' ? `${actualTop}px` : actualTop,
            width: `${size.width}px`,
            height: `${size.height}px`,
            maxWidth: '95vw',
            maxHeight: '95vh',
            transform: 'none',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          <div
            class="dmt-modal-header"
            onMouseDown={handleDragStart}
            style={{
              cursor: isDragging ? 'grabbing' : 'grab',
              userSelect: 'none',
              flexShrink: 0
            }}
          >
            <h3>Map Settings</h3>
          </div>

          <div class="dmt-settings-tab-bar" style={{ flexShrink: 0 }}>
            {tabs.map((tab: SettingsTab) => (
              <button
                key={tab.id}
                class={`dmt-settings-tab ${activeTab === tab.id ? 'dmt-settings-tab-active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div class="dmt-modal-body" style={{
            paddingTop: '16px',
            flex: 1,
            overflowY: 'auto',
            minHeight: 0
          }}>
            {activeTab === 'appearance' && <AppearanceTab />}
            {activeTab === 'hexgrid' && mapType === 'hex' && <HexGridTab />}
            {activeTab === 'gridbackground' && mapType === 'grid' && <GridBackgroundTab />}
            {activeTab === 'measurement' && <MeasurementTab />}
            {activeTab === 'preferences' && <PreferencesTab />}
          </div>

          <div class="dmt-modal-footer" style={{ flexShrink: 0 }}>
            <button
              class="dmt-modal-btn dmt-modal-btn-cancel"
              onClick={handleCancel}
              disabled={isLoading}
            >
              Cancel
            </button>

            <button
              class="dmt-modal-btn dmt-modal-btn-submit"
              onClick={handleSave}
              disabled={isLoading}
            >
              {isLoading ? 'Saving...' : 'Save'}
            </button>
          </div>

          <div
            style={{
              position: 'absolute',
              right: 0,
              top: '40px',
              bottom: '8px',
              width: '6px',
              cursor: 'ew-resize'
            }}
            onMouseDown={(e: MouseEvent) => handleResizeStart(e, 'e')}
          />
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: '40px',
              bottom: '8px',
              width: '6px',
              cursor: 'ew-resize'
            }}
            onMouseDown={(e: MouseEvent) => handleResizeStart(e, 'w')}
          />
          <div
            style={{
              position: 'absolute',
              left: '8px',
              right: '8px',
              bottom: 0,
              height: '6px',
              cursor: 'ns-resize'
            }}
            onMouseDown={(e: MouseEvent) => handleResizeStart(e, 's')}
          />
          <div
            style={{
              position: 'absolute',
              right: 0,
              bottom: 0,
              width: '12px',
              height: '12px',
              cursor: 'nwse-resize'
            }}
            onMouseDown={(e: MouseEvent) => handleResizeStart(e, 'se')}
          />
          <div
            style={{
              position: 'absolute',
              left: 0,
              bottom: 0,
              width: '12px',
              height: '12px',
              cursor: 'nesw-resize'
            }}
            onMouseDown={(e: MouseEvent) => handleResizeStart(e, 'sw')}
          />
        </div>
      </div>

      <ResizeConfirmDialog />
    </ModalPortal>
  );
}

/**
 * Main MapSettingsModal component
 */
function MapSettingsModal(props: MapSettingsModalProps): React.ReactElement {
  return (
    <MapSettingsProvider {...props}>
      <MapSettingsModalContent />
    </MapSettingsProvider>
  );
}

return { MapSettingsModal };
