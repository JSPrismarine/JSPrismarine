import type { Item } from '../../item/Item';
import type { World } from '../../world/World';
import { Event } from '../Event';

/** An entity a player clicked: its runtime id and its type. */
export interface ClickedEntity {
    readonly runtimeId: bigint;
    readonly type: string;
}

/**
 * Fired when a player clicks an entity, before the entity or the item in hand does anything with
 * the click. Cancellable: a canceled click does nothing, and the client is sent the inventory as
 * it is. Script `world.beforeEvents.playerInteractWithEntity` subscribers see it here, and
 * `playerEntityInteracted` follows a click that did something.
 */
export default class PlayerInteractEntityEvent extends Event {
    private readonly player: bigint;
    private readonly world: World;
    private readonly target: ClickedEntity;
    private readonly item: Item | null;

    public constructor(player: bigint, world: World, target: ClickedEntity, item: Item | null) {
        super();

        this.player = player;
        this.world = world;
        this.target = target;
        this.item = item;
    }

    /** The runtime id of the player clicking. */
    public getPlayer(): bigint {
        return this.player;
    }

    /** The world the entity is in. */
    public getWorld(): World {
        return this.world;
    }

    /** The entity clicked. */
    public getTarget(): ClickedEntity {
        return this.target;
    }

    /** The stack in the player's hand, or null for an empty hand. */
    public getItem(): Item | null {
        return this.item;
    }
}
