import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import Vec2 from '../structure/Vec2';

import type NetworkBinaryStream from '../NetworkBinaryStream';

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

/** The fields of a `CameraAimAssistPacket`, in wire order. */
export interface CameraAimAssist {
    /** `Preset Id`, the identifier of a `CameraAimAssistPresetDefinition` the client already has. */
    presetId: string;
    /** `View Angle`: the horizontal (x) and vertical (y) half-angles, in degrees, used by the angle target mode. */
    viewAngle: Vec2;
    /** `Distance`, in blocks, used by the distance target mode. The docs bound it to 1 through 16. */
    distance: number;
    /** `Target Mode`. */
    targetMode: CameraAimAssistTargetMode;
    /** `Action`. */
    action: CameraAimAssistAction;
    /** `Show Debug Render`: draws the targeting volume on the client. */
    showDebugRender: boolean;
}

/**
 * Turns aim assist on or off for the client's camera, naming the preset and the targeting
 * volume to use.
 *
 * Protocol 2193 layout, in wire order: `Preset Id` as a string (varuint32 byte length then
 * UTF-8), `View Angle` as a {@link Vec2} of two little-endian floats, `Distance` as a
 * little-endian float, `Target Mode` and `Action` as one byte each with the values of
 * {@link CameraAimAssistTargetMode} and {@link CameraAimAssistAction}, then
 * `Show Debug Render` as one byte.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/camera-aim-assist-packet/}
 */
export default class CameraAimAssistPacket extends NetworkPacket<CameraAimAssist> {
    public get id(): number {
        return PacketIdentifier.CAMERA_AIM_ASSIST;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: CameraAimAssist): void {
        stream.writeString(data.presetId);
        data.viewAngle.serialize(stream);
        stream.writeFloatLE(data.distance);
        stream.writeByte(data.targetMode);
        stream.writeByte(data.action);
        stream.writeBoolean(data.showDebugRender);
    }

    protected deserializePayload(stream: NetworkBinaryStream): CameraAimAssist {
        return {
            presetId: stream.readString(),
            viewAngle: Vec2.deserialize(stream),
            distance: stream.readFloatLE(),
            targetMode: stream.readByte(),
            action: stream.readByte(),
            showDebugRender: stream.readBoolean()
        };
    }
}
