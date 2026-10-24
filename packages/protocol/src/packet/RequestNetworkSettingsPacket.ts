import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The one field of `RequestNetworkSettingsPacket`. */
export interface RequestNetworkSettings {
    /** `ClientNetworkVersion`: the protocol version the client speaks. */
    protocolVersion: number;
}

/**
 * The first thing a client says, and the only packet that travels before compression has
 * been negotiated in either direction.
 *
 * Protocol 2193 layout after the header: `ClientNetworkVersion`, a big-endian int32. Nothing
 * else, and Mojang's page says nothing else may be added. It is not a varint on purpose: a
 * server of another version still has to read it to refuse the connection with the right
 * `PlayStatus`.
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
