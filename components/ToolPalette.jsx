// components/ToolPalette.jsx - Tool selection palette with history controls, object tool, circle tool, and color picker

const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { DEFAULT_COLOR } = await requireModuleByName("colorOperations.js");
const { ColorPicker } = await requireModuleByName("ColorPicker.jsx");

// Tool Palette Corner Bracket (outward-facing, simplified)
const ToolPaletteBracket = ({ position }) => {
  return (
    <svg 
      className={`dmt-tool-palette-bracket dmt-tool-palette-bracket-${position}`}
      viewBox="-5 -5 25 25"
    >
      <defs>
        <filter id={`palette-bracket-glow-${position}`}>
          <feGaussianBlur stdDeviation="1.5" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      <path 
        d="M 0 15 L 0 0 L 15 0" 
        stroke="#c4a57b" 
        strokeWidth="1.5" 
        fill="none"
        filter={`url(#palette-bracket-glow-${position})`}
      />
      <path 
        d="M -2.5 18 L -2.5 -2.5 L 18 -2.5" 
        stroke="rgba(255, 255, 255, 0.4)" 
        strokeWidth="0.8" 
        fill="none"
      />
      <line 
        x1="-4" y1="7" x2="0" y2="7" 
        stroke="#c4a57b" 
        strokeWidth="1.5"
      />
      <line 
        x1="7" y1="-4" x2="7" y2="0" 
        stroke="#c4a57b" 
        strokeWidth="1.5"
      />
    </svg>
  );
};

const ToolPalette = ({ 
  currentTool, 
  onToolChange, 
  onUndo, 
  onRedo, 
  canUndo, 
  canRedo,
  selectedColor,
  onColorChange,
  isColorPickerOpen,       
  onColorPickerOpenChange,
  customColors,
  onAddCustomColor,
  onDeleteCustomColor,
  mapType
}) => {
	const colorBtnRef = dc.useRef(null);
	const pendingCustomColorRef = dc.useRef(null);
  
  const tools = [
    { id: 'select', label: '🖐️', title: 'Select/Move Text & Objects', icon: 'lucide-hand' },
    { id: 'draw', label: '✏️', title: 'Draw (fill cells)', icon: 'lucide-paintbrush' },
    { id: 'erase', label: '🗑️', title: 'Erase (remove text/objects/cells)', icon: 'lucide-eraser' },
    { id: 'rectangle', label: '⬜', title: 'Rectangle (click two corners)', icon: 'lucide-square' },
    { id: 'circle', label: '⭕', title: 'Circle (click edge, then center)', icon: 'lucide-circle' },
    { id: 'clearArea', label: '❎', title: 'Clear Area (click two corners to erase)', icon: 'lucide-square-x' },
    { id: 'addObject', label: '📍', title: 'Add Object (select from sidebar)', icon: 'lucide-map-pin-plus' },
    { id: 'addText', label: '✨', title: 'Add Text Label', icon: 'lucide-type' }
  ];
  
  
  // Filter out tools that don't work with hex maps
  const hexIncompatibleTools = ['rectangle', 'circle', 'clearArea'];
  const visibleTools = mapType === 'hex' 
    ? tools.filter(tool => !hexIncompatibleTools.includes(tool.id))
    : tools;
  const toggleColorPicker = (e) => {
    e.stopPropagation();
    onColorPickerOpenChange(!isColorPickerOpen);
  };
  
  const handleColorSelect = (color) => {
    onColorChange(color);
    // Keep picker open for multiple selections
  };
  
  const handleColorReset = () => {
    onColorChange(DEFAULT_COLOR);
    onColorPickerOpenChange(false);
  };
  
  const handleCloseColorPicker = () => {
    onColorPickerOpenChange(false);
  };
  
  // Close color picker when clicking outside
  dc.useEffect(() => {
    if (isColorPickerOpen) {
      const handleClickOutside = (e) => {
        // Check if click is inside the color picker or the color button
        const pickerElement = e.target.closest('.dmt-color-picker');
        const buttonElement = e.target.closest('.dmt-color-tool-btn');
        
        if (!pickerElement && !buttonElement) {
          // Click is outside - save any pending color and close the picker
          if (pendingCustomColorRef.current) {
            onAddCustomColor(pendingCustomColorRef.current);
            onColorChange(pendingCustomColorRef.current);
            pendingCustomColorRef.current = null;
          }
          
          handleCloseColorPicker();
        }
      };
      
      // Use a small timeout to avoid catching the opening click
      setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('touchstart', handleClickOutside);
      }, 10);
      
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('touchstart', handleClickOutside);
      };
    }
  }, [isColorPickerOpen]);
  
  return (
    <div className="dmt-tool-palette">
      {/* Outward-facing decorative corner brackets */}
      <ToolPaletteBracket position="tl" />
      <ToolPaletteBracket position="tr" />
      <ToolPaletteBracket position="bl" />
      <ToolPaletteBracket position="br" />
      
      {/* Render select and draw tools first */}
      <button
        className={`dmt-tool-btn ${currentTool === 'select' ? 'dmt-tool-btn-active' : ''}`}
        onClick={() => onToolChange('select')}
        title="Select/Move Text & Objects"
      >
        <dc.Icon icon="lucide-hand" />
      </button>
      <button
        className={`dmt-tool-btn ${currentTool === 'draw' ? 'dmt-tool-btn-active' : ''}`}
        onClick={() => onToolChange('draw')}
        title="Draw (fill cells)"
      >
        <dc.Icon icon="lucide-paintbrush" />
      </button>
      
      {/* Color Picker Button - right after draw tool */}
<div style={{ position: 'relative', display: 'inline-block' }}>
        <button
          ref={colorBtnRef}
          className={`dmt-tool-btn dmt-color-tool-btn ${isColorPickerOpen ? 'dmt-tool-btn-active' : ''}`}
          onClick={toggleColorPicker}
          title="Choose cell color"
          style={{
            borderBottom: `4px solid ${selectedColor || DEFAULT_COLOR}`
          }}
        >
          <dc.Icon icon="lucide-palette" />
        </button>
        
        {/* Updated ColorPicker with custom colors */}
        <ColorPicker
          isOpen={isColorPickerOpen}
          selectedColor={selectedColor}
          onColorSelect={handleColorSelect}
          onClose={handleCloseColorPicker}
          onReset={handleColorReset}
          customColors={customColors}
          onAddCustomColor={onAddCustomColor}
          onDeleteCustomColor={onDeleteCustomColor}
          position={null}
		  pendingCustomColorRef={pendingCustomColorRef}
          title="Cell Color"
        />
      </div>
      
      {/* Render remaining tools */}
      {visibleTools.slice(2).map(tool => (
        <button
          key={tool.id}
          className={`dmt-tool-btn ${currentTool === tool.id ? 'dmt-tool-btn-active' : ''}`}
          onClick={() => onToolChange(tool.id)}
          title={tool.title}
        >
          <dc.Icon icon={tool.icon} />
        </button>
      ))}
      
      <div className="dmt-history-controls">
        <button 
          className="dmt-history-btn"
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo"
        >
          <dc.Icon icon="lucide-undo" />
        </button>
        <button 
          className="dmt-history-btn"
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo"
        >
          <dc.Icon icon="lucide-redo" />
        </button>
      </div>
    </div>
  );
};

return { ToolPalette };