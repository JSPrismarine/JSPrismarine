/**
 * `SubChunkRequestPacket`: a batch of sub chunks the client wants, relative to a center.
 *
 * The payload is the dimension type, the list of three-byte offsets, then the center position, in
 * the order on Mojang's packet page and in gophertunnel: the offsets come before the center.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/sub-chunk-request-packet/
 */
import { definePacket } from '../../../wire/define';
import * as t from '../../../wire/fieldTypes';

import type { PayloadOf } from '../../../wire/define';

/** The fields sent when a client asks for sub chunks around a center. */
export const subChunkRequestPacket = definePacket('SubChunkRequestPacket', {
    /** `Dimension Type`: 0 for the overworld, 1 for the nether, 2 for the end, as a ZigZag varint32. */
    dimensionType: t.varint32,
    /** `SubChunk Position Offset List`: requested offsets from the center, each three int8 values. */
    offsets: t.list(
        t.record({
            /** Signed X offset from the center, in sub chunks. */
            x: t.int8,
            /** Signed Y offset from the center, in sub chunks. */
            y: t.int8,
            /** Signed Z offset from the center, in sub chunks. */
            z: t.int8
        })
    ),
    /** `Center Pos`: the request center in sub chunk units, as three int32 LE values. */
    centerPos: t.record({
        /** X coordinate of the request center. */
        x: t.li32,
        /** Y coordinate of the request center. */
        y: t.li32,
        /** Z coordinate of the request center. */
        z: t.li32
    })
});

/** Payload carried by `SubChunkRequestPacket`. */
export type SubChunkRequestPayload = PayloadOf<typeof subChunkRequestPacket>;
