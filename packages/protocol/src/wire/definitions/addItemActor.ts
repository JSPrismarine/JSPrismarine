/**
 * `AddItemActorPacket`: introduces a dropped item actor to the client world.
 *
 * The payload is the actor id pair, its `NetworkItemStackDescriptor`, position, velocity,
 * synchronized actor data, and whether fishing produced it, in the order on Mojang's packet
 * page. Actor ids use variable-length encoding: the target id is signed, while the runtime id
 * is unsigned.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/add-item-actor-packet/
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';
import { itemStackDescriptor, metadata, vector3 } from '../structureTypes';

import type { PayloadOf } from '../define';

/** The fields sent when one dropped item actor enters a client's world. */
export const addItemActorPacket = definePacket('AddItemActorPacket', {
    /** `Target Actor ID`: the unique id, written as a ZigZag varint64. */
    targetActorId: t.varint64,
    /** `Target Runtime ID`: this connection's unsigned actor id. */
    runtimeEntityId: t.varuint64,
    /** `Item`: the complete item stack descriptor, including its user data. */
    item: itemStackDescriptor,
    /** `Position`: the actor's initial location as three little-endian floats. */
    position: vector3,
    /** `Velocity`: the actor's initial motion as three little-endian floats. */
    motion: vector3,
    /** `Entity Data`: synchronized metadata needed to initialize the actor. */
    metadata,
    /** `Is From Fishing`: whether the dropped item came from a fishing action. */
    isFromFishing: t.bool
});

/** Payload carried by `AddItemActorPacket`. */
export type AddItemActorPayload = PayloadOf<typeof addItemActorPacket>;
