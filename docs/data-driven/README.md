---
title: Data-driven content
group: Documents
category: Guides
---

# Data-driven content

JSPrismarine is moving from hardcoded block, item and entity classes to a server whose content is
built at runtime from data. Blocks, items, entities, recipes, loot, trading, spawning, biomes and
world generation come from packs and generated tables, assembled through a small set of composable
parts. The design is laid out in [the data-driven vanilla plan](../plans/data-driven-vanilla.md);
these pages explain the system for people who have not read the plan or the research behind it.

## The format decision in one paragraph

The runtime model and every identifier are Bedrock-shaped: Bedrock names, Bedrock block states, the
Bedrock palette, and the runtime ids this server already writes. Java Edition is the gameplay data
source wherever Mojang publishes it as data (loot, recipes, advancements, tags, enchantments, item
components, world generation) and, since Java 26.1 ships unobfuscated, also the source for the
block properties and entity stats no Mojang report carries. Both pack formats load: Bedrock
behavior packs define content a Bedrock client can render, and Java datapacks configure it. A
generated mapping table, built from GeyserMC's MIT tables, joins the two editions in one place.

## The parity claim

The project does not claim 1:1 Java parity. The adopted wording, from
[the edition differences research note](../research/edition-behavior-differences.md) (section 14):

> JSPrismarine implements Java Edition's gameplay rules for every behavior a server decides,
> verified against Java Edition's own implementation, and presents them through the Bedrock
> client's model of the world. Where a Java rule has no Bedrock presentation, or where the Bedrock
> client decides the outcome locally, the server implements the behavior the client expects.

The note classifies 278 behavior differences between the editions and enumerates the excluded
categories; [parity.md](parity.md) explains how the claim is tested.

## Reading map

- [architecture.md](architecture.md): the pack stack, definitions and registries, the Java to
  Bedrock seam, where each subsystem lives, and what exists today versus what is planned.
- [data-pipeline.md](data-pipeline.md): the five stages that turn pinned Mojang and GeyserMC
  publications into committed goldens and generated tables, with the real commands.
- [using-packs.md](using-packs.md): loading Bedrock packs and Java datapacks with
  `@jsprismarine/packs`, precedence rules, and diagnostics.
- [molang.md](molang.md): the `@jsprismarine/molang` expression engine that Bedrock pack
  definitions use, with its versioned precedence rules.
- [mapping.md](mapping.md): the `@jsprismarine/mapping` seam between the editions, its four lookup
  functions, the generated tables and the reviewed loss list.
- [parity.md](parity.md): the `@jsprismarine/parity` test suite and dashboard that measure the
  claim above against committed reference data.
- [block-properties.md](block-properties.md): the per-state block property table dumped from the
  Java 26.3 jar and how the server reads it.
