/**
 * `ClientCacheMissResponsePacket`: the chunk blobs a client said it did not have.
 *
 * The payload is a varuint32 count of entries, each a `Blob Id` as a uint64 LE and `Blob Data`
 * as a string, which is a varuint32 byte length then the raw bytes.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/client-cache-miss-response-packet/
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** The fields sent when the server delivers blobs a client reported as missing. */
export const clientCacheMissResponsePacket = definePacket('ClientCacheMissResponsePacket', {
    /** `Missing Blobs`: each blob's hash and bytes, in no particular order. */
    blobs: t.list(
        t.record({
            /** `Blob Id`: the XXHash64 of the blob data as a little-endian uint64. */
            blobId: t.lu64,
            /** `Blob Data`: sub chunk or biome bytes, a varuint32 length then the bytes. */
            blobData: t.byteArray
        })
    )
});

/** Payload carried by `ClientCacheMissResponsePacket`. */
export type ClientCacheMissResponsePayload = PayloadOf<typeof clientCacheMissResponsePacket>;
