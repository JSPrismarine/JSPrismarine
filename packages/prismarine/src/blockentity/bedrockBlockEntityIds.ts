/**
 * Bedrock's block entity ids, and the two ways this server arrives at one.
 *
 * The `id` tag decides what a client does with a compound. Vanilla's spelling is `Sign`,
 * `MobSpawner`, `TrialSpawner`; anything else is skipped by the client and ignored by every
 * vanilla tool that reads a world. Two callers need that spelling and they start from different
 * names. A block a player places is known by its Bedrock block identifier, and a block entity a
 * structure template carries is known by Java's own block entity type. A third caller crosses
 * between them, for a block entity a structure processor made and left untyped.
 *
 * Both are tables rather than a rule, because neither edition publishes a mapping and the
 * spelling is irregular either way: Bedrock files six wood types of sign and two placements of
 * each under one `Sign`, calls a suspicious sand a `BrushableBlock`, an enchanting table an
 * `EnchantTable` and a piston a `PistonArm`. The ids themselves were read out of the pinned
 * Bedrock Dedicated Server binary, and the block identifiers out of the same pinned palette
 * `@jsprismarine/mapping` publishes, so neither column is a guess.
 *
 * A name with no row has no block entity in Bedrock at all. That is the honest answer for
 * Java's `potent_sulfur` and its two test blocks, and the callers each say what they do with it.
 */

/** The bare name of a namespaced identifier: `minecraft:chest` is `chest`. */
const bareName = (identifier: string): string => identifier.replace(/^[^:]*:/, '');

/**
 * Block identifiers that share one block entity id, matched on their ending.
 *
 * This is where the wood types, the dye colors and the copper weathering stages go, so the
 * table below stays the list of blocks rather than the list of their variants. Longest match
 * first is not needed: no two suffixes here end a name the same way.
 */
const BY_SUFFIX: readonly (readonly [suffix: string, id: string])[] = [
    ['_hanging_sign', 'HangingSign'],
    ['standing_sign', 'Sign'],
    ['wall_sign', 'Sign'],
    ['shulker_box', 'ShulkerBox'],
    ['copper_golem_statue', 'CopperGolemStatue'],
    ['copper_chest', 'Chest'],
    ['_head', 'Skull'],
    ['_skull', 'Skull'],
    ['_shelf', 'Shelf']
];

/** Bedrock block identifier to block entity id, by bare name. */
const BY_BLOCK: Readonly<Record<string, string>> = {
    barrel: 'Barrel',
    beacon: 'Beacon',
    bed: 'Bed',
    bee_nest: 'Beehive',
    beehive: 'Beehive',
    bell: 'Bell',
    blast_furnace: 'BlastFurnace',
    brewing_stand: 'BrewingStand',
    calibrated_sculk_sensor: 'CalibratedSculkSensor',
    campfire: 'Campfire',
    cauldron: 'Cauldron',
    chain_command_block: 'CommandBlock',
    chest: 'Chest',
    chiseled_bookshelf: 'ChiseledBookshelf',
    command_block: 'CommandBlock',
    conduit: 'Conduit',
    crafter: 'Crafter',
    creaking_heart: 'CreakingHeart',
    daylight_detector: 'DaylightDetector',
    daylight_detector_inverted: 'DaylightDetector',
    decorated_pot: 'DecoratedPot',
    dispenser: 'Dispenser',
    dropper: 'Dropper',
    enchanting_table: 'EnchantTable',
    end_gateway: 'EndGateway',
    end_portal: 'EndPortal',
    ender_chest: 'EnderChest',
    flower_pot: 'FlowerPot',
    furnace: 'Furnace',
    hopper: 'Hopper',
    jigsaw: 'JigsawBlock',
    jukebox: 'Jukebox',
    lectern: 'Lectern',
    lit_blast_furnace: 'BlastFurnace',
    lit_furnace: 'Furnace',
    lit_smoker: 'Smoker',
    mob_spawner: 'MobSpawner',
    moving_block: 'MovingBlock',
    piston: 'PistonArm',
    piston_arm_collision: 'PistonArm',
    powered_comparator: 'Comparator',
    repeating_command_block: 'CommandBlock',
    sculk_catalyst: 'SculkCatalyst',
    sculk_sensor: 'SculkSensor',
    sculk_shrieker: 'SculkShrieker',
    smoker: 'Smoker',
    soul_campfire: 'Campfire',
    standing_banner: 'Banner',
    sticky_piston: 'PistonArm',
    sticky_piston_arm_collision: 'PistonArm',
    straw_bed: 'Bed',
    structure_block: 'StructureBlock',
    suspicious_gravel: 'BrushableBlock',
    suspicious_sand: 'BrushableBlock',
    trapped_chest: 'Chest',
    trial_spawner: 'TrialSpawner',
    unpowered_comparator: 'Comparator',
    vault: 'Vault',
    wall_banner: 'Banner'
};

/**
 * Java block entity type to Bedrock block entity id, over the whole of Java 26.3's
 * `block_entity_type` registry.
 *
 * Complete on purpose. A structure template names the type rather than the block, so a type
 * with no row here is a block entity a generated structure drops, and the registry is the only
 * list of what a template can name.
 */
