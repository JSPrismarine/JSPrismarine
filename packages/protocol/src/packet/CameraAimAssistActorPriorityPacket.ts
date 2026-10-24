import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/**
 * One `AimAssistActorPriorityData` entry: the priority of one actor inside one category of one
 * preset, each named by its position in the registry the client got from
 * `CameraAimAssistPresetsPacket`.
 */
export interface AimAssistActorPriorityData {
    /** `Preset Index`, the position of the preset in the client's registry. */
    presetIndex: number;
    /** `Category Index`, the position of the category in the client's registry. */
    categoryIndex: number;
    /** `Actor Index`, the actor the priority applies to. */
    actorIndex: number;
    /** `Priority Value`. Larger numbers win. */
    priorityValue: number;
}

/** The fields of a `CameraAimAssistActorPriorityPacket`, in wire order. */
export interface CameraAimAssistActorPriority {
    /** `Camera Aim-Assist Actor Priority List`, one entry per actor override. */
    priorities: AimAssistActorPriorityData[];
}

/**
 * Overrides aim assist priorities for individual actors on the client.
 *
 * Protocol 2193 layout, in wire order: `Camera Aim-Assist Actor Priority List` as a varuint32
 * count followed by one {@link AimAssistActorPriorityData} per entry. Each entry is
 * `Preset Index`, `Category Index`, `Actor Index` and `Priority Value`, all little-endian
 * int32.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/camera-aim-assist-actor-priority-packet/}
 */
export default class CameraAimAssistActorPriorityPacket extends NetworkPacket<CameraAimAssistActorPriority> {
    public get id(): number {
        return PacketIdentifier.CAMERA_AIM_ASSIST_ACTOR_PRIORITY;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: CameraAimAssistActorPriority): void {
        stream.writeUnsignedVarInt(data.priorities.length);
        for (const entry of data.priorities) {
            stream.writeIntLE(entry.presetIndex);
            stream.writeIntLE(entry.categoryIndex);
            stream.writeIntLE(entry.actorIndex);
            stream.writeIntLE(entry.priorityValue);
        }
    }

    protected deserializePayload(stream: NetworkBinaryStream): CameraAimAssistActorPriority {
        const priorities: AimAssistActorPriorityData[] = [];
        let count = stream.readUnsignedVarInt();
        while (count-- > 0) {
            priorities.push({
                presetIndex: stream.readIntLE(),
                categoryIndex: stream.readIntLE(),
                actorIndex: stream.readIntLE(),
                priorityValue: stream.readIntLE()
            });
        }
        return { priorities };
    }
}
