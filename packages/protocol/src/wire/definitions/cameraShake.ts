/**
 * `CameraShakePacket`: A shake to add to the player's camera, or an order to stop the shaking.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/camera-shake-packet/}
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** The `CameraShakePacket` field list. */
export const cameraShakePacket = definePacket('CameraShakePacket', {
    /** Intensity of the shake, clamped to 4 by the client. */
    intensity: t.lf32,
    /** Seconds the shake lasts. */
    seconds: t.lf32,
    /** Shake Type: whether the camera is moved or turned. */
    shakeType: t.uint8,
    /** Shake Action: queue a shake or stop the current one. */
    shakeAction: t.uint8
});

/** A shake to add to the player's camera, or an order to stop the shaking. */
export type CameraShakePayload = PayloadOf<typeof cameraShakePacket>;
