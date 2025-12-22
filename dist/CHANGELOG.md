## Version 1.4.2
Random map enhancements and some maintenance refactors.

### Improvements
- Random map generation:
	- Chance for L/T shaped rooms
	- Make clearer distinction between Small/Medium map size.
	- New "Styles" selector. Don't expect too much from this, but it will give at least some interesting results:
		- Normal
		- Cavern: Larger chance of circular rooms or L/T shaped rooms, organic hallways, no doors.
		- Fortress: Large long hallways, large rooms.
		- Crypt: Shorter hallways, more secret doors.
	- New "Advanced" settings for Random Map generation to tweak the following variables
		- Chance of circle rooms
		- Room size (make larger or smaller rooms more/less common)
		- Loop chance: chance for multiple exits to generate for rooms.
		- Frequency of doors/secret doors
		- Chance for double wide corridors.
		- Straight vs "organic" hallways.
	- A little not very hidden "easter egg" on the Generate Random Map modal.

### Technical Changes
- Major refactor of settings plugin architecture, now using multiple templated files instead of one giant one. This shouldn't be particularly noticeable except for hopefully fewer bugs happening in the settings plugin. 
- Changed name of plugin to "Windrose MapDesigner", dropping "Settings". That was both weirdly wordy, and is also not quite as technically true. Mostly I hated how wordy it was.