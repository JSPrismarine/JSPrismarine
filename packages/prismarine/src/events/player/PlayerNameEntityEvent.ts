import type { StoreActor } from '../../entity/data/storeActors';
import { Event } from '../Event';

/**
 * Fired once a player named an entity with a name tag. Script
 * `world.afterEvents.playerUseNameTag` subscribers hear it in the tick's script flush.
 */
export default class PlayerNameEntityEvent extends Event {
    public constructor(
        private readonly player: bigint,
        private readonly entity: StoreActor,
        private readonly previousName: string,
        private readonly newName: string
    ) {
        super();
    }

    /** The runtime id of the player who used the name tag. */
    public getPlayer(): bigint {
        return this.player;
    }

    /** The entity named. */
    public getEntity(): StoreActor {
        return this.entity;
    }

    /** The name the entity had, empty for none. */
    public getPreviousName(): string {
        return this.previousName;
    }

    /** The name it has now. */
    public getNewName(): string {
        return this.newName;
    }
}
