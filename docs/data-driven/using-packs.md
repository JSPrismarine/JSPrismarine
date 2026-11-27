---
title: Using packs
group: Documents
category: Guides
---

# Using packs

JSPrismarine loads gameplay content from packs through the `@jsprismarine/packs` package. This page
explains which pack formats load, how to load a stack of them, how conflicts between packs resolve,
and what the loader does and does not check.

## Two pack families

The loader accepts two families of packs, and they play different roles:

- **Bedrock behavior packs define content.** A loose pack folder, a `.mcpack` or `.mcaddon`
  archive, or the layered folder layout BDS ships its vanilla behavior pack in. These are the only
  format that can define a block, item, or entity a Bedrock client renders, so custom content
  always arrives this way. A block or item appears in the creative menu when its
  `description.menu_category` names a category other than `none`. A `group` in the `minecraft`
  namespace, such as `minecraft:itemGroup.name.stairs`, files it under that vanilla heading, and
  any other group gets a heading of its own, as BDS does.
- **Java datapacks configure content.** A folder or zip with `pack.mcmeta` and `data/` at its
  root. A datapack almost never defines a block or item; it references existing ones to configure
  loot tables, recipes, advancements, tags, enchantments, damage types, predicates, and item
  modifiers.

The split follows the [data-driven vanilla plan](../plans/data-driven-vanilla.md): a `.mcpack` or
`.mcaddon` defines content, a datapack configures it.

## Loading a stack

A `PackStack` is an ordered list of pack sources. `load(stack)` reads every pack, composes the
definitions, and returns them together with a diagnostics report:

```typescript
import { load, reportIdentifiers, VANILLA_BEHAVIOR_PACK_UUID } from '@jsprismarine/packs';

const { definitions, diagnostics } = load([
    { kind: 'brarchiveLayers', path: 'bds/behavior_packs', uuids: [VANILLA_BEHAVIOR_PACK_UUID] },
    { kind: 'archive', path: 'my-addon.mcaddon' },
    { kind: 'directory', path: 'worlds/world/behavior_packs/overrides' },
    { kind: 'datapack', path: 'worlds/world/datapacks/gameplay-tweaks' }
]);

definitions.entities.get('minecraft:zombie');
definitions.lootTablesJava.get('minecraft:blocks/stone');
```

Each stack member is one of four source kinds:

| Kind              | What it reads                                                                 |
| ----------------- | ----------------------------------------------------------------------------- |
| `directory`       | A loose Bedrock pack folder with `manifest.json` at its root                   |
| `archive`         | A `.mcpack` (one pack) or `.mcaddon` (packs as nested `.mcpack` files or folders) |
| `brarchiveLayers` | A folder of layered pack folders (`vanilla`, `vanilla_1.14`, ...) as BDS ships |

`brarchiveLayers` takes an optional `uuids`, the header UUIDs to keep. BDS ships chemistry, editor
and experimental packs in the same folder as the 68 vanilla layers, and all 68 vanilla folders
declare one header UUID, so `[VANILLA_BEHAVIOR_PACK_UUID]` selects vanilla and nothing else. That
is what the server loads by default. Omit `uuids` to compose every folder, which also pulls in
chemistry — whose `reducer_*` recipes override eight vanilla ones, since every versioned layer
sorts after every unversioned one.
| `datapack`        | A Java datapack folder or zip with `pack.mcmeta` and `data/`                   |

`definitions` is a `Definitions` object: one map per registry, from identifier to the winning
parsed definition. The Bedrock registries are blocks, items, entities, loot tables, trade tables,
spawn rules, recipes, biomes, features, feature rules, and the item catalog. The Java registries
are `lootTablesJava`, `recipesJava`, `advancements`, `tags`, `enchantments`, `damageTypes`,
`predicates`, `itemModifiers`, `functions`, `dimensionTypes`, and `dimensions`, keyed by namespaced
id, and `worldgen`, keyed by `<kind>/<namespaced id>` such as `noise_settings/minecraft:overworld`.

## Precedence: later pack wins, whole replacement

Packs apply in stack order. When two packs define the same identifier in the same registry, the
later pack wins, and its definition replaces the earlier one whole. The loader never merges two
definitions of the same identifier, so you cannot override a single component of a vanilla entity
by shipping a file that contains only that component; ship the complete definition you want.

The one exception is Java tags. Tag files merge across packs: a later pack's `values` append to
the earlier ones, unless the later file sets `"replace": true`, which discards everything earlier.
This is vanilla Java's rule, applied unchanged.

A behavior pack's `item_catalog/crafting_item_catalog.json` is not replaced whole either: the
server merges it into the vanilla creative menu, as the Bedrock Dedicated Server does. A group with
a `group_identifier` joins the vanilla heading of the same name on its tab, where
`minecraft:itemGroup.name.planks` names `itemGroup.name.planks`, or becomes a new heading after the
tab's last one. A group without one adds its items as loose entries at the end
of the tab. A tab other than `construction`, `nature`, `equipment` or `items` is skipped. Every
pack's catalog is merged, in stack order, and only a later layer of the same pack, one with the
same header UUID, replaces a pack's file.

