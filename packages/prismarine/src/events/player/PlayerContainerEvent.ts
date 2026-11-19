import type PlayerSession from '../../network/PlayerSession';
import type { World } from '../../world/World';
import type { BrokenBlock } from './PlayerBreakBlockEvent';
import PlayerEvent from './PlayerEvent';

/** The container a player opened or closed: a block's, or an entity's. */
export type ContainerOwner =
    { readonly block: BrokenBlock } | { readonly entity: { readonly runtimeId: bigint; readonly type: string } };

/**
 * Fired when a player opens or closes the screen of a block's or an entity's container. Script
 * `world.afterEvents.blockContainerOpened`, `blockContainerClosed`, `entityContainerOpened` and
 * `entityContainerClosed` subscribers hear it in the tick's script flush.
 */
export default class PlayerContainerEvent extends PlayerEvent {
    public constructor(
        session: PlayerSession,
        private readonly world: World,
        private readonly opened: boolean,
        private readonly owner: ContainerOwner
    ) {
        super(session);
    }

    /** The world the container is in. */
    public getWorld(): World {
        return this.world;
    }

    /** Whether the player opened it; false when they closed it. */
    public isOpened(): boolean {
        return this.opened;
    }

    /** Whose container it is. */
    public getOwner(): ContainerOwner {
        return this.owner;
    }
}
