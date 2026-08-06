import type { ComponentChildren, VNode } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

import { createPortal } from 'preact/compat';
import { interact } from '../../core/interactjs';
import { Icon } from '../shared/Icon';
import { tooltipRef } from '../shared/obsidianTooltip';

/** Resolve the floating-panel portal for a SPECIFIC document. Never anchor to
 *  the ambient activeDocument: it tracks whichever Obsidian window has focus
 *  app-wide, so a panel owned by the main window could portal into a popout
 *  and render with the wrong window's coordinates (windrose-pqv). */
function getFloatingPortalContainer(doc: Document): HTMLElement {
  let portal = doc.getElementById('windrose-floating-portal');
  if (!portal) {
    portal = doc.win.createDiv();
    portal.id = 'windrose-floating-portal';
    portal.className = 'windrose-floating-portal';
    doc.body.appendChild(portal);
  }
  return portal;
}

/** Pure clamp: keep a w×h panel at (x, y) fully inside a winW×winH viewport
 *  (panel-sized-larger-than-window degrades to pinning at 0). */
function clampPanelPosition(
  x: number, y: number, w: number, h: number, winW: number, winH: number
): { x: number; y: number } {
  return {
    x: Math.min(Math.max(0, x), Math.max(0, winW - w)),
    y: Math.min(Math.max(0, y), Math.max(0, winH - h)),
  };
}

/** Clamp a floated panel into its OWN window's viewport, so any stale or
 *  cross-context coordinate (leaked per-map state, position captured in a
 *  different window) renders recovered instead of pinned against the wrong
 *  edge or off-screen (windrose-pqv). */
function clampToViewport(x: number, y: number, el: HTMLElement): { x: number; y: number } {
  const win = el.ownerDocument.defaultView ?? window;
  const rect = el.getBoundingClientRect();
  return clampPanelPosition(x, y, rect.width || 200, rect.height || 80, win.innerWidth, win.innerHeight);
}

interface FloatingPanelProps {
  title: string;
  isFloating: boolean;
  onDock: () => void;
  onFocus: () => void;
  zIndex: number;
  initialPosition?: { x: number; y: number };
  resizable?: boolean;
  minSize?: { width: number; height: number };
  children: ComponentChildren;
  className?: string;
  /** Hide the full header and show a thin drag grip instead */
  headerless?: boolean;
  onPositionChange?: (position: { x: number; y: number }) => void;
}

