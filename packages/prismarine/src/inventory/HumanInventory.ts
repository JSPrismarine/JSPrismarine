import type { PlayerInventoryContainer } from './EntityInventory';
import { EntityInventory, HOTBAR_SIZE, PLAYER_LAYOUT } from './EntityInventory';
import type { Item } from '../item/Item';

/**
 * What a player carries: the player layout of {@link EntityInventory}, and the stack network ids
 * its client names the stacks by.
 */
export default class HumanInventory extends EntityInventory<PlayerInventoryContainer> {
    /**
     * The next stack network id this player's client will be given.
     *
     * One count per player, as a Bedrock Dedicated Server 1.26.52 keeps it: a fresh player's
     * first creative pick was stack 1 and the next 2. The ids only have to be positive and never
     * reused for this client, and counting per player keeps one player's ids out of another's.
     */
    private nextStackNetworkId = 1;

    public constructor() {
        super(PLAYER_LAYOUT);
    }

    /**
     * Whether a slot number names one of the nine hotbar slots, and so may be the hand slot.
     * @param slot - The slot, as a client reported it.
     */
    public static isHotbarSlot(slot: number): boolean {
        return Number.isInteger(slot) && slot >= 0 && slot < HOTBAR_SIZE;
    }

    /**
     * Gives a stack its stack network id, if it has none yet.
     *
     * @param item - A stack this player holds. Air is left without one.
     * @returns The stack's id, or 0 for air.
     */
    public assignStackNetworkId(item: Item): number {
        if (item.getName() === 'minecraft:air') return 0;
        if (item.stackNetworkId === 0) item.stackNetworkId = this.nextStackNetworkId++;
        return item.stackNetworkId;
    }

    /**
     * Gives every stack this player holds an id, before the client is told what they hold.
     *
     * The ender chest too: its slots are this player's own stacks, and opening one sends them.
     */
    public assignStackNetworkIds(): void {
        for (const [, container] of this.entries()) {
            for (const item of container.stacks()) this.assignStackNetworkId(item);
        }
    }
}
