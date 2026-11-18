import type { BlockFace, FaceLocation } from '@jsprismarine/blocks';

import type { Item } from '../../item/Item';
import type { World } from '../../world/World';
import { Event } from '../Event';
import type { BrokenBlock } from './PlayerBreakBlockEvent';

/**
 * Fired when a player clicks a block, before the block, a screen or the item in hand does
 * anything with the click. Cancellable: a canceled click opens, uses and places nothing, and the
 * client is sent the blocks and the inventory as they are. Script
 * `world.beforeEvents.playerInteractWithBlock` subscribers see it here, and
 * `playerBlockInteracted` follows a click that did something.
 */
export default class PlayerInteractBlockEvent extends Event {
    private readonly player: bigint;
    private readonly world: World;
    private readonly block: BrokenBlock;
    private readonly face: BlockFace;
    private readonly faceLocation: FaceLocation;
    private readonly item: Item | null;

    public constructor(
        player: bigint,
        world: World,
        block: BrokenBlock,
        face: BlockFace,
        faceLocation: FaceLocation,
        item: Item | null
    ) {
        super();

        this.player = player;
        this.world = world;
        this.block = block;
        this.face = face;
        this.faceLocation = faceLocation;
        this.item = item;
    }

    /** The runtime id of the player clicking. */
    public getPlayer(): bigint {
        return this.player;
    }

    /** The world the block is in. */
    public getWorld(): World {
        return this.world;
    }

    /** The block clicked. */
    public getBlock(): BrokenBlock {
        return this.block;
    }

    /** The face of the block the click landed on. */
    public getFace(): BlockFace {
        return this.face;
    }

    /** Where on the face the click landed, each coordinate from 0 to 1. */
    public getFaceLocation(): FaceLocation {
        return this.faceLocation;
    }

    /** The stack in the player's hand, or null for an empty hand. */
    public getItem(): Item | null {
        return this.item;
    }
}
