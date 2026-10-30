import { layoutAt, requestNetworkSettingsPacket } from '@jsprismarine/protocol';

import FieldNetworkPacket from '@jsprismarine/protocol/FieldNetworkPacket';

/**
 * The first packet of a connection, and the only one sent before compression is agreed.
 *
 * The wire layout lives in `@jsprismarine/protocol`'s `requestNetworkSettingsPacket`
 * definition: a single `ClientNetworkVersion`, as a big endian int32.
 *
 * **Bound To:** Server
 */
export default class RequestNetworkSettingsPacket extends FieldNetworkPacket {
    /** `ClientNetworkVersion`, the protocol version the client speaks. */
    public protocolVersion!: number;

    /** Writes `ClientNetworkVersion`. */
    public encodePayload(): void {
        layoutAt(requestNetworkSettingsPacket, this.codecProtocol).encode(this, {
            protocolVersion: this.protocolVersion
        });
    }

    /** Reads `ClientNetworkVersion`. */
    public decodePayload(): void {
        this.protocolVersion = layoutAt(requestNetworkSettingsPacket, this.codecProtocol).decode(this).protocolVersion;
    }
}
