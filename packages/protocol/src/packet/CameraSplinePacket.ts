import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import CameraSplineDefinition from '../structure/CameraSplineDefinition';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The fields of a `CameraSplinePacket`, in wire order. */
export interface CameraSplines {
    /** `Camera Data Splines`, one definition per named spline. */
    splines: CameraSplineDefinition[];
}

/**
 * Hands the client the custom camera splines of the world's behavior packs, so that `/camera`
 * can later play one by name.
 *
 * Protocol 2193 layout: `Camera Data Splines` as a varuint32 count followed by one
 * {@link CameraSplineDefinition} per spline. A vanilla server sends it when a pack defines
 * splines; a server without pack splines has nothing to send.
 */
export default class CameraSplinePacket extends NetworkPacket<CameraSplines> {
    public get id(): number {
        return PacketIdentifier.CAMERA_SPLINE;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: CameraSplines): void {
        stream.writeUnsignedVarInt(data.splines.length);
        for (const spline of data.splines) {
            spline.serialize(stream);
        }
    }

    protected deserializePayload(stream: NetworkBinaryStream): CameraSplines {
        const splines: CameraSplineDefinition[] = [];
        let count = stream.readUnsignedVarInt();
        while (count-- > 0) {
            splines.push(CameraSplineDefinition.deserialize(stream));
        }

        return { splines };
    }
}
