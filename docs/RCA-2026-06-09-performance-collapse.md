# RCA: Device-Wide Performance Collapse (2026-06-09 → 2026-06-10)

## Summary

On 2026-06-09 ~4-5pm Central, Windrose became unusable on iPad (multi-second
freezes per interaction, whole-app lag) and badly degraded on desktop
(UI-freezing microstutters), on every map, with no apparent trigger.

**Root cause:** a 5000×5000-pixel (25-megapixel, 10.7MB) JPEG (`1409.jpg`)
configured as the fog-of-war texture. The fog renderer re-created a repeat
pattern from the full-resolution image **every frame** (twice — main canvas
and blur canvas), sampled it through 8 blur passes plus the main fog fill,
under a full-viewport CSS blur. That re-feeds a ~100MB decoded texture to the
GPU per frame: ~900ms/frame on iPad (2–4 FPS), GPU/compositor stutter on
desktop. Identified by the user via elimination; confirmed in code review of
`fogRenderer.ts`.

**Why it looked like "everything broke at once out of nowhere":**
- Fog image is a **setting**, not map data → applied to every map.
- Settings sync via Obsidian Sync in seconds → both devices degraded
  simultaneously the moment the image was selected.
- Settings survive code rollbacks, plugin reinstalls, tileset removal, tile
  deletion, and data-file surgery → every standard isolation step failed.
- A fresh test vault was smooth — not because of sync or images in general,
  but because `1409.jpg` didn't exist there, so the fog texture silently
  failed to load and fog fell back to a cheap solid color.

## Fix

`f68216b0` — fog pattern source is downscaled once to ≤1024px and cached per
image path; the pattern transform restores the original on-screen texture
scale. Per-frame cost is now bounded regardless of the chosen image.

## Why diagnosis took a full night

The investigation kept finding **real defects that weren't the trigger**.
Each was genuinely broken, measurably improved when fixed, and masked the
signal of the others — classic compounding-failure fog:

| Defect (all real, all fixed) | Commit | Measured impact |
|---|---|---|
| No rAF coalescing — full repaint per pointermove | `db7ea444` | 198 long tasks → 1 during 6s pan |
| Pretty-printed triple-pass JSON saves | `db7ea444` | data file 3.66MB → 1.55MB |
| No viewport culling for cells/borders/lines; unconditional rotation padding; bounded hex maps drew every hex | `20a1a11f` | 4,970 → 142 fillRects/frame (zoomed in) |
| Thumbnail cache (500) smaller than tile library (2,271) + GPU-readback scans | `e2ef2c88` | 1,242 getImageData/click → 0 |
| Eager scan bulk-persisted render-mode/footprint predictions, retroactively changing placed-tile rendering on all synced devices | `b16718ed` | terrain regression fixed |
| Invisible infinite shimmer animations behind collapsed drawer | `872fc97e` | (real waste; not the trigger) |
| **Save-on-unmount effect fired a 1MB full-file save per pan event (since 2026-05-23)** | `59592c46` | 119 saves/6s pan → 1 |
| Map blocks never unmounted on note close (zombie trees) | `17f142f4` | navigate-away saves now real |
| Static-layer cache: pan = 1 blit instead of full redraw | `ed016584` | 2.4M → 9.3k fillRects/4s pan |
| Path2D batching + coalesced image-load rebuilds | `4de272d6` | rebuild ~10k → ~800 draw cmds |
| TileAssetBrowser unmemoized → full tree re-diff per pointermove | `f01bf6d9` | (browser subtree now skips during pan) |

Diagnostic dead ends and their lessons are recorded as guild field notes
(H-524..H-530): verify the *running* code, instrument one interaction
end-to-end, treat rollback tests as unreliable under compounding defects, and
build on-device telemetry instead of shipping blind fixes for a device you
can't attach to.

**What finally worked:** the `Record performance telemetry (60s)` command
(`59592c46`) — on-device instrumentation written to a vault file that syncs
back — plus the user's systematic elimination (tilesets, tiles, images, data,
plugins, vaults), which produced the constraint matrix that ruled everything
else out.

## Detection gaps / future work

1. **Guard at selection time:** warn (or auto-downscale) when a user picks an
   image larger than ~2MP as a fog/background texture. The renderer fix
   bounds the cost, but the UX should surface it.
2. **Move fog rendering into the static-layer cache** (it only changes on
   fog edits, not pan) — fog is now the largest remaining per-frame cost.
3. **Per-map data files:** every save stringifies + writes the whole
   multi-map file (~1MB), which costs ~900ms of I/O on iOS per save.
4. Remove the temporary `window.__windroseStaticDbg` counter once iPad
   verification settles.
5. Restore `windrose-tile-metadata.json` from sync version history
   (pre-2026-06-10 03:51) to undo the 304 auto-persisted render-mode flips
   (code that wrote them is fixed).
6. Hex-map Path2D batching (grid done; hex still per-cell fills).

## Credits

Root cause isolated by the Guildmaster through controlled elimination after
instrumentation cleared the underbrush. The compounding defects were real;
the trigger was a 25-megapixel fog texture, re-uploaded to the GPU sixty
times a second.
