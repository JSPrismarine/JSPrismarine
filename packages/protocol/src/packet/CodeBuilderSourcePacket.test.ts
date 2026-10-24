import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import CodeBuilderSourcePacket, {
    CodeBuilderCategory,
    CodeBuilderCodeStatus,
    CodeBuilderOperation
} from './CodeBuilderSourcePacket';

import type { CodeBuilderSource } from './CodeBuilderSourcePacket';

const DATA: CodeBuilderSource = {
    operation: CodeBuilderOperation.Reset,
    category: CodeBuilderCategory.Instantiation,
    codeStatus: CodeBuilderCodeStatus.Succeeded
};

/** `DATA` on the wire, header included, written by hand in the order the docs list the fields. */
const BYTES = Buffer.from([
    ...[0xb2, 0x01], // packet id header, 178 as a varuint32
    0x03, // Operation: Reset
    0x02, // Category: Instantiation
    0x05 // CodeStatus: Succeeded
]);

describe('CodeBuilderSourcePacket', () => {
    it('writes the three enums as one byte each after the header', () => {
        const buffer = new CodeBuilderSourcePacket(DATA).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new CodeBuilderSourcePacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });

    it('round-trips every enum value as its documented number', () => {
        const data: CodeBuilderSource = {
            operation: CodeBuilderOperation.Get,
            category: CodeBuilderCategory.CodeStatus,
            codeStatus: CodeBuilderCodeStatus.Error
        };
        const buffer = new CodeBuilderSourcePacket(data).serialize(new NetworkBinaryStream());

        expect([...buffer.subarray(2)]).toEqual([1, 1, 4]);
        expect(new CodeBuilderSourcePacket().deserialize(new NetworkBinaryStream(buffer))).toEqual(data);
    });
});
