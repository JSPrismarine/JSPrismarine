import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import BookEditPacket, { BookEditAction } from './BookEditPacket';

import type { BookEdit } from './BookEditPacket';

const BYTES = {
    replacePage: Buffer.from([0x61, 0x06, 0x00, 0x04, 0x02, 0x68, 0x69, 0x00]),
    addPage: Buffer.from([0x61, 0x06, 0x01, 0x00, 0x01, 0x61, 0x01, 0x70]),
    deletePage: Buffer.from([0x61, 0x06, 0x02, 0x02]),
    swapPages: Buffer.from([0x61, 0x06, 0x03, 0x02, 0x08]),
    finalize: Buffer.from([0x61, 0x06, 0x04, 0x01, 0x54, 0x02, 0x41, 0x75, 0x03, 0x31, 0x32, 0x33])
} as const;

const read = (bytes: Buffer): BookEdit => {
    const stream = new NetworkBinaryStream(bytes);
    const data = new BookEditPacket().deserialize(stream);
    expect(stream.feof()).toBe(true);
    return data;
};

describe('BookEditPacket', () => {
    it('reads each operation shape', () => {
        expect(read(BYTES.replacePage)).toEqual({
            bookSlot: 3,
            operation: { action: BookEditAction.ReplacePage, pageIndex: 2, pageText: 'hi', photoName: '' }
        });
        expect(read(BYTES.addPage)).toEqual({
            bookSlot: 3,
            operation: { action: BookEditAction.AddPage, pageIndex: 0, pageText: 'a', photoName: 'p' }
        });
        expect(read(BYTES.deletePage)).toEqual({
            bookSlot: 3,
            operation: { action: BookEditAction.DeletePage, pageIndex: 1 }
        });
        expect(read(BYTES.swapPages)).toEqual({
            bookSlot: 3,
            operation: { action: BookEditAction.SwapPages, pageIndex: 1, swapWithIndex: 4 }
        });
        expect(read(BYTES.finalize)).toEqual({
            bookSlot: 3,
            operation: { action: BookEditAction.Finalize, title: 'T', author: 'Au', xuid: '123' }
        });
    });

    it('rejects an unknown action', () => {
        expect(() =>
            new BookEditPacket().deserialize(new NetworkBinaryStream(Buffer.from([0x61, 0x06, 0x09])))
        ).toThrow(/action 9/);
    });

    it('writes an edit back to the same bytes', () => {
        const data: BookEdit = {
            bookSlot: 3,
            operation: { action: BookEditAction.SwapPages, pageIndex: 1, swapWithIndex: 4 }
        };

        expect(new BookEditPacket(data).serialize(new NetworkBinaryStream())).toEqual(BYTES.swapPages);
    });
});
