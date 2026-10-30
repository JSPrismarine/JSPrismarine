import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import Vec3 from '../structure/Vec3';
import ServerPlayerPostMovePositionPacket from './ServerPlayerPostMovePositionPacket';

import type { ServerPlayerPostMovePosition } from './ServerPlayerPostMovePositionPacket';

const DATA: ServerPlayerPostMovePosition = { pos: new Vec3(1.5, -2, 3.25) };
const BYTES = Buffer.from([0x10, 0x00, 0x00, 0xc0, 0x3f, 0x00, 0x00, 0x00, 0xc0, 0x00, 0x00, 0x50, 0x40]);

describe('ServerPlayerPostMovePositionPacket', () => {
    it('writes the server position as three little-endian floats', () => {
        const buffer = new ServerPlayerPostMovePositionPacket(DATA).serialize(new NetworkBinaryStream());

        expect(buffer).toEqual(BYTES);
    });

    it('reads a hand-built position to the end of the packet', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new ServerPlayerPostMovePositionPacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });
});
