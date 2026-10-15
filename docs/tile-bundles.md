---
layout: default
title: Tile bundles
nav_order: 5.5
permalink: /tile-bundles/
---

# Tile bundles

A **tile bundle** is how Windrose stores an imported tile pack: a handful of large files inside the pack folder instead of thousands of separate images.

**What bundles do not do:** they do not change how tiles look, place, or behave; they do not compress or re-encode your art (the default import copies every image byte for byte); and they do not replace loose folders. A folder of plain images still works exactly as it always has.

## What is in a bundle

A bundled pack folder holds:

- `bundle.wrbundle` — a small marker file that says "this folder is a bundle".
- `index/` — one index file per import, listing every tile and where its bytes live.
- `shards/` — a few large files, each holding many tile images back to back.
- `thumbs/` — small preview images for the tile drawer.

A pack of 14,000 images becomes under a thousand files. That keeps your vault folder listing short and makes syncing a large pack far quicker.

Every file in a bundle is written once and never changed afterwards. Its name comes from its contents, so the same name always means the same bytes on every device.

## Imports create bundles

The **Add tiles** wizard (Settings → Tile sets) now writes a bundle when you import a Dungeondraft pack or download a content pack. Nothing else changes: the tiles appear in the tile drawer as before, with the same categories, tags, and strata, and maps that already use them keep working.

**Exact** mode is the default: every tile is an identical, byte-for-byte copy of the image in the source pack. Two devices that import the same pack in Exact mode produce identical files.

## Obsidian Sync: turn on "Sync all other types"

Bundle files are not images or notes, so Obsidian Sync skips them unless the **Sync all other types** option is on.
{: .warning }

On every device that syncs your vault, open **Settings → Sync** and turn on **Sync all other types**. Until a device has received the bundle files, the tile drawer on that device shows a short note naming the pack instead of its tiles. Once the files arrive, the tiles appear on their own.

## Checking a bundle's status

Under each folder in **Settings → Tile sets**, a status line shows what Windrose found there:

| Status | Meaning |
|--------|---------|
| Loose: N files | A plain folder of images, read as it always was. |
| Bundled: N tiles in M shards, X MB | A bundle that loaded normally. |
| Bundle not on this device yet | The bundle files have not finished syncing to this device. Check the Sync setting above. |
| Bundle could not be loaded (reason) | A bundle file is damaged or incomplete. Re-importing the pack repairs it. |
| Bundle needs a newer plugin version | The bundle was written by a newer Windrose. Update the plugin on this device. |
| Folder not found | The folder path does not exist in this vault. |

The **Preview** action in the same section still lists how many tiles each folder provides.

## Loose folders still work

You do not have to convert anything. A folder of loose images keeps working, and you can mix loose and bundled folders freely. If a loose image sits at the same place as a bundled tile, the loose image wins, so you can override a single tile by dropping a file into the folder.
