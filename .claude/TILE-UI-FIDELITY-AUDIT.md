# Tile-UI Redesign — Fidelity Audit (Design Handoff vs. Shipped Build)

**Date:** 2026-06-24
**Branch audited:** `feature/tile-ui-redesign` @ `56c98802` (deployed `main.js` 2026-06-24 22:35 — matches repo build)
**Source of truth:** `~/Downloads/_tile_ui_handoff/design_handoff_tile_drawer/` (README.md, IA - Data Model & Flow.md, `Tile Drawer Prototype.html` + `drawer/*.jsx`)
**Method:** Rendered the design prototypes headlessly (Playwright/Chromium, served over HTTP) → PNG. Captured the live build via the Windrose MCP against the running Obsidian. Cropped matched regions; built side-by-side montages; confirmed structure with live-DOM class probes.

**Artifacts:** `.claude/tile-ui-audit/`
- `design/` — rendered spec screenshots (full-01-default, …, block-01, layers-01)
- `live/` — live build crops (left toolbar, drawer, dock, objects)
- `CMP-1-overview.png … CMP-5-layers.png` — **side-by-side comparisons**

---

## Verdict

The Guildmaster's read is correct. This is not a polish gap — it is a **structural fidelity failure**. The build reproduces the *theme tokens* (gold/dark palette, Cinzel headings, corner brackets) but **almost none of the spec'd information architecture**. The two headline features of the entire redesign — (1) the legible, **merged**, no-truncation category rail, and (2) the **left subtool ribbon** carrying Tiles/Objects/Recent/Starred/Mode — are both effectively absent. The original legibility bug the redesign existed to kill is **still present** in the live build.

The strongest single piece of evidence is in the DOM class names: the toolbar shipped as `windrose-tool-palette **windrose-tool-palette-vertical**` (the old horizontal palette with a "make it vertical" modifier), and the drawer contains `windrose-fd-subrib **windrose-fd-subrib-empty**` (the signature ribbon component exists but renders nothing). The redesign was *approximated from memory*, not built from the handoff.

---

## Surface 1 — Full-pane ToolPalette  → `CMP-2-toolbar.png`

**Spec (README §"Full-pane editor", `editor.jsx` `ToolRail`):** a **purpose-built 54px vertical rail, flush to the canvas's left edge, full height**, border-right divider. Exactly 8 curated tools top→bottom: **Select · Paint · Fill · Shape · Line · Stamp · Object · Erase**. Blue corner triangle on tools with subtools (Paint/Line/Stamp). Below a divider: **one global color chip** (green swatch). A flex spacer pushes **Undo / Redo to the very bottom**. Active tool = gold border + glow. No decorative brackets.

**⚠️ Guildmaster correction (2026-06-25):** The *tool set* is **not** a defect — the live buttons (Text, Measure, Pin, Image, etc.) are intentional placeholders and are **not** meant to mirror the prototype's exact 8 tools. The requirement is the rail's **form**, not its icon list. Embellishments (corner brackets) may **partly stay**, just reduced. So the target is: a **full-height, ribbon-style control flush off the canvas's left edge**, with whatever tool set we choose — keeping a lighter version of the old chrome.

**Shipped:**
| # | Issue | Severity |
|---|-------|----------|
| 1.1 | It is the **legacy horizontal ToolPalette rotated vertical** (`windrose-tool-palette-vertical`), not a purpose-built ribbon. | 🔴 Critical |
| 1.2 | The rail **floats, inset from the canvas, vertically centered** — empty canvas above and below it. Target: **flush off the left edge, full canvas height.** | 🔴 Critical |
| 1.3 | Bracket/embellishment chrome is **too heavy** — keep a reduced version, don't strip entirely. | 🟡 Minor |
| ~~1.x~~ | ~~Wrong tool set/order~~ — **WITHDRAWN per correction;** tools are placeholders, set is not required to match the prototype. | ⚪ N/A |
| 1.4 | **Color** is a palette/picker *icon*; a simpler color **chip** is the direction (low priority given tool-set is placeholder). | 🟡 Minor |
| 1.5 | **Undo/Redo are mid-strip**, not pinned to the bottom; an extra **expand** button sits below. (Layout polish once the rail is full-height.) | 🟡 Minor |

