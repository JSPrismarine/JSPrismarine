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
`advancements`, `tags`, `enchantments`, `damageTypes`, `predicates`, `itemModifiers`, `functions`,
keyed by namespaced id, from the 26.3 singular directory names) resolve by Java's rule: a later pack
wins per file, except tags, whose values merge across packs unless a later file sets `replace`.

`functions` is the one registry whose `data` is not parsed JSON. A `.mcfunction` is text, so its
definition carries the file verbatim and `@jsprismarine/mcfunction` compiles it; a validator is
never asked about one, because the line format is not a JSON shape.

`load` opens only the Bedrock files a registry owns. A pack folder holds much else - the composed
vanilla pack ships 1311 `.nbt` structures, a 3 MB `level.dat` and its textures beside 2588 readable
files - and a path no registry routes could never reach the result anyway. `expandSource`, the
reader underneath, still returns a pack whole by default and takes a `PackFileFilter` for a caller
that wants less.

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
current `min_format`/`max_format` form and the legacy single `pack_format`. A pack whose range
misses 121.0 is reported and still loaded, so a strict load rejects it while a normal load keeps
going.

A declared overlay directory is never content on its own: it leaves the base view whether or not
its range applies. The overlays whose range covers 121.0 then apply in declaration order, each
overriding whole files, so a later entry wins over an earlier one and every entry wins over the
base. Within one pack an overlay replaces the base file outright, tags included, because merging is
what happens between packs. A declared overlay holding no files is reported as a warning, since a
misspelled directory name otherwise does nothing in silence.

Between packs, each registry composes by its own merge mode, Java's three: `override` takes the
last pack that has the file, `tags` concatenates `values` and clears what came before whenever a
pack sets `replace`, and `assign` merges key by key. `MERGE_MODES` holds the mode per registry and
`mergeJavaDefinition` applies it. Every 26.3 data registry but tags overrides; `assign` is the mode
Java gives its language files, which live in a resource pack.

Datapack definitions reference Java identifiers (items in loot entries, blocks in predicates, tag
members); `reportIdentifiers` walks the loaded definitions and resolves each reference. Two things
answer. An injectable `IdentifierResolver` takes the Bedrock side, and its default marks everything
`unknown`; `@jsprismarine/mapping` is the implementation that fills it. What the resolver does not
know falls back to the loaded stack itself, which closes a `#tag` whose tag file it carries and a
reference into a registry a datapack fills, such as one loot table calling another. Those stay
Java-shaped inside the server, so there is nothing to translate. Each entry says which answered,
and names the pack and the file the reference came from.

The one field name 26.3 reuses is `id`, which spells an item stack, a damage type tag entry, a mob
effect instance, a block state and an attribute modifier's own name. Which registry it points into
is read from the keys beside it rather than from the name.

Behind the interface: manifest validation against the documented schema, a lenient JSON parser
(comments and trailing commas, which vanilla trade tables use), `format_version` dispatch, a
brarchive reader, a zip reader for `.mcpack`/`.mcaddon`, and the Bedrock filter grammar as the
vanilla files write it. That means the string form, the integer `subject`, `operator` and `domain`
encoding the 1.26 serializer writes, a group map carrying more than one combinator (read as an
`all_of` over its clauses), a combinator holding one test instead of an array, and the legacy
shorthand that names the test in the key, as the skeleton's `{"other_with_families": "lightning"}`
does.

Validation has two layers. `structuralValidator`, the default, checks required keys and container
types per registry and parses every `filters` key with the filter grammar. `bedrockSchemaValidator`
checks a definition against Mojang's own JSON Schema for its registry and `format_version`.
`composeValidators` joins them, and `validator` in the load options takes the result:

```typescript
import { bedrockSchemaValidator, composeValidators, readBedrockSchemas, structuralValidator } from '@jsprismarine/packs';

const validator = composeValidators(structuralValidator, bedrockSchemaValidator(readBedrockSchemas(samplesCheckout)));
```

The schemas are read off disk rather than bundled, because `bedrock-samples/LICENSE.md` reserves all
rights; `pnpm --filter @jsprismarine/bedrock-data run fetch:sources` puts a checkout in the cache.
A file picks its schema by the engine's own rule, the same version or the closest one that is not
greater, and a file older than every published schema checks against none. Mojang publishes a root
document for entities, items, blocks, biomes, spawn rules and the crafting catalog; recipes, loot
tables, trade tables, features and feature rules have none and keep the structural checks alone.

One repair is applied to the schemas as they load: every `oneOf` reads as `anyOf`. Mojang's
generator writes a variant union as `oneOf`, which JSON Schema reads as "exactly one", and the
variants overlap. `Filter Group Map` is `"type": "object"` with no required key, so it matches every
object and a plain filter test matches two arms at once; `Block Descriptor` lists the same `$ref` as
two of its three arms. Read literally, the published schemas reject 347 files of the vanilla
behavior pack, all of them valid. Read as `anyOf`, the pack validates clean and the arms stay
checked.

The Java half checks against `SpyglassMC/vanilla-mcdoc` through `@spyglassmc/mcdoc`, from
`@jsprismarine/packs/mcdocValidator`:

```typescript
import { composeValidators, structuralValidator } from '@jsprismarine/packs';
import { createMcdocValidator } from '@jsprismarine/packs/mcdocValidator';

const validator = composeValidators(structuralValidator, await createMcdocValidator({ root: mcdocCheckout }));
```

Construction is asynchronous because binding the schema modules is; the validator it returns is
synchronous, so `load` stays synchronous. vanilla-mcdoc gates fields by release with `#[since=]`
and `#[until=]`, so the release decides what the checker accepts: the 26.3 vanilla datapack reports
one finding at 26.3 and thousands at 26.1. Checking needs no network and no registry contents.
Structure, keys, types, enums, unions, dispatch on `type` and the release gating all work from a
local checkout; what a local run cannot answer is whether an `#[id=(registry=...)]` reference names
something that exists, which is `reportIdentifiers`' question rather than this one's.

A vanilla-mcdoc finding is a warning by default, where a bedrock-samples finding is an error. The
asymmetry is the provenance: Mojang's schemas describe Mojang's data, while vanilla-mcdoc is a
community reconstruction that trails Mojang's releases. At 26.3 it rejects
`recipe/map_extending.json`, which vanilla ships with `"result": {}` where the schema wants an
`id`, and dropping a shipped vanilla recipe over that is worse than reporting it. Pass
`severity: 'error'` for the stricter reading.

The four `@spyglassmc` packages are optional peer dependencies and `mcdocValidator` is not
re-exported from the package index, because they pull 91 transitive packages that the eleven
workspace packages importing the loader have no use for. Install them to use the validator.

Unknown keys load anyway and are reported once per pack; `strict: true` turns an error into a
`PackLoadError`, and a warning never fails a load.

Repeats of the same pack, code and message collapse into one diagnostic, so a pattern that holds
for a whole pack costs one line of the report rather than one per file. A collapsed diagnostic
carries `occurrences`, the number of files it covers, and `paths`, the first five of them, so the
report still leads to the files.

A Bedrock file that does not parse is an error, unless a later pack in the stack provides the same
pack-relative path. That copy replaces the broken one whole, so the broken file cannot reach the
composed result, and the loader reports it as a warning instead. The shipped vanilla layers need
this: two of them carry an `entities/npc.json` that patches a saved pack rather than defining an
entity, and a later layer carries the real one. The Java side has no such rule, because its tags
merge across packs instead of replacing one another.
