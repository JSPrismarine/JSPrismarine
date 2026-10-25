import { behaviorFor } from '@jsprismarine/blocks';

import { GameRules } from '../world/GameRuleManager';
import { WATER, liquidOf } from '../world/physics/BlockRules';
import type { World } from '../world/World';
import { DamageCause } from './DamageCause';

/**
 * What the world does to things standing in it.
 *
 * The rules only, with no entity in sight: which blocks break a fall, how far is free, how often
 * a burn hurts. They used to live inside `Player`, where they applied to exactly one kind of
 * entity - so a player drowned and burned and a zombie stood in lava indefinitely.
 *
 * Kept as constants and small functions rather than as a base class, because the two things that
 * need them could hardly be less alike: a player's fall is *reported* by their own client and has
 * to be added up from position packets, while a mob's is simulated here and falls out of its
 * velocity. Only the rules are shared; the bookkeeping cannot be.
 */

/**
 * The blocks that soften a landing by themselves, rather than by being a liquid or something to
 * climb.
 *
 * Java decides this by overriding `Block.fallOn` and publishes no list, so these are written out.
 * Honey and slime cancel the fall outright, a bale of hay and a bed take most of it, and a cobweb
 * and a bush stop the entity before it lands at all; all of them read as a free landing here,
 * which is the distinction `FALL_GRACE` is too coarse to make anyway.
 */
const FALL_BREAKERS: ReadonlySet<string> = new Set([
    'minecraft:slime',
    'minecraft:honey_block',
    'minecraft:hay_block',
    'minecraft:powder_snow',
    'minecraft:bed',
    // `minecraft:cobweb` was listed here and is not a palette name, so nothing ever matched it.
    'minecraft:web',
    'minecraft:sweet_berry_bush'
]);

/**
 * Whether landing in or on a block costs nothing.
 *
 * Three groups rather than one list. Any liquid, which is what makes a bucket of water at the
 * bottom of a drop the standard way down. Anything in the climbing family, which
 * `@jsprismarine/blocks` assigns across the whole palette - the ladders, vines, scaffolding,
 * chains and lichens, where the old list named three of the eleven. And {@link FALL_BREAKERS},
 * the blocks Java softens a landing with in code.
 * @param {string} name - The block's state name.
 * @returns {boolean} Whether a fall into it is free.
 */
export const breaksAFall = (name: string): boolean =>
    liquidOf(name) !== null || behaviorFor(name) === 'jsprismarine:climbing' || FALL_BREAKERS.has(name);

/**
 * Blocks of falling anything gets for free.
 *
 * Vanilla's three: a one block step costs nothing, and neither does a jump from a two block ledge.
 * Above that it is one half-heart per further block.
 */
export const FALL_GRACE = 3;

/**
 * Whether a block is water, still or flowing.
 *
 * What counts as being underwater. Lava burns rather than drowns, so it answers false for it.
 * @param {string} name - The block's state name.
 * @returns {boolean} Whether something standing in it would be holding its breath.
 */
export const isUnderwater = (name: string): boolean => liquidOf(name) === WATER;

/** How often standing in something harmful hurts, in ticks. */
export const HAZARD_INTERVAL = 10;

/** Half-hearts each hazard is worth per {@link HAZARD_INTERVAL}. */
export const HAZARD_DAMAGE: Readonly<Record<string, number>> = {
    [DamageCause.Lava]: 4,
    [DamageCause.Fire]: 1,
    [DamageCause.Contact]: 1
};

/**
 * How long something keeps burning after it stops standing in the fire, in ticks.
 *
 * Vanilla's eight seconds. It is what makes walking through a fire worse than walking past one,
 * and what makes water worth running to.
 */
export const BURN_TICKS = 160;

/** Half-hearts a tick of suffocation costs, and how often - vanilla charges it every tick. */
export const SUFFOCATION_DAMAGE = 1;
export const SUFFOCATION_INTERVAL = 10;

/** The void: how far below the world's floor is fatal, and what it costs. */
export const VOID_DEPTH = 64;
export const VOID_DAMAGE = 4;
export const VOID_INTERVAL = 10;

/** Half-hearts lost per second once the breath runs out, as in vanilla. */
export const DROWNING_DAMAGE = 2;
export const DROWNING_INTERVAL = 20;

/**
 * How long something can hold its breath, in ticks.
 *
 * Fifteen seconds, the same as a player's. Kept here rather than read from the metadata because a
 * mob has no air bar to show anybody - only the moment it runs out matters.
 */
export const BREATH_TICKS = 300;

/**
 * Which gamerule governs a kind of damage, where one does.
 *
 * These have been registered and defaulted since long before anything read them. A cause absent
 * from here is one no gamerule turns off - a cactus is a cactus whatever the world is set to.
 */
const GOVERNED_BY: Readonly<Partial<Record<DamageCause, string>>> = {
    [DamageCause.Fall]: GameRules.FallDamage,
    [DamageCause.Fire]: GameRules.FireDamage,
    [DamageCause.Lava]: GameRules.FireDamage,
    [DamageCause.Drowning]: GameRules.DrowningDamage
};

/**
 * Whether the world is set to allow this kind of damage at all.
 * @param {World} world - Where it is happening.
 * @param {DamageCause} cause - What kind of damage.
 * @returns {boolean} `true` if it should be applied.
 */
export const isAllowed = (world: World, cause: DamageCause): boolean => {
    const rule = GOVERNED_BY[cause];
    if (!rule) return true;

    const [enabled] = world.getGameRuleManager()?.getGameRule(rule) ?? [true];
    return Boolean(enabled);
};