## Datapack specifics

The Java side targets the data pack format of the Java release the server runs, and only that
format. The release is the default pinned one, Java <!-- fact:java.version -->26.3<!-- /fact --> at data pack format <!-- fact:java.dataPackFormat -->121.0<!-- /fact -->, unless
`content-java-version` in `config.json` names another pinned release. The server stops at startup
when that setting names a release it cannot load. A release `sources.json` does not pin stops it
with [`PRISMARINE_UNKNOWN_JAVA_RELEASE`](../errors/prismarine/content.md#prismarine-unknown-java-release), which lists the pinned releases; set the key to one of them or leave it
empty for the default. A pinned release whose vanilla datapack is not generated stops it with
[`PRISMARINE_JAVA_RELEASE_NOT_GENERATED`](../errors/prismarine/content.md#prismarine-java-release-not-generated), which gives the `datagen:java --java <release>` command that generates
it. Each world
records the release's data version in its `level.dat`, and a world saved under a newer release
refuses to open under an older one, as Java does. [Java versions](../guide/java-versions.md)
covers the setting, the preview release and the error messages.

- **Format gating.** `pack.mcmeta` parses in both the current `min_format`/`max_format` form and
  the legacy single `pack_format`. A pack whose declared range does not cover that format gets an error
  diagnostic but still loads, so a normal load keeps going while a strict load rejects it.
- **Overlays.** Overlay entries whose format range covers that format apply over the base files in
  declaration order, each overriding whole files.
- **Directory names.** Files route into registries by the singular directory names Java has used since 1.21 under
  `data/<namespace>/`: `loot_table`, `recipe`, `advancement`, `enchantment`, `damage_type`,
  `predicate`, `item_modifier`, `slot_source`, `function`, `dimension_type`, `dimension`, `tags`, and the
  `worldgen/<kind>` directories the package README lists. A file like
  `data/minecraft/loot_table/blocks/stone.json` registers as `minecraft:blocks/stone` in
  `lootTablesJava`, and `data/minecraft/worldgen/world_preset/normal.json` registers as
  `world_preset/minecraft:normal` in `worldgen`. Packs written with the pre-1.21 plural directory
  names will not route and are silently skipped, which is one more reason to read the diagnostics
  report.
- **Tag merging.** As above: values concatenate across packs in order, and `replace` discards the
  earlier values.

## Diagnostics and strict mode

`load` never throws for a bad pack by default. Every problem, from a missing manifest to an
invalid filter expression, becomes a `Diagnostic` in the returned report, with a severity, a
stable code such as `manifest.invalid` or `definition.invalid-json`, the pack it belongs to, and
the file where one applies. Repeated findings deduplicate, so a pack-wide pattern such as an
unknown component name is reported once per pack rather than once per file.

Pass `strict: true` to fail instead of report:

```typescript
import { load, PackLoadError } from '@jsprismarine/packs';

try {
    load(stack, { strict: true });
} catch (error) {
    if (error instanceof PackLoadError) console.error(error.diagnostics);
}
```

A strict load throws `PackLoadError` when any diagnostic is reported, and the error carries the
full report. Use it in tests and CI, where a quietly skipped pack is worse than a failure.

## The identifier report

Datapack definitions reference Java identifiers everywhere: items in loot entries, blocks in
predicates, tag members. `reportIdentifiers(definitions)` walks the loaded Java definitions and
lists every referenced identifier with how often it appears and how it resolves:

```typescript
const referenced = reportIdentifiers(definitions);
// [{ registry: 'item', id: 'minecraft:diamond', resolution: 'unknown', references: 12 }, ...]
```

Each entry resolves to `known` (maps to a Bedrock identifier), `loss` (on the reviewed loss list),
or `unknown`. The default resolver marks everything `unknown`, which makes the report a complete
inventory of every Java identifier your datapacks reference. Pass an `IdentifierResolver` backed
by [`@jsprismarine/mapping`](./mapping.md) to find out which of those references actually
translate to this Bedrock runtime; an identifier that stays `unknown` with a real resolver is one
the server cannot represent.

## Current limits

Be aware of what this loader does not do yet:

- **Validation is structural only.** The validator checks required keys and container types per
  registry (a block file needs a `format_version`, a wrapper, and a `description.identifier`; a
  tag file needs a `values` array) and parses every `filters` block with the full Bedrock filter
  grammar. It does not validate against the full Bedrock or Java schemas, so a well-shaped file
  with a wrong value loads without complaint. Unknown keys load and are reported once per pack.
  You can pass your own `validator` in the load options to replace the structural one with
  schema-based validation.
- **Binary MCB files are skipped.** Some vanilla definition files ship as binary MCB. The loader
  reports each one with a warning (`definition.mcb`) and skips it; take the JSON version from
  bedrock-samples instead.
- **Scripts never execute.** The loader reads definitions only. A pack's JavaScript is never run,
  so script-driven behavior in an addon does nothing on this server.
