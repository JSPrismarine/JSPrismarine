/**
 * `AvailableActorIdentifiersPacket` described as a declarative field list; layout unchanged
 * between protocols 2193 and 2225.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/available-actor-identifiers-packet/}
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

/**
 * `Identifier List`: one network NBT compound with no length prefix, running to the end of the
 * packet. This server defines no custom actors and replays CloudburstMC's dump of the vanilla
 * compound verbatim, so the bytes travel untouched.
 */
const networkNbtTail = t.custom<Buffer>(
    'NetworkNbtTail',
    (s, v) => s.write(v),
    (s) => s.readRemaining()
);

/**
 * The `AvailableActorIdentifiersPacket` field list: every actor type the client may be asked
 * to render, sent once at world start.
 */
export const availableActorIdentifiersPacket = definePacket('AvailableActorIdentifiersPacket', {
    /** `Identifier List` as network NBT; see {@link networkNbtTail}. */
    identifiers: networkNbtTail
});
