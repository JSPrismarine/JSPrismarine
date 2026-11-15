/**
 * `ServerboundDataStorePacket`: one data store update from the client.
 *
 * The payload is a single `Update`, a `Data Store Update`. Strings are a varuint32 byte length
 * followed by UTF-8.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/serverbound-data-store-packet/
 */
import { definePacket, gated } from '../define';
import { SINCE_2259, UNTIL_2259 } from '../wireGates';
import { dataStoreUpdate, dataStoreVariableUpdate } from './clientboundDataStore';

import type DataStoreUpdate from '../../structure/DataStoreUpdate';
import type { DataStoreVariableUpdate } from './clientboundDataStore';

import type { PayloadOf } from '../define';

/** The fields of a `ServerboundDataStorePacket`. */
export const serverboundDataStorePacket = definePacket('ServerboundDataStorePacket', {
    /** `Update` before protocol 2259, the single data store update the client applies. `null` from 2259. */
    update: gated<DataStoreUpdate | null>(UNTIL_2259, dataStoreUpdate, null),
    /** `Update` from protocol 2259, keyed by variable name. `null` before 2259. */
    variableUpdate: gated<DataStoreVariableUpdate | null>(SINCE_2259, dataStoreVariableUpdate, null)
});

/** Payload carried by `ServerboundDataStorePacket`. */
export type ServerboundDataStore = PayloadOf<typeof serverboundDataStorePacket>;
