/**
 * The reviewed loss allow list: every known place where the Java 26.3 to
 * Bedrock 1.26.51 mapping loses information, each with a reason and a
 * reference. The property tests fail when a loss appears that is not listed
 * here, and also when a listed loss stops occurring, so the list stays exact
 * in both directions.
 *
 * The references cite `docs/research/java-to-bedrock-translation.md` (the
 * measured join this package reproduces) by section, and GeyserMC issues
 * where one documents the loss directly.
 */

const NOTE = 'docs/research/java-to-bedrock-translation.md';

/** Where the information a collapsed Java block property reappears, if anywhere. */
export type BlockPropertyRecovery =
    /** Bedrock's second per-sub-chunk block storage layer carries it. */
    | 'second-layer'
    /** Bedrock block entity NBT carries it. */
    | 'block-entity'
    /** The Bedrock client recomputes it from neighboring blocks. */
    | 'client-computed'
    /** Nothing carries it; in every listed case neither edition renders it. */
    | 'none';

/**
 * A Java block state property that the Bedrock block state cannot express:
 * two Java states differing only in this property map to one Bedrock state
 * for every state of the listed blocks.
 */
export interface DroppedBlockProperty {
    /** The Java property name. */
    readonly property: string;
    /** Every affected Java block, or only the count where the list is too long to review name by name. */
    readonly blocks: readonly string[] | { readonly count: number };
    readonly recovery: BlockPropertyRecovery;
    readonly reason: string;
    readonly reference: string;
}

/**
 * Java block properties the Bedrock state drops for every state of the listed
 * blocks. The counts and lists are verified against the generated table by
 * the round-trip property test.
 */
