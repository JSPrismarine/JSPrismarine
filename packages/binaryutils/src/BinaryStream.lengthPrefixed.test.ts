import { describe, expect, it } from 'vitest';

import { BinaryStream } from './BinaryStream';

describe('BinaryStream length-prefixed values', () => {
    it('writes a varuint32 byte length, then the UTF-8 bytes, and reads them back', () => {
        const stream = new BinaryStream();
        stream.writeVarString('Probe MOTD');
        stream.writeVarString('');
        // Two bytes in UTF-8, one character: the length counts bytes.
        stream.writeVarString('é');

        expect(stream.getBuffer().toString('hex')).toBe('0a50726f6265204d4f544400' + '02c3a9');

        const read = new BinaryStream(stream.getBuffer());
        expect([read.readVarString(), read.readVarString(), read.readVarString()]).toStrictEqual([
            'Probe MOTD',
            '',
            'é'
        ]);
        expect(read.feof()).toBe(true);
    });

    it('carries a length past one varint byte', () => {
        const bytes = Buffer.alloc(200, 7);
        const stream = new BinaryStream();
        stream.writeLengthPrefixed(bytes);

        expect(stream.getBuffer().subarray(0, 2).toString('hex')).toBe('c801');
        expect(new BinaryStream(stream.getBuffer()).readLengthPrefixed()).toStrictEqual(bytes);
    });
});
