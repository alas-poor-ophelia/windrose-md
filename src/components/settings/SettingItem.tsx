/**
 * SettingItem.tsx
 *
 * Preact components for settings rows.
 * Native path: uses Obsidian's Setting class imperatively for structure,
 * with Preact children rendered into the control area.
 * Fallback path: renders custom DOM with Obsidian's setting-item CSS classes.
 */







import { useEffect, useRef } from 'preact/hooks';
import type { VNode, ComponentChildren } from 'preact';
import { Setting } from 'obsidian';
interface SettingItemProps {
  name: string;
  description?: string;
  vertical?: boolean;
  children?: ComponentChildren;
}

/**
 * Standard setting row: name + optional description on left, control on right.
 * Native path: creates Obsidian Setting instance imperatively.
 * Fallback path: renders using Obsidian's .setting-item CSS classes.
 * When vertical=true, stacks label above control (for wide controls like color grids).
 */
function SettingItem({ name, description, vertical, children }: SettingItemProps): VNode {
  const containerRef = useRef<HTMLDivElement>(null);
  const controlRef = useRef<HTMLDivElement>(null);
  const settingRef = useRef<Setting | null>(null);

  useEffect((): (() => void) | undefined => {
    if (!containerRef.current) return undefined;

    try {
      const setting = new Setting(containerRef.current);
      setting.setName(name);
      if (description) {
        setting.setDesc(description);
      }

      if (vertical) {
        setting.settingEl.classList.add('windrose-setting-item-vertical');
      }

      // Move Preact children into the native control area
      if (controlRef.current) {
        while (controlRef.current.firstChild) {
          setting.controlEl.appendChild(controlRef.current.firstChild);
        }
      }

      settingRef.current = setting;

      return () => {
        // Setting appends its own DOM to containerRef — clear it
        if (containerRef.current) {
          if (containerRef.current.empty) { containerRef.current.empty(); } else { containerRef.current.innerHTML = ''; }
        }
      };
    } catch {
      // If Setting creation fails, fallback DOM is already visible
      return undefined;
    }
  }, []);

  // Update name/description reactively
  useEffect(() => {
    if (settingRef.current) {
      settingRef.current.setName(name);
    }
  }, [name]);

  useEffect(() => {
    if (settingRef.current) {
      if (description) {
        settingRef.current.setDesc(description);
      }
    }
  }, [description]);

  return (
    <>
      <div ref={containerRef} />
      <div ref={controlRef} style={{ display: 'none' }}>{children}</div>
    </>
  );
}

interface SettingHeadingProps {
  text: string;
}

/**
 * Section heading matching Obsidian's setting-item-heading pattern.
 */
function SettingHeading({ text }: SettingHeadingProps): VNode {
  return (
    <div class="setting-item setting-item-heading">
      <div class="setting-item-info">
        <div class="setting-item-name">{text}</div>
      </div>
    </div>
  );
}

export { SettingItem, SettingHeading };