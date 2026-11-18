# Cross-version Bedrock data

Research note, 2026-11-18. Question: how does this server serve a client whose protocol is older
than the release it targets, and how should it? The trigger is the move of the default Bedrock
data from protocol 2193 (Minecraft 1.26.51, BDS 1.26.51.1) to protocol 2225 (1.26.60, BDS
1.26.60.6). The code was read at `64fe0a33f17` and in the change that makes the move; the values
below are as they were on this date.

## Summary

Today a session's codec picks the data that is a numbering or a list the client is sent: the item
table, the actor list, block definitions, biome definitions and jigsaw data. Everything the world
holds is unversioned. The world stores one set of block states and writes their hashes straight
into chunk palettes, items carry one name, and the creative menu, item components and enums are
single copies. That worked while the world's data was the oldest supported version's. With 2225 as
the default it stops working for 2193 clients in three places, and a fourth was fixed with the
move:

1. Every fire, redstone wire and chorus plant state hashes to a runtime id a 1.26.51 client does
   not know, because 1.26.60 added connection states to all three blocks.
2. Three new blocks, four new items and one new actor have no counterpart on a 2193 client.
3. `Item.wireId` falls back to a number from another version's table. A frostbite spawn egg a
   2225 client hands in is written to a 2193 viewer as runtime id 791, which is wool in the 2193
   table.
4. Codec 2193 and the "canonical" item data read the unversioned exports, which became 2225's. The
   move pointed `Codec2193` and `itemData2193` at `@jsprismarine/bedrock-data/v2193` and made the
   canonical table the newest release's by name.

