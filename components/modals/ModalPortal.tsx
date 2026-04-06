/**
 * ModalPortal.tsx
 *
 * Reusable portal component for rendering modals to document.body.
 * This renders children normally, then uses DOM manipulation to move the rendered
 * content to a portal container in document.body, fixing mobile viewport issues.
 */

/** Props for ModalPortal component */
export interface ModalPortalProps {
  /** Content to render in the portal */
  children: React.ReactNode;
}

const ModalPortal = ({ children }: ModalPortalProps): React.ReactElement => {
  const wrapperRef = dc.useRef<HTMLDivElement>(null);
  const portalContainerRef = dc.useRef<HTMLDivElement | null>(null);
  const [isInPortal, setIsInPortal] = dc.useState(false);

  dc.useEffect(() => {
    let portal = document.getElementById('dmt-modal-portal') as HTMLDivElement | null;
    if (!portal) {
      portal = document.createElement('div');
      portal.id = 'dmt-modal-portal';
      portal.className = 'dmt-modal-portal';
      document.body.appendChild(portal);
    }
    portalContainerRef.current = portal;

    return () => {
      if (portal && portal.childNodes.length === 0 && portal.parentNode) {
        portal.parentNode.removeChild(portal);
      }
    };
  }, []);

  dc.useEffect(() => {
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
      className="dmt-modal-portal-content"
      style={{ visibility: isInPortal ? 'visible' : 'hidden' }}
    >
      {children}
    </div>
  );
};

return { ModalPortal };
