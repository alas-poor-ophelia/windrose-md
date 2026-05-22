import { setIcon } from 'obsidian';

const ICON_FALLBACKS: Record<string, string> = {
  'pencil': '✎',
  'eye': '👁',
  'eye-off': '🚫',
  'rotate-ccw': '↺',
  'trash-2': '🗑',
  'grip-vertical': '⋮⋮',
  'x': '✕',
  'search': '🔍'
};

export const IconHelpers = {
  set(el: HTMLElement, iconId: string): void {
    if (typeof setIcon !== 'undefined') {
      setIcon(el, iconId);
    } else {
      el.textContent = ICON_FALLBACKS[iconId] || '?';
    }
  }
};