const BY_JAVA_TYPE: Readonly<Record<string, string>> = {
    'minecraft:banner': 'Banner',
    'minecraft:barrel': 'Barrel',
    'minecraft:beacon': 'Beacon',
    'minecraft:beehive': 'Beehive',
    'minecraft:bell': 'Bell',
    'minecraft:blast_furnace': 'BlastFurnace',
    'minecraft:brewing_stand': 'BrewingStand',
    'minecraft:brushable_block': 'BrushableBlock',
    'minecraft:calibrated_sculk_sensor': 'CalibratedSculkSensor',
    'minecraft:campfire': 'Campfire',
    'minecraft:chest': 'Chest',
    'minecraft:chiseled_bookshelf': 'ChiseledBookshelf',
    'minecraft:command_block': 'CommandBlock',
    'minecraft:comparator': 'Comparator',
    'minecraft:conduit': 'Conduit',
    'minecraft:copper_golem_statue': 'CopperGolemStatue',
    'minecraft:crafter': 'Crafter',
    'minecraft:creaking_heart': 'CreakingHeart',
    'minecraft:daylight_detector': 'DaylightDetector',
    'minecraft:decorated_pot': 'DecoratedPot',
    'minecraft:dispenser': 'Dispenser',
    'minecraft:dropper': 'Dropper',
    'minecraft:enchanting_table': 'EnchantTable',
    'minecraft:end_gateway': 'EndGateway',
    'minecraft:end_portal': 'EndPortal',
    'minecraft:ender_chest': 'EnderChest',
    'minecraft:furnace': 'Furnace',
    'minecraft:hanging_sign': 'HangingSign',
    'minecraft:hopper': 'Hopper',
    'minecraft:jigsaw': 'JigsawBlock',
    'minecraft:jukebox': 'Jukebox',
    'minecraft:lectern': 'Lectern',
    'minecraft:mob_spawner': 'MobSpawner',
    'minecraft:piston': 'PistonArm',
    'minecraft:sculk_catalyst': 'SculkCatalyst',
    'minecraft:sculk_sensor': 'SculkSensor',
    'minecraft:sculk_shrieker': 'SculkShrieker',
    'minecraft:shelf': 'Shelf',
    'minecraft:shulker_box': 'ShulkerBox',
    'minecraft:sign': 'Sign',
    'minecraft:skull': 'Skull',
    'minecraft:smoker': 'Smoker',
    'minecraft:structure_block': 'StructureBlock',
    'minecraft:trapped_chest': 'Chest',
    'minecraft:trial_spawner': 'TrialSpawner',
    'minecraft:vault': 'Vault'
};

/**
 * The block entity id Bedrock files a block's compound under.
 *
 * @param blockIdentifier - The Bedrock block identifier, namespaced or bare.
 * @returns The id, or undefined for a block Bedrock keeps no block entity on.
 */
export const bedrockBlockEntityIdOf = (blockIdentifier: string): string | undefined => {
    const name = bareName(blockIdentifier);
    const exact = BY_BLOCK[name];
    if (exact !== undefined) return exact;

    return BY_SUFFIX.find(([suffix]) => name.endsWith(suffix))?.[1];
};

/**
 * {@link BY_JAVA_TYPE} read backwards, so the two directions cannot drift apart.
 *
 * The inverse is not quite a function, because Bedrock files a trapped chest under the same
 * `Chest` as a plain one. The first row wins, and nothing downstream can tell, since every
 * caller turns the answer straight back into the Bedrock id both types share.
 */
const JAVA_TYPE_BY_ID: Readonly<Record<string, string>> = ((): Record<string, string> => {
    const types: Record<string, string> = {};
    for (const [javaType, id] of Object.entries(BY_JAVA_TYPE)) types[id] ??= javaType;
    return types;
})();

/**
 * Java entity types Bedrock keeps as a block with a block entity.
 *
 * An item frame is the one a generated structure meets: Java hangs an entity and Bedrock places
 * a `frame` block whose `ItemFrame` block entity holds the item. It is kept apart from
 * {@link BY_JAVA_TYPE} because it is not in Java's block entity registry, and the coverage check
 * over that table should stay a check against the registry.
 */
const BY_JAVA_ENTITY: Readonly<Record<string, string>> = {
    'minecraft:item_frame': 'ItemFrame'
};

/**
 * The block entity id Bedrock files a Java block entity type under.
 *
 * @param javaType - A `minecraft:block_entity_type` identifier, for example `minecraft:vault`,
 *   or the entity type of an item frame, which Bedrock keeps as a block entity.
 * @returns The id, or undefined for a type Bedrock has no counterpart for, which in Java 26.3
 *   is `potent_sulfur` and the two test blocks.
 */
export const bedrockBlockEntityIdForJavaType = (javaType: string): string | undefined =>
    BY_JAVA_TYPE[javaType] ?? BY_JAVA_ENTITY[javaType];

/**
 * The Java block entity type a block carries one of, for a compound that names none.
 *
 * A structure processor's `append_loot` gives a block a loot table and nothing else. Java needs
 * no more than that, because the block already has a block entity of its own and the rule only
 * adds the table to it. The type has to come from the block here for the same reason, and the
 * two tables above compose to answer it. The case that reaches a chunk is the suspicious gravel
 * a trail ruins rule turns gravel into.
 *
 * @param blockIdentifier - The Bedrock block identifier, namespaced or bare.
 * @returns The Java type, or undefined for a block one edition or the other keeps no block
 *   entity on, such as a bed or a flower pot.
 */
export const javaBlockEntityTypeForBedrockBlock = (blockIdentifier: string): string | undefined => {
    const id = bedrockBlockEntityIdOf(blockIdentifier);
    return id === undefined ? undefined : JAVA_TYPE_BY_ID[id];
};

/** Every Java block entity type this server has a Bedrock id for, for a coverage check. */
export const javaBlockEntityTypesWithBedrockIds = (): readonly string[] => Object.keys(BY_JAVA_TYPE);
