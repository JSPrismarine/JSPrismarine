/**
 * What protocol 2259's pinned Bedrock Dedicated Server sends a joining client, for a session speaking the
 * Minecraft Preview protocol 2259.
 *
 * Published beside the unversioned exports, as `v2193` is. A preview is replaced, not kept, when
 * the next preview or its release lands, so this module goes with it.
 *
 * `jigsaw_structure_data` is absent: no 2259 capture of it is committed, so a 2259 session sends
 * the default version's rules.
 */
import biome_definitions_network_data from './generated/v2259/biome_definitions_network.json';
import aim_assist_presets_data from './generated/v2259/aim_assist_presets.json';
import camera_presets_data from './generated/v2259/camera_presets.json';
import entity_identifiers_data from './generated/v2259/entity_identifiers.json';
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

/**
 * Every actor type a 1.26.70.24 client may be asked to render, as `AvailableActorIdentifiersPacket`
 * carries it: one network NBT compound holding an `idlist`, replayed verbatim.
 */
export const entity_identifiers: Buffer = Buffer.from(entity_identifiers_data.data, 'base64');

/**
 * The camera presets protocol 2225's pinned Bedrock Dedicated Server sends a joining client, as the payload
 * of `CameraPresetsPacket`, replayed verbatim. A camera instruction names a preset by its place
 * in this list.
 */
export const camera_presets: Buffer = Buffer.from(camera_presets_data.data, 'base64');

/**
 * The aim assist categories and presets a Bedrock Dedicated Server sends a joining client, as the
 * payload of `CameraAimAssistPresetsPacket`, replayed verbatim. A script reads the same registry
 * through `world.getAimAssist()`.
 */
export const aim_assist_presets: Buffer = Buffer.from(aim_assist_presets_data.data, 'base64');
