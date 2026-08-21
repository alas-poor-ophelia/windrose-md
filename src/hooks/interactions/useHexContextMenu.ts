import type { MapData, Region, SubHexMapData } from '#types/core/map.types';
import type { MapDataUpdater } from '#types/hooks/mapData.types';
import type { App } from 'obsidian';

import { useEffect, useRef } from 'preact/hooks';
import { Menu, Notice } from 'obsidian';
import type { MenuItem } from 'obsidian';
import { openNativeNoteLinkModal } from '../../components/modals/NoteLinkModal';
import { ConfirmModal } from '../../settings/modals/ConfirmModal';
import { isFeatureEnabled } from '../../core/featureFlags';
import { DEFAULTS } from '../../core/dmtConstants';
import { calculateFitZoom } from '../../geometry/core/hexMeasurements';
import type { HexContextMenuDetail } from '../../core/windroseEvents';
import { isForeignInstanceEvent } from '../../core/windroseEvents';

interface UseHexContextMenuOptions {
  app: App;
  mapData: MapData | null;
  /** Root map id (the embed block always references the root map). */
  mapId?: string;
  /** Per-mount instance id — gates the context-menu event (fail-open). */
  instanceId?: string;
  /** Current drill-down path ('/'-joined hexKeys), null/undefined at root. */
  subHexPath?: string | null;
  enterSubHex: (q: number, r: number, viewOverride?: { zoom: number; center: { x: number; y: number } }) => void;
  /** Active-level updater — sub-hex deletion writes through it to root. */
  updateMapData: MapDataUpdater;
  handleRegionsChange: (regions: Region[]) => void;
}

/**
 * Tally a sub-hex map's contents across its ENTIRE subtree (the entry is
 * recursive, so deleting it removes every descendant too) — the confirm
 * dialog itemizes what the user is about to lose.
 */
function summarizeSubHexTree(subHex: SubHexMapData): {
  cells: number; curves: number; tiles: number; objects: number; labels: number; nested: number;
} {
  const total = { cells: 0, curves: 0, tiles: 0, objects: 0, labels: 0, nested: 0 };
  const walk = (map: MapData): void => {
    for (const layer of map.layers ?? []) {
      total.cells += layer.cells.length;
      total.curves += layer.curves.length;
      total.objects += layer.objects.length;
      total.labels += layer.textLabels.length;
      total.tiles += layer.tiles?.length ?? 0;
    }
    for (const child of Object.values(map.subHexMaps ?? {})) {
      total.nested += 1;
      walk(child.mapData);
    }
  };
  walk(subHex.mapData);
  return total;
}

