import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import LocatorBarWaypointPayload from '../structure/LocatorBarWaypointPayload';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The fields of a `LocatorBarPacket`, in wire order. */
export interface LocatorBar {
    /** `Waypoints`, one entry per waypoint to add, remove or update, applied in order. */
    waypoints: LocatorBarWaypointPayload[];
}

/**
 * Server-side changes to the client's locator bar: waypoints added, removed or updated.
 *
 * Protocol 2193 layout, in wire order: `Waypoints` as a varuint32 count followed by one
 * {@link LocatorBarWaypointPayload} per entry. Each entry is its `GroupHandle` as an
 * `mce::UUID`, a `ServerWaypointPayload` (`UpdateFlag` as a little-endian uint32, then
 * `IsVisible`, `WorldPosition`, `TexturePath`, `IconSize`, `Color`,
 * `ClientPositionAuthority` and `ActorUniqueID`, each behind a presence byte), then
 * `ActionFlag` as one byte.
 */
export default class LocatorBarPacket extends NetworkPacket<LocatorBar> {
    public get id(): number {
        return PacketIdentifier.LOCATOR_BAR;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: LocatorBar): void {
        stream.writeUnsignedVarInt(data.waypoints.length);
        for (const waypoint of data.waypoints) {
            waypoint.serialize(stream);
        }
    }

    protected deserializePayload(stream: NetworkBinaryStream): LocatorBar {
        const waypoints: LocatorBarWaypointPayload[] = [];
        let count = stream.readUnsignedVarInt();
        while (count-- > 0) {
            waypoints.push(LocatorBarWaypointPayload.deserialize(stream));
        }

        return { waypoints };
    }
}
