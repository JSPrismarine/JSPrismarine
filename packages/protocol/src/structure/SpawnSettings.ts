import { NetworkStructure } from '../';
import NetworkBinaryStream from '../NetworkBinaryStream';
import { Dimension, SpawnBiome } from '@jsprismarine/minecraft';

/**
 * Represents the network structure of the spawn settings of a world.
 * {@link https://mojang.github.io/bedrock-protocol-docs/html/SpawnSettings.html}
 */
export default class SpawnSettings extends NetworkStructure {
    public constructor(
        private readonly biomeType: SpawnBiome,
        private readonly userDefinedBiomeName: string,
        private readonly dimension: Dimension
    ) {
        super();
    }

    public serialize(stream: NetworkBinaryStream): void {
        stream.writeShortLE(this.biomeType);
        stream.writeString(this.userDefinedBiomeName);
        stream.writeVarInt(this.dimension);
    }

    public deserialize(stream: NetworkBinaryStream): SpawnSettings {
        return new SpawnSettings(stream.readShortLE(), stream.readString(), stream.readVarInt());
    }
}
