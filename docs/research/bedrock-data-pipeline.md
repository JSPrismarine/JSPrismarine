# The Bedrock data pipeline: where each committed artifact comes from

Research note, 2026-10-29. Question: for every Bedrock-derived file this repository commits, what produced it, from which inputs, and what does a contributor run to refresh it for a new version?

Written against this repository at `4b4e86d0d3`: `packages/bedrock-data/sources.json`, `packages/bedrock-data/utils/`, `packages/minecraft/datagen/`, `.github/workflows/capture.yml`, and the upstream publications those pin. It answers a different question than its two neighbors and does not repeat them: [bedrock-data-extraction.md](bedrock-data-extraction.md) is about what Mojang publishes and what is inside it, and [extraction-and-parity-verification.md](extraction-and-parity-verification.md) is about which extraction routes exist and how parity gets verified. This note is about the pipeline as it is wired today.

## Summary

- Capture is already automated, against the common assumption that it is a human sitting in front of a server. One command, `pnpm --filter @jsprismarine/bedrock-data run dump:bedrock`, stages the pinned server, boots it and writes every golden under `packages/bedrock-data/src/jsp/`. `.github/workflows/capture.yml` runs it weekly and on a `sources.json` change, and opens a pull request rather than pushing goldens.
- One artifact used to be genuinely manual, `packages/minecraft/datagen/snapshot/v<protocol>/block-palette.json`. It is now the `palette` pass of the same job; `packages/minecraft/datagen/README-palette.md` documents the command.
- One artifact looks manual and is not quite: `generate-recipes.js` reads an unpacked server off a path, and the path is one `fetch:sources` already produces.
- The real missing capability is multi-version. `sources.json` pins exactly one Bedrock Dedicated Server; `packages/minecraft/datagen/manifest.json` is already keyed per protocol version.
- The capture was host-locked to Linux x86-64, which is the only platform Mojang's server runs on. It now falls back to a Linux x86-64 container on hosts that cannot run the binary, and keeps the native path where they can. [Section 9](#9-the-container-runner) has the design and why no image carries the server.
- Two committed files had no code reference anywhere in `packages/` and had not been touched since the monorepo migration: `src/jsp/block_id_map.json` and `src/jsp/runtime_block_states.dat`. Both have since been deleted.

## 1. The per-artifact table

Paths in the first column are relative to `packages/bedrock-data/` unless they start with `packages/`.

| Artifact | Producer | Inputs | Refresh command | Automated? |
|---|---|---|---|---|
| `src/jsp/bedrock/*.json` | `utils/bedrock-dump/run.ts`, pass `dump` | pinned BDS plus the generated dump behavior pack (`utils/bedrock-dump/pack.ts`) | `pnpm --filter @jsprismarine/bedrock-data run dump:bedrock --pass dump` | yes, weekly in CI |
| `src/jsp/reference_world.json` | same, pass `refworld` | pinned BDS, fixed seed and dimension from `utils/bedrock-dump/region.ts` | `… -- --pass refworld` | yes |
| `src/jsp/required_item_list.json` (146 KB) | same, pass `packets` | pinned BDS, via `packages/client/tools/capture-server-data.mjs` | `… -- --pass packets` | yes |
| `src/jsp/block_definitions.json` (99 KB) | same, pass `packets` | same | same | yes |
| `src/jsp/biome_definitions_network.nbt` (7.5 KB) | same, pass `packets` | same | same | yes |
| `src/jsp/jigsaw_structure_data.nbt` (204 KB) | same, pass `packets` | same | same | yes |
| `src/jsp/packets/*.bin` | same, pass `packets`, `--extended` | same | same | yes |
| `node_modules/.cache/jsprismarine/<source>/<version>/` | `utils/fetch/fetch-sources.ts` | `sources.json` | `pnpm --filter @jsprismarine/bedrock-data run fetch:sources` | yes, prerequisite of everything below it |
| `packages/minecraft/src/generated/v2193/` enums | `datagen/import-schemas.js` then `generate-enums.js` | pinned `Mojang/bedrock-protocol-docs` release assets named in `datagen/manifest.json` | `pnpm --filter @jsprismarine/minecraft run generate:enums` | yes |
| `packages/minecraft/src/generated/unversioned/` enums | same | the frozen 1.26.40 `enums.html`, for the six enums no release describes | same | yes |
| `packages/minecraft/datagen/snapshot/v2193/enums.json`, `enums.html` | `datagen/import-schemas.js` | same release assets | `pnpm --filter @jsprismarine/minecraft run generate:import` | yes |
| `packages/minecraft/src/generated/v2193/` blocks | `datagen/generate-blocks.js` | `snapshot/v2193/block-palette.json` | `pnpm --filter @jsprismarine/minecraft run generate:blocks` | yes, given the palette |
| `packages/minecraft/src/generated/v2193/` recipes | `datagen/generate-recipes.js` + `brarchive.js` | an unpacked BDS at `BEDROCK_SERVER` or `recipes.bedrockServer` in `datagen/manifest.json`; reads `behavior_packs/vanilla*/__brarchive/recipes.brarchive` | `pnpm --filter @jsprismarine/minecraft run generate:recipes` | scriptable, but wants a path nothing hands it |
| `packages/minecraft/datagen/snapshot/v<protocol>/block-palette.json` | `utils/bedrock-dump/run.ts`, pass `palette` | pinned BDS, `datagen/palette-pack/` scripts staged by `pack.ts` | `pnpm --filter @jsprismarine/bedrock-data run dump:bedrock --pass palette` | yes |

