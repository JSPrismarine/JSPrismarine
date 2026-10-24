# Data-driven vanilla: plan, revision 2

Written 2026-10-24 from the seventeen research notes in [docs/research/](../research/README.md). Revision 1 of this file answered "how does a Bedrock server become data-driven" and concluded that Bedrock behavior packs are the only format worth loading. Eight further notes reopened that conclusion by measuring the Java side, and three of its load-bearing facts turned out to be wrong. This revision replaces it.

What changed, in one paragraph. Mojang removed obfuscation from Java Edition in release 26.1, so Java's block properties, mob stats and behavior classes are readable from the official jar instead of needing a community dump or a hypothetical headless Endstone fork ([java-code-only-behavior.md](../research/java-code-only-behavior.md) section 1). Every one of Java 26.3's 35723 block states resolves to a real Bedrock palette entry, and the mapping is published as MIT data by GeyserMC, so Java-shaped content reaching a Bedrock client is a solved problem rather than a research risk ([java-to-bedrock-translation.md](../research/java-to-bedrock-translation.md) sections 1 and 10). And vanilla Java ships zero mcfunction files, so the function runtime that looked like the center of Java's data-driven model buys no parity at all ([commands-functions-and-datapack-execution.md](../research/commands-functions-and-datapack-execution.md) section 1).

## 1. Goal and the parity claim

The goal is a server whose blocks, items, entities, recipes, loot, trading, spawning, biomes and world generation are built at runtime from data through a small set of composable parts, and whose behavior matches Java Edition wherever a server is the thing that decides the behavior.

The claim has to be narrower than "1-1 Java parity", and the reason is measured rather than argued. Of the 278 classified edition differences in [edition-behavior-differences.md](../research/edition-behavior-differences.md) section 13, the server decides 213, the Bedrock client decides 44, and 21 are mixed. If the server implemented Java's behavior in all 278, then 102 would be invisible to the player, 94 would read correctly, 56 would be visible and broken, and 26 would desync. The claim covers the 186 rows that are server-decided and either invisible or correct.

The wording this plan adopts, from section 14 of that note:

> JSPrismarine implements Java Edition's gameplay rules for every behavior a server decides, verified against Java Edition's own implementation, and presents them through the Bedrock client's model of the world. Where a Java rule has no Bedrock presentation, or where the Bedrock client decides the outcome locally, the server implements the behavior the client expects.

Eight categories are excluded by name: rendered presentation, input handling and pose selection, client-predicted simulation, the client's fixed registries, geometry the client owns, world generation past the first random draw, the spawn and cap model, and the six behaviors Mojang closed as working as intended on Bedrock. The exclusions are enumerated in section 14 of the note, and the public claim links to it.

Two of those deserve a note here because they are product decisions rather than constraints. Java's attack cooldown is implementable and invisible to the Bedrock client, which draws no cooldown meter and keeps playing the strong-attack sound, so a player would see weak hits with no explanation. And Java's spawning model is entirely server-side, so it can be implemented, but doing so changes every farm a Bedrock player has built. Both default to Bedrock's behavior under this plan, and both are listed in section 12 for the maintainer.

## 2. The format decision

Revision 1 chose Bedrock behavior packs as the native format and admitted Java data only for terrain. Revision 2 keeps the runtime Bedrock-shaped and moves the data sourcing to Java. The three parts:

**The runtime model and every identifier are Bedrock-shaped.** Blocks, items, entities, biomes and the world keep Bedrock identifiers, Bedrock state names, the Bedrock block palette and the FNV-1a runtime ids this server already writes. Three notes reach this independently. A Java datapack almost never defines a block, item or entity, it references vanilla ones, while a Bedrock pack is the only format of the two that can define content a Bedrock client renders, so references need a one-way table and definitions need none ([hybrid-format-prior-art.md](../research/hybrid-format-prior-art.md) section 9). The repository is already Bedrock-shaped end to end, so a Java model would be a new layer rather than a replacement ([storage-and-chunk-translation.md](../research/storage-and-chunk-translation.md) section 10). And the only neutral model anyone has built, Chunker's, costs 8309 lines of resolvers plus 2710 lines of state groups to buy a round trip a server never performs ([hybrid-format-prior-art.md](../research/hybrid-format-prior-art.md) sections 2 and 3).

