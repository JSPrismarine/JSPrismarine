/**
 * The camera presets and the aim assist registry a joining client is sent, as a Bedrock Dedicated
 * Server sends them: `CameraPresetsPacket` and `CameraAimAssistPresetsPacket`, decoded from the
 * payloads `@jsprismarine/bedrock-data` captured for each protocol version.
 *
 * A camera instruction names its preset by its place in the presets list, and a player's aim
 * assist names a preset of the registry, so the client needs both before a script's camera or aim
 * assist call can reach it. The scripts read the same registry through `world.getAimAssist()`.
 */
import { aim_assist_presets, camera_presets } from '@jsprismarine/bedrock-data';
import { aim_assist_presets as aim2193, camera_presets as camera2193 } from '@jsprismarine/bedrock-data/v2193';
import { aim_assist_presets as aim2225, camera_presets as camera2225 } from '@jsprismarine/bedrock-data/v2225';
import { aim_assist_presets as aim2259, camera_presets as camera2259 } from '@jsprismarine/bedrock-data/v2259';
import NetworkBinaryStream from '@jsprismarine/protocol/NetworkBinaryStream';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';
import CameraAimAssistPresetsPacket from '@jsprismarine/protocol/bedrock/packet/CameraAimAssistPresetsPacket';
import type { CameraAimAssistPresets } from '@jsprismarine/protocol/bedrock/packet/CameraAimAssistPresetsPacket';
import CameraPresetsPacket from '@jsprismarine/protocol/bedrock/packet/CameraPresetsPacket';
import type { CameraPresetsPayload } from '@jsprismarine/protocol/bedrock/packet/CameraPresetsPacket';

/** Each captured version's payloads, by protocol version. */
const CAPTURED: ReadonlyMap<number, { readonly cameraPresets: Buffer; readonly aimAssistPresets: Buffer }> = new Map([
    [2193, { cameraPresets: camera2193, aimAssistPresets: aim2193 }],
    [2225, { cameraPresets: camera2225, aimAssistPresets: aim2225 }],
    [2259, { cameraPresets: camera2259, aimAssistPresets: aim2259 }]
]);

/** Decodes a captured payload, which has no packet header, through a packet of its kind. */
const decode = <T>(packet: NetworkPacket<T>, payload: Buffer): T => {
    const framed = new NetworkBinaryStream();
    framed.writeUnsignedVarInt(packet.getId());
    framed.write(payload);
    return packet.deserialize(new NetworkBinaryStream(framed.getBuffer()));
};

const decoded = new Map<
    number,
    { readonly cameraPresets: CameraPresetsPayload; readonly aimAssist: CameraAimAssistPresets }
>();

/** The decoded payloads for a protocol version, or the default version's for one with no capture. */
const payloadsOf = (protocolVersion: number) => {
    const found = decoded.get(protocolVersion);
    if (found !== undefined) return found;
    const captured = CAPTURED.get(protocolVersion) ?? {
        cameraPresets: camera_presets,
        aimAssistPresets: aim_assist_presets
    };
    const payloads = {
        cameraPresets: decode(new CameraPresetsPacket(), captured.cameraPresets),
        aimAssist: decode(new CameraAimAssistPresetsPacket(), captured.aimAssistPresets)
    };
    decoded.set(protocolVersion, payloads);
    return payloads;
};

/** The `CameraPresetsPacket` a client of a protocol version is sent when it joins. */
export const cameraPresetsPacket = (protocolVersion: number): CameraPresetsPacket =>
    new CameraPresetsPacket(payloadsOf(protocolVersion).cameraPresets);

/** The `CameraAimAssistPresetsPacket` a client of a protocol version is sent when it joins. */
export const aimAssistPresetsPacket = (protocolVersion: number): CameraAimAssistPresetsPacket =>
    new CameraAimAssistPresetsPacket(payloadsOf(protocolVersion).aimAssist);

/** The camera presets' names, in the order a camera instruction numbers them. */
export const cameraPresetNames = (protocolVersion: number): readonly string[] =>
    payloadsOf(protocolVersion).cameraPresets.cameraPresets.map((preset) => preset.name);

/** The aim assist registry a client of a protocol version is sent, the default version's when none is given. */
export const vanillaAimAssist = (protocolVersion = 0): CameraAimAssistPresets => payloadsOf(protocolVersion).aimAssist;
