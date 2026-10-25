---
'@jsprismarine/packs': patch
---

Give each Java registry its merge mode and tighten overlay resolution. `MERGE_MODES` records
Java's three modes per registry and `mergeJavaDefinition` applies them, which replaces the
hardcoded tags branch in the datapack loader: `override` takes the last pack that has the file,
`tags` concatenates `values` and clears what came before on `replace`, and `assign` merges key by
key. Every 26.3 data registry but tags overrides.

A declared overlay directory now leaves the base view whether or not its range covers 121.0, so a
pack with only out-of-range overlays no longer carries their directories as content, and an
overlay directory the pack does not hold is reported as a warning rather than silently doing
nothing.
