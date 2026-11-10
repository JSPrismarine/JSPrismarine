/**
 * `ClientCameraAimAssistPacket`: Sent by the client to turn aim assist on from a camera preset's
 * `aim_assist` settings, or off.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/client-camera-aim-assist-packet/}
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** The `ClientCameraAimAssistPacket` field list. */
export const clientCameraAimAssistPacket = definePacket('ClientCameraAimAssistPacket', {
    /** `Camera Preset Id`, the camera preset whose `aim_assist` field the server looks up. */
    cameraPresetId: t.string,
    /** `Action`. */
    action: t.uint8,
    /** `Allow aim assist`: whether the client lets aim assist run at all. */
    allowAimAssist: t.bool
});

/** Sent by the client to turn aim assist on from a camera preset's `aim_assist` settings, or off. */
export type ClientCameraAimAssistPayload = PayloadOf<typeof clientCameraAimAssistPacket>;
