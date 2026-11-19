---
title: Java versions
description: Which Java Edition release the server's data comes from, how to run another pinned release, and what a world records about it.
group: Documents
category: Guides
outline: [2, 3]
---

# Java versions

JSPrismarine is a Bedrock server, but much of what it runs comes from Java Edition data: world
generation, loot tables, recipes, advancements and the command tree all load from the vanilla Java
datapack. The server loads one Java release's data at a time, and this page explains which release
that is, how to choose another, and what happens to a world when the release changes.

## The release the server runs

By default the server runs Java Edition <!-- fact:java.version -->26.3<!-- /fact -->. Its server jar
declares the numbers everything else follows:

| What                      | Value                                                |
| ------------------------- | ---------------------------------------------------- |
| Data pack format          | <!-- fact:java.dataPackFormat -->121.0<!-- /fact --> |
| World data version        | <!-- fact:java.dataVersion -->5023<!-- /fact -->     |
| JDK needed to generate it | <!-- fact:java.jdk -->25<!-- /fact -->               |

A JDK is needed only to generate the data, which `pnpm dev` does on first start. The server itself
runs on Node.js and never starts Java.

The release list lives in `javaServer` in `packages/bedrock-data/sources.json`, which pins each
release's server jar by hash. `defaultVersion` there names the release above.

## Previews

Besides the default, `sources.json` may pin one preview: a Java snapshot or pre-release tracked
ahead of its release, so the server is ready when the release ships. The pinned preview is
<!-- fact:java.preview.version -->26.4-snapshot-10<!-- /fact -->, at data pack format
<!-- fact:java.preview.dataPackFormat -->128.0<!-- /fact -->.

A preview is for testing. Mojang changes snapshot data from week to week, and the pin moves with
it, so a world saved under a preview may refuse to open under the release that follows (see
[the data version record](#the-data-version-record)). Keep worlds you care about on the default
release.

The server's support for a preview can also trail the preview's data. World generation reads the
preview's datapack, but its output has not been compared with Java's own generator for the
preview ([#3284](https://github.com/JSPrismarine/JSPrismarine/issues/3284)), and some of the
preview's new world generation types are not implemented yet.
[The research note for the pinned preview](../research/java-26.4-snapshot-10-delta.md#verified-but-not-implemented)
lists each known gap with its issue.

## Choosing a release

`content-java-version` in `config.json` picks the release. Leave it empty to run the default, or
name any release `sources.json` pins. This names the pinned preview, or the default when no
preview is pinned:

<!-- fact:java.configExample -->

```json
{
    "content-java-version": "26.4-snapshot-10"
}
```

<!-- /fact -->

The datapack, world generation and data version all follow the setting together. A named release
must be pinned and its data generated, and the server stops at startup rather than fall back to
the default, since that would generate a world for a release nobody asked for:

- [`PRISMARINE_UNKNOWN_JAVA_RELEASE`](../errors/prismarine.md#prismarine-unknown-java-release):
  `sources.json` does not pin the release. The message lists the pinned ones.
- [`PRISMARINE_JAVA_RELEASE_NOT_GENERATED`](../errors/prismarine.md#prismarine-java-release-not-generated):
  the release is pinned but its vanilla datapack is not in the download cache. The message gives
  the command that generates it,
  `pnpm --filter @jsprismarine/bedrock-data run datagen:java --java <release>`.

## The data version record

Each world records in its `level.dat` the Java data version it was last saved with, under
`JSPrismarineJavaDataVersion`. Opening the world under a newer release is an upgrade: the server
updates the record, and chunks generated before blend into the new terrain the way Java's do.

Opening it under an older release is a downgrade, which Java refuses because an older release
cannot read what a newer one wrote. The server refuses too, with
[`PRISMARINE_JAVA_DATA_DOWNGRADE`](../errors/prismarine.md#prismarine-java-data-downgrade). Set
`content-java-version` to the release the world was saved with, or a newer one, or start the
server on another world. A world saved before the record existed has none and opens under any
release.

## Third-party datapacks

A datapack loads against the format of the release the server runs. Its `pack.mcmeta` declares the
formats it supports with `min_format` and `max_format`, or with the legacy single `pack_format`:

```json
{ "pack": { "description": "Gameplay tweaks", "min_format": [121, 0], "max_format": [121, 0] } }
```

A pack whose range does not cover the server's format gets an error diagnostic and still loads,
unless `content-strict` is on, in which case the load fails. To support several releases from one
pack, declare a wide range in `pack` and put the files that differ in overlays. Each entry under
`overlays.entries` names a directory and its own format range, and the server applies the overlays
whose range covers its format over the base files, in declaration order, each replacing whole
files. [Using packs](../data-driven/using-packs.md#datapack-specifics) covers the rest of how a
datapack loads.

## Upgrading

Bringing up a new Java release or preview is a development task: pin the jar, generate its data,
work through what changed, and regenerate the tables derived from it. The java-bringup skill in
`.agents/skills/java-bringup/SKILL.md` walks through it, and
[the data pipeline](../data-driven/data-pipeline.md) explains each stage it runs.
