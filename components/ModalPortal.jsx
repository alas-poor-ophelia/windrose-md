/**
 * ModalPortal - Reusable portal component for rendering modals to document.body
 * 
 * This renders children normally, then uses DOM manipulation to move the rendered
 * content to a portal container in document.body, fixing mobile viewport issues.
 * 
 */

const ModalPortal = ({ children }) => {
  const wrapperRef = dc.useRef(null);
  const portalContainerRef = dc.useRef(null);
  const [isInPortal, setIsInPortal] = dc.useState(false);
  
  // Create portal container on mount
  dc.useEffect(() => {
    let portal = document.getElementById('dmt-modal-portal');
    if (!portal) {
      portal = document.createElement('div');
      portal.id = 'dmt-modal-portal';
      portal.className = 'dmt-modal-portal';
      document.body.appendChild(portal);
    }
    portalContainerRef.current = portal;
    
    return () => {
      // Clean up portal container if it's empty
      if (portal && portal.childNodes.length === 0 && portal.parentNode) {
        portal.parentNode.removeChild(portal);
      }
    };
  }, []);
  
  // Move wrapper to portal container after render
  dc.useEffect(() => {
    if (wrapperRef.current && portalContainerRef.current) {
      // Move the wrapper element to the portal
      portalContainerRef.current.appendChild(wrapperRef.current);
      // Mark as in portal to make visible
      setIsInPortal(true);
    }
    
    return () => {
      // Remove from portal on unmount
      if (wrapperRef.current && wrapperRef.current.parentNode) {
        wrapperRef.current.parentNode.removeChild(wrapperRef.current);
      }
    };
  }, []);
  
  // Render wrapper that will be moved to portal
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