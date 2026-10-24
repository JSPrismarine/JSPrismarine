import { describe, expect, it } from 'vitest';

import PlayerFogPacket from './PlayerFogPacket';

// Packet id 160 as a varuint.
const HEADER = [0xa0, 0x01];

const string = (value: string): number[] => [Buffer.byteLength(value), ...Buffer.from(value, 'utf8')];

describe('PlayerFogPacket', () => {
    it('writes the stack size then each fog identifier', () => {
        const packet = new PlayerFogPacket();
        packet.fogStack = ['minecraft:fog_ocean', 'minecraft:fog_hell'];
        packet.encode();

        expect(packet.getBuffer()).toEqual(
            Buffer.from([...HEADER, 0x02, ...string('minecraft:fog_ocean'), ...string('minecraft:fog_hell')])
        );
    });

    it('writes an empty stack as a zero count, which clears the fog', () => {
        const packet = new PlayerFogPacket();
        packet.encode();

        expect(packet.getBuffer()).toEqual(Buffer.from([...HEADER, 0x00]));
    });

    it('reads the stack in order and consumes the whole buffer', () => {
        const packet = new PlayerFogPacket();
        packet.setReadBuffer(Buffer.from([...HEADER, 0x02, ...string('a'), ...string('bb')]));
        packet.decode();

        expect(packet.fogStack).toEqual(['a', 'bb']);
        expect(packet.feof()).toBe(true);
    });
});
