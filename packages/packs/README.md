# @jsprismarine/packs

Loads a pack stack, Bedrock packs and Java datapacks together, into one set of per-registry
definitions.

A `PackStack` is an ordered list of pack sources. The Bedrock kinds are a loose pack folder, a
`.mcpack` or `.mcaddon` archive, and a folder of brarchive layers the way BDS ships the vanilla
behavior pack; the Java kind is a datapack folder or zip. `load(stack)` returns a `Definitions`
object, which maps identifier to winning parsed definition for each registry, plus a diagnostics
report. The Bedrock registries (blocks, items, entities, loot tables, trade tables, spawn rules,
recipes, biomes, features, feature rules, item catalog) resolve by identifier: a later pack wins and
its definition replaces the earlier one whole. The Java registries (`lootTablesJava`, `recipesJava`,
`advancements`, `tags`, `enchantments`, `damageTypes`, `predicates`, `itemModifiers`, keyed by
namespaced id, from the 26.3 singular directory names) resolve by Java's rule: a later pack wins per
file, except tags, whose values merge across packs unless a later file sets `replace`.

```typescript
import { load, reportIdentifiers } from '@jsprismarine/packs';

const { definitions, diagnostics } = load([
    { kind: 'brarchiveLayers', path: 'bds/behavior_packs' },
    { kind: 'archive', path: 'my-addon.mcaddon' },
    { kind: 'directory', path: 'worlds/world/behavior_packs/overrides' },
    { kind: 'datapack', path: 'worlds/world/datapacks/gameplay-tweaks' }
]);

definitions.entities.get('minecraft:zombie');
definitions.lootTablesJava.get('minecraft:blocks/stone');

// Every Java identifier the loaded datapacks reference, for the mapping layer.
const referenced = reportIdentifiers(definitions);
```

The Java side targets data pack format 121.0 (Java 26.3) exactly. `pack.mcmeta` parses in both the
current `min_format`/`max_format` form and the legacy single `pack_format`, and overlays apply when
their format range covers 121.0. A pack whose range misses 121.0 is reported and still loaded, so a
strict load rejects it while a normal load keeps going. Datapack definitions reference Java
identifiers (items in loot entries, blocks in predicates, tag members); `reportIdentifiers` walks
the loaded definitions and resolves each reference through an injectable `IdentifierResolver`, whose
default marks everything `unknown` until a mapping implementation takes the seam.

Behind the interface: manifest validation against the documented schema, a lenient JSON parser
(comments and trailing commas, which vanilla trade tables use), `format_version` dispatch, a
brarchive reader, a zip reader for `.mcpack`/`.mcaddon`, and the Bedrock filter grammar as the
vanilla files write it. That means the string form, the integer `subject`, `operator` and `domain`
encoding the 1.26 serializer writes, a group map carrying more than one combinator (read as an
`all_of` over its clauses), a combinator holding one test instead of an array, and the legacy
shorthand that names the test in the key, as the skeleton's `{"other_with_families": "lightning"}`
does.

Validation in this version is structural (required keys and container types per registry) on both
sides. Pass `validator` in the load options to replace it, for example with schema-based validation:
on the Bedrock side the bedrock-samples schemas, on the Java side `vanilla-mcdoc` through
`@spyglassmc/mcdoc`, which this package does not depend on because the mcdoc checker runs inside a
Spyglass project service and fetches its schema tarball at runtime. Unknown keys load anyway and are
reported once per pack; `strict: true` turns an error into a `PackLoadError`, and a warning never
fails a load.

A Bedrock file that does not parse is an error, unless a later pack in the stack provides the same
pack-relative path. That copy replaces the broken one whole, so the broken file cannot reach the
composed result, and the loader reports it as a warning instead. The shipped vanilla layers need
this: two of them carry an `entities/npc.json` that patches a saved pack rather than defining an
entity, and a later layer carries the real one. The Java side has no such rule, because its tags
merge across packs instead of replacing one another.
