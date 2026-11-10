import { cameraShakePacket } from '../wire/definitions/cameraShake';
import { layoutAt } from '../wire/WireLayout';

import FieldNetworkPacket from '../FieldNetworkPacket';

/** How the camera moves while it shakes, as the Shake Type uint8 numbers it. */
export enum CameraShakeType {
    Positional = 0,
    Rotational = 1
}

/** What to do with the shake, as the Shake Action uint8 numbers it. */
export enum CameraShakeAction {
    Add = 0,
    Stop = 1
}

/**
 * A shake to add to the player's camera, or an order to stop the shaking.
 *
 * Bound to the client. The client clamps Intensity at 4, so larger values do nothing extra.
 *
 * Wire order at protocol 2193: Intensity and Seconds as floats in little-endian byte order,
 * then Shake Type and Shake Action as uint8 (see {@link CameraShakeType} and
 * {@link CameraShakeAction}).
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/camera-shake-packet/
 */
export default class CameraShakePacket extends FieldNetworkPacket {
    /** Intensity of the shake, clamped to 4 by the client. */
    public intensity = 0;

    /** Seconds the shake lasts. */
    public seconds = 0;

    /** Shake Type: whether the camera is moved or turned. */
    public shakeType: CameraShakeType = CameraShakeType.Positional;

    /** Shake Action: queue a shake or stop the current one. */
    public shakeAction: CameraShakeAction = CameraShakeAction.Add;

    /** Reads the intensity, the duration, the type, and the action. */
    public decodePayload(): void {
        Object.assign(this, layoutAt(cameraShakePacket, this.codecProtocol).decode(this));
    }

    /** Writes the intensity, the duration, the type, and the action. */
    public encodePayload(): void {
        layoutAt(cameraShakePacket, this.codecProtocol).encode(this, this);
    }
}
