const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

const {
  getNoteDisplayNames,
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

    const modal = new (class extends ModalClass {
      inputEl;
      submitted = false;

      onOpen() {
        const { contentEl, titleEl } = this;
        titleEl.setText(`Link Note to ${objectTypeLabel}`);

        const label = contentEl.createEl('label', { text: 'Note Name' });
        label.style.display = 'block';
        label.style.marginBottom = '6px';
        label.style.fontSize = '13px';
        label.style.color = 'var(--text-muted)';

        this.inputEl = contentEl.createEl('input', {
          type: 'text',
          placeholder: 'Type to search notes...',
          cls: 'dmt-modal-input'
        });
        this.inputEl.style.width = '100%';
        this.inputEl.style.marginBottom = '16px';

        const displayName = getDisplayNameFromPath(currentNotePath);
        if (displayName) {
          this.inputEl.value = displayName;
        }

        // Attach AbstractInputSuggest for autocomplete
        const inputEl = this.inputEl;
        new (class extends AbstractInputSuggestClass {
          async getSuggestions(query) {
            if (!noteCache) {
              try {
                noteCache = await getNoteDisplayNames();
              } catch {
                return [];
              }
            }
            if (!query) return noteCache.slice(0, 20);
            return noteCache
              .filter(name => fuzzyMatch(name, query))
              .map(name => ({ text: name, score: scoreMatch(name, query) }))
              .sort((a, b) => b.score - a.score)
              .slice(0, 10)
              .map(item => item.text);
          }

          renderSuggestion(note, el) {
            el.setText(note);
          }

          selectSuggestion(note) {
            inputEl.value = note;
            inputEl.dispatchEvent(new Event('input'));
            this.close();
          }
        })(app, this.inputEl);

        this.inputEl.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            this.submit();
          }
        });

        // Buttons
        const buttonContainer = contentEl.createEl('div', { cls: 'dmt-modal-buttons' });
        buttonContainer.style.display = 'flex';
        buttonContainer.style.justifyContent = 'flex-end';
        buttonContainer.style.gap = '8px';

        const cancelBtn = buttonContainer.createEl('button', {
          text: 'Cancel',
          cls: 'dmt-modal-btn dmt-modal-btn-cancel'
        });
        cancelBtn.addEventListener('click', () => this.close());

        if (currentNotePath) {
          const removeBtn = buttonContainer.createEl('button', {
            text: 'Remove Link',
            cls: 'dmt-modal-btn dmt-modal-btn-danger'
          });
          removeBtn.addEventListener('click', () => {
            this.submitted = true;
            onSave(null);
            this.close();
          });
        }

        const saveBtn = buttonContainer.createEl('button', {
          text: 'Save',
          cls: 'dmt-modal-btn dmt-modal-btn-submit'
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

        const fullPath = await getFullPathFromDisplayName(value);
        if (!fullPath) {
          onSave(value + '.md');
        } else {
          onSave(fullPath);
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
  const [isLoading, setIsLoading] = dc.useState(false);
  
  // Initialize input with current note display name
  dc.useEffect(() => {
    if (isOpen) {
      const displayName = getDisplayNameFromPath(currentNotePath);
      setNoteInput(displayName);
    }
  }, [isOpen, currentNotePath]);
  
  // Get suggestions callback for AutocompleteInput
  const getSuggestions = dc.useCallback(async (query) => {
    try {
      const allNotes = await getNoteDisplayNames();
      return allNotes;
    } catch (error) {
      console.error('[NoteLinkModal] Error getting suggestions:', error);
      return [];
    }
  }, []);
  
  const handleSave = dc.useCallback(async () => {
    setIsLoading(true);
    
    try {
      if (!noteInput.trim()) {
        // Empty input means remove link
        onSave(null);
        onClose();
        return;
      }
      
      // Convert display name back to full path
      const fullPath = await getFullPathFromDisplayName(noteInput);
      
      if (!fullPath) {
        console.warn('[NoteLinkModal] Note not found:', noteInput);
        // Still save what user typed - they might be creating a new note
        onSave(noteInput + '.md');
      } else {
        onSave(fullPath);
      }
      
      onClose();
    } catch (error) {
      console.error('[NoteLinkModal] Error saving note link:', error);
    } finally {
      setIsLoading(false);
    }
  }, [noteInput, onSave, onClose]);
  
  const handleRemove = dc.useCallback(() => {
    onSave(null);
    onClose();
  }, [onSave, onClose]);
  
  const handleCancel = dc.useCallback(() => {
    onClose();
  }, [onClose]);
  
  const handleInputChange = dc.useCallback((e) => {
    setNoteInput(e.target.value);
  }, []);
  
  // Get object type label for display
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
              onSelect={(value) => setNoteInput(value)}
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

  // Scroll selected item into view when navigating with keyboard only
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
        const allSuggestions = await getSuggestions(value);
        
        const matches = allSuggestions
          .filter(item => fuzzyMatch(item, value))
          .map(item => ({
            text: item,
            score: scoreMatch(item, value)
          }))
          .sort((a, b) => b.score - a.score)
          .slice(0, maxSuggestions)
          .map(item => item.text);

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
          selectSuggestion(suggestions[selectedIndex]);
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

  const selectSuggestion = (suggestion) => {
    justSelectedRef.current = true;
    setUserIsTyping(false);
    onChange({ target: { value: suggestion } });
    if (onSelect) onSelect(suggestion);
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
          {suggestions.map((suggestion, index) => (
            <div
              key={suggestion}
              ref={el => suggestionRefs.current[index] = el}
              onClick={() => selectSuggestion(suggestion)}
              onMouseEnter={() => setSelectedIndex(index)}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                backgroundColor: index === selectedIndex 
                  ? 'var(--background-modifier-hover)' 
                  : 'transparent',
                fontSize: '14px',
                color: 'var(--text-normal)',
                fontFamily: 'var(--font-monospace)'
              }}
            >
              {suggestion}
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