**Java Edition data is the gameplay source wherever Java publishes it.** Loot (1447 tables), recipes (2042), advancements (1866), tags (883 files over 20 registries), enchantments (43 over 31 effect component types), damage types, villager trades, predicates, item modifiers, default item components for all 1658 items, and the whole worldgen stack come from Mojang's data generator output, compiled into the Bedrock-shaped registries at load time. This is the half of the request that works as asked: Java is where the composable parts are, and 26.3 sharpened them further by making every predicate, item modifier, loot table, recipe, advancement and provider field accept an inline value, an id, a list, or a tag ([java-registries-and-components.md](../research/java-registries-and-components.md) sections 1 and 6).

**Bedrock behavior packs are the source for what Java keeps in code and Bedrock publishes as data, and the only source for custom content.** That is all 129 entity definitions with their 170 AI goals, the 60 spawn rules, the 27 trade tables, and the block and item component definitions. It is also the whole custom content story, because a Bedrock client learns about a custom block or item from exactly two places, a resource pack it downloads over the game connection and NBT in `StartGamePacket.Block Properties` plus `ItemRegistryPacket.Item Data` ([bedrock-addons-and-custom-content.md](../research/bedrock-addons-and-custom-content.md) section 1). Both pack formats load. A `.mcpack` or `.mcaddon` defines content; a datapack configures it.

Block properties come from neither pack format. No Mojang report in either edition lists hardness, blast resistance, friction, light, map color, sound type or push reaction, but a 93-line program compiled against the unobfuscated 26.3 jar dumps all of them for all 1286 blocks ([java-code-only-behavior.md](../research/java-code-only-behavior.md) section 3). The property table is this project's own shape, not Bedrock's component grammar, because Bedrock's `minecraft:friction` is documented as capping at 0.9 and Java's blue ice is 0.989. A store shaped on the Bedrock grammar cannot hold Java's values.

## 3. What the research settled

Facts this revision rests on that revision 1 did not have.

- Mojang removed obfuscation in Java 26.1 and stopped publishing obfuscation maps. The 26.3 server is 5027 source files and at least 520352 source lines, measured from the jar's line tables: redstone 908 lines, fluids 1475, lighting 2398, explosion 402, fire spread 511, natural spawning 726, goals 5520, brains 8905, block classes 35210 ([java-code-only-behavior.md](../research/java-code-only-behavior.md) sections 1, 2 and 10).
- All 35723 Java block states resolve into Bedrock's 22091-state palette, collapsing onto 15953 distinct Bedrock states. Of the 2313 Java (block, property) pairs, 671 are indistinguishable in the Bedrock state, but 504 are `waterlogged` and return through Bedrock's second block layer, 33 are recomputed by the client, 42 travel in block entity NBT, and 72 of the remaining 92 are `powered` on doors, trapdoors, fence gates and heads, which render in neither edition. Exactly 5 Java states have no Bedrock concept ([java-to-bedrock-translation.md](../research/java-to-bedrock-translation.md) sections 1 and 2).
- Items are nearly 1:1: 1658 Java items to 1606 Bedrock identifiers, with five genuinely lossy merges. All 122 Java data component types are translatable in principle, but anything with no Bedrock slot becomes lore text, including every datapack enchantment, which gets a lore line and a forced glint with no mechanics ([java-to-bedrock-translation.md](../research/java-to-bedrock-translation.md) sections 4 and 5).
- Entities and attributes are where the seam leaks. Java has 161 entity types against Bedrock's 136, with 112 exact name matches, 2 with no representation and 10 rendered as a different entity. 61 of Geyser's 230 metadata translators are explicit drops. Of Java's 40 attributes, only 10 have a Bedrock identifier to send ([java-to-bedrock-translation.md](../research/java-to-bedrock-translation.md) sections 6 and 7).
- Java runs two mob AI systems. The goal system is 68 classes and 5520 lines across 55 classes; the brain system is 116 classes and 8905 lines plus 24 sensors, 115 memory modules and 26 activities, used by exactly 20 mob classes. 30 of the 67 concrete Java goal class names match a Bedrock `minecraft:behavior.*` name exactly after snake-casing, so Bedrock's JSON carries the goal mobs and the 20 brain mobs are the real divergence ([java-code-only-behavior.md](../research/java-code-only-behavior.md) sections 7 and 8).
- Java has 60 datapack element registries, of which 8 reload and 32 sync to the client, and the count grew from 41 at 1.21.5 in four releases. 95 of the 155 registries in `reports/datapack.json` accept no elements at all, so no datapack can add a block, item, entity type, fluid, effect, particle, block entity, sound, attribute, game rule or command ([java-registries-and-components.md](../research/java-registries-and-components.md) sections 1, 2, 3 and 10).
- Vanilla ships no mcfunction files in either edition. Java's `data/minecraft/` has 9884 files across 44 directories with no `function/`, no `tags/function/` and no `item_modifier/`, and 3 standalone predicate files. `bedrock-samples` at 1.26.50.4 has 22258 files and no `.mcfunction`. The function runtime is a content-creator feature, not a parity requirement ([commands-functions-and-datapack-execution.md](../research/commands-functions-and-datapack-execution.md) sections 1 and 2).
- The two command sets differ more than the two data formats. Java 26.3 has 94 root commands over 59 argument parsers and a 2475-node graph; Bedrock 1.26.50 has 84 commands, 279 overloads and 26 basic parameter types, published as data in `mojang-commands.json`. 48 Java root names have no Bedrock counterpart. Bedrock's tree is a flat overload list with no redirects, so Java's fork semantics cannot be expressed in the packet ([commands-functions-and-datapack-execution.md](../research/commands-functions-and-datapack-execution.md) sections 5, 6 and 7).
- Nobody loads both pack formats into one runtime. The one working Bedrock pack loader outside BDS, AddonBridge, has no LICENSE file, ignores `format_version` entirely and collapses roughly 60 goals onto 21 switch arms. The one working Java datapack loader outside Mojang's server is Pumpkin, which also serves Bedrock clients ([hybrid-format-prior-art.md](../research/hybrid-format-prior-art.md) sections 1, 4 and 5).
- The TypeScript pieces for the Java half already exist under MIT: `mc-datapack-loader` (1021 lines, reads zip, directory and `FileSystemDirectoryHandle`, implements `min_format`/`max_format`, overlays and all three merge modes), `vanilla-mcdoc` (246 schema files gated by `#[since=]` and `#[until=]`) and `@spyglassmc/mcdoc` ([hybrid-format-prior-art.md](../research/hybrid-format-prior-art.md) section 6).
- Amulet's PyMCTranslate, the most complete bidirectional database, went proprietary in the 2026-01-09 commit and is unusable. GeyserMC/mappings is MIT, current, machine-readable and one way, which is the direction this project needs ([hybrid-format-prior-art.md](../research/hybrid-format-prior-art.md) sections 7 and 8).
- Translating at the chunk boundary costs about 4 microseconds per section, about 95 microseconds per 24-section column, against the 0.078 milliseconds this repository currently spends serializing a 9-sub-chunk column. The larger number is memory: `BlockStorage.blocks` is a `number[]` at 8 bytes per block, so a full Overworld column retains about 786 KiB where a `Uint16Array` would retain 192 KiB ([storage-and-chunk-translation.md](../research/storage-and-chunk-translation.md) sections 7 and 8).

