/**
 * How big each kind of entity is, in blocks.
 *
 * One table, used for two things that have to agree or neither works. The server collides mobs
 * against the world with these numbers, and the client is *told* these numbers so it draws the
 * hitbox in the same place. When they disagreed - every entity was announced as `0.6 x 1.8`, the
 * player's size, while the server treated every mob as a zero-width point - a sheep walked half
 * way into a wall before anything stopped it, because the only thing that had to clear the wall
 * was its centre.
 *
 * The values are Bedrock's own, read out of the `minecraft:collision_box` component of the vanilla
 * behaviour packs, which is the same source the movement constants in `ai/Speed` are taken from.
 * @see https://github.com/Mojang/bedrock-samples/tree/main/behavior_pack/entities
 *
 * Written out by hand rather than generated, because there is nowhere to generate it from:
 * `@jsprismarine/bedrock-data` is a submodule of pmmp's BedrockData, which carries the block and
 * item tables but not the entity ones. A test asserts that every registered entity appears here,
 * so the table cannot silently fall behind the classes.
 */

/** A box centred on the entity's position, extending upwards from its feet. */
export interface EntitySize {
    /** Blocks across, on both horizontal axes. The entity reaches half of this either side. */
    readonly width: number;

    /** Blocks tall, measured up from the feet - which is where an entity's position is. */
    readonly height: number;
}

/**
 * What an entity is if nobody has said.
 *
 * Mojang's documented default for `minecraft:collision_box`, and the right answer for the same
 * reason: an unknown entity is more usefully a block-sized obstacle than a point.
 * @see https://learn.microsoft.com/en-us/minecraft/creator/reference/content/entityreference/examples/entitycomponents/minecraftcomponent_collision_box
 */
export const DEFAULT_SIZE: EntitySize = { width: 1, height: 1 };

/** Entities that pass through everything, and that nothing collides with. */
const NO_COLLISION: EntitySize = { width: 0, height: 0 };

const size = (width: number, height: number): EntitySize => ({ width, height });

/**
 * Every entity this server can name, by the identifier the client knows it by.
 *
 * A handful of entries are not straight reads of a `collision_box`, and each is marked where it
 * sits. The rest are verbatim.
 */
