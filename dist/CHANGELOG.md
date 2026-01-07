## Version 1.5.0
Not many new features, but **major** behind the scenes work. Hopefully releases will be coming somewhat quicker and much more reliably from here on out (that's the hope at least).

### Features
- Partial cell painting is now supported in Grid (dungeon) mode.
	- Two new tools have been added:
		- "Paint Segments" in the draw tool submenu
		- "Diagonal Line" under the rectangle shape tool.
	- Cells can now be divided up into a subset of 8 triangles. This lets you draw diagonals, half cells, quarter cells, or other combinations.
	- The "Paint Segments" tool will allow you to paint one segment at a time. With a mouse, it will show a preview of the segment that will be painted. 
		- On touch devices, a new modal will pop up that will allow you to select which segments to paint (selections will persist, allowing for hopefully quicker drawing of multiple identical partial-cells).
	- The "Diagonal Line" tool will allow to to "fill" in the diagonal edges of a 45 degree set of full cells. I.e., you want a diagonal hallway, or room edge, and so draw it as a "stairstepped" pattern. Rather than needing to fill each of these diagonals 1 by 1, you can click at 1 end and then the other of the stairstep pattern, and this tool will fill the gaps to make it a smooth line.
- Size previews/overlays for shape tools.
	- The fill rectangle, fill circle, and clear rectangle tools now show a clear preview of exactly what area will be covered, with distance measurements (radius for circle) based off of your scale/measurement.
	- On touch devices this is still present, but is now a "3 tap" process similar to the way the distance measurement tool works. 1st tap places start point, second tap shows preview, third tap confirms.
		- I'll probably add a setting to swap between these behaviors soon, especially if anyone dislikes it.

### Bug Fixes
- Fixed a bug where the fill circle tool could create some odd shapes if defining the radius on a diagonal. The circle tool now always uses Chebyshev measurement (basically a diagonal always counts as the same distance as orthagonal).
  
### Technical Changes
- Windrose has been almost entirely rewritten/converted into TypeScript. This means better linting, actual interfaces and inheritance, and overall much easier maintainability (at the cost at some increased build/project complexity on my side, but c'est la vie).
- Alongside that, the Geometry system has been further standardized (both hex and grid now both return `Point(x, y)` coordinates), meaning that individual callers don't need to care what type of map it is, which should cut down on bugs where tools sometimes break randomly between hex/grid (often caused by forgetting to update the call pattern in one place).
- Added automated end to end testing via Playwright and [obsidian-testing-framework](https://www.npmjs.com/package/obsidian-testing-framework?activeTab=readme). Kudos to `@the.tablet` on Discord for her excellent library, and answering of questions.
- Added unit testing.
- Overall, many small cleanups, fixes, and tweaks that should hopefully stabilize the experience and make future iteration much quicker and safer.