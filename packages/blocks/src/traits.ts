import type { BlockPalette, BlockStateDefinition } from './state';

/**
 * Which states each trait's `enabled_states` entries add to a block.
 *
 * The trait names and the `enabled_states` enums come from
 * `metadata/json_schemas/server/block/1.26.20/Traits.json` and the four
 * `* Enabled State.json` files beside it in `Mojang/bedrock-samples`
 * v1.26.50.4. `minecraft:cardinal_connections` is the one entry that expands
 * to more than one state.
 */
export const TRAIT_STATES: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {
    'minecraft:placement_direction': {
        'minecraft:cardinal_direction': ['minecraft:cardinal_direction'],
        'minecraft:corner_and_cardinal_direction': ['minecraft:corner_and_cardinal_direction'],
        'minecraft:facing_direction': ['minecraft:facing_direction'],
        'minecraft:sixteen_way_rotation': ['minecraft:sixteen_way_rotation']
    },
    'minecraft:placement_position': {
        'minecraft:block_face': ['minecraft:block_face'],
        'minecraft:vertical_half': ['minecraft:vertical_half']
    },
    'minecraft:connection': {
        'minecraft:cardinal_connections': [
            'minecraft:connection_north',
            'minecraft:connection_south',
            'minecraft:connection_east',
            'minecraft:connection_west'
        ]
    },
    'minecraft:multi_block': {
        'minecraft:multi_block_part': ['minecraft:multi_block_part']
    }
};

/**
 * The value domain of every `minecraft:`-prefixed state, read off the palette
 * rather than written down here.
 *
 * A trait supplies an intrinsic state, and the only published domains for
 * those are the ones the captured palette already holds, so deriving them
 * keeps one source of truth. A trait state no captured block declares, such
 * as `minecraft:sixteen_way_rotation`, has no entry and the resolver reports
 * it instead of guessing a domain.
 *
 * @returns State name to its definition, with the values every block that
 *   declares it agrees on.
 */
export const traitStateDomains = (palette: BlockPalette): ReadonlyMap<string, BlockStateDefinition> => {
    const domains = new Map<string, BlockStateDefinition>();
    for (const entry of palette.entries) {
        for (const state of entry.model.states) {
            if (!state.name.startsWith('minecraft:')) continue;
            const known = domains.get(state.name);
            if (known === undefined || state.values.length > known.values.length) domains.set(state.name, state);
        }
    }
    return domains;
};
