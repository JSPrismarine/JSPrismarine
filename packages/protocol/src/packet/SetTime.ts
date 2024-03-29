import { NetworkBinaryStream, NetworkPacket, PacketIdentifier } from '../';

interface PacketData {
    time: number;
}

/**
 * 	Every so often (and at login) the server sends the current time to the client, and additionally the client can set the server time through 2 commands: DayLockCommand and TimeCommand.
 * {@link https://mojang.github.io/bedrock-protocol-docs/html/SetTimePacket.html}
 */
export default class SetTimePacket extends NetworkPacket<PacketData> {
    get id(): number {
        return PacketIdentifier.SET_TIME;
    }

    protected serializePayload(stream: NetworkBinaryStream, packetData: PacketData): void {
        stream.writeVarInt(packetData.time);
    }

    protected deserializePayload(stream: NetworkBinaryStream): PacketData {
        return {
            time: stream.readVarInt()
        };
    }
}
