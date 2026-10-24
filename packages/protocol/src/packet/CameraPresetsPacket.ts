import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import CameraPreset from '../structure/CameraPreset';

import type NetworkBinaryStream from '../NetworkBinaryStream';
import type { CameraPresetData } from '../structure/CameraPreset';

/** The fields of a `CameraPresetsPacket`, in wire order. */
export interface CameraPresetsPayload {
    /** `Camera Presets`. A set instruction's `preset` is an index into this list, so the order matters. */
    cameraPresets: CameraPresetData[];
}

/**
 * The camera presets a client may switch to.
 *
 * Docs packet 198, server to client. Protocol 2193 layout: `Camera Presets` as a varuint32
 * count, then one {@link CameraPreset} per entry (`Name`, `Inherit From`, the twenty optional
 * fields each behind a presence byte, `Apply Inherited Starting Rotation`, then the optional
 * `Starting Rotation`). The docs render the list as one `CameraPresets` object; the count is
 * what the client reads (gophertunnel and PocketMine agree).
 */
export default class CameraPresetsPacket extends NetworkPacket<CameraPresetsPayload> {
    public get id(): number {
        return PacketIdentifier.CAMERA_PRESETS;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: CameraPresetsPayload): void {
        stream.writeUnsignedVarInt(data.cameraPresets.length);
        for (const preset of data.cameraPresets) {
            new CameraPreset(preset).serialize(stream);
        }
    }

    protected deserializePayload(stream: NetworkBinaryStream): CameraPresetsPayload {
        const cameraPresets: CameraPresetData[] = [];
        let count = stream.readUnsignedVarInt();
        while (count-- > 0) {
            cameraPresets.push(CameraPreset.deserialize(stream).data);
        }

        return { cameraPresets };
    }
}
