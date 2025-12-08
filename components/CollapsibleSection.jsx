/**
 * CollapsibleSection.jsx
 * 
 * A reusable collapsible section component for settings panels.
 * Provides consistent styling and behavior for collapsible content.
 */

/**
 * Collapsible section with header and toggle
 * @param {Object} props
 * @param {string} props.title - Section title
 * @param {boolean} props.defaultOpen - Whether section starts expanded
 * @param {boolean} [props.isOpen] - Controlled open state (optional)
 * @param {function} [props.onToggle] - Callback when toggled (optional)
 * @param {React.ReactNode} props.children - Section content
 * @param {string} [props.subtitle] - Optional subtitle text
 */
function CollapsibleSection({ 
  title, 
  defaultOpen = true, 
  isOpen: controlledIsOpen, 
  onToggle,
  children, 
  subtitle 
}) {
  // Support both controlled and uncontrolled modes
  const [internalIsOpen, setInternalIsOpen] = dc.useState(defaultOpen);
  
  const isControlled = controlledIsOpen !== undefined;
  const isOpen = isControlled ? controlledIsOpen : internalIsOpen;
  
  const handleToggle = () => {
    if (isControlled && onToggle) {
      onToggle(!isOpen);
    } else {
      setInternalIsOpen(!isOpen);
    }
  };
  
  return (
    <div class="dmt-collapsible-section" style={{
      borderBottom: '1px solid var(--background-modifier-border)',
      marginBottom: '12px'
    }}>
      <button
        type="button"
        onClick={handleToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          width: '100%',
          padding: '12px 0',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          color: 'var(--text-normal)'
        }}
      >
        <dc.Icon 
          icon={isOpen ? 'lucide-chevron-down' : 'lucide-chevron-right'} 
          style={{ 
            width: '16px', 
            height: '16px',
            color: 'var(--text-muted)',
            transition: 'transform 0.15s ease'
          }} 
        />
        <div style={{ flex: 1 }}>
          <span style={{ 
            fontSize: '14px', 
            fontWeight: '600',
            color: 'var(--text-normal)'
          }}>
            {title}
          </span>
          {subtitle && (
            <span style={{ 
              fontSize: '12px', 
              color: 'var(--text-muted)',
              marginLeft: '8px',
              fontWeight: 'normal'
            }}>
              {subtitle}
            </span>
          )}
        </div>
      </button>
      
      {isOpen && (
        <div style={{ 
          paddingTop: '8px',
          paddingBottom: '16px',
          paddingLeft: '24px'
        }}>
          {children}
        </div>
      )}
    </div>
  );
}

return { CollapsibleSection };