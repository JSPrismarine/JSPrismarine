/**
 * What each kind of mob is made of: how much it can take, and how hard it hits.
 *
 * A table for the same reason `EntitySize` is one. Every mob shares one `Mob` class and differs
 * only in what it is built from, so the alternative is an override of `getDefaultAttributes` in
 * each of a hundred four-line files - which is a hundred places for a number to be wrong and no
 * single place to read the game's own figures against.
 *
 * Until this existed every mob had the base defaults, so a chicken and an iron golem both had
 * twenty health and one point of attack, and a bat took as long to kill as a wither.
 *
 * The values are Bedrock's, from the `minecraft:health`, `minecraft:attack` and
 * `minecraft:knockback_resistance` components of the vanilla behaviour packs - the same source
 * `EntitySize` and `ai/Speed` are read from.
 * @see https://github.com/Mojang/bedrock-samples/tree/main/behavior_pack/entities
 *
 * **Speed is deliberately not here.** A mob's pace is `ai/Speed` and `Mob.walkSpeed`, which is
 * what the server actually walks it at; the `minecraft:movement` attribute is only what the
 * client is told. Writing a second number here would let the two disagree, which is exactly the
 * failure `EntitySize` was written to end.
 */

/** Everything about a mob that is a number the damage system reads. */
export interface MobStats {
    /** Maximum health, in half-hearts. Twenty is ten hearts, a player's worth. */
    readonly health: number;

    /**
     * Half-hearts a plain melee hit is worth, at normal difficulty.
     *
     * Zero for anything that does not attack, and for the ones whose weapon is not a punch -
     * a creeper's blast and a skeleton's bow are not this number.
     */
    readonly attackDamage: number;

    /** Nought to one, where one is not shoved by anything. Only golems and ravagers have any. */
    readonly knockbackResistance: number;

    /** How far the mob notices things, in blocks. */
    readonly followRange: number;

    /**
     * Whether it breathes water rather than air.
     *
     * Stated rather than inferred. The obvious proxy - a swim speed higher than a walk speed -
     * reads correctly in vanilla and not here, because every mob currently gets the same movement
     * attributes, so it would have said "no" for every fish in the game and drowned the lot of
     * them. Dolphins and turtles are deliberately *not* aquatic: they breathe air and drown.
     */
    readonly aquatic: boolean;

    /**
     * Whether the morning kills it.
     *
     * The undead, and not all of them: a husk's whole point is that it is the zombie that survives
     * the desert sun, and a wither skeleton comes from a dimension that has no sky. Stated per
     * species rather than guessed from the name, because "is it undead" and "does it burn" are
     * different questions with different answers.
     */
    readonly burnsInDaylight: boolean;
}

/**
 * What a mob is if the table does not name it.
 *
 * Exactly the base attribute defaults, so an entity this server has no figures for behaves as
 * it did before the table existed rather than becoming accidentally weak or immortal.
 */
export const DEFAULT_STATS: MobStats = {
    health: 20,
    attackDamage: 1,
    knockbackResistance: 0,
    followRange: 16,
    aquatic: false,
    burnsInDaylight: false
};

/** Reads as the game states it: health, then attack, then the rare extras. */
const stats = (
    health: number,
    attackDamage = 0,
    {
        knockback = 0,
        follow = 16,
        aquatic = false,
        burns = false
    }: { knockback?: number; follow?: number; aquatic?: boolean; burns?: boolean } = {}
): MobStats => ({
    health,
    attackDamage,
    knockbackResistance: knockback,
    followRange: follow,
    aquatic,
    burnsInDaylight: burns
});

/**
 * Every mob this server can name, by the identifier the client knows it by.
 *
 * Attack values are the normal-difficulty ones; scaling them for easy and hard is the
 * difficulty system's job, not this table's.
 */