export const DROPPED_BLOCK_PROPERTIES = [
    {
        property: 'waterlogged',
        blocks: { count: 504 },
        recovery: 'second-layer',
        reason: 'Bedrock has no waterlogged flag; water travels in the second block storage layer.',
        reference: `${NOTE} section 2`
    },
    {
        property: 'powered',
        blocks: { count: 72 },
        recovery: 'none',
        reason: 'Doors, trapdoors, fence gates, pressure plates and heads render identically powered or not in both editions.',
        reference: `${NOTE} section 2`
    },
    {
        property: 'facing',
        blocks: [
            'minecraft:black_shulker_box',
            'minecraft:blue_shulker_box',
            'minecraft:brown_shulker_box',
            'minecraft:cyan_shulker_box',
            'minecraft:gray_shulker_box',
            'minecraft:green_shulker_box',
            'minecraft:light_blue_shulker_box',
            'minecraft:light_gray_shulker_box',
            'minecraft:lime_shulker_box',
            'minecraft:magenta_shulker_box',
            'minecraft:moving_piston',
            'minecraft:orange_shulker_box',
            'minecraft:pink_shulker_box',
            'minecraft:purple_shulker_box',
            'minecraft:red_shulker_box',
            'minecraft:shulker_box',
            'minecraft:white_shulker_box',
            'minecraft:yellow_shulker_box'
        ],
        recovery: 'block-entity',
        reason: 'Shulker box facing travels in Bedrock block entity NBT, not the block state.',
        reference: `${NOTE} section 2`
    },
    {
        property: 'distance',
        blocks: [
            'minecraft:acacia_leaves',
            'minecraft:azalea_leaves',
            'minecraft:birch_leaves',
            'minecraft:cherry_leaves',
            'minecraft:dark_oak_leaves',
            'minecraft:flowering_azalea_leaves',
            'minecraft:jungle_leaves',
            'minecraft:mangrove_leaves',
            'minecraft:oak_leaves',
            'minecraft:orange_poplar_leaves',
            'minecraft:pale_oak_leaves',
            'minecraft:red_poplar_leaves',
            'minecraft:spruce_leaves',
            'minecraft:yellow_poplar_leaves'
        ],
        recovery: 'client-computed',
        reason: 'The Bedrock client recomputes leaf decay distance from neighbors.',
        reference: `${NOTE} section 2`
    },
    {
        property: 'type',
        blocks: [
            'minecraft:chest',
            'minecraft:copper_chest',
            'minecraft:exposed_copper_chest',
            'minecraft:moving_piston',
            'minecraft:oxidized_copper_chest',
            'minecraft:trapped_chest',
            'minecraft:waxed_copper_chest',
            'minecraft:waxed_exposed_copper_chest',
            'minecraft:waxed_oxidized_copper_chest',
            'minecraft:waxed_weathered_copper_chest',
            'minecraft:weathered_copper_chest'
        ],
        recovery: 'block-entity',
        reason: 'The double-chest pair position travels in Bedrock block entity NBT.',
        reference: `${NOTE} section 2`
    },
    {
        property: 'copper_golem_pose',
        blocks: [
            'minecraft:copper_golem_statue',
            'minecraft:exposed_copper_golem_statue',
            'minecraft:oxidized_copper_golem_statue',
            'minecraft:waxed_copper_golem_statue',
            'minecraft:waxed_exposed_copper_golem_statue',
            'minecraft:waxed_oxidized_copper_golem_statue',
            'minecraft:waxed_weathered_copper_golem_statue',
            'minecraft:weathered_copper_golem_statue'
        ],
        recovery: 'block-entity',
        reason: 'Copper golem poses are block states on Java and block entity NBT on Bedrock.',
        reference: `${NOTE} section 2`
    },
    {
        property: 'rotation',
        blocks: [
            'minecraft:creeper_head',
            'minecraft:dragon_head',
            'minecraft:piglin_head',
            'minecraft:player_head',
            'minecraft:skeleton_skull',
            'minecraft:wither_skeleton_skull',
            'minecraft:zombie_head'
        ],
        recovery: 'block-entity',
        reason: 'Skull rotation travels in Bedrock block entity NBT as degrees.',
        reference: `${NOTE} section 2`
    },
    {
        property: 'power',
        blocks: ['minecraft:calibrated_sculk_sensor', 'minecraft:sculk_sensor', 'minecraft:target'],
        recovery: 'none',
        reason: 'The output power level is not visual on these blocks.',
        reference: `${NOTE} section 2`
    },
    {
        property: 'north',
        blocks: ['minecraft:chorus_plant', 'minecraft:fire', 'minecraft:redstone_wire'],
        recovery: 'client-computed',
        reason: 'The Bedrock client computes block connections from neighbors.',
        reference: `${NOTE} section 2`
    },
    {
        property: 'south',
        blocks: ['minecraft:chorus_plant', 'minecraft:fire', 'minecraft:redstone_wire'],
        recovery: 'client-computed',
        reason: 'The Bedrock client computes block connections from neighbors.',
        reference: `${NOTE} section 2`
    },
    {
        property: 'east',
        blocks: ['minecraft:chorus_plant', 'minecraft:fire', 'minecraft:redstone_wire'],
        recovery: 'client-computed',
        reason: 'The Bedrock client computes block connections from neighbors.',
        reference: `${NOTE} section 2`
    },
    {
        property: 'west',
        blocks: ['minecraft:chorus_plant', 'minecraft:fire', 'minecraft:redstone_wire'],
        recovery: 'client-computed',
        reason: 'The Bedrock client computes block connections from neighbors.',
        reference: `${NOTE} section 2`
    },
    {
        property: 'up',
        blocks: ['minecraft:chorus_plant', 'minecraft:fire', 'minecraft:vine'],
        recovery: 'client-computed',
        reason: 'The Bedrock client computes block connections from neighbors.',
        reference: `${NOTE} section 2`
    },
    {
        property: 'down',
        blocks: ['minecraft:chorus_plant'],
        recovery: 'client-computed',
        reason: 'The Bedrock client computes block connections from neighbors.',
        reference: `${NOTE} section 2`
    },
    {
        property: 'snowy',
        blocks: ['minecraft:grass_block', 'minecraft:mycelium', 'minecraft:podzol'],
        recovery: 'client-computed',
        reason: 'The Bedrock client computes the snowy top texture from the block above.',
        reference: `${NOTE} section 2`
    },
    {
        property: 'stage',
        blocks: ['minecraft:bamboo', 'minecraft:mangrove_propagule'],
        recovery: 'none',
        reason: 'The sapling growth stage is not visual.',
        reference: `${NOTE} section 2`
    },
    {
        property: 'signal_fire',
        blocks: ['minecraft:campfire', 'minecraft:soul_campfire'],
        recovery: 'none',
        reason: 'Whether a campfire sits on hay is not part of the Bedrock block state.',
        reference: `${NOTE} section 2`
    },
    {
        property: 'extended',
        blocks: ['minecraft:piston', 'minecraft:sticky_piston'],
        recovery: 'none',
        reason: 'Bedrock tracks piston extension in the piston block entity.',
        reference: `${NOTE} section 2`
    },
    {
        property: 'cracked',
        blocks: ['minecraft:decorated_pot'],
        recovery: 'block-entity',
        reason: 'Decorated pot detail travels in Bedrock block entity NBT.',
        reference: `${NOTE} section 2`
    },
    {
        property: 'has_record',
        blocks: ['minecraft:jukebox'],
        recovery: 'block-entity',
        reason: 'The inserted disc travels in Bedrock block entity NBT.',
        reference: `${NOTE} section 2`
    },
    {
        property: 'has_book',
        blocks: ['minecraft:lectern'],
        recovery: 'block-entity',
        reason: 'The held book travels in Bedrock block entity NBT.',
        reference: `${NOTE} section 2`
    },
    {
        property: 'instrument',
        blocks: ['minecraft:note_block'],
        recovery: 'none',
        reason: 'Bedrock derives the note block instrument from the block below.',
        reference: `${NOTE} section 2`
    },
    {
        property: 'note',
        blocks: ['minecraft:note_block'],
        recovery: 'block-entity',
        reason: 'The pitch travels in Bedrock block entity NBT.',
        reference: `${NOTE} section 2`
    },
    {
        property: 'short',
        blocks: ['minecraft:piston_head'],
        recovery: 'none',
        reason: 'The shortened mid-push arm is not part of the Bedrock block state.',
        reference: `${NOTE} section 2`
    },
    {
        property: 'locked',
        blocks: ['minecraft:repeater'],
        recovery: 'none',
        reason: 'Repeater locking is recomputed from neighboring repeaters.',
        reference: `${NOTE} section 2`
    },
    {
        property: 'bottom',
        blocks: ['minecraft:scaffolding'],
        recovery: 'client-computed',
        reason: 'The Bedrock client computes the floating-scaffolding bottom face itself.',
        reference: `${NOTE} section 2`
    },
    {
        property: 'mode',
        blocks: ['minecraft:test_block'],
        recovery: 'none',
        reason: 'The test block has no Bedrock concept at all; see BLOCK_LOSSES.',
        reference: `${NOTE} section 2`
    }
] as const satisfies readonly DroppedBlockProperty[];

