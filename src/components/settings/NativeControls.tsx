/**
 * NativeControls.tsx
 *
 * Native Obsidian control wrappers for use inside SettingItem.
 * Each wrapper creates the Obsidian component imperatively and
 * falls back to standard HTML controls when bridge is unavailable.
 */

import { h } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import type { MutableRef } from 'preact/hooks';
import { Setting } from 'obsidian';
import type { ValueComponent, ToggleComponent, DropdownComponent, SliderComponent } from 'obsidian';

interface NativeControlOptions<C extends ValueComponent<V>, V> {
  value: V;
  onChange: (value: V) => void;
  disabled?: boolean;
  /** Adds the control to the throwaway Setting; emit forwards changes to the latest onChange. */
  create: (setting: Setting, emit: (value: V) => void) => C | null;
}

interface NativeControlRefs<C> {
  containerRef: MutableRef<HTMLDivElement | null>;
  controlRef: MutableRef<C | null>;
}

/**
 * Shared scaffolding for the native control wrappers: creates the component
 * via a temporary Setting, moves its element into the wrapper's container,
 * and live-updates value/disabled without recreating.
 */
function useNativeControl<C extends ValueComponent<V>, V>({ value, onChange, disabled, create }: NativeControlOptions<C, V>): NativeControlRefs<C> {
  const containerRef = useRef<HTMLDivElement>(null);
  const controlRef = useRef<C | null>(null);

  // Store latest onChange in ref to avoid recreating the control
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect((): (() => void) | undefined => {
    if (!containerRef.current) return undefined;

    try {
      // Create a temporary setting to extract its control component
      const tempContainer = activeWindow.createDiv();
      const setting = new Setting(tempContainer);
      const control = create(setting, (newVal: V) => onChangeRef.current(newVal));

      // Move just the control element into our container
      if (control != null && setting.controlEl.firstChild) {
        containerRef.current.appendChild(setting.controlEl.firstChild);
      }

      controlRef.current = control;

      const containerEl = containerRef.current;
      return () => {
        containerEl.innerHTML = '';
      };
    } catch {
      // Fallback will render
      return undefined;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- builds the native control once; value/disabled live-updated by the effects below
  }, []);

  // Update value without recreating
  useEffect(() => {
    if (controlRef.current != null) {
      controlRef.current.setValue(value);
    }
  }, [value]);

  // Update disabled state without recreating
  useEffect(() => {
    if (controlRef.current != null) {
      controlRef.current.setDisabled(disabled === true);
    }
  }, [disabled]);

  return { containerRef, controlRef };
}

// ─── NativeToggle ───────────────────────────────────────────────

interface NativeToggleProps {
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}

function NativeToggle({ value, onChange, disabled }: NativeToggleProps): h.JSX.Element {
  const { containerRef } = useNativeControl<ToggleComponent, boolean>({
    value,
    onChange,
    disabled,
    create: (setting, emit) => {
      let instance: ToggleComponent | null = null;
      setting.addToggle((toggle: ToggleComponent) => {
        instance = toggle;
        toggle.setValue(value);
        toggle.onChange(emit);
        if (disabled === true) {
          toggle.setDisabled(true);
        }
      });
      return instance;
    }
  });

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
  const { containerRef } = useNativeControl<DropdownComponent, string>({
    value,
    onChange,
    disabled,
    // Options are set imperatively at creation only
    create: (setting, emit) => {
      let instance: DropdownComponent | null = null;
      setting.addDropdown((dropdown: DropdownComponent) => {
        instance = dropdown;
        for (const opt of options) {
          dropdown.addOption(opt.value, opt.label);
        }
        dropdown.setValue(value);
        dropdown.onChange(emit);
        if (disabled === true) {
          dropdown.setDisabled(true);
        }
      });
      return instance;
    }
  });

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
  const { containerRef, controlRef } = useNativeControl<SliderComponent, number>({
    value,
    onChange,
    disabled,
    create: (setting, emit) => {
      let instance: SliderComponent | null = null;
      setting.addSlider((slider: SliderComponent) => {
        instance = slider;
        slider.setLimits(min, max, step ?? 1);
        slider.setValue(value);
        slider.onChange(emit);
        if (disabled === true) {
          slider.setDisabled(true);
        }
      });
      return instance;
    }
  });

  // Update limits without recreating
  useEffect(() => {
    if (controlRef.current != null) {
      controlRef.current.setLimits(min, max, step ?? 1);
    }
  }, [min, max, step, controlRef]);

  return h('div', { ref: containerRef, style: { width: '120px' } });
}

export { NativeToggle, NativeDropdown, NativeSlider };
