/**
 * useCanvasInteraction.ts
 *
 * Custom hook that handles all canvas interaction state and logic including:
 * - Pan state (mouse pan, touch pan, space key pan)
 * - Zoom state (wheel zoom, pinch zoom)
 * - Coordinate transformation helpers
 * - Touch event helpers
 *
 * This hook manages the viewport state (zoom, center) and provides
 * helper functions for coordinate conversions that depend on viewport.
 */

// Type-only imports
import type { Point, IGeometry } from '#types/core/geometry.types';
import type { MapData, ViewState } from '#types/core/map.types';
import type {
  PanStart,
  TouchCenter,
  ClientCoords,
  WorldCoords,
  OnViewStateChangeCallback,
  UseCanvasInteractionResult,
} from '#types/hooks/canvasInteraction.types';

// Datacore imports
const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath) as {
  requireModuleByName: (name: string) => Promise<unknown>
};

interface DefaultConstants {
  minZoom: number;
}

const { DEFAULTS } = await requireModuleByName("dmtConstants.ts") as {
  DEFAULTS: DefaultConstants;
};

interface GridGeometryConstructor {
  new (...args: unknown[]): IGeometry & {
    getScaledCellSize: (zoom: number) => number;
  };
}

const { GridGeometry } = await requireModuleByName("GridGeometry.ts") as {
  GridGeometry: GridGeometryConstructor;
};

interface CanvasRef {
  current: HTMLCanvasElement | null;
}

