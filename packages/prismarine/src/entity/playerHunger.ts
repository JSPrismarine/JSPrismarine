/**
 * Hunger: exhaustion, saturation and food, and the four-second clock that starves an empty player
 * and heals a well-fed one. One home for both models of a player (see `survivalPlayer.ts`).
 */
import type { Difficulty } from '@jsprismarine/engine-systems';

import type { PlayerComponents } from './playerComponents';
import type { SurvivalPlayer } from './survivalPlayer';

/**
 * How much exhaustion buys one point of saturation, and then of food: Java's `FoodData.tick` spends
 * this much once the counter is above it.
 *
 * @javaSource FoodData.tick
 */
const EXHAUSTION_PER_FOOD_POINT = 4;

/**
 * The most exhaustion the counter holds, Java's `FoodData.addExhaustion` cap.
 *
 * @javaSource FoodData.addExhaustion
 */
export const EXHAUSTION_CAP = 40;

/**
 * What the things a player does cost in exhaustion, from the vanilla hunger table.
 * @see https://minecraft.wiki/w/Hunger#Exhaustion_level_increase
 */
export const EXHAUSTION = {
    /** Per meter walked. */
    walking: 0.01,
    /** Per meter sprinted - ten times the cost of walking it. */
    sprinting: 0.1,
    /** Per jump. */
    jumping: 0.05,
    /** Per jump made while sprinting. */
    sprintJumping: 0.2,
    /** Per swing that connects. A miss is free, which is why it is charged after the fact. */
    attacking: 0.1,
    /** Per half-heart healed by being well fed. */
    regeneration: 6
} as const;

/** Hunger's slower effects - starving and healing - run on a four-second clock. */
export const VITALS_INTERVAL = 80;

/** Exhaustion per level, per tick, while the hunger effect is on. */
const HUNGER_EFFECT_EXHAUSTION = 0.005;

/** Food at or above this heals the player, at the cost of {@link EXHAUSTION.regeneration}. */
const REGENERATION_FOOD_LEVEL = 18;

/** Half-hearts lost per {@link VITALS_INTERVAL} with an empty food bar. */
const STARVATION_DAMAGE = 1;

/** Half-hearts a well-fed player heals per {@link VITALS_INTERVAL}. */
const REGENERATION_HEALTH = 1;

/**
 * How often a full, saturated food bar heals, Java's `FoodData.tick`.
 *
 * @javaSource FoodData.tick
 */
const SATURATED_REGENERATION_INTERVAL = 10;

/**
 * The most saturation one fast heal spends; it heals a sixth of it, so a heal is at most one
 * half-heart, `Math.min(saturationLevel, 6.0F)` in Java's `FoodData.tick`.
 *
 * @javaSource FoodData.tick
 */
const SATURATED_REGENERATION_CAP = 6;

/**
 * The most food a player holds, Java's `FoodData.needsFood` bound.
 *
 * @javaSource FoodData.needsFood
 */
const MAX_FOOD = 20;

/**
 * How often Peaceful heals a player half a heart, Java's `Player.aiStep`.
 *
 * @javaSource Player.aiStep
 */
const PEACEFUL_HEAL_INTERVAL = 20;

/**
 * How often Peaceful gives a hungry player a point of food, Java's `Player.aiStep`.
 *
 * @javaSource Player.aiStep
 */
const PEACEFUL_FEED_INTERVAL = 10;

/**
 * Movement further than this in a single update is a teleport, not a walk, and buys no
 * exhaustion. Without it a world change or a `/tp` across the map would empty the food bar.
 */
const MAX_EXHAUSTING_STEP = 10;

/** A position as the movement charge reads it: only the horizontal axes count. */
export interface HorizontalPoint {
    readonly x: number;
    readonly z: number;
}

/**
 * Sets saturation, which never exceeds the current food level in vanilla, so it is capped there
 * as well as at the attribute's own maximum.
 * @param {PlayerComponents} components - The player's components.
 * @param {number} saturation - The wanted saturation.
 */
export const setSaturation = (components: PlayerComponents, saturation: number): void => {
    components.set('vitals.saturation', Math.min(saturation, components.get('vitals.food')));
};

/**
 * Feeds the player, as eating does: food first, then saturation, which food caps.
 * @param {PlayerComponents} components - The player's components.
 * @param {number} food - Food points to restore.
 * @param {number} [saturation=0] - Saturation points to restore.
 */
