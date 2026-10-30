/**
 * The view distance exchange: the client's `RequestChunkRadius` and the server's
 * `ChunkRadiusUpdated` answer.
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

/** Tells the client the view distance the server granted, measured in chunks. */
export type ChunkRadiusUpdatedPayload = PayloadOf<typeof chunkRadiusUpdatedPacket>;

/**
 * The `RequestChunkRadiusPacket` field list.
 *
 * A retail client discards every `LevelChunk` that arrives before the server's answer, so the
 * answer has to come before the chunks.
 */
export const requestChunkRadiusPacket = definePacket('RequestChunkRadiusPacket', {
    /** `Chunk Radius`: how far the client wants to see, in chunks. */
    radius: t.varint32,
    /** `Max ChunkRadius`: the largest radius the client's hardware can handle. Zero means unstated. */
    maxRadius: t.uint8
});

/** Requests a view distance and reports the largest radius the client can handle. */
export type RequestChunkRadiusPayload = PayloadOf<typeof requestChunkRadiusPacket>;
