import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import Vec3 from '../structure/Vec3';
import PlayerLocationPacket, { PlayerLocationPacketType } from './PlayerLocationPacket';

import type { PlayerLocation } from './PlayerLocationPacket';

const COORDINATES: PlayerLocation = {
    targetActorId: 1234n,
    packetType: PlayerLocationPacketType.PLAYER_LOCATION_COORDINATES,
    position: new Vec3(1.5, 2.5, -3)
};
const HIDE: PlayerLocation = {
    targetActorId: 1n,
    packetType: PlayerLocationPacketType.PLAYER_LOCATION_HIDE,
    position: null
};
const COORDINATES_BYTES = Buffer.from([
    0xc6, 0x02, 0xa4, 0x13, 0x00, 0x00, 0x00, 0x00, 0xc0, 0x3f, 0x00, 0x00, 0x20, 0x40, 0x00, 0x00, 0x40, 0xc0
]);
const HIDE_BYTES = Buffer.from([0xc6, 0x02, 0x02, 0x01, 0x02]);

describe('PlayerLocationPacket', () => {
    it('writes both discriminator bytes and coordinates', () => {
        expect(new PlayerLocationPacket(COORDINATES).serialize(new NetworkBinaryStream())).toEqual(COORDINATES_BYTES);
    });

    it('writes both discriminators for a hide with no position', () => {
        expect(new PlayerLocationPacket(HIDE).serialize(new NetworkBinaryStream())).toEqual(HIDE_BYTES);
    });

    it('reads the coordinates and hide forms to the end of their buffers', () => {
        const coordinates = new NetworkBinaryStream(COORDINATES_BYTES);
        const hide = new NetworkBinaryStream(HIDE_BYTES);

        expect(new PlayerLocationPacket().deserialize(coordinates)).toEqual(COORDINATES);
        expect(coordinates.feof()).toBe(true);
        expect(new PlayerLocationPacket().deserialize(hide)).toEqual(HIDE);
        expect(hide.feof()).toBe(true);
    });

    it('rejects an unknown alternative', () => {
        expect(() =>
            new PlayerLocationPacket().deserialize(new NetworkBinaryStream(Buffer.from([0xc6, 0x02, 0x02, 0x05, 0x0a])))
        ).toThrow(/alternative 5/);
    });
});
