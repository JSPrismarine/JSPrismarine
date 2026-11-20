---
'@jsprismarine/addon-tools': patch
---

`@jsprismarine/addon-tools/addonIndex` gains `satisfiesAddonRange`, `isAddonRange` and `addonVersionsInRange`, which read the `^1.2.3`, `~1.2.3`, `1.2.3` and `*` ranges the way npm does. `fetchPublishedIndex` takes the `fetch` to download through, and `@jsprismarine/addon-tools/addon` exports `parseAddonMetadata`, the `addon.json` check the build runs.
