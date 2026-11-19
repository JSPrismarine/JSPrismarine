import type { BlockFace } from '@jsprismarine/blocks';

import type { Item } from '../../item/Item';
import type { World } from '../../world/World';
import { Event } from '../Event';
import type { BrokenBlock } from './PlayerBreakBlockEvent';

/**
 * Fired when a player starts mining a block, and when they let go of one before it broke. Script
 * `world.afterEvents.playerStartBreakingBlock`, `entityHitBlock` and `playerCancelBreakingBlock`
 * subscribers hear it in the tick's script flush.
 */
export default class PlayerBlockActionEvent extends Event {
    public constructor(
        private readonly player: bigint,
        private readonly world: World,
        private readonly action: 'start' | 'abort',
        private readonly block: BrokenBlock,
        private readonly face: BlockFace,
        private readonly item: Item | null,
        private readonly progress = 0
    ) {
        super();
    }

    /** The runtime id of the player. */
    public getPlayer(): bigint {
        return this.player;
    }

    /** The world it happened in. */
    public getWorld(): World {
        return this.world;
    }

    /** `start` as mining begins, `abort` as the player lets go before the block broke. */
    public getAction(): 'start' | 'abort' {
        return this.action;
    }

    /** The block mined, as it is. */
    public getBlock(): BrokenBlock {
        return this.block;
    }

    /** The face of the block the player mines. */
    public getFace(): BlockFace {
        return this.face;
    }

    /** How much of the break was done when the player let go, from 0 to 1; 0 as mining starts. */
    public getProgress(): number {
        return this.progress;
    }

    /** What the player holds, or null for an empty hand. */
    public getItem(): Item | null {
        return this.item;
    }
}
