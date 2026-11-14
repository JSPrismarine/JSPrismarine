/**
 * `ServerboundDataStorePacket`: one data store update from the client.
 *
 * The payload is a single `Update`, a `Data Store Update`. Strings are a varuint32 byte length
 * followed by UTF-8. The layout is the same at protocols 2193 and 2225.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/serverbound-data-store-packet/
 */
import { definePacket } from '../define';
import { dataStoreUpdate } from './clientboundDataStore';

import type { PayloadOf } from '../define';

/** The fields of a `ServerboundDataStorePacket`. */
export const serverboundDataStorePacket = definePacket('ServerboundDataStorePacket', {
    /** `Update`, the single data store update the client applies to the server's store. */
    update: dataStoreUpdate
});

/** Payload carried by `ServerboundDataStorePacket`. */
export type ServerboundDataStore = PayloadOf<typeof serverboundDataStorePacket>;
