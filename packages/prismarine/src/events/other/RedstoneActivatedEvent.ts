import type { RedstoneActivation } from '@jsprismarine/block-behaviors';

import type { World } from '../../world/World';
import { Event } from '../Event';

/**
 * Fired once a redstone component acted: a piston moved, a lever flipped, a button was pressed or
 * a pressure plate's signal changed. Script `world.afterEvents.pistonActivate`, `leverAction`,
 * `buttonPush`, `pressurePlatePush` and `pressurePlatePop` subscribers hear it in the tick's
 * script flush.
 */
export default class RedstoneActivatedEvent extends Event {
    public constructor(
        private readonly world: World,
        private readonly activation: RedstoneActivation
    ) {
        super();
    }

    /** The world it happened in. */
    public getWorld(): World {
        return this.world;
    }

    /** What acted, where, and who did it. */
    public getActivation(): RedstoneActivation {
        return this.activation;
    }
}
