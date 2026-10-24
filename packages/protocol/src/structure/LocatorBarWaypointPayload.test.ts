import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import LocatorBarWaypointPayload, { ServerWaypointGroupAction } from './LocatorBarWaypointPayload';
import ServerWaypointPayload from './ServerWaypointPayload';
import UUID from './UUID';

/** Adds a visible waypoint under handle `00112233-4455-6677-8899-aabbccddeeff`. */
const ADD = new LocatorBarWaypointPayload(
    new UUID(0x0011_2233_4455_6677n, 0x8899_aabb_ccdd_eeffn),
    new ServerWaypointPayload(1, true),
    ServerWaypointGroupAction.Add
);

/** `ADD` on the wire, written by hand in the order the docs list the fields. */
const BYTES = Buffer.from([
    ...[0x77, 0x66, 0x55, 0x44, 0x33, 0x22, 0x11, 0x00], // GroupHandle, Most Significant Bits little-endian
    ...[0xff, 0xee, 0xdd, 0xcc, 0xbb, 0xaa, 0x99, 0x88], // GroupHandle, Least Significant Bits little-endian
    ...[0x01, 0x00, 0x00, 0x00], // UpdateFlag: uint32 LE 1
    ...[0x01, 0x01], // IsVisible: present, true
    ...[0x00, 0x00, 0x00, 0x00, 0x00, 0x00], // WorldPosition through ActorUniqueID: absent
    0x01 // ActionFlag: Add
]);

describe('LocatorBarWaypointPayload', () => {
    it('numbers the actions as the docs do', () => {
        expect(ServerWaypointGroupAction.None).toBe(0);
        expect(ServerWaypointGroupAction.Add).toBe(1);
        expect(ServerWaypointGroupAction.Remove).toBe(2);
        expect(ServerWaypointGroupAction.Update).toBe(3);
    });

    it('writes the handle, payload and action in the order protocol 2193 defines', () => {
        const stream = new NetworkBinaryStream();
        ADD.serialize(stream);

        expect([...stream.getBuffer()]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const entry = LocatorBarWaypointPayload.deserialize(stream);

        expect(entry).toEqual(ADD);
        expect(stream.feof()).toBe(true);
    });

    it('constructs a no-op entry without arguments', () => {
        const entry = new LocatorBarWaypointPayload();

        expect(entry.groupHandle).toEqual(new UUID(0n, 0n));
        expect(entry.payload.updateFlag).toBe(0);
        expect(entry.action).toBe(ServerWaypointGroupAction.None);
    });
});
