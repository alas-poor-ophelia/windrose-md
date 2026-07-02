/**
 * WhatsNewNotice.tsx
 *
 * One-time dismissible banner for users upgrading to 2.0 — points at the new
 * Features settings section instead of surveying them. Not an overlay: a slim
 * bar above the map that never blocks interaction (LinkingModeBanner idiom).
 *
 * Dismiss (or Open settings) sets onboardingState 'done'; the settings-changed
 * event hides the banner in every mounted instance, permanently.
 */

import type { VNode } from 'preact';

import { useApp } from '../../context/AppContext';
import { Icon } from '../shared/Icon';

interface PluginWithSettings {
  settings: { onboardingState?: string };
  saveSettings(): Promise<void>;
}

interface AppWithSettingUI {
  setting?: {
    open(): void;
    openTabById(id: string): void;
  };
}

const WhatsNewNotice = (): VNode => {
  const app = useApp();

  const markDone = (): void => {
    try {
      const plugin = app.plugins.plugins['windrose-md'] as unknown as PluginWithSettings | undefined;
      if (plugin != null) {
        plugin.settings.onboardingState = 'done';
        void plugin.saveSettings();
      }
    } catch { /* plugin unavailable */ }
  };

  const openSettings = (): void => {
    markDone();
    const settingUI = (app as unknown as AppWithSettingUI).setting;
    settingUI?.open();
    settingUI?.openTabById('windrose-md');
  };

  return (
    <div className="windrose-whatsnew">
      <Icon icon="lucide-sparkles" size={15} />
      <span className="windrose-whatsnew-text">
        <b>Windrose 2.0</b> — every major feature is now individually toggleable.
        Trim the UI to your workflow in Settings → Windrose → Features.
      </span>
      <button className="windrose-whatsnew-btn" onClick={openSettings}>
        Open settings
      </button>
      <button className="windrose-whatsnew-dismiss" onClick={markDone} title="Dismiss">
        <Icon icon="lucide-x" size={14} />
      </button>
    </div>
  );
};

export { WhatsNewNotice };
