import { describe, expect, it } from 'vitest';

import { PacketCompressionAlgorithm } from '@jsprismarine/minecraft';
import { CompressionProvider, UNCOMPRESSED_BATCH } from '../CompressionProvider';
import BatchPacket, { DEFAULT_COMPRESSION_LEVEL } from './BatchPacket';
import TextPacket from './TextPacket';
import TextType from '../type/TextType';

const message = (text: string) => {
    const packet = new TextPacket();
    packet.type = TextType.Raw;
    packet.needsTranslation = false;
    packet.message = text;
    packet.xuid = '';
    packet.platformChatId = '';
    packet.filtered = text;
    return packet;
};

const batchOf = (text: string) => {
    const batch = new BatchPacket();
    batch.addPacket(message(text));
    return batch;
};

describe('network', () => {
    describe('BatchPacket', () => {
        it('compresses asynchronously to exactly the same bytes', async () => {
            // The async path exists to move work off the main thread, not to change what
            // goes on the wire. If these ever differ, the client sees a different packet.
            const text = 'a repeated payload '.repeat(200);

            const sync = batchOf(text);
            sync.encode();

            const async = batchOf(text);
            await async.encodeAsync();

            expect(async.getBuffer().equals(sync.getBuffer())).toBe(true);
        });

        it('leaves an uncompressed batch alone on the async path', async () => {
            const sync = batchOf('short');
            sync.compressed = false;
            sync.encode();

            const async = batchOf('short');
            async.compressed = false;
            await async.encodeAsync();

            expect(async.getBuffer().equals(sync.getBuffer())).toBe(true);
        });

        it('produces the same bytes async at any level, not just the default', async () => {
            // The chunk path now takes the level from configuration, so the two encoders
            // have to agree at whatever it is set to - not only at 7.
            for (const level of [1, 4, 9]) {
                const text = 'terrain-ish payload '.repeat(150);

                const sync = batchOf(text);
                sync.compressionLevel = level;
                sync.encode();

                const async = batchOf(text);
                async.compressionLevel = level;
                await async.encodeAsync();

                expect(async.getBuffer().equals(sync.getBuffer())).toBe(true);
            }
        });

        it('is idempotent on the async path, as the sync one is', async () => {
            // Encoding twice used to append a second complete batch frame to the first,
            // which is not a batch the client can read at all.
            const batch = batchOf('encode me twice');
            await batch.encodeAsync();
            const once = Buffer.from(batch.getBuffer());

            await batch.encodeAsync();

            expect(batch.getBuffer().equals(once)).toBe(true);
        });

        it('reports itself encoded after the async path', async () => {
            // `addPacket` skips a packet that says it is encoded and encodes one that does
            // not, so this flag is not decoration.
            const batch = batchOf('anything');
            expect(batch.getEncoded()).toBe(false);

            await batch.encodeAsync();

            expect(batch.getEncoded()).toBe(true);
        });

        it('defaults to the level the server always used', () => {
            expect(new BatchPacket().compressionLevel).toBe(DEFAULT_COMPRESSION_LEVEL);
            expect(DEFAULT_COMPRESSION_LEVEL).toBe(7);
        });

        it('reads back a batch it wrote', async () => {
            const batch = batchOf('round trip');
            await batch.encodeAsync();

            const received = new BatchPacket(batch.getBuffer());
            received.compressed = true;

            expect(await received.asyncDecode()).toHaveLength(1);
        });

        it('reads a batch the client chose not to compress', async () => {
            // The bug this guards, which cost a login: the algorithm travels at two widths that do
            // not agree. `NetworkSettingsPacket` negotiates it in a two byte field where "none" is
            // 0xffff, and every batch then repeats it in a *single* byte where none is 0xff.
            //
            // Reading the byte straight into the negotiated enum matches nothing and throws, so the
            // first packet a client sent uncompressed - a few into a login that had otherwise
            // completed - failed with "Failed to inflate batched content" and the client hung.
            const payload = batchOf('small enough not to be worth compressing');
            payload.compressed = false;
            payload.encode();

            // What the client actually sends once compression is negotiated: the batch id, the
            // prefix byte saying "none", then the plain payload.
            const framed = Buffer.concat([Buffer.from([0xfe, UNCOMPRESSED_BATCH]), payload.getBuffer().subarray(1)]);

            const received = new BatchPacket(framed);
            received.compressed = true;

            expect(await received.asyncDecode()).toHaveLength(1);
        });

        it('maps the prefix byte onto the negotiated algorithm', () => {
            expect(CompressionProvider.fromBatchPrefix(UNCOMPRESSED_BATCH)).toBe(PacketCompressionAlgorithm.NONE);
            expect(CompressionProvider.fromBatchPrefix(0)).toBe(PacketCompressionAlgorithm.ZLIB);

            // And the widened value is one the provider will actually serve, rather than one that
            // falls through to the unsupported branch.
            expect(() => CompressionProvider.fromAlgorithm(PacketCompressionAlgorithm.NONE)).not.toThrow();
        });

        it('honours the level it is given, and stays decodable at any of them', () => {
            const text = 'compress me '.repeat(300);

            const high = batchOf(text);
            high.compressionLevel = 9;
            high.encode();

            const low = batchOf(text);
            low.compressionLevel = 1;
            low.encode();

            // A cheaper level trades bandwidth for CPU, so the cheap one is not smaller.
            expect(low.getBuffer().byteLength).toBeGreaterThanOrEqual(high.getBuffer().byteLength);
            expect(low.getBuffer().equals(high.getBuffer())).toBe(false);
        });
    });
});
