import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';

import { PacketIdentifier } from '../PacketIdentifier';
import PlayerFogPacket from './PlayerFogPacket';
import type { PlayerFogPayload } from './PlayerFogPacket';
import { layoutAt } from '../wire/WireLayout';
import { playerFogPacket } from '../wire/definitions/worldStatus';
import { capture } from '../testing/evidence.test.helper';

// Packet id 160 as a varuint.
const header = [0xa0, 0x01];
const string = (value: string): number[] => [Buffer.byteLength(value), ...Buffer.from(value, 'utf8')];

const payload: PlayerFogPayload = { fogStack: ['minecraft:fog_ocean', 'minecraft:fog_hell'] };

describe('PlayerFogPacket', () => {
    it('encodes the stack size and each fog identifier', () => {
        const packet = new PlayerFogPacket(payload);
        packet.encode();

        expect(packet.getBuffer()).toEqual(
            Buffer.from([...header, 0x02, ...string('minecraft:fog_ocean'), ...string('minecraft:fog_hell')])
        );
    });

    it('encodes an empty stack as a zero count that clears the fog', () => {
        const packet = new PlayerFogPacket({ fogStack: [] });
        packet.encode();

        expect(packet.getBuffer()).toEqual(Buffer.from([...header, 0x00]));
    });

    it('decodes the stack in order', () => {
        const packet = new PlayerFogPacket(Buffer.from([...header, 0x02, ...string('a'), ...string('bb')]));
        packet.decode();

        expect(packet.getPacketData()).toEqual({ fogStack: ['a', 'bb'] });
    });

    it('uses the expected network identifier', () => {
        expect(new PlayerFogPacket(payload).getId()).toBe(PacketIdentifier.PLAYER_FOG);
    });

    it.each([2193, 2225])('round-trips the payload a real server sent at protocol %i', (protocol) => {
        const captured = capture(protocol, 0xa0);
        const layout = layoutAt(playerFogPacket, protocol);

        const decoded = layout.decode(new BinaryStream(captured));
        const stream = new BinaryStream();
        layout.encode(stream, decoded);

        expect(stream.getBuffer()).toEqual(captured);
    });
});
