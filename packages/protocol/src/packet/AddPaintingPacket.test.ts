import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import Vec3 from '../structure/Vec3';
import AddPaintingPacket from './AddPaintingPacket';

import type { AddPainting } from './AddPaintingPacket';

const DATA: AddPainting = {
    targetActorId: 5n,
    targetRuntimeId: 7n,
    position: new Vec3(1.5, 2, 3),
    direction: 2,
    motif: 'Kebab'
};
const BYTES = Buffer.from([
    0x16, 0x0a, 0x07, 0x00, 0x00, 0xc0, 0x3f, 0x00, 0x00, 0x00, 0x40, 0x00, 0x00, 0x40, 0x40, 0x04, 0x05, 0x4b, 0x65,
    0x62, 0x61, 0x62
]);

describe('AddPaintingPacket', () => {
    it('writes the painting ids, position, direction, and motif', () => {
        expect(new AddPaintingPacket(DATA).serialize(new NetworkBinaryStream())).toEqual(BYTES);
    });

    it('reads a hand-built packet to the end of the buffer', () => {
        const stream = new NetworkBinaryStream(BYTES);

        expect(new AddPaintingPacket().deserialize(stream)).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });
});
