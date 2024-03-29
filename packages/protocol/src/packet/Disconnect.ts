import { NetworkPacket, PacketIdentifier, NetworkBinaryStream } from '../';
import { DisconnectReason } from '@jsprismarine/minecraft';

interface BasePacketData {
    reason: DisconnectReason;
    skipMessage: boolean;
}

interface PacketDataWithMessage extends BasePacketData {
    skipMessage: false;
    message: string;
}

interface PacketDataWithoutMessage extends BasePacketData {
    skipMessage: true;
}

type PacketData = PacketDataWithMessage | PacketDataWithoutMessage;

export default class DisconnectPacket extends NetworkPacket<PacketData> {
    get id(): number {
        return PacketIdentifier.DISCONNECT;
    }

    protected serializePayload(stream: NetworkBinaryStream, packetData: PacketData): void {
        stream.writeVarInt(packetData.reason);
        stream.writeBoolean(packetData.skipMessage);
        if (!packetData.skipMessage) {
            stream.writeString(packetData.message);
        }
    }

    protected deserializePayload(stream: NetworkBinaryStream): PacketData {
        const reason = stream.readVarInt() as DisconnectReason;
        const skipMessage = stream.readBoolean();
        if (skipMessage) {
            return { reason, skipMessage };
        }
        return { reason, skipMessage, message: stream.readString() };
    }
}
