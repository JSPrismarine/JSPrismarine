import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import PlayerPartyInfo from '../structure/PlayerPartyInfo';
import PartyChangedPacket from './PartyChangedPacket';

import type { PartyChanged } from './PartyChangedPacket';

/** The protocols whose layout this packet carries: 1.26.50 and 1.26.60. */
const PROTOCOLS = [2193, 2225] as const;

/** The client became the leader of party "party-1". */
const DATA: PartyChanged = { partyInfo: new PlayerPartyInfo('party-1', true) };

/** `DATA` on the wire, header included, written by hand in the order the 1.26.60 docs list the fields. */
const BYTES = Buffer.from([
    ...[0xd6, 0x02], // packet id header, varuint32 342
    0x01, // party_info present
    ...[0x07, ...Buffer.from('party-1', 'utf8')], // party_id, 7 bytes
    0x01 // is_party_leader
]);

/** The client left its party and sent an empty id. */
const NO_PARTY: PartyChanged = { partyInfo: new PlayerPartyInfo('', false) };

/** `NO_PARTY` on the wire: the header, present, an empty string, a zero byte. */
const NO_PARTY_BYTES = Buffer.from([0xd6, 0x02, 0x01, 0x00, 0x00]);

/** The client sent no `party_info`. */
const ABSENT: PartyChanged = { partyInfo: null };

/** `ABSENT` on the wire: the header and a zero presence byte. */
const ABSENT_BYTES = Buffer.from([0xd6, 0x02, 0x00]);

describe.each(PROTOCOLS)('PartyChangedPacket at protocol %i', (protocol) => {
    const write = (data: PartyChanged) =>
        new PartyChangedPacket(data).serialize(new NetworkBinaryStream(), { protocolVersion: protocol });
    const read = (bytes: Buffer) => {
        const stream = new NetworkBinaryStream(bytes);
        const data = new PartyChangedPacket().deserialize(stream, { protocolVersion: protocol });
        return { data, ended: stream.feof() };
    };

    it('writes an empty party id as present with 2 payload bytes', () => {
        expect([...write(NO_PARTY)]).toEqual([...NO_PARTY_BYTES]);
    });

    it('reads an empty party id to the end of the buffer', () => {
        expect(read(NO_PARTY_BYTES)).toEqual({ data: NO_PARTY, ended: true });
    });

    it('writes an absent party_info as one presence byte', () => {
        expect([...write(ABSENT)]).toEqual([...ABSENT_BYTES]);
    });

    it('reads an absent party_info to the end of the buffer', () => {
        expect(read(ABSENT_BYTES)).toEqual({ data: ABSENT, ended: true });
    });

    it('writes every field in wire order', () => {
        expect([...write(DATA)]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        expect(read(BYTES)).toEqual({ data: DATA, ended: true });
    });
});
