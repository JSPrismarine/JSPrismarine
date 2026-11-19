import type { BlockPosition } from '@jsprismarine/engine-systems';

import type { StoreActor } from '../../entity/data/storeActors';
import type { World } from '../../world/World';
import { Event } from '../Event';

/**
 * Fired when a blast is about to go off, once its rays are cast and before anything is hurt or
 * any block is cleared. Cancellable: a canceled blast does nothing. The blocks it clears are
 * writable. Script `world.beforeEvents.explosion` subscribers see it here, and `exploded`
 * follows a blast that went off.
 */
export default class ExplosionEvent extends Event {
    private readonly world: World;
    private readonly source: StoreActor | null;
    private blocks: readonly BlockPosition[];

    /**
     * @param source - The entity answerable for the blast, or null for none.
     * @param blocks - The blocks it would clear, in the order it clears them.
     */
    public constructor(world: World, source: StoreActor | null, blocks: readonly BlockPosition[]) {
        super();
        this.world = world;
        this.source = source;
        this.blocks = blocks;
    }

    /** The world it happened in. */
    public getWorld(): World {
        return this.world;
    }

    /** The entity answerable for it, or null for none. */
    public getSource(): StoreActor | null {
        return this.source;
    }

    /** The blocks the blast clears. */
    public getBlocks(): readonly BlockPosition[] {
        return this.blocks;
    }

    /** Changes the blocks the blast clears. */
    public setBlocks(blocks: readonly BlockPosition[]): void {
        this.blocks = blocks;
    }
}
