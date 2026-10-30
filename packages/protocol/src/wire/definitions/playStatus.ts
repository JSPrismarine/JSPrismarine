/**
 * `PlayStatusPacket`: the server's verdict on a login or spawn stage.
 *
 * One big-endian int32, unusual on a wire that is otherwise little-endian and varint-heavy; the
 * docs carry it as `int32 (BE)` and every implementation agrees.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/PlayStatus.html}
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** The `PlayStatusPacket` field list. */
export const playStatusPacket = definePacket('PlayStatusPacket', {
    /** `Status`: 0 login success, 1/2 version mismatch, 3 player spawn, … */
    status: t.i32
});

/** What `PlayStatusPacket` carries; derived from the field list. */
export type PlayStatusPayload = PayloadOf<typeof playStatusPacket>;
