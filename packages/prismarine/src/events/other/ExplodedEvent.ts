import type { StoreActor } from '../../entity/data/storeActors';
import type { BrokenBlock } from '../player/PlayerBreakBlockEvent';
import type { World } from '../../world/World';
import { Event } from '../Event';

/**
 * Fired once a blast went off, with the blocks it cleared as they were. Script
 * `world.afterEvents.explosion` and `blockExplode` subscribers hear it in the tick's script
 * flush.
 */
export default class ExplodedEvent extends Event {
    private readonly world: World;
    private readonly source: StoreActor | null;
    private readonly blocks: readonly BrokenBlock[];

    public constructor(world: World, source: StoreActor | null, blocks: readonly BrokenBlock[]) {
        super();
        this.world = world;
        this.source = source;
        this.blocks = blocks;
    }

    /** The world it happened in. */
    public getWorld(): World {
        return this.world;
    }

    /** The entity answerable for the blast, or null for none; it may be gone by now. */
    public getSource(): StoreActor | null {
        return this.source;
    }

    /** The blocks the blast cleared, each with the type and states it had. */
    public getBlocks(): readonly BrokenBlock[] {
        return this.blocks;
    }
}
