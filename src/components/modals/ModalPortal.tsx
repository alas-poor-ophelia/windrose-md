/**
 * ModalPortal.tsx
 *
 * Reusable portal component for rendering modals to document.body.
 * This renders children normally, then uses DOM manipulation to move the rendered
 * content to a portal container in document.body, fixing mobile viewport issues.
 */

/** Props for ModalPortal component */

import { useEffect, useRef, useState } from 'preact/hooks';
import type { VNode, ComponentChildren } from 'preact';
export interface ModalPortalProps {
  /** Content to render in the portal */
  children: ComponentChildren;
}

const ModalPortal = ({ children }: ModalPortalProps): VNode => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const portalContainerRef = useRef<HTMLDivElement | null>(null);
  const [isInPortal, setIsInPortal] = useState(false);

  useEffect(() => {
    let portal = document.getElementById('windrose-modal-portal') as HTMLDivElement | null;
    if (!portal) {
      portal = document.createElement('div');
      portal.id = 'windrose-modal-portal';
      portal.className = 'windrose-modal-portal';
      document.body.appendChild(portal);
    }
    portalContainerRef.current = portal;

    return () => {
      if (portal != null && portal.childNodes.length === 0 && portal.parentNode) {
        portal.parentNode.removeChild(portal);
      }
    };
  }, []);

  useEffect(() => {
    if (wrapperRef.current && portalContainerRef.current) {
      portalContainerRef.current.appendChild(wrapperRef.current);
      setIsInPortal(true);
    }

    return () => {
      if (wrapperRef.current && wrapperRef.current.parentNode) {
        wrapperRef.current.parentNode.removeChild(wrapperRef.current);
      }
    };
  }, []);

  // Hidden until moved to prevent visual jump
  return (
    <div
      ref={wrapperRef}
      className="windrose-modal-portal-content"
      style={{ visibility: isInPortal ? 'visible' : 'hidden' }}
    >
      {children}
    </div>
  );
};

export { ModalPortal };