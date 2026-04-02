/**
 * TextSelectionToolbar.tsx
 *
 * Toolbar for selected text labels. Shows edit, rotate, copy link, delete.
 * Consumer: TextLayer only.
 */

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { getActiveLayer } = await requireModuleByName("layerAccessor.ts");
const { useToolbarPosition } = await requireModuleByName("useToolbarPosition.ts");

/**
 * Calculate bounding box for a text label in screen coordinates
 */
function calculateTextLabelBounds(label, canvasRef, containerRef, mapData) {
  if (!label || !canvasRef.current || !containerRef?.current || !mapData) return null;

  const canvas = canvasRef.current;
  const { gridSize, viewState, northDirection } = mapData;
  const { zoom, center } = viewState;
  const scaledGridSize = gridSize * zoom;

  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const offsetX = centerX - center.x * scaledGridSize;
  const offsetY = centerY - center.y * scaledGridSize;

  let screenX = offsetX + label.position.x * zoom;
  let screenY = offsetY + label.position.y * zoom;

  if (northDirection !== 0) {
    const relX = screenX - centerX;
    const relY = screenY - centerY;
    const angleRad = (northDirection * Math.PI) / 180;
    const rotatedX = relX * Math.cos(angleRad) - relY * Math.sin(angleRad);
    const rotatedY = relX * Math.sin(angleRad) + relY * Math.cos(angleRad);
    screenX = centerX + rotatedX;
    screenY = centerY + rotatedY;
  }

  const ctx = canvas.getContext('2d');
  const fontSize = label.fontSize * zoom;
  ctx.font = `${fontSize}px sans-serif`;
  const metrics = ctx.measureText(label.content);
  const textWidth = metrics.width;
  const textHeight = fontSize * 1.2;

  const labelAngle = ((label.rotation || 0) * Math.PI) / 180;
  const cos = Math.abs(Math.cos(labelAngle));
  const sin = Math.abs(Math.sin(labelAngle));
  const rotatedWidth = textWidth * cos + textHeight * sin;
  const rotatedHeight = textWidth * sin + textHeight * cos;

  const rect = canvas.getBoundingClientRect();
  const containerRect = containerRef.current.getBoundingClientRect();
  const canvasOffsetX = rect.left - containerRect.left;
  const canvasOffsetY = rect.top - containerRect.top;
  const scaleX = rect.width / canvas.width;
  const scaleY = rect.height / canvas.height;

  const paddingX = 4;
  const paddingY = 2;

  return {
    screenX: (screenX * scaleX) + canvasOffsetX,
    screenY: (screenY * scaleY) + canvasOffsetY,
    width: (rotatedWidth + paddingX * 2) * scaleX,
    height: (rotatedHeight + paddingY * 2) * scaleY
  };
}

const TextSelectionToolbar = ({
  selectedItem,
  mapData,
  canvasRef,
  containerRef,
  geometry,
  onEdit,
  onRotate,
  onCopyLink,
  onDelete
}) => {
  if (!selectedItem || selectedItem.type !== 'text' || !mapData || !canvasRef?.current || !containerRef?.current) {
    return null;
  }

  const label = getActiveLayer(mapData).textLabels?.find(l => l.id === selectedItem.id);
  if (!label) return null;

  const bounds = calculateTextLabelBounds(label, canvasRef, containerRef, mapData);
  if (!bounds) return null;

  const buttonSize = 44;
  const buttonGap = 4;
  const buttons = [
    { id: 'edit', icon: 'lucide-pencil', title: 'Edit Text Label', onClick: onEdit },
    { id: 'rotate', icon: 'lucide-rotate-cw', title: 'Rotate 45° (or press R)', onClick: onRotate },
    { id: 'copyLink', icon: 'lucide-link', title: 'Copy link to clipboard', onClick: onCopyLink },
    { id: 'delete', icon: 'lucide-trash-2', title: 'Delete (or press Delete/Backspace)', onClick: onDelete, isDelete: true }
  ];

  const toolbarWidth = buttons.length * buttonSize + (buttons.length - 1) * buttonGap;
  const toolbarHeight = buttonSize;

  const pos = useToolbarPosition({ bounds, containerRef, toolbarWidth, toolbarHeight });
  if (!pos) return null;

  return (
    <div
      className="dmt-selection-toolbar"
      style={{
        position: 'absolute',
        left: `${pos.toolbarX}px`,
        top: `${pos.toolbarY}px`,
        width: `${toolbarWidth}px`,
        pointerEvents: 'auto',
        zIndex: 150
      }}
    >
      {buttons.map((btn) => (
        <button
          key={btn.id}
          className={`dmt-toolbar-button${btn.isDelete ? ' dmt-toolbar-delete-button' : ''}`}
          onClick={(e) => btn.onClick?.(e)}
          title={btn.title}
        >
          <dc.Icon icon={btn.icon} />
        </button>
      ))}
    </div>
  );
};

return { TextSelectionToolbar };
