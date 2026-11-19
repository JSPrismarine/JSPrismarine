import type { World } from '../../world/World';
import { Event } from '../Event';
import type { BrokenBlock } from './PlayerBreakBlockEvent';

/**
 * Fired once a player's placement went through and the block is in the world. Script
 * `world.afterEvents.playerPlaceBlock` subscribers hear it in the tick's script flush.
 */
export default class PlayerBlockPlacedEvent extends Event {
    private readonly player: bigint;
    private readonly world: World;
    private readonly block: BrokenBlock;

    public constructor(player: bigint, world: World, block: BrokenBlock) {
        super();

        this.player = player;
        this.world = world;
        this.block = block;
    }

    /** The runtime id of the player who placed the block. */
    public getPlayer(): bigint {
        return this.player;
    }

    /** The world the block went into. */
    public getWorld(): World {
        return this.world;
    }

    /** Where the block went, with the type and states it was placed with. */
    public getBlock(): BrokenBlock {
        return this.block;
    }
}
