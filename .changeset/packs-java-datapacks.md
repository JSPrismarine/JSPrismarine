---
'@jsprismarine/packs': patch
---

Add the Java half of the pack loader: a `datapack` stack source reads a Java datapack from a folder
or zip into eight new registries (`lootTablesJava`, `recipesJava`, `advancements`, `tags`,
`enchantments`, `damageTypes`, `predicates`, `itemModifiers`), keyed by namespaced id from the 26.3
directory names. `pack.mcmeta` parses in both the `min_format`/`max_format` and legacy `pack_format`
forms with overlays, gated on data pack format 121.0; a mismatched pack is reported and still loads
outside strict mode. Later packs win per file, tags merge with `replace` honored, and
`reportIdentifiers` walks loaded definitions to report every referenced Java identifier through an
injectable `IdentifierResolver`.