/**
 * A Java block whose state property collapses only for some of its values,
 * so the property is dropped for part of the block's state space rather
 * than all of it.
 */
export interface PartialBlockPropertyCollapse {
    /** The Java block identifier. */
    readonly block: string;
    /** The properties whose collapse depends on the other properties' values. */
    readonly properties: readonly string[];
    readonly reason: string;
    readonly reference: string;
}

const BUTTON_COLLAPSE = {
    properties: ['facing'],
    reason: "Bedrock's facing_direction 0 and 1 (floor and ceiling) ignore the horizontal facing Java keeps.",
    reference: `${NOTE} section 2`
} as const;

const MUSHROOM_COLLAPSE = {
    properties: ['down', 'east', 'north', 'south', 'up', 'west'],
    reason: "Java's 64 face combinations collapse onto Bedrock's huge_mushroom_bits values.",
    reference: `${NOTE} section 2`
} as const;

/**
 * Blocks where a state property collapses for only part of the state space.
 * The round-trip property test accepts a non-identity round trip for these
 * blocks only on the listed properties.
 */
export const PARTIAL_BLOCK_PROPERTY_COLLAPSES = [
    { block: 'minecraft:acacia_button', ...BUTTON_COLLAPSE },
    { block: 'minecraft:bamboo_button', ...BUTTON_COLLAPSE },
    { block: 'minecraft:birch_button', ...BUTTON_COLLAPSE },
    { block: 'minecraft:cherry_button', ...BUTTON_COLLAPSE },
    { block: 'minecraft:crimson_button', ...BUTTON_COLLAPSE },
    { block: 'minecraft:dark_oak_button', ...BUTTON_COLLAPSE },
    { block: 'minecraft:jungle_button', ...BUTTON_COLLAPSE },
    { block: 'minecraft:mangrove_button', ...BUTTON_COLLAPSE },
    { block: 'minecraft:oak_button', ...BUTTON_COLLAPSE },
    { block: 'minecraft:pale_oak_button', ...BUTTON_COLLAPSE },
    { block: 'minecraft:polished_blackstone_button', ...BUTTON_COLLAPSE },
    { block: 'minecraft:poplar_button', ...BUTTON_COLLAPSE },
    { block: 'minecraft:spruce_button', ...BUTTON_COLLAPSE },
    { block: 'minecraft:stone_button', ...BUTTON_COLLAPSE },
    { block: 'minecraft:warped_button', ...BUTTON_COLLAPSE },
    {
        block: 'minecraft:lever',
        properties: ['facing', 'powered'],
        reason: "Bedrock's lever_direction merges the floor and ceiling facings, and the powered bit folds into the direction for some orientations.",
        reference: `${NOTE} section 2`
    },
    { block: 'minecraft:brown_mushroom_block', ...MUSHROOM_COLLAPSE },
    { block: 'minecraft:mushroom_stem', ...MUSHROOM_COLLAPSE },
    { block: 'minecraft:red_mushroom_block', ...MUSHROOM_COLLAPSE }
] as const satisfies readonly PartialBlockPropertyCollapse[];

/**
 * A Bedrock block state whose values no single Java property spells, so there is no word
 * vocabulary for it in {@link import('./blockStates').bedrockBlockStates}.
 */
export interface BlockStateLoss {
    /** The Bedrock state name. */
    readonly state: string;
    /** Every Bedrock block that carries the state this way. */
    readonly blocks: readonly string[];
    readonly reason: string;
    readonly reference: string;
}

/** The fifteen Bedrock buttons; Bedrock spells the oak one `wooden_button`. */
const BEDROCK_BUTTONS = [
    'minecraft:acacia_button',
    'minecraft:bamboo_button',
    'minecraft:birch_button',
    'minecraft:cherry_button',
    'minecraft:crimson_button',
    'minecraft:dark_oak_button',
    'minecraft:jungle_button',
    'minecraft:mangrove_button',
    'minecraft:pale_oak_button',
    'minecraft:polished_blackstone_button',
    'minecraft:poplar_button',
    'minecraft:spruce_button',
    'minecraft:stone_button',
    'minecraft:warped_button',
    'minecraft:wooden_button'
] as const;

