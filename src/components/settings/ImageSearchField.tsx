/**
 * ImageSearchField.tsx
 *
 * Shared image-search input with clear button and autocomplete dropdown.
 * Used by the appearance/background image sections for grid and hex maps.
 */

import type { VNode } from 'preact';

import { Z_INDEX } from '../../core/dmtConstants';

interface ImageSearchFieldProps {
  value: string;
  placeholder: string;
  onSearch: (value: string) => void;
  showClear: boolean;
  onClear: () => void;
  results: string[];
  onSelect: (name: string) => void;
  disabled?: boolean;
  clearGlyph?: string;
}

function ImageSearchField({
  value,
  placeholder,
  onSearch,
  showClear,
  onClear,
  results,
  onSelect,
  disabled = false,
  clearGlyph = '×'
}: ImageSearchFieldProps): VNode {
  return (
    <div style={{ position: 'relative' }}>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(e: Event) => {
          if (disabled) return;
          onSearch((e.target as HTMLInputElement).value);
        }}
        style={{
          width: '100%',
          padding: '8px 32px 8px 10px',
          borderRadius: '4px',
          border: '1px solid var(--background-modifier-border)',
          background: 'var(--background-primary)',
          color: 'var(--text-normal)',
          fontSize: '14px',
          cursor: disabled ? 'not-allowed' : 'text'
        }}
      />

      {showClear && !disabled && (
        <button
          onClick={onClear}
          style={{
            position: 'absolute',
            right: '6px',
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: '4px',
            fontSize: '16px',
            lineHeight: '1'
          }}
          title="Clear image"
        >
          {clearGlyph}
        </button>
      )}

      {results.length > 0 && !disabled && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          maxHeight: '200px',
          overflowY: 'auto',
          background: 'var(--background-primary)',
          border: '1px solid var(--background-modifier-border)',
          borderRadius: '4px',
          marginTop: '2px',
          zIndex: Z_INDEX.INTERACTIVE_LAYER,
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
        }}>
          {results.map((name: string, idx: number) => (
            <div
              key={idx}
              onClick={() => onSelect(name)}
              style={{
                padding: '8px 10px',
                cursor: 'pointer',
                fontSize: '13px',
                borderBottom: idx < results.length - 1 ? '1px solid var(--background-modifier-border)' : 'none'
              }}
              onMouseEnter={(e: MouseEvent) => (e.currentTarget as HTMLElement).classList.add('windrose-dropdown-item-hover')}
              onMouseLeave={(e: MouseEvent) => (e.currentTarget as HTMLElement).classList.remove('windrose-dropdown-item-hover')}
            >
              {name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export { ImageSearchField };
