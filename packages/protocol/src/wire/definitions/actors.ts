/**
 * Things that happen to an actor: a one-off event, a pickup, a removal.
 *
 * Layouts follow each packet's docs page at 1.26.51 and are unchanged since protocol 2193.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/#packets}
 */
import { definePacket } from '../define';
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
