import NetworkPacket from '../../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { clientboundTextureShiftPacket } from '../wire/definitions/clientboundTextureShift';
import { layoutAt } from '../../wire/WireLayout';

import type NetworkBinaryStream from '../../NetworkBinaryStream';
import type { ClientboundTextureShiftPayload } from '../wire/definitions/clientboundTextureShift';

/** The `Action ID` of a texture shift update. The values are the ones the wire carries. */
export enum TextureShiftAction {
    Invalid = 0,
    Initialize = 1,
    /** Begins a shift from `From Step` to `To Step`. `Enabled` says whether it begins enabled. */
    Start = 2,
    SetEnabled = 3,
    Sync = 4
}

/** The fields of a `ClientboundTextureShiftPacket`, in wire order. */
export type ClientboundTextureShift = ClientboundTextureShiftPayload;

/**
 * Updates the client's texture shift system: which step of a texture collection it shows and
 * how far along a shift between two steps it is.
 *
 * Protocol 2193 layout, in wire order: `Action ID` as one {@link TextureShiftAction} byte,
 * `Collection Name`, `From Step` and `To Step` as strings, `All Steps` as a varuint32 count
 * followed by one string per step, `Current Length In Ticks` and `Total Length In Ticks` as
 * varuint64, then `Enabled` as one byte. Strings are a varuint32 byte length followed by
 * UTF-8.
 *
 * Mojang's 1.26 release notes say the packet "remains unused", so the vanilla server does not
 * send it during a join.
 */
export default class ClientboundTextureShiftPacket extends NetworkPacket<ClientboundTextureShift> {
    public get id(): number {
        return PacketIdentifier.CLIENTBOUND_TEXTURE_SHIFT;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: ClientboundTextureShift): void {
        layoutAt(clientboundTextureShiftPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): ClientboundTextureShift {
        return layoutAt(clientboundTextureShiftPacket, this.codecProtocol).decode(stream);
    }
}
