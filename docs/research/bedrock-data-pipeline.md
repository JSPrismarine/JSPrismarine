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
| `src/jsp/bedrock/*.json` | `utils/bedrock-dump/run.ts`, pass `dump` | pinned BDS plus the generated dump behavior pack (`utils/bedrock-dump/pack.ts`) | `pnpm --filter @jsprismarine/bedrock-data run dump:bedrock -- --pass dump` | yes, weekly in CI |
| `src/jsp/reference_world.json` | same, pass `refworld` | pinned BDS, fixed seed and dimension from `utils/bedrock-dump/region.ts` | `… -- --pass refworld` | yes |
| `src/jsp/required_item_list.json` (146 KB) | same, pass `packets` | pinned BDS, via `packages/client/tools/capture-server-data.mjs` | `… -- --pass packets` | yes |
| `src/jsp/block_definitions.json` (99 KB) | same, pass `packets` | same | same | yes |
| `src/jsp/biome_definitions_network.nbt` (7.5 KB) | same, pass `packets` | same | same | yes |
| `src/jsp/jigsaw_structure_data.nbt` (204 KB) | same, pass `packets` | same | same | yes |
| `src/jsp/packets/*.bin` | same, pass `packets`, `--extended` | same | same | yes |
| `node_modules/.cache/jsprismarine/<source>/<version>/` | `utils/fetch/fetch-sources.ts` | `sources.json` | `pnpm --filter @jsprismarine/bedrock-data run fetch:sources` | yes, prerequisite of everything below it |
| `packages/minecraft/src/generated/v2193/` enums | `datagen/import-schemas.js` then `generate-enums.js` | pinned `Mojang/bedrock-protocol-docs` release assets named in `datagen/manifest.json` | `pnpm --filter @jsprismarine/minecraft run generate:enums` | yes |
| `packages/minecraft/datagen/snapshot/v2193/enums.json`, `enums.html` | `datagen/import-schemas.js` | same release assets | `pnpm --filter @jsprismarine/minecraft run generate:import` | yes |
| `packages/minecraft/src/generated/v2193/` blocks | `datagen/generate-blocks.js` | `snapshot/v2193/block-palette.json` | `pnpm --filter @jsprismarine/minecraft run generate:blocks` | yes, given the palette |
| `packages/minecraft/src/generated/v2193/` recipes | `datagen/generate-recipes.js` + `brarchive.js` | an unpacked BDS at `BEDROCK_SERVER` or `recipes.bedrockServer` in `datagen/manifest.json`; reads `behavior_packs/vanilla*/__brarchive/recipes.brarchive` | `pnpm --filter @jsprismarine/minecraft run generate:recipes` | scriptable, but wants a path nothing hands it |
| `packages/minecraft/datagen/snapshot/v<protocol>/block-palette.json` | `utils/bedrock-dump/run.ts`, pass `palette` | pinned BDS, `datagen/palette-pack/` scripts staged by `pack.ts` | `pnpm --filter @jsprismarine/bedrock-data run dump:bedrock -- --pass palette` | yes |

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

- **Recipes.** `generate-recipes.js` is not a capture at all. It reads an unpacked server off `process.env.BEDROCK_SERVER ?? config.recipes.bedrockServer` and parses `behavior_packs/vanilla*/__brarchive/recipes.brarchive` with `brarchive.js`. Those are Mojang's own files in the format addon authors write, not a third party's processed dump, which is the point the generator's header makes: the dump it replaced disagreed with its own companion item map for 58% of the names it used. The only reason a human is in the loop is that nothing wires `fetch:sources`' unpack directory to that path.
- **Enums.** `snapshot/v2193/enums.json` and `enums.html` are produced by `import-schemas.js` against pinned `Mojang/bedrock-protocol-docs` release assets, hashed in `datagen/manifest.json`. Already automated.

## 5. Dead files

`src/jsp/block_id_map.json` (19661 bytes) and `src/jsp/runtime_block_states.dat` (40459 bytes) had **no reference from any code in this repository**. A repository-wide search for either name outside `.git/` returned six hits, all prose, and `git log` on the two paths returned one commit, `fa683134ca`, the monorepo migration. They had been inert since.