Items 1 to 3 are tracked as [#3255](https://github.com/JSPrismarine/JSPrismarine/issues/3255) and
[#3256](https://github.com/JSPrismarine/JSPrismarine/issues/3256).

[ADR 0025](../adr/0025-older-protocols-are-a-window-relative-to-the-newest-release.md) later
decided against translating every difference for every server. A server accepts a window of
releases counted back from the newest, and the setting `protocol-content` decides whether content
an older release lacks is left out of the world or sent to its players as a placeholder.

Recommendation: keep the world on the target release and add a per-protocol downgrade, owned by
the server's codec configuration and handed to serializers through `ProtocolContext`. Derive the
block downgrade mechanically from the two captured palettes. Keep a short, hand-written
substitution list for blocks, items and actors the older version lacks, with a test that fails
when a new release adds one without an entry. Support the target release and the one before it,
and refuse anything older. Geyser handles the same 1.26.50/1.26.60 split this way, and PocketMine
and the NetherGames fork translate block palettes the same way at chunk serialization time.

## What is per version today

| Data | Where it lives | Per protocol? | Read through |
| --- | --- | --- | --- |
| Packet ids and layouts | [`packages/protocol`](../../packages/protocol/src/ProtocolCodec.ts), `SINCE_`/`UNTIL_` gates, `layoutAt(…, codecProtocol)` | Yes, 2193 base plus deltas | The session's `ProtocolCodec` |
| Item table (names, runtime ids) | [`generated/v<n>/item_table.json`](../../packages/bedrock-data/src/generated/v2225/item_table.json) | Yes | [`itemData.ts`](../../packages/prismarine/src/network/codec/itemData.ts), `codec.itemData`, `Item.wireId` |
| Item components | `generated/item_components.json` | No, one capture | `ProtocolItemData.components` |
| Creative menu | [`generated/creativeitems.ts`](../../packages/bedrock-data/src/generated/creativeitems.ts) | No, one capture | [`CreativeInventory`](../../packages/prismarine/src/inventory/CreativeInventory.ts), one menu per server |
| Actor list | `generated/v<n>/entity_identifiers.json` | Yes, since #3107 for 2225 and since the move for 2193 | `ProtocolContext.entityIdentifiers` |
| Block definitions (98 data-driven blocks) | `jsp/v<n>/block_definitions.json` | Yes | `ProtocolContext.blockDefinitions` |
| Biome definitions | `generated/v<n>/biome_definitions_network.json` | Yes | `ProtocolContext.biomeDefinitions` |
| Jigsaw structure data | `generated/v<n>/jigsaw_structure_data.json` | Yes for 2193 and 2225; the 2259 preview sends the default's | `ProtocolContext.jigsawStructureData` |
| Block palette and state catalog | [`datagen/snapshot/v<n>/block-palette.json`](../../packages/minecraft/datagen/snapshot/v2225/block-palette.json), `generated/v<n>/block-schemas.ts` | Snapshots per version; the server loads only the unversioned `block-schemas`, which follows the default BDS | [`BlockRuntimeIds`](../../packages/prismarine/src/block/state/BlockRuntimeIds.ts), [`state.ts`](../../packages/blocks/src/state.ts) |
| Block runtime ids in chunks | Hashes held in `BlockStorage` palettes | No | [`BlockStorage.networkSerialize`](../../packages/prismarine/src/world/chunk/BlockStorage.ts), cached once per storage |
| Enums | `packages/minecraft/src/generated/v<n>/` | Generated per version; code imports the unversioned (2193) copy | Wire-number differences mapped inside the protocol package |
| Command answers | `jsp/v<n>/command_answers.json` | Captured per version | Parity tests; server behavior, not wire data |

Measured differences between the 2193 and 2225 captures:

- Block definitions: the 98 entries are identical; only the `minecraftVersion` and `server`
  header lines differ. Biome definitions are byte-identical. Jigsaw data differs: 209307 bytes
  against 209535.
- Items: 2076 names against 2080. 2225 adds `minecraft:disc_press`,
  `minecraft:frostbite_spawn_egg`, `minecraft:ice_crystal` and `minecraft:icicle`, and moves 82
  runtime ids. Component data for shared names is identical. The creative menu has the same 1980
  entries; none of the new items is in it, and only `chorus_plant`'s block-state hash differs.
- Blocks: 1477 against 1480 types, 22079 against 23948 states. The 1869 extra states break down
  as follows.

| Block | 2193 states | 2225 states | Change |
| --- | --- | --- | --- |
| `minecraft:fire` | 16 | 512 | Adds `minecraft:connection_{east,north,south,up,west}` |
| `minecraft:redstone_wire` | 16 | 1296 | Adds `redstone_{east,north,south,west}` (`none`, `side`, `up`) |
| `minecraft:chorus_plant` | 1 | 64 | Adds `minecraft:connection_{down,east,north,south,up,west}` |
| `minecraft:disc_press` | none | 4 | New block |
| `minecraft:ice_crystal` | none | 6 | New block |
| `minecraft:icicle` | none | 20 | New block |

- Actors: 2225 adds `minecraft:ice_ball` ([#3107](https://github.com/JSPrismarine/JSPrismarine/issues/3107)).
- Enums: `LevelSoundEvent` gains `ICE_BALL_BREAK = 614` and moves `UNDEFINED` to 615.
  `ContainerUiId`, `WindowTypes` and `DisconnectReason` gain members. `ItemStackRequestActionType`
  inserts `CRAFT_RESERVED_ACTION` at 18 and shifts two deprecated members.
- BDS's console `/time` answers changed: per-dimension time markers, and a negative time is
  refused.

## How a session picks its tables

The client's first packet, `RequestNetworkSettings`, names its protocol.
[`RequestNetworkSettingsHandler`](../../packages/prismarine/src/network/handler/RequestNetworkSettingsHandler.ts)
looks it up with `codecForProtocol` in [`CodecRegistry.ts`](../../packages/prismarine/src/network/codec/CodecRegistry.ts),
stores the codec on the connection, and refuses any protocol it has no codec for. From then on:

- Inbound packets decode with `connection.codec.context`
  ([`NetworkDispatcher.ts`](../../packages/prismarine/src/network/NetworkDispatcher.ts)).
- Outbound packets encode once per codec. [`NetworkWorldReplicator`](../../packages/prismarine/src/network/NetworkWorldReplicator.ts)
  groups viewers by codec and builds each packet once per group, and
  [`joinPacketCache.ts`](../../packages/prismarine/src/network/joinPacketCache.ts) keys cached
  join batches by codec.
- A codec is `createProtocolCodec({ definition, context })`. [`Codec2193.ts`](../../packages/prismarine/src/network/codec/Codec2193.ts)
  and [`Codec2225.ts`](../../packages/prismarine/src/network/codec/Codec2225.ts) fill the
  [`ProtocolContext`](../../packages/protocol/src/ProtocolContext.ts) with item data, block
  definitions, the actor list, biome definitions and jigsaw data. The protocol package never
  imports `bedrock-data`; the server supplies the tables.
- Items resolve their wire id per packet: `wireItemData` in [`Item.ts`](../../packages/prismarine/src/item/Item.ts)
  reads `itemDataForProtocol(packet.codecProtocol)`. A bare `BinaryStream`, such as a stack
  written to disk, gets `canonicalItemData`, the newest release's table, which `getRuntimeId()`
  reads too.
- Enum renumbering is absorbed in the protocol package. `actionTypeOf` in
  [`ItemStackRequest.ts`](../../packages/protocol/src/wire/structures/ItemStackRequest.ts) maps a
  2225 wire value back onto the 2193 enum, and `LevelSoundEventPacket` writes the sound's name,
  so the `LevelSoundEvent` shift never reaches the wire.

Issue #3107 shows the pattern. `Codec2225` sent the unversioned actor list, which was 2193's
capture, so a 1.26.60 client could not be told about `ice_ball`. The fix published
`entity_identifiers` from `@jsprismarine/bedrock-data/v2225` and pointed the codec at it.

Two things would have moved under this pattern when the default became 2225, because the
unversioned exports changed meaning. The move fixed both:

- `Codec2193` imported `block_definitions`, `entity_identifiers`, `biome_definitions_network` and
  `jigsaw_structure_data` from the unversioned entry point, so it would have sent 2225's actor list
  and jigsaw data to a 1.26.51 client. It now imports from `@jsprismarine/bedrock-data/v2193`.
- `itemData2193` was built from the unversioned `item_table`, which would have paired protocol
  2193 with 2225's numbering and put 82 items under the wrong id. It now reads the v2193 export,
  and `canonicalItemData` names the newest release through the protocol package's `newestRelease`.
  A test holds it equal to the unversioned export.

## The content gap

Wire data is per codec. World state is not, so each piece of content the target release has and
an older client lacks ends up as follows.

**Block states.** `BlockRuntimeIds` hashes the server's own `{name, states}` compound with
FNV-1a, and `BlockStorage` writes those hashes into the chunk palette for every session alike.
Its packed network bytes are cached once per storage. Once the catalog is 2225's, a fire block
carries five connection states, and its hash matches no 1.26.51 state. The same holds for
`UpdateBlockPacket`, the block runtime id inside an item stack descriptor, the creative menu's
`chorus_plant` record, and any sound or level event that carries a block id. The client draws
whatever it draws for an unknown id. This note did not test what that is. Inbound, a 2193 client
sends 2193 hashes, for example in `InventoryTransaction`. `BlockRuntimeIds.getState` cannot
reverse those for the three changed blocks.

**New blocks.** `disc_press`, `ice_crystal` and `icicle` have no 1.26.51 state at all. World
generation or a 2225 player can put them in a chunk a 2193 player loads.

**Items.** `runtimeIdIn(itemData)` returns `table[name]?.runtime_id ?? this.runtimeId`. The
fallback exists so a custom item keeps the number the client was given. For a vanilla item absent
from the session's table it leaks another version's numbering:

- A stack built by name (loot, `/give`, a creative pick) has `runtimeId` 0, so a 2193 client sees
  an empty slot while the server holds an icicle.
- A stack decoded from a 2225 client keeps the 2225 id (`fromStackDescriptor`). Of the four new
  items, `frostbite_spawn_egg` has 2225 id 791, which is `minecraft:wool` in 2193's table. The other
  three use negative ids, -1251, -1248 and -1247, that are free in 2193. A 2193 player watching a
  2225 player hold the egg (`armorPackets` and `MobEquipment` encode per viewer) sees wool.

**Creative menu.** There is one menu per server, because a creative pick names an entry by
position. The name filter reads the unversioned item table, so it filters for the default
version only. At 2193 against 2225 the entries match, so positions agree. Only the `chorus_plant`
block hash is wrong for 2193.

**Actors.** No code checks a spawn against the session's actor list. A 2193 viewer would receive
`AddActorPacket` for `minecraft:ice_ball`. The client's response to an identifier missing from its
actor list was not tested.

**Enums.** These are safe where the protocol package maps or names them. A new member sent to an
older client, such as a `WindowTypes` or `DisconnectReason` value 2193 lacks, is not mapped
anywhere. Today nothing sends one.

**Behavior.** Command answers, world generation and game rules follow the server's target
release, whatever the client's protocol. A 1.26.51 client on a 1.26.60 server gets 1.26.60
`/time` behavior. That is correct and needs no translation.

## Prior art

- **Geyser** (Java server to Bedrock clients) keeps one Bedrock palette file per supported version
  and passes each through a per-version `BlockRemapper` before looking it up
  ([`BlockRegistryPopulator`](https://github.com/GeyserMC/Geyser/blob/668658bb5d6d1747931a3d74c40bcb8ac210127a/core/src/main/java/org/geysermc/geyser/registry/populator/BlockRegistryPopulator.java)).
  For 1.26.50 (protocol 2193) the remapper is
  [`ICanHasMoreStates`](https://github.com/GeyserMC/Geyser/blob/668658bb5d6d1747931a3d74c40bcb8ac210127a/core/src/main/java/org/geysermc/geyser/registry/populator/conversion/ICanHasMoreStates.java).
  It removes the connection states from fire, chorus plant and redstone wire, the same three
  blocks measured above. For older versions,
  [`WildernessBoundConverter`](https://github.com/GeyserMC/Geyser/blob/668658bb5d6d1747931a3d74c40bcb8ac210127a/core/src/main/java/org/geysermc/geyser/registry/populator/conversion/WildernessBoundConverter.java)
  maps new blocks and items to visually close existing ones, such as concrete stairs to existing
  stairs. Items get the same per-version treatment through `PaletteVersion` and `ItemRemapper` in
  [`ItemRegistryPopulator`](https://github.com/GeyserMC/Geyser/blob/668658bb5d6d1747931a3d74c40bcb8ac210127a/core/src/main/java/org/geysermc/geyser/registry/populator/ItemRegistryPopulator.java).
  Startup fails when a mapped item has no definition in a version.
- **PocketMine-MP** speaks one protocol, but already translates at the chunk boundary.
  [`ChunkSerializer::serializeSubChunk`](https://github.com/pmmp/PocketMine-MP/blob/6a7cc02e9dff59b69241aa0bcffdb9903ce86beb/src/network/mcpe/serializer/ChunkSerializer.php)
  rewrites only palette entries through `BlockTranslator::internalIdToNetworkId` and leaves the
  packed words alone. An unmappable state becomes `minecraft:info_update`
  ([`BlockTranslator`](https://github.com/pmmp/PocketMine-MP/blob/6a7cc02e9dff59b69241aa0bcffdb9903ce86beb/src/network/mcpe/convert/BlockTranslator.php)).
  Two internal states can therefore share a network id in one palette. An unmappable item is
  shown as `info_update` with the real state id in its NBT, so it does not stack with other
  unmapped items
  ([`TypeConverter::coreItemStackToNet`](https://github.com/pmmp/PocketMine-MP/blob/6a7cc02e9dff59b69241aa0bcffdb9903ce86beb/src/network/mcpe/convert/TypeConverter.php)).
- **NetherGames' PocketMine fork** serves nine protocols. It builds one `TypeConverter` per
  protocol and loads a canonical block state file and item dictionary per protocol. Versions that
  share data files share one translator
  ([`BlockTranslator::loadFromProtocolId`](https://github.com/NetherGamesMC/PocketMine-MP/blob/eaa2e58156e71e7a10093cffc98b02e1023f05ee/src/network/mcpe/convert/BlockTranslator.php),
  [`TypeConverter`](https://github.com/NetherGamesMC/PocketMine-MP/blob/eaa2e58156e71e7a10093cffc98b02e1023f05ee/src/network/mcpe/convert/TypeConverter.php)).
- [packet-versioning-architectures.md](packet-versioning-architectures.md) covers the wire-layout
  half and recommends a written support window with pruning. This note covers the data half.

## Options considered

1. **Leave it as is.** Per-codec tables, one world palette. With 2225 as the default this breaks
   fire, redstone and chorus plants for every 2193 client and leaks wrong item ids, so it is not
   viable.
2. **Support only the target release and the preview.** Drop `Codec2193` when the default moves.
   This needs no translation, and BDS does the same, since one build speaks one protocol. It costs
   every 1.26.51 player until they update, and the same question returns at each release.
3. **Keep the world on the oldest supported version.** Keep 2193 as the default and upgrade for
   newer clients. Newer clients would lose new content, and the server would never be on the
   target release, which contradicts [ADR 0019](../adr/0019-bedrock-data-comes-from-bds.md)'s
   pinned default.
4. **World on the target release, per-protocol downgrade at the session edge.** The model Geyser
   and NetherGames use. The world and gameplay stay on one version, and each older codec carries
   translation tables for what it lacks.
5. **Gate new content out of the world while an older version is supported.** For example, never
   generate icicles. This avoids substitutes, but it ties gameplay to the oldest client and still
   leaves the three changed blocks to downgrade.

## Recommendation

Take option 4, bounded by a support window of the target release and the release before it,
with previews negotiated as today. Concretely:

1. **Version-explicit data.** Each codec reads `@jsprismarine/bedrock-data/v<n>` and
   `@jsprismarine/minecraft/generated/v<n>/`, never the unversioned exports. The move did this for
   the bedrock-data tables. Code that asks what Bedrock has, rather than what to write, reads the
   target release. Keep generating `block-schemas.ts` for every supported version, not only the
   default.
2. **A block downgrade derived from the palettes.** For each supported older version, walk the
   target release's state catalog. Project each state onto the older block: drop states the older
   block lacks, and use the older default for a value outside its domain. Hash the result with the
   protocol package's `fnv1a32` and `writeBlockStateNbt`, and record `targetHash → olderHash` where
   they differ. At 2225 against 2193 that covers 1872 changed states plus the 30 states of the
   three new blocks. Build the reverse map, `olderHash → targetHash` with every added state at its
   default, for inbound ids. Derive both at startup or generate them. Either way, a test asserts
   that every target state maps to a state in the older palette.
3. **A short substitution list for missing content.** One reviewed map per older version, in code
   beside the codec, for blocks (`icicle`, `ice_crystal`, `disc_press`), items (the four new names)
   and actors (`ice_ball`). An unlisted block falls back to `minecraft:info_update` and an unlisted
   item to an `info_update` stack. An unlisted actor is not spawned for that viewer. A test diffs
   the two versions' item tables, palettes and actor lists and fails when a name has neither an
   entry nor an explicit "fallback is fine" mark. Each new release then has to decide.
4. **Carry it in `ProtocolContext`.** Add an optional `blocks` translation (`toClient(id)` and
   `fromClient(id)`, identity when absent) and an item and actor substitution beside `itemData`.
   The protocol package applies them where it writes or reads a block runtime id, an item id or an
   actor identifier. The server package builds the tables in `network/codec/` beside
   `itemData.ts`, the way it builds `itemData2193` today. `@jsprismarine/protocol` still imports
   no data package. Gameplay code never sees a version.
5. **Translate the palette, not the blocks.** Give `BlockStorage.networkSerialize` the session's
   translation and rewrite only the palette, as PocketMine does. Cache the identity bytes as now.
   For an older codec, reuse them whenever the palette contains no id in the downgrade map, and
   cache a translated copy otherwise. Most sub chunks contain no fire, redstone wire, chorus plant
   or new block, so a test can assert, by count, that an older viewer costs no extra encodes for
   them.
6. **Fix the item fallback.** Fall back to `this.runtimeId` only for a name that no supported
   vanilla table knows, meaning a custom item. A vanilla name missing from the session's table goes
   through the substitution in step 3. That also closes the frostbite-egg-as-wool leak.
7. **One creative menu per codec.** Picks are positional, so build the menu per codec from that
   codec's table and block translation, and resolve a pick against the same list.

Server behavior stays on the target release. Only the bytes change at the session edge.

## Open questions

- What does a 1.26.51 client draw for a block runtime id it does not know? What does it do with
  `AddActorPacket` for an identifier missing from its actor list: ignore it, draw a placeholder,
  or disconnect? A client-e2e scenario on a 2193 client would answer both. It decides whether
  `info_update` and "do not spawn" are needed or only nicer.
- Does a 1.26.60 client draw fire, redstone wire and chorus plant connections from the states the
  server sends, or compute them itself? If from the states, the server has to compute the
  connections the way Java does, which is a separate parity gap from this note's downgrade.
- Inbound items: when a 2193 client acts on a slot holding a substituted item, does
  server-authoritative inventory (`stackNetId`) avoid every place that compares item ids? Or does
  some handler need the substitution reversed?
- Hidden actors: when an actor is not spawned for one viewer, the replicator must also drop its
  later move, metadata, link and event packets for that viewer. Is `session.tracks` the right
  filter?
- Should the downgrade tables be generated files under `packages/minecraft`, checked in and
  diffable, or derived at startup? The palettes are about 24 thousand states each, so either works.
- Which enum members added at 2225 can the server send, and should the protocol package map
  each to a 2193 fallback or refuse to encode the packet?
- Support window: is "target release plus the previous one" the policy, and where is it written
  down, beside the pruning policy from packet-versioning-architectures.md?

## Sources

Repository, as read on 2026-11-18:

- [`packages/prismarine/src/network/codec/`](../../packages/prismarine/src/network/codec/):
  `Codec2193.ts`, `Codec2225.ts`, `CodecRegistry.ts`, `itemData.ts`.
- [`packages/protocol/src/ProtocolContext.ts`](../../packages/protocol/src/ProtocolContext.ts),
  [`ProtocolCodec.ts`](../../packages/protocol/src/ProtocolCodec.ts),
  [`wire/structures/ItemStackRequest.ts`](../../packages/protocol/src/wire/structures/ItemStackRequest.ts).
- [`packages/prismarine/src/item/Item.ts`](../../packages/prismarine/src/item/Item.ts):
  `wireItemData`, `runtimeIdIn`, `wireId`, `fromStackDescriptor`.
- [`packages/prismarine/src/inventory/CreativeInventory.ts`](../../packages/prismarine/src/inventory/CreativeInventory.ts),
  [`block/state/BlockRuntimeIds.ts`](../../packages/prismarine/src/block/state/BlockRuntimeIds.ts),
  [`world/chunk/BlockStorage.ts`](../../packages/prismarine/src/world/chunk/BlockStorage.ts),
  [`network/NetworkWorldReplicator.ts`](../../packages/prismarine/src/network/NetworkWorldReplicator.ts),
  [`network/handler/RequestNetworkSettingsHandler.ts`](../../packages/prismarine/src/network/handler/RequestNetworkSettingsHandler.ts).
- [`packages/bedrock-data/src/v2193.ts`](../../packages/bedrock-data/src/v2193.ts),
  [`v2225.ts`](../../packages/bedrock-data/src/v2225.ts), and the captures under
  `packages/bedrock-data/src/jsp/v2193/` and `v2225/`.
- [`packages/minecraft/datagen/snapshot/v2193/block-palette.json`](../../packages/minecraft/datagen/snapshot/v2193/block-palette.json)
  and [`v2225/block-palette.json`](../../packages/minecraft/datagen/snapshot/v2225/block-palette.json),
  [`generate-blocks.js`](../../packages/minecraft/datagen/generate-blocks.js).
- [Issue #3107](https://github.com/JSPrismarine/JSPrismarine/issues/3107): 2225 sessions got the
  2193 actor list.

External, at the commits linked above:

- GeyserMC/Geyser `668658bb5d6d`: `BlockRegistryPopulator`, `ICanHasMoreStates`,
  `WildernessBoundConverter`, `ItemRegistryPopulator`.
- pmmp/PocketMine-MP `6a7cc02e9dff`: `ChunkSerializer`, `BlockTranslator`, `TypeConverter`.
- NetherGamesMC/PocketMine-MP `eaa2e58156e7`: `BlockTranslator`, `TypeConverter`.

Commands that reproduce the measurements, from the repository root:

```sh
# Item names added and the 2193 item each new runtime id lands on
node -e "const a=require('./packages/bedrock-data/src/generated/v2193/item_table.json'),b=require('./packages/bedrock-data/src/generated/v2225/item_table.json');const r=new Map(Object.entries(a).map(([n,e])=>[e.runtime_id,n]));for(const n in b)if(!(n in a))console.log(n,b[n].runtime_id,r.get(b[n].runtime_id))"

# Block types whose state names changed, and state counts per version
node -e "const d='./packages/minecraft/datagen/snapshot/',a=require(d+'v2193/block-palette.json'),b=require(d+'v2225/block-palette.json');const n=(p,k)=>Object.keys(p.states[k]).reduce((x,s)=>x*(p.domains[k]?.[s]?.values.length??1),1);for(const k in b.states)if(!(k in a.states)||Object.keys(a.states[k]).sort()+''!==Object.keys(b.states[k]).sort()+'')console.log(k,k in a.states?n(a,k):0,n(b,k))"

# Jigsaw sizes and block definition equality
ls -l packages/bedrock-data/src/jsp/v2193/jigsaw_structure_data.nbt packages/bedrock-data/src/jsp/v2225/jigsaw_structure_data.nbt
cmp packages/bedrock-data/src/jsp/v2193/biome_definitions_network.nbt packages/bedrock-data/src/jsp/v2225/biome_definitions_network.nbt
```
