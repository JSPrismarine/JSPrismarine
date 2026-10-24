import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import LocatorBarWaypointPayload, { ServerWaypointGroupAction } from '../structure/LocatorBarWaypointPayload';
import ServerWaypointPayload from '../structure/ServerWaypointPayload';
import UUID from '../structure/UUID';
import Vec2 from '../structure/Vec2';
import Vec3 from '../structure/Vec3';
import LocatorBarPacket from './LocatorBarPacket';

import type { LocatorBar } from './LocatorBarPacket';

/** One fully specified waypoint added, then a second one removed. */
const DATA: LocatorBar = {
    waypoints: [
        new LocatorBarWaypointPayload(
            new UUID(0x0011_2233_4455_6677n, 0x8899_aabb_ccdd_eeffn),
            new ServerWaypointPayload(
                0x7f,
                true,
                { position: new Vec3(1, 64, -2.5), dimensionType: 1 },
                'textures/ui/waypoint',
                new Vec2(1, 1),
                0x00ff8800,
                false,
                -2n
            ),
            ServerWaypointGroupAction.Add
        ),
        new LocatorBarWaypointPayload(new UUID(0n, 1n), new ServerWaypointPayload(), ServerWaypointGroupAction.Remove)
    ]
};

/** `DATA` on the wire, header included, written by hand in the order the docs list the fields. */
const BYTES = Buffer.from([
    ...[0xd5, 0x02], // packet id header, varuint32 341
    0x02, // Waypoints count, a varuint32
    ...[0x77, 0x66, 0x55, 0x44, 0x33, 0x22, 0x11, 0x00], // GroupHandle, Most Significant Bits little-endian
    ...[0xff, 0xee, 0xdd, 0xcc, 0xbb, 0xaa, 0x99, 0x88], // GroupHandle, Least Significant Bits little-endian
    ...[0x7f, 0x00, 0x00, 0x00], // UpdateFlag: uint32 LE 0x7f
    ...[0x01, 0x01], // IsVisible: present, true
    0x01, // WorldPosition: present
    ...[0x00, 0x00, 0x80, 0x3f], // Position X: float LE 1.0
    ...[0x00, 0x00, 0x80, 0x42], // Position Y: float LE 64.0
    ...[0x00, 0x00, 0x20, 0xc0], // Position Z: float LE -2.5
    0x02, // DimensionType: ZigZag varint32 1
    ...[0x01, 0x14, ...Buffer.from('textures/ui/waypoint', 'utf8')], // TexturePath: present, 20 bytes
    ...[0x01, 0x00, 0x00, 0x80, 0x3f, 0x00, 0x00, 0x80, 0x3f], // IconSize: present, (1.0, 1.0)
    ...[0x01, 0x00, 0x88, 0xff, 0x00], // Color: present, int32 LE 0x00ff8800
    ...[0x01, 0x00], // ClientPositionAuthority: present, false
    ...[0x01, 0x03], // ActorUniqueID: present, ZigZag varint64 -2
    0x01, // ActionFlag: Add
    ...Array.from({ length: 8 }, () => 0x00), // GroupHandle, Most Significant Bits 0
    ...[0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00], // GroupHandle, Least Significant Bits 1
    ...[0x00, 0x00, 0x00, 0x00], // UpdateFlag: uint32 LE 0
    ...[0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00], // IsVisible through ActorUniqueID: absent
    0x02 // ActionFlag: Remove
]);

/** No changes at all. */
const EMPTY: LocatorBar = { waypoints: [] };

/** `EMPTY` on the wire: the header and a zero count. */
const EMPTY_BYTES = Buffer.from([0xd5, 0x02, 0x00]);

describe('LocatorBarPacket', () => {
    it('writes no waypoints as a single count byte', () => {
        const buffer = new LocatorBarPacket(EMPTY).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...EMPTY_BYTES]);
    });

    it('reads no waypoints to the end of the buffer', () => {
        const stream = new NetworkBinaryStream(EMPTY_BYTES);
        const data = new LocatorBarPacket().deserialize(stream);

        expect(data).toEqual(EMPTY);
        expect(stream.feof()).toBe(true);
    });

    it('writes every field in the order protocol 2193 defines', () => {
        const buffer = new LocatorBarPacket(DATA).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new LocatorBarPacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });
});