function useHexContextMenu({
  app,
  mapData,
  mapId,
  instanceId,
  subHexPath,
  enterSubHex,
  updateMapData,
  handleRegionsChange,
}: UseHexContextMenuOptions): void {
  // Latest props, for guards that fire after an async modal wait — the menu
  // and its onClick closures are frozen at menu-open time, but the delete
  // confirm can sit open across navigation or writes from another pane.
  const liveRef = useRef<{ mapData: MapData | null; subHexPath: string | null }>({
    mapData,
    subHexPath: subHexPath ?? null
  });
  liveRef.current = { mapData, subHexPath: subHexPath ?? null };

  useEffect(() => {
    const handleHexContextMenu = (event: CustomEvent<HexContextMenuDetail>): void => {
      if (isForeignInstanceEvent(event.detail, instanceId)) return;
      if (!mapData || mapData.mapType !== 'hex') return;

      const { q, r, screenX, screenY, canvasSize } = event.detail;
      const hexKey = `${q},${r}`;
      const hasSubHex = mapData.subHexMaps != null && mapData.subHexMaps[hexKey] != null;

      const menu = new Menu();

      // Entering existing sub-hexes always works; creating new ones is
      // gated behind the subMaps feature.
      if (hasSubHex || isFeatureEnabled('subMaps')) {
        menu.addItem((item: MenuItem) => {
          item.setTitle(hasSubHex ? `Enter Sub-Hex (${q}, ${r})` : `Create Sub-Hex (${q}, ${r})`);
          item.setIcon(hasSubHex ? 'lucide-arrow-down-right' : 'lucide-plus-circle');
          item.onClick(() => {
            // Open at a fit zoom computed against the LIVE canvas — the
            // sub-map's stored zoom was fit at creation-time canvas size and
            // opens over-zoomed in any smaller pane. No override without
            // canvas dims (falls back to the stored view).
            let viewOverride: { zoom: number; center: { x: number; y: number } } | undefined;
            if (canvasSize != null) {
              const subHex = mapData.subHexMaps?.[hexKey];
              const rings = subHex?.subdivisionRings ?? 7;
              const childHexSize = subHex?.mapData.hexSize ?? mapData.hexSize ?? DEFAULTS.hexSize;
              const orientation = mapData.orientation ?? DEFAULTS.hexOrientation;
              const childBounds = subHex?.mapData.hexBounds
                ?? { maxCol: rings * 2 + 1, maxRow: rings * 2 + 1, maxRing: rings };
              viewOverride = {
                zoom: calculateFitZoom(childHexSize, orientation, childBounds, canvasSize.width, canvasSize.height),
                center: { x: 0, y: 0 }
              };
            }
            enterSubHex(q, r, viewOverride);
          });
        });
      }

      // Copy an embed block that opens this sub-map directly in a note
      if (hasSubHex && mapId != null && mapId !== '') {
        const path = subHexPath != null && subHexPath !== '' ? `${subHexPath}/${hexKey}` : hexKey;
        const subName = mapData.subHexMaps?.[hexKey]?.mapData?.name ?? '';
        menu.addItem((item: MenuItem) => {
          item.setTitle('Copy sub-map embed');
          item.setIcon('lucide-copy');
          item.onClick(() => {
            const block = [
              '```windrose-map',
              `id: ${mapId}`,
              `name: ${subName}`,
              'type: hex',
              `subhex: ${path}`,
              '```'
            ].join('\n');
            void navigator.clipboard.writeText(block);
            new Notice('Sub-map embed block copied');
          });
        });
      }

      // Delete the sub-hex map (and its whole nested subtree). Only offered
      // from OUTSIDE the target — the clicked hex belongs to the active map,
      // so the target is never on the drill stack and can't be resurrected
      // by a later exit-merge. Sub-hex structure lives outside layer history:
      // no undo, so the destructive confirm is mandatory.
      if (hasSubHex) {
        menu.addItem((item: MenuItem) => {
          item.setTitle(`Delete Sub-Hex (${q}, ${r})`);
          item.setIcon('lucide-trash-2');
          item.setWarning(true);
          item.onClick(() => {
            void (async () => {
              const subHex = mapData.subHexMaps?.[hexKey];
              if (subHex == null) return;
              const s = summarizeSubHexTree(subHex);
              const parts: string[] = [];
              if (s.cells > 0) parts.push(`${s.cells} painted cell${s.cells === 1 ? '' : 's'}`);
              if (s.curves > 0) parts.push(`${s.curves} shape${s.curves === 1 ? '' : 's'}`);
              if (s.tiles > 0) parts.push(`${s.tiles} tile${s.tiles === 1 ? '' : 's'}`);
              if (s.objects > 0) parts.push(`${s.objects} object${s.objects === 1 ? '' : 's'}`);
              if (s.labels > 0) parts.push(`${s.labels} text label${s.labels === 1 ? '' : 's'}`);
              if (s.nested > 0) parts.push(`${s.nested} nested sub-hex map${s.nested === 1 ? '' : 's'}`);
              const contents = parts.length > 0 ? `It contains ${parts.join(', ')}.` : 'It is empty.';
              const confirmed = await new ConfirmModal(app, {
                message: `Delete the sub-hex map at (${q}, ${r})?\n${contents}\nThis cannot be undone. Links into this sub-map will open the nearest remaining level instead.`,
                confirmText: 'Delete',
                isDestructive: true
              }).openAndGetValue();
              if (!confirmed) return;
              // The confirm wait is an async gap under user control. If the
              // active level changed meanwhile (navigation slipped past the
              // modal) the captured updater targets a DIFFERENT map that may
              // hold the same hexKey — and if another pane already removed
              // the entry, "deleted" would be a lie. Re-check against the
              // live props before committing; there is no undo for this.
              const live = liveRef.current;
              if (live.subHexPath !== (subHexPath ?? null) || live.mapData?.subHexMaps?.[hexKey] == null) {
                new Notice('Sub-hex delete cancelled: the map changed');
                return;
              }
              updateMapData(prev => {
                if (prev.subHexMaps?.[hexKey] == null) return prev;
                const remaining = { ...prev.subHexMaps };
                delete remaining[hexKey];
                return { ...prev, subHexMaps: remaining };
              });
              new Notice(`Sub-hex map (${q}, ${r}) deleted`);
            })();
          });
        });
      }

      const region = (mapData.regions ?? []).find((reg: Region) =>
        reg.hexes.some((h: { x: number; y: number }) => h.x === q && h.y === r)
      );
      if (region) {
        menu.addSeparator();

        menu.addItem((item: MenuItem) => {
          item.setTitle(`Edit Region: ${region.name}`);
          item.setIcon('lucide-pencil');
          item.onClick(() => {
            activeDocument.dispatchEvent(new CustomEvent('windrose:edit-region', { detail: { regionId: region.id, instanceId } }));
          });
        });

        menu.addItem((item: MenuItem) => {
          item.setTitle(region.visible ? 'Hide Region' : 'Show Region');
          item.setIcon(region.visible ? 'lucide-eye-off' : 'lucide-eye');
          item.onClick(() => {
            const updated = (mapData.regions ?? []).map((r: Region) =>
              r.id === region.id ? { ...r, visible: !r.visible } : r
            );
            handleRegionsChange(updated);
          });
        });

        if (region.linkedNote != null && region.linkedNote !== '') {
          const notePath = region.linkedNote;
          menu.addItem((item: MenuItem) => {
            item.setTitle('Open linked note');
            item.setIcon('lucide-external-link');
            item.onClick(() => {
              const linkPath = notePath.replace(/\.md$/, '');
              void app.workspace.openLinkText(linkPath, '', false);
            });
          });
        }

        menu.addItem((item: MenuItem) => {
          item.setTitle(region.linkedNote != null && region.linkedNote !== '' ? 'Change linked note' : 'Link note');
          item.setIcon('lucide-link');
          item.onClick(() => {
            openNativeNoteLinkModal(app, {
              onSave: (notePath: string | null) => {
                const updated = (mapData.regions ?? []).map((r: Region) =>
                  r.id === region.id ? { ...r, linkedNote: notePath ?? undefined } : r
                );
                handleRegionsChange(updated);
              },
              onClose: () => {},
              currentNotePath: region.linkedNote ?? null,
              objectType: null
            });
          });
        });

        menu.addSeparator();

        menu.addItem((item: MenuItem) => {
          item.setTitle('Delete region');
          item.setIcon('lucide-trash-2');
          item.setWarning(true);
          item.onClick(() => {
            handleRegionsChange((mapData.regions ?? []).filter((r: Region) => r.id !== region.id));
          });
        });
      }

      menu.showAtPosition({ x: screenX, y: screenY });
    };

    activeDocument.addEventListener('windrose:hex-context-menu', handleHexContextMenu);
    return () => activeDocument.removeEventListener('windrose:hex-context-menu', handleHexContextMenu);
  }, [app, mapData, mapId, instanceId, subHexPath, enterSubHex, updateMapData, handleRegionsChange]);
}

export { useHexContextMenu };
