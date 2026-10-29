# @jsprismarine/bedrock-data

[![License](https://img.shields.io/github/license/JSPrismarine/JSPrismarine)](https://github.com/JSPrismarine/JSPrismarine/blob/master/LICENSE)
[![Join the Discord Server](https://img.shields.io/discord/704967868885762108?color=%237289DA&label=Discord)](https://discord.gg/6w8JWhy)
[![npm](https://img.shields.io/npm/dt/@jsprismarine/bedrock-data)](https://www.npmjs.com/package/@jsprismarine/bedrock-data)

Minecraft Bedrock game data exported in a nodejs friendly way.

## Where the data comes from

- `src/jsp/` is captured from a Bedrock Dedicated Server 1.26.51.1 by `pnpm run dump:bedrock`.
  The item table and the three payloads a client refuses to join without live at the top level,
  the Script API registries under `src/jsp/bedrock/`, the raw engine tables under
  `src/jsp/packets/`, and the reference world in `src/jsp/reference_world.json`.
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

The root test command and `@jsprismarine/worldgen` test and vector commands prepare the inner
server jar automatically. They download and verify the pinned outer jar, then cache its inner
server jar under `node_modules/.cache/jsprismarine/java/`. This step does not run Java or change
captured data. Set `JSP_JAVA_SERVER_JAR` to use an existing inner jar, or run
`pnpm --filter @jsprismarine/bedrock-data run ensure:java-server` to prepare it separately.

## Refreshing the Bedrock captures

`pnpm run dump:bedrock` is the other half of the same capture-time task, run on a Bedrock
version bump and weekly rather than as part of the build. It copies the fetched server into
`node_modules/.cache/jsprismarine/bds-run/<version>/`, makes the binary executable, turns the
content log on, and drives three passes over the console, each with a world of its own:

| Pass       | What it does                                                                            | What it writes                                  |
| ---------- | --------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `dump`     | Runs the dump behavior pack, which walks every Script API registry                        | `src/jsp/bedrock/<table>.json`                  |
| `refworld` | Generates the reference region through ticking areas, then reduces the saved world        | `src/jsp/reference_world.json`                  |
| `packets`  | Logs a client in and records what the server sends it                                     | `src/jsp/*.json`, `src/jsp/*.nbt`, `src/jsp/packets/*.bin` |

Run one pass with `--pass`, and pass `--force` to copy the server again:

```sh
pnpm run dump:bedrock -- --pass refworld
```

Mojang publishes the server for Linux x86-64 and Windows and `sources.json` pins the Linux zip,
so the job refuses to run anywhere else. `.github/workflows/capture.yml` is where it runs for
real; locally it needs a Linux x86-64 machine, with `JSP_BDS_PATH` pointing at an unpacked
server for offline work.

### The reference world

`src/jsp/reference_world.json` is what `packages/parity/` compares a generator against, and
`utils/bedrock-dump/region.ts` is the definition of "the reference region": a fixed seed, the
Overworld, and 400 chunks at the world origin. Per chunk the file carries a sha256 of the stored
heightmap, of the 3D biome arrays, of the topmost non-air block name per column, and of the
layer 0 block states; plus the chunk's sorted block identifiers, its block entity count and its
`FinalizedState`. Sixteen chunks at the origin are also kept whole, as plain arrays, so a
failing digest can be read rather than guessed at, and one block histogram covers the region.

The four digests are the four rows Phase 4 of
[the plan](../../docs/plans/data-driven-vanilla.md) exits on. A generator that produces the same
world reproduces every one of them exactly.

## Pinned upstream sources

`sources.json` pins the upstream publications the data pipeline reads: the Bedrock Dedicated
Server zip, Mojang/bedrock-samples, the Java Edition server jar, SpyglassMC/vanilla-mcdoc and
GeyserMC/mappings, each with a version, URL and hash, plus the CloudburstMC/Data submodule commit
as a cross-reference.

`pnpm run fetch:sources` downloads each source into
`node_modules/.cache/jsprismarine/<source>/<version>/`, verifies its hash before unpacking, and
skips sources whose verified content is already cached. It then writes `pack-hashes.json`, a
sha256 per top-level folder of each source, so a version bump shows which folders changed. For
offline work, `JSP_BDS_PATH`, `JSP_JAVA_JAR_PATH`, `JSP_BEDROCK_SAMPLES_PATH`,
`JSP_VANILLA_MCDOC_PATH` and `JSP_GEYSER_MAPPINGS_PATH` point at local copies and bypass the
download.

## Running the Java data generator

`pnpm run datagen:java` runs Mojang's own data generator against the fetched server jar, after
re-checking the jar's sha1 against `sources.json`. One run produces both halves of the Java data
the rest of the repository reads, under the same gitignored cache:

- `vanilla-datapack/<version>/`, the vanilla datapack. `@jsprismarine/packs` loads it as the Java
  member of the pack stack, the overworld generator reads its `worldgen/*` registries and block
  tags, and the loot, advancement, predicate, enchantment and feature corpus suites read it.
- `java-reports/<version>/generated/reports/`, the data reports. The mapping and item table
  generators read them, and the overworld generator reads `biome_parameters` from them.
- `java-structures/<version>/`, the 1511 structure templates. The data generator writes no NBT,
  so these come straight out of the jar; `pnpm run extract:structures` does that step on its own,
  for a checkout with no JDK.

The templates matter for speed rather than for correctness. The world generator can read them
out of the jar, but that means inflating all 17655 of its entries on the first template a world
places, inside chunk generation. The extracted directory is read one file at a time instead.

The generator writes no `pack.mcmeta`, so this step writes one from the `pack_version` the jar
declares in its `version.json`; that file is what marks the directory as a loadable datapack. The
same `version.json` names the JDK the jar needs, found through `JSP_JAVA_HOME`, `JAVA_HOME` or, on
macOS, `/usr/libexec/java_home`.

A second run is a no-op once all three directories hold the files the step checks for. Pass
`--force` to regenerate:

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