## 2. What `dump:bedrock` actually does

`utils/bedrock-dump/run.ts` runs the pinned binary on the host's own CPU where that works, which is Linux x86-64, and in a Linux x86-64 container anywhere else. [Section 9](#9-the-container-runner) covers that choice. It resolves the unpacked server from `node_modules/.cache/jsprismarine/bds/<version>/unpacked` or from the `JSP_BDS_PATH` override, copies it into a run directory of its own, and never writes into the extracted archive. Then three passes, each a fresh world in that staged server:

1. **`dump`.** `utils/bedrock-dump/pack.ts` writes a behavior pack into the world's `behavior_packs`. The pack walks the Script API registries and prints each row to the content log as `DUMP <table> <json>`; `utils/bedrock-dump/protocol.ts` collects those lines back off stdout and `assertComplete` fails the pass if a table is missing. One JSON file per table lands in `src/jsp/bedrock/`, each carrying a `$comment` saying never to edit it by hand. The log is the transport because the Script API has no file write.
2. **`refworld`.** Generates the reference region with a fixed seed through ticking areas, stops the server cleanly so the save is written, and `utils/bedrock-dump/world.ts` reduces the LevelDB save to `src/jsp/reference_world.json` — per-chunk hashes plus a few whole sample chunks. This is what `packages/parity/` compares a generator against.
3. **`packets`.** Boots the server and runs **our own client**, `packages/client/tools/capture-server-data.mjs`, which logs in and records what the server sends every joining client. It requires `pnpm run build` to have produced `packages/client/dist/index.es.js` first. This pass is where `required_item_list.json`, `block_definitions.json`, `biome_definitions_network.nbt`, `jigsaw_structure_data.nbt` and the `--extended` `packets/*.bin` come from.

The timeouts in `run.ts` size the job: 180 s to boot, 900 s for the dump pack, 2400 s for the reference region.

`.github/workflows/capture.yml` runs them on `ubuntu-latest` with a 180-minute budget, triggered by `schedule` (weekly, Mondays), by a push to `master` touching `packages/bedrock-data/sources.json`, `packages/bedrock-data/utils/bedrock-dump/**` or the workflow itself, and by `workflow_dispatch`. The workflow's own comment gives the reason for the weekly run: Mojang re-uploads and pulls versions with no retention promise, so a weekly run turns "the pinned zip is gone" into a failing job rather than a surprise during the next bump.

### Fetching the inputs

`pnpm --filter @jsprismarine/bedrock-data run fetch:sources` (`utils/fetch/fetch-sources.ts`) downloads each entry in `sources.json` into `node_modules/.cache/jsprismarine/<source>/<version>/`, verifies the sha256 before unpacking, and skips a source whose verified content is already there. The pinned sources are the Linux BDS zip, `Mojang/bedrock-samples`, the Java server jar, `vanilla-mcdoc` and the Geyser mappings; `cloudburstData` is a cross-reference entry only, recording the commit the `src/resources` submodule pins rather than something the fetcher downloads. Each has a `JSP_*_PATH` env override for offline work.

