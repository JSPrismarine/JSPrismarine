/**
 * The behavior family of a block, derived from its identifier.
 *
 * The families follow the table in
 * `docs/research/bedrock-blocks-items-recipes-biomes-features.md` section 9,
 * which grouped all 1463 names in `mojang-blocks.json` into roughly 60
 * families. The names here are what a behavior registers under, so the
 * behavior package attaches one implementation per family rather than one per
 * block.
 *
 * Mojang does the same thing with `internal_vanilla_data.block_archetype` in
 * its own 98 data-driven blocks, and the two agree by construction: the
 * `slab_block` archetype lands in the `slab` family and `stair_block` in
 * `stairs`.
 */

/** One family and the identifiers it claims. First match in {@link BLOCK_FAMILIES} wins. */
export interface BlockFamilyRule {
    /** The behavior name, in this project's namespace. */
    readonly behavior: string;
    /** Full identifiers, without the namespace. */
    readonly exact?: readonly string[];
    /** Identifier endings, such as `_stairs`. */
    readonly suffix?: readonly string[];
    /** Substrings anywhere in the identifier, such as `copper`. */
    readonly contains?: readonly string[];
    /** Identifier beginnings, such as `element_`. */
    readonly prefix?: readonly string[];
}

/**
 * The blocks the `jsprismarine:portal` family claims, grouped by the role each
 * plays in a portal, without the namespace.
 *
 * `@jsprismarine/block-behaviors` reads the groups to know which block is a
 * nether portal, which is an end portal frame and which fire lights a frame,
 * so the family rule and the geometry rules name the blocks once. The end
 * gateway is here rather than in the inert bucket because it teleports, which
 * is portal work, even though no hook handles it yet.
 */
export const PORTAL_BLOCK_NAMES = {
    /** The lit nether portal block, `minecraft:portal` on Bedrock. */
    netherPortal: ['portal'],
    /** The block the end portal frame ring fills with. */
    endPortal: ['end_portal'],
    /** The ring block an eye of ender goes into. */
    endPortalFrame: ['end_portal_frame'],
    /** The End's intradimensional gateway. */
    endGateway: ['end_gateway'],
    /** The two fires, either of which lights a nether portal frame. */
    fire: ['fire', 'soul_fire']
} as const satisfies Record<string, readonly string[]>;

/**
 * Every family, in match order. The order carries meaning: `_fence_gate`
 * before `_fence`, `_wall_sign` before `_wall`, `redstone_torch` before
 * `torch`, and the inert bucket before the plain-cube default.
 */
