import type { NetworkBinaryStream } from '../';
import NetworkStructure from '../NetworkStructure';
import UUID from './UUID';
import { readDimensionDefinition, writeDimensionDefinition } from '../wire/structures/DimensionDefinition';
import { protocolVersion as protocolVersion2193 } from '../wire/versions/v2193';
import { Generator } from '@jsprismarine/minecraft';

/**
 * A `DimensionDefinition`: the height bounds, generator and sky of one data-driven dimension,
 * as `DimensionDataPacket` lists them.
 *
 * The wire layout lives in `wire/structures/DimensionDefinition.ts`'s declarative definition,
 * which this class walks at the protocol version it is handed: the six 2193 fields below,
 * plus `Cloud Height` and `Render Clouds` from 2225 on.
 *
 * Protocol 2193 wire order:
 * 0. `Minimum Y`: ZigZag varint32, the lowest block y of the dimension.
 * 1. `Height Range`: ZigZag varint32, how many blocks sit above `Minimum Y`.
 * 2. `Generator Type`: ZigZag varint32 with the numeric values of {@link Generator}.
 * 3. `Dimension Type`: ZigZag varint32, the dimension's runtime id.
 * 4. `Pack Id`: an `mce::UUID`, the behavior pack that registered the dimension.
 * 5. `Default Biome`: string, the biome identifier the dimension generates with.
 *
 * Protocol 2225 appends:
 * 6. `Cloud Height`: ZigZag varint32, the block y clouds render at.
 * 7. `Render Clouds`: bool, whether the dimension draws clouds.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/types/dimension-definition/}
 */
export default class DimensionDefinition extends NetworkStructure {
    /**
     * Creates a definition from its fields. Every parameter has a default so `deserialize`
     * can construct an empty instance before reading the stream.
     * @param minimumY - `Minimum Y`, the lowest block y.
     * @param heightRange - `Height Range`, the block count above `minimumY`; the top y is `minimumY + heightRange - 1`.
     * @param generatorType - `Generator Type`.
     * @param dimensionType - `Dimension Type`, the runtime id. The vanilla ones are 0 to 2; custom dimensions count from 1000.
     * @param packId - `Pack Id` of the registering behavior pack.
     * @param defaultBiome - `Default Biome` identifier, for example "minecraft:plains".
     * @param cloudHeight - `Cloud Height`, the block y clouds render at. On the wire from 2225 on.
     * @param renderClouds - `Render Clouds`, whether the dimension draws clouds. On the wire from 2225 on.
     */
    public constructor(
        public minimumY = 0,
        public heightRange = 0,
        public generatorType: Generator = Generator.UNDEFINED,
        public dimensionType = 0,
        public packId: UUID = new UUID(0n, 0n),
        public defaultBiome = '',
        public cloudHeight = 0,
        public renderClouds = false
    ) {
        super();
    }

    /**
     * Writes the fields the protocol version puts on the wire, in layout order.
     * @param stream - The stream to write to.
     * @param protocolVersion - The negotiated protocol version; defaults to 2193.
     */
    public serialize(stream: NetworkBinaryStream, protocolVersion = protocolVersion2193): void {
        writeDimensionDefinition(stream, this, protocolVersion);
    }

    /**
     * Reads them back in the same order, filling version-absent fields with their fallbacks.
     * @param stream - The stream to read from.
     * @param protocolVersion - The negotiated protocol version; defaults to 2193.
     */
    public deserialize(stream: NetworkBinaryStream, protocolVersion = protocolVersion2193): void {
        Object.assign(this, readDimensionDefinition(stream, protocolVersion));
    }

    /**
     * Reads a definition in the layout of the given protocol version.
     * @param stream - The stream to read from.
     * @param protocolVersion - The negotiated protocol version; defaults to 2193.
     */
    public static read(stream: NetworkBinaryStream, protocolVersion = protocolVersion2193): DimensionDefinition {
        const definition = new DimensionDefinition();
        definition.deserialize(stream, protocolVersion);
        return definition;
    }
}
