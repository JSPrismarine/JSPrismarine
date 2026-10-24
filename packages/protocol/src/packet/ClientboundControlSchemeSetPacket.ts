import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';
import type { ControlScheme } from '../structure/CameraPreset';

/** The fields of a `ClientboundControlSchemeSetPacket`, in wire order. */
export interface ClientboundControlSchemeSet {
    /** `Control Scheme` the client switches to. */
    controlScheme: ControlScheme;
}

/**
 * Tells the client which control scheme to use, usually alongside a custom camera. The
 * vanilla `/controlscheme` command sends it.
 *
 * Protocol 2193 layout: `Control Scheme` as one byte holding a {@link ControlScheme} value,
 * the same enum a `CameraPreset` carries (0 `locked_player_relative_strafe` through
 * 4 `player_relative_strafe`).
 */
export default class ClientboundControlSchemeSetPacket extends NetworkPacket<ClientboundControlSchemeSet> {
    public get id(): number {
        return PacketIdentifier.CLIENTBOUND_CONTROL_SCHEME_SET;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: ClientboundControlSchemeSet): void {
        stream.writeByte(data.controlScheme);
    }

    protected deserializePayload(stream: NetworkBinaryStream): ClientboundControlSchemeSet {
        const controlScheme: ControlScheme = stream.readByte();

        return { controlScheme };
    }
}