## 4. Sources of truth by category

| Category | Source | Obtained by | Still without a source |
|---|---|---|---|
| Block identity, states, runtime ids | BDS palette capture (1477 blocks, 22079 states), `mojang-blocks.json` as a cross-check | existing palette pack and capture job | nothing |
| Block properties per state | Java 26.3 jar, dumped by a small program compiled against it | capture job | nothing; the CloudburstMC submodule becomes a cross-check |
| Java state to Bedrock state | `GeyserMC/mappings` `blocks.nbt`, joined to `reports/blocks.json` | pinned fetch | 5 states with no Bedrock concept |
| Block behavior | code in this repository, keyed by family | authored | all of it, by nature |
| Item identity and components on the wire | `ItemRegistryPacket`, `item_components.nbt` | existing capture, submodule | nothing |
| Item properties | Java default item components for 1658 items (122 component types) | data generator | the 70 Java item classes whose behavior is code |
| Entities | vanilla Bedrock pack `entities/` (129 files) for goal mobs; Java's brain classes for the 20 brain mobs | BDS zip; jar | the five undocumented Bedrock event actions |
| Entity stats | Java attribute suppliers, 2619 values over 93 entity types | jar dump | nothing |
| Loot, recipes, advancements, tags, enchantments, damage types, villager trades, predicates, item modifiers | Java data generator output | pinned data generator run | the 8 `crafting_special_*` serializers whose logic is code |
| Spawn rules and trade tables | vanilla Bedrock pack | BDS zip | spawn attempt rates, caps and the light algorithm in both editions |
| Biomes | Bedrock pack `biomes/` and `BiomeDefinitionListPacket` for client-facing ids; Java `biome` registry for placement | BDS zip, capture, data generator | nothing |
| Terrain, features, structures | Java `noise_settings`, `density_function`, `noise`, biome parameters, surface rules, carvers, 240 configured and 273 placed features, 52 structures, 1511 templates | data generator | Bedrock's RNG |
| Custom content on the wire | `StartGamePacket.Block Properties` NBT, `ItemRegistryPacket`, `CreativeContentPacket`, resource pack delivery | authored against the protocol docs, cross-checked with Geyser's MIT dump | what several NBT fields mean |
| Commands | `mojang-commands.json` (84 commands, 279 overloads, 14281 enum values) for the Bedrock tree; Java's tree for semantics | bedrock-samples; jar | 26.3 brigadier argument-type wire ids |