```sh
rg -n 'block_id_map|runtime_block_states' --glob '!.git'
```

Both were deleted after this note was written: 59 KB of unversioned, unreproducible data that no code read and nothing in the pipeline above regenerates. The hits that remain are historical CHANGELOG entries and descriptions of the files other projects ship under the same names.

## 6. Multi-version

`sources.json` pins one Bedrock Dedicated Server, 1.26.51.1, with one url, one sha256 and one size. `packages/minecraft/datagen/manifest.json` is already shaped for more than one: `versions` is keyed by network protocol version, each entry carries its own `schemas`, `source`, `blocks` and `recipes` pins, output lands in `src/generated/v<protocol>/`, and `defaultProtocolVersion` re-exports one of them at the unversioned paths. Only `2193` is declared.

So the gap is not the capture, which is scripted, and not the generator, which is keyed. It is that the Bedrock side has no per-version pin for the capture to walk. [protocol-2225-delta.md](protocol-2225-delta.md) records the matching blocker from the other end: a second version entry also requires a block palette and recipe files captured from a server of *that* version, and no such capture exists here. `docs/plans/server-rearchitecture.md` holds the versioning plan for `packages/bedrock-data`.

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

### Keeping the four passes identical

Every pass drives the server interactively, so the container run is a foreground process rather than a service: `-i` for the stdin the `stop` command goes to, no `-t` because a pty would change how the engine buffers the lines `run.ts` reads, `--rm` and `--init` so it leaves nothing behind, and a `--name` so a CLI killed by a timeout or a Ctrl+C can still have its container force-removed. `docker run` returns the container's exit status, which is what the existing status check reads. The `packets` pass needs its client to reach the server, so the container publishes UDP 19132 and 19133 on `127.0.0.1` only. On a Linux host the container runs as the invoking uid and gid, so the staged world and the save are not left owned by root; elsewhere the runtime maps ownership itself and a uid with no passwd entry inside the image is the larger risk.

The timeouts in section 2 are sized for a native run, so an emulated one multiplies all four by four. Translated instructions are slow enough that the 2400-second reference budget would otherwise expire mid-generation and report a stall that is only emulation.

Everything else in the pipeline already ran on the host and still does. `world.ts` reads the LevelDB save, the palette pass's `extract-block-palette.mjs` and `merge-block-palette.mjs` run under the host's Node, and the output directories are the host's.

### Overrides

`JSP_BDS_RUNNER` takes `auto`, `native` or `container`, with `docker` and `podman` accepted as aliases for `container`; `JSP_BDS_CONTAINER_CLI` names a CLI instead of probing; `JSP_BDS_CONTAINER_IMAGE` names the image; and `JSP_BDS_PATH`, which already existed, points at an unpacked server on either runner. Forcing a runner is for diagnosis, either reproducing a container-only problem on an x86-64 machine or making a host that was expected to run natively fail loudly instead of falling back.

## Sources

- This repository at `4b4e86d0d3`: `packages/bedrock-data/sources.json`, `packages/bedrock-data/utils/bedrock-dump/run.ts`, `packages/bedrock-data/utils/fetch/`, `packages/minecraft/datagen/manifest.json`, `packages/minecraft/datagen/README-palette.md`, `packages/minecraft/datagen/generate-recipes.js`, `.github/workflows/capture.yml`.
- [Bedrock-OSS/BDS-Versions](https://github.com/Bedrock-OSS/BDS-Versions) — the version history Mojang's API omits.
- [CloudburstMC/Data](https://github.com/CloudburstMC/Data) — Apache-2.0, master-only.
- [pmmp/BedrockData](https://github.com/pmmp/BedrockData) — archived at 1.26.30.
- [bedrock-data-extraction.md](bedrock-data-extraction.md) and [extraction-and-parity-verification.md](extraction-and-parity-verification.md) — the upstream survey and the extraction-route survey this note builds on.
