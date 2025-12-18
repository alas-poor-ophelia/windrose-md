## Version 1.4.0
The "Pathfinding sucks" release. Not Pathfinder; Path _finding_. But this is a fun one, I think?

### Features
- You can now **generate random maps.**.
	- Grid only, these are dungeon maps, I have no idea what a random world map would look like asides noise (which for now is the dedicated "purpose" of hex maps).
	- Access via a new Plugin command "Generate random dungeon". Plugin only for now. Opens a modal that allows you to choose a size and name for your random dungeon, and then inserts it into your active note at your cursor.
	- At least attempts to place logical doors, and a few other objects. This is meant as a **baseline** though, something you can change and doodle on with the standard Windrose tools, rather than a full dungeon, ready to run.
	  

And a couple important notes:
1. This dungeon generation is pure math and graph theory, no AI involved. Windrose will **never** have AI features.
2. I realize that the plugin is becoming increasingly "mandatory", which it was not at first. I'm keeping a careful eye on this and working on formalizing a direction for the future. So far no one has vocalized a complaint, so I don't think it's a big issue with the current user base, but I am compelled to acknowledge the discrepancy between earlier words and current actions.