export const addFood = (components: PlayerComponents, food: number, saturation = 0): void => {
    components.set('vitals.food', components.get('vitals.food') + food);
    setSaturation(components, components.get('vitals.saturation') + saturation);
};

/**
 * Makes the player hungrier.
 *
 * Exhaustion is a counter, not something the player has. Java's `FoodData.addExhaustion` adds to
 * it up to {@link EXHAUSTION_CAP}, and {@link spendExhaustion} spends it one step a tick.
 * Everything that costs hunger in vanilla (moving, jumping, attacking, healing) does it through
 * here. A player hunger does not reach, in creative or spectator, or a dead one, is charged nothing.
 * @param {SurvivalPlayer} player - The player.
 * @param {number} amount - Exhaustion to add.
 * @javaSource FoodData.addExhaustion
 */
export const addExhaustion = (player: SurvivalPlayer, amount: number): void => {
    if (!player.vulnerable() || !player.alive() || amount <= 0) return;

    const { components } = player;
    components.set('vitals.exhaustion', Math.min(components.get('vitals.exhaustion') + amount, EXHAUSTION_CAP));
};

/**
 * One tick's spending of exhaustion, Java's `FoodData.tick`: once the counter is above four it
 * loses four, and that buys one point of saturation or, once saturation is gone, one point of food.
 * Peaceful spends the saturation and never the food.
 * @param {PlayerComponents} components - The player's components.
 * @param {Difficulty} difficulty - The world's difficulty.
 * @javaSource FoodData.tick
 */
export const spendExhaustion = (components: PlayerComponents, difficulty: Difficulty): void => {
    const exhaustion = components.get('vitals.exhaustion');
    if (exhaustion <= EXHAUSTION_PER_FOOD_POINT) return;

    components.set('vitals.exhaustion', exhaustion - EXHAUSTION_PER_FOOD_POINT);
    const saturation = components.get('vitals.saturation');
    if (saturation > 0) setSaturation(components, Math.max(saturation - 1, 0));
    else if (difficulty !== 'peaceful') components.set('vitals.food', Math.max(components.get('vitals.food') - 1, 0));
};

/**
 * Charges the player for the ground they just covered. Only horizontal distance counts, as in
 * vanilla - falling is free - and a flying player or a step long enough to be a teleport costs
 * nothing.
 * @param {SurvivalPlayer} player - The player.
 * @param {HorizontalPoint} from - Where the player was.
 * @param {HorizontalPoint} to - Where the player now is.
 * @param {boolean} flying - Whether the player is flying.
 */
export const addMovementExhaustion = (
    player: SurvivalPlayer,
    from: HorizontalPoint,
    to: HorizontalPoint,
    flying: boolean
): void => {
    if (!player.vulnerable() || flying) return;

    const distance = Math.hypot(to.x - from.x, to.z - from.z);
    if (distance <= 0 || distance > MAX_EXHAUSTING_STEP) return;

    const sprinting = player.components.get('movement.sprinting');
    addExhaustion(player, distance * (sprinting ? EXHAUSTION.sprinting : EXHAUSTION.walking));
};

/**
 * Charges the player for a jump. Sprint-jumping is what actually empties a food bar in vanilla,
 * at four times the cost of a standing jump.
 * @param {SurvivalPlayer} player - The player.
 */
export const addJumpExhaustion = (player: SurvivalPlayer): void => {
    const sprinting = player.components.get('movement.sprinting');
    addExhaustion(player, sprinting ? EXHAUSTION.sprintJumping : EXHAUSTION.jumping);
};

/**
 * One tick of the hunger and saturation status effects: hunger drains food faster and
 * saturation fills it.
 * @param {SurvivalPlayer} player - The player.
 * @param {string} effect - The effect's identifier.
 * @param {number} amplifier - The effect's amplifier, from zero.
 */
export const applyHungerEffect = (player: SurvivalPlayer, effect: string, amplifier: number): void => {
    if (effect === 'minecraft:hunger') addExhaustion(player, HUNGER_EFFECT_EXHAUSTION * (amplifier + 1));
    else if (effect === 'minecraft:saturation') {
        // Java's `FoodData.eat(amplifier + 1, 1.0F)`: that much food, and twice as much saturation.
        addFood(player.components, amplifier + 1, (amplifier + 1) * 2);
    }
};

