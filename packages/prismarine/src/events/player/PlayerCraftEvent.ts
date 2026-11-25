import type { Vector3 } from '@jsprismarine/math';

import type { Item } from '../../item/Item';
import type PlayerSession from '../../player/PlayerSession';
import type { World } from '../../world/World';
import type { BrokenBlock } from './PlayerBreakBlockEvent';
import PlayerEvent from './PlayerEvent';

/**
 * Fired once a player's craft was accepted and paid for. Script
 * `world.afterEvents.playerCraftRecipe` subscribers hear it in the tick's script flush.
 */
export default class PlayerCraftEvent extends PlayerEvent {
    public constructor(
        session: PlayerSession,
        private readonly world: World,
        private readonly item: Item,
        private readonly station: Vector3 | undefined
    ) {
        super(session);
    }

    /** The world the player crafted in. */
    public getWorld(): World {
        return this.world;
    }

    /** What the craft made. */
    public getItem(): Item {
        return this.item;
    }

    /** The crafting block the player used, or undefined for the inventory's own grid. */
    public getStation(): BrokenBlock | undefined {
        if (this.station === undefined) return undefined;
        const x = this.station.getX();
        const y = this.station.getY();
        const z = this.station.getZ();
        const block = this.world.loadedBlockAt(x, y, z);
        return block === undefined ? undefined : { x, y, z, name: block.name, states: block.states };
    }
}
