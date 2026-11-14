import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { primitiveShapesPacket } from '../wire/definitions/primitiveShapes';
import { layoutAt } from '../wire/WireLayout';

import type NetworkBinaryStream from '../NetworkBinaryStream';
import type { PrimitiveShapesPayload } from '../wire/definitions/primitiveShapes';

/** The fields of a `PrimitiveShapesPacket`, in wire order. */
export type PrimitiveShapes = PrimitiveShapesPayload;

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
        layoutAt(primitiveShapesPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): PrimitiveShapes {
        return layoutAt(primitiveShapesPacket, this.codecProtocol).decode(stream);
    }
}
