---
'@jsprismarine/prismarine': patch
---

A `worlds.<name>` entry in `config.json` now reads as `{ seed, provider, preset?, dimensions? }`.
`preset` is a Java `worldgen/world_preset` id and defaults to `minecraft:normal`; each
`dimensions.<id>` entry may set that dimension's `type`, `generator` (a level stem generator
object) and `load` (`eager` or `lazy`). The old `generator: 'Overworld' | 'Flat'` and `layers`
keys are deprecated but still read: `normalizeWorldData` translates them row for row into the new
shape and reports what it translated, `worldDataOf` gives the entry to write back, and
`Config.setWorld` stores it. A new config writes `preset: 'minecraft:normal'` instead of
`generator: 'Overworld'`. The JSON schema marks `generator` and `layers` deprecated.
