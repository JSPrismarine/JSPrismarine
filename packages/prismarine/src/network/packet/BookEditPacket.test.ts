import { describe, expect, it } from 'vitest';
import BookEditPacket, { BookEditAction } from './BookEditPacket';

describe('BookEditPacket', () => {
    // Header 0x61. Slot 3 zigzags to 6.
    it('decodes a replace page with index, text, and photo name, consuming the whole buffer', () => {
        // Selector 0. Page 2 zigzags to 4. "hi". "".
        const packet = new BookEditPacket(Buffer.from([0x61, 0x06, 0x00, 0x04, 0x02, 0x68, 0x69, 0x00]));
        packet.decode();

        expect(packet.bookSlot).toBe(3);
        expect(packet.operation).toEqual({
            action: BookEditAction.ReplacePage,
            pageIndex: 2,
            pageText: 'hi',
            photoName: ''
        });
        expect(packet.feof()).toBe(true);
    });

    it('decodes an add page the same way under selector 1', () => {
        const packet = new BookEditPacket(Buffer.from([0x61, 0x06, 0x01, 0x00, 0x01, 0x61, 0x01, 0x70]));
        packet.decode();

        expect(packet.operation).toEqual({
            action: BookEditAction.AddPage,
            pageIndex: 0,
            pageText: 'a',
            photoName: 'p'
        });
        expect(packet.feof()).toBe(true);
    });

    it('decodes a delete page with only the index', () => {
        const packet = new BookEditPacket(Buffer.from([0x61, 0x06, 0x02, 0x02]));
        packet.decode();

        expect(packet.operation).toEqual({ action: BookEditAction.DeletePage, pageIndex: 1 });
        expect(packet.feof()).toBe(true);
    });

    it('decodes a swap with both indices', () => {
        const packet = new BookEditPacket(Buffer.from([0x61, 0x06, 0x03, 0x02, 0x08]));
        packet.decode();

        expect(packet.operation).toEqual({ action: BookEditAction.SwapPages, pageIndex: 1, swapWithIndex: 4 });
        expect(packet.feof()).toBe(true);
    });

    it('decodes a finalize with title, author, and xuid', () => {
        const packet = new BookEditPacket(
            Buffer.from([0x61, 0x06, 0x04, 0x01, 0x54, 0x02, 0x41, 0x75, 0x03, 0x31, 0x32, 0x33])
        );
        packet.decode();

        expect(packet.operation).toEqual({ action: BookEditAction.Finalize, title: 'T', author: 'Au', xuid: '123' });
        expect(packet.feof()).toBe(true);
    });

    it('rejects an unknown action', () => {
        const packet = new BookEditPacket(Buffer.from([0x61, 0x06, 0x09]));

        expect(() => packet.decode()).toThrow(/action 9/);
    });

    it('encodes a swap back to the same bytes', () => {
        const packet = new BookEditPacket();
        packet.bookSlot = 3;
        packet.operation = { action: BookEditAction.SwapPages, pageIndex: 1, swapWithIndex: 4 };
        packet.encode();

        expect(packet.getBuffer()).toEqual(Buffer.from([0x61, 0x06, 0x03, 0x02, 0x08]));
    });
});
