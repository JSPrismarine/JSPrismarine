import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import { stub } from '../../testing/stub.test.helper';
import PartyChangedHandler from '../handler/PartyChangedHandler';
import PacketRegistry from '../PacketRegistry';
import PartyChangedPacket from './PartyChangedPacket';

/** The client became the leader of party "party-1", written by hand in the docs' field order. */
const BYTES = Buffer.from([
    ...[0xd6, 0x02], // packet id header, varuint32 342
    ...[0x07, ...Buffer.from('party-1', 'utf8')], // party_id, 7 bytes
    0x01 // is_party_leader
]);

/** The client left its party: the header, an empty string, a zero byte. */
const NO_PARTY_BYTES = Buffer.from([0xd6, 0x02, 0x00, 0x00]);

describe('PartyChangedPacket', () => {
    it('writes every field in the order protocol 2193 defines', () => {
        const packet = new PartyChangedPacket();
        packet.partyId = 'party-1';
        packet.isPartyLeader = true;
        packet.encode();

        expect([...packet.getBuffer()]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const packet = new PartyChangedPacket(BYTES);
        packet.decode();

        expect(packet.partyId).toBe('party-1');
        expect(packet.isPartyLeader).toBe(true);
        expect(packet.feof()).toBe(true);
    });

    it('writes no party as two payload bytes', () => {
        const packet = new PartyChangedPacket();
        packet.encode();

        expect([...packet.getBuffer()]).toEqual([...NO_PARTY_BYTES]);
    });

    it('reads no party to the end of the buffer', () => {
        const packet = new PartyChangedPacket(NO_PARTY_BYTES);
        packet.decode();

        expect(packet.partyId).toBe('');
        expect(packet.isPartyLeader).toBe(false);
        expect(packet.feof()).toBe(true);
    });

    it('resolves 0x156 to a packet and a handler in the registry', async () => {
        const registry = new PacketRegistry({ getLogger: () => stub<Logger>({ debug: () => {}, verbose: () => {} }) });
        await registry['registerPackets']();
        await registry['registerHandlers']();

        expect(registry.getPackets().get(0x156)).toBe(PartyChangedPacket);
        expect(registry.getHandler('PartyChangedPacket')).toBeInstanceOf(PartyChangedHandler);
    });
});