## 5. The Java to Bedrock seam

This is the part revision 1 did not have, and it is where the plan's new risk sits. One module owns it, `@jsprismarine/mapping`, and nothing else in the server is allowed to know that two editions exist.

Its interface is four total functions and their inverses where an inverse exists: Java block state to Bedrock block state, Java item plus components to Bedrock item stack, Java entity type to Bedrock entity type, and Java identifier to Bedrock identifier for the remaining registries. The data behind them is the pinned GeyserMC mappings join, generated into a table at build time rather than hand-maintained, plus this project's own allow list of reviewed losses.

Three rules keep it honest. The loader refuses to start when a Java identifier in a loaded pack has no mapping and no allow-list entry, which is the behavior Geyser's `BlockRegistryPopulator` already has and the reason it can promise totality. Every loss is an allow-list row with a reason, counted on the parity dashboard. And the mapping table is generated, so a version bump regenerates it and the diff is reviewable.

The test suite is Chunker's, adopted as described in [hybrid-format-prior-art.md](../research/hybrid-format-prior-art.md) section 10: every palette entry maps, the output carries exactly the declared state set, the round trip is identity except for the reviewed loss list, and every output identifier and state exists in the real palette for the pinned version. Those five property tests per version are the single most reusable thing the research found.

Where the seam leaks, it leaks at entities and attributes, not blocks and items. 20 of Java's 40 attributes have no Bedrock identifier at all. The plan's answer is that the server computes with Java's attribute set internally and sends the 10 Bedrock accepts, because the attributes that do not transmit (`gravity`, `step_height`, `safe_fall_distance`, `entity_interaction_range`) affect simulation the server performs rather than anything the client draws. That is a claim the parity suite has to check rather than assume, and it is open question 3 in section 13.

## 6. The data pipeline

One package owns it, `@jsprismarine/bedrock-data`, which already owns the submodule, the captures and the generator.

1. **Pin.** One manifest: BDS version, zip URL and sha256; bedrock-samples tag and commit; Java version, server jar sha1 and the data generator invocation; the GeyserMC/mappings commit; the CloudburstMC commit as a cross-check. A version bump on either edition is an edit to this file plus a golden refresh.
2. **Fetch.** Download into `node_modules/.cache/jsprismarine/<source>/<version>/`, verify the hash, unpack. `JSP_BDS_PATH` and equivalents point at a local copy for offline work. The fetch is a turbo task with `cache: false`.
3. **Compose.** Read the 56 vanilla Bedrock layers in version order through the existing brarchive reader, take the MCB folders from bedrock-samples, parse lenient JSON. Run Mojang's Java data generator for the reports and the vanilla datapack. Hash each output folder into `pack-hashes.json` so a version bump shows what moved.
4. **Dump.** The capture job, run on a version bump and weekly rather than on every build. It boots the pinned BDS with the dump pack, runs the extended packet capture, generates the reference world, and compiles and runs the Java property and attribute dumper against the pinned jar. Outputs are committed as goldens under `src/jsp/`.
5. **Generate.** Normalized tables in this project's shape, written to gitignored `src/generated/`: the composed Bedrock pack, the Java-sourced property table per state, the Java to Bedrock mapping tables, the item table, the terrain inputs, and the structure templates re-encoded in Bedrock state names. Generators refuse to emit when two sources disagree on a name, as `utils/build.js` does today.

The distribution position is unchanged from revision 1 and remains maintainer decision 1 in section 12. Both editions fall under the same EULA, and the Java data generator's output is Mojang's content on the same terms as the Bedrock zip's.

## 7. Runtime architecture

The vocabulary is the [codebase-design skill](../../.agents/skills/codebase-design/SKILL.md)'s: a module has one interface at a seam, and depth is behavior per unit of interface a caller has to learn.

### The pack stack

