import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import PrimitiveShapeData from '../structure/PrimitiveShapeData';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The fields of a `PrimitiveShapesPacket`, in wire order. */
export interface PrimitiveShapes {
    /** `Array of primitive shapes`: new, updated and removed shapes, one {@link PrimitiveShapeData} each. */
    shapes: PrimitiveShapeData[];
}

/**
 * Debug shapes for the client to draw, as the scripting `debug-utilities` module produces
 * them. Each entry adds a shape, updates one the client already draws, or removes one.
 *
 * Protocol 2193 layout: `Array of primitive shapes` as a varuint32 count followed by one
 * {@link PrimitiveShapeData} per shape (`NetworkId`, the optional `Shape Type`, `Location`,
 * `Scale`, `Rotation`, `Total Time Left`, `Maximum Render Distance`, `Color`, `Dimension ID`
 * and `Attached To Entity ID`, then the `Extra Shape Data` variant).
 *
 * Protocol 2193 added `LineGapHeight` to `TextDataPayload`; a reader without it takes the
 * float for the three trailing booleans.
 */
export default class PrimitiveShapesPacket extends NetworkPacket<PrimitiveShapes> {
    public get id(): number {
        return PacketIdentifier.PRIMITIVE_SHAPES;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: PrimitiveShapes): void {
        stream.writeUnsignedVarInt(data.shapes.length);
        for (const shape of data.shapes) {
            shape.serialize(stream);
        }
    }

    protected deserializePayload(stream: NetworkBinaryStream): PrimitiveShapes {
        const shapes: PrimitiveShapeData[] = [];
        let count = stream.readUnsignedVarInt();
        while (count-- > 0) {
            shapes.push(PrimitiveShapeData.deserialize(stream));
        }

        return { shapes };
    }
}
