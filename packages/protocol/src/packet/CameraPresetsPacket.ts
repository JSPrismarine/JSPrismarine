import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { cameraPresetsPacket } from '../wire/definitions/cameraPresets';
import { protocolVersion } from '../wire/versions/v2193';
import { layoutAt } from '../wire/WireLayout';

import type NetworkBinaryStream from '../NetworkBinaryStream';
import type { CameraPresetData } from '../structure/CameraPreset';

/** The fields of a `CameraPresetsPacket`, in wire order. */
export interface CameraPresetsPayload {
    /** `Camera Presets`. A set instruction's `preset` is an index into this list, so the order matters. */
    cameraPresets: CameraPresetData[];
}

/**
 * The definition carries no version gate, so it resolves to the same frozen layout at every
 * protocol; the oldest supported version stands in for the packet class, which does not know
 * its session's protocol.
 */
const layout = () => layoutAt(cameraPresetsPacket, protocolVersion);

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
        layout().encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): CameraPresetsPayload {
        return layout().decode(stream);
    }
}
