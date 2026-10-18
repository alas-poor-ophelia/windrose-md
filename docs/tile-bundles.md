---
layout: default
title: Tile bundles
nav_order: 5.5
permalink: /tile-bundles/
---

# Tile bundles

A **tile bundle** is how Windrose stores an imported tile pack: a handful of large files inside the pack folder instead of thousands of separate images.

**What this does and does not do:** bundles apply to Dungeondraft packs you import with the **Add tiles** wizard, and to existing image folders you convert yourself with **Bundle folder**. Folder imports through the wizard stay loose, and so do content-pack downloads, because their images feed object sets that need real files on disk. Bundles do not change how tiles look, place, or behave, and they do not replace loose folders. On a phone or tablet you can browse and place bundled tiles through the tile browser, but the actions that write or rewrite bundles (importing as Compact, Bundle folder, Compact bundle, Unbundle, Clean up) are desktop only. By default nothing is re-encoded. The one lossy path is **Compact**, which is opt-in and described below.

## What is in a bundle

A bundled pack folder holds:

- `bundle.wrbundle`: a small marker file that says "this folder is a bundle".
- `index/`: one index file per import, listing every tile and where its bytes live.
- `shards/`: a few large files, each holding many tile images back to back.
- `thumbs/`: small preview images for the tile drawer.

A pack of 14,000 images becomes a few hundred files, which keeps folder listings short and makes syncing far quicker. Bundle files are written once and never changed afterwards.

## Importing a pack

The **Add tiles** wizard (Settings → Tile sets) writes a bundle when you import a Dungeondraft pack. The tiles appear in the tile drawer as before, with the same categories, tags, and strata, and maps that already use them keep working.

On desktop the wizard has a **Storage** step with two choices.

- **Exact** is the default. Every tile is a byte-for-byte copy of the image in the pack. It is reversible, and two devices importing the same pack produce identical files.
- **Compact** is opt-in and lossy. It re-encodes large images as smaller WebP. See the next section.

Phones and tablets always import as Exact.

## Compact

Compact keeps a smaller re-encoded copy of your art. It is lossy: the pixels change slightly.

- **Size floor:** only images of 64 KB or more are touched. Smaller images stay exact, even in Compact mode.
- **Quality target:** WebP at quality 0.9. A re-encoded image is kept only if it comes out at most 80% of the original size, keeps the same dimensions, keeps its transparency to within a tiny tolerance, and matches the original colors to at least 36 dB PSNR (a standard measure of closeness). Anything that fails a check stays exact, as do images that are already lossy or carry special color profiles.
- **One-way:** the original bytes are not kept in the bundle. Re-import the pack as Exact to get them back.

The wizard shows a size estimate and a **Preview lineup** button before you commit. The saving comes mostly from large lossless sheets, so it varies by pack.

## Settings actions

These buttons sit on each folder row in **Settings → Tile sets**, next to the status line. Each one appears only when it applies, and all are desktop only. Every deletion moves files to Obsidian's trash through the file manager, so you can recover them from there. If your **Deleted files** setting (Files and links) deletes permanently, Compact bundle refuses to run, and Bundle folder and Unbundle keep the old files instead of trashing them.

### Bundle folder

Shown for a loose folder that contains images. It writes a bundle into the same folder, so the folder path and tile ids do not change and your maps are unaffected. The result is Exact. Windrose reads every tile back from the bundle, and only loose files that came back byte-identical go to the trash. Files the bundle does not replace stay where they are. It refuses if the folder is already a bundle or has no images. If a run is interrupted, the button reads **Resume bundling**. Reversible with Unbundle.

### Compact bundle

Shown for a bundle that has an exact copy. It runs the Compact process on an existing bundle. It writes a new compact copy, reads it back for every tile, and only then moves the exact copy (its index file, and the shards nothing else uses) to the trash. If a step fails, the exact copy stays and keeps serving every tile. It refuses if the bundle is already compact, is not fully readable, or another bundle job is running. This is one-way: the originals survive only in the trash, or by re-importing the pack.

### Unbundle

Shown for a fully readable bundle. It writes every tile back as a loose file in the folder and checks that each file matches. It also checks that the loose files would get the same tile ids. Only then does it move the marker, index, shards, and thumbs to the trash. It never overwrites a different file already in the folder: it keeps the bundle and reports a conflict instead. For a compact bundle the exported files are the re-encoded copies, not the original pack images. Reversible with Bundle folder.

### Clean up

Shown when a bundle folder holds files that no index uses, such as leftovers from an interrupted import. It lists them with sizes and moves only those older than 7 days to the trash. Younger ones are kept, since they may still be arriving through Sync. It stops without trashing anything if a bundle file comes from a newer version of the plugin ("Clean up skipped: ... has bundle files from a newer version of the plugin") or an index file cannot be read. It also stops early if new bundle files appear mid-run. Run it again later.

## Obsidian Sync: turn on "Sync all other types"

Bundle files are not images or notes, so Obsidian Sync skips them unless the **Sync all other types** option is on.
{: .warning }

On every device that syncs your vault, open **Settings → Sync** and turn on **Sync all other types**. If the bundle index reaches a device before its shards, or the files have not arrived at all, the tile browser shows a panel naming the pack instead of its tiles: "This pack's bundle files have not synced to this device. In Sync settings, turn on Sync all other types." Once Sync catches up, the tiles appear on their own.

## Checking a bundle's status

Under each folder in **Settings → Tile sets**, a status line shows what Windrose found there:

| Status | Meaning |
|--------|---------|
| Loose: N files | A plain folder of images, read as it always was. |
| Bundled (exact or compact): N tiles in M shards, X MB | A bundle that loaded normally. |
| Bundle not on this device yet | The bundle files have not finished syncing to this device. Check the Sync setting above. |
| Tile bundle is incomplete (bundling did not finish) | A bundling run stopped early. Use **Resume bundling**, or re-import the pack. |
| Bundle could not be loaded (reason) | A bundle file is damaged or incomplete. Re-importing the pack repairs it. |
| Bundle needs a newer plugin version | The bundle was written by a newer Windrose. Update the plugin on this device. |
| Folder not found | The folder path does not exist in this vault. |

The **Preview** action in the same section still lists how many tiles each folder provides.

## Loose folders still work

You do not have to convert anything. A folder of loose images keeps working, and you can mix loose and bundled folders freely. If a loose image sits at the same place as a bundled tile, the loose image wins, so you can override a single tile by dropping a file into the folder.
