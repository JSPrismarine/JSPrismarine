/**
 * `PrimitiveShapesPacket`: debug shapes for the client to draw, as the scripting
 * `debug-utilities` module produces them.
 *
 * The payload is one `Array of primitive shapes`: a varuint32 count, then one
 * `PrimitiveShapeDataPayload` per shape. Each entry adds a shape, updates one the client
 * already draws, or removes one. Protocol 2193 added `LineGapHeight` to `TextDataPayload`; protocol
 * 2225 changes nothing on the wire.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/primitive-shapes-packet/
 */
import PrimitiveShapeData from '../../structure/PrimitiveShapeData';
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';
import type { WireType } from '../fieldTypes';

/**
 * `PrimitiveShapeDataPayload` as the {@link PrimitiveShapeData} structure class: nine
 * presence-prefixed optionals behind the `NetworkId`, then the `Extra Shape Data` variant,
 * whose alternative the leading varuint32 selector picks.
 */
const primitiveShape: WireType<PrimitiveShapeData> = t.custom(
    'PrimitiveShapeDataPayload',
    (stream, value) => value.serialize(stream),
    (stream) => {
        const shape = new PrimitiveShapeData();
        shape.deserialize(stream);
        return shape;
    }
);

/** The fields of one `PrimitiveShapesPacket`. */
export const primitiveShapesPacket = definePacket('PrimitiveShapesPacket', {
    /** `Array of primitive shapes`: new, updated and removed shapes, one {@link PrimitiveShapeData} each. */
    shapes: t.list(primitiveShape)
});

/** Payload carried by `PrimitiveShapesPacket`. */
export type PrimitiveShapesPayload = PayloadOf<typeof primitiveShapesPacket>;
