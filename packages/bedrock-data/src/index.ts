import block_definitions_data from './jsp/block_definitions.json';
import block_id_map from './jsp/block_id_map.json';
import banner_patterns from './resources/banner_patterns.json';
import biome_id_map from './resources/biome_id_map.json';
import creativeitems from './resources/creativeitems.json';
import entity_id_map from './resources/entity_id_map.json';
import required_item_list from './jsp/required_item_list.json';
import item_tags from './resources/item_tags.json';

/** One item as the item table names it. */
export interface ItemTypeEntry {
    /** The numeric id the client will know this name by. Negative for a block's item form. */
    runtime_id: number;
    /** Whether the item is defined by components rather than being one the client already knows. */
    component_based: boolean;
}

/**
 * The item table: every name the client can be told about, and the number it travels as.
 *
 * The authority on the mapping - the client builds its registry from what we send, so
 * everything naming an item has to agree with this one file.
 *
 * Captured from a Bedrock Dedicated Server 1.26.51.1, not taken from a third party: the
 * server sends it as `ItemRegistryPacket`, so a client that can log in can simply record it.
 * `packages/client/tools/capture-server-data.mjs` is that client. It lives under `jsp/` rather
 * than `resources/` because `resources/` is somebody else's repository, checked out as a
 * submodule, and stops at 1.26.30.
 *
 * The version matters more than it looks. Against the 1.21.40 table this has 240 names it did
 * not, and - the part that breaks quietly - **528 items whose number changed**. A server on
 * the old table does not fail; it puts the wrong number on the wire for a quarter of the
 * items it knows, and the client shows something else.
 */
export const item_table: Record<string, ItemTypeEntry> = required_item_list;

/**
 * Item name to numeric id.
 *
 * Derived from {@link item_table} rather than kept by hand. The hand-written file this
 * replaced had 807 entries and predated the flattening: it knew `minecraft:planks` but not
 * `minecraft:oak_planks`, so it could name only 53% of the creative menu and none of the
 * rest. Anything it could not name fell back to an unrelated internal id, which is how half
 * the creative menu came to be duplicates of the wrong item.
 */
export const item_id_map: Record<string, number> = Object.fromEntries(
    Object.entries(item_table).map(([name, entry]) => [name, entry.runtime_id])
);

/** A vanilla block the client only knows if the server declares it. */
export interface BlockDefinitionEntry {
    name: string;
    /** The definition as network NBT, exactly as a Bedrock Dedicated Server sends it. */
    definition: Buffer;
}

/**
 * The data driven vanilla blocks, and the definitions a client needs to draw them.
 *
 * Since 1.26.50 vanilla defines some of its own blocks in data rather than in the client -
 * the wool stairs and slabs, the concrete slabs - and a server has to declare them in
 * `StartGamePacket` the way it would a plugin's. Captured from the same server as the item
 * table, by the same tool; each definition is handed back to the wire verbatim.
 */
export const block_definitions: readonly BlockDefinitionEntry[] = block_definitions_data.blocks.map((block) => ({
    name: block.name,
    definition: Buffer.from(block.definition, 'base64')
}));

export {
    banner_patterns,
    // Biome name to numeric id. A world's Data3D records store the numbers, so anything that
    // wants to talk about biomes by name needs this to get there.
    biome_id_map,
    block_id_map,
    creativeitems,
    entity_id_map,
    // Tag name to the items carrying it. A recipe may ask for "any plank" rather than name the
    // eleven, and this is the only place that question has an answer.
    item_tags
};

import biome_definitions_data from './generated/biome_definitions.json';
import biome_definitions_network_data from './generated/biome_definitions_network.json';
import entity_identifiers_data from './generated/entity_identifiers.json';
import jigsaw_structure_data_data from './generated/jigsaw_structure_data.json';
import r12_to_current_block_map_data from './generated/r12_to_current_block_map.json';
import canonical_block_states_data from './generated/runtime_block_states.json';

const toBuffer = ({ data }: { data: any }) => Buffer.from(data, 'base64'); // FIXME: Properly handle types.
export const biome_definitions: any = toBuffer(biome_definitions_data);
export const entity_identifiers: any = toBuffer(entity_identifiers_data);
export const canonical_block_states: any = toBuffer(canonical_block_states_data);
export const r12_to_current_block_map: any = toBuffer(r12_to_current_block_map_data);

/**
 * The jigsaw structure rules, as `JigsawStructureDataPacket` carries them: one network NBT
 * compound, the payload of the packet a Bedrock Dedicated Server 1.26.51.1 sent. A client at
 * protocol 2193 refuses to join a server that has not sent this before `StartGamePacket`.
 */
export const jigsaw_structure_data: Buffer = toBuffer(jigsaw_structure_data_data);

/**
 * The vanilla biome definitions, as `BiomeDefinitionListPacket` carries them at protocol 2193:
 * the whole payload of the packet a Bedrock Dedicated Server 1.26.51.1 sends, replayed verbatim.
 *
 * Not the stale `biome_definitions` above (1.21.40, and a format the packet stopped using): at
 * 1.26.x the packet became a map of biome data plus a shared string table the entries index
 * into. An empty one is no longer enough - a client reaches the world-generation screen with no
 * biomes and gives up - so a server that generates any world has to send the real thing.
 */
export const biome_definitions_network: Buffer = toBuffer(biome_definitions_network_data);
