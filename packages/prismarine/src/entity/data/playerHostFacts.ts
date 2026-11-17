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
import ContainerEntry from '../../inventory/ContainerEntry';
import type HumanInventory from '../../inventory/HumanInventory';
import type Inventory from '../../inventory/Inventory';
import { slotValueOfItem } from '../../inventory/slotLog';
import type { Item } from '../../item/Item';
import type { StorePlayer } from '../storePlayer';
import type { EntityHostFacts, PlayerHands } from './host';
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
): Required<Pick<EntityHostFacts, 'heldItemOf' | 'handsOf' | 'wearHeldItem' | 'finishMeal'>> => ({
    heldItemOf: (playerId) => nameOf(players.of(playerId)?.getInventory().getItemInHand()),
    handsOf: (playerId) => {
        const inventory = players.of(playerId)?.getInventory();
        if (inventory === undefined) return undefined;
        const mainhand = nameOf(inventory.getItemInHand());
        const offhand = nameOf(inventory.getOffhand().getEntry(0)?.toItemStack());
        return {
            ...(mainhand === undefined ? {} : { mainhand }),
            ...(offhand === undefined ? {} : { offhand })
        };
    },
    wearHeldItem: (playerId, hand, amount) => {
        const inventory = players.of(playerId)?.getInventory();
        if (inventory === undefined) return;
        const { container, slot } = handSlotOf(inventory, hand);
        const entry = container.getEntry(slot);
        const held = entry?.getItem();
        if (entry === null || held === undefined || held.getMaxDurability() <= 0) return;
        const left = held.getDurability() - amount;
        // A copy written into the slot, so the change log hears it; worn through, it breaks.
        if (left <= 0) container.removeItem(slot);
        else container.setItem(slot, new ContainerEntry({ item: held.withDurability(left), count: entry.getCount() }));
    },
    finishMeal: (playerId, item) => {
        const player = players.of(playerId);
        if (player !== undefined && player.getInventory().getItemInHand().getName() === item) finish(player, item);
    }
});

/** An item's identifier, or undefined for an empty slot, one the change log records as holding nothing. */
const nameOf = (item: Item | undefined): string | undefined =>
    item === undefined || slotValueOfItem(item) === null ? undefined : item.getName();

/** The container and slot of one of a player's hands. */
const handSlotOf = (
    inventory: HumanInventory,
    hand: keyof PlayerHands
): { readonly container: Inventory; readonly slot: number } =>
    hand === 'mainhand'
        ? { container: inventory, slot: inventory.getHandSlotIndex() }
        : { container: inventory.getOffhand(), slot: 0 };
