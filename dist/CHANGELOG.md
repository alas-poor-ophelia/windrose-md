## 1.0.5
A small surprise release, one new feature, one crash fix.

### Features
- Added new setting (global and per map) for grid line thickness. Right now that's a range between 1 and 5px (1 is default), and "interior" grid lines display at 50% of the total width. Requires a plugin update (if using), which you should be prompted for automatically, and which should preserve your existing settings.
  

### Bug Fixes
- Fix an intermittent crash  (`color.toUpperCase is not a function`) with creating and selecting a custom color when making a text label.