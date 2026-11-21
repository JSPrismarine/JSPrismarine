/**
 * `AddPaintingPacket`: adds a painting actor without a generic actor-add packet.
 *
 * The motif identifies both the artwork and its dimensions, so no generic actor metadata
 * accompanies the position. At protocols 2193 and 2225 the payload is the actor id pair, the position,
 * the wall direction and the motif name.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/add-painting-packet/
 */
import { definePacket } from '../../../wire/define';
import * as t from '../../../wire/fieldTypes';
import { vec3Structure } from '../structureTypes';

import type { PayloadOf } from '../../../wire/define';

/** The fields sent when one painting actor enters a client's world. */
export const addPaintingPacket = definePacket('AddPaintingPacket', {
    /** `Target Actor ID`: the painting's unique id, written as a ZigZag varint64. */
    targetActorId: t.varint64,
    /** `Target Runtime ID`: this connection's unsigned actor id. */
    targetRuntimeId: t.varuint64,
    /** `Position`: the painting's bottom-left corner as three little-endian floats. */
    position: vec3Structure,
    /** `Direction`: the wall direction the painting faces, as a ZigZag varint32. */
    direction: t.varint32,
    /** `Motif`: the client-known painting name, such as `Kebab`. */
    motif: t.string
});

/** Payload carried by `AddPaintingPacket`. */
export type AddPaintingPayload = PayloadOf<typeof addPaintingPacket>;
