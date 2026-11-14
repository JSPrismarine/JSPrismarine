import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import BookEditPacket, { BookEditAction } from './BookEditPacket';

import type { BookEdit } from './BookEditPacket';
import { enumDumpMembers } from '../testing/evidence.test.helper';

const BYTES = {
    replacePage: Buffer.from([0x61, 0x06, 0x00, 0x04, 0x02, 0x68, 0x69, 0x00]),
    addPage: Buffer.from([0x61, 0x06, 0x01, 0x00, 0x01, 0x61, 0x01, 0x70]),
    deletePage: Buffer.from([0x61, 0x06, 0x02, 0x02]),
    swapPages: Buffer.from([0x61, 0x06, 0x03, 0x02, 0x08]),
    finalize: Buffer.from([0x61, 0x06, 0x04, 0x01, 0x54, 0x02, 0x41, 0x75, 0x03, 0x31, 0x32, 0x33])
} as const;

/** The two protocol versions the packet is audited at; the layout is the same at both. */
const PROTOCOLS = [2193, 2225] as const;

const read = (bytes: Buffer, protocol: number = PROTOCOLS[0]): BookEdit => {
    const stream = new NetworkBinaryStream(bytes);
    const packet = new BookEditPacket();
    packet.codecProtocol = protocol;
    const data = packet.deserialize(stream);
    expect(stream.feof()).toBe(true);
    return data;
};

const write = (data: BookEdit, protocol: number): Buffer => {
    const packet = new BookEditPacket(data);
    packet.codecProtocol = protocol;
    return packet.serialize(new NetworkBinaryStream());
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

    it.each(PROTOCOLS)('round trips every operation at protocol %i', (protocol) => {
        for (const bytes of Object.values(BYTES)) {
            expect(write(read(bytes, protocol), protocol)).toEqual(bytes);
        }
    });

    it('numbers the actions the way the pinned game dump does', () => {
        const members = enumDumpMembers('BookEditAction');

        expect(members.length).toBeGreaterThan(0);
        expect(Object.fromEntries(members.map(({ name, value }) => [name, value]))).toEqual({
            ReplacePage: BookEditAction.ReplacePage,
            AddPage: BookEditAction.AddPage,
            DeletePage: BookEditAction.DeletePage,
            SwapPages: BookEditAction.SwapPages,
            Finalize: BookEditAction.Finalize
        });
    });
});
