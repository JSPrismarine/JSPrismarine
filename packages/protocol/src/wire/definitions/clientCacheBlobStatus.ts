/**
 * `ClientCacheBlobStatusPacket`: the client's report of which chunk blobs it has and which it lacks.
 *
 * Each list carries its own count: a `varint` count of `lu64` hashes, Missing Ids first, then
 * Found Ids.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/client-cache-blob-status-packet/}
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** The `ClientCacheBlobStatusPacket` field list. */
export const clientCacheBlobStatusPacket = definePacket('ClientCacheBlobStatusPacket', {
    /** `Missing Ids`: blob hashes the client needs the server to send in full. */
    missingIds: t.list(t.lu64),
    /** `Found Ids`: blob hashes the client already holds. */
    foundIds: t.list(t.lu64)
});

/** Payload carried by `ClientCacheBlobStatusPacket`. */
export type ClientCacheBlobStatusPayload = PayloadOf<typeof clientCacheBlobStatusPacket>;
