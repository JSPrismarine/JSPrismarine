/**
 * `PositionTrackingDBClientRequestPacket`: A lookup in the server's position tracking database.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/position-tracking-dbclient-request-packet/}
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** The `PositionTrackingDBClientRequestPacket` field list. */
export const positionTrackingDBClientRequestPacket = definePacket('PositionTrackingDBClientRequestPacket', {
    /** Action: the only value the client sends is Query. */
    action: t.uint8,
    /** Id: the tracking id to look up. */
    id: t.varint32
});

/** A lookup in the server's position tracking database. */
export type PositionTrackingDBClientRequestPayload = PayloadOf<typeof positionTrackingDBClientRequestPacket>;