const PACKED_FACES = {
    reason: 'Bedrock packs the six face booleans Java carries separately into the bits of one number.',
    reference: `${NOTE} section 2`
} as const;

/**
 * The Bedrock states a caller cannot write in Java's words.
 *
 * {@link import('./blockStates').bedrockBlockStates} reads every other state's vocabulary out
 * of the block mapping, by finding the one Java property whose values pick its values. These
 * twenty-seven (block, state) pairs have no such property: Bedrock either folds two Java
 * properties into one state or packs several booleans into one number, so a word has nothing to
 * translate to. A caller that holds one of them keeps the Bedrock value it read.
 */
export const BLOCK_STATE_LOSSES = [
    {
        state: 'facing_direction',
        blocks: BEDROCK_BUTTONS,
        reason:
            "Bedrock's button facing is the direction the button sticks out of its support, which " +
            'Java spells as `face` and `facing` together: a floor button is 1 whichever way it faces.',
        reference: `${NOTE} section 2`
    },
    {
        state: 'huge_mushroom_bits',
        blocks: ['minecraft:brown_mushroom_block', 'minecraft:mushroom_stem', 'minecraft:red_mushroom_block'],
        ...PACKED_FACES
    },
    {
        state: 'multi_face_direction_bits',
        blocks: ['minecraft:glow_lichen', 'minecraft:resin_clump', 'minecraft:sculk_vein'],
        ...PACKED_FACES
    },
    { state: 'books_stored', blocks: ['minecraft:chiseled_bookshelf'], ...PACKED_FACES },
    { state: 'vine_direction_bits', blocks: ['minecraft:vine'], ...PACKED_FACES },
    {
        state: 'facing_direction',
        blocks: ['minecraft:jigsaw'],
        reason:
            "Java's twelve jigsaw orientations are a direction and a roll together; Bedrock keeps " +
            'the direction here and the roll in `rotation`, so neither reads back as an orientation.',
        reference: `${NOTE} section 2`
    },
    {
        state: 'rotation',
        blocks: ['minecraft:jigsaw'],
        reason: "The roll half of Java's jigsaw orientation; see this list's `facing_direction` entry.",
        reference: `${NOTE} section 2`
    },
    {
        state: 'lever_direction',
        blocks: ['minecraft:lever'],
        reason: "Java's `face` and `facing` together, the same fold as the button's.",
        reference: `${NOTE} section 2`
    },
    {
        state: 'open_bit',
        blocks: ['minecraft:lever'],
        reason:
            'A floor or ceiling lever has one Bedrock direction for two Java facings, and the ' +
            'GeyserMC join flips `open_bit` to keep south and east apart, so Java `powered` does ' +
            'not spell it on its own.',
        reference: `${NOTE} section 2`
    }
] as const satisfies readonly BlockStateLoss[];

/** A Bedrock identifier that several Java blocks legitimately collapse onto. */
export interface BlockMerge {
    /** The shared Bedrock identifier. */
    readonly bedrockId: string;
    readonly reason: string;
    readonly reference: string;
}

const WALL_VARIANT = {
    reason: 'Bedrock uses one block for the floor and wall variants; the placement travels in the block state.',
    reference: `${NOTE} section 2`
} as const;

const PLANT_BODY = {
    reason: "Bedrock uses one block where Java splits a plant into a head and a body ('_plant') block.",
    reference: `${NOTE} section 2`
} as const;

/**
 * Bedrock identifiers that receive more than one Java block. The round-trip
 * property test accepts a cross-block round trip only for these targets.
 */
