# @jsprismarine/bedrock-data

## 0.17.0

### Minor Changes

- [#2661](https://github.com/JSPrismarine/JSPrismarine/pull/2661) [`9061024`](https://github.com/JSPrismarine/JSPrismarine/commit/9061024a45c9e8b00be4963b61406d7474f2f82d) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove CommonJS package outputs

## 0.16.0

### Minor Changes

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`4fd861a`](https://github.com/JSPrismarine/JSPrismarine/commit/4fd861abbae002d42f680a9e17c85f6e37fdb8d1) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove the legacy `item_id_map` export; consumers read item runtime IDs from `item_table`.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`fee087d`](https://github.com/JSPrismarine/JSPrismarine/commit/fee087d594e2a2961e5b75d7d16403518c143a14) Thanks [@filiphsps](https://github.com/filiphsps)! - Arrange the Java Edition world generation data as a prerequisite of `pnpm dev`, so a clean clone
  needs nothing beyond `pnpm install && pnpm dev`.
  
  The default overworld is built from Mojang's published world generation data, which `pnpm install`
  did not fetch. Starting a fresh checkout therefore reached the first chunk and threw, naming two
  commands to run by hand. The new `ensure:worldgen` script runs those two steps itself, and only
  when the cache is missing something: on a complete cache it compares file names and exits in a
  fraction of a second without touching the network, so an offline checkout with a warm cache still
  starts.
  
  It stays out of `prepare`, `start` and CI. The server jar is a 62 MB download that only somebody
  starting a server needs, and builds and tests arrange their own data.
  
  Failures that a script cannot fix now print one actionable line rather than a stack trace, naming
  the override environment variable and the flat-world option for a machine that will not have a JDK.
  The JDK is looked for before the jar is downloaded, so a machine without Java finds out
  immediately.
  
  `findJdkHome` also searches the `java` on `PATH`, having previously looked only at `JSP_JAVA_HOME`,
  `JAVA_HOME` and macOS's `java_home`. A Linux install with a JDK on `PATH` but no `JAVA_HOME` set
  was not finding it.

### Patch Changes

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`f60ce7d`](https://github.com/JSPrismarine/JSPrismarine/commit/f60ce7dd0fef48e4f586f4c307b215e370a69d17) Thanks [@filiphsps](https://github.com/filiphsps)! - Run the Bedrock capture in a Linux x86-64 container on hosts where Mojang's server binary cannot
  run, so `dump:bedrock` works on an Apple Silicon or Linux arm64 machine. A Linux x86-64 host still
  runs the binary directly, and that is what CI does. The runner is chosen from the host platform
  and from whether a container daemon actually answers, and `JSP_BDS_RUNNER`,
  `JSP_BDS_CONTAINER_CLI` and `JSP_BDS_CONTAINER_IMAGE` override the choice. No image carries the
  server: the container mounts the staged copy from the gitignored fetch cache.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`b8ee548`](https://github.com/JSPrismarine/JSPrismarine/commit/b8ee548b13eb663a2aab41a4197e054854b4e2db) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `dump:bedrock`, the Bedrock half of the capture job. It copies the pinned Bedrock Dedicated Server into a run directory of its own, makes the binary executable, turns the content log on, and drives three passes: a dump behavior pack that writes every Script API registry to `src/jsp/bedrock/`, a reference world generated from a fixed seed and reduced to `src/jsp/reference_world.json`, and the packet capture, which now also keeps the raw payloads of the engine tables with no decoder yet under `src/jsp/packets/`. The reference world carries a digest per chunk of the heightmap, the 3D biome arrays, the terrain-class row and the block states, whole arrays for sixteen chunks, and one block histogram for the region. The job runs on Linux x86-64, which is the zip `sources.json` pins, and refuses anywhere else.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`f5ea701`](https://github.com/JSPrismarine/JSPrismarine/commit/f5ea701bd7297d63eb524be1d4b76c07cf204569) Thanks [@filiphsps](https://github.com/filiphsps)! - Publish the Bedrock 1.26.60 (protocol 2225) data this repository can now capture.
  
  The `packets` pass was run twice against the pinned BDS 1.26.60.6. `required_item_list.json`,
  `block_definitions.json` and `biome_definitions_network.nbt` reproduced byte for byte and are
  committed under `src/jsp/v2225/`. `jigsaw_structure_data.nbt` is deliberately not: the engine
  iterates its template pools out of an unordered container, so two runs agreeing is not the order
  being fixed, and the same goes for the block palette — `datagen/manifest.json`'s 2225 entry still
  declares no `blocks` for that reason, and 2193 stays `defaultProtocolVersion`.
  
  What the capture says is that the item registry is the only one of the three that moved. Against
  2193 it adds four names, removes none, and **moves 82 runtime ids**; the block definitions and
  the biome definitions came back identical. `utils/build.js` now builds an item table and the
  binary payload conversions for every captured version, not only the default one, joining each
  with its own version's CloudburstMC dump for the `Item Version` column the capture does not
  record. The default version's generated files are byte-identical to what the previous generator
  produced, which was checked by running both.
  
  The result is a new entry point, `@jsprismarine/bedrock-data/v2225`, exporting `item_table`,
  `block_definitions` and `biome_definitions_network` for that protocol. It is published beside
  the unversioned exports rather than in place of them: picking a table per session is a later
  slice, and nothing that imports the unversioned names changes. A `registry.items-2225` parity
  family compares the published table against the capture it was built from, which is the way this
  goes wrong quietly — a 2225 table rebuilt from the 2193 capture looks right and is 82 items out.
  
  `packages/minecraft`'s 2225 entry also declares `recipes` now. The output is 2193's recipe set
  exactly apart from its `minecraftVersion` header, because `vanilla_1.26.60` ships structures and
  a manifest and no recipe layer at all: 1.26.60 revised no recipe.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`91a7a0b`](https://github.com/JSPrismarine/JSPrismarine/commit/91a7a0bfac2eac8c81961d5263e54b53dc0c3fc5) Thanks [@filiphsps](https://github.com/filiphsps)! - Resolve the unpacked Bedrock Dedicated Server from one place. `fetch:sources` writes the
  cache path, and the Bedrock capture and the datagen generators now read it back from the
  fetch instead of each building it themselves, so the writer and its readers cannot drift
  apart over how the directory is keyed.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`0dac56a`](https://github.com/JSPrismarine/JSPrismarine/commit/0dac56a679dfcb3b0a2953e1bb451592833ec2a4) Thanks [@filiphsps](https://github.com/filiphsps)! - Let the client speak protocol 2225, so a 1.26.60 server can be captured.
  
  `Client` hardcoded protocol 2193, and a Bedrock Dedicated Server refuses a login at any version
  but its own — pointing the capture at the pinned 1.26.60.6 server got "this client is out of
  date" before a byte of data arrived. `ClientOptions` now takes a `protocolVersion`, the offline
  identity reports the `GameVersion` that goes with it, and an unsupported version is refused in
  the constructor rather than at the socket.
  
  `StartGamePacket` is the one packet the client decodes whose layout moved at 2225: `Editor Level
  Migration Version`, an int8 inserted into the level settings between `Is Exported From Editor`
  and `Day Cycle Stop Time`. `@jsprismarine/protocol` gains `StartGamePacket2225`, a subclass over
  two hooks on the 2193 class, with both wire directions and round-trip coverage. A 2193 reader on
  2225 bytes is one byte out from the insert on, so the block properties a capture is run for come
  back wrong; whether the rest resynchronizes is luck, which the tests say in those terms.
  
  `capture-server-data.mjs` takes `--protocol`, and the `packets` pass of `dump:bedrock` passes the
  version it staged.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`dbdbe5c`](https://github.com/JSPrismarine/JSPrismarine/commit/dbdbe5cfb8e43929ad1f4687bc5eed8353c5525d) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix what running the containerized Bedrock capture for real turned up. `pnpm run dump:bedrock --`
  forwards pnpm's own `--` to the script, which Node's `parseArgs` read as the end of the options and
  then rejected `--pass` as a positional, so every documented invocation with a flag failed before it
  reached a server, including the `--protocol` one in CI. Only the `packets` pass has a client to let
  in, so only it publishes the container's UDP ports now; publishing them for every pass made the
  other three fail with `port is already allocated` whenever anything else held 19132. The image is
  obtained once before the first pass rather than mid-capture, and a pull that fails because Docker
  Desktop's credential helper is not on `PATH` says so instead of reporting a missing executable. The
  reference world pass no longer hangs on its fourth tile: the engine's ticking budget fits exactly
  three tiles, and releasing areas and creating the next one in the same tick never resolved.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`94793d0`](https://github.com/JSPrismarine/JSPrismarine/commit/94793d040e3e687f3698758c6aac5e18b8df5c5f) Thanks [@filiphsps](https://github.com/filiphsps)! - Replace the CloudburstMC/Data Git submodule with pinned downloads keyed by Bedrock protocol
  version. A submodule is one checkout at one commit, so it could only ever carry one Bedrock
  version's dumps. The `cloudburstData` entry of `sources.json` now holds a `versions` table -
  `minecraftVersion`, `commit`, `url` and `sha256` per protocol version, plus
  `defaultProtocolVersion` - and reuses the existing fetch machinery: each version caches under
  `node_modules/.cache/jsprismarine/cloudburst-data/v<protocol>/`, is sha256-verified before
  unpacking, and unpacks only the names in a new `extract` allowlist, `LICENSE` among them for the
  Apache-2.0 attribution.
  
  `pnpm run fetch:cloudburst` fetches the default version and links it to `src/resources`, so
  `utils/build.js` and every other consumer keep reading one path; `--protocol <n>` selects another
  pinned version, and `JSP_CLOUDBURST_DATA_PATH` points at a local checkout for offline work.
  Protocol 2193 (Minecraft 1.26.51) and 2225 (1.26.60) are pinned. The generated output under
  `src/generated/` is unchanged.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`582536f`](https://github.com/JSPrismarine/JSPrismarine/commit/582536f53c4ed407b065155dc6dce7f5f48982d8) Thanks [@filiphsps](https://github.com/filiphsps)! - Carry out the event actions, fire the `minecraft:on_*` triggers, and give the components that
  measure most real behavior. The package parsed the vanilla pack well and then did almost nothing
  with it: 16 of the 157 implemented components carried behavior, every event action was collected
  raw and reported, and nothing fired the eleven trigger components.
  
  **Event actions.** Nine keys parse into an `EntityAction` and run. Eight are everything the composed
  vanilla pack writes, measured over its 850 events: `play_sound` 23 uses, `set_home_position` 17,
  `emit_vibration` 9, `drop_item` 2, `execute_event_on_home_block` 2, and one each of
  `emit_particle`, `reset_target` and `stop_movement`. The ninth is `queue_command`, which the
  documentation describes and no vanilla entity uses. Six leave through the new
  `EntityEnvironment.effects` seam; `set_home_position` and `stop_movement` go through the actuator
  and `reset_target` clears the attack target the entity now owns. An action key the package does not
  parse, a body it cannot read, and an action whose environment member a caller left out each reach
  the report.
  
  **Damage and triggers.** `EntityInstance.damage` applies the damage instead of only offering it to
  the components. The sensors decide the amount with the damager answering the `damager` and `other`
  filter subjects, `minecraft:fire_immune` and `minecraft:freezing_immune` turn their causes aside
  after the sensors have seen them, the rest comes off the `health` attribute, and
  `minecraft:on_hurt`, `minecraft:on_hurt_by_player` and `minecraft:on_death` fire in that order.
  `setAttackTarget` fires the two target triggers. `EntityInstance.trigger` is the firing point for
  all eleven; the six that name equipment, fire, flight, sleep and friendly anger wait for a caller.
  
  **Components.** `minecraft:hurt_on_condition` (87 of the 129 vanilla entities),
  `minecraft:breathable` (84), `minecraft:ageable` (35), `minecraft:ambient_sound_interval` (32),
  `minecraft:rideable` (36), `minecraft:angry` (20) and `minecraft:damage_over_time` (3) stopped being
  parse-only. `minecraft:despawn` now leaves a `minecraft:persistent` entity alone, and
  `minecraft:timer` and `minecraft:environment_sensor` honor a `target` other than `self` through the
  new `EntityInstance.raise`. 37 of the 157 implemented keys carry behavior, up from 16.
  
  **Breaking.** `EntityInstance.damage` returns a `DamageResult` rather than a `DamageOutcome`,
  `EventAction` gained a `parsed` member, `TriggerComponentParams` and `RideableParams` moved to their
  own modules with `target` narrowed from `string` to `EventTarget`, and `TRIGGER_COMPONENTS` is now a
  tuple of its eleven names.
  
  `@jsprismarine/bedrock-data` exports the Java attribute golden as `java_entity_attributes`, which
  the entity corpus test measures the Bedrock stats against: 423 stats are published in both editions
  and 279 agree.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`0bc486e`](https://github.com/JSPrismarine/JSPrismarine/commit/0bc486e90372d7ae43425da17c71275a097e9722) Thanks [@filiphsps](https://github.com/filiphsps)! - Generate Java Edition's structures. Nothing generated before: the world generator read none of
  the three registries a structure is built from, and `@jsprismarine/structures` was imported
  nowhere in the server. It now loads `worldgen/structure`, `worldgen/structure_set` and
  `worldgen/template_pool` alongside the eleven registries it already read, decides which chunks a
  structure starts in from the 21 structure sets, lays the structure out against the bare noise
  terrain, and writes its pieces into every chunk it covers. 50 of Java's 52 structures generate;
  the end city and the nether fortress are the two left, and neither has a dimension to generate
  in. [docs/data-driven/structures.md](../docs/data-driven/structures.md) is the inventory.
  
  29 structures ask for terrain adaptation through `terrain_adaptation`, and the field was not
  read at all, so a village landed on whatever the noise happened to make. Java's beardifier
  density function now runs from the structure starts before a chunk's terrain is sampled.
  
  The decoration pass runs Java's own loop: each step's structures, then that step's features,
  sharing one index counter. A step's features are therefore seeded from the structure count
  onward, which is what Java does and what this did not.
  
  `@jsprismarine/structures`' jigsaw assembler changed to match Java's placer. It draws the
  rotation before the start element rather than after, sits a `terrain_matching` element on the
  terrain through the new `JigsawSources.terrainHeight`, settles a projected start onto the
  surface through `JigsawConfig.projectStartToHeightmap`, reserves vertical room under
  `JigsawConfig.useExpansionHack`, and reports the generation point as `JigsawAssembly.origin`. A
  pool element's `processors` may now be an inline list as well as an identifier, which is how
  1439 of the 2287 vanilla pool elements write it. The same seed and pools no longer produce the
  same layout as before, because the draw order and the ground level delta both changed.
  
  `@jsprismarine/bedrock-data` gained `extract:structures`, which lifts the 1511 `.nbt` templates
  out of the pinned server jar into `node_modules/.cache/jsprismarine/java-structures/<version>/`;
  `datagen:java` now runs it too. Reading them from the jar instead meant inflating all 17655 of
  its entries inside the first chunk that placed one.
  
  The generator's hand-written Bedrock biome id table is gone. The ids come from
  `@jsprismarine/mapping`'s generated registry table instead, so they regenerate with the pinned
  version rather than drifting. `BEDROCK_BIOME_IDS` is no longer exported.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`c1591b1`](https://github.com/JSPrismarine/JSPrismarine/commit/c1591b1e567a51dc80ecbbdfdbdc8e7c7f4f6c42) Thanks [@filiphsps](https://github.com/filiphsps)! - Add the Java data generator step the pipeline was missing. `pnpm --filter
  @jsprismarine/bedrock-data run datagen:java` re-checks the fetched server jar's sha1, runs
  Mojang's `net.minecraft.data.Main` against it, and writes the vanilla datapack to
  `node_modules/.cache/jsprismarine/vanilla-datapack/<version>/` and the data reports to
  `node_modules/.cache/jsprismarine/java-reports/<version>/generated/reports/`, the two
  directories every Java-data reader already looks in. A re-run is a no-op unless `--force` is
  passed.
  
  Nothing produced those directories before, so the data-driven overworld generator failed on
  every server start with a message naming `fetch:sources` and `dump:java`, neither of which
  writes them. Those messages now name `datagen:java`, and so does the pack stack diagnostic for
  a missing Java vanilla datapack.
  
  The mapping and item table generators read `java -version` from stdout, which is empty
  because the banner goes to stderr, so their own fallback run of the data generator always
  threw "No JDK >= 25 found". They read `java --version` now.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`1acfa57`](https://github.com/JSPrismarine/JSPrismarine/commit/1acfa5708eace6165592fde0fa80032416957bdf) Thanks [@filiphsps](https://github.com/filiphsps)! - Add the Java Edition property and attribute dumper and its goldens. `pnpm run dump:java` fetches
  the pinned 26.3 server jar, verifies its sha1, compiles `utils/java-dump/DumpJavaData.java`
  against it and writes `src/jsp/java/block_properties.json` (per-state properties for all 1286
  blocks and 35723 states) and `src/jsp/java/entity_attributes.json` (2619 default attribute
  values, dimensions and category for 93 entity types).

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`f939230`](https://github.com/JSPrismarine/JSPrismarine/commit/f93923009aeecd86cc40835805fe08527aec6435) Thanks [@filiphsps](https://github.com/filiphsps)! - Write the captured jigsaw structure rules with their four registries in identifier order. The
  engine serializes `template_pools` out of an unordered container, so two captures of one server
  carried the same 64 pools in a different order and the committed golden was byte stable only by
  luck. Reordering is invisible to a client - every entry names itself in `description.identifier`,
  and every reference between the registries is that name rather than a position - so the payload a
  server replays is unchanged apart from the order of whole entries, and a recapture of an unchanged
  server is now an empty diff.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`3eac4a7`](https://github.com/JSPrismarine/JSPrismarine/commit/3eac4a7901492b6b46231baeacba64081799d2cd) Thanks [@filiphsps](https://github.com/filiphsps)! - Run the capture job's host-side halves under the same `tsx` resolver the server starts under, so
  the `palette` and `packets` passes can reach workspace packages. Both died on an import before
  doing any work, because a workspace package resolves to TypeScript sources whose relative imports
  carry no file extension.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`08de1ba`](https://github.com/JSPrismarine/JSPrismarine/commit/08de1bac21f3c5785a02649e4faa11d9a11f82b0) Thanks [@filiphsps](https://github.com/filiphsps)! - Make the Bedrock capture pipeline multi-version and remove the last manual step.
  
  `sources.json` pinned exactly one Bedrock Dedicated Server, so a capture could only ever target
  one Bedrock version while `packages/minecraft` was already keyed per protocol. The `bds` entry
  now carries a `versions` map, the same shape `cloudburstData` uses, and `fetch:sources` and
  `dump:bedrock` take `--protocol <n>`. Protocol 2225 is pinned to BDS 1.26.60.6, whose sha256 was
  measured from the download and whose sha1 and byte count match Bedrock-OSS/BDS-Versions. Each
  version caches under `bds/v<protocol>/`, so two servers coexist, and only the selected one is
  downloaded, because the zips are ~95 MB each.
  
  The captures themselves move to `src/jsp/v<protocol>/`, mirroring `src/generated/v<protocol>/`.
  Generated re-export modules keep `jsp/block_definitions` and `jsp/required_item_list` resolving
  at the paths they already had, so a consumer deep-importing either is unaffected and the
  published surface only gains the versioned entries. `src/jsp/java/` stays unversioned: it tracks
  Java Edition releases, which have no Bedrock protocol version.
  
  The block palette was the one artifact a human still had to make, through two server runs with
  two hand edits between them. It is now the `palette` pass of the same job, reusing the manifest
  writer the other passes already had, so
  `pnpm --filter @jsprismarine/bedrock-data run dump:bedrock --pass palette` produces
  `snapshot/v<protocol>/block-palette.json` with no manual step. `generate-recipes.js` defaults to
  the server `fetch:sources` already unpacks instead of needing a hand-set path, keeping
  `BEDROCK_SERVER` as the escape hatch.
  
  Also fixes four readers in `@jsprismarine/mapping` that still used the pre-versioning
  `datagen/snapshot/block-palette.json`; two were tests that had been failing with ENOENT.
  
  Two unreferenced files, `src/jsp/block_id_map.json` and `src/jsp/runtime_block_states.dat`, are
  deleted. No code read either, and nothing in the pipeline regenerated them.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`29aa940`](https://github.com/JSPrismarine/JSPrismarine/commit/29aa940e8ddc1db5bf37b213179adad8e3eb21a5) Thanks [@filiphsps](https://github.com/filiphsps)! - Validate Java datapack definitions against `SpyglassMC/vanilla-mcdoc`.
  `@jsprismarine/packs/mcdocValidator` exports `createMcdocValidator`, which reads a vanilla-mcdoc
  checkout and returns a synchronous `DefinitionValidator`; construction is asynchronous because
  binding the schema modules is, so `load` stays synchronous. Findings name the JSON pointer and the
  reason, and the release gates `#[since=]` and `#[until=]` fields, which matters: the 26.3 vanilla
  datapack reports one finding at 26.3 and thousands at 26.1.
  
  A vanilla-mcdoc finding is a warning by default, because the schema set trails Mojang's releases
  and an error would drop the definition. At 26.3 the one disagreement is
  `recipe/map_extending.json`, which vanilla ships with `"result": {}` where the schema wants an
  `id`. `severity: 'error'` opts into the stricter reading.
  
  The four `@spyglassmc` packages are optional peer dependencies and the module is not re-exported
  from the package index, so the eleven workspace packages importing the loader do not pay for 91
  transitive packages they never load.
  
  `bedrock-data` pins `SpyglassMC/vanilla-mcdoc` in `sources.json`, so `fetch:sources` puts a
  checkout in the cache beside the other pinned upstreams.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`c32bfed`](https://github.com/JSPrismarine/JSPrismarine/commit/c32bfededb57b65bab45897dda54e0fa621d0ff1) Thanks [@filiphsps](https://github.com/filiphsps)! - Use Java-derived mob navigation and path costs, and separate overlapping mobs during movement.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`d795857`](https://github.com/JSPrismarine/JSPrismarine/commit/d7958576ad576a489298cdd772a8d68759af55c0) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `sources.json`, a manifest pinning the upstream data sources (the BDS 1.26.51.1 zip, Mojang/bedrock-samples v1.26.50.4, the Java Edition 26.3 server jar and GeyserMC/mappings), and a `fetch:sources` script that downloads them into `node_modules/.cache/jsprismarine/`, verifies each hash before unpacking, and writes `pack-hashes.json` with a sha256 per top-level folder. Environment overrides (`JSP_BDS_PATH`, `JSP_JAVA_JAR_PATH`, `JSP_BEDROCK_SAMPLES_PATH`, `JSP_GEYSER_MAPPINGS_PATH`) point at local copies for offline work.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`3c40d16`](https://github.com/JSPrismarine/JSPrismarine/commit/3c40d1636595c254ba2869a6a1b03f6e30f929ce) Thanks [@filiphsps](https://github.com/filiphsps)! - `pnpm run bringup --protocol <n>` is the first command of a protocol bring-up: it verifies the
  version is pinned in `sources.json` and `packages/minecraft/datagen/manifest.json` (and says
  exactly what to pin when it is not), boots the pinned Bedrock Dedicated Server through the same
  staging and runner machinery as `dump:bedrock`, and walks the capture client's full login against
  it. `packages/client/tools/bringup-probe.mjs` reports each stage — network settings, login,
  resource packs, start game, spawn — as pass or fail, and on a failure prints the undecodable
  packet ids with the reader's offset and the last raw packets, which is what a developer iterates
  on while implementing a new version's delta codec. The exit status is the probe's: 0 means our
  client spawned on the real server, which exercises both wire directions of every join-path
  packet. The runner selection `run.ts` always did now lives in `launcherForHost` in `runner.ts`,
  shared by both entry points. `.agents/skills/protocol-bringup/SKILL.md` places the tool inside
  the whole bring-up workflow.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`815800d`](https://github.com/JSPrismarine/JSPrismarine/commit/815800d3410bfd829fc583eb9bcd896369812247) Thanks [@filiphsps](https://github.com/filiphsps)! - Run data-defined interaction loot tables, resolve legacy Bedrock item variants, and preserve item counts and drop offsets.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`9258ef1`](https://github.com/JSPrismarine/JSPrismarine/commit/9258ef152ef8c0802eefc2cad93e1f8ddb950f46) Thanks [@filiphsps](https://github.com/filiphsps)! - Run ageable pause and reset effects, and drop data-defined items when entities grow up.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`494be3e`](https://github.com/JSPrismarine/JSPrismarine/commit/494be3e9d5dae9d074c7cc084d6eb136f86ae231) Thanks [@filiphsps](https://github.com/filiphsps)! - Wait for every chunk of each reference-region tile to load before releasing its ticking area. `createTickingArea` resolves on registration, not on chunk load, so the refworld pass saved a partial region; the pass now polls `dimension.getBlock` per chunk, and both the pack and the save reader fail with expected-versus-saved counts and missing chunk coordinates instead of writing a partial `reference_world.json`.

- [#2633](https://github.com/JSPrismarine/JSPrismarine/pull/2633) [`8128a63`](https://github.com/JSPrismarine/JSPrismarine/commit/8128a6344645e6798453b7c7eae77a69594e848c) Thanks [@filiphsps](https://github.com/filiphsps)! - Hold declarative wire layouts to a real server's bytes.
  
  The capture client gains `--wire`: one raw payload per packet kind the Bedrock Dedicated Server
  sent during the login, written per protocol version as `src/jsp/v<protocol>/wire/<id>.bin` by the
  `packets` pass. A new parity family, `protocol.wire-roundtrip`, decodes each captured payload
  through its declarative layout and re-encodes it, and the bytes must come back exactly - the
  layout our client decoded a real server's bytes through is the same frozen record our server
  encodes with, so one round trip proves both directions and both roles. Coverage over the capture
  is reported, not gated, and grows as packets gain definitions; the suite also holds every
  captured id to having a name in the codec tables, which all 41 already do. The fixtures are a
  committed snapshot: a re-capture may rewrite the recipe payload, whose net ids are per-session.

## 0.15.2

No changes in this release.

## 0.15.1

No changes in this release.

## 0.15.0

### Minor Changes

- [#2595](https://github.com/JSPrismarine/JSPrismarine/pull/2595) [`f7d2297`](https://github.com/JSPrismarine/JSPrismarine/commit/f7d2297ce7176489a19a141ab4b071eb7a2461a6) Thanks [@filiphsps](https://github.com/filiphsps)! - Read the game data from CloudburstMC/Data at 1.26.50, because pmmp/BedrockData is gone.
  
  The `resources` submodule pointed at pmmp/BedrockData, pinned to 1.21.40. That repository was archived in July 2026 at 1.26.30 and will never carry the version this server targets, so the submodule now points at [CloudburstMC/Data](https://github.com/CloudburstMC/Data) at commit `659ce1e`, which is the 1.26.50 drop. The pin is a commit rather than a branch on purpose: the branch head carries 1.26.60, whose item runtime ids disagree with protocol 2193. Its item table was checked against this project's own capture of a 1.26.51 server and agrees on all 2076 items, ids and component flags included.
  
  **21 vanilla recipes come back.** `item_tags` stopped at 1.21.40 and had never heard of `minecraft:egg`, `minecraft:metal_nuggets` or `minecraft:mushrooms_for_stew`, so every recipe asking for one was dropped as unsatisfiable - correctly, for the wrong reason. The table is now dragonfly's, at 1.26.50 and 77 tags, vendored under `src/vendor` with its MIT notice.
  
  **The creative menu gains its headings and 62 entries.** The old list had 1919 entries, 1918 of which the item table could name, and no group data at all, so `CreativeContentPacket` filed everything under one anonymous group. The new one has 1980 entries and 124 groups across the four tabs. `CreativeContentPacket.items` becomes `entries`, each an item and the group it sits under, and `CreativeInventory` gains `getEntries` and `getGroups`.
  
  Removed, none of which had a consumer: `banner_patterns`, `biome_id_map`, `entity_id_map`, `block_id_map`, `biome_definitions` (superseded by `biome_definitions_network`), `canonical_block_states` and `r12_to_current_block_map`. `item_tags` is now typed by the question a caller asks - a tag name is a string, not one of the 77 keys the file happens to hold. The published `dist` drops from 22 MB to 5.3 MB, because the submodule's raw files are inputs to the generator and were never meant to be bundles.

- [#2579](https://github.com/JSPrismarine/JSPrismarine/pull/2579) [`ff8648e`](https://github.com/JSPrismarine/JSPrismarine/commit/ff8648e6f92e87f702a1fefc09d306db3307da8a) Thanks [@filiphsps](https://github.com/filiphsps)! - Build declaration files with TypeScript 7 through `tsc-ts`. JSON data exports are now typed structurally (`string`, `number`) instead of as literal values.

### Patch Changes

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`4734cfb`](https://github.com/JSPrismarine/JSPrismarine/commit/4734cfb951a2924f503a3d7447af06bc9a675e1b) Thanks [@filiphsps](https://github.com/filiphsps)! - `creative_groups` entries carry `icon_block_states`, the block state vanilla draws for a group's icon, so a server can send the icon with the same hashed block runtime id vanilla does. Both `block_states` fields now document what their NBT holds.

- [#2603](https://github.com/JSPrismarine/JSPrismarine/pull/2603) [`43b59de`](https://github.com/JSPrismarine/JSPrismarine/commit/43b59de62ff05ebea0b71d9498b776669329e1c3) Thanks [@filiphsps](https://github.com/filiphsps)! - `item_table` entries now carry `version`, the `Item Version` a Bedrock Dedicated Server 1.26.51 sends for the item (0 `Legacy`, 1 `DataDriven`, 2 `None`), and a new `item_components` export maps the 78 vanilla items that travel with component data to that data as network NBT. Both come from the CloudburstMC data submodule; the generator checks that its item list agrees with the captured table before producing either.

- [#2577](https://github.com/JSPrismarine/JSPrismarine/pull/2577) [`1b825f1`](https://github.com/JSPrismarine/JSPrismarine/commit/1b825f10efeeb776ff859a1d10eea15f43d306f6) Thanks [@filiphsps](https://github.com/filiphsps)! - Add the codec for Minecraft: Bedrock Edition's on-disk chunk format, so a world folder can be read and written exactly as the game writes it.
  
  - **Keys.** Chunk records are addressed by x and z as signed little endian int32s, the dimension only when it is not the Overworld, a tag byte, and for a sub chunk a *signed* index byte - 0xfc is -4, the Overworld's bottom slice. Non-chunk keys such as `~local_player` and `portals` are recognized as not being chunk records rather than mis-parsed.
  - **Sub chunks.** Versions 1, 8 and 9, including the second storage layer that water-logging uses. The version a sub chunk was read at is kept, so writing it back does not silently upgrade it.
  - **Block storage.** The same bit packing as the network form, but with the persistent flag clear, a fixed width palette count, and each palette entry an NBT compound of `{name, states, version}`. Palette entries go through the existing `BlockRuntimeIds`, which already hashes exactly that compound - so there is no second mapping table to keep in step. A block this version does not know resolves to the unknown id, and a known block with an unknown property value falls back to its default state, rather than either making a whole world unreadable.
  - **Biomes.** The `Data3D` record: a 512 byte heightmap measured from the world floor, then one palette per sub chunk with little endian int32 biome ids, including the header byte that means "the same as the sub chunk below" and the truncated tail the game leaves when the rest would all inherit.
  - **level.dat.** The 8 byte header and little endian NBT payload, plus `levelname.txt`, keeping the previous file as `level.dat_old` the way the game does.
  
  `BlockStorage` gains `getPalette` and `getPaletteIndexAt`, which the disk codec needs to write the packed indices directly instead of round-tripping every block through the palette. `@jsprismarine/bedrock-data` now exports `biome_id_map`.

- [#2579](https://github.com/JSPrismarine/JSPrismarine/pull/2579) [`b6c3d73`](https://github.com/JSPrismarine/JSPrismarine/commit/b6c3d73168fa0397205e20fcbf3cc19c4d0bac36) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove constructs that ahead-of-time compilation with scriptc cannot lower, keeping runtime behavior the same.
  
  - `@jsprismarine/bedrock-data` exports `creativeitems` from a generated, explicitly typed module (`CreativeItemEntry[]`) instead of the raw JSON.
  - `@jsprismarine/brigadier` keeps each argument builder in the module of the node it builds (the old paths re-export), declares `literal` and `argument` as functions, and its exception types call message factories positionally.
  - `@jsprismarine/errors` declares its `Error` base without a type parameter.
  - `@jsprismarine/math` exposes `Vector2.ZERO` and `Vector3.ZERO` as shared immutable instances, and `Vector3` subclasses keep their class through `withX` and friends by overriding `create`.
  - `@jsprismarine/minecraft` exports `blockSchemas` from a generated, typed module (`BlockSchemaCatalog`).
  - `@jsprismarine/prismarine` replaces the `evt`-based event bus with its own `EventEmitter` (same `on`, `once`, `removeListener`, `removeAllListeners`, `emit` and `post`), carries inventory transaction data as a discriminated union (`kind`), exposes `allBlocks()`, `allItems()` and `allEntities()` registries, and drops the `heap`, `evt`, `fast-jwt` and `confbox` dependencies.
  - `@jsprismarine/raknet` declares `sendPacket` without a type parameter.

- [#2577](https://github.com/JSPrismarine/JSPrismarine/pull/2577) [`aeaf717`](https://github.com/JSPrismarine/JSPrismarine/commit/aeaf7171f271b7c6b03df42a6152d1f63b82826b) Thanks [@filiphsps](https://github.com/filiphsps)! - Protocol 2193: Minecraft 1.26.50 and 1.26.51.
  
  Everything that was captured for 1.26.40 was captured again from a Bedrock Dedicated Server 1.26.51.1 - the item table (2076 items), the block palette (1477 blocks, 22079 states: 98 new wool and concrete stairs and slabs, a `minecraft:corner` on every stair, four connection states on every fence, pane and bar) and the recipes (1967) - and three things a 2193 client will not get into the world without were captured for the first time: the jigsaw structure rules, sent as `JigsawStructureDataPacket` before `StartGame` because the client disconnects with `MissingStructureData` otherwise; the definitions of the ninety-eight vanilla blocks that 1.26.50 defines in data, which `StartGamePacket` now declares the way a real server does; and the biome definitions, whose packet stopped being two loose lists and became a map of biome data plus a shared string table - a client reaches the world-generation screen with an empty one and gives up, so the real payload is now replayed. `packages/client/tools/capture-server-data.mjs` records all of them in one login.
  
  This was found the only way it could be: a retail 1.26.51 client reaching the world-generation screen and stalling. The same client also confirmed that, faced with a server that answers NetherNet's `GET /v1/join` signaling probe with a 404, it falls back to a direct RakNet connection - which is the transport this server speaks.
  
  The `LevelChunkPacket` payload wrote its biome sections with the wrong palette header. Each biome sub chunk is a paletted store like the block ones, and its header is `(bitsPerBlock << 1) | networkFlag`; the server wrote `bitsPerBlock 0` but left the network flag clear (`0` instead of `1`), which tells the client the palette is the *persistent* on-disk kind whose entries are NBT compounds. The client then reads the biome value varint as the start of a tag, the whole column decodes to nonsense, and it drops the join at world generation - the last thing standing between a real client and spawning. The section is now `01` (single value, network flag set) plus the biome value per sub chunk, one sub chunk for every one of the client's twenty-four, then the border byte, checked by decoding the packet the server sends and confirming it is consumed to the last byte. This too was invisible to the server's own client, which never deserialized terrain.
  
  **The packets the client actually sends were wrong at 2168, and are right now.** The 2168 work was checked with this repository's own client, which reads `StartGame` partially, moves with `MovePlayerPacket` and never touches an inventory - so nothing exercised the paths a real client takes, and several of those had drifted years earlier:
  
  - `StartGamePacket` still wrote a movement mode in front of the movement settings. That field left the protocol at 1.21.90, when client authoritative movement was retired, and every field after it went out one byte late. The full layout is now modeled in `@jsprismarine/protocol` and checked by decoding the packet BDS 1.26.51 sends and writing it back byte for byte.
  - A real client moves with `PlayerAuthInputPacket`, every tick, and has since 1.21.80; the server had no decoder for it, so a real player could not move, and neither could they break a block, because a survival break rides in that packet's block actions. Both are read now and go through the same code as `MovePlayer` and `PlayerAction` do.
  - `InventoryTransactionPacket` was read in its 748 layout: no presence byte before the legacy slot list, window ids and flags inferred rather than read, and no `Hand`, which 2193 added. `ItemStackRequestPacket` likewise: an action's selector, the four fixed bytes of a stack net id, the client's own descriptor form for auto-craft ingredients. `ItemStackResponsePacket` wrote none of its three optionals. All three follow gophertunnel's 2193 encoding now, with tests that write the bytes by hand.
  - Block positions in `PlayerActionPacket` were read with an unsigned y, the layout up to 1.26.0; a block below sea level came out in the billions.
  
  `PlaySoundPacket` gained the loop count, the range bypass and the two optionals 1.26.50 added, and can be encoded at all. `BuildPlatform` lost its retired members, `UWP` among them: BDS validates a login against the list now and refuses the value the client used to report, so it reports `WIN32`.
  
  **The datagen reads Mojang's new publications.** `enums.html` is gone; a release is a `metadata.zip` of JSON schemas attached to a GitHub release, and the schemas list an enum's members without their values. `import-schemas.js` pins two releases - the target for the members, the first later preview whose schemas carry `x-enum-binary-value` for the numbers - into `snapshot/enums.json`, which `generate-enums.js` prefers over the old HTML dump wherever the schemas describe an enum. `DisconnectReason` and `PlayerAuthInputData` are generated from them. The recipe generator reads the `.brarchive` files a 1.26.50 server packs its behavior packs into, and the palette capture places every block in four settings so that none pops before the save.
  
  One thing this release cannot fix: BDS 1.26.51 defaults to `transport=nethernet` and prints that RakNet is no longer a supported transport for players. This server speaks RakNet only. Whether a 1.26.51 client still connects to a RakNet server by address is not something this repository can test.

## 0.14.2

No changes in this release.

## 0.14.1

### Patch Changes

- [`53eb2f6`](https://github.com/JSPrismarine/JSPrismarine/commit/53eb2f605a8a90bee72788ac785fd4046ecce2b2) Thanks [@filiphsps](https://github.com/filiphsps)! - Bump Vite to 8.0.12 across the root, every workspace package, and the turbo generator template, and roll in the follow-up fixes needed to keep the codebase happy under Vite 8 (Rolldown):
    - Drop the `vite-tsconfig-paths` plugin in favor of Vite 8's native `resolve.tsconfigPaths: true` option, rename `build.rollupOptions` to `build.rolldownOptions` in the shared root config, drop the no-longer-supported output options (`hoistTransitiveImports: true`, `indent: false`, `interop: 'auto'`, `validate: true`), and remove the dropped `rollupTypes` option on `vite-plugin-dts`.
    - Untangle the `BuiltInExceptions -> SimpleCommandExceptionType -> CommandSyntaxException -> BuiltInExceptions` module load cycle that Rolldown refused to swallow the way the previous esbuild-based bundler did:
        - Defer `CommandSyntaxException.BUILT_IN_EXCEPTIONS` construction to a lazy getter and wrap every `BuiltInExceptions` static field in a memoized factory so no `new SimpleCommandExceptionType(...)` / `new DynamicCommandExceptionType(...)` runs during the class's static-initialization phase.
        - Add named exports for `SimpleCommandExceptionType` and `DynamicCommandExceptionType` alongside their existing default exports and switch the in-package call sites (`BuiltInExceptions`, `BuiltInExceptionProvider`, the brigadier barrel, and `SimpleCommandSyntaxExceptionType.test.ts`) to the named imports so they side-step Rolldown's stricter default-binding resolution while external default-import call sites keep working unchanged.
    - Hoist `vi.mock('@jsprismarine/raknet', ...)` out of the `describe` block in `Server.test.ts` so vitest stops warning about runtime hoisting (it will become an error in a future vitest release).
    - Replace the `fs.readdirSync` block enumeration in `Block.test.ts` with an eager `import.meta.glob` so vite's `dynamic-import-vars` plugin stops complaining about the missing static file extension.
    - Teach typedoc about the `@todo` block tag (plus the rest of TSDoc's standard tags) via a `blockTags` allow-list in `typedoc.json` so internal todo comments stop emitting "unknown block tag" warnings, and re-point Logger's `@document` to `../../../docs/log-levels.md` so the path resolves from the source file (`packages/logger/src/logger.ts`) up to the repo root's `docs/log-levels.md`.
    - Add `packages/bedrock-data/src/generated/*` to `.prettierignore` so the auto-generated JSON blobs don't trip prettier formatting checks.

## 0.14.0

### Minor Changes

- [`4364c2f`](https://github.com/JSPrismarine/JSPrismarine/commit/4364c2fee5b4cc8f8dce04ee3213db3f5a434e4a) Thanks [@filiphsps](https://github.com/filiphsps)! - Republish every package with its compiled `dist/` output. The previous stable release shipped without any built code — every tarball on npm contained only `package.json`, `README.md`, `CHANGELOG.md`, and `LICENSE` — because `pnpm run build` had been commented out of the release workflow at the time of the cut. The build step has since been restored; this minor bump forces a fresh stable publish so consumers actually receive the compiled code.

### Patch Changes

- [`0590f70`](https://github.com/JSPrismarine/JSPrismarine/commit/0590f70413e7e8038473c309f1b7c41889f3f6de) Thanks [@filiphsps](https://github.com/filiphsps)! - Explicitly update the BedrockData submodule in the release workflow before building so publishes never ship with stale or missing data.

- [`3a6587f`](https://github.com/JSPrismarine/JSPrismarine/commit/3a6587fc1244f84ca9e7bcf1a9f8606d8f08f1d7) Thanks [@filiphsps](https://github.com/filiphsps)! - Include `src/generated/**` in turbo build outputs so cache hits restore the JSON files that typedoc needs to resolve `@jsprismarine/bedrock-data` source.

- [`3aa7813`](https://github.com/JSPrismarine/JSPrismarine/commit/3aa78132d3805cefe776d8de835b0b1081ca3095) Thanks [@filiphsps](https://github.com/filiphsps)! - Bump TypeScript to 6.0.3 and drop deprecated `downlevelIteration`/`baseUrl` from tsconfigs.

## 0.13.5

### Patch Changes

- [`5a9f6d3`](https://github.com/JSPrismarine/JSPrismarine/commit/5a9f6d3459722aa9fe2d18b225eb939a6ddbca51) Thanks [@filiphsps](https://github.com/filiphsps)! - Force-republish all packages at 0.13.4 to recover from a broken release pipeline.

    Previous attempts to publish 0.13.3 left the npm registry in an inconsistent state: a handful of packages (`brigadier`, `client`, `color-parser`, `errors`, `prismarine`, `raknet`) were pushed under the `unstable` dist-tag at the non-snapshot version `0.13.3`, while the rest failed mid-publish. Rather than try to repair 0.13.3 in place, we're skipping it entirely and resyncing every package on `latest` at 0.13.4.

## 0.13.2

## 0.13.1

## 0.13.0

## 0.12.1

### Patch Changes

- [`d32eb1d`](https://github.com/JSPrismarine/JSPrismarine/commit/d32eb1d812125a096cf33d4eea94c6a662c15b72) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix types order in package.json.

## 0.12.0

## 0.11.1

## 0.11.0

## 0.10.0

### Patch Changes

- [`34d13ae`](https://github.com/JSPrismarine/JSPrismarine/commit/34d13ae152d432ef40d1c192509384173fd63ef0) Thanks [@filiphsps](https://github.com/filiphsps)! - Fix json inclusion.

- [`e852e2b`](https://github.com/JSPrismarine/JSPrismarine/commit/e852e2b5beb6418d9aaae7574c21b1cfde048a0a) Thanks [@filiphsps](https://github.com/filiphsps)! - Bring tooling closer to supporting `composite: true`.

## 0.9.0

## 0.8.0
