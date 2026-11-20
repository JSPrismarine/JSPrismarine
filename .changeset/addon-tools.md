---
'@jsprismarine/addon-tools': patch
'@jsprismarine/errors': patch
'@jsprismarine/packs': patch
---

Add `@jsprismarine/addon-tools`, which builds JSPrismarine addons. Its `jsp-addon build` command checks each addon's behavior pack and `addon.json`, packs it into `<name>-<version>.mcpack` and writes the `index.json` a server installs from, keeping every published version. `@jsprismarine/addon-tools/addonIndex` parses and validates that index. `@jsprismarine/packs/zip` gains `writeZip`, which writes the same bytes for the same files, and `@jsprismarine/packs/manifest` exports the manifest parser. `@jsprismarine/errors/addon-tools` holds the new errors.
