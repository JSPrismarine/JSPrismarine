import { NetworkStructure } from '../';
import NetworkBinaryStream from '../NetworkBinaryStream';
import { ServerAuthMovementMode } from '@jsprismarine/minecraft';

/**
 * Represents the network structure of synced player movement settings.
 * {@link https://mojang.github.io/bedrock-protocol-docs/html/SyncedPlayerMovementSettings.html}
 */
export default class SyncedPlayerMovementSettings extends NetworkStructure {
    public constructor(
        public authorityMode: ServerAuthMovementMode,
        public rewindHistorySize: number,
        public serverAuthoritativeBlockBreaking: boolean
    ) {
        super();
    }

    public serialize(stream: NetworkBinaryStream): void {
        stream.writeByte(this.authorityMode);
        stream.writeVarInt(this.rewindHistorySize);
        stream.writeBoolean(this.serverAuthoritativeBlockBreaking);
    }

    public deserialize(stream: NetworkBinaryStream): void {
        this.authorityMode = stream.readByte();
        this.rewindHistorySize = stream.readVarInt();
        this.serverAuthoritativeBlockBreaking = stream.readBoolean();
    }
}
