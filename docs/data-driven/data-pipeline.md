---
title: The data pipeline
group: Documents
category: Guides
---

# The data pipeline

The data-driven system runs on tables generated from upstream publications: Mojang's Bedrock
Dedicated Server zip, Mojang/bedrock-samples, the Java Edition server jar, and GeyserMC's mapping
tables. The pipeline that turns those publications into committed goldens and generated data has
five stages, owned by `@jsprismarine/bedrock-data` (in `packages/bedrock-data/`) with the mapping
generators in `packages/mapping/`. This page documents the stages as they exist in code today;
[the plan](../plans/data-driven-vanilla.md) (section 6) describes where later phases extend them.

## Pin

`packages/bedrock-data/sources.json` is the manifest. Every entry is a version, a URL and a hash,
so a build is reproducible and an edition bump is an edit to this one file. The pins:

- `bds`: the Linux Bedrock Dedicated Server 1.26.51.1 zip, the only publication with features,
  feature rules, structures and worldgen data, with its measured sha256.
- `bedrockSamples`: Mojang/bedrock-samples at tag v1.26.50.4, the plain-JSON publication of the
  vanilla packs, read for data the BDS zip stores as undocumented binary.
- `javaServer`: the Java Edition 26.3 server jar, with Mojang's own sha1 from piston-meta plus a
  measured sha256. Its data generator emits the vanilla datapack and the reports.
- `geyserMappings`: the GeyserMC/mappings commit the mapping tables are generated from.
- `cloudburstData`: a cross-reference recording the CloudburstMC/Data commit the `src/resources`
  submodule pins; the submodule pointer is the authority.

The Java dumper currently keeps its own copy of the Java pin in constants at the top of
`packages/bedrock-data/utils/java-dump/run.mjs`; a bump edits both until they are merged.

## Fetch

```sh
pnpm --filter @jsprismarine/bedrock-data run fetch:sources
```

This downloads each source into `node_modules/.cache/jsprismarine/<source>/<version>/`, verifies
the hash before unpacking, and skips sources whose verified content is already cached. It then
writes `packages/bedrock-data/pack-hashes.json`, a sha256 per top-level folder of each source, so a
version bump shows in review which folders actually changed.

For offline work, four environment variables point the pipeline at local copies and bypass the
download: `JSP_BDS_PATH`, `JSP_JAVA_JAR_PATH`, `JSP_BEDROCK_SAMPLES_PATH` and
`JSP_GEYSER_MAPPINGS_PATH`.

## Compose

```sh
pnpm --filter @jsprismarine/bedrock-data run datagen:java
```

This runs Mojang's data generator (`net.minecraft.data.Main --server --reports --all`) against the
fetched Java server jar, whose sha1 it re-checks against `sources.json` before executing it. One
run writes both halves of the Java data, into the same cache the fetch stage uses:

- `node_modules/.cache/jsprismarine/vanilla-datapack/<version>/`, the vanilla datapack, 8372 files.
  `@jsprismarine/packs` loads it as the Java member of the pack stack, the overworld generator
  reads its `worldgen/*` registries and block tags, and the loot, advancement, predicate,
  enchantment and feature corpus suites read it.
- `node_modules/.cache/jsprismarine/java-reports/<version>/generated/reports/`, the data reports,
  1666 files. The mapping and item table generators read them, and the overworld generator reads
  `biome_parameters` from them, the 7594 climate boxes that exist nowhere else.

The generator writes no `pack.mcmeta`, so the step writes one from the `pack_version` the jar
declares in its `version.json` (121.0 for 26.3). That file is what marks the directory as a
loadable datapack for every reader above. The same `version.json` names the JDK the jar needs
(Java 25 for 26.3), found through `JSP_JAVA_HOME`, `JAVA_HOME` or, on macOS,
`/usr/libexec/java_home`.

A second run is a no-op once both directories hold the files the step checks for; `-- --force`
regenerates. The output is Mojang's content and stays in the gitignored cache.
`JSP_VANILLA_DATAPACK` and `JSP_JAVA_REPORTS` point consumers at a copy produced elsewhere.

The other half of composition is unchanged: the fetch stage hashes each source's folders into
`pack-hashes.json`, and `@jsprismarine/packs` reads the vanilla behavior pack's brarchive layers
directly when a stack loads, so there is no separate composed-pack artifact yet.

## Dump

```sh
pnpm --filter @jsprismarine/bedrock-data run dump:java
```

