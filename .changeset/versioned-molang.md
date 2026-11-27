---
'@jsprismarine/molang': patch
'@jsprismarine/packs': patch
'@jsprismarine/content': patch
'@jsprismarine/blocks': minor
'@jsprismarine/protocol': minor
---

Molang is versioned the way the engine versions it. `MOLANG_VERSIONS` lists every number of the engine's `MolangVersion` enum with the engine version that introduced it. `molangVersionFor` reduces a pack's `min_engine_version` to one of those numbers, and `Molang.compile` takes the number as `version` and caches by it. A loaded `Definition` carries its pack's `min_engine_version`. A parsed block document records the Molang version of its pack as `molangVersion`, and its permutation conditions compile under that version.

`buildBlockProperties` now writes a pack block's definition as a Bedrock Dedicated Server 1.26.60.6 sends it:

- Each block declares its pack's Molang version rather than 13. `MOLANG_VERSION` is gone.
- `bone_visibility` values are strings.
- `ignoreGeometryForIsSolid`, the third `packed_bools` bit and the full block's `full_block_v1` form follow the file's `format_version`.
- A disabled selection box keeps the full block's box.
- A boolean `ambient_occlusion` travels as 1 or 0.
- A block with no client-side component has no `components` compound.

A `BlockComponentTranslation` now takes the file's `format_version` as a second argument.
