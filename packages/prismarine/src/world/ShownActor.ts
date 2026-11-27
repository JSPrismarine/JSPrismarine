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
import type { Gametype } from '@jsprismarine/minecraft';
import type { Attributes } from '@jsprismarine/protocol/bedrock/wire/structures/Attribute';
import type { Metadata } from '@jsprismarine/protocol/bedrock/wire/structures/Metadata';
import type { SyncedProperties } from '@jsprismarine/protocol/bedrock/wire/structures/SyncedProperties';

import type { TrackableEntity } from '../player/EntityTracker';
import type PlayerSession from '../player/PlayerSession';
import type { ShownEntityState, ShownEquipment, ShownStack } from '../player/presenter/SessionPresenter';
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

/** A player's profile, as a Java client lists it. */
export interface ShownProfile {
    readonly uuid: string;
    readonly name: string;
    /**
     * The `textures` property Mojang's session server signed, for a Java player who logged in
     * online: a Java client draws the player's skin and cape from it.
     */
    readonly textures?: { readonly value: string; readonly signature: string | null };
    /** The player's game mode, which a Java client's tab list shows. */
    readonly gamemode?: Gametype;
}

/**
 * One entity as plain facts, for a client whose edition `spawnTo` does not speak: what it is, where
 * its feet are, where it faces, and a player's profile.
 */
export interface ShownEntityFacts {
    /** The entity type clients are shown, as Bedrock names it. */
    readonly type: string;
    readonly feet: { readonly x: number; readonly y: number; readonly z: number };
    readonly yaw: number;
    readonly pitch: number;
    readonly headYaw: number;
    /** The player's profile, for a player. */
    readonly player?: ShownProfile;
    /** What it holds and wears; an entity with none shows none. */
    readonly equipment?: ShownEquipment;
    /** How it carries itself: crouched, burning and the like. */
    readonly state?: ShownEntityState;
    /** The stack a dropped item holds. */
    readonly item?: ShownStack;
    /** The points an experience orb is worth, which its size shows. */
    readonly experience?: number;
}

/** One entity as tracking reads it: where it is, how far it is followed, and how a client is shown it. */
export interface ShownEntity extends TrackableEntity {
    /**
     * Shows the entity to one client, which for most entities is an `AddActorPacket`. The packets
     * are queued before it returns, and it throws when they cannot be built; the promise settles
     * once the transport has framed them.
     */
    spawnTo(session: PlayerSession): Promise<void>;
    /** The entity as plain facts, or undefined when it cannot be shown yet. */
    describe?(): ShownEntityFacts | undefined;
}
