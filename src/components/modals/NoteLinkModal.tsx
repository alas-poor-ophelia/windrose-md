








/**
 * Opens a native Obsidian Modal for note linking.
 * Uses AbstractInputSuggest for autocomplete.
 * Returns true if native modal opened, false to fall back to Preact.
 */

import type { JSX, VNode } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { getNoteEntries, getFullPathFromDisplayName, getDisplayNameFromPath } from '../../persistence/noteOperations';
import { getObjectType } from '../../objects/objectTypeResolver';
import { Modal, Setting, AbstractInputSuggest } from 'obsidian';
import type { App, SearchComponent } from 'obsidian';
import type { NoteIndexEntry } from '#types/objects/note.types';

interface NoteLinkSuggestion extends NoteIndexEntry {
  score: number;
}

interface OpenNativeNoteLinkModalOptions {
  onSave: (notePath: string | null) => void;
  onClose: () => void;
  currentNotePath?: string | null;
  objectType?: string | null;
}

function openNativeNoteLinkModal(app: App, options: OpenNativeNoteLinkModalOptions): boolean {
  try {
    const ModalClass = Modal;
    const SettingClass = Setting;
    const AbstractInputSuggestClass = AbstractInputSuggest as unknown as new (app: App, inputEl: HTMLInputElement) => AbstractInputSuggest<NoteLinkSuggestion>;

    const {
      onSave,
      onClose,
      currentNotePath = null,
      objectType = null
    } = options;

    const objectTypeLabel = ((): string => {
      if (objectType == null || objectType === '') return 'Object';
      const type = getObjectType(objectType);
      return type != null ? type.label : 'Object';
    })();

    let noteCache: NoteIndexEntry[] | null = null;
    let selectedPath: string | null = null;

    const modal = new (class extends ModalClass {
      inputEl!: HTMLInputElement;
      submitted = false;

      onOpen(): void {
        const { contentEl, titleEl } = this;
        titleEl.setText(`Link Note to ${objectTypeLabel}`);

        const displayName = getDisplayNameFromPath(currentNotePath);

        let searchComponent: SearchComponent | null = null;
        new SettingClass(contentEl)
          .setName('Note name')
          .addSearch(search => {
            searchComponent = search;
            search.setPlaceholder('Type to search notes...');
            if (displayName !== '') {
              search.setValue(displayName);
            }
          });

        this.inputEl = (searchComponent as SearchComponent).inputEl;

        this.inputEl.addEventListener('input', () => {
          selectedPath = null;
        });

        const inputEl = this.inputEl;
        const modalRef = this;
        new (class extends AbstractInputSuggestClass {
          constructor(app: App, inputEl: HTMLInputElement) { super(app, inputEl); }
          async getSuggestions(query: string): Promise<NoteLinkSuggestion[]> {
            if (!noteCache) {
              try {
                noteCache = await getNoteEntries();
              } catch {
                return [];
              }
            }
            if (!query) return [];
            return noteCache
              .filter((entry: NoteIndexEntry) => fuzzyMatch(entry.displayName, query))
              .map((entry: NoteIndexEntry) => ({ ...entry, score: scoreMatch(entry.displayName, query) }))
              .sort((a: NoteLinkSuggestion, b: NoteLinkSuggestion) => b.score - a.score)
              .slice(0, 10);
          }

          renderSuggestion(entry: NoteLinkSuggestion, el: HTMLElement): void {
            el.createDiv({ text: entry.displayName, cls: 'dmt-note-suggest-name' });
            if (entry.subtitle != null && entry.subtitle !== '') {
              el.createDiv({ text: entry.subtitle, cls: 'dmt-note-suggest-path' });
            }
          }

          selectSuggestion(entry: NoteLinkSuggestion): void {
            inputEl.value = entry.displayName;
            inputEl.dispatchEvent(new Event('input'));
            selectedPath = entry.path;
            this.close();
            void modalRef.submit();
          }
        })(app, this.inputEl);

        this.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void this.submit();
          }
        });

        const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });

        const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
        cancelBtn.addEventListener('click', () => this.close());

        const createBtn = buttonContainer.createEl('button', { text: 'Create note' });
        createBtn.addEventListener('click', () => {
          this.submitted = true;
          this.close();
          app.commands.executeCommandById('file-explorer:new-file');
        });

        if (currentNotePath != null && currentNotePath !== '') {
          const removeBtn = buttonContainer.createEl('button', {
            text: 'Remove link',
            cls: 'mod-warning'
          });
          removeBtn.addEventListener('click', () => {
            this.submitted = true;
            onSave(null);
            this.close();
          });
        }

        const saveBtn = buttonContainer.createEl('button', {
          text: 'Save',
          cls: 'mod-cta'
        });
        saveBtn.addEventListener('click', () => this.submit());

        setTimeout(() => {
          this.inputEl.focus();
          if (displayName !== '') this.inputEl.select();
        }, 0);
      }

      async submit(): Promise<void> {
        const value = this.inputEl.value.trim();
        this.submitted = true;

        if (value === '') {
          onSave(null);
          this.close();
          return;
        }

        if (selectedPath != null && selectedPath !== '') {
          onSave(selectedPath);
        } else {
          const fullPath = await getFullPathFromDisplayName(value);
          onSave((fullPath != null && fullPath !== '') ? fullPath : value + '.md');
        }
        this.close();
      }

      onClose(): void {
        if (!this.submitted) {
          onClose();
        }
        this.contentEl.empty();
      }
    })(app);

    modal.open();
    return true;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[Windrose] Failed to open native NoteLinkModal, falling back to Preact:', (e as Error).message);
    return false;
  }
}