`utils/fetch/fetch.ts` sends a browser User-Agent: "The minecraft.net CDN resets the HTTP/2 stream for non-browser User-Agents", so curl's default fails.

## 3. The artifact that used to be manual

`snapshot/v<protocol>/block-palette.json` needs two server runs rather than one because of two facts that hold together:

- Runtime block ids are hashes of a block's name and states, so the wire carries no palette at all. `StartGamePacket` lists only the blocks a server added itself, which for vanilla is nothing.
- The Script API over-reports. It answers for the game's *internal* blocks, where a flattened name still carries its legacy states, and taken whole it implies 56957 states against the 17487 the network has. The extras cannot be filtered by name either: `minecraft:cardinal_direction` is legacy on a door and genuine on a shelf.

So which *properties* a block has comes from a saved world's sub-chunk palettes, and which *values* each property takes comes from the game, asked block by block.

The procedure used to be two hand edits between two server runs: copy `palette-pack/` into the server's `development_behavior_packs/`, write the pack uuid into `world_behavior_packs.json`, point `manifest.json` at `scripts/place.js`, run and stop cleanly, re-point it at `scripts/domains.js`, run again, grep the log, then merge. Nothing in that needed human judgment, and it is now the `palette` pass: `pack.ts` already wrote a manifest per pass for the other two passes, so the palette's two halves reuse it and the hand-edited manifest is gone.

Two hand edits between two server runs is what stops this being a script. Nothing in the procedure needs human judgment, so it is automatable; it just has not been automated.

## 4. What is not actually manual

- **Recipes.** `generate-recipes.js` is not a capture at all. It parses `behavior_packs/vanilla*/__brarchive/recipes.brarchive` with `brarchive.js`. Those are Mojang's own files in the format addon authors write, not a third party's processed dump, which is the point the generator's header makes: the dump it replaced disagreed with its own companion item map for 58% of the names it used. The path it reads is no longer a human's to supply: `bedrockServerCachePath` resolves the version's unpack directory out of `fetch:sources`' cache, and `BEDROCK_SERVER` or a `bedrockServer` pin override it.
- **Enums.** `snapshot/v2193/enums.json` and `enums.html` are produced by `import-schemas.js` against pinned `Mojang/bedrock-protocol-docs` release assets, hashed in `datagen/manifest.json`. Already automated.

## 5. Dead files

`src/jsp/block_id_map.json` (19661 bytes) and `src/jsp/runtime_block_states.dat` (40459 bytes) had **no reference from any code in this repository**. A repository-wide search for either name outside `.git/` returned six hits, all prose, and `git log` on the two paths returned one commit, `fa683134ca`, the monorepo migration. They had been inert since.

```sh
rg -n 'block_id_map|runtime_block_states' --glob '!.git'
```

Both were deleted after this note was written: 59 KB of unversioned, unreproducible data that no code read and nothing in the pipeline above regenerates. The hits that remain are historical CHANGELOG entries and descriptions of the files other projects ship under the same names.

## 6. Multi-version

Both sides are keyed by protocol version now. `sources.json`'s `bds` entry carries a `versions` table and a `defaultProtocolVersion`, pinning 2193 (1.26.51.1) and 2225 (1.26.60.6, sha256 `cbbd5414fa6a…`); `--protocol <n>` on `fetch:sources` and `dump:bedrock` selects one, and each caches under `node_modules/.cache/jsprismarine/bds/v<protocol>/`. The captures land in `packages/bedrock-data/src/jsp/v<protocol>/` and `utils/build.js` writes the default version's generated tables at the unversioned paths and every other version's under `src/generated/v<protocol>/`. `packages/minecraft/datagen/manifest.json` has the same shape: `versions` keyed by protocol, each with its own `schemas`, `source`, `blocks` and `recipes` pins, output under `src/generated/v<protocol>/`, and `defaultProtocolVersion` re-exported unversioned.

