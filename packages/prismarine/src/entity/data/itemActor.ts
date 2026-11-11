/**
 * A dropped stack of the store as clients and the world code see it.
 *
 * A stack is a store entity like any other, with the actor every store entity has. What this
 * subclass changes is how it is shown: as an `AddItemActor` carrying the stack, followed less far
 * than anything else, with no metadata or health updates, and with blows handed to the dropped
 * item system, which takes health off a stack with no grace period. Everything it reports it reads
 * from the store entity behind it.
 */
import type { Vector3 } from '@jsprismarine/math';
import { AttributeIds, Attributes } from '@jsprismarine/protocol/wire/structures/Attribute';

import ContainerEntry from '../../inventory/ContainerEntry';
import type { StoredItemStack } from '../../inventory/persistence';
import { restoredItem } from '../../inventory/persistence';
import type PlayerSession from '../../network/PlayerSession';
import type { World } from '../../world/World';
import { DamageCause } from '../DamageCause';
import type { DamageSource } from '../DamageSource';
import type { DataEntity } from './DataEntity';
import type { DroppedItems } from './droppedItems';
import { itemTuningOf, itemViewOf } from './droppedItems';
import type { ActorMetadataProjection } from './actorMetadata';
import { StoreActor } from './storeActors';
import type { StoreActorBlows } from './storeActors';

/**
 * What a dropped stack's metadata projects to: nothing. A client draws a stack from its
 * `AddItemActor`, and the stack is sent no metadata beyond the defaults and its box.
 */
const NO_PROJECTION: ActorMetadataProjection = { flags: [], properties: [] };

/** What a dropped stack's actor record holds beside the fields every actor has. */
export interface SavedItem {
    readonly stack: StoredItemStack;
    readonly age: number;
    readonly pickupDelay: number;
    readonly motion: Vector3;
}

/** The actor of one dropped stack of the store. */
export class ItemActor extends StoreActor {
    /**
     * @param entity - The store entity of the stack.
     * @param world - The world it lies in.
     * @param blows - Where the actor sends heals and written health.
     * @param items - The system a blow is handed to.
     */
    public constructor(
        entity: DataEntity,
        world: World,
        blows: StoreActorBlows,
        private readonly items: DroppedItems
    ) {
        super(entity, world, undefined, blows);
        // The defaults every legacy entity had, unsent: no packet carries a stack's attributes,
        // and the replay digest hashes these.
        const health = Attributes.getDefaults().find((attribute) => attribute.getName() === AttributeIds.Health);
        if (health !== undefined) this.attributes.setAttribute(health);
        this.attributes.clearDirty();
    }

    /** The stack a player picks up, as the item actor packet carries it. */
    public getItem(): ContainerEntry | undefined {
        const view = itemViewOf(this.entity);
        const item = view === undefined ? null : restoredItem(view.stack, this.getServer().getContent());
        return item === null ? undefined : new ContainerEntry({ item, count: item.getAmount() });
    }

    /** The speed it is moving at, in blocks per tick, which the client is told when it appears. */
    public getMotion(): Vector3 {
        return this.getVelocity();
    }

    /** What the item's actor record holds beside the fields every actor has. */
    public savedItem(): SavedItem | undefined {
        const view = itemViewOf(this.entity);
        if (view === undefined) return undefined;
        return { stack: view.stack, age: view.age, pickupDelay: view.pickupDelay, motion: this.getMotion() };
    }

    /** Where the item lies, below the position it reports. */
    public override getFeetY(): number {
        return this.entity.position.y - itemTuningOf(this.entity).positionOffset;
    }

    /**
     * The client draws a stack's landing from its own guess, so a stack is never said to be on
     * the ground.
     */
    public override isOnGround(): boolean {
        return false;
    }

    /**
     * Dropped stacks are followed less far than anything else, as in vanilla: they are the most
     * numerous entity in any world and the least worth seeing at a distance.
     * @returns {number} The tracking radius in chunks.
     */
    public override getTrackingRange(): number {
        return 6;
    }

    /** @inheritdoc */
    public override projectMetadata(_leashHolderId?: number): ActorMetadataProjection {
        return NO_PROJECTION;
    }

    /** A stack's health is not shown, so a burning stack sends no attribute updates. */
    public override showHealth(_current: number): void {}

    /** A dropped stack goes on the wire as an item actor, not as a generic one. */
    public override async spawnTo(session: PlayerSession): Promise<void> {
        await session.sendAddItemActor(this);
    }

    /** A blow goes to the dropped item system, which takes the stack's health with no grace period. */
    public override async damage(
        amount: number,
        source: DamageCause | DamageSource = DamageCause.Generic
    ): Promise<boolean> {
        if (this.entity.removed !== undefined) return false;
        return this.items.hurt(this.entity, amount, typeof source === 'string' ? source : source.cause);
    }
}
