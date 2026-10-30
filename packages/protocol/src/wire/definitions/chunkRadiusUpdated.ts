/**
 * `ChunkRadiusUpdatedPacket`: the view distance the server settled on, answering the client's
 * `RequestChunkRadius`.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/ChunkRadiusUpdated.html}
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** The `ChunkRadiusUpdatedPacket` field list. */
export const chunkRadiusUpdatedPacket = definePacket('ChunkRadiusUpdatedPacket', {
    /** `Chunk Radius`: the granted view distance, in chunks. */
    radius: t.varint32
});

/** What `ChunkRadiusUpdatedPacket` carries; derived from the field list. */
export type ChunkRadiusUpdatedPayload = PayloadOf<typeof chunkRadiusUpdatedPacket>;