export const BLOCK_MERGES = [
    { bedrockId: 'minecraft:acacia_hanging_sign', ...WALL_VARIANT },
    {
        bedrockId: 'minecraft:air',
        reason: "Java's air, cave_air and void_air are one Bedrock air.",
        reference: `${NOTE} section 2`
    },
    { bedrockId: 'minecraft:bamboo_hanging_sign', ...WALL_VARIANT },
    {
        bedrockId: 'minecraft:bed',
        reason: 'The 16 Java bed colors are one Bedrock bed; the color travels in block entity NBT.',
        reference: `${NOTE} section 2`
    },
    { bedrockId: 'minecraft:big_dripleaf', ...PLANT_BODY },
    { bedrockId: 'minecraft:birch_hanging_sign', ...WALL_VARIANT },
    {
        bedrockId: 'minecraft:cauldron',
        reason: "Java's empty, water, lava and powder snow cauldrons are one Bedrock cauldron with a liquid state.",
        reference: `${NOTE} section 2`
    },
    { bedrockId: 'minecraft:cave_vines', ...PLANT_BODY },
    { bedrockId: 'minecraft:cherry_hanging_sign', ...WALL_VARIANT },
    { bedrockId: 'minecraft:copper_torch', ...WALL_VARIANT },
    { bedrockId: 'minecraft:creeper_head', ...WALL_VARIANT },
    { bedrockId: 'minecraft:crimson_hanging_sign', ...WALL_VARIANT },
    { bedrockId: 'minecraft:dark_oak_hanging_sign', ...WALL_VARIANT },
    { bedrockId: 'minecraft:dragon_head', ...WALL_VARIANT },
    {
        bedrockId: 'minecraft:flower_pot',
        reason: 'The pot and all 39 potted plants are one Bedrock flower pot; the contents travel in block entity NBT.',
        reference: `${NOTE} section 2`
    },
    { bedrockId: 'minecraft:jungle_hanging_sign', ...WALL_VARIANT },
    { bedrockId: 'minecraft:kelp', ...PLANT_BODY },
    { bedrockId: 'minecraft:mangrove_hanging_sign', ...WALL_VARIANT },
    {
        bedrockId: 'minecraft:melon_stem',
        reason: "Java's attached stem is a Bedrock stem state, not a separate block.",
        reference: `${NOTE} section 2`
    },
    { bedrockId: 'minecraft:oak_hanging_sign', ...WALL_VARIANT },
    { bedrockId: 'minecraft:pale_oak_hanging_sign', ...WALL_VARIANT },
    { bedrockId: 'minecraft:piglin_head', ...WALL_VARIANT },
    { bedrockId: 'minecraft:player_head', ...WALL_VARIANT },
    { bedrockId: 'minecraft:poplar_hanging_sign', ...WALL_VARIANT },
    {
        bedrockId: 'minecraft:pumpkin_stem',
        reason: "Java's attached stem is a Bedrock stem state, not a separate block.",
        reference: `${NOTE} section 2`
    },
    { bedrockId: 'minecraft:redstone_torch', ...WALL_VARIANT },
    {
        bedrockId: 'minecraft:seagrass',
        reason: "Java's tall seagrass halves are Bedrock seagrass states.",
        reference: `${NOTE} section 2`
    },
    { bedrockId: 'minecraft:skeleton_skull', ...WALL_VARIANT },
    { bedrockId: 'minecraft:soul_torch', ...WALL_VARIANT },
    { bedrockId: 'minecraft:spruce_hanging_sign', ...WALL_VARIANT },
    {
        bedrockId: 'minecraft:standing_banner',
        reason: 'The 16 Java banner colors are one Bedrock banner; the color travels in block entity NBT.',
        reference: `${NOTE} section 2`
    },
    { bedrockId: 'minecraft:torch', ...WALL_VARIANT },
    { bedrockId: 'minecraft:twisting_vines', ...PLANT_BODY },
    {
        bedrockId: 'minecraft:unknown',
        reason: 'The two Java test blocks have no Bedrock concept; see BLOCK_LOSSES.',
        reference: `${NOTE} section 2`
    },
    {
        bedrockId: 'minecraft:unlit_redstone_torch',
        ...WALL_VARIANT
    },
    {
        bedrockId: 'minecraft:wall_banner',
        reason: 'The 16 Java wall banner colors are one Bedrock wall banner; the color travels in block entity NBT.',
        reference: `${NOTE} section 2`
    },
    { bedrockId: 'minecraft:warped_hanging_sign', ...WALL_VARIANT },
    { bedrockId: 'minecraft:weeping_vines', ...PLANT_BODY },
    { bedrockId: 'minecraft:wither_skeleton_skull', ...WALL_VARIANT },
    { bedrockId: 'minecraft:zombie_head', ...WALL_VARIANT }
] as const satisfies readonly BlockMerge[];

/** A Java block with no Bedrock concept at all. */
export interface BlockLoss {
    /** The Java block identifier. */
    readonly javaId: string;
    /** The Bedrock identifier every state falls back to. */
    readonly bedrockFallback: string;
    readonly reason: string;
    readonly reference: string;
}

/**
 * The Java blocks with no Bedrock representation. All five of their states
 * map to `minecraft:unknown`, and a lookup reports the loss.
 */
export const BLOCK_LOSSES = [
    {
        javaId: 'minecraft:test_block',
        bedrockFallback: 'minecraft:unknown',
        reason: 'Test blocks do not exist on Bedrock.',
        reference: `${NOTE} section 2; GeyserMC/Geyser#6164`
    },
    {
        javaId: 'minecraft:test_instance_block',
        bedrockFallback: 'minecraft:unknown',
        reason: 'Test instance blocks do not exist on Bedrock.',
        reference: `${NOTE} section 2; GeyserMC/Geyser#6164`
    }
] as const satisfies readonly BlockLoss[];

/** A Java item whose identity does not survive the mapping. */
export interface ItemLoss {
    /** The Java item identifier. */
    readonly javaId: string;
    /** The Bedrock identifier the item falls back to. */
    readonly bedrockFallback: string;
    readonly reason: string;
    readonly reference: string;
}

/**
 * The genuinely lossy item merges: a Bedrock player sees the fallback item
 * with none of the Java item's identity.
 */
