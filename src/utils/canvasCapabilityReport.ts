/**
 * canvasCapabilityReport.ts
 *
 * On-device canvas capability probe for diagnosing renderer differences on
 * devices without attachable dev tools (iPad). Triggered via command palette;
 * writes a JSON report to the vault root so it syncs back to a machine that
 * can read it. Mirrors the perfTelemetry pattern.
 */

import type { App } from 'obsidian';
import { Notice, Platform } from 'obsidian';

import { canvasBlurCapabilities } from '../geometry/renderers/tileRenderer';

async function writeCanvasCapabilityReport(app: App): Promise<void> {
  try {
    const caps = canvasBlurCapabilities();
    const report = {
      generatedAt: new Date().toISOString(),
      platform: {
        isMobile: Platform.isMobile,
        isTablet: Platform.isTablet,
        isIosApp: Platform.isIosApp,
        isDesktopApp: Platform.isDesktopApp,
        // Diagnostic payload, not OS detection — the UA carries the WebKit build.
        // eslint-disable-next-line obsidianmd/platform
        userAgent: navigator.userAgent,
        devicePixelRatio: window.devicePixelRatio,
      },
      canvas: caps,
    };
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const platformTag = Platform.isDesktopApp ? 'desktop' : Platform.isTablet ? 'tablet' : 'mobile';
    const fname = `WINDROSE-CANVAS-${platformTag}-${stamp}.json`;
    await app.vault.adapter.write(fname, JSON.stringify(report, null, 2));
    new Notice(`Windrose: canvas report saved to ${fname} — feather strategy: ${caps.strategy}`, 8000);
  } catch (e) {
    new Notice(`Windrose: canvas report failed: ${String(e)}`, 8000);
  }
}

export { writeCanvasCapabilityReport };
