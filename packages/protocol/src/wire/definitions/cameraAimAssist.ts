/**
 * `CameraAimAssistPacket`: turns aim assist on or off for the client's camera, naming the preset
 * and the targeting volume to use.
 *
 * The layout is the same at protocols 2193 and 2225. The payload is the preset id, the view
 * angle, the distance, the target mode and action as one byte each, and the debug render flag,
 * in the order on Mojang's packet page.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/camera-aim-assist-packet/}
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';
import { vec2Structure } from '../structureTypes';

import type { PayloadOf } from '../define';

/** The docs enum `CameraAimAssistPacketPayload TargetMode`: how the client picks a target. */
export enum CameraAimAssistTargetMode {
    /** Pick the target within `View Angle` of the crosshair. */
    ANGLE = 0,
    /** Pick the target within `Distance` of the crosshair. */
    DISTANCE = 1
}

/** The docs enum `CameraAimAssistPacketPayload Action`. */
export enum CameraAimAssistAction {
    /** Turn aim assist on with the settings in the packet. */
    SET = 0,
    /** Turn aim assist off. The other fields are still on the wire. */
    CLEAR = 1
}

/** `Target Mode`: one byte holding a {@link CameraAimAssistTargetMode}. */
const targetMode = t.enumOf<CameraAimAssistTargetMode>(t.uint8);

/** `Action`: one byte holding a {@link CameraAimAssistAction}. */
const action = t.enumOf<CameraAimAssistAction>(t.uint8);

/** The `CameraAimAssistPacket` field list. */
export const cameraAimAssistPacket = definePacket('CameraAimAssistPacket', {
    /** `Preset Id`, the identifier of a `CameraAimAssistPresetDefinition` the client already has. */
    presetId: t.string,
    /** `View Angle`: the horizontal (x) and vertical (y) half-angles, in degrees, used by the angle target mode. */
    viewAngle: vec2Structure,
    /** `Distance`, in blocks, used by the distance target mode. The docs bound it to 1 through 16. */
    distance: t.lf32,
    /** `Target Mode`. */
    targetMode,
    /** `Action`. */
    action,
    /** `Show Debug Render`: draws the targeting volume on the client. */
    showDebugRender: t.bool
});

/** The fields of a `CameraAimAssistPacket`, in wire order. */
export type CameraAimAssistPayload = PayloadOf<typeof cameraAimAssistPacket>;
