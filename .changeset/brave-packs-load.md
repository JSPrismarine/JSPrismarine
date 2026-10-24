---
'@jsprismarine/packs': patch
---

Add `@jsprismarine/packs`, the Bedrock pack stack loader. `load(stack)` composes directory packs,
`.mcpack`/`.mcaddon` archives and brarchive layer sets into per-registry definition maps where a
later pack wins by identifier, and reports diagnostics instead of failing unless `strict` is set.
It parses lenient JSON (comments, trailing commas), validates manifests against the documented
schema, dispatches on `format_version`, and parses the Bedrock filter grammar in both the string
form and the integer `subject`/`operator` encoding.