/**
 * Modal for linking notes to objects
 * Similar structure to TextLabelEditor
 */
interface NoteLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (notePath: string | null) => void;
  currentNotePath?: string | null;
  objectType?: string | null;
}

function NoteLinkModal({
  isOpen,
  onClose,
  onSave,
  currentNotePath = null,
  objectType = null
}: NoteLinkModalProps): VNode | null {
  const [noteInput, setNoteInput] = useState('');
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const displayName = getDisplayNameFromPath(currentNotePath);
      setNoteInput(displayName);
      setSelectedPath(currentNotePath ?? null);
    }
  }, [isOpen, currentNotePath]);

  const getSuggestions = useCallback(async (_query: string): Promise<NoteIndexEntry[]> => {
    try {
      return await getNoteEntries();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[NoteLinkModal] Error getting suggestions:', error);
      return [];
    }
  }, []);

  const handleSave = useCallback(async () => {
    setIsLoading(true);

    try {
      if (!noteInput.trim()) {
        onSave(null);
        onClose();
        return;
      }

      if (selectedPath != null && selectedPath !== '') {
        onSave(selectedPath);
      } else {
        const fullPath = await getFullPathFromDisplayName(noteInput);
        onSave((fullPath != null && fullPath !== '') ? fullPath : noteInput + '.md');
      }

      onClose();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[NoteLinkModal] Error saving note link:', error);
    } finally {
      setIsLoading(false);
    }
  }, [noteInput, selectedPath, onSave, onClose]);

  const handleRemove = useCallback(() => {
    onSave(null);
    onClose();
  }, [onSave, onClose]);

  const handleCancel = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleInputChange = useCallback((e: { target: { value: string } }) => {
    setNoteInput(e.target.value);
    setSelectedPath(null);
  }, []);

  const handleCreateNote = useCallback(() => {
    onClose();
    app.commands.executeCommandById('file-explorer:new-file');
  }, [onClose]);

  const objectTypeLabel = useMemo((): string => {
    if (objectType == null || objectType === '') return 'Object';
    const type = getObjectType(objectType);
    return type != null ? type.label : 'Object';
  }, [objectType]);

  if (!isOpen) return null;

  return (
    <div class="dmt-modal-overlay" onClick={handleCancel}>
      <div class="dmt-modal-content" onClick={(e) => e.stopPropagation()}>
        <div class="dmt-modal-header">
          <h3>Link Note to {objectTypeLabel}</h3>
        </div>

        <div class="dmt-modal-body">
          <div class="dmt-form-group">
            <label class="dmt-form-label">Note Name</label>
            <AutocompleteInput
              value={noteInput}
              onChange={handleInputChange}
              onSelect={(entry: NoteIndexEntry) => {
                setNoteInput(entry.displayName);
                setSelectedPath(entry.path);
              }}
              placeholder="Type to search notes..."
              disabled={isLoading}
              getSuggestions={getSuggestions}
              maxSuggestions={10}
            />
          </div>
        </div>

        <div class="dmt-modal-footer">
          <button
            class="dmt-modal-btn dmt-modal-btn-cancel"
            onClick={handleCancel}
            disabled={isLoading}
          >
            Cancel
          </button>

          <button
            class="dmt-modal-btn"
            onClick={handleCreateNote}
            disabled={isLoading}
          >
            Create Note
          </button>

          {currentNotePath != null && currentNotePath !== '' && (
            <button
              class="dmt-modal-btn dmt-modal-btn-danger"
              onClick={handleRemove}
              disabled={isLoading}
            >
              Remove Link
            </button>
          )}

          <button
            class="dmt-modal-btn dmt-modal-btn-submit"
            onClick={handleSave}
            disabled={isLoading}
          >
            {isLoading ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function fuzzyMatch(text: string, query: string): boolean {
  if (query === '') return true;
  
  const textLower = text.toLowerCase();
  const queryLower = query.toLowerCase();
  
  let queryIndex = 0;
  for (let i = 0; i < textLower.length && queryIndex < queryLower.length; i++) {
    if (textLower[i] === queryLower[queryIndex]) {
      queryIndex++;
    }
  }
  return queryIndex === queryLower.length;
}

function scoreMatch(text: string, query: string): number {
  if (query === '') return 0;
  
  const textLower = text.toLowerCase();
  const queryLower = query.toLowerCase();
  
  if (textLower === queryLower) return 1000;
  if (textLower.startsWith(queryLower)) return 500;
  if (textLower.includes(queryLower)) return 250;
  return 100;
}

interface AutocompleteInputProps {
  value: string;
  onChange: (e: { target: { value: string } }) => void;
  onSelect?: (entry: NoteIndexEntry) => void;
  placeholder?: string;
  disabled?: boolean;
  getSuggestions: (query: string) => Promise<NoteIndexEntry[]>;
  maxSuggestions?: number;
}

function AutocompleteInput({
  value,
  onChange,
  onSelect,
  placeholder,
  disabled,
  getSuggestions,
  maxSuggestions = 10
}: AutocompleteInputProps): VNode {
  const [suggestions, setSuggestions] = useState<NoteLinkSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [userIsTyping, setUserIsTyping] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const justSelectedRef = useRef(false);
  const suggestionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const isKeyboardNavRef = useRef(false);

  useEffect(() => {
    if (selectedIndex >= 0 && suggestionRefs.current[selectedIndex] && isKeyboardNavRef.current) {
      const element = suggestionRefs.current[selectedIndex];
      const container = element?.parentElement;
      if (container) {
        const elementTop = element.offsetTop;
        const elementBottom = elementTop + element.offsetHeight;
        const containerTop = container.scrollTop;
        const containerBottom = containerTop + container.clientHeight;

        if (elementTop < containerTop) {
          container.scrollTop = elementTop;
        } else if (elementBottom > containerBottom) {
          container.scrollTop = elementBottom - container.clientHeight;
        }
      }
      isKeyboardNavRef.current = false;
    }
  }, [selectedIndex]);

  useEffect(() => {
    const loadSuggestions = async (): Promise<void> => {
      if (value === '' || value.length < 1) {
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }

      if (justSelectedRef.current) {
        justSelectedRef.current = false;
        return;
      }

      setIsLoading(true);

      try {
        const allEntries = await getSuggestions(value);

        const matches: NoteLinkSuggestion[] = allEntries
          .filter((entry: NoteIndexEntry) => fuzzyMatch(entry.displayName, value))
          .map((entry: NoteIndexEntry) => ({
            ...entry,
            score: scoreMatch(entry.displayName, value)
          }))
          .sort((a: NoteLinkSuggestion, b: NoteLinkSuggestion) => b.score - a.score)
          .slice(0, maxSuggestions);

        setSuggestions(matches);

        if (userIsTyping) {
          setShowSuggestions(matches.length > 0);
        }

        if (matches.length > 0 && selectedIndex >= matches.length) {
          setSelectedIndex(matches.length - 1);
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error loading suggestions:', error);
        setSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    };

    void loadSuggestions();
  }, [value, getSuggestions, maxSuggestions, userIsTyping]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
        setSelectedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (e: JSX.TargetedEvent<HTMLInputElement>): void => {
    setUserIsTyping(true);
    onChange({ target: { value: (e.target as HTMLInputElement).value } });
  };

  const handleKeyDown = (e: KeyboardEvent): void => {
    if (!showSuggestions || suggestions.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        isKeyboardNavRef.current = true;
        setSelectedIndex(prev =>
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;

      case 'ArrowUp':
        e.preventDefault();
        isKeyboardNavRef.current = true;
        setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
        break;

      case 'Enter':
        if (selectedIndex >= 0) {
          e.preventDefault();
          selectEntry(suggestions[selectedIndex]);
        }
        break;

      case 'Escape':
        e.preventDefault();
        setShowSuggestions(false);
        setUserIsTyping(false);
        setSelectedIndex(-1);
        break;
    }
  };

  const selectEntry = (entry: NoteIndexEntry): void => {
    justSelectedRef.current = true;
    setUserIsTyping(false);
    onChange({ target: { value: entry.displayName } });
    if (onSelect) onSelect(entry);
    setShowSuggestions(false);
    setSelectedIndex(-1);
  };

  const handleFocus = (): void => {
    if (value && suggestions.length > 0 && userIsTyping) {
      setShowSuggestions(true);
    }
  };

  const handleBlur = (): void => {
    setTimeout(() => {
      setUserIsTyping(false);
    }, 200);
  };

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        style={{
          width: '100%',
          padding: '10px 12px',
          fontSize: '14px',
          backgroundColor: 'var(--background-primary-alt)',
          color: 'var(--text-normal)',
          border: '1px solid var(--background-modifier-border)',
          borderRadius: '4px',
          boxSizing: 'border-box'
        }}
      />

      {showSuggestions && suggestions.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          marginTop: '4px',
          backgroundColor: 'var(--background-primary)',
          border: '1px solid var(--background-modifier-border)',
          borderRadius: '4px',
          maxHeight: '200px',
          overflowY: 'auto',
          zIndex: 1000,
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
        }}>
          {suggestions.map((entry, index) => (
            <div
              key={entry.path}
              ref={(el) => { suggestionRefs.current[index] = el; }}
              onClick={() => selectEntry(entry)}
              onMouseEnter={() => setSelectedIndex(index)}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                backgroundColor: index === selectedIndex
                  ? 'var(--background-modifier-hover)'
                  : 'transparent'
              }}
            >
              <div style={{
                fontSize: '14px',
                color: 'var(--text-normal)'
              }}>
                {entry.displayName}
              </div>
              {entry.subtitle != null && entry.subtitle !== '' && (
                <div style={{
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                  marginTop: '2px'
                }}>
                  {entry.subtitle}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {isLoading && (
        <div style={{
          position: 'absolute',
          right: '12px',
          top: '50%',
          transform: 'translateY(-50%)',
          fontSize: '12px',
          color: 'var(--text-muted)'
        }}>
          Loading...
        </div>
      )}
    </div>
  );
}

export { NoteLinkModal, openNativeNoteLinkModal };