/**
 * `CameraPacket`: Points an Education Edition tripod camera at a player.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/camera-packet/}
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** The `CameraPacket` field list. */
export const cameraPacket = definePacket('CameraPacket', {
    /** Camera ID, the unique id of the camera actor taking the picture. */
    cameraId: t.varint64,
    /** Target Player ID, the unique id of the player the picture is of. */
    targetPlayerId: t.varint64
});

/** Points an Education Edition tripod camera at a player. */
export type CameraPayload = PayloadOf<typeof cameraPacket>;
