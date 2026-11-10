/**
 * What the network layer reads of an actor to show it to a client.
 *
 * A legacy {@link import('../entity/Entity').Entity} satisfies this as it is. An entity in the
 * store satisfies it through `entity/data/storeActors.ts`, which answers every member from store
 * state, so tracking, spawning and the per-tick updates encode a store entity without a legacy
 * body behind it. Slice 7 of the entity and tick re-architecture replaces these reads with
 * replication from the change log.
 */
import type { Vector3 } from '@jsprismarine/math';
import type { Attributes } from '@jsprismarine/protocol/wire/structures/Attribute';
import type { Metadata } from '@jsprismarine/protocol/wire/structures/Metadata';
import type { SyncedProperties } from '@jsprismarine/protocol/wire/structures/SyncedProperties';

import type PlayerSession from '../network/PlayerSession';
import type { ViewableEquipment } from '../entity/predicateView';
import type { StatusEffect } from '../entity/StatusEffect';

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
    /** The attributes a client is sent, with the ones changed since the last flush marked dirty. */
    readonly attributes: Attributes;
    getEquipment(): ViewableEquipment;
    getStatusEffects(): readonly StatusEffect[];
    isOnGround(): boolean;
    /** How far clients follow this kind of actor, in chunks. */
    getTrackingRange(): number;
    /** Shows the actor to one client, which for most actors is an `AddActorPacket`. */
    spawnTo(session: PlayerSession): Promise<void>;
}