**Root cause:** instead of a full-height ribbon flush to the canvas, the existing palette was given a `-vertical` CSS variant and left floating with heavy bracket chrome. The fix is **layout/containment**, not the icon set.

---

## Surface 2 — Tile Drawer  → `CMP-3-drawer.png`

**Spec (`drawer-full.jsx`):** ONE cohesive panel:
`header (title "Tiles"/"Objects" + grid/list view toggle + settings + Organize + collapse)` → `depth band (single TERRAIN pill + eye + chevron)` → `filter row (search + a "Filter" button)` → `quick tag chips` → `pack chips` → `body = [ 46px LEFT SUBTOOL RIBBON | 128px category rail | grid ]`. The **left ribbon** (`.fd-subrib`) leads with **Tiles/Objects icon tabs**, then **Recent/Starred**, then the active tool's **Mode** subtools. The **category rail** has legible rows: mini **2×2 mosaic** + **2-line wrapping name** + count, **never truncates**. The grid shows tiles under **category section headers** ("STONE FLOORS").

**Shipped:**
| # | Issue | Severity |
|---|-------|----------|
| 2.1 | **Left subtool ribbon is empty** — `windrose-fd-subrib-empty`. The spec's signature element ships as a non-functional stub. | 🔴 Critical |
| 2.2 | Its intended contents were **relocated to a hallucinated top section**: a top **Tiles \| Objects segmented toggle** (`windrose-drawer-panetabs`) + a **"Select a tile" + ☆ bar** (placeholder text, not in spec). Full-pane was never supposed to have a top Tiles/Objects toggle — that belongs on the left ribbon (the *block-mode* header gets the segmented control, not full-pane). | 🔴 Critical |
| 2.3 | **Duplicate header.** A second "**TILES · 2 packs**" header row with extra icons (sliders/check/panel) sits below the toggle. Spec has ONE header. | 🟠 Major |
| 2.4 | **Category rail STILL TRUNCATES** — "Volcanic …", "Tropics & …", "Rivers Co…", "Medieval …", "Deserts T…". Confirmed full names exist (`Volcanic Wastes`, `Rivers Coasts & Seas`) but render single-line with ellipsis. **This is the exact bug the entire redesign was created to eliminate.** | 🔴 Critical |
| 2.5 | Rail rows have **no 2×2 mosaic thumbnail** and **no wrapping**; counts are jammed onto the name (`Volcanic Wastes6`). | 🟠 Major |
| 2.6 | **Category merge not applied / role bleed.** Under the **Terrain** role the rail lists `walls` (349) and `paths` (218) — those are Structure-role categories. Raw import-folder facets ("FCWallsDev1", "hex basic terrain set", "Hex Samples") still surface as chips. The cross-pack normalize/merge (README §"Category merge") is not in effect. | 🔴 Critical |
| 2.7 | **No "Filter" power-user button** beside the search field (spec: search + Filter button opening the Tags/Packs drill-down). | 🟠 Major |
| 2.8 | Grid has **no category section headers**; it's a flat thumbnail wall. | 🟡 Minor |
| 2.9 | Depth band carries **extra icons** (sofa, sparkles, book) not in the spec's clean TERRAIN-pill + eye + chevron. | 🟡 Minor |

---

## Surface 3 — Layers dock (Board → Strata → Layer)  → `CMP-5-layers.png`

**Spec (`layers-dock.jsx`, README §"Layers system"):** for a **tile map**, the dock shows the **Board → Strata → Layer** hierarchy: a quiet **board switcher** ("Ground Floor ▾"), then **bold stratum headers** (Terrain / Structure / Props / Decoration) each with a **role-colored dot/icon**, **indented child layers** (Base stone, Moss & grass [**overlay** badge], …), a **per-stratum "+"**, and an "**Add layer**" footer. The *selected* layer glows its **role hue**.

