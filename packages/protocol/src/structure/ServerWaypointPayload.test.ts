import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import ServerWaypointPayload from './ServerWaypointPayload';
import Vec2 from './Vec2';
import Vec3 from './Vec3';

/** Every optional field present: a visible waypoint at (1, 64, -2.5) in the Nether, following actor -2. */
const FULL = new ServerWaypointPayload(
    0x7f,
    true,
    { position: new Vec3(1, 64, -2.5), dimensionType: 1 },
    'textures/ui/waypoint',
    new Vec2(1, 1),
    0x00ff8800,
    false,
    -2n
);

/** `FULL` on the wire, written by hand in the order the docs list the fields. */
const FULL_BYTES = Buffer.from([
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
    ...[0x01, 0x03] // ActorUniqueID: present, ZigZag varint64 -2
]);

/** Nothing but the flag, as a `Remove` entry carries it. */
const EMPTY = new ServerWaypointPayload();

/** `EMPTY` on the wire: a zero flag and seven absent fields. */
const EMPTY_BYTES = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

describe('ServerWaypointPayload', () => {
    it('writes every field in the order protocol 2193 defines', () => {
        const stream = new NetworkBinaryStream();
        FULL.serialize(stream);

        expect([...stream.getBuffer()]).toEqual([...FULL_BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(FULL_BYTES);
        const payload = ServerWaypointPayload.deserialize(stream);

        expect(payload).toEqual(FULL);
        expect(stream.feof()).toBe(true);
    });

    it('writes an absent field as a single zero byte', () => {
        const stream = new NetworkBinaryStream();
        EMPTY.serialize(stream);

        expect([...stream.getBuffer()]).toEqual([...EMPTY_BYTES]);
    });

    it('reads absent fields as undefined', () => {
        const stream = new NetworkBinaryStream(EMPTY_BYTES);
        const payload = ServerWaypointPayload.deserialize(stream);

        expect(payload).toEqual(EMPTY);
        expect(payload.worldPosition).toBeUndefined();
        expect(stream.feof()).toBe(true);
    });
});
