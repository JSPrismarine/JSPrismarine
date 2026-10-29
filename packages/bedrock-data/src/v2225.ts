/**
 * What a Bedrock Dedicated Server 1.26.60.6 sends a joining client, for a session speaking
 * protocol 2225.
 *
 * The package's unversioned exports are protocol 2193, which `sources.json` names as the
 * default. This module is the same data captured from the next version, published beside it
 * rather than in place of it: a session picks the tables for the protocol it negotiated, and
 * nothing that already imports the unversioned names changes.
 *
 * Of the three, only the item table differs from 2193. The block definitions and the biome
 * definitions came back byte-identical, which is a measured fact about 1.26.60 rather than a
 * fallback - these are read from the 1.26.60 capture, not aliased to the 2193 export.
 *
 * `jigsaw_structure_data` is absent: the capture reproduces a different template-pool order
 * run to run, so there is no 1.26.60 golden to publish. A 2225 session sends the 2193 rules,
 * which carry the same pools.
 */
import biome_definitions_network_data from './generated/v2225/biome_definitions_network.json';
import item_table_data from './generated/v2225/item_table.json';
import block_definitions_data from './jsp/v2225/block_definitions.json';

import type { BlockDefinitionEntry, ItemTypeEntry } from './index';

/**
 * Every item a 1.26.60 client can be told about, and the number it travels as.
 *
 * Against 2193 this adds four names - `minecraft:disc_press`, `minecraft:frostbite_spawn_egg`,
 * `minecraft:ice_crystal` and `minecraft:icicle` - removes none, and **moves 82 runtime ids**.
 * The registry is server-authoritative, so a 2225 client adopts whatever numbering it is sent
 * and a 2193 table does not break a join; what it does is leave a 1.26.60 session unable to
 * name four items that version has, and disagree with every other 1.26.60 server about where
 * 82 of them sit.
 *
 * Captured with `packages/client/tools/capture-server-data.mjs` against the pinned 1.26.60.6
 * server, joined with that version's CloudburstMC dump for the `Item Version` column by
 * `utils/build.js`, the same way the 2193 table is built.
 */
export const item_table: Record<string, ItemTypeEntry> = item_table_data;

/**
 * The data driven vanilla blocks at 2225, and the definitions a client needs to draw them.
 *
 * Byte-identical to 2193's: 1.26.60 added no data driven block and changed no definition.
 */
export const block_definitions: readonly BlockDefinitionEntry[] = block_definitions_data.blocks.map((block) => ({
    name: block.name,
    definition: Buffer.from(block.definition, 'base64')
}));

/**
 * The vanilla biome definitions at 2225, as `BiomeDefinitionListPacket` carries them.
 *
 * Byte-identical to 2193's; no biome type appears in the 2193-to-2225 structural delta.
 */
export const biome_definitions_network: Buffer = Buffer.from(biome_definitions_network_data.data, 'base64');
