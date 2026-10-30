/**
 * What a player does that is not movement: an action on a block, a game type change, an emote.
 *
 * Layouts follow each packet's docs page at 1.26.51 and are unchanged since protocol 2193.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/#packets}
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/**
 * The `PlayerActionPacket` field list.
 *
 * Both positions are `BlockPos`, three ZigZag varints with a signed y. The y used to be
 * unsigned on the way up from the client, and has not been since 1.26.10: read unsigned, a
 * ZigZag y comes out doubled and anything below sea level as a number in the billions.
 */
export const playerActionPacket = definePacket('PlayerActionPacket', {
    /** `Player Runtime ID`: who acted. */
    runtimeEntityId: t.varuint64,
    /** `Action`: a `PlayerActionType`. */
    action: t.varint32,
    /** `Block Position`: the block acted on, zero for the actions that name no block. */
    blockPosition: t.blockPos,
    /** `Result Pos`: where the client ended up, for the actions that move it. */
    resultPosition: t.blockPos,
    /** `Face`: which side of the block, or zero. */
    blockFace: t.varint32
});

/** What `PlayerActionPacket` carries. */
export type PlayerActionPayload = PayloadOf<typeof playerActionPacket>;
