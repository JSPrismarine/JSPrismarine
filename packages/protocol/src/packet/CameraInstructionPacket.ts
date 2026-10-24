import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import CameraInstruction from '../structure/CameraInstruction';

import type NetworkBinaryStream from '../NetworkBinaryStream';
import type { CameraInstructionData } from '../structure/CameraInstruction';

/** The fields of a `CameraInstructionPacket`, in wire order. */
export interface CameraInstructionPayload {
    /** `Camera Instruction`: the parts the client applies, in wire order. */
    cameraInstruction: CameraInstructionData;
}

/**
 * Tells a client's camera what to do: switch preset, fade, target an actor, change the field of
 * view, follow a spline, or attach to an entity.
 *
 * Docs packet 300, server to client. Protocol 2193 layout: one {@link CameraInstruction}, which
 * is nine parts each behind a presence byte: `Set`, `Clear`, `Fade`, `Target`, `RemoveTarget`,
 * `FieldOfView`, `Spline`, `AttachToEntity`, `DetachFromEntity`. A set instruction's `preset`
 * indexes the list the server sent in `CameraPresetsPacket`.
 */
export default class CameraInstructionPacket extends NetworkPacket<CameraInstructionPayload> {
    public get id(): number {
        return PacketIdentifier.CAMERA_INSTRUCTION;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: CameraInstructionPayload): void {
        new CameraInstruction(data.cameraInstruction).serialize(stream);
    }

    protected deserializePayload(stream: NetworkBinaryStream): CameraInstructionPayload {
        return { cameraInstruction: CameraInstruction.deserialize(stream).data };
    }
}
