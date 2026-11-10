/**
 * Meals: eating or drinking what is in hand. One home for both models of a player (see
 * `survivalPlayer.ts`).
 *
 * A client says when a meal begins and never when it ends, so the server counts the meal out: it
 * is over its `ticks` after it began, if the same item is still in hand. The meal is plain data,
 * `consumption.meal`, so it is logged, undone and saved like any other field, and what a finished
 * meal does is resolved then, from the item.
 */
import type { PlayerComponents } from './playerComponents';

/**
 * Notes that the player has started eating or drinking an item.
 *
 * A held button makes the client report its use again part way through the meal, and that is the
 * same meal, not a new one that would start the clock over.
 * @param {PlayerComponents} components - The player's components.
 * @param {number} tick - The tick it began on.
 * @param {number} ticks - How long the meal takes.
 * @param {string} item - The item being eaten or drunk.
 */
export const beginMeal = (components: PlayerComponents, tick: number, ticks: number, item: string): void => {
    if (components.get('consumption.meal')?.item === item) return;
    components.set('consumption.meal', { startedAt: tick, ticks, item });
};

/**
 * Forgets an unfinished meal, as letting go of the button or putting the item away does.
 * @param {PlayerComponents} components - The player's components.
 */
export const cancelMeal = (components: PlayerComponents): void => {
    components.set('consumption.meal', null);
};

/**
 * Ends the meal whose time is up, and says what to finish.
 * @param {PlayerComponents} components - The player's components.
 * @param {number} tick - The current tick, on the clock the meal began on.
 * @param {string | undefined} held - The item in hand now.
 * @returns {string | undefined} The item to finish eating, or undefined when no meal is due or
 *   another item is in hand by then, which ends the meal without finishing it.
 */
export const dueMeal = (components: PlayerComponents, tick: number, held: string | undefined): string | undefined => {
    const meal = components.get('consumption.meal');
    if (meal === null || tick - meal.startedAt < meal.ticks) return undefined;

    components.set('consumption.meal', null);
    return held === meal.item ? meal.item : undefined;
};