This is a capture-time task, run on a Java version bump rather than on every build. It downloads
the pinned server jar through the piston-meta manifest chain, verifies its sha1, unpacks the
bundler, compiles `utils/java-dump/DumpJavaData.java` against the server classes, runs it, and
rewrites the goldens under `packages/bedrock-data/src/jsp/java/`:

- `block_properties.json`: the per-state block properties no Mojang report carries (hardness, blast
  resistance, friction, light, map color, sound type, push reaction and the rest) for all 1286
  blocks, with state-invariant values once per block and per-state differences under
  `stateOverrides`.
- `entity_attributes.json`: the default attribute values, dimensions and category for the 93 entity
  types with an attribute supplier.

The dumper needs a JDK matching the jar's class file version (Java 25 for 26.3). It shares the
search in `utils/java/jdk.ts` with the compose stage, which looks at `JSP_JAVA_HOME`, `JAVA_HOME`
and, on macOS, `/usr/libexec/java_home`. `src/javaGoldens.test.ts` checks the shape and counts of
both files.

The Bedrock-side captures under `packages/bedrock-data/src/jsp/` come from running the pinned BDS
with `packages/client/tools/capture-server-data.mjs`, which is likewise a version-bump task rather
than a build step.

## Generate

Three generators turn the fetched sources and committed goldens into the tables the server reads.

```sh
pnpm --filter @jsprismarine/bedrock-data run generate
```

runs `utils/build.js`, which reads the resources submodule and writes the JSON files under
`packages/bedrock-data/src/generated/` (gitignored, regenerated by every build). It refuses to emit
when two sources disagree on a name.

```sh
pnpm --filter @jsprismarine/mapping run generate:tables
```

regenerates the committed mapping tables under `packages/mapping/src/tables/` from the fetched
sources: GeyserMC's `blocks.nbt` joined against Mojang's `reports/blocks.json`, GeyserMC's
`items.json` and `biomes.json`, and this repository's own BDS captures as the Bedrock source of
truth. When the Java reports are missing from the cache, the generator runs Mojang's data generator
against the hash-verified jar, which needs a JDK of at least version 25. It refuses to emit when
any Java identifier has neither a mapping nor a reviewed loss entry, or when any produced Bedrock
state is missing from the pinned palette.

```sh
pnpm --filter @jsprismarine/mapping run generate:block-properties
```

flattens the Java block property golden through the block mapping into
`packages/mapping/src/tables/blockProperties.json`, keyed by Bedrock state. It needs only committed
inputs, no fetched sources.

## Running the server from the pipeline

The data-driven overworld generator reads both halves of the Java data, so a development server
needs the fetch and compose stages before `pnpm dev`:

```sh
pnpm --filter @jsprismarine/bedrock-data run fetch:sources
pnpm --filter @jsprismarine/bedrock-data run datagen:java
pnpm dev
```

Without them the generator throws and names those two commands, and the pack stack reports the
Java vanilla datapack as missing.

## A version bump, step by step

1. Edit `packages/bedrock-data/sources.json` with the new versions, URLs and hashes, and the Java
   pin constants in `utils/java-dump/run.mjs` if the Java version moved.
2. Run `pnpm --filter @jsprismarine/bedrock-data run fetch:sources` and review the
   `pack-hashes.json` diff to see which upstream folders changed.
3. If the Java version moved, run `pnpm --filter @jsprismarine/bedrock-data run datagen:java` to
   replace the cached datapack and reports, then `pnpm --filter @jsprismarine/bedrock-data run
   dump:java` and update the counts `src/javaGoldens.test.ts` asserts.
4. If the Bedrock version moved, update the resources submodule, refresh the BDS captures with
   `packages/client/tools/capture-server-data.mjs`, and run
   `pnpm --filter @jsprismarine/bedrock-data run generate`.
5. Run `pnpm --filter @jsprismarine/mapping run generate:tables` and
   `pnpm --filter @jsprismarine/mapping run generate:block-properties`, then review the table
   diffs. New losses must be added to the reviewed loss lists before the generator will emit.
6. Run the mapping property tests and the parity suite (`pnpm run test`); they fail on any
   unreviewed gap.

## Licensing

The pipeline fetches Mojang's content (the BDS zip, bedrock-samples, the Java server jar) per
install, verified against the pinned hashes, rather than redistributing it; both editions fall
under the same Minecraft EULA. The GeyserMC mapping data is MIT and is vendored: the generated
tables under `packages/mapping/src/tables/` are committed with the license and scope note
reproduced in `packages/mapping/NOTICE`. Neither GeyserMC nor this repository relicenses Minecraft
or any material owned by Mojang or Microsoft.
