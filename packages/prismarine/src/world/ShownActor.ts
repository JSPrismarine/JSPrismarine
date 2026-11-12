/**
 * What the network layer reads of an actor, and what entity tracking reads of an entity.
 *
 * A {@link ShownActor} is an entity a send names, such as the actor an animation or a sound comes
 * from, or a player's own view of itself. A store entity satisfies it through
 * `entity/data/storeActors.ts`. What other clients are shown of an entity, from its first sight
 * on, is replicated from the change log instead (`network/replica/EntityReplication.ts`), which
 * hands tracking a {@link ShownEntity} for each entity it holds.
 */
import type { Vector3 } from '@jsprismarine/math';
import type { Attributes } from '@jsprismarine/protocol/wire/structures/Attribute';
import type { Metadata } from '@jsprismarine/protocol/wire/structures/Metadata';
import type { SyncedProperties } from '@jsprismarine/protocol/wire/structures/SyncedProperties';

import type { TrackableEntity } from '../network/EntityTracker';
import type PlayerSession from '../network/PlayerSession';
import type { ViewableEquipment } from '../entity/predicateView';
import type { StatusEffect } from '../entity/StatusEffect';

/** How far clients follow a store entity, in chunks, which is the legacy entities' default. */
export const ACTOR_TRACKING_RANGE_CHUNKS = 8;

/**
 * How far clients follow a dropped stack, in chunks: less far than anything else, as in vanilla,
 * because stacks are the most numerous entity in any world and the least worth seeing at a distance.
 */
export const ITEM_TRACKING_RANGE_CHUNKS = 6;

/** One actor as the network layer shows it. */
export interface ShownActor {
    getRuntimeId(): bigint;
    getType(): string;
    getPosition(): Vector3;
    getVelocity(): Vector3;
    readonly pitch: number;
    readonly yaw: number;
    readonly headYaw: number;
    /** The actor metadata a client is sent, flags and properties both. */
    readonly metadata: Metadata;
    getSyncedProperties(): SyncedProperties;
    /** The attributes a client is sent. */
    readonly attributes: Attributes;
    getEquipment(): ViewableEquipment;
    getStatusEffects(): readonly StatusEffect[];
    isOnGround(): boolean;
}

/** One entity as tracking reads it: where it is, how far it is followed, and how a client is shown it. */
export interface ShownEntity extends TrackableEntity {
    /** Shows the entity to one client, which for most entities is an `AddActorPacket`. */
    spawnTo(session: PlayerSession): Promise<void>;
}