What 2225 has, as of the capture recorded in [section 11](#11-what-the-2225-capture-produced): enums, recipes, an item table, block definitions and biome definitions. What it lacks is the block palette, so `manifest.json`'s 2225 entry still declares no `blocks` — the palette capture does not reproduce run to run ([section 10](#10-what-running-all-four-passes-found)). 2193 stays `defaultProtocolVersion` until it does. [protocol-2225-delta.md](protocol-2225-delta.md) records what that entry has and what it lacks; `docs/plans/server-rearchitecture.md` holds the versioning plan for `packages/bedrock-data`.

## 7. Upstream availability

- Per-version zips resolve directly, without authentication, at `https://www.minecraft.net/bedrockdedicatedserver/bin-linux/bedrock-server-<version>.zip`, working back to 1.21.0.03.
- The current release and preview, and nothing older, come from `https://net-secondary.web.minecraft-services.net/api/v1.0/download/links`.
- Version history, which Mojang does not publish, is at [Bedrock-OSS/BDS-Versions](https://github.com/Bedrock-OSS/BDS-Versions).
- In 1.26.61.1, `behavior_packs/vanilla/` ships only `__brarchive/*.brarchive` binaries. There is no loose `blocks.json`, no `recipes/` directory, no `biomes/`. Zip-only extraction is therefore weaker than older write-ups imply, and a reader like `brarchive.js` is not optional.

Third-party mirrors:

- `pmmp/BedrockData` is archived at 1.26.30; pmmp shut down in July 2026. `datagen/manifest.json` already records that this project deliberately left it.
- `CloudburstMC/Data` is live and Apache-2.0, but master-only with no tags. This repository pins a commit of it as the `packages/bedrock-data/src/resources` submodule and records that commit in `sources.json` as a cross-reference. Treat it as a verification oracle, not as a source of record: an untagged master is not a version pin.

## 8. Legal posture

Nothing here is legal advice. The posture the pipeline already takes:

- Downloading BDS in CI is what every peer project does. The zip carries no license file, and the EULA is accepted at the download page rather than in the archive.
- Do not redistribute the zip or the `bedrock_server` binary. Keeping it in gitignored `node_modules/.cache/` is the right place for it, and `run.ts` treats the extracted copy as read-only.
- `Mojang/bedrock-samples` is "(c) Mojang AB. All rights reserved" under the EULA. It is a build input. Do not vendor it.
- The goldens this repository commits are derived facts measured from a running server, not copies of Mojang's files. Generating them locally is a safer position than pinning a third party's redistribution of the same data.

## 9. The container runner

Mojang builds the server for Linux x86-64 and Windows x86-64 and nothing else, so the capture was unrunnable on an Apple Silicon or Linux arm64 machine. That is a maintainer-facing limit with a real cost: refreshing a golden or adding a protocol version meant dispatching the CI workflow and waiting, or finding an x86-64 box.

`utils/bedrock-dump/runner.ts` picks between two ways to start the same staged server.

- **Native**, which is what the capture always did: run the staged `bedrock_server` with the run directory as its working directory. Chosen whenever the host is `linux/x64`, so `ubuntu-latest` in `.github/workflows/capture.yml` takes the same path it did before and the job is not slowed by a container it does not need.
- **Container**, chosen on any other host that has a working container runtime. It mounts the run directory at `/bds` and runs `./bedrock_server` out of the mount.

The choice is made from capabilities rather than from the platform alone. A container CLI on `PATH` is not a runtime, because Docker Desktop leaves a CLI behind that fails every command while its VM is stopped, so the probe runs `version --format {{.Server.Version}}` and only a daemon that answers counts. When neither runner is possible, the error names what to install, what to start, and which variable to set, instead of restating the platform.

### Why no image carries the server

The container mounts the staged copy and runs it; no image this repository builds, caches or pushes contains Mojang's binary. That keeps the posture [section 8](#8-legal-posture) already takes, where the zip lives in gitignored `node_modules/.cache/` and the extracted tree is read-only. A third-party "BDS image" would have been less work and is the wrong trade twice over: it redistributes the server, and it asks the capture to trust a stranger's build of the thing every golden is measured from.

The image is `docker.io/library/ubuntu:24.04`, a stock LTS base with nothing added. The server is dynamically linked against the glibc and libstdc++ of a recent Ubuntu, and the tag is fully qualified so a host with a rewritten default registry resolves the same image. `JSP_BDS_CONTAINER_IMAGE` overrides it when a server version wants a shared object the base lacks.

That the base is enough was measured rather than assumed: `ldd ./bedrock_server` inside the image reports no unresolved object for BDS 1.26.51.1, so nothing is installed at run time and no generated Dockerfile is needed. The one registry interaction left is obtaining the image itself, and `ServerLauncher.ensureImage` does that once before the first pass rather than letting a pull failure surface six minutes into a staged capture as a server that exited with a CLI status. It also names the failure that has nothing to do with the image: Docker Desktop sets `credsStore`, so a shell whose `PATH` lacks `/Applications/Docker.app/Contents/Resources/bin` cannot pull even a public image and says so in terms of a missing `docker-credential-desktop` executable.

### Keeping the four passes identical

Every pass drives the server interactively, so the container run is a foreground process rather than a service: `-i` for the stdin the `stop` command goes to, no `-t` because a pty would change how the engine buffers the lines `run.ts` reads, `--rm` and `--init` so it leaves nothing behind, and a `--name` so a CLI killed by a timeout or a Ctrl+C can still have its container force-removed. `docker run` returns the container's exit status, which is what the existing status check reads. On a Linux host the container runs as the invoking uid and gid, so the staged world and the save are not left owned by root; elsewhere the runtime maps ownership itself and a uid with no passwd entry inside the image is the larger risk.

Only the `packets` pass has a client to let in, so only it asks for the published ports, on `127.0.0.1` and nowhere else. Publishing them for every pass cost the other three a failure mode they had no use for: anything else holding UDP 19132, including a container a killed capture left behind, made `docker run` exit 125 with `port is already allocated`, which `run.ts` then reported as the server exiting before its expected output.

Both halves of that path were measured rather than reasoned about. Line framing through `docker run -i` matches a native run, and so does the shutdown: the engine's `Server stop requested` and `Quit correctly` both arrive on the pipe after `run.ts` writes `stop` to the CLI's stdin, and the save is on disk afterwards. A RakNet unconnected ping sent from the host to `127.0.0.1:19132` gets an unconnected pong back from the containerized server, advertising protocol 2193 and the staged level name, so the published port carries the `packets` pass's traffic.

The timeouts in section 2 are sized for a native run, so an emulated one multiplies all four by four. That multiplier is now margin rather than need: Docker Desktop on Apple Silicon translates x86-64 with Rosetta, not qemu, and under it the server reaches its ready line in seven seconds and the dump pack walks every registry in three and a half. The four remains for a host that falls back to qemu, where the cost of guessing high is only a genuinely stalled run taking longer to say so.

Everything else in the pipeline already ran on the host and still does. `world.ts` reads the LevelDB save, the palette pass's `extract-block-palette.mjs` and `merge-block-palette.mjs` run under the host's Node, and the output directories are the host's.

### Overrides

`JSP_BDS_RUNNER` takes `auto`, `native` or `container`, with `docker` and `podman` accepted as aliases for `container`; `JSP_BDS_CONTAINER_CLI` names a CLI instead of probing; `JSP_BDS_CONTAINER_IMAGE` names the image; and `JSP_BDS_PATH`, which already existed, points at an unpacked server on either runner. Forcing a runner is for diagnosis, either reproducing a container-only problem on an x86-64 machine or making a host that was expected to run natively fail loudly instead of falling back.

### Why a container rather than something smaller

Docker is the default because it is what most maintainers already have, not because the runner needs it. Nothing in the argument vector is Docker's: `--rm`, `--init`, `-i`, `--name`, `--platform`, `--user`, `-v`, `-w`, `-p` and `-e` are all Podman's too, and the probe's `version --format {{.Server.Version}}` is the right question to ask either. On macOS a `brew install podman` with no machine started renders that template and still exits 125, so the probe rejects it for the right reason and the error names starting a machine. An end-to-end Podman run has not been done here, because initializing a Podman machine downloads a Linux VM image.

The smaller routes do not reach:

- **Rosetta 2 directly.** Rosetta translates x86-64 Mach-O. `bedrock_server` is a Linux ELF, and macOS has no ELF loader, so there is nothing for Rosetta to be handed. The reason the container path is fast is that Rosetta runs *inside* Docker Desktop's Linux VM, which is the supported way to reach it.
- **`qemu-user-static` plus a chroot or proot.** This is what a container runtime without Rosetta already does, minus the filesystem and network isolation and minus the amd64 sysroot, which would then have to be assembled by hand. It trades a dependency most maintainers have for one nobody does.
- **No container at all.** Every artifact in the table in [section 1](#1-the-per-artifact-table) is measured from a *running* engine: the dump pack walks the Script API, the reference world is generated, the packet capture is a login. [Section 7](#7-upstream-availability) already records that the zip is not a substitute, since 1.26.61.1's vanilla pack ships only `__brarchive` binaries. Pinning a third party's dump instead is the trade [section 8](#8-legal-posture) declines.

So: keep Docker with the existing fallbacks, and keep the native path as the one CI takes. The capture is not a contributor-facing command — it runs weekly in `.github/workflows/capture.yml` and on a `sources.json` change — so a maintainer who does not want a container runtime can dispatch the workflow instead, which is what the error message when neither runner is possible already says.

## 10. What running all four passes found

The container runner was unit-tested before it was ever run. Running it found one bug in the runner and three older ones underneath it, none of which depend on the platform. The first two are fixed; the rest are not, and each blocks a golden.

- **Fixed: `pnpm run … -- --pass dump` never reached a server.** pnpm forwards its `--` to the script, Node's `parseArgs` reads it as the end of the options and then rejects `--pass` as a positional. Every documented invocation that passes a flag failed, including the `-- --protocol <n>` in `.github/workflows/capture.yml`. `utils/bedrock-dump/cli.ts` drops one leading separator.
- **Fixed: the reference world pass hung on its fourth tile.** The engine reports a 300-chunk ticking budget, not the 1000 that ten areas of a hundred implied, so the region's four hundred-chunk tiles fill it exactly and only the fourth takes the release path. `removeAllTickingAreas` followed by `createTickingArea` in the same tick never resolves, so the pass sat for its whole stretched 9600-second budget. The release now gets a tick to land, and the four tiles complete in twenty seconds.
- **Open: the reference world is not actually generated.** With the hang gone, `createTickingArea` resolves about a second after it is called, which is not long enough to generate a hundred chunks, and the save holds 119 of the region's 400 chunks with the origin chunk among the missing. `world.ts` catches it and says so. The promise evidently resolves on registration rather than on the chunks being loaded and ticking, which is the assumption the pass is built on, so the pass needs a completion check it can trust — reading every column back, for instance — rather than a tighter timeout.
- **Fixed: no workspace package loaded from plain Node, which broke both host-side halves.** Every package's `.` export is `./src/index.ts`, and those sources import each other without file extensions, so `import('@jsprismarine/minecraft')` and `import('@jsprismarine/leveldb')` both failed under Node with `ERR_MODULE_NOT_FOUND`. The `packets` pass died on the first, before its client sent anything, and the `palette` pass died on the second in `extract-block-palette.mjs`. `utils/bedrock-dump/host.ts` now starts both halves under `tsx`, the resolver `packages/server`'s `start` and `dev` scripts already use, which is why `reader.ts` can keep reimplementing the NBT reading rather than depending on `@jsprismarine/nbt`'s bundle reaching `@jsprismarine/binaryutils` through a bare specifier. Fixing the export maps was the alternative, and it would have changed what four published packages promise in order to fix a job that runs weekly in CI.
- **Open: two goldens do not reproduce, both for reasons upstream of the capture.** With both halves running, `required_item_list.json`, `block_definitions.json` and `biome_definitions_network.nbt` came back byte-for-byte identical to the committed goldens, and so did `block-palette.json`'s `domains` half and every block's *property set*. Two did not. `jigsaw_structure_data.nbt` carries the same 88 template pools at the same total byte count in a different order, so the engine is iterating an unordered container. `block-palette.json`'s `states` half, which records one observed state per block, disagrees on 54 blocks and is missing three: the 54 are the neighbor-sensitive ones (fences, walls, panes, bars, `vine`, `glow_lichen`, `sculk_vein`), the randomized ones (`cave_vines`, `pumpkin_stem`) and `chest`, whose facing follows the placer, and `frog_spawn`, `nether_wart` and `red_mushroom` need a support block the place pass does not give them, so whether they survive to the save is luck. Both want the producer to impose an order — sorting the pools, and placing each block somewhere its state is determined — rather than a re-captured golden.
- **Open: `src/jsp/v<protocol>/bedrock/entities.json` cannot be committed as it stands.** Two runs of the `dump` pass disagree, because `dump.js` spawns a real entity per type and reads its instance attributes, and the engine randomizes some of them — a slime's health came back 8 and then 4. Separately, every one of the 112 rows carries `"aabb": {}`: `entity.getAABB()` returns vectors whose components are accessors, which `JSON.stringify` does not see.

## 11. What the 2225 capture produced

Run 2026-10-29 on an Apple Silicon host through the container runner, `--pass packets --protocol 2225` against the pinned BDS 1.26.60.6. Two runs, compared file by file.

- **Stable and committed.** `required_item_list.json`, `block_definitions.json` and `biome_definitions_network.nbt` came back byte-identical across the two runs and are committed under `src/jsp/v2225/`.
- **Stable but not committed.** `jigsaw_structure_data.nbt` matched across these two runs, which does not contradict [section 10](#10-what-running-all-four-passes-found): the engine iterates the 88 template pools out of an unordered container, so two runs agreeing is not the ordering being fixed. It stays uncommitted until the producer imposes an order.
- **Not stable.** `packets/crafting_data.bin` differs between runs. It carries per-session recipe net ids, so this is expected rather than a defect; the committed recipes come from the behavior packs, not from this payload.

What the item table actually says is the point of the exercise: against 2193 it adds four names — `minecraft:disc_press`, `minecraft:frostbite_spawn_egg`, `minecraft:ice_crystal`, `minecraft:icicle` — removes none, and **moves 82 runtime ids**. `block_definitions.json` and `biome_definitions_network.nbt` are byte-identical to 2193's apart from the provenance header the capture writes: 1.26.60 added no data-driven block and changed no biome definition.

The capture needed one change to reach the server at all. `packages/client` hardcoded protocol 2193, and a Bedrock Dedicated Server refuses a login at any version but its own ("this client is out of date"). `Client` now takes a `protocolVersion`, reports the matching `GameVersion` in its client data, and decodes `StartGamePacket` with the layout for that version — `StartGamePacket2225` in `@jsprismarine/protocol`, which carries the one inserted `Editor Level Migration Version` int8. Without it the capture would have read a 2225 server's block properties one byte out.

Recipes for 2225 ran clean and reproduce, and the 2225 manifest entry declares them. The output is 2193's recipe set exactly, differing only in the `minecraftVersion` header: `vanilla_1.26.60` ships `structures` and a manifest and no recipe layer, so 1.26.60 revised no recipe.

## Sources

- This repository at `4b4e86d0d3`: `packages/bedrock-data/sources.json`, `packages/bedrock-data/utils/bedrock-dump/run.ts`, `packages/bedrock-data/utils/fetch/`, `packages/minecraft/datagen/manifest.json`, `packages/minecraft/datagen/README-palette.md`, `packages/minecraft/datagen/generate-recipes.js`, `.github/workflows/capture.yml`.
- [Bedrock-OSS/BDS-Versions](https://github.com/Bedrock-OSS/BDS-Versions) — the version history Mojang's API omits.
- [CloudburstMC/Data](https://github.com/CloudburstMC/Data) — Apache-2.0, master-only.
- [pmmp/BedrockData](https://github.com/pmmp/BedrockData) — archived at 1.26.30.
- [bedrock-data-extraction.md](bedrock-data-extraction.md) and [extraction-and-parity-verification.md](extraction-and-parity-verification.md) — the upstream survey and the extraction-route survey this note builds on.
