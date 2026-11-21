import { describe, expect, it } from 'vitest';
import TakeItemActorPacket from './TakeItemActorPacket';

// Header: packet id 17. Item Runtime ID 300 as varuint64 (0xac 0x02), Actor Runtime ID 7.
const bytes = Buffer.from([0x11, 0xac, 0x02, 0x07]);

describe('network', () => {
    describe('packet', () => {
        describe('TakeItemActorPacket', () => {
            it('encodes the item runtime id and then the taker runtime id', () => {
                const pk = new TakeItemActorPacket();
                pk.itemRuntimeEntityId = 300n;
                pk.takerRuntimeEntityId = 7n;
                pk.encode();

                expect(pk.getBuffer()).toEqual(bytes);
            });

            it('decodes both ids and consumes the whole buffer', () => {
                const pk = new TakeItemActorPacket(bytes);
                pk.decode();

                expect(pk.itemRuntimeEntityId).toBe(300n);
                expect(pk.takerRuntimeEntityId).toBe(7n);
                expect(pk.feof()).toBe(true);
            });
        });
    });
});
