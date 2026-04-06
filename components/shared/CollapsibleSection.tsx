/**
 * CollapsibleSection.tsx
 *
 * A reusable collapsible section component for settings panels.
 * Provides consistent styling and behavior for collapsible content.
 */

/** Props for CollapsibleSection component */
export interface CollapsibleSectionProps {
  /** Section title */
  title: string;
  /** Whether section starts expanded (uncontrolled mode) */
  defaultOpen?: boolean;
  /** Controlled open state (optional) */
  isOpen?: boolean;
  /** Callback when toggled (optional, for controlled mode) */
  onToggle?: (isOpen: boolean) => void;
  /** Section content */
  children: React.ReactNode;
  /** Optional subtitle text */
  subtitle?: string;
}

/**
 * Collapsible section with header and toggle.
 * Supports both controlled and uncontrolled modes.
 */
function CollapsibleSection({
  title,
  defaultOpen = true,
  isOpen: controlledIsOpen,
  onToggle,
  children,
  subtitle
}: CollapsibleSectionProps): React.ReactElement {
  const [internalIsOpen, setInternalIsOpen] = dc.useState(defaultOpen);

  const isControlled = controlledIsOpen !== undefined;
  const isOpen = isControlled ? controlledIsOpen : internalIsOpen;

  const handleToggle = (): void => {
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
        <span style={{
          width: '16px',
          height: '16px',
          color: 'var(--text-muted)',
          transition: 'transform 0.15s ease',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <dc.Icon icon={isOpen ? 'lucide-chevron-down' : 'lucide-chevron-right'} />
        </span>
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
