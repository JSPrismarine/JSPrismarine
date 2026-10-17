import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

export interface RequestNetworkSettings {
    protocolVersion: number;
}

/**
 * The first thing a client says, and the only packet that travels before compression has
 * been negotiated in either direction.
 *
 * The protocol version is a plain big endian int rather than a varint, which is deliberate
 * on Mojang's part: it is the one field a server of a different version still has to be able
 * to read in order to refuse the connection intelligibly.
 */
export default class RequestNetworkSettingsPacket extends NetworkPacket<RequestNetworkSettings> {
    public get id(): number {
        return PacketIdentifier.REQUEST_NETWORK_SETTINGS;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: RequestNetworkSettings): void {
        stream.writeInt(data.protocolVersion);
    }

    protected deserializePayload(stream: NetworkBinaryStream): RequestNetworkSettings {
        return { protocolVersion: stream.readInt() };
    }
}
