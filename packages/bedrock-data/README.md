# @jsprismarine/bedrock-data

[![License](https://img.shields.io/github/license/JSPrismarine/JSPrismarine)](https://github.com/JSPrismarine/JSPrismarine/blob/master/LICENSE)
[![Join the Discord Server](https://img.shields.io/discord/704967868885762108?color=%237289DA&label=Discord)](https://discord.gg/6w8JWhy)
[![npm](https://img.shields.io/npm/dt/@jsprismarine/bedrock-data)](https://www.npmjs.com/package/@jsprismarine/bedrock-data)

Minecraft Bedrock game data exported in a nodejs friendly way.

## Where the data comes from

- `src/jsp/` is captured from a Bedrock Dedicated Server 1.26.51.1 by
  `packages/client/tools/capture-server-data.mjs`. The item table and the three payloads a client
  refuses to join without live here.
- `src/resources/` is a Git submodule, [CloudburstMC/Data](https://github.com/CloudburstMC/Data),
  pinned to the commit that dumped 1.26.50. `utils/build.js` reads the creative menu, the actor
  identifiers, and the two item columns the capture does not record: each item's version and
  its component NBT.
- `src/vendor/` is data neither of the two carries, copied from projects that do. See
  [its README](src/vendor/README.md) for the source and license of each file.
- `src/jsp/java/` is dumped from the Java Edition 26.3 server jar, which Mojang ships
  unobfuscated since 26.1. `block_properties.json` holds the per-state block properties no
  Mojang report carries (hardness, blast resistance, friction, light, map color, sound type,
  push reaction, instrument, fire odds and the rest), with state-invariant values once per
  block and per-state differences under `stateOverrides`. `entity_attributes.json` holds the
  default attribute values, dimensions and category for the 93 entity types with an attribute
  supplier. See the next section for how to refresh them.

## Refreshing the Java goldens

`pnpm run dump:java` is a capture-time task, run on a Java version bump rather than as part of
the build. It downloads the pinned server jar through the piston-meta manifest chain, verifies
its sha1, unpacks the bundler, compiles `utils/java-dump/DumpJavaData.java` against the server
classes, runs it, and rewrites the two files under `src/jsp/java/`. Everything downloaded stays
under `node_modules/.cache/jsprismarine/java/`.

The pinned version, its sha1 and the manifest URL are constants at the top of
`utils/java-dump/run.mjs`. The dumper needs a JDK matching the jar's class file version (Java 25
for 26.3); the script finds one through `JSP_JAVA_HOME`, `JAVA_HOME` or, on macOS,
`/usr/libexec/java_home`. `src/javaGoldens.test.ts` checks the shape of both files and the
counts measured in `docs/research/java-code-only-behavior.md`; a version bump updates those
counts with the goldens.

## Pinned upstream sources

`sources.json` pins the upstream publications the data pipeline reads: the Bedrock Dedicated
Server zip, Mojang/bedrock-samples, the Java Edition server jar and GeyserMC/mappings, each with
a version, URL and hash, plus the CloudburstMC/Data submodule commit as a cross-reference.

`pnpm run fetch:sources` downloads each source into
`node_modules/.cache/jsprismarine/<source>/<version>/`, verifies its hash before unpacking, and
skips sources whose verified content is already cached. It then writes `pack-hashes.json`, a
sha256 per top-level folder of each source, so a version bump shows which folders changed. For
offline work, `JSP_BDS_PATH`, `JSP_JAVA_JAR_PATH`, `JSP_BEDROCK_SAMPLES_PATH` and
`JSP_GEYSER_MAPPINGS_PATH` point at local copies and bypass the download.

## Running the Java data generator

`pnpm run datagen:java` runs Mojang's own data generator against the fetched server jar, after
re-checking the jar's sha1 against `sources.json`. One run produces both halves of the Java data
the rest of the repository reads, under the same gitignored cache:

- `vanilla-datapack/<version>/`, the vanilla datapack. `@jsprismarine/packs` loads it as the Java
  member of the pack stack, the overworld generator reads its `worldgen/*` registries and block
  tags, and the loot, advancement, predicate, enchantment and feature corpus suites read it.
- `java-reports/<version>/generated/reports/`, the data reports. The mapping and item table
  generators read them, and the overworld generator reads `biome_parameters` from them.

The generator writes no `pack.mcmeta`, so this step writes one from the `pack_version` the jar
declares in its `version.json`; that file is what marks the directory as a loadable datapack. The
same `version.json` names the JDK the jar needs, found through `JSP_JAVA_HOME`, `JAVA_HOME` or, on
macOS, `/usr/libexec/java_home`.

A second run is a no-op once both directories hold the files the step checks for. Pass `--force`
to regenerate:

```sh
pnpm run datagen:java -- --force
```

The output is about 53 MB of Mojang's content and is never committed. `JSP_VANILLA_DATAPACK` and
`JSP_JAVA_REPORTS` point consumers at a copy produced elsewhere.

## Installation

To install `@jsprismarine/bedrock-data`, use the following command:

```
pnpm install @jsprismarine/bedrock-data --save
```
