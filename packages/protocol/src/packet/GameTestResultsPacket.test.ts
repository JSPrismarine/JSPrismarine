import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import GameTestResultsPacket from './GameTestResultsPacket';

import type { GameTestResults } from './GameTestResultsPacket';

const DATA: GameTestResults = {
    succeeded: false,
    error: 'Expected 3 wheat, found 2',
    testName: 'farm:crops'
};

/** `DATA` on the wire, header included, written by hand in the order the docs list the fields. */
const BYTES = Buffer.from([
    ...[0xc3, 0x01], // packet id header: 195 as a varuint32
    0x00, // Succeeded
    ...[0x19, ...Buffer.from('Expected 3 wheat, found 2', 'utf8')], // Error, 25 bytes
    ...[0x0a, ...Buffer.from('farm:crops', 'utf8')] // TestName, 10 bytes
]);

describe('GameTestResultsPacket', () => {
    it('writes every field in the order protocol 2193 defines', () => {
        const buffer = new GameTestResultsPacket(DATA).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new GameTestResultsPacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });

    it('round-trips a passed test with an empty error', () => {
        const passed: GameTestResults = { succeeded: true, error: '', testName: 'farm:crops' };
        const buffer = new GameTestResultsPacket(passed).serialize(new NetworkBinaryStream());
        const stream = new NetworkBinaryStream(buffer);

        expect(new GameTestResultsPacket().deserialize(stream)).toEqual(passed);
        expect(stream.feof()).toBe(true);
    });
});