/** What the hunger clock does to a player: starve them, or heal them and charge for it. */
export type HungerOutcome =
    | { readonly kind: 'starve'; readonly amount: number }
    | { readonly kind: 'regenerate'; readonly amount: number; readonly exhaustion: number };

/**
 * Whether an empty food bar still hurts a player at this health, Java's `FoodData.tick`: always on
 * Hard, down to half a heart on Normal, and down to five hearts on Easy and Peaceful.
 *
 * @javaSource FoodData.tick
 */
const starves = (health: number, difficulty: Difficulty): boolean =>
    health > 10 || difficulty === 'hard' || (health > 1 && difficulty === 'normal');

/**
 * The slow half of hunger: starving when the bar is empty, healing when it is nearly full. Both
 * run on vanilla's four-second clock, so most ticks answer undefined, except that a full bar with
 * saturation left heals every half second. The caller deals the damage
 * or heals, and a heal then costs {@link HungerOutcome} `exhaustion` through
 * {@link addExhaustion}.
 * @param {SurvivalPlayer} player - The player, whom hunger reaches.
 * @param {number} tick - The world tick.
 * @param {boolean} regenerates - Whether the `naturalRegeneration` game rule is on.
 * @param {Difficulty} difficulty - The world's difficulty, which decides how far starving goes.
 * @returns {HungerOutcome | undefined} What to do, or undefined for nothing.
 */
export const hungerOutcome = (
    player: SurvivalPlayer,
    tick: number,
    regenerates: boolean,
    difficulty: Difficulty
): HungerOutcome | undefined => {
    // A full bar with saturation left heals fast, on its own clock, and spends the saturation it
    // heals with; the slow clock below only runs once that stops.
    const saturation = player.components.get('vitals.saturation');
    if (
        regenerates &&
        saturation > 0 &&
        player.components.get('vitals.food') >= MAX_FOOD &&
        player.health() < player.maxHealth()
    ) {
        if (tick % SATURATED_REGENERATION_INTERVAL !== 0) return undefined;
        const spent = Math.min(saturation, SATURATED_REGENERATION_CAP);
        return { kind: 'regenerate', amount: spent / SATURATED_REGENERATION_CAP, exhaustion: spent };
    }

    if (tick % VITALS_INTERVAL !== 0) return undefined;

    if (player.components.get('vitals.food') <= 0) {
        return starves(player.health(), difficulty) ? { kind: 'starve', amount: STARVATION_DAMAGE } : undefined;
    }

    // Healing is not free: it is the main thing a well-fed player spends food on. A world with
    // natural regeneration turned off is one where food only stops you starving.
    if (!regenerates) return undefined;
    if (player.components.get('vitals.food') >= REGENERATION_FOOD_LEVEL && player.health() < player.maxHealth())
        return { kind: 'regenerate', amount: REGENERATION_HEALTH, exhaustion: EXHAUSTION.regeneration };
    return undefined;
};

/** What Peaceful gives a player this tick: half-hearts to heal and food points to add. */
export interface PeacefulRecovery {
    readonly heal: number;
    readonly food: number;
}

/**
 * Peaceful's own recovery, Java's `Player.aiStep`: with natural regeneration on, a hurt player
 * heals half a heart a second and a hungry one gains a point of food every half second.
 * @param {SurvivalPlayer} player - The player, whom hunger reaches.
 * @param {number} tick - The world tick.
 * @param {boolean} regenerates - Whether the `naturalRegeneration` game rule is on.
 * @param {Difficulty} difficulty - The world's difficulty; only Peaceful recovers.
 * @returns {PeacefulRecovery | undefined} What to give, or undefined for nothing.
 * @javaSource Player.aiStep
 */
export const peacefulRecovery = (
    player: SurvivalPlayer,
    tick: number,
    regenerates: boolean,
    difficulty: Difficulty
): PeacefulRecovery | undefined => {
    if (difficulty !== 'peaceful' || !regenerates) return undefined;

    const heal = player.health() < player.maxHealth() && tick % PEACEFUL_HEAL_INTERVAL === 0 ? 1 : 0;
    const food = player.components.get('vitals.food') < MAX_FOOD && tick % PEACEFUL_FEED_INTERVAL === 0 ? 1 : 0;
    return heal === 0 && food === 0 ? undefined : { heal, food };
};
