/**
 * `NetworkStackLatencyPacket`: A ping the client uses for its debug latency graph.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/network-stack-latency-packet/}
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** The `NetworkStackLatencyPacket` field list. */
export const networkStackLatencyPacket = definePacket('NetworkStackLatencyPacket', {
    /** The sender's clock when it built the packet, in its own units. */
    creationTime: t.lu64,
    /** `true` when the server originated the ping; the client echoes the server's value. */
    isFromServer: t.bool
});

/** A ping the client uses for its debug latency graph. */
export type NetworkStackLatencyPayload = PayloadOf<typeof networkStackLatencyPacket>;
