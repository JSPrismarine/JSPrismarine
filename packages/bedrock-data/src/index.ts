import banner_patterns from '../resources/banner_patterns.json';
import creativeitems from '../resources/creativeitems.json';
import entity_id_map from '../resources/entity_id_map.json';
import block_id_map from './jsp/block_id_map.json';
import item_id_map from './jsp/item_id_map.json';
//import recipes from '../resources/recipes.json';

export {
    banner_patterns,
    block_id_map,
    creativeitems,
    entity_id_map,
    item_id_map
    // recipes,
};

import biome_definitions_data from './generated/biome_definitions.json';
import entity_identifiers_data from './generated/entity_identifiers.json';
import r12_to_current_block_map_data from './generated/r12_to_current_block_map.json';
import canonical_block_states_data from './generated/runtime_block_states.json';

const toBuffer = ({ data }: { data: any }) => Buffer.from(data, 'base64') as any; // FIXME: Properly handle types.
export const biome_definitions = toBuffer(biome_definitions_data);
export const entity_identifiers = toBuffer(entity_identifiers_data);
export const canonical_block_states = toBuffer(canonical_block_states_data);
export const r12_to_current_block_map = toBuffer(r12_to_current_block_map_data);
