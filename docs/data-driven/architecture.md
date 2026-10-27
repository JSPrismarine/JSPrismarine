---
title: Data-driven architecture
group: Documents
category: Guides
---

# Data-driven architecture

This page explains how the data-driven system is put together: what a pack stack is, what loading
one produces, how definitions become running content, why a single module owns the Java to Bedrock
translation, and which parts of this exist in the repository today. The design source is
[the data-driven vanilla plan](../plans/data-driven-vanilla.md), sections 5 and 7.

## The pack stack

A pack stack is the ordered list of content a world runs, and it holds two kinds of member.
Bedrock packs (the vanilla behavior pack as BDS ships it, this project's overlay, world packs,
plugin packs) define content: blocks, items, entities, biomes, spawn rules, trade tables. Java
datapacks (the vanilla datapack from Mojang's data generator, world datapacks, plugin datapacks)
configure that content: loot tables, recipes, advancements, tags, enchantments, damage types,
predicates and item modifiers.

The split follows what each format can express. A Java datapack almost never defines a block, item
or entity; it references vanilla ones. A Bedrock pack is the only format of the two that can define
content a Bedrock client renders, because a Bedrock client learns about custom content exclusively
from a downloaded resource pack and NBT in `StartGamePacket` and `ItemRegistryPacket`.

`@jsprismarine/packs` (in `packages/packs/`) owns loading. Its `load(stack)` function takes the
ordered list and returns a `Definitions` object, one map from identifier to winning parsed
definition per registry, plus a diagnostics report. Each format keeps its own precedence rules
within its half: Bedrock registries resolve by identifier with a later pack replacing an earlier
definition whole, while Java registries resolve per file, except tags, whose values merge across
packs unless a later file sets `replace`. [using-packs.md](using-packs.md) covers the loader in
detail.

## Definitions, types and instances

The runtime distinguishes three stages of the same content.

A definition is parsed, validated, immutable JSON for one identifier, exactly as the winning pack
provided it. A type is a definition resolved against the component registries once at load time,
with behavior hooks bound and frequently checked flags computed. An instance is the live thing in
the world: a block state in a chunk, an item stack, or an entity.

Resolution flattens the values the server checks on every tick into typed arrays indexed by
runtime id: solidity, light emission and filtering, blast resistance, friction, random tick,
support and liquid rules. The values in those arrays come from the Java jar dump rather than
Bedrock's component grammar, because the grammar cannot hold Java's values. Bedrock's
`minecraft:friction` component is documented as capping at 0.9 while Java's blue ice has friction
0.989, so the table is this project's own shape. [block-properties.md](block-properties.md)
describes the table.

## Components and behaviors

A component is one documented component name bound to a TypeScript class with a parameter schema
and hooks. Each domain (blocks, items, entities) has a registry the server fills with the vanilla
components and plugins extend with their own.

Behavior that data cannot express binds by family in this project's own overlay namespace.
Mojang's `minecraft:custom_components` hook is read as one more way to name a behavior rather than
the binding mechanism, because Mojang has deprecated version 1 of that hook and version 2 requires
two experimental toggles. For entities, the component list is the definition's `components`, with
`component_groups` and `events` acting as the state machine, and AI goals as components with a
priority and control flags.

## The Java to Bedrock seam

One module, `@jsprismarine/mapping` (in `packages/mapping/`), owns the knowledge that two editions
exist. Nothing else in the server is allowed to name both.

The seam exists because the two halves of the format decision meet in the middle: Java-shaped data
(a loot table dropping `minecraft:oak_log` with Java state `axis=x`) has to land on Bedrock-shaped
registries (`minecraft:oak_log` with Bedrock state `pillar_axis=x`). The translation is one-way,
Java into Bedrock, and the asymmetry is the reason it is tractable. Java data references content;
Bedrock packs define it. References need a lookup table, definitions need none, and a server never
performs the reverse trip, so the 11000 hand-written lines a bidirectional model like Chunker's
costs are avoided entirely. The research measured the fit: all 35723 Java 26.3 block states resolve
to a real entry in Bedrock's 22091-state palette, and exactly 5 Java states have no Bedrock
concept.

The interface is four lookup functions (block state, item, entity type, and identifier per
registry), each returning a typed result rather than `undefined`: `mapped`, a reviewed `loss` with
a reason and a reference, `passthrough`, or `unknown`. The tables behind them are generated from
the pinned GeyserMC/mappings commit and committed to the repository, so a version bump regenerates
them and the diff is reviewable. Three rules keep the seam honest: the loader refuses a Java
identifier with neither a mapping nor a loss entry, every loss is a reviewed row with a reason, and
the tables are generated rather than hand-maintained. [mapping.md](mapping.md) covers the package.

## Registries

Each domain gets one registry shape holding the resolved types, with tags merged across the stack.
The client-facing packets (`ItemRegistryPacket`, the block properties NBT in `StartGamePacket`,
`CreativeContentPacket`) are written from the registries, which is what will give plugins custom
blocks and items on the wire. Storage stays Bedrock-shaped on disk, so existing worlds remain
readable throughout the migration.

## Where each subsystem lives

| Subsystem | Location |
| --- | --- |
| Pinned sources, fetch, Java dump, captured goldens, generated data | `packages/bedrock-data/` |
| Pack stack loading, both formats | `packages/packs/` |
| Java to Bedrock mapping tables and the block property table | `packages/mapping/` |
| Molang parsing, compilation and evaluation | `packages/molang/` |
| The registry and holder types every domain is built on | `packages/content/` |
| Blocks and items, with the behavior families bound to them | `packages/blocks/`, `packages/items/`, `packages/block-behaviors/`, `packages/item-behaviors/` |
| Entities, their goals, the Java brains, spawn rules and trading | `packages/entities/`, `packages/entity-goals/`, `packages/entity-brains/`, `packages/spawning/`, `packages/trading/` |
| Java's gameplay data: loot, recipes, advancements, enchantments, predicates | `packages/loot/`, `packages/recipes/`, `packages/advancements/`, `packages/enchantments/`, `packages/predicates/` |
| Commands and the `.mcfunction` runtime | `packages/commands/`, `packages/mcfunction/` |
| The systems neither edition publishes as data, and light | `packages/engine-systems/`, `packages/lighting/` |
| Terrain, decoration and structures | `packages/worldgen/`, `packages/features/`, `packages/structures/` |
| The registries turned into client packets | `packages/wire/` |
| Parity test suite and dashboard | `packages/parity/` |
| The composition root that joins all of it to a running server | `packages/prismarine/src/content/` |

## What exists today

The pack stack is no longer optional. Every server composes one, resolves each content domain
against it and runs on the result, and a stack that will not load stops the server at startup
because nothing is left behind it to fall back to. The composition root in
`packages/prismarine/src/content/` is the only place that knows all the domains exist; its
[README](../../packages/prismarine/src/content/README.md) gives the order they have to be built in
and what one build produces.

Blocks, items, entities, recipes, loot, advancements, enchantments, spawn rules, trade tables,
biomes and features all come out of the stack, and the client-facing packets are written from the
resulting registries. The old mob class hierarchy is gone. Hand-written actor classes now cover
players, dropped items, and projectiles restored from older saves; TNT and falling blocks run from
their vanilla entity definitions.

The numbers and the gaps live on the page for each subsystem rather than here, because that is
where they are kept current: [gameplay-data.md](gameplay-data.md) for the Java data,
[entities.md](entities.md) for mobs, [block-properties.md](block-properties.md) for the per-state
table, [structures.md](structures.md) and [engine-systems.md](engine-systems.md) for the world, and
[commands.md](commands.md) for the command set. Each of them says what it will not do yet.
