import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { cameraSplinePacket } from '../wire/definitions/cameraSpline';
import { layoutAt } from '../wire/WireLayout';

import type NetworkBinaryStream from '../NetworkBinaryStream';
import type { CameraSplinePayload } from '../wire/definitions/cameraSpline';

/** The fields of a `CameraSplinePacket`, in wire order. */
export type CameraSplines = CameraSplinePayload;

/**
 * Hands the client the custom camera splines of the world's behavior packs, so that `/camera`
 * can later play one by name.
 *
 * Same layout at protocols 2193 and 2225: `Camera Data Splines` as a varuint32 count followed by one
 * `CameraSplineDefinition` per spline. A vanilla server sends it when a pack defines
 * splines; a server without pack splines has nothing to send.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/camera-spline-packet/
 */
export default class CameraSplinePacket extends NetworkPacket<CameraSplines> {
    public get id(): number {
        return PacketIdentifier.CAMERA_SPLINE;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: CameraSplines): void {
        layoutAt(cameraSplinePacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): CameraSplines {
        return layoutAt(cameraSplinePacket, this.codecProtocol).decode(stream);
    }
}
