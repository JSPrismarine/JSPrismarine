---
'@jsprismarine/entities': patch
'@jsprismarine/packs': patch
---

Load the shipped vanilla pack stack in strict mode, and report the files behind a collapsed
diagnostic.

A Bedrock definition file that fails structural parsing is still an error, unless a later pack in
the stack provides the same pack-relative path. That copy replaces the broken one whole, so the
broken file cannot reach the composed result and a warning is enough. The BDS vanilla layers need
this rule: two of them carry an `entities/npc.json` that patches a saved pack rather than defining
an entity, and the 1.20.80 layer carries the real one. Strict mode now fails on errors alone, which
is what `DiagnosticSeverity` already documented, so `load(bdsVanillaLayers, { strict: true })`
succeeds.

`DiagnosticCollector` still collapses repeats of one pack, code and message into a single
diagnostic, because a pack-wide pattern should cost one line of the report. A collapsed diagnostic
now carries `occurrences`, the number of files it covers, and `paths`, the first five of them, so a
per-file finding that happens 28 times no longer reads as one.

`@jsprismarine/entities` drops `normalizeFilterSource`, which rewrote two vanilla filter shapes the
packs grammar once rejected and now accepts. All 982 filter values in the BDS layers and
bedrock-samples parse to the same result without it. `parseEntityFilter` is the packs parser under
the entities name.
