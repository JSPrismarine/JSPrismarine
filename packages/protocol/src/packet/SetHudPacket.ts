import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { HudElement, HudVisibility, setHudPacket } from '../wire/definitions/setHud';
import { layoutAt } from '../wire/WireLayout';

import type NetworkBinaryStream from '../NetworkBinaryStream';
import type { SetHudPayload } from '../wire/definitions/setHud';

export { HudElement, HudVisibility };

/** The fields of a `SetHudPacket`, in wire order. */
export type SetHud = SetHudPayload;

/**
 * Hides HUD elements on the client, or restores them. Only the `/hud` command sends it; it
 * exists for third-party content.
 *
 * Protocol 2193 layout, in wire order: `Hud Element` as a varuint32 count followed by one
 * ZigZag varint32 {@link HudElement} per entry, then `Hud Visible` as a ZigZag varint32
 * {@link HudVisibility}.
 */
export default class SetHudPacket extends NetworkPacket<SetHud> {
    public get id(): number {
        return PacketIdentifier.SET_HUD;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: SetHud): void {
        layoutAt(setHudPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): SetHud {
        return layoutAt(setHudPacket, this.codecProtocol).decode(stream);
    }
}