export const ITEM_LOSSES = [
    {
        javaId: 'minecraft:spectral_arrow',
        bedrockFallback: 'minecraft:arrow',
        reason: 'Bedrock has no spectral arrow; it becomes a plain arrow.',
        reference: `${NOTE} section 3`
    },
    {
        javaId: 'minecraft:debug_stick',
        bedrockFallback: 'minecraft:stick',
        reason: 'Bedrock has no debug stick; it becomes a plain stick.',
        reference: `${NOTE} section 3`
    },
    {
        javaId: 'minecraft:knowledge_book',
        bedrockFallback: 'minecraft:book',
        reason: 'Bedrock has no knowledge book; it becomes a plain book.',
        reference: `${NOTE} section 3`
    },
    {
        javaId: 'minecraft:furnace_minecart',
        bedrockFallback: 'minecraft:hopper_minecart',
        reason: 'Bedrock has no furnace minecart item.',
        reference: `${NOTE} section 3`
    },
    {
        javaId: 'minecraft:test_block',
        bedrockFallback: 'minecraft:unknown',
        reason: 'Test blocks do not exist on Bedrock.',
        reference: `${NOTE} section 3; GeyserMC/Geyser#6164`
    },
    {
        javaId: 'minecraft:test_instance_block',
        bedrockFallback: 'minecraft:unknown',
        reason: 'Test instance blocks do not exist on Bedrock.',
        reference: `${NOTE} section 3; GeyserMC/Geyser#6164`
    }
] as const satisfies readonly ItemLoss[];

/** A Bedrock item identifier several Java items share. */
export interface ItemMerge {
    /** The shared Bedrock identifier. */
    readonly bedrockId: string;
    /** How the merged Java identity is recovered, when it is. */
    readonly recovery: string;
    readonly reference: string;
}

/**
 * Bedrock item identifiers that receive more than one Java item. The
 * round-trip property test accepts a non-identity round trip only for these.
 */
export const ITEM_MERGES = [
    {
        bedrockId: 'minecraft:arrow',
        recovery: 'Tipped arrows recover from potion NBT; spectral arrows do not recover.',
        reference: `${NOTE} section 3`
    },
    { bedrockId: 'minecraft:banner', recovery: 'The color recovers from Bedrock NBT.', reference: `${NOTE} section 3` },
    { bedrockId: 'minecraft:bed', recovery: 'The color recovers from Bedrock NBT.', reference: `${NOTE} section 3` },
    { bedrockId: 'minecraft:book', recovery: 'The knowledge book does not recover.', reference: `${NOTE} section 3` },
    {
        bedrockId: 'minecraft:filled_map',
        recovery: 'The 16 structure locator maps recover from map NBT.',
        reference: `${NOTE} section 3`
    },
    {
        bedrockId: 'minecraft:hopper_minecart',
        recovery: 'The furnace minecart does not recover.',
        reference: `${NOTE} section 3`
    },
    { bedrockId: 'minecraft:stick', recovery: 'The debug stick does not recover.', reference: `${NOTE} section 3` },
    {
        bedrockId: 'minecraft:unknown',
        recovery: 'The two test block items do not recover.',
        reference: `${NOTE} section 3`
    }
] as const satisfies readonly ItemMerge[];

/** How a Java entity type fails to reach Bedrock as itself. */
export type EntityLossKind =
    /** Shown to the Bedrock client as a different entity. */
    | 'rerender'
    /** No Bedrock representation at all. */
    | 'unrepresentable'
    /** Bedrock models it as a block, not an entity. */
    | 'block';

/** A Java entity type that cannot reach the Bedrock client as itself. */
export interface EntityLoss {
    /** The Java entity type identifier. */
    readonly javaId: string;
    readonly kind: EntityLossKind;
    /** The Bedrock entity (or block) shown instead, when one exists. */
    readonly bedrockFallback?: string;
    readonly reason: string;
    readonly reference: string;
}

/**
 * The Java entity types without a Bedrock entity of their own against the
 * pinned 1.26.51 identifier list. The research note counts ten re-renders
 * against Geyser's 1.26.50 data; three of those resolve here instead:
 * `evoker` maps to its real Bedrock name `evocation_illager`, and
 * `lingering_potion` and `trader_llama` exist in the 1.26.51 identifier
 * list under their own names.
 */
