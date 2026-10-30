/**
 * The client's protocol-version request, sent before compression is agreed. The server reads
 * its version and replies with `NetworkSettingsPacket`, defined in `worldStatus.ts`.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/request-network-settings-packet/}
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/**
 * The `RequestNetworkSettingsPacket` field list.
 *
 * `ClientNetworkVersion` is a big endian int32, not a varint, on purpose: a server speaking
 * another protocol still has to read it so it can refuse the connection with the right
 * `PlayStatus`. Mojang's page says nothing else may be added here.
 */
export const requestNetworkSettingsPacket = definePacket('RequestNetworkSettingsPacket', {
    /** `ClientNetworkVersion`: the protocol version the client speaks. */
    protocolVersion: t.i32
});

/** Announces the client's Bedrock protocol version before network settings are negotiated. */
export type RequestNetworkSettingsPayload = PayloadOf<typeof requestNetworkSettingsPacket>;