export const MOB_STATS: Readonly<Record<string, MobStats>> = {
    // Hostile.
    'minecraft:blaze': stats(20, 6),
    'minecraft:cave_spider': stats(12, 2),
    'minecraft:creeper': stats(20, 0),
    'minecraft:drowned': stats(20, 3, { burns: true }),
    'minecraft:elder_guardian': stats(80, 8, { aquatic: true }),
    'minecraft:ender_dragon': stats(200, 10, { knockback: 1, follow: 64 }),
    'minecraft:endermite': stats(8, 2),
    'minecraft:evocation_illager': stats(24, 0),
    'minecraft:ghast': stats(10, 0, { follow: 64 }),
    'minecraft:guardian': stats(30, 6, { aquatic: true }),
    'minecraft:hoglin': stats(40, 6),
    'minecraft:husk': stats(20, 3),
    'minecraft:magma_cube': stats(16, 3),
    'minecraft:phantom': stats(20, 2, { follow: 64, burns: true }),
    'minecraft:piglin': stats(16, 5),
    'minecraft:piglin_brute': stats(50, 13),
    'minecraft:pillager': stats(24, 0),
    'minecraft:ravager': stats(100, 12, { knockback: 0.75 }),
    'minecraft:shulker': stats(30, 4, { knockback: 1 }),
    'minecraft:silverfish': stats(8, 1),
    'minecraft:skeleton': stats(20, 0, { burns: true }),
    'minecraft:slime': stats(16, 2),
    'minecraft:spider': stats(16, 2),
    'minecraft:stray': stats(20, 0, { burns: true }),
    'minecraft:vex': stats(14, 9),
    'minecraft:vindicator': stats(24, 13),
    'minecraft:witch': stats(26, 0),
    'minecraft:wither': stats(600, 0, { knockback: 1, follow: 64 }),
    'minecraft:wither_skeleton': stats(20, 8),
    'minecraft:zoglin': stats(40, 6),
    'minecraft:zombie': stats(20, 3, { burns: true }),
    'minecraft:zombie_pigman': stats(20, 5),
    // Both spellings: `_v2` is the one the modern class carries and the client uses, and the bare
    // name is the pre-1.11 entity that worlds on disk still hold.
    'minecraft:zombie_villager': stats(20, 3, { burns: true }),
    'minecraft:zombie_villager_v2': stats(20, 3, { burns: true }),

    // Neutral, and the ones that fight on somebody's side.
    'minecraft:bee': stats(10, 2),
    'minecraft:dolphin': stats(10, 3),
    'minecraft:enderman': stats(40, 7),
    'minecraft:iron_golem': stats(100, 15, { knockback: 1 }),
    'minecraft:llama': stats(22, 1),
    'minecraft:panda': stats(20, 6),
    'minecraft:polar_bear': stats(30, 6),
    'minecraft:snow_golem': stats(4, 0),
    'minecraft:wolf': stats(8, 3),

    // Passive.
    'minecraft:bat': stats(6),
    'minecraft:cat': stats(10),
    'minecraft:chicken': stats(4),
    'minecraft:cod': stats(3, 0, { aquatic: true }),
    'minecraft:cow': stats(10),
    'minecraft:donkey': stats(22),
    'minecraft:fox': stats(20, 2),
    'minecraft:horse': stats(22),
    'minecraft:mooshroom': stats(10),
    'minecraft:mule': stats(22),
    'minecraft:ocelot': stats(10),
    'minecraft:parrot': stats(6),
    'minecraft:pig': stats(10),
    'minecraft:pufferfish': stats(3, 0, { aquatic: true }),
    'minecraft:rabbit': stats(3),
    'minecraft:salmon': stats(3, 0, { aquatic: true }),
    'minecraft:sheep': stats(8),
    'minecraft:skeleton_horse': stats(15),
    'minecraft:squid': stats(10, 0, { aquatic: true }),
    'minecraft:strider': stats(20),
    'minecraft:tropicalfish': stats(3, 0, { aquatic: true }),
    'minecraft:turtle': stats(30),
    'minecraft:villager': stats(20),
    'minecraft:villager_v2': stats(20),
    'minecraft:wandering_trader': stats(20),
    'minecraft:zombie_horse': stats(15),

    // Built rather than born, and killable all the same.
    'minecraft:armor_stand': stats(6),
    'minecraft:npc': stats(20)
};

/**
 * What a mob of this type is made of.
 * @param {string} type - The entity identifier, as `Entity.getType` reports it.
 * @returns {MobStats} Its figures, or {@link DEFAULT_STATS} for a type this server has none for.
 */
export const statsOf = (type: string): MobStats => MOB_STATS[type] ?? DEFAULT_STATS;

export default MOB_STATS;
