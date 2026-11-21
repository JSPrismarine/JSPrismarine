/**
 * `ServerPlayerPostMovePositionPacket`: the position the server simulated for its player at the
 * end of movement. It is used only by debug draw and is omitted when debug draw is unavailable.
 *
 * The payload is one `Pos`, three little-endian floats.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/server-player-post-move-position-packet/
 */
import { definePacket } from '../../../wire/define';
import { vec3Structure } from '../structureTypes';

import type { PayloadOf } from '../../../wire/define';

/** The fields sent when the server reports its player's simulated position. */
export const serverPlayerPostMovePositionPacket = definePacket('ServerPlayerPostMovePositionPacket', {
    /** `Pos`: the simulated position, encoded as three little-endian floats. */
    pos: vec3Structure
});

/** Payload carried by `ServerPlayerPostMovePositionPacket`. */
export type ServerPlayerPostMovePositionPayload = PayloadOf<typeof serverPlayerPostMovePositionPacket>;
