import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { cameraAimAssistPresetsPacket } from '../wire/definitions/cameraAimAssistPresets';
import { protocolVersion } from '../wire/versions/v2193';
import { layoutAt } from '../wire/WireLayout';

import type NetworkBinaryStream from '../NetworkBinaryStream';
import type CameraAimAssistCategoryDefinition from '../structure/CameraAimAssistCategoryDefinition';
import type CameraAimAssistPresetDefinition from '../structure/CameraAimAssistPresetDefinition';

/** The docs enum `CameraAimAssistPresetsPacketOperation`: what the client does with the lists. */
export enum CameraAimAssistPresetsOperation {
    /** Replace the client's registry with the lists in the packet. */
    SET = 0,
    /** Add the lists to the registry the client already has. */
    ADD_TO_EXISTING = 1
}

/** The fields of a `CameraAimAssistPresetsPacket`, in wire order. */
export interface CameraAimAssistPresets {
    /** The list of `CameraAimAssistCategoryDefinition` entries presets refer to by name. */
    categories: CameraAimAssistCategoryDefinition[];
    /** The list of `CameraAimAssistPresetDefinition` entries `CameraAimAssistPacket` and camera presets refer to by identifier. */
    presets: CameraAimAssistPresetDefinition[];
    /** `Operation`. */
    operation: CameraAimAssistPresetsOperation;
}

/**
 * The definition carries no version gate, so it resolves to the same frozen layout at every
 * protocol; the oldest supported version stands in for the packet class, which does not know
 * its session's protocol.
 */
const layout = () => layoutAt(cameraAimAssistPresetsPacket, protocolVersion);

/**
 * Fills or extends the client's aim assist registry with categories and presets.
 *
 * Protocol 2193 layout, in wire order: a varuint32 count followed by one
 * {@link CameraAimAssistCategoryDefinition} per category, a varuint32 count followed by one
 * {@link CameraAimAssistPresetDefinition} per preset, then `Operation` as one byte with the
 * values of {@link CameraAimAssistPresetsOperation}.
 *
 * The docs label field 0 `Camera Aim-Assist Presets` and field 1 `Camera Aim-Assist Categories`,
 * but type field 0 as an array of category definitions and field 1 as an array of preset
 * definitions. The item types are what the client reads, so categories come first here.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/camera-aim-assist-presets-packet/}
 */
export default class CameraAimAssistPresetsPacket extends NetworkPacket<CameraAimAssistPresets> {
    public get id(): number {
        return PacketIdentifier.CAMERA_AIM_ASSIST_PRESETS;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: CameraAimAssistPresets): void {
        layout().encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): CameraAimAssistPresets {
        return layout().decode(stream);
    }
}
