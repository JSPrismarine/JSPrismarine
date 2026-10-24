import { Gametype } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import UpdatePlayerGameTypePacket from './UpdatePlayerGameTypePacket';

// Packet id 151 as a varuint.
const HEADER = [0x97, 0x01];

describe('UpdatePlayerGameTypePacket', () => {
    it('writes the game type, the target player and the tick', () => {
        const packet = new UpdatePlayerGameTypePacket();
        packet.playerGameType = Gametype.CREATIVE;
        packet.targetPlayer = 5n;
        packet.tick = 300n;
        packet.encode();

        // Creative is 1, ZigZag encoded as 2; the unique id 5 as 10; the tick as a plain
        // LEB128 varuint64.
        expect(packet.getBuffer()).toEqual(Buffer.from([...HEADER, 0x02, 0x0a, 0xac, 0x02]));
    });

    it('writes spectator as 6, the value the 2193 page numbers as a list index of 5', () => {
        const packet = new UpdatePlayerGameTypePacket();
        packet.playerGameType = Gametype.SPECTATOR;
        packet.encode();

        // 6 ZigZag encoded is 12.
        expect(packet.getBuffer()).toEqual(Buffer.from([...HEADER, 0x0c, 0x00, 0x00]));
    });

    it('reads a negative unique id and the tick, consuming the whole buffer', () => {
        const packet = new UpdatePlayerGameTypePacket();
        packet.setReadBuffer(Buffer.from([...HEADER, 0x04, 0x03, 0x00]));
        packet.decode();

        expect(packet.playerGameType).toBe(Gametype.ADVENTURE);
        expect(packet.targetPlayer).toBe(-2n);
        expect(packet.tick).toBe(0n);
        expect(packet.feof()).toBe(true);
    });
});
