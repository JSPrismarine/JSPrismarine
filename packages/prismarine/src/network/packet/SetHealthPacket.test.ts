import { describe, expect, it } from 'vitest';

import Identifiers from '../Identifiers';
import SetHealthPacket from './SetHealthPacket';

describe('network', () => {
    describe('packet', () => {
        describe('SetHealthPacket', () => {
            it('writes Health as a ZigZag varint32 and nothing else', () => {
                const packet = new SetHealthPacket();
                packet.health = 20;
                packet.encode();

                expect([...packet.getBuffer()]).toEqual([Identifiers.SetHealthPacket, 0x28]);
            });

            it('zigzags a negative health rather than writing five bytes of ones', () => {
                const packet = new SetHealthPacket();
                packet.health = -1;
                packet.encode();

                expect([...packet.getBuffer()]).toEqual([Identifiers.SetHealthPacket, 0x01]);
            });

            it('reads Health and consumes the whole buffer', () => {
                const packet = new SetHealthPacket(Buffer.from([Identifiers.SetHealthPacket, 0x0c]));
                packet.decode();

                expect(packet.health).toBe(6);
                expect(packet.feof()).toBe(true);
            });
        });
    });
});
