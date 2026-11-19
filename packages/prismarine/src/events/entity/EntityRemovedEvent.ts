import type { World } from '../../world/World';
import { Event } from '../Event';

/**
 * Fired once an entity other than a player left its world. It no longer answers, so the event
 * carries what it was. Script `world.afterEvents.entityRemove` subscribers hear it in the tick's
 * script flush.
 */
export default class EntityRemovedEvent extends Event {
    private readonly runtimeId: bigint;
    private readonly type: string;
    private readonly world: World;

    public constructor(runtimeId: bigint, type: string, world: World) {
        super();
        this.runtimeId = runtimeId;
        this.type = type;
        this.world = world;
    }

    /** The runtime id the entity had. */
    public getRuntimeId(): bigint {
        return this.runtimeId;
    }

    /** The type it was, such as `minecraft:pig`. */
    public getType(): string {
        return this.type;
    }

    /** The world it left. */
    public getWorld(): World {
        return this.world;
    }
}
