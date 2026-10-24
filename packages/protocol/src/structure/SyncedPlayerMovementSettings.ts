import type { NetworkBinaryStream } from '../';
import NetworkStructure from '../NetworkStructure';

/**
 * The movement settings a server syncs to a joining client (StartGamePacket field 10).
 *
 * Protocol 2193 wire order:
 * 0. Rewind History Size: varint32, how many ticks of input the client keeps for corrections.
 * 1. Server Authoritative Block Breaking: boolean.
 *
 * Nothing comes before the rewind size. The movement mode byte that used to lead this
 * structure left the wire with 1.21.90, and a server that still writes it puts every later
 * field of the StartGame packet one byte off.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.50/types/synced-player-movement-settings/}
 */
export default class SyncedPlayerMovementSettings extends NetworkStructure {
    public constructor(
        public rewindHistorySize: number,
        public serverAuthoritativeBlockBreaking: boolean
    ) {
        super();
    }

    public serialize(stream: NetworkBinaryStream): void {
        stream.writeVarInt(this.rewindHistorySize);
        stream.writeBoolean(this.serverAuthoritativeBlockBreaking);
    }

    public deserialize(stream: NetworkBinaryStream): void {
        this.rewindHistorySize = stream.readVarInt();
        this.serverAuthoritativeBlockBreaking = stream.readBoolean();
    }
}