export const ENTITY_LOSSES = [
    {
        javaId: 'minecraft:text_display',
        kind: 'rerender',
        bedrockFallback: 'minecraft:armor_stand',
        reason: 'Bedrock has no display entities; Geyser shows text displays as armor stands.',
        reference: `${NOTE} section 4; GeyserMC/Geyser#3810`
    },
    {
        javaId: 'minecraft:interaction',
        kind: 'rerender',
        bedrockFallback: 'minecraft:armor_stand',
        reason: 'Bedrock has no interaction entity.',
        reference: `${NOTE} section 4`
    },
    {
        javaId: 'minecraft:spectral_arrow',
        kind: 'rerender',
        bedrockFallback: 'minecraft:arrow',
        reason: 'Bedrock has no spectral arrow entity.',
        reference: `${NOTE} section 4`
    },
    {
        javaId: 'minecraft:furnace_minecart',
        kind: 'rerender',
        bedrockFallback: 'minecraft:minecart',
        reason: 'Bedrock has no furnace minecart.',
        reference: `${NOTE} section 4`
    },
    {
        javaId: 'minecraft:spawner_minecart',
        kind: 'rerender',
        bedrockFallback: 'minecraft:minecart',
        reason: 'Bedrock has no spawner minecart.',
        reference: `${NOTE} section 4`
    },
    {
        javaId: 'minecraft:giant',
        kind: 'rerender',
        bedrockFallback: 'minecraft:zombie',
        reason: 'Bedrock has no giant; it is shown as a zombie.',
        reference: `${NOTE} section 4`
    },
    {
        javaId: 'minecraft:illusioner',
        kind: 'rerender',
        bedrockFallback: 'minecraft:evocation_illager',
        reason: 'Bedrock has no illusioner; it is shown as an evoker.',
        reference: `${NOTE} section 4`
    },
    {
        javaId: 'minecraft:block_display',
        kind: 'unrepresentable',
        reason: 'Bedrock has no display entities and no stand-in renders a block.',
        reference: `${NOTE} section 4; GeyserMC/Geyser#3810`
    },
    {
        javaId: 'minecraft:item_display',
        kind: 'unrepresentable',
        reason: 'Bedrock has no display entities and no stand-in renders an item.',
        reference: `${NOTE} section 4; GeyserMC/Geyser#3810`
    },
    {
        javaId: 'minecraft:marker',
        kind: 'unrepresentable',
        reason: 'Markers render in neither edition and are only sent inside non-vanilla entity type tags.',
        reference: `${NOTE} section 4`
    },
    {
        javaId: 'minecraft:mannequin',
        kind: 'unrepresentable',
        reason: 'Java 26.3 added the mannequin and the pinned Bedrock identifier list has no counterpart; listed rather than guessed.',
        reference: 'reports/registries.json (Java 26.3) against entity_identifiers (BDS 1.26.51.1)'
    },
    {
        javaId: 'minecraft:item_frame',
        kind: 'block',
        bedrockFallback: 'minecraft:frame',
        reason: 'Item frames are entities on Java and blocks on Bedrock.',
        reference: `${NOTE} section 2`
    },
    {
        javaId: 'minecraft:glow_item_frame',
        kind: 'block',
        bedrockFallback: 'minecraft:glow_frame',
        reason: 'Glow item frames are entities on Java and blocks on Bedrock.',
        reference: `${NOTE} section 2`
    }
] as const satisfies readonly EntityLoss[];

/** A Bedrock entity identifier several Java entity types share. */
export interface EntityMerge {
    /** The shared Bedrock identifier. */
    readonly bedrockId: string;
    /** How the merged Java identity is recovered. */
    readonly recovery: string;
    readonly reference: string;
}

/**
 * Bedrock entity identifiers that receive more than one Java entity type.
 * The round-trip property test accepts a non-identity round trip only for
 * these.
 */
export const ENTITY_MERGES = [
    {
        bedrockId: 'minecraft:boat',
        recovery: "Java's eleven wooden boats and rafts are one Bedrock boat; the wood travels as a variant.",
        reference: `${NOTE} section 4`
    },
    {
        bedrockId: 'minecraft:chest_boat',
        recovery:
            "Java's eleven wooden chest boats and rafts are one Bedrock chest boat; the wood travels as a variant.",
        reference: `${NOTE} section 4`
    }
] as const satisfies readonly EntityMerge[];

/** A Java registry entry whose identity does not survive the mapping. */
export interface RegistryLoss {
    /** The registry the entry belongs to. */
    readonly registry: 'biome' | 'enchantment';
    /** The Java identifier. */
    readonly javaId: string;
    /** The Bedrock identifier the entry falls back to, when one exists. */
    readonly bedrockFallback?: string;
    readonly reason: string;
    readonly reference: string;
}

const END_BIOME = {
    registry: 'biome',
    bedrockFallback: 'minecraft:the_end',
    reason: "Bedrock's single End biome (id 9) serves all five Java End biomes.",
    reference: `${NOTE} section 6`
} as const;

/**
 * The reviewed losses in the remaining registries: the biome merges onto
 * Bedrock's shared ids, and the one vanilla enchantment with no Bedrock id.
 */
export const REGISTRY_LOSSES = [
    {
        registry: 'biome',
        javaId: 'minecraft:the_void',
        bedrockFallback: 'minecraft:river',
        reason: 'Bedrock has no void biome; Geyser maps it onto biome id 7, which is the river.',
        reference: `${NOTE} section 6`
    },
    { javaId: 'minecraft:end_barrens', ...END_BIOME },
    { javaId: 'minecraft:end_highlands', ...END_BIOME },
    { javaId: 'minecraft:end_midlands', ...END_BIOME },
    { javaId: 'minecraft:small_end_islands', ...END_BIOME },
    {
        registry: 'enchantment',
        javaId: 'minecraft:sweeping_edge',
        reason: 'The only vanilla Java enchantment with no Bedrock id; Geyser renders it as lore text with a glint.',
        reference: `${NOTE} section 3; GeyserMC/Geyser#3121`
    }
] as const satisfies readonly RegistryLoss[];