function FloatingPanel({
  title,
  isFloating,
  onDock,
  onFocus,
  zIndex,
  initialPosition,
  resizable = false,
  minSize,
  children,
  className,
  headerless = false,
  onPositionChange,
}: FloatingPanelProps): VNode | null {
  const panelRef = useRef<HTMLDivElement>(null);
  const positionRef = useRef({ x: 200, y: 200 });
  const wasFloatingRef = useRef(false);

  // The marker span renders inline (never portaled), so its ownerDocument is
  // the document that owns this panel's place in the layout — the only safe
  // portal anchor. activeDocument is a first-render fallback only, corrected
  // the moment the marker mounts.
  const [hostDoc, setHostDoc] = useState<Document | null>(null);
  const markerRef = useCallback((el: HTMLSpanElement | null) => {
    if (el != null) setHostDoc(prev => (prev === el.ownerDocument ? prev : el.ownerDocument));
  }, []);

  if (isFloating && !wasFloatingRef.current) {
    if (initialPosition) {
      positionRef.current = { ...initialPosition };
    }
  }
  wasFloatingRef.current = isFloating;

  useEffect(() => {
    if (!isFloating || !panelRef.current) return undefined;

    const el = panelRef.current;

    // Tripwire (windrose-pqv): the panel rendering in a different document
    // than its host means the portal crossed windows — log the evidence.
    if (hostDoc != null && el.ownerDocument !== hostDoc) {
      console.warn(`[Windrose] Floating panel "${title}" portal document differs from its host document — cross-window portal (windrose-pqv tripwire).`);
    }

    const arrived = positionRef.current;
    const applied = clampToViewport(arrived.x, arrived.y, el);
    if (applied.x !== arrived.x || applied.y !== arrived.y) {
      // Tripwire (windrose-pqv): an out-of-viewport arrival means some
      // mechanism produced coordinates for a window this panel isn't in.
      const win = el.ownerDocument.defaultView ?? window;
      console.warn(`[Windrose] Floating panel "${title}" arrived out of viewport (x=${arrived.x}, y=${arrived.y}, window=${win.innerWidth}x${win.innerHeight}) — clamped (windrose-pqv tripwire).`);
    }
    positionRef.current = applied;
    el.style.left = `${positionRef.current.x}px`;
    el.style.top = `${positionRef.current.y}px`;

    const dragHandle = headerless ? '.windrose-floating-panel-grip' : '.windrose-floating-panel-header';
    const interactable = interact(el).draggable({
      allowFrom: dragHandle,
      listeners: {
        move: (event) => {
          positionRef.current = clampToViewport(
            positionRef.current.x + event.dx,
            positionRef.current.y + event.dy,
            el
          );
          el.style.left = `${positionRef.current.x}px`;
          el.style.top = `${positionRef.current.y}px`;
        },
        end: () => {
          onPositionChange?.(positionRef.current);
        },
      },
    });

    if (resizable && minSize) {
      interactable.resizable({
        edges: { bottom: '.windrose-floating-panel-resize-handle', right: '.windrose-floating-panel-resize-handle' },
        listeners: {
          move: (event) => {
            Object.assign(el.style, {
              width: `${event.rect.width}px`,
              height: `${event.rect.height}px`,
            });
          },
        },
        modifiers: [
          interact.modifiers.restrictSize({
            min: minSize,
          }),
        ],
      });
    }

    return () => {
      interactable.unset();
    };
  }, [isFloating, resizable, minSize, headerless, hostDoc, title]);

  const handlePointerDown = useCallback(() => {
    onFocus();
  }, [onFocus]);

  if (!isFloating) {
    return <><span ref={markerRef} hidden />{children}</>;
  }

  return (
    <>
      <span ref={markerRef} hidden />
      {createPortal(
    <div
      ref={panelRef}
      className={`windrose-floating-panel ${className ?? ''}`}
      style={{
        position: 'fixed',
        left: `${positionRef.current.x}px`,
        top: `${positionRef.current.y}px`,
        zIndex,
      }}
      onMouseDown={handlePointerDown}
      onTouchStart={handlePointerDown}
    >
      {headerless ? (
        <div className="windrose-floating-panel-grip" />
      ) : (
        <div className="windrose-floating-panel-header">
          <span className="windrose-floating-panel-title">{title}</span>
          <div className="windrose-floating-panel-actions">
            <button
              className="windrose-floating-panel-btn"
              onClick={onDock}
              ref={tooltipRef('Dock panel')}
            >
              <Icon icon="lucide-pin" size={14} />
            </button>
          </div>
        </div>
      )}
      <div className="windrose-floating-panel-content">
        {children}
      </div>
      {resizable && <div className="windrose-floating-panel-resize-handle" />}
    </div>,
        getFloatingPortalContainer(hostDoc ?? activeDocument)
      )}
    </>
  );
}

interface PopoutButtonProps {
  onClick: (position: { x: number; y: number }) => void;
  className?: string;
}

function PopoutButton({ onClick, className }: PopoutButtonProps): VNode {
  return (
    <button
      className={`windrose-popout-btn ${className ?? ''}`}
      onClick={(e) => {
        e.stopPropagation();
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        onClick({ x: rect.left, y: rect.top });
      }}
      ref={tooltipRef('Pop out panel')}
    >
      <Icon icon="lucide-maximize-2" size={12} />
    </button>
  );
}

export { FloatingPanel, PopoutButton, clampPanelPosition };
export type { FloatingPanelProps, PopoutButtonProps };
