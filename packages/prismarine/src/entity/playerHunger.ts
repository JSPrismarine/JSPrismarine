/**
 * Hunger: exhaustion, saturation and food, and the four-second clock that starves an empty player
 * and heals a well-fed one. One home for both models of a player (see `survivalPlayer.ts`).
 */
import type { Vector3 } from '@jsprismarine/math';

import type { PlayerComponents } from './playerComponents';
import type { SurvivalPlayer } from './survivalPlayer';

/** How much exhaustion buys one point of saturation, and then of food. */
const EXHAUSTION_PER_FOOD_POINT = 4;

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
 * Movement further than this in a single update is a teleport, not a walk, and buys no
 * exhaustion. Without it a world change or a `/tp` across the map would empty the food bar.
 */
const MAX_EXHAUSTING_STEP = 10;

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
 * Exhaustion is a counter, not something the player has: every four points spend one point of
 * saturation, or - once saturation is gone - one point of food. Everything that costs hunger in
 * vanilla (moving, jumping, attacking, healing) does it through here. A player hunger does not
 * reach, in creative or spectator, or a dead one, is charged nothing.
 * @param {SurvivalPlayer} player - The player.
 * @param {number} amount - Exhaustion to add.
 */
export const addExhaustion = (player: SurvivalPlayer, amount: number): void => {
    if (!player.vulnerable() || !player.alive() || amount <= 0) return;

    const { components } = player;
    let exhaustion = components.get('vitals.exhaustion') + amount;

    while (exhaustion >= EXHAUSTION_PER_FOOD_POINT) {
        exhaustion -= EXHAUSTION_PER_FOOD_POINT;

        const saturation = components.get('vitals.saturation');
        if (saturation > 0) setSaturation(components, saturation - 1);
        else components.set('vitals.food', components.get('vitals.food') - 1);
    }

    components.set('vitals.exhaustion', exhaustion);
};

/**
 * Charges the player for the ground they just covered. Only horizontal distance counts, as in
 * vanilla - falling is free - and a flying player or a step long enough to be a teleport costs
 * nothing.
 * @param {SurvivalPlayer} player - The player.
 * @param {Vector3} from - Where the player was.
 * @param {Vector3} to - Where the player now is.
 * @param {boolean} flying - Whether the player is flying.
 */
export const addMovementExhaustion = (
    player: SurvivalPlayer,
    from: Pick<Vector3, 'getX' | 'getZ'>,
    to: Pick<Vector3, 'getX' | 'getZ'>,
    flying: boolean
): void => {
    if (!player.vulnerable() || flying) return;

    const distance = Math.hypot(to.getX() - from.getX(), to.getZ() - from.getZ());
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
 * The slow half of hunger: starving when the bar is empty, healing when it is nearly full. Both
 * run on vanilla's four-second clock, so most ticks answer undefined. The caller deals the damage
 * or heals, and a heal then costs {@link HungerOutcome} `exhaustion` through
 * {@link addExhaustion}.
 * @param {SurvivalPlayer} player - The player, whom hunger reaches.
 * @param {number} tick - The world tick.
 * @param {boolean} regenerates - Whether the `naturalRegeneration` game rule is on.
 * @returns {HungerOutcome | undefined} What to do, or undefined for nothing.
 */
export const hungerOutcome = (
    player: SurvivalPlayer,
    tick: number,
    regenerates: boolean
): HungerOutcome | undefined => {
    if (tick % VITALS_INTERVAL !== 0) return undefined;

    if (player.components.get('vitals.food') <= 0) return { kind: 'starve', amount: STARVATION_DAMAGE };

    // Healing is not free: it is the main thing a well-fed player spends food on. A world with
    // natural regeneration turned off is one where food only stops you starving.
    if (!regenerates) return undefined;
    if (player.components.get('vitals.food') >= REGENERATION_FOOD_LEVEL && player.health() < player.maxHealth())
        return { kind: 'regenerate', amount: REGENERATION_HEALTH, exhaustion: EXHAUSTION.regeneration };
    return undefined;
};
