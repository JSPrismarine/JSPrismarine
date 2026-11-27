# @jsprismarine/bedrock-data

[![License: MIT OR MPL-2.0](https://img.shields.io/badge/license-MIT%20OR%20MPL--2.0-blue)](https://github.com/JSPrismarine/JSPrismarine#readme)
[![Join the Discord Server](https://img.shields.io/discord/704967868885762108?color=%237289DA&label=Discord)](https://discord.gg/kZZCDyCBbW)
[![npm](https://img.shields.io/npm/dt/@jsprismarine/bedrock-data)](https://www.npmjs.com/package/@jsprismarine/bedrock-data)

Minecraft Bedrock game data exported in a nodejs friendly way.

## Where the data comes from

- `src/jsp/v<protocol>/` is captured from the Bedrock Dedicated Server pinned for that protocol
  by `pnpm run dump:bedrock`. The default is <!-- fact:bds.version -->1.26.60.6<!-- /fact -->, the
  newest release; the unversioned exports carry its data, and each `v<protocol>` module carries
  one version's own. The item table and the three payloads a client refuses to join without live
  at the top of each version's directory, the Script API registries under `bedrock/`, the raw
  engine tables under `packets/`, and the reference world in `reference_world.json`.
- `src/generated/` is what `utils/build.js` makes of those captures. The item versions, the item
  components, the creative menu and the actor list come from the payloads the `packets` pass
  records under `src/jsp/v<protocol>/wire/`, the join packets the server sends every client.
  [ADR 0019](../../docs/adr/0019-bedrock-data-comes-from-bds.md) records why no third-party dump
  is read.
- `src/vendor/` is data the server does not send, copied from projects that publish it. See
  [its README](src/vendor/README.md) for the source and license of each file.
- `src/jsp/java/<release>/` is dumped from that Java Edition release's server jar, which Mojang
  ships unobfuscated since 26.1. `src/jsp/java/<name>.ts` re-exports the default release's
  files; `utils/build.js` writes those modules from `javaServer.defaultVersion`. `block_properties.json` holds the per-state block properties no
  Mojang report carries (hardness, blast resistance, friction, light, map color, sound type,
  push reaction, instrument, fire odds and the rest), with state-invariant values once per
  block and per-state differences under `stateOverrides`. `block_support.json` holds each block
  state's legacy solid flag and the sturdiness of its six faces for the full, center and rigid
  support types, packed into one integer per state and run-length encoded per block.
  `entity_attributes.json` holds the
  default attribute values, dimensions and category for the 93 entity types with an attribute
  supplier. `entity_goals.json` holds the goals each Java mob registers and the arguments it
  passes them, read from the jar's bytecode by `utils/java-goals/run.ts` and exported as
  `java_entity_goals`. See the next section for how to refresh them.

## Refreshing the Java goldens

`pnpm run dump:java` is a capture-time task, run on a Java version bump rather than as part of
the build. It downloads the pinned server jar through the piston-meta manifest chain, verifies
its sha1, unpacks the bundler, compiles `utils/java-dump/DumpJavaData.java` against the server
classes, runs it, and rewrites the three files under `src/jsp/java/<release>/`. `--java <release>`
picks a pinned release other than the default. Everything downloaded stays
under `node_modules/.cache/jsprismarine/java/`.

`pnpm run dump:java-goals` rewrites `src/jsp/java/<release>/entity_goals.json` from the jar `fetch:sources` caches. It
needs no JDK, because it reads the class files and never runs them.

The script reads the release, its sha1 and the JDK it needs from `sources.json` and the jar's
`version.json`, through `utils/java/release.ts`. The dumper needs a JDK matching the jar's class
file version (Java <!-- fact:java.jdk -->25<!-- /fact --> for <!-- fact:java.version -->26.3<!-- /fact -->); the script finds one through `JSP_JAVA_HOME`, `JAVA_HOME` or, on macOS,
`/usr/libexec/java_home`. `src/javaGoldens.test.ts` checks the shape of the goldens and the
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
content log on, and drives these passes over the console, each with a world of its own:

| Pass       | What it does                                                                       | What it writes                                                                     |
| ---------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `dump`     | Runs the dump behavior pack, which walks every Script API registry                 | `src/jsp/v<protocol>/bedrock/<table>.json`                                         |
| `refworld` | Generates the reference region through ticking areas, then reduces the saved world | `src/jsp/v<protocol>/reference_world.json`                                         |
| `packets`  | Logs a client in and records what the server sends it                              | `src/jsp/v<protocol>/*.json`, `*.nbt`, `packets/*.bin`                             |
| `palette`  | Places every block type, then asks the game which values each property takes       | `packages/minecraft/datagen/snapshot/v<protocol>/block-palette.json`               |
| `commands` | Types probe command lines at the console and records the server's answer to each   | `src/jsp/v<protocol>/command_answers.json`                                         |

Run one pass with `--pass`, and pass `--force` to copy the server again:

```sh
pnpm run dump:bedrock --pass refworld
```

### Where the capture can run

Mojang publishes the server for Linux x86-64 and Windows, and `sources.json` pins the Linux zip.
On a Linux x86-64 machine `dump:bedrock` starts that binary directly, which is also what
`.github/workflows/capture.yml` does on its `ubuntu-latest` runner. On any other host, an Apple
Silicon Mac or a Linux arm64 box, it starts the same staged copy inside a Linux x86-64 container
instead. You get the same passes and the same files in the same places; only the thing that
executes the binary changes.

The container path needs a container runtime whose daemon is running. The capture tries `docker`
and then `podman`, and it asks each one for its *server* version rather than just looking on your
`PATH`, because an installed Docker CLI with Docker Desktop stopped is the common case and it
cannot start anything. If neither answers, the capture stops before it stages anything and tells
you what to install or start.

Nothing is built or pulled that contains Mojang's binary. The container mounts the run directory
under `node_modules/.cache/jsprismarine/bds-run/<version>/`, which already holds the copy the
capture staged from the fetch cache, and runs `./bedrock_server` out of the mount. The image is a
stock `docker.io/library/ubuntu:24.04`, chosen because the server is dynamically linked against
the glibc and libstdc++ of a recent Ubuntu and because redistributing the server in an image of
our own is not something this project does. The server's UDP ports are published on `127.0.0.1`
only, for the `packets` pass's client, and the container is removed when the run ends or when you
interrupt it.

On an arm64 host the image is an emulated `linux/amd64` one, running under Rosetta or qemu.
Expect it to be several times slower than a native run, and `refworld`, already the longest pass,
to be the one you wait on. The capture prints a warning when it starts under emulation, and it
multiplies every stage timeout by four so that a slow run reports a stall only when something is
genuinely stuck.

Four environment variables steer this, alongside the rest of the pipeline's `JSP_*` overrides:

| Variable                   | What it does                                                                                 |
| -------------------------- | -------------------------------------------------------------------------------------------- |
| `JSP_BDS_RUNNER`           | `auto` (the default), `native`, or `container`. `docker` and `podman` also select `container`. |
| `JSP_BDS_CONTAINER_CLI`    | The CLI to use instead of probing for one, for anything that takes `docker run` arguments.     |
| `JSP_BDS_CONTAINER_IMAGE`  | A different base image, if the stock Ubuntu is missing a shared object your server version wants. |
| `JSP_BDS_PATH`             | An unpacked server to capture, instead of the fetch cache. Works on either runner.              |

Forcing a runner is for diagnosis. `JSP_BDS_RUNNER=container` on a Linux x86-64 machine is how
you reproduce a container-only problem, and `JSP_BDS_RUNNER=native` makes the capture fail loudly
rather than quietly fall back when you expected the host's own CPU to be used.

### The reference world

`src/jsp/reference_world.json` is what `packages/parity/` compares a generator against, and
`utils/bedrock-dump/region.ts` is the definition of "the reference region": a fixed seed, the
Overworld, and 400 chunks at the world origin. Per chunk the file carries a sha256 of the stored
heightmap, of the 3D biome arrays, of the topmost non-air block name per column, and of the
layer 0 block states; plus the chunk's sorted block identifiers, its block entity count and its
`FinalizedState`. Sixteen chunks at the origin are also kept whole, as plain arrays, so a
failing digest can be read rather than guessed at, and one block histogram covers the region.

The four digests are the four rows Phase 4 of
[the plan](https://github.com/JSPrismarine/JSPrismarine/blob/master/docs/plans/data-driven-vanilla.md) exits on. A generator that produces the same
world reproduces every one of them exactly.

## Pinned upstream sources

`sources.json` pins the upstream publications the data pipeline reads: the Bedrock Dedicated
Server zip, Mojang/bedrock-samples, the Java Edition server jar, SpyglassMC/vanilla-mcdoc and
GeyserMC/mappings, each with a version, URL and hash.

`pnpm run fetch:sources` downloads each source into
`node_modules/.cache/jsprismarine/<source>/<version>/`, verifies its hash before unpacking, and
skips sources whose verified content is already cached. It then writes `pack-hashes.json`, a
sha256 per top-level folder of each source, so a version bump shows which folders changed. For
offline work, `JSP_BDS_PATH`, `JSP_JAVA_JAR_PATH`, `JSP_BEDROCK_SAMPLES_PATH`,
`JSP_VANILLA_MCDOC_PATH` and `JSP_GEYSER_MAPPINGS_PATH` point at local copies and bypass the
download.

### Picking a Bedrock version

The Bedrock Dedicated Server is pinned once per Bedrock protocol version, under `bds.versions` in
`sources.json`, and each version caches under its own `bds/v<protocol>/` directory.
`pnpm run fetch:sources --protocol 2225` fetches a version other than `defaultProtocolVersion`.

`pnpm run generate` reads only committed captures, so it needs no download. A version gets
generated tables once `pnpm run dump:bedrock --pass packets --protocol <n>` has captured it
under `src/jsp/v<n>/`; `defaultProtocolVersion` picks which version the unversioned exports carry.

### Picking a Java release

The Java Edition server jar is pinned once per release id, under `javaServer.versions` in
`sources.json`, and each release caches under its own `java-server/<release>/` directory.
`defaultVersion` is the release the server runs. `--java <release>` on `fetch:sources`,
`datagen:java`, `ensure:worldgen` and the other Java scripts picks another pinned release. One
entry may be marked `"preview": true`, and it must be newer than `defaultVersion`.

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
- `java-lang/<version>/en_us.json`, Java's English strings, also straight out of the jar. The
  server names an advancement in chat with them, since a Bedrock client has no string for a Java
  advancement's translation key. `pnpm run extract:lang` does that step on its own, and
  `ensure:worldgen` runs it for a cache built before the step existed.
- `vanilla-datapack/<version>/version.json`, the release id, JDK, data pack format and data
  version the jar declares. `readGeneratedJavaVersion` from `@jsprismarine/bedrock-data/sources`
  reads it, and `ensure:worldgen` writes it for a cache built before the step existed.

The templates matter for speed rather than for correctness. The world generator can read them
out of the jar, but that means inflating all 17655 of its entries on the first template a world
places, inside chunk generation. The extracted directory is read one file at a time instead.

The generator writes no `pack.mcmeta`, so this step writes one from the `pack_version` the jar
declares in its `version.json`; that file is what marks the directory as a loadable datapack. The
same `version.json` names the JDK the jar needs, found through `JSP_JAVA_HOME`, `JAVA_HOME`, the
`java` on `PATH` or, on macOS, `/usr/libexec/java_home`. The default Java Edition release, <!-- fact:java.version -->26.3<!-- /fact -->, asks for
JDK <!-- fact:java.jdk -->25<!-- /fact --> or newer; an older `java` earlier on `PATH` is skipped rather than used.

A second run is a no-op once all three directories hold the files the step checks for. Pass
`--force` to regenerate:

```sh
pnpm run datagen:java -- --force
```

The output is about 53 MB of Mojang's content and is never committed. `JSP_VANILLA_DATAPACK` and
`JSP_JAVA_REPORTS` point consumers at a copy produced elsewhere.

### Doing it in one step

`pnpm run ensure:worldgen` is the same work arranged for somebody who just wants a server
running. It checks the three directories, and only if something is missing does it download the
jar and run the generator. `pnpm dev` at the repository root runs it first, which is what makes
`pnpm install && pnpm dev` enough on a clean clone.

On a complete cache it compares file names and exits, so repeat runs cost a fraction of a second
and touch no network. When it cannot finish it prints one line saying why rather than a stack
trace: no JDK, no network, or a generator that failed. It asks about the JDK before downloading
the jar, so a machine without Java finds out immediately.

`pnpm install` deliberately does not do this. The jar is a 62 MB download that only somebody
running a server needs, and builds, tests and CI arrange their own data.

## Installation

To install `@jsprismarine/bedrock-data`, use the following command:

```
pnpm install @jsprismarine/bedrock-data --save
```
