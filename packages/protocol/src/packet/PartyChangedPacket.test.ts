import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import PlayerPartyInfo from '../structure/PlayerPartyInfo';
import PartyChangedPacket from './PartyChangedPacket';

import type { PartyChanged } from './PartyChangedPacket';

/** The client became the leader of party "party-1". */
const DATA: PartyChanged = { partyInfo: new PlayerPartyInfo('party-1', true) };

/** `DATA` on the wire, header included, written by hand in the order the docs list the fields. */
const BYTES = Buffer.from([
    ...[0xd6, 0x02], // packet id header, varuint32 342
    ...[0x07, ...Buffer.from('party-1', 'utf8')], // party_id, 7 bytes
    0x01 // is_party_leader
]);

/** The client left its party. */
const NO_PARTY: PartyChanged = { partyInfo: new PlayerPartyInfo('', false) };

/** `NO_PARTY` on the wire: the header, an empty string, a zero byte. */
const NO_PARTY_BYTES = Buffer.from([0xd6, 0x02, 0x00, 0x00]);

describe('PartyChangedPacket', () => {
    it('writes no party as 2 payload bytes', () => {
        const buffer = new PartyChangedPacket(NO_PARTY).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...NO_PARTY_BYTES]);
    });

    it('reads no party to the end of the buffer', () => {
        const stream = new NetworkBinaryStream(NO_PARTY_BYTES);
        const data = new PartyChangedPacket().deserialize(stream);

        expect(data).toEqual(NO_PARTY);
        expect(stream.feof()).toBe(true);
    });

    it('writes every field in the order protocol 2193 defines', () => {
        const buffer = new PartyChangedPacket(DATA).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new PartyChangedPacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });
});
