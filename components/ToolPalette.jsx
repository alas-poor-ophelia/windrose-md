// components/ToolPalette.jsx - Tool selection palette with sub-tool menus, history controls, and color picker

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

/**
 * Sub-menu flyout component
 */
const SubMenuFlyout = ({ subTools, currentSubTool, onSelect, onClose }) => {
  return (
    <div className="dmt-subtool-menu">
      {subTools.map(subTool => (
        <button
          key={subTool.id}
          className={`dmt-subtool-option ${currentSubTool === subTool.id ? 'dmt-subtool-option-active' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(subTool.id);
            onClose();
          }}
          title={subTool.title}
        >
          <dc.Icon icon={subTool.icon} />
          <span>{subTool.label}</span>
        </button>
      ))}
    </div>
  );
};

/**
 * Tool button with optional sub-menu support
 */
const ToolButtonWithSubMenu = ({ 
  toolGroup,
  currentTool,
  currentSubTool,
  isSubMenuOpen,
  onToolSelect,
  onSubToolSelect,
  onSubMenuOpen,
  onSubMenuClose,
  mapType
}) => {
  const longPressTimer = dc.useRef(null);
  const LONG_PRESS_DURATION = 300;
  
  // Filter sub-tools based on map type
  const visibleSubTools = toolGroup.subTools.filter(st => 
    mapType !== 'hex' || !st.gridOnly
  );
  
  // If no visible sub-tools, don't render
  if (visibleSubTools.length === 0) return null;
  
  // Find current sub-tool definition
  const currentSubToolDef = visibleSubTools.find(st => st.id === currentSubTool) || visibleSubTools[0];
  
  // Check if this tool group (any sub-tool) is active
  const isActive = visibleSubTools.some(st => st.id === currentTool);
  
  // Only show sub-menu indicator if there are multiple sub-tools
  const hasMultipleSubTools = visibleSubTools.length > 1;
  
  const handlePointerDown = (e) => {
    if (!hasMultipleSubTools) return;
    
    longPressTimer.current = setTimeout(() => {
      onSubMenuOpen(toolGroup.id);
      longPressTimer.current = null;
    }, LONG_PRESS_DURATION);
  };
  
  const handlePointerUp = (e) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
      // Short click - activate tool with current sub-tool
      onToolSelect(currentSubToolDef.id);
    } else if (!hasMultipleSubTools) {
      // No sub-menu, just select the tool
      onToolSelect(currentSubToolDef.id);
    }
  };
  
  const handlePointerLeave = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };
  
  const handleContextMenu = (e) => {
    if (!hasMultipleSubTools) return;
    
    e.preventDefault();
    e.stopPropagation();
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    onSubMenuOpen(toolGroup.id);
  };
  
  const handleSubToolSelect = (subToolId) => {
    onSubToolSelect(toolGroup.id, subToolId);
    onToolSelect(subToolId);
  };
  
  return (
    <div className="dmt-tool-btn-container" style={{ position: 'relative', display: 'inline-block' }}>
      <button
        className={`dmt-tool-btn ${isActive ? 'dmt-tool-btn-active' : ''}`}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onContextMenu={handleContextMenu}
        title={currentSubToolDef?.title}
      >
        <dc.Icon icon={currentSubToolDef?.icon} />
        {hasMultipleSubTools && (
          <span className="dmt-subtool-indicator">▼</span>
        )}
      </button>
      
      {isSubMenuOpen && hasMultipleSubTools && (
        <SubMenuFlyout
          subTools={visibleSubTools}
          currentSubTool={currentSubTool}
          onSelect={handleSubToolSelect}
          onClose={onSubMenuClose}
        />
      )}
    </div>
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
  
  // Sub-menu state
  const [openSubMenu, setOpenSubMenu] = dc.useState(null);
  const [subToolSelections, setSubToolSelections] = dc.useState({
    draw: 'draw',           // 'draw' (cells) | 'edgeDraw' (edges)
    rectangle: 'rectangle'  // 'rectangle' (fill) | 'edgeLine'
  });
  
  // Tool groups with sub-tools
  const toolGroups = [
    {
      id: 'draw',
      subTools: [
        { id: 'draw', label: 'Paint Cells', title: 'Draw (fill cells)', icon: 'lucide-paintbrush' },
        { id: 'edgeDraw', label: 'Paint Edges', title: 'Paint Edges (grid lines)', icon: 'lucide-pencil-ruler', gridOnly: true }
      ]
    },
    {
      id: 'rectangle',
      subTools: [
        { id: 'rectangle', label: 'Fill Rectangle', title: 'Rectangle (click two corners)', icon: 'lucide-square', gridOnly: true },
        { id: 'edgeLine', label: 'Edge Line', title: 'Edge Line (click two points)', icon: 'lucide-git-commit-horizontal', gridOnly: true }
      ]
    }
  ];
  
  // Simple tools (no sub-menu)
  const simpleTools = [
    { id: 'select', title: 'Select/Move Text & Objects', icon: 'lucide-hand' },
    { id: 'erase', title: 'Erase (remove text/objects/cells/edges)', icon: 'lucide-eraser' },
    { id: 'circle', title: 'Circle (click edge, then center)', icon: 'lucide-circle', gridOnly: true },
    { id: 'clearArea', title: 'Clear Area (click two corners to erase)', icon: 'lucide-square-x', gridOnly: true },
    { id: 'addObject', title: 'Add Object (select from sidebar)', icon: 'lucide-map-pin-plus' },
    { id: 'addText', title: 'Add Text Label', icon: 'lucide-type' }
  ];
  
  // Filter simple tools for hex maps
  const visibleSimpleTools = mapType === 'hex'
    ? simpleTools.filter(tool => !tool.gridOnly)
    : simpleTools;
  
  const handleSubMenuOpen = (groupId) => {
    setOpenSubMenu(openSubMenu === groupId ? null : groupId);
  };
  
  const handleSubMenuClose = () => {
    setOpenSubMenu(null);
  };
  
  const handleSubToolSelect = (groupId, subToolId) => {
    setSubToolSelections(prev => ({
      ...prev,
      [groupId]: subToolId
    }));
  };
  
  const toggleColorPicker = (e) => {
    e.stopPropagation();
    onColorPickerOpenChange(!isColorPickerOpen);
  };
  
  const handleColorSelect = (color) => {
    onColorChange(color);
  };
  
  const handleColorReset = () => {
    onColorChange(DEFAULT_COLOR);
    onColorPickerOpenChange(false);
  };
  
  const handleCloseColorPicker = () => {
    onColorPickerOpenChange(false);
  };
  
  // Close sub-menu when clicking outside
  dc.useEffect(() => {
    if (openSubMenu) {
      const handleClickOutside = (e) => {
        const menuElement = e.target.closest('.dmt-subtool-menu');
        const buttonElement = e.target.closest('.dmt-tool-btn-container');
        
        if (!menuElement && !buttonElement) {
          handleSubMenuClose();
        }
      };
      
      setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('touchstart', handleClickOutside);
      }, 10);
      
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('touchstart', handleClickOutside);
      };
    }
  }, [openSubMenu]);
  
  // Close color picker when clicking outside
  dc.useEffect(() => {
    if (isColorPickerOpen) {
      const handleClickOutside = (e) => {
        const pickerElement = e.target.closest('.dmt-color-picker');
        const buttonElement = e.target.closest('.dmt-color-tool-btn');
        
        if (!pickerElement && !buttonElement) {
          if (pendingCustomColorRef.current) {
            onAddCustomColor(pendingCustomColorRef.current);
            onColorChange(pendingCustomColorRef.current);
            pendingCustomColorRef.current = null;
          }
          handleCloseColorPicker();
        }
      };
      
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
      
      {/* Select tool */}
      <button
        className={`dmt-tool-btn ${currentTool === 'select' ? 'dmt-tool-btn-active' : ''}`}
        onClick={() => onToolChange('select')}
        title="Select/Move Text & Objects"
      >
        <dc.Icon icon="lucide-hand" />
      </button>
      
      {/* Draw tool group (with sub-menu) */}
      <ToolButtonWithSubMenu
        toolGroup={toolGroups[0]}
        currentTool={currentTool}
        currentSubTool={subToolSelections.draw}
        isSubMenuOpen={openSubMenu === 'draw'}
        onToolSelect={onToolChange}
        onSubToolSelect={handleSubToolSelect}
        onSubMenuOpen={handleSubMenuOpen}
        onSubMenuClose={handleSubMenuClose}
        mapType={mapType}
      />
      
      {/* Color Picker Button */}
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <button
          ref={colorBtnRef}
          className={`dmt-tool-btn dmt-color-tool-btn ${isColorPickerOpen ? 'dmt-tool-btn-active' : ''}`}
          onClick={toggleColorPicker}
          title="Choose color"
          style={{
            borderBottom: `4px solid ${selectedColor || DEFAULT_COLOR}`
          }}
        >
          <dc.Icon icon="lucide-palette" />
        </button>
        
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
          title="Color"
        />
      </div>
      
      {/* Erase tool */}
      <button
        className={`dmt-tool-btn ${currentTool === 'erase' ? 'dmt-tool-btn-active' : ''}`}
        onClick={() => onToolChange('erase')}
        title="Erase (remove text/objects/cells/edges)"
      >
        <dc.Icon icon="lucide-eraser" />
      </button>
      
      {/* Rectangle tool group (with sub-menu) - grid only */}
      {mapType !== 'hex' && (
        <ToolButtonWithSubMenu
          toolGroup={toolGroups[1]}
          currentTool={currentTool}
          currentSubTool={subToolSelections.rectangle}
          isSubMenuOpen={openSubMenu === 'rectangle'}
          onToolSelect={onToolChange}
          onSubToolSelect={handleSubToolSelect}
          onSubMenuOpen={handleSubMenuOpen}
          onSubMenuClose={handleSubMenuClose}
          mapType={mapType}
        />
      )}
      
      {/* Remaining simple tools */}
      {visibleSimpleTools.filter(t => !['select', 'erase'].includes(t.id)).map(tool => (
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