A `PackStack` is the ordered list of content a world runs, and it now holds two kinds of member. Bedrock packs (the composed vanilla pack, this project's overlay, world packs, plugin packs) define content. Java datapacks (the vanilla datapack from the data generator, world datapacks, plugin datapacks) configure it. Loading a stack yields one `Definitions` object per registry, with each format's own precedence rules applied within its half and Bedrock definitions resolved before Java configuration compiles against them.

`@jsprismarine/packs` owns loading. Behind its `load(stack)` interface sit the brarchive reader, the lenient JSON parser, `format_version` dispatch for Bedrock and `pack_format` range checks with overlays for Java, schema validation against bedrock-samples schemas on one side and `vanilla-mcdoc` on the other, and the integer `subject`/`operator` encoding that 27 vanilla Bedrock entity files use. Unknown keys load anyway and are reported once per pack; a strict mode fails the load for tests. `mc-datapack-loader` is a candidate dependency for the Java half and is maintainer decision 5.

### Definitions, types and instances

Unchanged from revision 1, because the research supports it. A definition is parsed, validated, immutable JSON for one identifier. A type is a definition resolved against the component registries once at load, with hooks bound and hot flags computed. An instance is a block state in a chunk, an item stack, or an entity.

Resolution flattens the hot path into typed arrays indexed by runtime id: solidity, light emission and filter, blast resistance, friction, random tick, support and liquid rules. That removes the name sets in `BlockRules`, `BlockShapes` and `Explosion.BLAST_PROOF`. The property values in those arrays come from the Java jar dump, which is why the arrays are this project's shape and hold 0.989 for blue ice.

### Components and behaviors

A component is one documented component name bound to a class with a parameter schema and hooks. Each domain has a registry the server fills and plugins extend.

Revision 1 attached behavior through `minecraft:custom_components`. That hook is now marked deprecated in Mojang's own documentation while the tutorial still teaches it, and version 2 requires two experimental toggles ([bedrock-addons-and-custom-content.md](../research/bedrock-addons-and-custom-content.md) sections 6 and 11). So the plan keeps the hook names, because they are a good shape and a future script host would fit them, but it stops treating the Mojang key as the binding mechanism. Behaviors bind by family in this project's own overlay namespace, and `minecraft:custom_components` is read as one more way to name a behavior rather than the only one.

For entities the component list is the definition's `components`, with `component_groups` and `events` as the state machine. Goals are components with a priority and control flags. The 20 Java brain mobs get a second mechanism, because Bedrock has no memory, sensor or activity registry and their behavior has to be written against Java's model.

### Evaluators

Shared machinery, each a module with one `evaluate` interface and its own tests: Molang (`@jsprismarine/molang`, Pratt parser, AST compiled once per expression into a closure, 61 math functions, versioned precedence, 21 vanilla queries), Bedrock filters (108 tests, ten operators), Java predicates and item modifiers (20 condition types, 42 modifier types, with 26.3's inline-or-id-or-list-or-tag resolution), loot (Java's 1447 tables over 9 entry types), recipes (Java's 22 serializers, less the 8 code-only `crafting_special_*` stubs), spawning (Bedrock's 21 spawn rule components), trading, and features and feature rules.

Two evaluators now have a Java source where revision 1 had a Bedrock one, which simplifies them. Loot and recipes come from Java's grammar, which is richer and fully published, and compile to Bedrock identifiers through the mapping module.

### World generation

`@jsprismarine/worldgen` holds the terrain stack: density functions, the noise router, `RandomState` with Xoroshiro128++, aquifers, the surface rule tree, the multi-noise biome source, carvers, and structure set placement, all from Java's published JSON. deepslate is the reference and a candidate dependency. Biome ids translate to Bedrock's 88 at the chunk boundary. This section is unchanged from revision 1, which already sourced terrain from Java.

### Registries, storage and the plugin interface

One `Registry<T>` shape per domain with tags merged across the stack. Storage stays exactly as it is, Bedrock-shaped on disk, because the internal model is Bedrock-shaped and existing worlds stay readable ([storage-and-chunk-translation.md](../research/storage-and-chunk-translation.md) section 10).

The plugin interface is three things. A plugin ships Bedrock packs to define content, ships Java datapacks to configure it, and registers component and behavior classes in TypeScript for the names its packs use. `ItemRegistryPacket`, `StartGamePacket` block properties and `CreativeContentPacket` are written from the registries, which is what gives plugins custom blocks and items on the wire. Custom entities are the weak case and stay so: the server sends only an identifier string in `AddActorPacket`, and a client with no resource pack draws nothing.

## 8. Parity: how it is measured

Parity is a test suite with a dashboard. The design is [extraction-and-parity-verification.md](../research/extraction-and-parity-verification.md) section 5, extended by [edition-behavior-differences.md](../research/edition-behavior-differences.md) section 14.

Three levels of verification, of which this project claims the first two. Rule parity means the server's state transitions match Java Edition's for the same input sequence, with a vanilla Java server as the oracle, testable in CI with no client. Observable parity means the packets the server sends produce the Java outcome on a real Bedrock client, with a BDS capture as the oracle. Bit parity means identical values for identical seeds, reachable only where no random number is drawn.

The test shapes follow from the classification. Every server-decided and invisible row gets a unit test against a value taken from Java's implementation. Every server-decided and correct row gets a packet-level test against a BDS capture. Every client-decided row gets a test asserting the server does **not** try to override the client, because sending a correction for something the client owns is the failure mode. Every mixed or desync row gets a latency-bounded test measuring the `CorrectPlayerMovePredictionPacket` rate under a scripted movement trace, with a correction rate as the criterion rather than a value match.

Two tests keep the claim honest. A conformance test that the server's classification table stays in step with the research note, so a change that moves a row from server-decided to client-decided is visible in review. And a negative test per excluded category asserting the server does not claim it.

The mapping module adds Chunker's five property tests per version, described in section 5. The dashboard rows are the behavior families of [engine-behavior-inventory.md](../research/engine-behavior-inventory.md) plus one row per mapping domain.

## 9. Phases

### Phase 0: foundations

The manifest and fetch for BDS, bedrock-samples, the Java jar and GeyserMC/mappings. The Java data generator run and the Java property and attribute dumper. The composed Bedrock pack. `@jsprismarine/mapping` with the generated tables and Chunker's property tests. `@jsprismarine/packs` loading both halves of the stack with validation. `@jsprismarine/molang`. `Registry<T>`. The capture job and `packages/parity/` with the registry comparisons and the dashboard.

Exit: registry rows green for blocks, items, entities and biomes; every Java identifier in the vanilla datapack maps or is allow-listed; the dashboard publishes. Deletes nothing.

### Phase 1: blocks and items from data

The per-state property table from the Java dump, flattened into typed arrays and routed through `BlockRules`, `BlockShapes`, `Explosion`, `BlockView`, `Environment` and the break-time formula. This alone fixes behavior for the roughly 1200 blocks the class registry does not know, with no new behavior code. Then the block component runtime, the overlay declaring every block, and the top block behavior families. Then the item component runtime over Java's 122 component types and the item behavior families. `ItemRegistryPacket`, `StartGamePacket` block properties and `CreativeContentPacket` written from the registries, which also covers the 98 data-driven vanilla blocks that must be declared in `Block Properties` from 1.26.50.

Exit: block property rows green for all states; the 260 block classes, 65 item classes, `BlockIdsType`, `ItemIdsType`, `DropTable`, the name sets and the legacy `(id, meta)` requirement deleted.

### Phase 2: loot, recipes, advancements and tags from Java data

The Java loot evaluator over 1447 tables, the recipe evaluator over 2042 files, 883 tag files, 1866 advancements with 54 trigger types, and the enchantment system over 43 files and 31 effect component types. All of it compiles through the mapping module into Bedrock identifiers. This phase is where the Java data pays off most per line of code written, and it is independent of entities.

Exit: loot rows green by structure for every table and by chi-squared distribution where samples exist; recipe rows green by recipe id; `CraftingDataPacket` written from the registry.

### Phase 3: entities, spawning, trading

The Bedrock entity component runtime with the event engine, filters, properties and triggers. Attribute components first, which gives 126 of 129 entities their stats from JSON, with values cross-checked against Java's 2619 attribute values. Goals in use order with the scheduler. The 20 Java brain mobs written against Java's model, because Bedrock's JSON cannot express memories, sensors and activities. Riding, taming, breeding and aging. Spawn rules replacing `MobSpawner`. Trading.

Exit: `AddActorPacket` rows green for every type; the 80 most used goals and 140 most used components implemented, which runs 75 entities completely; `MobStats`, `EntitySize`, `LootTables`, `Brains`, `Targeting`, `Speed` and the 111 entity classes deleted except the four with real code.

### Phase 4: world generation

`@jsprismarine/worldgen` with the terrain stack from Java's JSON and the reference world comparison. A biome model in chunks and LevelDB replacing the plains constant. Features and placement from Java's 240 configured and 273 placed features. The structure template reader. Jigsaw assembly.

Exit: biome, heightmap and terrain-class rows exactly green for the reference region; ore and feature counts within the measured distribution; `Overworld`, `TerrainShape`, the three decorators and `VillagePieces` deleted.

### Phase 5: the long tail and the authoring surface

The remaining block and item behavior families, the remaining goals and components, carvers, legacy structures, and the engine systems that have no data form in either edition: redstone, fluid flow, explosions, fire spread, light, the spawning algorithm and random ticking. The command tree from data, using `mojang-commands.json` for the Bedrock side. The mcfunction runtime and macro substitution, which is scheduled here rather than early because vanilla uses none of it and it buys zero parity, though it is what datapack authors expect.

Exit: the allow list contains only RNG-dependent rows and the open questions in section 13 that stayed open.

## 10. Migration and breaking changes

Every package is below 1.0.0, so by [the versioning policy](../versioning.md) each breaking change is a `minor` bump through the fixed group in `.changeset/config.json`.

- `Block`, `Item` and `Entity` stop being classes plugins subclass. `BlockManager.registerBlock(Block)` and `ItemManager.registerItem(Item)` go through a deprecation release as adapters, then disappear.
- `BlockIdsType`, `ItemIdsType` and every legacy numeric id go. Reading an old world still needs `legacy_block_ids.json` and `legacy_item_ids.json`, which the LevelDB provider owns.
- `World.getBlock` returns a block instance for every palette state instead of air for unregistered names.
- `instanceof Item` and `instanceof Mob` become type queries over families and tags.
- `BlockStateSchemas`, `BlockRuntimeIds`, `CreativeInventory` and `BlockEntityRegistry` lose their static caches.
- Recipe net ids are assigned from registry order, and `RecipeManager.registerRecipe` takes a recipe definition.
- The roughly 60 tests pinning vanilla numbers become data checks against the goldens.
- `config.yaml` gains the EULA acceptance setting and the pack stack settings; `world_behavior_packs.json` is honored, and a datapack directory is added beside it.

Storage does not break. The disk format stays Bedrock-shaped and existing worlds stay readable, which is the main practical benefit of keeping the internal model Bedrock-shaped.

## 11. Defects the research found in current code

Four agents read this repository while answering their own questions and found nine defects that are independent of this plan. They are listed here so they are not lost, and the ones that block plan work are called out. None is a consequence of the plan; all exist today.

Blocking datapack and command work ([commands-functions-and-datapack-execution.md](../research/commands-functions-and-datapack-execution.md) section 8):

1. `packages/brigadier/src/builder/ArgumentBuilder.ts:58` assigns an arrow function where `redirect(target, modifier)` expects a `RedirectModifier` object. It typechecks because `Function.prototype.apply` is structurally compatible, and at runtime the modifier receives `undefined`.
2. `CommandDispatcher.execute` is missing upstream's MC-256419 fix, so a fork matching zero sources throws "unknown command" instead of returning 0. `execute as @e[type=pig]` fails in a pigless world.
3. `CommandManager.getCommandsList()` drops nested literals and never follows redirects, so a Java-shaped command tree flattens wrongly. Vanilla Bedrock encodes subcommand keywords as one-value hard enums, so the tree is representable and the flattener is what discards it.
4. `CommandParameter.ts` has stale ids for protocol 2193: `Command = 87` is now `PoiTag`, `Message = 67` should likely be `MESSAGE_ROOT = 68`, and `CommandArguments.ts:370` advertises a command-valued argument as a float position.

Correctness and completeness in storage ([storage-and-chunk-translation.md](../research/storage-and-chunk-translation.md) sections 3 and 4):

5. `LevelDB.writeChunk` never persists entities. It writes `SubChunkPrefix`, `Data3D`, `Version`, `FinalizedState` and `BlockEntity`, and none of `digp`, `actorprefix` or 0x32.
6. `LevelDB.saveLevelData` has no caller, so `level.dat` keeps the spawn point it was created with.
7. Player data is stored as JSON under `worlds/<name>/playerdata/<xuid>.json` rather than in `player_server_*` LevelDB records.
8. `CHUNK_VERSION` is 41; Chunker and PocketMine both write 42 from 1.21.120. The block catalog declares 1.26.51 while the on-disk state `version` constant declares 1.21.40.1.
9. The `ChunkTag` enum in `LevelDBKeys.ts` reproduces a minecraft.wiki error against Mojang's published enum: it omits `GenerationSeed` (0x3c) and mislabels 0x3d, 0x3e and 0x3f.

Items 1 through 4 are prerequisites for phase 5 and are cheap now. Items 5 through 9 are worth fixing before phase 4 writes worlds the project intends to keep.

## 12. Decisions for the maintainer

The plan proceeds on these defaults unless told otherwise.

1. **Distribution.** Default: publish this project's code, the overlay pack, the mapping tables and the property tables; fetch and compose Mojang's content at first start behind an EULA setting. Both editions fall under the same EULA. Not legal advice; the texts are quoted in [bedrock-data-extraction.md](../research/bedrock-data-extraction.md) section 5.
2. **The attack cooldown.** Default: Bedrock's behavior, because the Bedrock client draws no cooldown meter and plays the strong-attack sound regardless, so Java's rule produces an unexplained game. This is the clearest instance of the 56 server-decided and broken rows.
3. **The spawning model.** Default: Bedrock's caps and rates, because Java's model is implementable and invisible but would break every farm a Bedrock player has built. Revisit per world as a setting rather than a global choice.
4. **Vendoring GeyserMC/mappings.** Default: vendor the generated table with the MIT notice retained, rather than depending on the repository at build time, so a build is reproducible when the upstream moves. MPL section 3.3 covers the combination.
5. **`mc-datapack-loader` and `vanilla-mcdoc`.** Default: depend on both (MIT) for the Java half of the pack loader and its validation, rather than writing a loader. Reconsider if their version gating lags Mojang.
6. **deepslate.** Default: dependency for density functions, noise, randoms and biome lookup, with the surface pass and carvers written here.
7. **Java version pinning.** Default: pin one Java version per release and treat a bump as a manifest edit plus a golden refresh. The churn is real: 12 pack format versions since 1.20.5, 13 directories renamed at once in 1.21, and 8 key renames in 26.3.
8. **Education Edition content.** Default: out of scope.
9. **Script API execution.** Default: out of scope. A third-party server cannot run `@minecraft/server`, only reimplement it.
10. **Capture transport.** Default: pin captures to BDS 1.26.51.1 and RakNet, with the understanding that Mojang is moving the default transport to NetherNet.

## 13. Risks and open questions

- **The entity and attribute seam.** 20 of Java's 40 attributes have no Bedrock identifier. The plan assumes they affect only server-side simulation. If any of them turns out to drive something the client draws, the affected behavior becomes an allow-list row. This is the plan's largest unverified assumption and the parity suite checks it first.
- **Two release trains.** The project now pins a Java version and a Bedrock version and owns a mapping between them. Both move. The mitigation is that the mapping is generated rather than hand-written, which is exactly what Chunker's 11000 hand-written lines show the alternative costs.
- **The brain mobs.** 20 mobs have no data expression in either format and need code written against Java's memory, sensor and activity model, which is 8905 lines in Mojang's implementation.
- **Nobody has done this.** No project loads both formats into one runtime. The two halves have working precedents separately and Pumpkin runs Java datapacks while serving Bedrock clients, but the combination is new and the plan should expect to discover its own problems.
- **Undocumented Bedrock internals.** The block properties NBT has fields three independent implementations admit they do not understand. Bedrock's main game loop order is undocumented. `randomTickSpeed` is "relative" with no published mapping. Each is an allow-list entry until measured.
- **Performance.** Hook dispatch per block event, Molang per feature placement, and now mapping at the chunk boundary at about 95 microseconds per column. Load-time flattening into typed arrays and compiled closures is the mitigation, and converting `BlockStorage.blocks` to a `Uint16Array` is worth doing regardless for the fourfold memory saving.
- **Claims in the research that stayed unverified.** The 65536 defaults for Java's two command limits could not be confirmed from Mojang. 26.3's brigadier argument-type wire ids are not public. Mojang's own two documents disagree on the block-breaking option name and default. The `/reload` scope was read from the jar's code rather than tested. Each is listed in its note's open questions.

## 14. First slices

Each is a reviewable change with its own tests and Changeset.

1. Add the source manifest and fetch for the BDS zip, bedrock-samples, the Java server jar and GeyserMC/mappings. Add `pack-hashes.json`.
2. Add the Java property and attribute dumper to the capture job and land the goldens: per-state block properties for 1286 blocks, and 2619 attribute values over 93 entity types.
3. Create `@jsprismarine/mapping` from the pinned GeyserMC join, with Chunker's five property tests and the reviewed loss allow list.
4. Read the per-state property table into `@jsprismarine/bedrock-data` and route `BlockRules`, `BlockShapes`, `Explosion` and the break-time formula through it.
5. Create `@jsprismarine/packs` with the Bedrock stack loader, lenient JSON, `format_version` dispatch and schema validation.
6. Add the Java half of the pack loader over `mc-datapack-loader` with `vanilla-mcdoc` validation, loading the vanilla datapack with a report of unmapped identifiers.
7. Create `@jsprismarine/molang` with the parser, evaluator and the 21 vanilla queries, tested against the 82 vanilla expressions.
8. Land `packages/parity/` with the registry comparisons, the mapping rows and the dashboard.
9. Fix the four Brigadier and command packet defects in section 11.

Slices 1 through 8 are independent of each other except that 3 depends on 1, 4 depends on 2, and 6 depends on 5. Slice 9 is independent of all of them.
