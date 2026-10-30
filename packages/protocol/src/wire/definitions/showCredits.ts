/**
 * Starts the credits for a player or reports that the player finished watching them. The
 * packet carries the player runtime id and credits state.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/show-credits-packet/}
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/**
 * The `ShowCreditsPacket` field list.
 *
 * The server sends it with `Credits State` set to `Start`, usually when a player leaves the
 * End through the exit portal. The client answers with the same packet and `Finished` once the
 * credits are over, which is the server's cue to put the player back in the world.
 */
export const showCreditsPacket = definePacket('ShowCreditsPacket', {
    /** `Player Runtime ID`: the runtime id of the player watching. */
    playerRuntimeId: t.varuint64,
    /** `Credits State`: 0 start, 1 finished. */
    creditsState: t.varint32
});

/** Starts a player's credits or reports that the player has finished watching them. */
export type ShowCreditsPayload = PayloadOf<typeof showCreditsPacket>;
