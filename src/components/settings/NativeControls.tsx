/**
 * NativeControls.tsx
 *
 * Native Obsidian control wrappers for use inside SettingItem.
 * Each wrapper creates the Obsidian component imperatively and
 * falls back to standard HTML controls when bridge is unavailable.
 */

import { h } from 'preact';






// ─── NativeToggle ───────────────────────────────────────────────


import { useEffect, useRef } from 'preact/hooks';
import { Setting } from 'obsidian';
import type { ToggleComponent, DropdownComponent, SliderComponent } from 'obsidian';
interface NativeToggleProps {
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}

function NativeToggle({ value, onChange, disabled }: NativeToggleProps): h.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<ToggleComponent | null>(null);

  // Store latest onChange in ref to avoid recreating toggle
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect((): (() => void) | undefined => {
    if (!containerRef.current) return undefined;

    try {
      // Create a temporary setting to extract its toggle component
      const tempContainer = activeDocument.createElement('div');
      const setting = new Setting(tempContainer);
      let toggleInstance: ToggleComponent | null = null;

      setting.addToggle((toggle: ToggleComponent) => {
        toggleInstance = toggle;
        toggle.setValue(value);
        toggle.onChange((newVal: boolean) => onChangeRef.current(newVal));
        if (disabled === true) {
          toggle.setDisabled(true);
        }
      });

      // Move just the toggle element into our container
      if (toggleInstance != null && setting.controlEl.firstChild) {
        containerRef.current.appendChild(setting.controlEl.firstChild);
      }

      toggleRef.current = toggleInstance;

      const containerEl = containerRef.current;
      return () => {
        containerEl.innerHTML = '';
      };
    } catch {
      // Fallback will render
      return undefined;
    }
  }, []);

  // Update value without recreating
  useEffect(() => {
    if (toggleRef.current) {
      toggleRef.current.setValue(value);
    }
  }, [value]);

  // Update disabled state without recreating
  useEffect(() => {
    if (toggleRef.current != null) {
      toggleRef.current.setDisabled(disabled === true);
    }
  }, [disabled]);

  return h('div', { ref: containerRef });
}

// ─── NativeDropdown ─────────────────────────────────────────────

interface NativeDropdownOption {
  value: string;
  label: string;
}

interface NativeDropdownProps {
  value: string;
  options: NativeDropdownOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
}

function NativeDropdown({ value, options, onChange, disabled }: NativeDropdownProps): h.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<DropdownComponent | null>(null);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect((): (() => void) | undefined => {
    if (!containerRef.current) return undefined;

    try {
      const tempContainer = activeDocument.createElement('div');
      const setting = new Setting(tempContainer);
      let dropdownInstance: DropdownComponent | null = null;

      setting.addDropdown((dropdown: DropdownComponent) => {
        dropdownInstance = dropdown;
        for (const opt of options) {
          dropdown.addOption(opt.value, opt.label);
        }
        dropdown.setValue(value);
        dropdown.onChange((newVal: string) => onChangeRef.current(newVal));
        if (disabled === true) {
          dropdown.setDisabled(true);
        }
      });

      if (dropdownInstance != null && setting.controlEl.firstChild) {
        containerRef.current.appendChild(setting.controlEl.firstChild);
      }

      dropdownRef.current = dropdownInstance;

      const containerEl = containerRef.current;
      return () => {
        containerEl.innerHTML = '';
      };
    } catch {
      // Fallback will render
      return undefined;
    }
  }, []);

  useEffect(() => {
    if (dropdownRef.current) {
      dropdownRef.current.setValue(value);
    }
  }, [value]);

  useEffect(() => {
    if (dropdownRef.current != null) {
      dropdownRef.current.setDisabled(disabled === true);
    }
  }, [disabled]);

  return h('div', { ref: containerRef });
}

// ─── NativeSlider ───────────────────────────────────────────────

interface NativeSliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

function NativeSlider({ value, min, max, step, onChange, disabled }: NativeSliderProps): h.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<SliderComponent | null>(null);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect((): (() => void) | undefined => {
    if (!containerRef.current) return undefined;

    try {
      const tempContainer = activeDocument.createElement('div');
      const setting = new Setting(tempContainer);
      let sliderInstance: SliderComponent | null = null;

      setting.addSlider((slider: SliderComponent) => {
        sliderInstance = slider;
        slider.setLimits(min, max, step ?? 1);
        slider.setValue(value);
        slider.onChange((newVal: number) => onChangeRef.current(newVal));
        if (disabled === true) {
          slider.setDisabled(true);
        }
      });

      if (sliderInstance != null && setting.controlEl.firstChild) {
        containerRef.current.appendChild(setting.controlEl.firstChild);
      }

      sliderRef.current = sliderInstance;

      const containerEl = containerRef.current;
      return () => {
        containerEl.innerHTML = '';
      };
    } catch {
      // Fallback will render
      return undefined;
    }
  }, []);

  useEffect(() => {
    if (sliderRef.current) {
      sliderRef.current.setValue(value);
    }
  }, [value]);

  useEffect(() => {
    if (sliderRef.current != null) {
      sliderRef.current.setDisabled(disabled === true);
    }
  }, [disabled]);

  return h('div', { ref: containerRef, style: { width: '120px' } });
}

export { NativeToggle, NativeDropdown, NativeSlider };