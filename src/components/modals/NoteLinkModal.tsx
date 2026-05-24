/**
 * NoteLinkModal.tsx
 *
 * Native Obsidian Modal for linking notes to map objects.
 * Uses AbstractInputSuggest for autocomplete.
 */




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

    const modal = new (class extends Modal {
      inputEl!: HTMLInputElement;
      submitted = false;

      onOpen(): void {
        const { contentEl, titleEl } = this;
        titleEl.setText(`Link Note to ${objectTypeLabel}`);

        const displayName = getDisplayNameFromPath(currentNotePath);

        let searchComponent: SearchComponent | null = null;
        new Setting(contentEl)
          .setName('Note name')
          .addSearch(search => {
            searchComponent = search;
            search.setPlaceholder('Type to search notes...');
            if (displayName !== '') {
              search.setValue(displayName);
            }
          });

        this.inputEl = searchComponent!.inputEl;

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
            el.createDiv({ text: entry.displayName, cls: 'windrose-note-suggest-name' });
            if (entry.subtitle != null && entry.subtitle !== '') {
              el.createDiv({ text: entry.subtitle, cls: 'windrose-note-suggest-path' });
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
    console.warn('[Windrose] Failed to open native NoteLinkModal:', (e as Error).message);
    return false;
  }
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

export { openNativeNoteLinkModal };