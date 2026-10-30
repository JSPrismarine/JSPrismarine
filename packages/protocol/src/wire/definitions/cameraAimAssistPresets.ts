/**
 * `CameraAimAssistPresetsPacket` described as a declarative field list; layout unchanged
 * between protocols 2193 and 2225.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/camera-aim-assist-presets-packet/}
 */
import CameraAimAssistCategoryDefinition from '../../structure/CameraAimAssistCategoryDefinition';
import CameraAimAssistPresetDefinition from '../../structure/CameraAimAssistPresetDefinition';
import { definePacket } from '../define';
import * as t from '../fieldTypes';

/** One category, bridged from the hand-written `CameraAimAssistCategoryDefinition`. */
const categoryDefinition = t.custom<CameraAimAssistCategoryDefinition>(
    'CameraAimAssistCategoryDefinition',
    (s, v) => v.serialize(s),
    (s) => {
        const category = new CameraAimAssistCategoryDefinition();
        category.deserialize(s);
        return category;
    }
);

/** One preset, bridged from the hand-written `CameraAimAssistPresetDefinition`. */
const presetDefinition = t.custom<CameraAimAssistPresetDefinition>(
    'CameraAimAssistPresetDefinition',
    (s, v) => v.serialize(s),
    (s) => {
        const preset = new CameraAimAssistPresetDefinition();
        preset.deserialize(s);
        return preset;
    }
);

/**
 * The `CameraAimAssistPresetsPacket` field list: the categories and presets that fill or
 * extend the client's aim assist registry. The packet class's doc carries the note on the
 * docs' swapped field labels.
 */
export const cameraAimAssistPresetsPacket = definePacket('CameraAimAssistPresetsPacket', {
    /** The categories presets refer to by name. */
    categories: t.list(categoryDefinition),
    /** The presets `CameraAimAssistPacket` and camera presets refer to by identifier. */
    presets: t.list(presetDefinition),
    /** `Operation`: one byte, the `CameraAimAssistPresetsOperation` values. */
    operation: t.uint8
});