export const ENTITY_SIZES: Readonly<Record<string, EntitySize>> = {
    // Mobs.
    'minecraft:bat': size(0.5, 0.9),
    'minecraft:bee': size(0.55, 0.5),
    'minecraft:blaze': size(0.5, 1.8),
    'minecraft:cat': size(0.6, 0.7),
    'minecraft:cave_spider': size(0.7, 0.5),
    'minecraft:chicken': size(0.6, 0.8),
    'minecraft:cod': size(0.6, 0.3),
    'minecraft:cow': size(0.9, 1.3),
    'minecraft:creeper': size(0.6, 1.8),
    'minecraft:dolphin': size(0.9, 0.6),
    'minecraft:donkey': size(1.4, 1.6),
    'minecraft:drowned': size(0.6, 1.9),
    'minecraft:elder_guardian': size(1.99, 1.99),
    'minecraft:ender_dragon': size(13, 4),
    'minecraft:enderman': size(0.6, 2.9),
    'minecraft:endermite': size(0.4, 0.3),
    'minecraft:evoker_illager': size(0.6, 1.9),
    'minecraft:fox': size(0.6, 0.7),
    'minecraft:ghast': size(4.02, 4),
    'minecraft:guardian': size(0.85, 0.85),
    // Hoglin and zoglin carry a placeholder `0.6 x 1.9` in their base components; the size they
    // are actually built with lives in their `*_adult` component group.
    'minecraft:hoglin': size(1.4, 1.4),
    'minecraft:horse': size(1.4, 1.6),
    'minecraft:husk': size(0.6, 1.9),
    'minecraft:iron_golem': size(1.4, 2.9),
    'minecraft:llama': size(0.9, 1.87),
    // Slimes and magma cubes come in three sizes; this server does not model the size, so they get
    // the largest, which is the one the vanilla file's base components describe.
    'minecraft:magma_cube': size(2.08, 2.08),
    'minecraft:mooshroom': size(0.9, 1.3),
    'minecraft:mule': size(1.4, 1.6),
    'minecraft:npc': size(0.6, 2.1),
    'minecraft:ocelot': size(0.6, 0.7),
    'minecraft:panda': size(1.3, 1.25),
    'minecraft:parrot': size(0.5, 1),
    'minecraft:phantom': size(0.9, 0.5),
    'minecraft:pig': size(0.9, 0.9),
    'minecraft:piglin': size(0.6, 1.9),
    'minecraft:piglin_brute': size(0.6, 1.9),
    'minecraft:pillager': size(0.6, 1.9),
    'minecraft:player': size(0.6, 1.8),
    'minecraft:polar_bear': size(1.4, 1.4),
    'minecraft:pufferfish': size(0.8, 0.8),
    // The rabbit's box is `0.81666 x 1` scaled by a `minecraft:scale` of 0.6, which is how it
    // arrives at the 0.49 x 0.6 the client draws. Everything else here has a scale of one.
    'minecraft:rabbit': size(0.49, 0.6),
    'minecraft:ravager': size(1.95, 2.2),
    'minecraft:salmon': size(0.5, 0.5),
    'minecraft:sheep': size(0.9, 1.3),
    'minecraft:shulker': size(1, 1),
    'minecraft:silverfish': size(0.4, 0.3),
    'minecraft:skeleton': size(0.6, 1.9),
    'minecraft:skeleton_horse': size(1.4, 1.6),
    'minecraft:slime': size(2.08, 2.08),
    'minecraft:snow_golem': size(0.4, 1.8),
    'minecraft:spider': size(1.4, 0.9),
    'minecraft:squid': size(0.8, 0.8),
    'minecraft:stray': size(0.6, 1.9),
    'minecraft:strider': size(0.9, 1.7),
    'minecraft:tropicalfish': size(0.4, 0.4),
    'minecraft:turtle': size(1.2, 0.4),
    'minecraft:vex': size(0.4, 0.8),
    'minecraft:villager': size(0.6, 1.9),
    'minecraft:villager_v2': size(0.6, 1.9),
    'minecraft:vindicator': size(0.6, 1.9),
    'minecraft:wandering_trader': size(0.6, 1.9),
    'minecraft:witch': size(0.6, 1.9),
    'minecraft:wither': size(1, 3),
    'minecraft:wither_skeleton': size(0.72, 2.01),
    'minecraft:wolf': size(0.6, 0.8),
    'minecraft:zoglin': size(1.4, 1.4),
    'minecraft:zombie': size(0.6, 1.9),
    'minecraft:zombie_horse': size(1.4, 1.6),
    'minecraft:zombie_pigman': size(0.6, 1.9),
    'minecraft:zombie_villager': size(0.6, 1.9),
    'minecraft:zombie_villager_v2': size(0.6, 1.9),

    // Projectiles and other things in flight.
    'minecraft:arrow': size(0.25, 0.25),
    'minecraft:dragon_fireball': size(0.31, 0.31),
    'minecraft:egg': size(0.25, 0.25),
    'minecraft:ender_pearl': size(0.25, 0.25),
    'minecraft:eye_of_ender_signal': size(0.25, 0.25),
    'minecraft:fireball': size(1, 1),
    'minecraft:fireworks_rocket': size(0.25, 0.25),
    'minecraft:fishing_hook': size(0.15, 0.15),
    'minecraft:lingering_potion': size(0.25, 0.25),
    'minecraft:llama_spit': size(0.31, 0.31),
    'minecraft:shulker_bullet': size(0.625, 0.625),
    'minecraft:small_fireball': size(0.31, 0.31),
    'minecraft:snowball': size(0.25, 0.25),
    'minecraft:splash_potion': size(0.25, 0.25),
    'minecraft:thrown_trident': size(0.25, 0.35),
    'minecraft:wither_skull': size(0.15, 0.15),
    'minecraft:wither_skull_dangerous': size(0.15, 0.15),
    'minecraft:xp_bottle': size(0.25, 0.25),

    // Vehicles.
    'minecraft:boat': size(1.4, 0.455),
    'minecraft:chest_minecart': size(0.98, 0.7),
    'minecraft:command_block_minecart': size(0.98, 0.7),
    'minecraft:hopper_minecart': size(0.98, 0.7),
    'minecraft:minecart': size(0.98, 0.7),
    'minecraft:tnt_minecart': size(0.98, 0.7),

    // Objects and the rest. The ones with no behaviour pack of their own take Java's numbers,
    // which for these is the same box either edition draws.
    'minecraft:area_effect_cloud': size(1, 0.5),
    'minecraft:armor_stand': size(0.5, 1.975),
    'minecraft:ender_crystal': size(2, 2),
    'minecraft:evocation_fang': size(0.5, 0.8),
    'minecraft:falling_block': size(0.98, 0.98),
    'minecraft:item': size(0.25, 0.25),
    'minecraft:leash_knot': size(0.375, 0.5),
    'minecraft:tnt': size(0.98, 0.98),
    'minecraft:tripod_camera': size(0.75, 1.8),
    'minecraft:xp_orb': size(0.25, 0.25),

    // Nothing collides with these and they collide with nothing: they are drawn, not occupied.
    'minecraft:frame': NO_COLLISION,
    'minecraft:lightning_bolt': NO_COLLISION,
    'minecraft:painting': NO_COLLISION,

    // This server models a few entities vanilla has no behaviour pack for - the Education Edition
    // ones and its own internals. A block-sized box is the honest answer rather than a guess.
    'minecraft:balloon': DEFAULT_SIZE,
    'minecraft:chalkboard': DEFAULT_SIZE,
    'minecraft:elder_guardian_ghost': size(1.99, 1.99),
    'minecraft:ice_bomb': DEFAULT_SIZE,
    'minecraft:moving_block': DEFAULT_SIZE,
    'minecraft:shield': DEFAULT_SIZE
};

/**
 * How big an entity of this type is.
 * @param {string} type - The entity identifier, as `Entity.getType` reports it.
 * @returns {EntitySize} Its box, or {@link DEFAULT_SIZE} for a type this server does not model.
 */
export const sizeOf = (type: string): EntitySize => ENTITY_SIZES[type] ?? DEFAULT_SIZE;

export default ENTITY_SIZES;
