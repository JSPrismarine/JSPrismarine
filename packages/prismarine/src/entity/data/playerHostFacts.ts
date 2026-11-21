/**
 * The host facts a live server supplies for its store players, read from the server's
 * {@link StorePlayers}: what a player holds in each hand, the wear a blocked blow puts on it, and
 * the finish of a meal.
 *
 * The player systems (`playerSystems.ts`) count a meal out and ask the host, through
 * `EntityHostFacts.heldItemOf` and `finishMeal`, what is in hand and what finishing it does. The
 * hands are the player's `HumanInventory`. Finishing runs the held item's `onConsume` through the
 * server's item interaction code, which needs the session and the content world, so the server
 * hands that in as `finish`. The live host (`live.ts`) spreads these facts into its own.
 */
import type { StorePlayer } from '../storePlayer';
import type { EntityHostFacts } from './host';
import type { StorePlayers } from './storePlayers';

/**
 * The store player facts of a live host.
 *
 * @param players - The server's store players, by entity id.
 * @param finish - Finishes a meal of `item` for a player whose hand still holds it: runs its
 *   `onConsume`, which feeds the player, and puts back what the meal leaves.
 * @param broke - Shows a player's `item` wearing through, after it left the hand.
 * @returns The two facts; each answers nothing for an id that names no filed store player.
 */
export const storePlayerHostFacts = (
    players: Pick<StorePlayers, 'of'>,
    finish: (player: StorePlayer, item: string) => void,
    broke: (player: StorePlayer, item: string) => void
): Required<Pick<EntityHostFacts, 'heldItemOf' | 'handsOf' | 'wearHeldItem' | 'finishMeal'>> => ({
    heldItemOf: (playerId) => players.of(playerId)?.getInventory().equipment('mainhand')?.getName(),
    handsOf: (playerId) => {
        const inventory = players.of(playerId)?.getInventory();
        if (inventory === undefined) return undefined;
        const mainhand = inventory.equipment('mainhand')?.getName();
        const offhand = inventory.equipment('offhand')?.getName();
        return {
            ...(mainhand === undefined ? {} : { mainhand }),
            ...(offhand === undefined ? {} : { offhand })
        };
    },
    wearHeldItem: (playerId, hand, amount) => {
        const player = players.of(playerId);
        const inventory = player?.getInventory();
        if (player === undefined || inventory === undefined) return;
        const held = inventory.equipment(hand);
        if (held === null || held.getMaxDurability() <= 0) return;
        const left = held.getDurability() - amount;
        // A copy written into the slot, so the change log hears it; worn through, it breaks.
        if (left <= 0) {
            inventory.setEquipment(hand, null);
            broke(player, held.getName());
        } else inventory.setEquipment(hand, held.withDurability(left));
    },
    finishMeal: (playerId, item) => {
        const player = players.of(playerId);
        if (player !== undefined && player.getInventory().equipment('mainhand')?.getName() === item)
            finish(player, item);
    }
});
