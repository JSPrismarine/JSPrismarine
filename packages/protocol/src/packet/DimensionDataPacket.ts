import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import DimensionDefinition from '../structure/DimensionDefinition';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** One entry of the `Definitions` map: the dimension identifier and its definition. */
export interface DimensionDataEntry {
    /** The map key: the dimension identifier, for example "minecraft:overworld". */
    id: string;
    /** The `DimensionDefinition` the key maps to. */
    definition: DimensionDefinition;
}

/** The fields of a `DimensionDataPacket`, in wire order. */
export interface DimensionData {
    /** `Definitions`, one entry per data-driven dimension, in the order they go on the wire. */
    definitions: DimensionDataEntry[];
}

/**
 * The height bounds and generator of each data-driven dimension the server registered.
 *
 * Protocol 2193 layout, in wire order: `Definitions` as a varuint32 entry count, then per
 * entry the identifier string followed by a {@link DimensionDefinition} (`Minimum Y`,
 * `Height Range`, `Generator Type` and `Dimension Type` as ZigZag varint32, `Pack Id` as an
 * `mce::UUID`, then `Default Biome`). Strings are a varuint32 byte length followed by UTF-8.
 * From protocol 2225 on each definition also carries `Cloud Height` and `Render Clouds`;
 * the packet hands the stamped protocol version to the definition, which picks the layout.
 *
 * A vanilla server sends this only when a behavior pack registers a custom dimension. The
 * three vanilla dimensions keep their built-in heights without it.
 */
export default class DimensionDataPacket extends NetworkPacket<DimensionData> {
    public get id(): number {
        return PacketIdentifier.DIMENSION_DATA;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: DimensionData): void {
        stream.writeUnsignedVarInt(data.definitions.length);
        for (const entry of data.definitions) {
            stream.writeString(entry.id);
            entry.definition.serialize(stream, this.codecProtocol);
        }
    }

    protected deserializePayload(stream: NetworkBinaryStream): DimensionData {
        const definitions: DimensionDataEntry[] = [];
        let count = stream.readUnsignedVarInt();
        while (count-- > 0) {
            definitions.push({
                id: stream.readString(),
                definition: DimensionDefinition.read(stream, this.codecProtocol)
            });
        }

        return { definitions };
    }
}
