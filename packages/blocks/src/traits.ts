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
        'minecraft:corner_and_cardinal_direction': ['minecraft:cardinal_direction', 'minecraft:corner'],
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

/** Trait-provided state domains that the vanilla palette does not contain. */
const TRAIT_ONLY_STATE_DOMAINS: readonly BlockStateDefinition[] = [
    {
        name: 'minecraft:sixteen_way_rotation',
        type: 'int',
        values: Array.from({ length: 16 }, (_unused, index) => index),
        defaultValue: 0
    },
    {
        name: 'minecraft:multi_block_part',
        type: 'int',
        values: [0, 1, 2, 3],
        defaultValue: 0
    }
];

/**
 * The value domain of every state a trait can add.
 *
 * Most trait states also occur in the vanilla palette. The two newer states
 * are kept here because no vanilla block declares them: sixteen-way rotation
 * is 0 through 15, and a multi-block part is 0 through 3.
 *
 * @param palette - The palette whose other intrinsic state domains are used.
 * @returns State name to its definition, including trait-only states.
 */
export const traitStateDomains = (palette: BlockPalette): ReadonlyMap<string, BlockStateDefinition> => {
    const domains = new Map<string, BlockStateDefinition>();
    for (const state of TRAIT_ONLY_STATE_DOMAINS) domains.set(state.name, state);
    for (const entry of palette.entries) {
        for (const state of entry.model.states) {
            if (!state.name.startsWith('minecraft:')) continue;
            const known = domains.get(state.name);
            if (known === undefined || state.values.length > known.values.length) domains.set(state.name, state);
        }
    }
    return domains;
};
