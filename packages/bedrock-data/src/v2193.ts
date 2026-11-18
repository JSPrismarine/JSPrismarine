/**
 * What a Bedrock Dedicated Server 1.26.51.1 sends a joining client, for a session speaking
 * protocol 2193.
 *
 * The unversioned exports carry the version `sources.json` names as the default, which is the
 * newest release. This module keeps the 2193 capture published beside it, so a client of the
 * previous release is sent the numbering and the lists its own version knows.
 */
import biome_definitions_network_data from './generated/v2193/biome_definitions_network.json';
import entity_identifiers_data from './generated/v2193/entity_identifiers.json';
import item_table_data from './generated/v2193/item_table.json';
import jigsaw_structure_data_data from './generated/v2193/jigsaw_structure_data.json';
import block_definitions_data from './jsp/v2193/block_definitions.json';

import type { BlockDefinitionEntry, ItemTypeEntry } from './index';

/**
 * Every item a 1.26.51 client can be told about, and the number it travels as.
 *
 * The registry is server-authoritative, so a 2193 client adopts whatever numbering it is sent.
 * Sending it this table rather than a newer one keeps every number where vanilla 1.26.51 puts it
 * and names no item the client does not have.
 */
export const item_table: Record<string, ItemTypeEntry> = item_table_data;

/** The data driven vanilla blocks at 2193, and the definitions a client needs to draw them. */
export const block_definitions: readonly BlockDefinitionEntry[] = block_definitions_data.blocks.map((block) => ({
    name: block.name,
    definition: Buffer.from(block.definition, 'base64')
}));

/** The vanilla biome definitions at 2193, as `BiomeDefinitionListPacket` carries them. */
export const biome_definitions_network: Buffer = Buffer.from(biome_definitions_network_data.data, 'base64');

/**
 * Every actor type a 1.26.51 client may be asked to render, as `AvailableActorIdentifiersPacket`
 * carries it: one network NBT compound holding an `idlist`, replayed verbatim.
 */
export const entity_identifiers: Buffer = Buffer.from(entity_identifiers_data.data, 'base64');

/**
 * The jigsaw structure rules at 2193, as `JigsawStructureDataPacket` carries them. A client at
 * protocol 2193 refuses to join a server that has not sent this before `StartGamePacket`.
 */
export const jigsaw_structure_data: Buffer = Buffer.from(jigsaw_structure_data_data.data, 'base64');
