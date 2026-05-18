const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

const {
  getNoteEntries,
  getFullPathFromDisplayName,
  getDisplayNameFromPath
} = await requireModuleByName("noteOperations.ts");

const { getObjectType } = await requireModuleByName("objectTypeResolver.ts");

const { isBridgeAvailable, getObsidianModule } = await requireModuleByName("obsidianBridge.ts");

/**
 * Opens a native Obsidian Modal for note linking.
 * Uses AbstractInputSuggest for autocomplete.
 * Returns true if native modal opened, false to fall back to Preact.
 */
function openNativeNoteLinkModal(options) {
  if (!isBridgeAvailable()) return false;

  try {
    const obs = getObsidianModule();
    const ModalClass = obs.Modal;
    const SettingClass = obs.Setting;
    const AbstractInputSuggestClass = obs.AbstractInputSuggest;
    const app = dc.app;

    const {
      onSave,
      onClose,
      currentNotePath = null,
      objectType = null
    } = options;

    const objectTypeLabel = (() => {
      if (!objectType) return 'Object';
      const type = getObjectType(objectType);
      return type ? type.label : 'Object';
    })();

    let noteCache = null;
    let selectedPath = null;

    const modal = new (class extends ModalClass {
      inputEl;
      submitted = false;

      onOpen() {
        const { contentEl, titleEl } = this;
        titleEl.setText(`Link Note to ${objectTypeLabel}`);

        const displayName = getDisplayNameFromPath(currentNotePath);

        let searchComponent = null;
        new SettingClass(contentEl)
          .setName('Note Name')
          .addSearch(search => {
            searchComponent = search;
            search.setPlaceholder('Type to search notes...');
            if (displayName) {
              search.setValue(displayName);
            }
          });

        this.inputEl = searchComponent.inputEl;

        this.inputEl.addEventListener('input', () => {
          selectedPath = null;
        });

        const inputEl = this.inputEl;
        const modalRef = this;
        new (class extends AbstractInputSuggestClass {
          async getSuggestions(query) {
            if (!noteCache) {
              try {
                noteCache = await getNoteEntries();
              } catch {
                return [];
              }
            }
            if (!query) return [];
            return noteCache
              .filter(entry => fuzzyMatch(entry.displayName, query))
              .map(entry => ({ ...entry, score: scoreMatch(entry.displayName, query) }))
              .sort((a, b) => b.score - a.score)
              .slice(0, 10);
          }

          renderSuggestion(entry, el) {
            el.createDiv({ text: entry.displayName, cls: 'dmt-note-suggest-name' });
            if (entry.subtitle) {
              el.createDiv({ text: entry.subtitle, cls: 'dmt-note-suggest-path' });
            }
          }

          selectSuggestion(entry) {
            inputEl.value = entry.displayName;
            inputEl.dispatchEvent(new Event('input'));
            selectedPath = entry.path;
            this.close();
            modalRef.submit();
          }
        })(app, this.inputEl);

        this.inputEl.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            this.submit();
          }
        });

        const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });

        const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
        cancelBtn.addEventListener('click', () => this.close());

        const createBtn = buttonContainer.createEl('button', { text: 'Create Note' });
        createBtn.addEventListener('click', () => {
          this.submitted = true;
          this.close();
          app.commands.executeCommandById('file-explorer:new-file');
        });

        if (currentNotePath) {
          const removeBtn = buttonContainer.createEl('button', {
            text: 'Remove Link',
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
          if (displayName) this.inputEl.select();
        }, 0);
      }

      async submit() {
        const value = this.inputEl.value.trim();
        this.submitted = true;

        if (!value) {
          onSave(null);
          this.close();
          return;
        }

        if (selectedPath) {
          onSave(selectedPath);
        } else {
          const fullPath = await getFullPathFromDisplayName(value);
          onSave(fullPath || value + '.md');
        }
        this.close();
      }

      onClose() {
        if (!this.submitted) {
          onClose();
        }
        this.contentEl.empty();
      }
    })(app);

    modal.open();
    return true;
  } catch (e) {
    console.warn('[Windrose] Failed to open native NoteLinkModal, falling back to Preact:', e.message);
    return false;
  }
}

/**
 * Modal for linking notes to objects
 * Similar structure to TextLabelEditor
 */
