/**
 * What a Bedrock Dedicated Server 1.26.60.6 sends a joining client, for a session speaking
 * protocol 2225.
 *
 * Protocol 2225 is the version `sources.json` names as the default, so the unversioned exports
 * carry the same data. This module names the version outright, the way `v2193` does, for a
 * session that picks its tables by the protocol it negotiated.
 */
import biome_definitions_network_data from './generated/v2225/biome_definitions_network.json';
import entity_identifiers_data from './generated/v2225/entity_identifiers.json';
import item_table_data from './generated/v2225/item_table.json';
import jigsaw_structure_data_data from './generated/v2225/jigsaw_structure_data.json';
import block_definitions_data from './jsp/v2225/block_definitions.json';

import type { BlockDefinitionEntry, ItemTypeEntry } from './index';

/**
 * Every item a 1.26.60 client can be told about, and the number it travels as.
 *
 * Against 2193 this adds four names - `minecraft:disc_press`, `minecraft:frostbite_spawn_egg`,
 * `minecraft:ice_crystal` and `minecraft:icicle` - removes none, and **moves 82 runtime ids**.
 * The registry is server-authoritative, so each client adopts whatever numbering it is sent; a
 * session given another version's table cannot name the items that table lacks, and disagrees
 * with vanilla about where the moved ones sit.
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

/**
 * Every actor type a 1.26.60.6 client may be asked to render, as `AvailableActorIdentifiersPacket`
 * carries it: one network NBT compound holding an `idlist`, replayed verbatim.
 *
 * Against 2193 this adds `minecraft:ice_ball`.
 */
export const entity_identifiers: Buffer = Buffer.from(entity_identifiers_data.data, 'base64');

/**
 * The jigsaw structure rules at 2225, as `JigsawStructureDataPacket` carries them, with each of
 * the four registries in identifier order.
 */
export const jigsaw_structure_data: Buffer = Buffer.from(jigsaw_structure_data_data.data, 'base64');
