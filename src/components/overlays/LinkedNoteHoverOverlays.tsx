// components/LinkedNoteHoverOverlays.jsx - Invisible hover links for objects with linked notes









import type { SelectedItem } from '#types/contexts/context.types';
import { calculateObjectScreenPosition } from '../../objects/screenPositionUtils';
import { openNoteInNewTab } from '../../persistence/noteOperations';
import { getActiveLayer } from '../../persistence/layerAccessor';
import { useMapState } from '../../context/MapContext';
import { InternalLink } from '../shared/InternalLink';

interface LinkedNoteHoverOverlaysProps {
  selectedItem: SelectedItem | null;
}

const LinkedNoteHoverOverlays = ({ selectedItem }: LinkedNoteHoverOverlaysProps) => {
  const { canvasRef, containerRef, mapData, geometry } = useMapState();

  // Don't render anything if prerequisites aren't met
  if (!canvasRef.current || !containerRef.current || !mapData?.layers || !geometry) return null;

  const activeLayer = getActiveLayer(mapData);

  // Filter: must have linkedNote AND not be currently selected
  const objectsWithLinks = (activeLayer.objects || []).filter(obj => {
    return obj.linkedNote &&
           typeof obj.linkedNote === 'string' &&
           !(selectedItem?.type === 'object' && selectedItem?.id === obj.id);
  });

  return (
    <>
      {objectsWithLinks.map(obj => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        const position = calculateObjectScreenPosition(obj, canvas, mapData, geometry, containerRef);
        if (!position) return null;

        const { screenX, screenY, objectWidth, objectHeight } = position;

        const notePath = (obj.linkedNote ?? '').replace(/\.md$/, '');
        if (!notePath) return null;
        
        // Touch handling state (local to each overlay)
        let touchStartTime: number | null = null;
        let touchTimer: ReturnType<typeof setTimeout> | null = null;

        const handleTouchStart = (_e: TouchEvent) => {
          touchStartTime = Date.now();

          // Set up long-press detection (500ms)
          touchTimer = setTimeout(() => {
            // Long press detected - open note
            void openNoteInNewTab(obj.linkedNote);
            touchStartTime = null; // Prevent click from also firing
          }, 500);
        };

        const handleTouchEnd = (e: TouchEvent) => {
          if (touchTimer) {
            clearTimeout(touchTimer);
            touchTimer = null;
          }
          
          // If it was a quick tap (not a long press), let it pass through
          if (touchStartTime && (Date.now() - touchStartTime < 500)) {
            // Quick tap - pass through to canvas
            e.preventDefault();
            e.stopPropagation();
            
            // Dispatch both mousedown and mouseup to complete the click
            const mouseDownEvent = new MouseEvent('mousedown', {
              bubbles: true,
              cancelable: true,
              view: window,
              clientX: e.changedTouches[0].clientX,
              clientY: e.changedTouches[0].clientY,
              screenX: e.changedTouches[0].screenX,
              screenY: e.changedTouches[0].screenY
            });
            
            const mouseUpEvent = new MouseEvent('mouseup', {
              bubbles: true,
              cancelable: true,
              view: window,
              clientX: e.changedTouches[0].clientX,
              clientY: e.changedTouches[0].clientY,
              screenX: e.changedTouches[0].screenX,
              screenY: e.changedTouches[0].screenY
            });
            
            canvas.dispatchEvent(mouseDownEvent);
            // Small delay to ensure mousedown is processed first
            setTimeout(() => {
              canvas.dispatchEvent(mouseUpEvent);
            }, 0);
          }

          touchStartTime = null;
        };
        
        const handleTouchCancel = () => {
          if (touchTimer) {
            clearTimeout(touchTimer);
            touchTimer = null;
          }
          touchStartTime = null;
        };
        
        return (
          <div
            key={`hover-link-${obj.id}`}
            className="dmt-object-hover-link"
            style={{
              position: 'absolute',
              left: `${screenX - objectWidth / 2}px`,
              top: `${screenY - objectHeight / 2}px`,
              width: `${objectWidth}px`,
              height: `${objectHeight}px`,
              zIndex: 10
            }}
            onClickCapture={(e) => {
              if (e.ctrlKey || e.metaKey) {
                // Ctrl/Cmd+Click: Open note
                e.preventDefault();
                e.stopPropagation();
                void openNoteInNewTab(obj.linkedNote);
              } else {
                // Regular click: Pass through to canvas for tool interaction
                e.preventDefault();
                e.stopPropagation();
                
                // Create synthetic mousedown and mouseup events for canvas
                const mouseDownEvent = new MouseEvent('mousedown', {
                  bubbles: true,
                  cancelable: true,
                  view: window,
                  clientX: e.clientX,
                  clientY: e.clientY,
                  screenX: e.screenX,
                  screenY: e.screenY,
                  button: e.button,
                  buttons: e.buttons
                });
                
                const mouseUpEvent = new MouseEvent('mouseup', {
                  bubbles: true,
                  cancelable: true,
                  view: window,
                  clientX: e.clientX,
                  clientY: e.clientY,
                  screenX: e.screenX,
                  screenY: e.screenY,
                  button: e.button,
                  buttons: e.buttons
                });
                
                canvas.dispatchEvent(mouseDownEvent);
                // Small delay to ensure mousedown is processed first
                setTimeout(() => {
                  canvas.dispatchEvent(mouseUpEvent);
                }, 0);
              }
            }}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchCancel}
          >
            <InternalLink link={notePath} />
          </div>
        );
      })}
    </>
  );
};

export { LinkedNoteHoverOverlays };