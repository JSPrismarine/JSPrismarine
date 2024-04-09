import type NetworkBinaryStream from '@/NetworkBinaryStream';
import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

export interface PacketData {
    clientRequestTimestamp: bigint;
    serverResponseTimestamp: bigint;
}

export class TickSyncPacket extends NetworkPacket<PacketData> {
    get id() {
        return PacketIdentifier.TICK_SYNC;
    }

    protected serializePayload(stream: NetworkBinaryStream, packetData: PacketData): void {
        stream.writeLongLE(packetData.clientRequestTimestamp);
        stream.writeLongLE(packetData.serverResponseTimestamp);
    }

    protected deserializePayload(stream: NetworkBinaryStream): PacketData {
        return {
            clientRequestTimestamp: stream.readLongLE(),
            serverResponseTimestamp: stream.readLongLE()
        };
    }
}
