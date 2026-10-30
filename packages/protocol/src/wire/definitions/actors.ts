/**
 * Things that happen to an actor: a one-off event, a pickup, a removal.
 *
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/#packets}
 */
import { definePacket } from '../define';
import { actorLink } from './addActor';
import * as t from '../fieldTypes';
import { vector3 } from '../structureTypes';

import type { PayloadOf } from '../define';

/**
 * The `ActorEventPacket` field list.
 *
 * `Fire At Position` is an optional, and its presence byte travels whether or not a position
 * follows: a client that reads past the end of a packet drops the connection.
 */
export const actorEventPacket = definePacket('ActorEventPacket', {
    /** `Target Runtime ID`. */
    runtimeEntityId: t.varuint64,
    /** `Event ID`: an `ActorEvent`. */
    event: t.uint8,
    /** `Data`: meaning depends on the event, zero for the ones that carry nothing. */
    data: t.varint32,
    /** `Fire At Position`: where the event happens, when that is not the actor itself. */
    fireAtPosition: t.optional(vector3)
});

/** Triggers an actor event, with optional coordinates for events that happen away from it. */
export type ActorEventPayload = PayloadOf<typeof actorEventPacket>;

/** The `RemoveActorPacket` field list. */
export const removeActorPacket = definePacket('RemoveActorPacket', {
    /** `Target Actor ID`: the unique id, not the runtime one. */
    uniqueEntityId: t.varint64
});

/** Removes an actor by its unique id. */
export type RemoveActorPayload = PayloadOf<typeof removeActorPacket>;

/** The `TakeItemActorPacket` field list. */
export const takeItemActorPacket = definePacket('TakeItemActorPacket', {
    /** `Item Runtime ID`: the item entity being taken. */
    itemRuntimeEntityId: t.varuint64,
    /** `Actor Runtime ID`: who is taking it. */
    takerRuntimeEntityId: t.varuint64
});

/** Identifies the item actor being picked up and the actor taking it. */
export type TakeItemActorPayload = PayloadOf<typeof takeItemActorPacket>;

/**
 * The `SetActorLinkPacket` field list.
 *
 * Both sides send it: a client sends two at a time when a player mounts something. A link
 * sent this way reaches only the clients that receive it; a player who sees the pair later
 * needs the link in the `AddActorPacket` or `AddPlayerPacket` that spawns them.
 */
export const setActorLinkPacket = definePacket('SetActorLinkPacket', {
    /** `Link`: the riding relationship to set or clear. */
    link: actorLink
});

/** Creates or clears a relationship between two actors, such as riding. */
export type SetActorLinkPayload = PayloadOf<typeof setActorLinkPacket>;

/**
 * The `MobEffectPacket` field list.
 *
 * Every field travels whatever the `Event ID` is: a `Remove` carries the amplifier and the
 * duration it is dropping, not a shortened body.
 */
export const mobEffectPacket = definePacket('MobEffectPacket', {
    /** `Target Runtime ID`: the actor the effect is on. */
    targetRuntimeId: t.varuint64,
    /** `Event ID`: a `MobEffectEvent`, what to do with the effect. */
    eventId: t.uint8,
    /** `Effect ID`: the status effect's number. */
    effectId: t.varint32,
    /** `Effect Amplifier`: one below the level shown in game, and may be negative. */
    effectAmplifier: t.varint32,
    /** `Show Particles`: whether viewers see particles around the actor. */
    showParticles: t.bool,
    /** `Effect Duration Ticks`: at 20 ticks per second. A negative duration never expires. */
    effectDurationTicks: t.varint32,
    /** `Tick`: the `PlayerInputTick` the change belongs to, zero for anyone else's actor. */
    tick: t.varuint64,
    /** `Ambient`: set for beacon and conduit effects. */
    ambient: t.bool
});

/** Adds, updates, or removes a status effect on an actor. */
export type MobEffectPayload = PayloadOf<typeof mobEffectPacket>;
