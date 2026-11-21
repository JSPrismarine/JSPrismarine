import NetworkPacket from '../../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { cameraAimAssistPacket } from '../wire/definitions/cameraAimAssist';
import { layoutAt } from '../../wire/WireLayout';

import type NetworkBinaryStream from '../../NetworkBinaryStream';
import type { CameraAimAssistPayload } from '../wire/definitions/cameraAimAssist';

import { CameraAimAssistAction, CameraAimAssistTargetMode } from '../wire/definitions/cameraAimAssist';
export { CameraAimAssistAction, CameraAimAssistTargetMode };

/** The fields of a `CameraAimAssistPacket`, in wire order. */
export type CameraAimAssist = CameraAimAssistPayload;

/**
 * Turns aim assist on or off for the client's camera, naming the preset and the targeting
 * volume to use.
 *
 * Layout at protocols 2193 and 2225, in wire order: `Preset Id` as a string (varuint32 byte length then
 * UTF-8), `View Angle` as a `Vec2` of two little-endian floats, `Distance` as a
 * little-endian float, `Target Mode` and `Action` as one byte each with the values of
 * `CameraAimAssistTargetMode` and `CameraAimAssistAction`, then
 * `Show Debug Render` as one byte.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/camera-aim-assist-packet/}
 */
export default class CameraAimAssistPacket extends NetworkPacket<CameraAimAssist> {
    public get id(): number {
        return PacketIdentifier.CAMERA_AIM_ASSIST;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: CameraAimAssist): void {
        layoutAt(cameraAimAssistPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): CameraAimAssist {
        return layoutAt(cameraAimAssistPacket, this.codecProtocol).decode(stream);
    }
}
