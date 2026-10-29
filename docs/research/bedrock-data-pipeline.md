# The Bedrock data pipeline: where each committed artifact comes from

Research note, 2026-10-29. Question: for every Bedrock-derived file this repository commits, what produced it, from which inputs, and what does a contributor run to refresh it for a new version?

Written against this repository at `4b4e86d0d3`: `packages/bedrock-data/sources.json`, `packages/bedrock-data/utils/`, `packages/minecraft/datagen/`, `.github/workflows/capture.yml`, and the upstream publications those pin. It answers a different question than its two neighbors and does not repeat them: [bedrock-data-extraction.md](bedrock-data-extraction.md) is about what Mojang publishes and what is inside it, and [extraction-and-parity-verification.md](extraction-and-parity-verification.md) is about which extraction routes exist and how parity gets verified. This note is about the pipeline as it is wired today.

## Summary

- Capture is already automated, against the common assumption that it is a human sitting in front of a server. One command, `pnpm --filter @jsprismarine/bedrock-data run dump:bedrock`, stages the pinned server, boots it three times and writes every golden under `packages/bedrock-data/src/jsp/`. `.github/workflows/capture.yml` runs it weekly and on a `sources.json` change, and opens a pull request rather than pushing goldens.
- One artifact is genuinely manual: `packages/minecraft/datagen/snapshot/v2193/block-palette.json`, whose two-pass procedure is in `packages/minecraft/datagen/README-palette.md`.
- One artifact looks manual and is not quite: `generate-recipes.js` reads an unpacked server off a path, and the path is one `fetch:sources` already produces.
- The real missing capability is multi-version. `sources.json` pins exactly one Bedrock Dedicated Server; `packages/minecraft/datagen/manifest.json` is already keyed per protocol version.
- Two committed files have no code reference anywhere in `packages/` and have not been touched since the monorepo migration: `src/jsp/block_id_map.json` and `src/jsp/runtime_block_states.dat`.

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
| `packages/minecraft/datagen/snapshot/v2193/block-palette.json` | `datagen/extract-block-palette.mjs` + `merge-block-palette.mjs`, after two human-run server passes | an unpacked BDS, `datagen/palette-pack/`, hand-edited `world_behavior_packs.json` and `manifest.json` | `README-palette.md`, start to finish | **no** |
| `src/jsp/block_id_map.json` (19 KB) | unknown; predates the monorepo migration | — | — | unreferenced, see section 5 |
| `src/jsp/runtime_block_states.dat` (40 KB) | unknown; predates the monorepo migration | — | — | unreferenced, see section 5 |

## 2. What `dump:bedrock` actually does

`utils/bedrock-dump/run.ts` refuses to run anywhere but Linux x86-64, because `sources.json` pins the Linux zip and a partial capture is worse than none. It resolves the unpacked server from `node_modules/.cache/jsprismarine/bds/<version>/unpacked` or from the `JSP_BDS_PATH` override, copies it into a run directory of its own, and never writes into the extracted archive. Then three passes, each a fresh world in that staged server:

1. **`dump`.** `utils/bedrock-dump/pack.ts` writes a behavior pack into the world's `behavior_packs`. The pack walks the Script API registries and prints each row to the content log as `DUMP <table> <json>`; `utils/bedrock-dump/protocol.ts` collects those lines back off stdout and `assertComplete` fails the pass if a table is missing. One JSON file per table lands in `src/jsp/bedrock/`, each carrying a `$comment` saying never to edit it by hand. The log is the transport because the Script API has no file write.
2. **`refworld`.** Generates the reference region with a fixed seed through ticking areas, stops the server cleanly so the save is written, and `utils/bedrock-dump/world.ts` reduces the LevelDB save to `src/jsp/reference_world.json` — per-chunk hashes plus a few whole sample chunks. This is what `packages/parity/` compares a generator against.
3. **`packets`.** Boots the server and runs **our own client**, `packages/client/tools/capture-server-data.mjs`, which logs in and records what the server sends every joining client. It requires `pnpm run build` to have produced `packages/client/dist/index.es.js` first. This pass is where `required_item_list.json`, `block_definitions.json`, `biome_definitions_network.nbt`, `jigsaw_structure_data.nbt` and the `--extended` `packets/*.bin` come from.

The timeouts in `run.ts` size the job: 180 s to boot, 900 s for the dump pack, 2400 s for the reference region.

`.github/workflows/capture.yml` runs all three on `ubuntu-latest` with a 180-minute budget, triggered by `schedule` (weekly, Mondays), by a push to `master` touching `packages/bedrock-data/sources.json`, `packages/bedrock-data/utils/bedrock-dump/**` or the workflow itself, and by `workflow_dispatch`. The workflow's own comment gives the reason for the weekly run: Mojang re-uploads and pulls versions with no retention promise, so a weekly run turns "the pinned zip is gone" into a failing job rather than a surprise during the next bump.

### Fetching the inputs