function NoteLinkModal({
  isOpen,
  onClose,
  onSave,
  currentNotePath = null,
  objectType = null
}) {
  const [noteInput, setNoteInput] = dc.useState('');
  const [selectedPath, setSelectedPath] = dc.useState(null);
  const [isLoading, setIsLoading] = dc.useState(false);

  dc.useEffect(() => {
    if (isOpen) {
      const displayName = getDisplayNameFromPath(currentNotePath);
      setNoteInput(displayName);
      setSelectedPath(currentNotePath || null);
    }
  }, [isOpen, currentNotePath]);

  const getSuggestions = dc.useCallback(async (query) => {
    try {
      return await getNoteEntries();
    } catch (error) {
      console.error('[NoteLinkModal] Error getting suggestions:', error);
      return [];
    }
  }, []);

  const handleSave = dc.useCallback(async () => {
    setIsLoading(true);

    try {
      if (!noteInput.trim()) {
        onSave(null);
        onClose();
        return;
      }

      if (selectedPath) {
        onSave(selectedPath);
      } else {
        const fullPath = await getFullPathFromDisplayName(noteInput);
        onSave(fullPath || noteInput + '.md');
      }

      onClose();
    } catch (error) {
      console.error('[NoteLinkModal] Error saving note link:', error);
    } finally {
      setIsLoading(false);
    }
  }, [noteInput, selectedPath, onSave, onClose]);

  const handleRemove = dc.useCallback(() => {
    onSave(null);
    onClose();
  }, [onSave, onClose]);

  const handleCancel = dc.useCallback(() => {
    onClose();
  }, [onClose]);

  const handleInputChange = dc.useCallback((e) => {
    setNoteInput(e.target.value);
    setSelectedPath(null);
  }, []);

  const handleCreateNote = dc.useCallback(() => {
    onClose();
    dc.app.commands.executeCommandById('file-explorer:new-file');
  }, [onClose]);

  const objectTypeLabel = dc.useMemo(() => {
    if (!objectType) return 'Object';
    const type = getObjectType(objectType);
    return type ? type.label : 'Object';
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
              onSelect={(entry) => {
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

          {currentNotePath && (
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

function fuzzyMatch(text, query) {
  if (!query) return true;
  
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

function scoreMatch(text, query) {
  if (!query) return 0;
  
  const textLower = text.toLowerCase();
  const queryLower = query.toLowerCase();
  
  if (textLower === queryLower) return 1000;
  if (textLower.startsWith(queryLower)) return 500;
  if (textLower.includes(queryLower)) return 250;
  return 100;
}

function AutocompleteInput({
  value,
  onChange,
  onSelect,
  placeholder,
  disabled,
  getSuggestions,
  maxSuggestions = 10
}) {
  const [suggestions, setSuggestions] = dc.useState([]);
  const [showSuggestions, setShowSuggestions] = dc.useState(false);
  const [selectedIndex, setSelectedIndex] = dc.useState(-1);
  const [isLoading, setIsLoading] = dc.useState(false);
  const [userIsTyping, setUserIsTyping] = dc.useState(false);

  const containerRef = dc.useRef(null);
  const inputRef = dc.useRef(null);
  const justSelectedRef = dc.useRef(false);
  const suggestionRefs = dc.useRef([]);
  const isKeyboardNavRef = dc.useRef(false);

  dc.useEffect(() => {
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

  dc.useEffect(() => {
    const loadSuggestions = async () => {
      if (!value || value.length < 1) {
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

        const matches = allEntries
          .filter(entry => fuzzyMatch(entry.displayName, value))
          .map(entry => ({
            ...entry,
            score: scoreMatch(entry.displayName, value)
          }))
          .sort((a, b) => b.score - a.score)
          .slice(0, maxSuggestions);

        setSuggestions(matches);

        if (userIsTyping) {
          setShowSuggestions(matches.length > 0);
        }

        if (matches.length > 0 && selectedIndex >= matches.length) {
          setSelectedIndex(matches.length - 1);
        }
      } catch (error) {
        console.error('Error loading suggestions:', error);
        setSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadSuggestions();
  }, [value, getSuggestions, maxSuggestions, userIsTyping]);

  dc.useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setShowSuggestions(false);
        setSelectedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (e) => {
    setUserIsTyping(true);
    onChange(e);
  };

  const handleKeyDown = (e) => {
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

  const selectEntry = (entry) => {
    justSelectedRef.current = true;
    setUserIsTyping(false);
    onChange({ target: { value: entry.displayName } });
    if (onSelect) onSelect(entry);
    setShowSuggestions(false);
    setSelectedIndex(-1);
  };

  const handleFocus = () => {
    if (value && suggestions.length > 0 && userIsTyping) {
      setShowSuggestions(true);
    }
  };

  const handleBlur = () => {
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
              ref={el => suggestionRefs.current[index] = el}
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
              {entry.subtitle && (
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

return { NoteLinkModal, openNativeNoteLinkModal };