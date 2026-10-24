---
'@jsprismarine/mapping': patch
---

Add `createPackIdentifierResolver`: the `IdentifierResolver` implementation for the
`@jsprismarine/packs` identifier report, answered from the mapping tables. Items, blocks, entity
types, biomes and enchantments resolve through their lookups, with `mapped` and `passthrough`
reporting as `known` and reviewed losses as `loss`; tag references and uncovered registries report
as `unknown`.
