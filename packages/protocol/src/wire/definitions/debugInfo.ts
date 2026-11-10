/**
 * `DebugInfoPacket`: A blob of server debug text tied to an actor.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/debug-info-packet/}
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** The `DebugInfoPacket` field list. */
export const debugInfoPacket = definePacket('DebugInfoPacket', {
    /** Actor Id: the actor the debug data describes. */
    actorId: t.varint64,
    /** Data: the debug payload. */
    data: t.string
});

/** A blob of server debug text tied to an actor. */
export type DebugInfoPayload = PayloadOf<typeof debugInfoPacket>;
