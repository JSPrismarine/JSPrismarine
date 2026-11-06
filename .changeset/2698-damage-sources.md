---
'@jsprismarine/commands': patch
'@jsprismarine/prismarine': patch
---

Make `/damage` follow Java 26.3: no source entity unless `by` names one, `from` for an indirect cause, `at` for a location, a single target, and the damage type read from the loaded datapacks, whose tags decide what the blow bypasses.
