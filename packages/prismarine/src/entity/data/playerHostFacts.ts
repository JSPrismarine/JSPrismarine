/**
 * The host facts a live server supplies for its store players, read from the server's
 * {@link StorePlayers}: the item in a player's hand, and the finish of a meal.
 *
 * The player systems (`playerSystems.ts`) count a meal out and ask the host, through
 * `EntityHostFacts.heldItemOf` and `finishMeal`, what is in hand and what finishing it does. The
 * hand is the player's `HumanInventory`. Finishing runs the held item's `onConsume` through the
 * server's item interaction code, which needs the session and the content world, so the server
 * hands that in as `finish`. The live host (`live.ts`) spreads these facts into its own.
 */
import { slotValueOfItem } from '../../inventory/slotLog';
import type { StorePlayer } from '../storePlayer';
import type { EntityHostFacts } from './host';
import type { StorePlayers } from './storePlayers';

/**
 * The store player facts of a live host.
 *
 * @param players - The server's store players, by entity id.
 * @param finish - Finishes a meal of `item` for a player whose hand still holds it: runs its
 *   `onConsume`, which feeds the player, and puts back what the meal leaves.
 * @returns The two facts; each answers nothing for an id that names no filed store player.
 */
export const storePlayerHostFacts = (
    players: Pick<StorePlayers, 'of'>,
    finish: (player: StorePlayer, item: string) => void
): Required<Pick<EntityHostFacts, 'heldItemOf' | 'finishMeal'>> => ({
    heldItemOf: (playerId) => {
        const held = players.of(playerId)?.getInventory().getItemInHand();
        // An empty hand is one whose slot the change log records as holding nothing.
        return held === undefined || slotValueOfItem(held) === null ? undefined : held.getName();
    },
    finishMeal: (playerId, item) => {
        const player = players.of(playerId);
        if (player !== undefined && player.getInventory().getItemInHand().getName() === item) finish(player, item);
    }
});
