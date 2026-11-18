import type { Item } from '../../item/Item';
import type { World } from '../../world/World';
import { Event } from '../Event';
import type { BrokenBlock } from './PlayerBreakBlockEvent';

/**
 * Fired once a player broke a block: it is gone, its drops fell and the tool took its wear. Not
 * cancellable. Script `world.afterEvents.playerBreakBlock` subscribers see it here.
 */
export default class PlayerBlockBrokenEvent extends Event {
    private readonly player: bigint;
    private readonly world: World;
    private readonly block: BrokenBlock;
    private readonly itemBefore: Item | null;
    private readonly itemAfter: Item | null;

    public constructor(
        player: bigint,
        world: World,
        block: BrokenBlock,
        itemBefore: Item | null,
        itemAfter: Item | null
    ) {
        super();

        this.player = player;
        this.world = world;
        this.block = block;
        this.itemBefore = itemBefore;
        this.itemAfter = itemAfter;
    }

    /** The runtime id of the player who broke the block. */
    public getPlayer(): bigint {
        return this.player;
    }

    /** The world the block was in. */
    public getWorld(): World {
        return this.world;
    }

    /** The block that broke, as it was. */
    public getBlock(): BrokenBlock {
        return this.block;
    }

    /** The stack in the player's hand before the break, or null for an empty hand. */
    public getItemBefore(): Item | null {
        return this.itemBefore;
    }

    /** The stack in the player's hand after the break, or null for an empty hand. */
    public getItemAfter(): Item | null {
        return this.itemAfter;
    }
}
