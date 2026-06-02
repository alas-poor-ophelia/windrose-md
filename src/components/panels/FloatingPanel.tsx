import type { ComponentChildren, VNode } from 'preact';
import { useCallback, useEffect, useRef } from 'preact/hooks';

import { createPortal } from 'preact/compat';
import { interact } from '../../core/interactjs';
import { Icon } from '../shared/Icon';

function getFloatingPortalContainer(): HTMLElement {
  let portal = document.getElementById('windrose-floating-portal');
  if (!portal) {
    portal = document.createElement('div');
    portal.id = 'windrose-floating-portal';
    portal.className = 'windrose-floating-portal';
    document.body.appendChild(portal);
  }
  return portal;
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
}: FloatingPanelProps): VNode | null {
  const panelRef = useRef<HTMLDivElement>(null);
  const positionRef = useRef({ x: 200, y: 200 });
  const wasFloatingRef = useRef(false);

  if (isFloating && !wasFloatingRef.current) {
    if (initialPosition) {
      positionRef.current = { ...initialPosition };
    }
  }
  wasFloatingRef.current = isFloating;

  useEffect(() => {
    if (!isFloating || !panelRef.current) return undefined;

    const el = panelRef.current;

    el.style.left = `${positionRef.current.x}px`;
    el.style.top = `${positionRef.current.y}px`;

    const dragHandle = headerless ? '.windrose-floating-panel-grip' : '.windrose-floating-panel-header';
    const interactable = interact(el).draggable({
      allowFrom: dragHandle,
      listeners: {
        move: (event) => {
          positionRef.current = {
            x: positionRef.current.x + event.dx,
            y: positionRef.current.y + event.dy,
          };
          el.style.left = `${positionRef.current.x}px`;
          el.style.top = `${positionRef.current.y}px`;
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
  }, [isFloating, resizable, minSize, headerless]);

  const handlePointerDown = useCallback(() => {
    onFocus();
  }, [onFocus]);

  if (!isFloating) {
    return <>{children}</>;
  }

  return createPortal(
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
              title="Dock panel"
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
    getFloatingPortalContainer()
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
      title="Pop out panel"
    >
      <Icon icon="lucide-maximize-2" size={12} />
    </button>
  );
}

export { FloatingPanel, PopoutButton };
export type { FloatingPanelProps, PopoutButtonProps };
