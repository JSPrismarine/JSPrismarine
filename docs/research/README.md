# Research notes

Investigations against primary sources for the data-driven vanilla effort. The plan that draws on them is [docs/plans/data-driven-vanilla.md](../plans/data-driven-vanilla.md). Each note cites the source of every claim and ends with the commands that reproduce it.

The first nine notes, written 2026-10-24, asked how a Bedrock server becomes data-driven. The eight that follow, written the same day, ask the narrower question the plan now turns on: whether Java Edition's data can drive a server that speaks to Bedrock clients.

## The Bedrock side

- [bedrock-data-extraction.md](bedrock-data-extraction.md): obtaining the Bedrock Dedicated Server automatically, what its zip contains, what is and is not data-driven in vanilla Bedrock, Mojang/bedrock-samples, licensing, peer projects, running BDS headless in CI, what this server hardcodes today.
- [bedrock-entities-spawning-loot-trading.md](bedrock-entities-spawning-loot-trading.md): the entity, spawn rule, loot table and trade table grammars with vanilla usage counts and coverage curves for goals and components.
- [bedrock-blocks-items-recipes-biomes-features.md](bedrock-blocks-items-recipes-biomes-features.md): the block, item, recipe, item catalog, biome, feature, feature rule, structure and voxel shape grammars, which block properties come from where, and a first grouping of all blocks and items by behavior.
- [bedrock-addons-and-custom-content.md](bedrock-addons-and-custom-content.md): the two channels a Bedrock client learns custom content through, the pack container and manifest schemas, resource pack delivery and encryption, custom block, item and entity registration end to end, and what a third-party server cannot do.
- [molang.md](molang.md): the Molang specification, the queries vanilla uses server-side, semantics that matter for parity, existing evaluators, and the design of one for this project.

## The Java side

- [java-datapacks.md](java-datapacks.md): the Java Edition datapack format, Mojang's data generator reports, what Java keeps in code, Java worldgen as data, and the fit of Java data for a Bedrock server.
- [java-registries-and-components.md](java-registries-and-components.md): all 60 datapack element registries with their reload and sync behavior, the item data component system from 1.20.5 to 26.3, loot and predicate composition, enchantments as data, registry sync in the configuration phase, pack format churn, and the boundary a datapack cannot cross.
- [java-code-only-behavior.md](java-code-only-behavior.md): what Java holds in code now that 26.1 removed obfuscation, measured per area from the jar's line tables, with a 34-row table rating whether Bedrock data fills each gap.
- [commands-functions-and-datapack-execution.md](commands-functions-and-datapack-execution.md): that vanilla ships no mcfunction files in either edition, the function runtime and its limits, the two editions' command sets compared, and four defects in this repository's Brigadier port and command packet.

## The seam between them

- [java-to-bedrock-translation.md](java-to-bedrock-translation.md): whether Java-shaped state can be presented to a Bedrock client, measured against GeyserMC, per domain, with the losses counted and the license position stated.
- [hybrid-format-prior-art.md](hybrid-format-prior-art.md): who has fused two content formats (nobody), Chunker and the other bidirectional mapping projects, the four candidate architectures compared, and the reusable mapping data sets with their licenses.
- [edition-behavior-differences.md](edition-behavior-differences.md): 278 classified differences between the editions, each marked for who decides it and what happens if the server implements Java's version, plus a testable wording for the parity claim and the categories it must exclude.
- [storage-and-chunk-translation.md](storage-and-chunk-translation.md): what this repository persists today, the Bedrock LevelDB format against Java's Anvil format, the cost of translating at the chunk boundary measured on this repository's code, and a storage recommendation.
- [cross-edition-worldgen-parity.md](cross-edition-worldgen-parity.md): whether Java's published world generator produces Bedrock-identical worlds, the random number generator ceiling, structures, a verification method against a real server, and deepslate.

## Method and prior art

- [packet-codec-enforcement.md](packet-codec-enforcement.md): existing one-way packet codecs, enforcement options, and a fingerprinted legacy baseline.
- [protocol-2225-delta.md](protocol-2225-delta.md): everything that changed on the wire between protocol 2193 and 2225 (Minecraft 1.26.60), verified against Mojang's release schemas and gophertunnel, with what `Codec2225` implements and what is still inherited from 2193.
- [prior-art-data-driven-servers.md](prior-art-data-driven-servers.md): how seventeen servers, engines and data projects model blocks, items and entities as data plus code, load packs and verify parity, with a pattern recommendation and reusable pieces.
- [engine-behavior-inventory.md](engine-behavior-inventory.md): the behaviors a server must implement for 1463 blocks, 1623 items, 129 entities and the world, grouped into families with sizing.
- [extraction-and-parity-verification.md](extraction-and-parity-verification.md): what the Script API and Endstone DevTools can dump, the extended packet capture, reference worlds, the parity test suite and caching.
- [bedrock-data-pipeline.md](bedrock-data-pipeline.md): where every committed Bedrock artifact comes from and how to refresh it, as a per-artifact table, with what the capture already automates, the one manual artifact, the unreferenced files and the upstream and legal posture.
