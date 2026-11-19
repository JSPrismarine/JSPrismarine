import type { BlockFace } from '@jsprismarine/blocks';

import type { Item } from '../../item/Item';
import type { World } from '../../world/World';
import { Event } from '../Event';
import type { BrokenBlock } from './PlayerBreakBlockEvent';

/**
 * Where a player's use of an item stands: begun with a duration, such as a meal or a bow's draw,
 * completed, let go of, or ended for any of those reasons; or begun and ended on a block.
 */
export type ItemUseStage = 'start' | 'complete' | 'release' | 'stop' | 'startOn' | 'stopOn';

/**
 * Fired at each stage of a player's use of an item. Script `world.afterEvents.itemStartUse`,
 * `itemCompleteUse`, `itemReleaseUse`, `itemStopUse`, `itemStartUseOn` and `itemStopUseOn`
 * subscribers hear it in the tick's script flush.
 */
export default class PlayerItemUseStageEvent extends Event {
    public constructor(
        private readonly player: bigint,
        private readonly world: World,
        private readonly stage: ItemUseStage,
        private readonly item: Item | null,
        private readonly useDuration: number,
        private readonly block?: { readonly at: BrokenBlock; readonly face: BlockFace }
    ) {
        super();
    }

    /** The runtime id of the player using the item. */
    public getPlayer(): bigint {
        return this.player;
    }

    /** The world it happened in. */
    public getWorld(): World {
        return this.world;
    }

    /** Where the use stands. */
    public getStage(): ItemUseStage {
        return this.stage;
    }

    /** The stack used, or null once it is gone, as a finished meal leaves the hand. */
    public getItem(): Item | null {
        return this.item;
    }

    /** The ticks of the use left: all of them as it starts, what remained as it ends. */
    public getUseDuration(): number {
        return this.useDuration;
    }

    /** The block a use on a block was on, and the face clicked. */
    public getBlock(): { readonly at: BrokenBlock; readonly face: BlockFace } | undefined {
        return this.block;
    }
}
