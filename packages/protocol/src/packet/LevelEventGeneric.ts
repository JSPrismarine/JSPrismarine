import { ByteOrder, NBTTagCompound } from '@jsprismarine/nbt';
import type NetworkBinaryStream from '../NetworkBinaryStream';
import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import type { LevelEvent } from '@jsprismarine/minecraft';

export interface PacketData {
    eventId: LevelEvent;
    eventData: NBTTagCompound;
}

/**
 * {@link https://mojang.github.io/bedrock-protocol-docs/html/LevelEventGenericPacket.html}
 */
export class LevelEventGenericPacket extends NetworkPacket<PacketData> {
    get id(): number {
        return PacketIdentifier.LEVEL_EVENT_GENERIC;
    }

    protected serializePayload(stream: NetworkBinaryStream, packetData: PacketData): void {
        stream.writeVarInt(packetData.eventId);
        packetData.eventData.writeToStream(stream, ByteOrder.LITTLE_ENDIAN, true);
    }

    protected deserializePayload(stream: NetworkBinaryStream): PacketData {
        return {
            eventId: stream.readVarInt(),
            eventData: NBTTagCompound.readFromStream(stream, ByteOrder.LITTLE_ENDIAN, true)
        };
    }
}
