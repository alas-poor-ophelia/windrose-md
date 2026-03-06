/**
 * interactjs.ts
 *
 * Typed interface to the vendored interact.js library.
 * Loads the wrapper module which embeds the UMD bundle inline,
 * so it works in both dev (Datacore in vault) and production
 * (compiled markdown with no filesystem access).
 *
 * Exposes only the drag and resize APIs needed for modal interaction.
 */

/** Drag event from interact.js */
interface InteractDragEvent {
  target: HTMLElement;
  dx: number;
  dy: number;
  clientX: number;
  clientY: number;
  clientX0: number;
  clientY0: number;
}

/** Resize event from interact.js */
interface InteractResizeEvent {
  target: HTMLElement;
  rect: { width: number; height: number; top: number; left: number; bottom: number; right: number };
  deltaRect: { left: number; right: number; top: number; bottom: number };
  edges: { top: boolean; bottom: boolean; left: boolean; right: boolean };
}

/** Drag options */
interface DraggableOptions {
  allowFrom?: string;
  listeners?: {
    start?: (event: InteractDragEvent) => void;
    move?: (event: InteractDragEvent) => void;
    end?: (event: InteractDragEvent) => void;
  };
  modifiers?: unknown[];
}

/** Resize edge configuration */
interface ResizeEdges {
  top?: boolean | string;
  bottom?: boolean | string;
  left?: boolean | string;
  right?: boolean | string;
}

/** Resize options */
interface ResizableOptions {
  edges?: ResizeEdges;
  listeners?: {
    start?: (event: InteractResizeEvent) => void;
    move?: (event: InteractResizeEvent) => void;
    end?: (event: InteractResizeEvent) => void;
  };
  modifiers?: unknown[];
  invert?: 'none' | 'negate' | 'reposition';
}

/** Interactable instance returned by interact(element) */
interface Interactable {
  draggable(options: DraggableOptions): Interactable;
  resizable(options: ResizableOptions): Interactable;
  unset(): void;
}

/** Restrict modifier options */
interface RestrictOptions {
  restriction: 'parent' | 'self' | HTMLElement | { x: number; y: number; width: number; height: number };
  endOnly?: boolean;
}

/** RestrictSize modifier options */
interface RestrictSizeOptions {
  min?: { width: number; height: number };
  max?: { width: number; height: number };
}

/** The interact function and its static modifiers */
interface InteractStatic {
  (target: HTMLElement | string): Interactable;
  modifiers: {
    restrict(options: RestrictOptions): unknown;
    restrictRect(options: RestrictOptions): unknown;
    restrictSize(options: RestrictSizeOptions): unknown;
  };
}

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath) as {
  requireModuleByName: (name: string) => Promise<unknown>
};

const wrapperModule = await requireModuleByName("interact-wrapper.js") as {
  interact: InteractStatic;
};

const interact: InteractStatic = wrapperModule.interact;

return {
  interact,
  // Re-export types for consumers (TypeScript structural typing)
};
