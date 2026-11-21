/**
 * `CameraAimAssistActorPriorityPacket`: overrides aim assist priorities for individual actors.
 *
 * The payload is one `Camera Aim-Assist Actor Priority List`: a varuint32 count followed by one
 * `AimAssistActorPriorityData` per entry, each four little-endian int32s.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/camera-aim-assist-actor-priority-packet/
 */
import { definePacket } from '../../../wire/define';
import * as t from '../../../wire/fieldTypes';

import type { PayloadOf } from '../../../wire/define';

/** The fields of a `CameraAimAssistActorPriorityPacket`, in wire order. */
export const cameraAimAssistActorPriorityPacket = definePacket('CameraAimAssistActorPriorityPacket', {
    /** `Camera Aim-Assist Actor Priority List`: one entry per actor override. */
    priorities: t.list(
        t.record({
            /** `Preset Index`: the position of the preset in the client's registry. */
            presetIndex: t.li32,
            /** `Category Index`: the position of the category in the client's registry. */
            categoryIndex: t.li32,
            /** `Actor Index`: the actor the priority applies to. */
            actorIndex: t.li32,
            /** `Priority Value`: larger numbers win. */
            priorityValue: t.li32
        })
    )
});

/** Payload carried by `CameraAimAssistActorPriorityPacket`. */
export type CameraAimAssistActorPriorityPayload = PayloadOf<typeof cameraAimAssistActorPriorityPacket>;