**✅ NOT A REGRESSION (confirmed live + in code).** The Board→Strata→Layer projection is fully implemented (`DockLayerList.tsx:307–380`) and works. The dock was rendering flat only because the map is in **Simple mode** — `layerMode` is `undefined` by default (`map.types.ts:308`), and the gate `mapData?.layerMode === 'strata' && onBoardSelect != null` (`DockLayerList.tsx:58`) falls through to the flat branch. Clicking **"Switch to Strata (floors)"** live instantly produced the board tab bar (Ground Floor | Floor 2 | + | 🗑 | ☰), stratum headers with counts, per-stratum "+", and indented child layers (see `live/live-03-strata-dock.png`).

| # | Issue | Severity |
|---|-------|----------|
| 3.1 | **Tile maps default to Simple (flat) mode** — a fresh single-board map never sets `layerMode:'strata'`, so the redesign's headline hierarchy is hidden until the user discovers the toggle. **Decision needed:** default tile maps to Strata, and/or make the toggle more discoverable. | 🟠 Major (default/discoverability, not a build) |
| 3.2 | In strata mode, **role-hue dots / overlay badges** are faint or absent vs the spec's clearly role-colored headers. Polish once strata is the default. | 🟡 Minor |

---

## Surface 4 — Objects pane  → `CMP-4-objects.png`

Object *content* is good — real categorized objects (NAVIGATION/HAZARDS/FEATURES/ENCOUNTERS with named items + icons), exceeding the spec's placeholder stubs. But the **container is broken** (Guildmaster correction):
| # | Issue | Severity |
|---|-------|----------|
| 4.0 | **Objects pane does not fill the new drawer width** — it's still constrained to the **legacy ObjectSidebar width**. Switching Tiles→Objects should keep the full drawer width; instead the content is pinned narrow. | 🔴 Critical |
| 4.1 | Toggled via the **hallucinated top toggle** (per 2.2) instead of the spec's **left-ribbon Tiles/Objects tabs**. | 🟠 Major |
| 4.2 | A stray **colored depth/role spine** (role hues + 0-counts, TOP…GND) bleeds in on the drawer's right edge — not in the spec's objects view. | 🟡 Minor |
| 4.3 | Missing the spec hint "*Objects place as free stamps, not grid cells.*" | 🟡 Minor |

---

## Surface 5 — Block mode (600×400 embedded widget)  → design `block-01-default.png`

**NOT live-verified.** Per prior findings, this vault renders maps only via the legacy datacore path; a synthetic `windrose-map` block does not render, so block-mode UI can't be confirmed from the running app this session. **Spec for reference:** horizontal toolbar on top (NOT vertical), a **42px left icon rail** (Layers/Colors/View) whose **~198px flyout** overlays the map, and the tile drawer on the right with a **Tiles\|Objects segmented control in its header**. Flag for a dedicated block-mode verification pass.

---

## Divergence summary

| Surface | Spec'd | Shipped | Fidelity |
|---|---|---|---|
| ToolPalette | Bespoke flush 54px rail, 8 tools, color chip, bottom undo/redo | Rotated legacy palette, floating + bracketed, ~14 tools | ❌ ~15% |
| Tile drawer chrome | 1 header + left ribbon | hallucinated top toggle + "Select a tile" + duplicate header, **empty ribbon** | ❌ ~10% |
| Category rail | mosaic + wrapping, **no truncation**, merged | **truncated**, no mosaic, unmerged, role bleed | ❌ ~5% |
| Layers dock | Board→Strata→Layer + role hues | flat list, no strata, no hues | ❌ ~20% |
| Objects | left-ribbon toggle, placeholder | top toggle, **real data** | 🟡 ~60% |
| Theme tokens | gold/dark, Cinzel, brackets | present | ✅ ~90% |

## Root-cause hypothesis
The visual system (tokens, brackets, fonts) tracks the spec, but the **information architecture does not** — strongly consistent with the agents working from the *plan's prose / memory* rather than opening the handoff's prototypes. Tell-tale signs: a `-vertical` modifier bolted onto the old palette instead of `ToolRail`; an **empty** `fd-subrib` with its contents improvised into a top bar; and the original truncation/merge bug surviving untouched. The fix is not touch-ups — Surfaces 1–3 need to be **rebuilt against the prototype**, component for component.
