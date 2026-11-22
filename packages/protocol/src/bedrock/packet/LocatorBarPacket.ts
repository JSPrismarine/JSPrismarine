import NetworkPacket from '../../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { locatorBarPacket } from '../wire/definitions/locatorBar';
import { layoutAt } from '../../wire/WireLayout';

import type NetworkBinaryStream from '../../NetworkBinaryStream';
import type { LocatorBarPayload } from '../wire/definitions/locatorBar';

/** The fields of a `LocatorBarPacket`, in wire order. */
export type LocatorBar = LocatorBarPayload;

/**
 * Server-side changes to the client's locator bar: waypoints added, removed or updated.
 *
 * Protocol 2193 layout, in wire order: `Waypoints` as a varuint32 count followed by one
 * `LocatorBarWaypointPayload` per entry. Each entry is its `GroupHandle` as an
 * `mce::UUID`, a `ServerWaypointPayload` (`UpdateFlag` as a little-endian uint32, then
 * `IsVisible`, `WorldPosition`, `TexturePath`, `IconSize`, `Color`,
 * `ClientPositionAuthority` and `ActorUniqueID`, each behind a presence byte), then
 * `ActionFlag` as one byte.
 */
export default class LocatorBarPacket extends NetworkPacket<LocatorBar> {
    /** The name this packet's wire id is listed under. */
    public getName(): string {
        return 'LocatorBarPacket';
    }

    public get id(): number {
        return PacketIdentifier.LOCATOR_BAR;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: LocatorBar): void {
        layoutAt(locatorBarPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): LocatorBar {
        return layoutAt(locatorBarPacket, this.codecProtocol).decode(stream);
    }
}
