/**
 * `ClientMovementPredictionSyncPacket`: the client's view of the movement inputs it predicts
 * with, sent after it has applied a server correction under server-authoritative movement.
 *
 * Mojang's page leaves `MovementAttributesComponent` empty; the nine floats after the bounding
 * box are what gophertunnel reads at protocol 2193.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.50/packets/client-movement-prediction-sync-packet/
 */
import { ActorFlags } from '@jsprismarine/minecraft/ActorFlags';
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';
import { ProtocolWireErrors } from '@jsprismarine/errors/protocol/wire';

/** Most bytes an actor flag bit set needs: seven flag bits per byte, `ActorFlags.COUNT` flags. */
const MAX_FLAG_BYTES = Math.ceil(ActorFlags.COUNT / 7);

/**
 * `Actor Data Flag`: a bit set written seven bits per byte, low bits first, with a high
 * continuation bit, like a LEB128 varint of unbounded width. Reading throws once more bytes
 * arrive than `ActorFlags.COUNT` flags can need.
 */
const actorFlagBits = t.custom<bigint>(
    'ActorFlagBits',
    (s, bits) => {
        let rest = bits;
        do {
            const group = Number(rest & 0x7fn);
            rest >>= 7n;
            s.writeByte(rest > 0n ? group | 0x80 : group);
        } while (rest > 0n);
    },
    (s) => {
        let bits = 0n;
        for (let index = 0; index < MAX_FLAG_BYTES; index++) {
            const byte = s.readByte();
            bits |= BigInt(byte & 0x7f) << BigInt(index * 7);
            if ((byte & 0x80) === 0) return bits;
        }

        throw new ProtocolWireErrors.ActorFlagsTooLong({ maxFlagBytes: MAX_FLAG_BYTES });
    }
);

/** The `ClientMovementPredictionSyncPacket` field list. */
export const clientMovementPredictionSyncPacket = definePacket('ClientMovementPredictionSyncPacket', {
    /** `Actor Data Flag`: actor flag bits, bit `n` set when `ActorFlags` member `n` is on. */
    actorFlags: actorFlagBits,
    /** `Actor Bounding Box`: the scale, as a little-endian float. */
    boundingBoxScale: t.lf32,
    /** `Actor Bounding Box`: the width, as a little-endian float. */
    boundingBoxWidth: t.lf32,
    /** `Actor Bounding Box`: the height, as a little-endian float. */
    boundingBoxHeight: t.lf32,
    /** `Movement Attributes`: movement speed, as a little-endian float. */
    movementSpeed: t.lf32,
    /** `Movement Attributes`: underwater movement speed, as a little-endian float. */
    underwaterMovementSpeed: t.lf32,
    /** `Movement Attributes`: lava movement speed, as a little-endian float. */
    lavaMovementSpeed: t.lf32,
    /** `Movement Attributes`: jump strength, as a little-endian float. */
    jumpStrength: t.lf32,
    /** `Movement Attributes`: health, as a little-endian float. */
    health: t.lf32,
    /** `Movement Attributes`: hunger, as a little-endian float. */
    hunger: t.lf32,
    /** `Movement Attributes`: friction modifier, as a little-endian float. */
    frictionModifier: t.lf32,
    /** `Movement Attributes`: bounciness, as a little-endian float. */
    bounciness: t.lf32,
    /** `Movement Attributes`: air drag modifier, as a little-endian float. */
    airDragModifier: t.lf32,
    /** `Actor Unique ID`: the actor the client is predicting, normally its own player, as a ZigZag varint64. */
    actorUniqueId: t.varint64,
    /** `Actor Flying State`: whether the actor is flying. */
    actorFlyingState: t.bool
});

/** Payload carried by `ClientMovementPredictionSyncPacket`. */
export type ClientMovementPredictionSyncPayload = PayloadOf<typeof clientMovementPredictionSyncPacket>;
