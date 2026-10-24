# @jsprismarine/packs

Loads a Bedrock pack stack into one set of per-registry definitions.

A `PackStack` is an ordered list of pack sources: a loose pack folder, a `.mcpack` or `.mcaddon`
archive, or a folder of brarchive layers the way BDS ships the vanilla behavior pack. `load(stack)`
returns a `Definitions` object, which maps identifier to winning parsed definition for each registry
(blocks, items, entities, loot tables, trade tables, spawn rules, recipes, biomes, features,
feature rules, item catalog), plus a diagnostics report. A later pack wins by identifier and its
definition replaces the earlier one whole; nothing merges.

```typescript
import { load } from '@jsprismarine/packs';

const { definitions, diagnostics } = load([
    { kind: 'brarchiveLayers', path: 'bds/behavior_packs' },
    { kind: 'archive', path: 'my-addon.mcaddon' },
    { kind: 'directory', path: 'worlds/world/behavior_packs/overrides' }
]);

definitions.entities.get('minecraft:zombie');
```

Behind the interface: manifest validation against the documented schema, a lenient JSON parser
(comments and trailing commas, which vanilla trade tables use), `format_version` dispatch, a
brarchive reader, a zip reader for `.mcpack`/`.mcaddon`, and the Bedrock filter grammar in both its
string form and the integer `subject`/`operator` encoding the 1.26 serializer writes.

Validation in this version is structural (required keys and container types per registry). Pass
`validator` in the load options to replace it, for example with schema-based validation. Unknown
keys load anyway and are reported once per pack; `strict: true` turns any diagnostic into a
`PackLoadError`.
