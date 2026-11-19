---
'@jsprismarine/items': patch
---

The generated item type table moved under the release directory, `src/tables/<release>/itemTypes.json`. `generate:item-types` takes `--java <release>` and reads the item table of the Bedrock protocol `sources.json` pairs with it. The package's exports are unchanged and read the default release's table.
