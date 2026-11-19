import type { BlockFace, FaceLocation } from '@jsprismarine/blocks';

import type { World } from '../../world/World';
import { Event } from '../Event';
import type { BrokenBlock } from './PlayerBreakBlockEvent';

/**
 * Fired when a player is about to place a block, once the placement is known to fit and the
 * block's own `beforeOnPlayerPlace` hooks let it through, and before anything is written.
 * Cancellable: a canceled placement leaves the world as it was and tells the client so. Script
 * `world.beforeEvents.playerPlaceBlock` subscribers see it here, and `playerBlockPlaced` follows
 * a placement that went through.
 */
export default class PlayerPlaceBlockEvent extends Event {
    private readonly player: bigint;
    private readonly world: World;
    private readonly block: BrokenBlock;
    private readonly face: BlockFace;
    private readonly faceLocation: FaceLocation;

    /**
     * @param block - Where the block goes, and the type and states it goes down with.
     * @param face - The face of the clicked block the new one goes against.
     */
    public constructor(player: bigint, world: World, block: BrokenBlock, face: BlockFace, faceLocation: FaceLocation) {
        super();

        this.player = player;
        this.world = world;
        this.block = block;
        this.face = face;
        this.faceLocation = faceLocation;
    }

    /** The runtime id of the player placing the block. */
    public getPlayer(): bigint {
        return this.player;
    }

    /** The world the block goes into. */
    public getWorld(): World {
        return this.world;
    }

    /** Where the block goes, with the type and states it is placed with. */
    public getBlock(): BrokenBlock {
        return this.block;
    }

    /** The face of the clicked block the new one goes against. */
    public getFace(): BlockFace {
        return this.face;
    }

    /** Where on that face the player clicked, each coordinate from 0 to 1. */
    public getFaceLocation(): FaceLocation {
        return this.faceLocation;
    }
}
