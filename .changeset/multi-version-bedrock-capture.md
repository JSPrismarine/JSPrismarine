---
'@jsprismarine/bedrock-data': patch
'@jsprismarine/minecraft': patch
'@jsprismarine/mapping': patch
'@jsprismarine/client': patch
---

Make the Bedrock capture pipeline multi-version and remove the last manual step.

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
`pnpm --filter @jsprismarine/bedrock-data run dump:bedrock -- --pass palette` produces
`snapshot/v<protocol>/block-palette.json` with no manual step. `generate-recipes.js` defaults to
the server `fetch:sources` already unpacks instead of needing a hand-set path, keeping
`BEDROCK_SERVER` as the escape hatch.

Also fixes four readers in `@jsprismarine/mapping` that still used the pre-versioning
`datagen/snapshot/block-palette.json`; two were tests that had been failing with ENOENT.

Two unreferenced files, `src/jsp/block_id_map.json` and `src/jsp/runtime_block_states.dat`, are
deleted. No code read either, and nothing in the pipeline regenerated them.
