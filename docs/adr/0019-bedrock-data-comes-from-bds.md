# Bedrock data comes from the pinned server, not CloudburstMC/Data

Status: accepted, 2026-11-15

`@jsprismarine/bedrock-data` generates its tables from the pinned Bedrock Dedicated Server and from Mojang's `bedrock-samples`, and from nothing else. The `packets` pass of `dump:bedrock` records what the server sends a joining client under `src/jsp/v<protocol>/wire/`, and `utils/build.js` reads the item versions and item components from `ItemRegistryPacket`, the creative menu from `CreativeContentPacket` and the actor list from `AvailableActorIdentifiersPacket` there. The `dump` pass records the Script API's block types, which the block display names come from. Bringing up a protocol takes a server pin in `sources.json` and a capture, and no third party has to publish anything first.

These tables used to come from CloudburstMC/Data, which `pnpm install` downloaded and linked to `src/resources`. Upstream has no tags, so each pin was a commit on master, and it publishes a version only after somebody dumps it. A preview protocol, or a release CloudburstMC has not dumped yet, could not be generated at all. CloudburstMC dumps the same packets this repository already captured, so the download bought nothing the capture did not have. Two captures of each pinned server, at 2193 and 2225, were byte identical, and the generated tables matched the CloudburstMC build on every item, entry and actor.

## Considered options

Keeping CloudburstMC/Data as a cross-check, as [the pipeline note](../research/bedrock-data-pipeline.md) suggested, would keep the download in every install for a comparison. The parity families that used it now compare against `bedrock-samples` instead: `mojang-items.json` gives each item's numeric id, and the behavior pack's biome files give each biome's climate.

Vendoring the CloudburstMC files would end the download but freeze the data at one version, which is the problem being solved.

## Consequences

`CreativeContentPacket` names a block by its hashed runtime id alone. A creative entry's `block_states` therefore holds a compound with only `network_id`, where CloudburstMC's also held the name, states and legacy id. Nothing read those fields. The protocol palette test now checks each captured id against the hash of a palette state of the block the entry names.

Per-state collision boxes have no source here. The Script API reports none, and no Mojang publication carries them. `packages/blocks/src/tables/blockGeometry.json`, flattened from CloudburstMC's 1.26.51 block dump, is checked in and no longer regenerated, and a block it does not list is a full cube. [#3106](https://github.com/JSPrismarine/JSPrismarine/issues/3106) tracks a replacement. The table's liquid reaction column now has one. The `dump` pass records the Script API's water answers for every block permutation, and `packages/blocks/src/tables/blockLiquidReactions.json` is generated from them.

CloudburstMC's `biome_definitions.json` and `blocks.json` fed only the parity cross-check and the two `@jsprismarine/blocks` generators above, so neither has a generated replacement.
