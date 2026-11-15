/**
 * What a Bedrock Dedicated Server 1.26.70.24 sends a joining client, for a session speaking the
 * Minecraft Preview protocol 2259.
 *
 * Published beside the unversioned exports, as `v2225` is. A preview is replaced, not kept, when
 * the next preview or its release lands, so this module goes with it.
 *
 * `jigsaw_structure_data` is absent for the reason `v2225` gives: the capture does not reproduce
 * its template-pool order, so a 2259 session sends the default version's rules.
 */
import biome_definitions_network_data from './generated/v2259/biome_definitions_network.json';
import item_table_data from './generated/v2259/item_table.json';
import block_definitions_data from './jsp/v2259/block_definitions.json';

import type { BlockDefinitionEntry, ItemTypeEntry } from './index';

/**
 * Every item a 1.26.70.24 client can be told about, and the number it travels as, from the
 * capture's `ItemRegistryPacket` joined by `utils/build.js` the same way the other tables are.
 */
export const item_table: Record<string, ItemTypeEntry> = item_table_data;

/** The data driven vanilla blocks at 2259, and the definitions a client needs to draw them. */
export const block_definitions: readonly BlockDefinitionEntry[] = block_definitions_data.blocks.map((block) => ({
    name: block.name,
    definition: Buffer.from(block.definition, 'base64')
}));

/** The vanilla biome definitions at 2259, as `BiomeDefinitionListPacket` carries them. */
export const biome_definitions_network: Buffer = Buffer.from(biome_definitions_network_data.data, 'base64');
