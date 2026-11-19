---
'@jsprismarine/mapping': patch
---

The generated tables moved under the release directory, `src/tables/<release>/`, beside a `pair.json` naming the Bedrock protocol they map onto. `generate:tables`, `generate:block-states` and `generate:block-properties` take `--java <release>`. The package's exports are unchanged and read the default release's tables.
