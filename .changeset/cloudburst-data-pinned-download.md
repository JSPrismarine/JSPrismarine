---
'@jsprismarine/bedrock-data': patch
---

Replace the CloudburstMC/Data Git submodule with pinned downloads keyed by Bedrock protocol
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
