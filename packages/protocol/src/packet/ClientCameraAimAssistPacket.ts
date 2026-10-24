import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The docs enum `ClientCameraAimAssistPacketAction`. */
export enum ClientCameraAimAssistAction {
    /** Use the `aim_assist` settings of the camera preset named by `Camera Preset Id`. */
    SET_FROM_CAMERA_PRESET = 0,
    /** Turn aim assist off. */
    CLEAR = 1
}

/** The fields of a `ClientCameraAimAssistPacket`, in wire order. */
export interface ClientCameraAimAssist {
    /** `Camera Preset Id`, the camera preset whose `aim_assist` field the server looks up. */
    cameraPresetId: string;
    /** `Action`. */
    action: ClientCameraAimAssistAction;
    /** `Allow aim assist`: whether the client lets aim assist run at all. */
    allowAimAssist: boolean;
}

/**
 * Sent by the client to turn aim assist on from a camera preset's `aim_assist` settings, or off.
 *
 * Protocol 2193 layout, in wire order: `Camera Preset Id` as a string (varuint32 byte length
 * then UTF-8), `Action` as one byte with the values of {@link ClientCameraAimAssistAction},
 * then `Allow aim assist` as one byte. The schema leaves `Allow aim assist` out of its
 * `required` list and gives it a default of false, but the wire-order table shows a plain
 * one-byte boolean with no presence prefix, and gophertunnel writes it unconditionally.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/client-camera-aim-assist-packet/}
 */
export default class ClientCameraAimAssistPacket extends NetworkPacket<ClientCameraAimAssist> {
    public get id(): number {
        return PacketIdentifier.CLIENT_CAMERA_AIM_ASSIST;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: ClientCameraAimAssist): void {
        stream.writeString(data.cameraPresetId);
        stream.writeByte(data.action);
        stream.writeBoolean(data.allowAimAssist);
    }

    protected deserializePayload(stream: NetworkBinaryStream): ClientCameraAimAssist {
        return {
            cameraPresetId: stream.readString(),
            action: stream.readByte(),
            allowAimAssist: stream.readBoolean()
        };
    }
}
