import type { NetworkBinaryStream } from '../';
import NetworkStructure from '../NetworkStructure';
import UUID from './UUID';
import { Generator } from '@jsprismarine/minecraft';

/**
 * A `DimensionDefinition`: the height bounds and generator of one data-driven dimension, as
 * `DimensionDataPacket` lists them.
 *
 * Protocol 2193 wire order:
 * 0. `Minimum Y`: ZigZag varint32, the lowest block y of the dimension.
 * 1. `Height Range`: ZigZag varint32, how many blocks sit above `Minimum Y`.
 * 2. `Generator Type`: ZigZag varint32 with the numeric values of {@link Generator}.
 * 3. `Dimension Type`: ZigZag varint32, the dimension's runtime id.
 * 4. `Pack Id`: an `mce::UUID`, the behavior pack that registered the dimension.
 * 5. `Default Biome`: string, the biome identifier the dimension generates with.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/types/dimension-definition/}
 */
export default class DimensionDefinition extends NetworkStructure {
    /**
     * Creates a definition from its fields. Every parameter has a default so the static
     * `deserialize` can construct an empty instance before reading the stream.
     * @param minimumY - `Minimum Y`, the lowest block y.
     * @param heightRange - `Height Range`, the block count above `minimumY`; the top y is `minimumY + heightRange - 1`.
     * @param generatorType - `Generator Type`.
     * @param dimensionType - `Dimension Type`, the runtime id. The vanilla ones are 0 to 2; custom dimensions count from 1000.
     * @param packId - `Pack Id` of the registering behavior pack.
     * @param defaultBiome - `Default Biome` identifier, for example "minecraft:plains".
     */
    public constructor(
        public minimumY = 0,
        public heightRange = 0,
        public generatorType: Generator = Generator.UNDEFINED,
        public dimensionType = 0,
        public packId: UUID = new UUID(0n, 0n),
        public defaultBiome = ''
    ) {
        super();
    }

    /** Writes the six fields in wire order. */
    public serialize(stream: NetworkBinaryStream): void {
        stream.writeVarInt(this.minimumY);
        stream.writeVarInt(this.heightRange);
        stream.writeVarInt(this.generatorType);
        stream.writeVarInt(this.dimensionType);
        this.packId.serialize(stream);
        stream.writeString(this.defaultBiome);
    }

    /** Reads the six fields in wire order. */
    public deserialize(stream: NetworkBinaryStream): void {
        this.minimumY = stream.readVarInt();
        this.heightRange = stream.readVarInt();
        this.generatorType = stream.readVarInt();
        this.dimensionType = stream.readVarInt();
        this.packId = UUID.deserialize(stream);
        this.defaultBiome = stream.readString();
    }
}
