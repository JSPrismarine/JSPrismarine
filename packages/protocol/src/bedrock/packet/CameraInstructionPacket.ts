import NetworkPacket from '../../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { cameraInstructionPacket } from '../wire/definitions/cameraInstruction';
import { layoutAt } from '../../wire/WireLayout';

import type NetworkBinaryStream from '../../NetworkBinaryStream';
import type { CameraInstructionPayload } from '../wire/definitions/cameraInstruction';

export type { CameraInstructionPayload };

/**
 * Tells a client's camera what to do: switch preset, fade, target an actor, change the field of
 * view, follow a spline, or attach to an entity.
 *
 * Docs packet 300, server to client. Protocol 2193 layout: one `CameraInstruction`, which
 * is nine parts each behind a presence byte: `Set`, `Clear`, `Fade`, `Target`, `RemoveTarget`,
 * `FieldOfView`, `Spline`, `AttachToEntity`, `DetachFromEntity`. A set instruction's `preset`
 * indexes the list the server sent in `CameraPresetsPacket`.
 */
export default class CameraInstructionPacket extends NetworkPacket<CameraInstructionPayload> {
    /** The name this packet's wire id is listed under. */
    public getName(): string {
        return 'CameraInstructionPacket';
    }

    public get id(): number {
        return PacketIdentifier.CAMERA_INSTRUCTION;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: CameraInstructionPayload): void {
        layoutAt(cameraInstructionPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): CameraInstructionPayload {
        return layoutAt(cameraInstructionPacket, this.codecProtocol).decode(stream);
    }
}
