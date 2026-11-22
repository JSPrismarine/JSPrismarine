import NetworkPacket from '../../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { cameraAimAssistActorPriorityPacket } from '../wire/definitions/cameraAimAssistActorPriority';
import { layoutAt } from '../../wire/WireLayout';

import type NetworkBinaryStream from '../../NetworkBinaryStream';
import type { CameraAimAssistActorPriorityPayload } from '../wire/definitions/cameraAimAssistActorPriority';

/**
 * One `AimAssistActorPriorityData` entry: the priority of one actor inside one category of one
 * preset, each named by its position in the registry the client got from
 * `CameraAimAssistPresetsPacket`.
 */
export type AimAssistActorPriorityData = CameraAimAssistActorPriorityPayload['priorities'][number];

/** The fields of a `CameraAimAssistActorPriorityPacket`, in wire order. */
export type CameraAimAssistActorPriority = CameraAimAssistActorPriorityPayload;

/**
 * Overrides aim assist priorities for individual actors on the client.
 *
 * Same layout at protocols 2193 and 2225, in wire order: `Camera Aim-Assist Actor Priority List` as a varuint32
 * count followed by one {@link AimAssistActorPriorityData} per entry. Each entry is
 * `Preset Index`, `Category Index`, `Actor Index` and `Priority Value`, all little-endian
 * int32.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/camera-aim-assist-actor-priority-packet/}
 */
export default class CameraAimAssistActorPriorityPacket extends NetworkPacket<CameraAimAssistActorPriority> {
    /** The name this packet's wire id is listed under. */
    public getName(): string {
        return 'CameraAimAssistActorPriorityPacket';
    }

    public get id(): number {
        return PacketIdentifier.CAMERA_AIM_ASSIST_ACTOR_PRIORITY;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: CameraAimAssistActorPriority): void {
        layoutAt(cameraAimAssistActorPriorityPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): CameraAimAssistActorPriority {
        return layoutAt(cameraAimAssistActorPriorityPacket, this.codecProtocol).decode(stream);
    }
}
