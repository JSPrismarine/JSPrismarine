import type { Item } from '../../item/Item';
import type { World } from '../../world/World';
import { Event } from '../Event';

/** A block as the player action events name it: its position, type and states. */
export interface BrokenBlock {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly name: string;
    readonly states: Readonly<Record<string, string | number | boolean>>;
}

/**
 * Fired when a player is about to break a block, before the block goes and before its drops are
 * decided. Cancellable: a canceled break leaves the block where it is and tells the client so.
 * Script `world.beforeEvents.playerBreakBlock` subscribers see it here.
 */
export default class PlayerBreakBlockEvent extends Event {
    private readonly player: bigint;
    private readonly world: World;
    private readonly block: BrokenBlock;
    private readonly item: Item | null;

    public constructor(player: bigint, world: World, block: BrokenBlock, item: Item | null) {
        super();

        this.player = player;
        this.world = world;
        this.block = block;
        this.item = item;
    }

    /** The runtime id of the player breaking the block. */
    public getPlayer(): bigint {
        return this.player;
    }

    /** The world the block is in. */
    public getWorld(): World {
        return this.world;
    }

    /** The block about to break. */
    public getBlock(): BrokenBlock {
        return this.block;
    }

    /** The stack in the player's hand, or null for an empty hand. */
    public getItem(): Item | null {
        return this.item;
    }
}
