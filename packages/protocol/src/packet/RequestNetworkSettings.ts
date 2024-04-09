import type { NetworkBinaryStream } from '../';
import { NetworkPacket, PacketIdentifier } from '../';

export interface PacketData {
    clientNetworkVersion: number;
}

export default class RequestNetworkSettingsPacket extends NetworkPacket<PacketData> {
    get id(): number {
        return PacketIdentifier.REQUEST_NETWORK_SETTINGS;
    }

    protected serializePayload(stream: NetworkBinaryStream, packetData: PacketData): void {
        stream.writeInt(packetData.clientNetworkVersion);
    }

    protected deserializePayload(stream: NetworkBinaryStream): PacketData {
        return {
            clientNetworkVersion: stream.readInt()
        };
    }
}
