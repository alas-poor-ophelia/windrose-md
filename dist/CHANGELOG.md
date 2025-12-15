## Version 1.3.1
Fast follow bug fixes.

### Features
- Plugin now adds an "Insert new map" command. Search the command palette for "Windrose" (or "map"). 
	- This technically makes the Templater script optional. I will continue shipping the Templater script for the next few releases at least. I may eventually phase it out of active release, but there's no reason at this point it can't keep working as an optional download, worst case.

### Improvements
- The hover color on selected object/text actions was using the `--background-modifier-hover` attribute, which was a bit _too_ transparent, given that the selection toolbar has no background behind the buttons. That's now using `var(--background-primary-alt, var(--background-secondary))` and will just be solid for now. 

### Bug Fixes
- Fixed an issue where the preview box for multi select was placing itself in reference to the wrong container after a refactor and would appear out of place.
- Fixed an issue where multi-selections were not clearing when a new tool was switched to.
- Fixed a regression on persisting Text Label settings.
- Fixed an issue where the selection toolbar could show up in the wrong position on some platforms.
- Fixed a regression with Text Labels not rotating with the "R" keyboard shortcut.
- Possibly fixed a longstanding issue where reloading Obsidian, or triggering a sync on another device when an object was actively selected could delete that object due to a race condition.