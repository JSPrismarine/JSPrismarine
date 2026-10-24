import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import PlayerPartyInfo from './PlayerPartyInfo';

/** The leader of party "party-1". */
const LEADER = new PlayerPartyInfo('party-1', true);

/** `LEADER` on the wire, written by hand in the order the docs list the fields. */
const BYTES = Buffer.from([
    ...[0x07, ...Buffer.from('party-1', 'utf8')], // party_id, 7 bytes
    0x01 // is_party_leader
]);

describe('PlayerPartyInfo', () => {
    it('writes the id then the leader flag', () => {
        const stream = new NetworkBinaryStream();
        LEADER.serialize(stream);

        expect([...stream.getBuffer()]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const info = PlayerPartyInfo.deserialize(stream);

        expect(info).toEqual(LEADER);
        expect(stream.feof()).toBe(true);
    });

    it('constructs no party without arguments', () => {
        const info = new PlayerPartyInfo();

        expect(info.partyId).toBe('');
        expect(info.isPartyLeader).toBe(false);
    });
});
