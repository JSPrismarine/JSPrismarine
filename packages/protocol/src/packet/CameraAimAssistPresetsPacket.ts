import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import CameraAimAssistCategoryDefinition from '../structure/CameraAimAssistCategoryDefinition';
import CameraAimAssistPresetDefinition from '../structure/CameraAimAssistPresetDefinition';

import type NetworkBinaryStream from '../NetworkBinaryStream';

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
        stream.writeUnsignedVarInt(data.categories.length);
        for (const category of data.categories) {
            category.serialize(stream);
        }

        stream.writeUnsignedVarInt(data.presets.length);
        for (const preset of data.presets) {
            preset.serialize(stream);
        }

        stream.writeByte(data.operation);
    }

    protected deserializePayload(stream: NetworkBinaryStream): CameraAimAssistPresets {
        const categories: CameraAimAssistCategoryDefinition[] = [];
        let categoryCount = stream.readUnsignedVarInt();
        while (categoryCount-- > 0) {
            categories.push(CameraAimAssistCategoryDefinition.deserialize(stream));
        }

        const presets: CameraAimAssistPresetDefinition[] = [];
        let presetCount = stream.readUnsignedVarInt();
        while (presetCount-- > 0) {
            presets.push(CameraAimAssistPresetDefinition.deserialize(stream));
        }

        return { categories, presets, operation: stream.readByte() };
    }
}
