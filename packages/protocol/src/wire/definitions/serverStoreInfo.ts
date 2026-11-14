/**
 * `ServerStoreInfoPacket`: points the client's marketplace entry point at a server's store.
 *
 * The payload is the one `client_store_entry_point_configuration` field, an optional
 * `ClientStoreEntryPointConfig`: a presence `bool`, then `storeId` and `storeName`, both strings,
 * when present. The 1.26.50 page prints the field as plain and the 1.26.60 page as optional; the
 * 1.26.60 changelog says it "is now optional", which Mojang's note on the preview.21 build gives
 * as a documentation correction, so the presence byte is on the wire at both protocols
 * (`docs/research/protocol-2225-delta.md`, "Enum and data changes outside the packet layer").
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/server-store-info-packet/
 */
import ClientStoreEntryPointConfig from '../../structure/ClientStoreEntryPointConfig';
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/**
 * `ClientStoreEntryPointConfig`: `storeId` then `storeName`. Callers hold the structure class,
 * whose own codec needs a `NetworkBinaryStream`, so this writes the same two strings itself.
 */
const clientStoreEntryPointConfig = t.custom<ClientStoreEntryPointConfig>(
    'ClientStoreEntryPointConfig',
    (stream, value) => {
        t.string.write(stream, value.storeId);
        t.string.write(stream, value.storeName);
    },
    (stream) => new ClientStoreEntryPointConfig(t.string.read(stream), t.string.read(stream))
);

/** The fields sent to change the store a client's marketplace entry point opens. */
export const serverStoreInfoPacket = definePacket('ServerStoreInfoPacket', {
    /**
     * `client_store_entry_point_configuration`: the store the client's marketplace entry point
     * opens, or `null` when the packet carries none.
     */
    clientStoreEntryPointConfiguration: t.optional(clientStoreEntryPointConfig)
});

/** The fields of a `ServerStoreInfoPacket`, in wire order. */
export type ServerStoreInfo = PayloadOf<typeof serverStoreInfoPacket>;