function useCanvasInteraction(
  canvasRef: CanvasRef,
  mapData: MapData | null,
  geometry: (IGeometry & { getScaledCellSize?: (zoom: number) => number }) | null,
  onViewStateChange: OnViewStateChangeCallback = () => {},
  focused: boolean
): UseCanvasInteractionResult {
  const [isPanning, setIsPanning] = dc.useState<boolean>(false);
  const [isTouchPanning, setIsTouchPanning] = dc.useState<boolean>(false);
  const [panStart, setPanStart] = dc.useState<PanStart | null>(null);
  const [touchPanStart, setTouchPanStart] = dc.useState<TouchCenter | null>(null);

  const [initialPinchDistance, setInitialPinchDistance] = dc.useState<number | null>(null);

  const [spaceKeyPressed, setSpaceKeyPressed] = dc.useState<boolean>(false);

  // Track recent touch to ignore synthetic mouse events
  const lastTouchTimeRef = dc.useRef<number>(0);

  const getClientCoords = (e: PointerEvent | MouseEvent | TouchEvent): ClientCoords => {
    const touchEvent = e as TouchEvent;
    if (touchEvent.touches && touchEvent.touches.length > 0) {
      return {
        clientX: touchEvent.touches[0].clientX,
        clientY: touchEvent.touches[0].clientY
      };
    } else if (touchEvent.changedTouches && touchEvent.changedTouches.length > 0) {
      return {
        clientX: touchEvent.changedTouches[0].clientX,
        clientY: touchEvent.changedTouches[0].clientY
      };
    } else {
      const mouseEvent = e as MouseEvent;
      return {
        clientX: mouseEvent.clientX,
        clientY: mouseEvent.clientY
      };
    }
  };

  const getTouchCenter = (touches: TouchList): TouchCenter | null => {
    if (touches.length < 2) return null;
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2
    };
  };

  const getTouchDistance = (touches: TouchList): number | null => {
    if (touches.length < 2) return null;
    const dx = touches[1].clientX - touches[0].clientX;
    const dy = touches[1].clientY - touches[0].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const screenToGrid = (clientX: number, clientY: number): Point | null => {
    if (!mapData) return null;
    if (!geometry) return null;
    if (!canvasRef.current) return null;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();

    let x = clientX - rect.left;
    let y = clientY - rect.top;

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    x *= scaleX;
    y *= scaleY;

    const { viewState, northDirection } = mapData;
    const { zoom, center } = viewState;

    if (northDirection !== 0) {
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      x -= centerX;
      y -= centerY;

      const angleRad = (-northDirection * Math.PI) / 180;
      const rotatedX = x * Math.cos(angleRad) - y * Math.sin(angleRad);
      const rotatedY = x * Math.sin(angleRad) + y * Math.cos(angleRad);

      x = rotatedX + centerX;
      y = rotatedY + centerY;
    }

    let offsetX: number, offsetY: number;
    if (geometry instanceof GridGeometry) {
      const gridGeometry = geometry as { getScaledCellSize: (zoom: number) => number };
      const scaledCellSize = gridGeometry.getScaledCellSize(zoom);
      offsetX = canvas.width / 2 - center.x * scaledCellSize;
      offsetY = canvas.height / 2 - center.y * scaledCellSize;
    } else {
      offsetX = canvas.width / 2 - center.x * zoom;
      offsetY = canvas.height / 2 - center.y * zoom;
    }

    const worldX = (x - offsetX) / zoom;
    const worldY = (y - offsetY) / zoom;

    return geometry.worldToGrid(worldX, worldY);
  };

  const screenToWorld = (clientX: number, clientY: number): WorldCoords | null => {
    if (!mapData) return null;
    if (!geometry) return null;
    if (!canvasRef.current) return null;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();

    let x = clientX - rect.left;
    let y = clientY - rect.top;

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    x *= scaleX;
    y *= scaleY;

    const { viewState, northDirection } = mapData;
    const { zoom, center } = viewState;

    let offsetX: number, offsetY: number;
    if (geometry instanceof GridGeometry) {
      const gridGeometry = geometry as { getScaledCellSize: (zoom: number) => number };
      const scaledCellSize = gridGeometry.getScaledCellSize(zoom);
      offsetX = canvas.width / 2 - center.x * scaledCellSize;
      offsetY = canvas.height / 2 - center.y * scaledCellSize;
    } else {
      offsetX = canvas.width / 2 - center.x * zoom;
      offsetY = canvas.height / 2 - center.y * zoom;
    }

    if (northDirection !== 0) {
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      x -= centerX;
      y -= centerY;

      const angleRad = (-northDirection * Math.PI) / 180;
      const rotatedX = x * Math.cos(angleRad) - y * Math.sin(angleRad);
      const rotatedY = x * Math.sin(angleRad) + y * Math.cos(angleRad);

      x = rotatedX + centerX;
      y = rotatedY + centerY;
    }

    const worldX = (x - offsetX) / zoom;
    const worldY = (y - offsetY) / zoom;

    return { worldX, worldY };
  };

  const handleWheel = (e: WheelEvent): void => {
    e.preventDefault();

    if (!mapData) return;
    if (!geometry) return;
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    const newZoom = Math.max(DEFAULTS.minZoom, Math.min(4, mapData.viewState.zoom + delta));

    const { viewState } = mapData;
    const { zoom: oldZoom, center: oldCenter } = viewState;

    const gridGeometry = geometry as { getScaledCellSize: (zoom: number) => number };
    const scaledGridSize = gridGeometry.getScaledCellSize(oldZoom);
    const offsetX = canvas.width / 2 - oldCenter.x * scaledGridSize;
    const offsetY = canvas.height / 2 - oldCenter.y * scaledGridSize;

    const worldX = (mouseX - offsetX) / scaledGridSize;
    const worldY = (mouseY - offsetY) / scaledGridSize;

    const newScaledGridSize = gridGeometry.getScaledCellSize(newZoom);
    const newOffsetX = mouseX - worldX * newScaledGridSize;
    const newOffsetY = mouseY - worldY * newScaledGridSize;

    const newCenterX = (canvas.width / 2 - newOffsetX) / newScaledGridSize;
    const newCenterY = (canvas.height / 2 - newOffsetY) / newScaledGridSize;

    onViewStateChange({
      zoom: newZoom,
      center: { x: newCenterX, y: newCenterY }
    });
  };

  const startPan = (clientX: number, clientY: number): void => {
    if (!mapData) return;
    setIsPanning(true);
    setPanStart({
      x: clientX,
      y: clientY,
      centerX: mapData.viewState.center.x,
      centerY: mapData.viewState.center.y
    });
  };

  const updatePan = (clientX: number, clientY: number): void => {
    if (!isPanning || !panStart || !mapData) return;
    if (!geometry) return;

    const deltaX = clientX - panStart.x;
    const deltaY = clientY - panStart.y;

    const { viewState, northDirection } = mapData;
    const { zoom, center } = viewState;

    const angleRad = (-northDirection * Math.PI) / 180;
    const rotatedDeltaX = deltaX * Math.cos(angleRad) - deltaY * Math.sin(angleRad);
    const rotatedDeltaY = deltaX * Math.sin(angleRad) + deltaY * Math.cos(angleRad);

    let gridDeltaX: number, gridDeltaY: number;
    if (geometry instanceof GridGeometry) {
      const gridGeometry = geometry as { getScaledCellSize: (zoom: number) => number };
      const scaledGridSize = gridGeometry.getScaledCellSize(zoom);
      gridDeltaX = -rotatedDeltaX / scaledGridSize;
      gridDeltaY = -rotatedDeltaY / scaledGridSize;
    } else {
      gridDeltaX = -rotatedDeltaX / zoom;
      gridDeltaY = -rotatedDeltaY / zoom;
    }

    onViewStateChange({
      zoom: viewState.zoom,
      center: {
        x: center.x + gridDeltaX,
        y: center.y + gridDeltaY
      }
    });

    setPanStart({ x: clientX, y: clientY, centerX: center.x + gridDeltaX, centerY: center.y + gridDeltaY });
  };

  const stopPan = (): void => {
    setIsPanning(false);
    setPanStart(null);
  };

  const startTouchPan = (center: TouchCenter): void => {
    setIsTouchPanning(true);
    setTouchPanStart(center);
  };

  const updateTouchPan = (touches: TouchList): void => {
    if (!isTouchPanning || !touchPanStart || !mapData) return;
    if (!geometry) return;

    const center = getTouchCenter(touches);
    const distance = getTouchDistance(touches);
    if (!center || !distance) return;

    const deltaX = center.x - touchPanStart.x;
    const deltaY = center.y - touchPanStart.y;

    const { viewState, northDirection } = mapData;
    const { zoom, center: viewCenter } = viewState;

    const angleRad = (-northDirection * Math.PI) / 180;
    const rotatedDeltaX = deltaX * Math.cos(angleRad) - deltaY * Math.sin(angleRad);
    const rotatedDeltaY = deltaX * Math.sin(angleRad) + deltaY * Math.cos(angleRad);

    let gridDeltaX: number, gridDeltaY: number;
    if (geometry instanceof GridGeometry) {
      const gridGeometry = geometry as { getScaledCellSize: (zoom: number) => number };
      const scaledGridSize = gridGeometry.getScaledCellSize(zoom);
      gridDeltaX = -rotatedDeltaX / scaledGridSize;
      gridDeltaY = -rotatedDeltaY / scaledGridSize;
    } else {
      gridDeltaX = -rotatedDeltaX / zoom;
      gridDeltaY = -rotatedDeltaY / zoom;
    }
    let newZoom = zoom;
    if (initialPinchDistance) {
      const scale = distance / initialPinchDistance;
      newZoom = Math.max(DEFAULTS.minZoom, Math.min(4, zoom * scale));
    }

    onViewStateChange({
      zoom: newZoom,
      center: {
        x: viewCenter.x + gridDeltaX,
        y: viewCenter.y + gridDeltaY
      }
    });

    setTouchPanStart(center);
    setInitialPinchDistance(distance);
  };

  const stopTouchPan = (): void => {
    setIsTouchPanning(false);
    setTouchPanStart(null);
    setInitialPinchDistance(null);
  };

  dc.useEffect(() => {
    if (!focused) {
      if (spaceKeyPressed) {
        setSpaceKeyPressed(false);
        if (isPanning) {
          stopPan();
        }
      }
      return;
    }

    const handleSpaceDown = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement;
      if (e.key === ' ' && target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        setSpaceKeyPressed(true);
      }
    };

    const handleSpaceUp = (e: KeyboardEvent): void => {
      if (e.key === ' ') {
        setSpaceKeyPressed(false);
        if (isPanning) {
          stopPan();
        }
      }
    };

    window.addEventListener('keydown', handleSpaceDown);
    window.addEventListener('keyup', handleSpaceUp);
    return () => {
      window.removeEventListener('keydown', handleSpaceDown);
      window.removeEventListener('keyup', handleSpaceUp);
    };
  }, [focused, isPanning, spaceKeyPressed]);

  return {
    isPanning,
    isTouchPanning,
    panStart,
    touchPanStart,
    spaceKeyPressed,
    initialPinchDistance,
    lastTouchTimeRef,

    getClientCoords,
    getTouchCenter,
    getTouchDistance,
    screenToGrid,
    screenToWorld,

    handleWheel,

    startPan,
    updatePan,
    stopPan,
    startTouchPan,
    updateTouchPan,
    stopTouchPan,

    setIsPanning,
    setIsTouchPanning,
    setPanStart,
    setTouchPanStart,
    setInitialPinchDistance,
    setSpaceKeyPressed
  };
}

return { useCanvasInteraction };