export const BLOCK_FAMILIES: readonly BlockFamilyRule[] = [
    {
        behavior: 'jsprismarine:chemistry',
        exact: ['compound_creator', 'element_constructor', 'lab_table', 'material_reducer', 'chemical_heat']
    },
    {
        behavior: 'jsprismarine:inert',
        exact: [
            'air',
            'barrier',
            'bedrock',
            'client_request_placeholder_block',
            'command_block',
            'chain_command_block',
            'repeating_command_block',
            'structure_block',
            'structure_void',
            'jigsaw',
            'moving_block',
            'invisible_bedrock',
            'info_update',
            'info_update2',
            'reserved6',
            'glowingobsidian',
            'netherreactor',
            'deprecated_anvil',
            'deprecated_purpur_block_1',
            'deprecated_purpur_block_2',
            'allow',
            'deny',
            'border_block',
            'camera',
            'chalkboard',
            'stonecutter',
            'unknown'
        ],
        prefix: ['light_block_', 'element_'],
        contains: ['hard_glass', 'hard_', 'chemistry_table', 'colored_torch_', 'underwater_torch', 'underwater_tnt']
    },
    { behavior: 'jsprismarine:liquid', exact: ['water', 'flowing_water', 'lava', 'flowing_lava'] },
    {
        behavior: 'jsprismarine:portal',
        exact: Object.values(PORTAL_BLOCK_NAMES).flat()
    },
    {
        behavior: 'jsprismarine:double_slab',
        suffix: ['_double_slab'],
        exact: ['double_stone_block_slab', 'double_wooden_slab']
    },
    { behavior: 'jsprismarine:slab', suffix: ['_slab'] },
    { behavior: 'jsprismarine:stairs', suffix: ['_stairs'] },
    { behavior: 'jsprismarine:sign', contains: ['_sign'] },
    { behavior: 'jsprismarine:banner', contains: ['banner'] },
    { behavior: 'jsprismarine:head', suffix: ['_head', '_skull'], exact: ['skull', 'player_head'] },
    { behavior: 'jsprismarine:wall', suffix: ['_wall'], exact: ['cobblestone_wall', 'blackstone_wall'] },
    { behavior: 'jsprismarine:fence_gate', suffix: ['_fence_gate', 'fence_gate'] },
    { behavior: 'jsprismarine:fence', suffix: ['_fence', 'fence'], exact: ['iron_bars'] },
    { behavior: 'jsprismarine:trapdoor', contains: ['trapdoor'] },
    { behavior: 'jsprismarine:door', suffix: ['_door', 'door'] },
    { behavior: 'jsprismarine:button', suffix: ['_button'] },
    { behavior: 'jsprismarine:pressure_plate', contains: ['pressure_plate'] },
    { behavior: 'jsprismarine:rail', contains: ['rail'] },
    {
        behavior: 'jsprismarine:redstone',
        exact: [
            'redstone_wire',
            'redstone_block',
            'redstone_lamp',
            'lit_redstone_lamp',
            'redstone_torch',
            'unlit_redstone_torch',
            'lever',
            'powered_repeater',
            'unpowered_repeater',
            'powered_comparator',
            'unpowered_comparator',
            'observer',
            'dispenser',
            'dropper',
            'piston',
            'sticky_piston',
            'piston_arm_collision',
            'sticky_piston_arm_collision',
            'noteblock',
            'jukebox',
            'hopper',
            'crafter',
            'target',
            'daylight_detector',
            'daylight_detector_inverted',
            'tripwire',
            'tripwire_hook',
            'lightning_rod',
            'bell',
            'lectern',
            'tnt',
            'calibrated_sculk_sensor',
            'sculk_sensor'
        ]
    },
    { behavior: 'jsprismarine:sculk', contains: ['sculk'] },
    { behavior: 'jsprismarine:copper', contains: ['copper'] },
    { behavior: 'jsprismarine:candle', contains: ['candle'] },
    { behavior: 'jsprismarine:cake', contains: ['cake'] },
    { behavior: 'jsprismarine:bed', contains: ['bed'] },
    { behavior: 'jsprismarine:container', contains: ['chest', 'barrel', 'shulker_box', 'decorated_pot'] },
    { behavior: 'jsprismarine:furnace', contains: ['furnace', 'smoker', 'campfire', 'brewing_stand'] },
    { behavior: 'jsprismarine:cauldron', contains: ['cauldron'] },
    { behavior: 'jsprismarine:composter', exact: ['composter'] },
    { behavior: 'jsprismarine:flower_pot', exact: ['flower_pot'] },
    { behavior: 'jsprismarine:torch', contains: ['torch'] },
    { behavior: 'jsprismarine:lantern', contains: ['lantern'] },
    { behavior: 'jsprismarine:leaves', contains: ['leaves'] },
    { behavior: 'jsprismarine:sapling', contains: ['sapling', 'propagule'] },
    {
        behavior: 'jsprismarine:crop',
        exact: [
            'wheat',
            'carrots',
            'potatoes',
            'beetroot',
            'melon_stem',
            'pumpkin_stem',
            'cocoa',
            'nether_wart',
            'sweet_berry_bush',
            'cave_vines',
            'cave_vines_body_with_berries',
            'cave_vines_head_with_berries',
            'torchflower_crop',
            'pitcher_crop',
            'pitcher_plant'
        ]
    },
    { behavior: 'jsprismarine:bamboo', contains: ['bamboo', 'chorus', 'kelp', 'seagrass', 'sea_pickle', 'coral'] },
    {
        behavior: 'jsprismarine:climbing',
        contains: [
            'vine',
            'ladder',
            'scaffolding',
            'chain',
            'glow_lichen',
            'hanging_roots',
            'leaf_litter',
            'wildflowers',
            'resin_clump'
        ]
    },
    { behavior: 'jsprismarine:ice', contains: ['ice'] },
    { behavior: 'jsprismarine:snow', contains: ['snow'] },
    {
        behavior: 'jsprismarine:soil',
        contains: [
            'dirt',
            'moss',
            'nylium',
            'mud',
            'sand',
            'gravel',
            'clay',
            'farmland',
            'grass_block',
            'grass_path',
            'podzol',
            'mycelium',
            'soul_soil',
            'suspicious_'
        ]
    },
    { behavior: 'jsprismarine:egg', contains: ['egg', 'frogspawn'] },
    { behavior: 'jsprismarine:dripstone', contains: ['dripstone', 'amethyst', 'budding'] },
    { behavior: 'jsprismarine:dripleaf', contains: ['dripleaf', 'spore_blossom'] },
    {
        behavior: 'jsprismarine:flora',
        contains: [
            'flower',
            'mushroom',
            'fungus',
            'roots',
            'grass',
            'fern',
            'petals',
            'lily_pad',
            'eyeblossom',
            'shrub',
            'bush',
            'sapling',
            'azalea',
            'sprouts',
            'dandelion',
            'poppy',
            'orchid',
            'allium',
            'bluet',
            'tulip',
            'daisy',
            'cornflower',
            'lilac',
            'rose_bush',
            'peony',
            'sunflower',
            'lotus',
            'wither_rose',
            'cactus',
            'sugar_cane',
            'vine',
            'spore',
            'pitcher',
            'torchflower',
            'nether_sprouts'
        ]
    },
    {
        behavior: 'jsprismarine:utility',
        contains: [
            'anvil',
            'grindstone',
            'enchanting_table',
            'crafting_table',
            'loom',
            'stonecutter_block',
            'beacon',
            'conduit',
            'respawn_anchor',
            'lodestone',
            'end_rod',
            'trial_spawner',
            'vault',
            'mob_spawner',
            'heavy_core',
            'bee_nest',
            'beehive',
            'sponge',
            'creaking_heart',
            'shelf',
            'honey',
            'slime',
            'magma',
            'cartography_table',
            'fletching_table',
            'smithing_table',
            'frame',
            'end_crystal',
            'conduit',
            'dried_ghast',
            'potent_sulfur',
            'turtle_egg'
        ]
    },
    {
        behavior: 'jsprismarine:ore',
        suffix: ['_ore'],
        contains: ['raw_iron_block', 'raw_gold_block', 'raw_copper_block']
    },
    { behavior: 'jsprismarine:log', suffix: ['_log', '_wood', '_stem', '_hyphae'] },
    { behavior: 'jsprismarine:glass', contains: ['glass'] },
    { behavior: 'jsprismarine:pane', suffix: ['_pane', '_bars'] }
];

