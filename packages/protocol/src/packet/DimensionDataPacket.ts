import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { dimensionDataPacket } from '../wire/definitions/dimensionData';
import { layoutAt } from '../wire/WireLayout';

import type NetworkBinaryStream from '../NetworkBinaryStream';
import type { DimensionDataEntry } from '../wire/definitions/dimensionData';

export type { DimensionDataEntry };

/** The fields of a `DimensionDataPacket`, in wire order. */
export interface DimensionData {
    /** `Definitions`, one entry per data-driven dimension, in the order they go on the wire. */
    definitions: DimensionDataEntry[];
}

/**
 * The height bounds and generator of each data-driven dimension the server registered.
 *
 * Protocol 2193 layout, in wire order: `Definitions` as a varuint32 entry count, then per
 * entry the identifier string followed by a `DimensionDefinition` (`Minimum Y`,
 * `Height Range`, `Generator Type` and `Dimension Type` as ZigZag varint32, `Pack Id` as an
 * `mce::UUID`, then `Default Biome`). Strings are a varuint32 byte length followed by UTF-8.
 * From protocol 2225 on each definition also carries `Cloud Height` and `Render Clouds`.
 * The wire layout lives in `dimensionData.ts`'s declarative definition, which this class walks
 * at the protocol version stamped on it.
 *
 * A vanilla server sends this only when a behavior pack registers a custom dimension. The
 * three vanilla dimensions keep their built-in heights without it.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/dimension-data-packet/
 */
export default class DimensionDataPacket extends NetworkPacket<DimensionData> {
    public get id(): number {
        return PacketIdentifier.DIMENSION_DATA;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: DimensionData): void {
        // The layout writes whichever of the two gated fields the stamped version admits.
        layoutAt(dimensionDataPacket, this.codecProtocol).encode(stream, {
            definitionsWithoutClouds: data.definitions,
            definitionsWithClouds: data.definitions
        });
    }

    protected deserializePayload(stream: NetworkBinaryStream): DimensionData {
        const { definitionsWithoutClouds, definitionsWithClouds } = layoutAt(
            dimensionDataPacket,
            this.codecProtocol
        ).decode(stream);

        // The gated field the version leaves off the wire decodes as its empty fallback.
        return { definitions: [...definitionsWithoutClouds, ...definitionsWithClouds] };
    }
}
