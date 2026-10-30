import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import Vec3 from '../structure/Vec3';
import LevelEventPacket from './LevelEventPacket';

import type { LevelEvent } from './LevelEventPacket';

const DATA: LevelEvent = { eventId: 2001, position: new Vec3(1.5, 64, -20.5), data: -1867554038 };
const BYTES = Buffer.from([
    0x19, 0xa2, 0x1f, 0x00, 0x00, 0xc0, 0x3f, 0x00, 0x00, 0x80, 0x42, 0x00, 0x00, 0xa4, 0xc1, 0xeb, 0xf3, 0x84, 0xf5,
    0x0d
]);

describe('LevelEventPacket', () => {
    it('writes the event id, position, and event data in docs order', () => {
        expect(new LevelEventPacket(DATA).serialize(new NetworkBinaryStream())).toEqual(BYTES);
    });

    it('reads every field to the end of the packet', () => {
        const stream = new NetworkBinaryStream(BYTES);

        expect(new LevelEventPacket().deserialize(stream)).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });

    it.each([
        ['block destruction', 2001],
        ['block destruction without sound', 2021],
        ['start block cracking', 3600],
        ['stop block cracking', 3601],
        ['update block cracking', 3602]
    ])('preserves the event id for %s', (_name, eventId) => {
        const data: LevelEvent = { eventId, position: new Vec3(1, 2, 3), data: 0 };
        const decoded = new LevelEventPacket().deserialize(
            new NetworkBinaryStream(new LevelEventPacket(data).serialize(new NetworkBinaryStream()))
        );

        expect(decoded.eventId).toBe(eventId);
    });

    it('writes a null server position as the origin', () => {
        const packet = new LevelEventPacket({ eventId: 2021, position: null, data: 0 });
        const stream = new NetworkBinaryStream(packet.serialize(new NetworkBinaryStream()));

        expect(new LevelEventPacket().deserialize(stream).position).toEqual(new Vec3(0, 0, 0));
    });
});