/** The behavior every block with no family rule takes: a full cube with no behavior of its own. */
export const DEFAULT_BLOCK_BEHAVIOR = 'jsprismarine:plain_block';

const matches = (rule: BlockFamilyRule, name: string): boolean =>
    (rule.exact?.includes(name) ?? false) ||
    (rule.prefix?.some((prefix) => name.startsWith(prefix)) ?? false) ||
    (rule.suffix?.some((suffix) => name.endsWith(suffix)) ?? false) ||
    (rule.contains?.some((part) => name.includes(part)) ?? false);

/**
 * The behavior name for one block identifier.
 *
 * @param identifier - Namespaced, such as `minecraft:oak_stairs`.
 * @param archetype - The `block_archetype` the block's own definition
 *   declares, which wins over the identifier because Mojang already decided
 *   the family there.
 */
export const behaviorFor = (identifier: string, archetype?: string): string => {
    if (archetype !== undefined) return `jsprismarine:${archetype.replace(/_block$/, '')}`;

    const name = identifier.replace(/^[^:]*:/, '');
    for (const rule of BLOCK_FAMILIES) {
        if (matches(rule, name)) return rule.behavior;
    }
    return DEFAULT_BLOCK_BEHAVIOR;
};

/** Every behavior name the family rules can produce, plus the default. */
export const BLOCK_BEHAVIOR_NAMES: readonly string[] = [
    ...BLOCK_FAMILIES.map((rule) => rule.behavior),
    DEFAULT_BLOCK_BEHAVIOR
];