/** A Bedrock biome the inverse direction cannot name in Java. */
export interface BedrockBiomeLoss {
    /** The Bedrock biome identifier. */
    readonly bedrockId: string;
    readonly reason: string;
    readonly reference: string;
}

const LEGACY_TERRAIN_VARIANT = {
    reason:
        'A pre-1.18 terrain variant. Java 1.18 replaced the hills, shore, edge, mountain and ' +
        'plateau biomes with continuous terrain, so Java 26.3 has no identifier for it; Bedrock ' +
        'keeps the id for worlds generated before the change.',
    reference: `${NOTE} section 6`
} as const;

const LEGACY_MUTATED_VARIANT = {
    reason:
        "A pre-1.18 'mutated' terrain variant. Java 1.18 removed the mutated biomes along with " +
        'the rest of the old biome grid, so Java 26.3 has no identifier for it; Bedrock keeps ' +
        'the id for worlds generated before the change.',
    reference: `${NOTE} section 6`
} as const;

/**
 * The Bedrock biomes {@link import('./registryMapping').bedrockBiomeToJava} cannot name in
 * Java: 27 of the 89 the pinned Bedrock data lists, none of which any of Java 26.3's 67 biome
 * documents reaches.
 *
 * They are all legacy terrain, kept so an old Bedrock world still reads back. A chunk only
 * carries one if it was generated by a Bedrock version older than the 1.18 terrain change, so
 * the inverse reports the loss rather than guessing which modern Java biome stands in for a
 * biome Java deleted.
 */
export const BEDROCK_BIOME_LOSSES = [
    { bedrockId: 'minecraft:bamboo_jungle_hills', ...LEGACY_TERRAIN_VARIANT },
    { bedrockId: 'minecraft:birch_forest_hills', ...LEGACY_TERRAIN_VARIANT },
    { bedrockId: 'minecraft:birch_forest_hills_mutated', ...LEGACY_MUTATED_VARIANT },
    { bedrockId: 'minecraft:cold_taiga_hills', ...LEGACY_TERRAIN_VARIANT },
    { bedrockId: 'minecraft:cold_taiga_mutated', ...LEGACY_MUTATED_VARIANT },
    {
        bedrockId: 'minecraft:deep_warm_ocean',
        reason:
            'The deep warm ocean never generated in either edition - Java removed it in 1.18 and ' +
            'Bedrock leaves the id unreachable - so there is no Java biome to name it with.',
        reference: `${NOTE} section 6`
    },
    { bedrockId: 'minecraft:desert_hills', ...LEGACY_TERRAIN_VARIANT },
    { bedrockId: 'minecraft:desert_mutated', ...LEGACY_MUTATED_VARIANT },
    { bedrockId: 'minecraft:extreme_hills_edge', ...LEGACY_TERRAIN_VARIANT },
    { bedrockId: 'minecraft:extreme_hills_plus_trees_mutated', ...LEGACY_MUTATED_VARIANT },
    { bedrockId: 'minecraft:forest_hills', ...LEGACY_TERRAIN_VARIANT },
    { bedrockId: 'minecraft:ice_mountains', ...LEGACY_TERRAIN_VARIANT },
    { bedrockId: 'minecraft:jungle_edge_mutated', ...LEGACY_MUTATED_VARIANT },
    { bedrockId: 'minecraft:jungle_hills', ...LEGACY_TERRAIN_VARIANT },
    { bedrockId: 'minecraft:jungle_mutated', ...LEGACY_MUTATED_VARIANT },
    {
        bedrockId: 'minecraft:legacy_frozen_ocean',
        reason:
            "Bedrock's own pre-1.13 frozen ocean, kept so a world generated before the Update " +
            'Aquatic ocean split still reads back. Java never had a second frozen ocean.',
        reference: `${NOTE} section 6`
    },
    { bedrockId: 'minecraft:mega_taiga_hills', ...LEGACY_TERRAIN_VARIANT },
    { bedrockId: 'minecraft:mesa_plateau', ...LEGACY_TERRAIN_VARIANT },
    { bedrockId: 'minecraft:mesa_plateau_mutated', ...LEGACY_MUTATED_VARIANT },
    { bedrockId: 'minecraft:mesa_plateau_stone_mutated', ...LEGACY_MUTATED_VARIANT },
    { bedrockId: 'minecraft:mushroom_island_shore', ...LEGACY_TERRAIN_VARIANT },
    { bedrockId: 'minecraft:redwood_taiga_hills_mutated', ...LEGACY_MUTATED_VARIANT },
    { bedrockId: 'minecraft:roofed_forest_mutated', ...LEGACY_MUTATED_VARIANT },
    { bedrockId: 'minecraft:savanna_plateau_mutated', ...LEGACY_MUTATED_VARIANT },
    { bedrockId: 'minecraft:swampland_mutated', ...LEGACY_MUTATED_VARIANT },
    { bedrockId: 'minecraft:taiga_hills', ...LEGACY_TERRAIN_VARIANT },
    { bedrockId: 'minecraft:taiga_mutated', ...LEGACY_MUTATED_VARIANT }
] as const satisfies readonly BedrockBiomeLoss[];
