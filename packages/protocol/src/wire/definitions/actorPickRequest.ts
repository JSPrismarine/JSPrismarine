/**
 * `ActorPickRequestPacket`: A creative player middle-clicking an actor to get its spawn egg.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.50/packets/actor-pick-request-packet/}
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** The `ActorPickRequestPacket` field list. */
export const actorPickRequestPacket = definePacket('ActorPickRequestPacket', {
    /** Unique id of the picked actor. */
    actorId: t.li64,
    /** Empty hotbar slots, which decides whether the pick replaces the held item. */
    maxSlots: t.uint8,
    /** `true` when the client wants the actor's data on the egg. */
    withData: t.bool
});

/** A creative player middle-clicking an actor to get its spawn egg. */
export type ActorPickRequestPayload = PayloadOf<typeof actorPickRequestPacket>;