`pnpm --filter @jsprismarine/bedrock-data run fetch:sources` (`utils/fetch/fetch-sources.ts`) downloads each entry in `sources.json` into `node_modules/.cache/jsprismarine/<source>/<version>/`, verifies the sha256 before unpacking, and skips a source whose verified content is already there. The pinned sources are the Linux BDS zip, `Mojang/bedrock-samples`, the Java server jar, `vanilla-mcdoc` and the Geyser mappings; `cloudburstData` is a cross-reference entry only, recording the commit the `src/resources` submodule pins rather than something the fetcher downloads. Each has a `JSP_*_PATH` env override for offline work.

`utils/fetch/fetch.ts` sends a browser User-Agent: "The minecraft.net CDN resets the HTTP/2 stream for non-browser User-Agents", so curl's default fails.

## 3. The one manual artifact

`snapshot/v2193/block-palette.json` needs a human because of two facts that hold together:

- Runtime block ids are hashes of a block's name and states, so the wire carries no palette at all. `StartGamePacket` lists only the blocks a server added itself, which for vanilla is nothing.
- The Script API over-reports. It answers for the game's *internal* blocks, where a flattened name still carries its legacy states, and taken whole it implies 56957 states against the 17487 the network has. The extras cannot be filtered by name either: `minecraft:cardinal_direction` is legacy on a door and genuine on a shelf.

So which *properties* a block has comes from a saved world's sub-chunk palettes, and which *values* each property takes comes from the game, asked block by block. `README-palette.md` is the procedure: copy `palette-pack/` into the server's `development_behavior_packs/`, write the pack uuid into `worlds/<level>/world_behavior_packs.json`, point `manifest.json` at `scripts/place.js`, run and stop cleanly, then re-point `manifest.json` at `scripts/domains.js` and run again, grep the log, and finally `extract-block-palette.mjs` plus `merge-block-palette.mjs`.

Two hand edits between two server runs is what stops this being a script. Nothing in the procedure needs human judgment, so it is automatable; it just has not been automated.

## 4. What is not actually manual

- **Recipes.** `generate-recipes.js` is not a capture at all. It reads an unpacked server off `process.env.BEDROCK_SERVER ?? config.recipes.bedrockServer` and parses `behavior_packs/vanilla*/__brarchive/recipes.brarchive` with `brarchive.js`. Those are Mojang's own files in the format addon authors write, not a third party's processed dump, which is the point the generator's header makes: the dump it replaced disagreed with its own companion item map for 58% of the names it used. The only reason a human is in the loop is that nothing wires `fetch:sources`' unpack directory to that path.
- **Enums.** `snapshot/v2193/enums.json` and `enums.html` are produced by `import-schemas.js` against pinned `Mojang/bedrock-protocol-docs` release assets, hashed in `datagen/manifest.json`. Already automated.

## 5. Dead files

`src/jsp/block_id_map.json` (19661 bytes) and `src/jsp/runtime_block_states.dat` (40459 bytes) have **no reference from any code in this repository**. A repository-wide search for either name outside `.git/` returns six hits, all prose: `docs/plans/server-rearchitecture.md:239`, `docs/research/extraction-and-parity-verification.md:189`, `docs/research/java-datapacks.md:332` (which calls the id map legacy), `docs/research/prior-art-data-driven-servers.md:124`, `packages/bedrock-data/CHANGELOG.md:23` and `packages/prismarine/CHANGELOG.md:62`. No `import`, no `readFile`, no path string in `packages/`.

```sh
rg -n 'block_id_map|runtime_block_states' --glob '!.git'
git log --oneline -- packages/bedrock-data/src/jsp/block_id_map.json \
    packages/bedrock-data/src/jsp/runtime_block_states.dat
```

The second command returns one commit, `fa683134ca`, the monorepo migration. Both files have been inert since.

Recommendation: delete both. They are an unversioned, unreproducible 59 KB that no code reads, and nothing in the pipeline above regenerates them. That is a code change and out of scope here.

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

## Sources

- This repository at `4b4e86d0d3`: `packages/bedrock-data/sources.json`, `packages/bedrock-data/utils/bedrock-dump/run.ts`, `packages/bedrock-data/utils/fetch/`, `packages/minecraft/datagen/manifest.json`, `packages/minecraft/datagen/README-palette.md`, `packages/minecraft/datagen/generate-recipes.js`, `.github/workflows/capture.yml`.
- [Bedrock-OSS/BDS-Versions](https://github.com/Bedrock-OSS/BDS-Versions) — the version history Mojang's API omits.
- [CloudburstMC/Data](https://github.com/CloudburstMC/Data) — Apache-2.0, master-only.
- [pmmp/BedrockData](https://github.com/pmmp/BedrockData) — archived at 1.26.30.
- [bedrock-data-extraction.md](bedrock-data-extraction.md) and [extraction-and-parity-verification.md](extraction-and-parity-verification.md) — the upstream survey and the extraction-route survey this note builds on.
