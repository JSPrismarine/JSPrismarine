/**
 * The camera presets a client can select. Camera instructions refer to these presets by their
 * position in the list, so the order is part of the payload.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/camera-presets-packet/}
 */
import CameraPreset from '../../structure/CameraPreset';
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { CameraPresetData } from '../../structure/CameraPreset';

/** One preset, bridged from the hand-written `CameraPreset` structure. */
const cameraPreset = t.custom<CameraPresetData>(
    'CameraPreset',
    (s, v) => new CameraPreset(v).serialize(s),
    (s) => {
        const preset = new CameraPreset();
        preset.deserialize(s);
        return preset.data;
    }
);

/**
 * The `CameraPresetsPacket` field list: the camera presets a client may switch to. A set
 * instruction's `preset` is an index into the list, so the order matters.
 */
export const cameraPresetsPacket = definePacket('CameraPresetsPacket', {
    /**
     * `Camera Presets`: a varuint32 count, then one {@link cameraPreset} each. The docs print a single
     * `CameraPresets` object; the captured payload `bedrock-data/src/jsp/v2193/wire/0xc6.bin` (identical at
     * v2225) carries the count.
     */
    cameraPresets: t.list(cameraPreset)
});
