import block_definitions_data from './jsp/block_definitions.json';
import { creative_groups, creativeitems } from './generated/creativeitems';
import required_item_list from './jsp/required_item_list.json';
import item_tags_data from './vendor/item_tags.json';

export type { CreativeGroupEntry, CreativeItemEntry } from './generated/creativeitems';

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
 * `packages/client/tools/capture-server-data.mjs` is that client. It stays under `jsp/` rather
 * than moving to `resources/` because a capture of the version this server targets is the
 * thing nothing else can promise; the submodule's own `runtime_item_states.json` happens to
 * agree with it name for name and number for number, which is how the pin was chosen.
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
    // The headings of the creative menu, and the entries filed under them. `CreativeItemEntry.group`
    // indexes this list, so the two travel together or neither means anything.
    creative_groups,
    creativeitems
};

/**
 * Tag name to the items carrying it.
 *
 * A recipe may ask for "any plank" rather than name the thirteen, and this is the only place
 * that question has an answer. Typed by the question rather than by the file: a caller asks
 * about a tag name a recipe gave it, which is a string and not one of the 77 keys the JSON
 * happens to hold.
 */
export const item_tags: Readonly<Record<string, readonly string[]>> = item_tags_data;

import biome_definitions_network_data from './generated/biome_definitions_network.json';
import entity_identifiers_data from './generated/entity_identifiers.json';
import jigsaw_structure_data_data from './generated/jigsaw_structure_data.json';

const toBuffer = ({ data }: { data: string }) => Buffer.from(data, 'base64');

/**
 * Every actor type a client may be asked to render, as `AvailableActorIdentifiersPacket`
 * carries it: one network NBT compound holding an `idlist`, replayed verbatim.
 */
export const entity_identifiers: Buffer = toBuffer(entity_identifiers_data);

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
 * At 1.26.x the packet became a map of biome data plus a shared string table the entries index
 * into. An empty one is no longer enough - a client reaches the world-generation screen with no
 * biomes and gives up - so a server that generates any world has to send the real thing.
 */
export const biome_definitions_network: Buffer = toBuffer(biome_definitions_network_data);
