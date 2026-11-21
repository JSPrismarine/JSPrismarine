---
'@jsprismarine/prismarine': patch
---

`addon install` and `addon update` warn when the version they install is deprecated, with the author's reason and the install id of its replacement, read from the index entry's `listing`. `addons.lock.json` records the reason beside the source lock, and `addon list` marks a deprecated addon. Neither command refuses a deprecated addon.
