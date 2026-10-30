/**
 * Things that happen to an actor: a one-off event, a pickup, a removal.
 *
 * Layouts follow each packet's docs page at 1.26.51 and are unchanged since protocol 2193.
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

/** What `ActorEventPacket` carries. */
export type ActorEventPayload = PayloadOf<typeof actorEventPacket>;

/** The `RemoveActorPacket` field list. */
export const removeActorPacket = definePacket('RemoveActorPacket', {
    /** `Target Actor ID`: the unique id, not the runtime one. */
    uniqueEntityId: t.varint64
});

/** What `RemoveActorPacket` carries. */
export type RemoveActorPayload = PayloadOf<typeof removeActorPacket>;

/** The `TakeItemActorPacket` field list. */
export const takeItemActorPacket = definePacket('TakeItemActorPacket', {
    /** `Item Runtime ID`: the item entity being taken. */
    itemRuntimeEntityId: t.varuint64,
    /** `Actor Runtime ID`: who is taking it. */
    takerRuntimeEntityId: t.varuint64
});

/** What `TakeItemActorPacket` carries. */
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

/** What `SetActorLinkPacket` carries. */
export type SetActorLinkPayload = PayloadOf<typeof setActorLinkPacket>;
