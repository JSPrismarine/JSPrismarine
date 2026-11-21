/**
 * `LocatorBarPacket`: server-side changes to the client's locator bar, waypoints added,
 * removed or updated.
 *
 * The payload is a varuint32 count followed by one `LocatorBarWaypointPayload` per entry. Each
 * entry is its `GroupHandle` as an `mce::UUID`, a `ServerWaypointPayload` (`UpdateFlag` as a
 * little-endian uint32, then seven fields behind presence bytes), then `ActionFlag` as one
 * byte. The entries stay the structure classes, which read and write through the plain
 * `BinaryStream`, so one `custom` wire type bridges them and the layout runs over any stream.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/locator-bar-packet/
 */
import LocatorBarWaypointPayload from '../../structure/LocatorBarWaypointPayload';
import { definePacket } from '../../../wire/define';
import * as t from '../../../wire/fieldTypes';

import type { PayloadOf } from '../../../wire/define';

/** `LocatorBarWaypointPayload`: the `GroupHandle`, the `ServerWaypointPayload` and the `ActionFlag` byte. */
const waypoint = t.custom(
    'LocatorBarWaypointPayload',
    (stream, value: LocatorBarWaypointPayload) => value.serialize(stream),
    (stream) => {
        const entry = new LocatorBarWaypointPayload();
        entry.deserialize(stream);
        return entry;
    }
);

/** The fields of a `LocatorBarPacket`, in wire order. */
export const locatorBarPacket = definePacket('LocatorBarPacket', {
    /** `Waypoints`: one entry per waypoint to add, remove or update, applied in order. */
    waypoints: t.list(waypoint)
});

/** The fields of a `LocatorBarPacket`, in wire order. */
export type LocatorBarPayload = PayloadOf<typeof locatorBarPacket>;
