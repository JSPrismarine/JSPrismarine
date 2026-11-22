import NetworkPacket from '../../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { clientboundControlSchemeSetPacket } from '../wire/definitions/clientboundControlSchemeSet';
import { layoutAt } from '../../wire/WireLayout';

import type NetworkBinaryStream from '../../NetworkBinaryStream';
import type { ClientboundControlSchemeSetPayload } from '../wire/definitions/clientboundControlSchemeSet';

/** The fields of a `ClientboundControlSchemeSetPacket`, in wire order. */
export type ClientboundControlSchemeSet = ClientboundControlSchemeSetPayload;

/**
 * Tells the client which control scheme to use, usually alongside a custom camera. The
 * vanilla `/controlscheme` command sends it.
 *
 * Protocol 2193 layout: `Control Scheme` as one byte holding a {@link ControlScheme} value,
 * the same enum a `CameraPreset` carries (0 `locked_player_relative_strafe` through
 * 4 `player_relative_strafe`). Protocol 2225 prints the same layout.
 *
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/clientbound-control-scheme-set-packet/
 */
export default class ClientboundControlSchemeSetPacket extends NetworkPacket<ClientboundControlSchemeSet> {
    /** The name this packet's wire id is listed under. */
    public getName(): string {
        return 'ClientboundControlSchemeSetPacket';
    }

    public get id(): number {
        return PacketIdentifier.CLIENTBOUND_CONTROL_SCHEME_SET;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: ClientboundControlSchemeSet): void {
        layoutAt(clientboundControlSchemeSetPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): ClientboundControlSchemeSet {
        return layoutAt(clientboundControlSchemeSetPacket, this.codecProtocol).decode(stream);
    }
}
