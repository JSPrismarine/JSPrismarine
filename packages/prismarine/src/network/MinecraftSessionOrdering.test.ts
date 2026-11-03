import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import { PacketCompressionAlgorithm } from '@jsprismarine/minecraft';
import { BatchCodec } from '@jsprismarine/protocol';
import { stub } from '../testing/stub.test.helper';
import MinecraftSession from './MinecraftSession';
import type { TransportConnection } from './transport/Transport';
import TextPacket from '@jsprismarine/protocol/packet/TextPacket';
import { TextPacketType } from '@jsprismarine/protocol';

beforeEach(() => {
    // Root Vitest reuses workers; earlier suites can leave fake timers active and stall setImmediate sends.
    vi.useRealTimers();
});

/**
 * The order frames reach RakNet in, which is the order the client applies them in.
 *
 * Everything here goes out reliable ordered on one channel, and RakNet stamps the order
 * index inside `sendFrame` - when the message is framed, not when it was asked for. So
 * anything that pauses between the two, as compressing a chunk batch does, is a chance for
 * a later packet to be applied first.
 */
const message = (text: string) => {
    return new TextPacket({
        type: TextPacketType.Raw,
        needsTranslation: false,
        message: text,
        xuid: '',
        platformChatId: '',
        filtered: text
    });
};

const packetsOf = (text: string) => [message(text)];

const encodedBatchOf = (text: string): Buffer => {
    const packet = message(text);
    packet.encode();
    return BatchCodec.compressed({ algorithm: PacketCompressionAlgorithm.ZLIB }).encode([packet.getBuffer()]);
};

/** Records what was framed, in the order RakNet was handed it. */
const fakeSession = () => {
    const framed: string[] = [];
    const direct: boolean[] = [];
    const connection = stub<TransportConnection>({
        token: 'token',
        sendFrame: (payload: Buffer, immediate = false) => {
            framed.push(payload.toString('base64'));
            direct.push(immediate);
        },
        close: () => {}
    });
    const logger = stub<Logger>({ isEnabled: () => false, silly: () => {}, error: () => {}, warn: () => {} });

    return { framed, direct, session: new MinecraftSession(connection, logger) };
};

describe('network', () => {
    describe('MinecraftSession ordering', () => {
        it('frames queued packets from the setImmediate fallback', async () => {
            const { framed, session } = fakeSession();

            await session.sendDataPacket(message('now'));

            expect(framed.length).toBe(1);
        });

        it('keeps a packet sent mid-compression behind the batch it followed', async () => {
            // Send a chunk batch, break a block while zlib is still working. The UpdateBlock
            // used to take the lower order index, so the client applied the break and then
            // laid the older chunk snapshot back over the top of it.
            const { framed, session } = fakeSession();

            const chunks = packetsOf('terrain '.repeat(500));
            const chunkFrame = encodedBatchOf('terrain '.repeat(500));
            const chunkSend = session.sendPacketsAsync(chunks, { direct: false });

            // Synchronous, exactly as a block update broadcast is.
            const updateSend = session.sendDataPacket(message('block update'));

            await Promise.all([chunkSend, updateSend]);

            expect(framed.length).toBe(2);
            expect(framed[0]).toBe(chunkFrame.toString('base64'));
        });

        it('flushes queued packets before an asynchronous chunk batch', async () => {
            const { framed, session } = fakeSession();
            const queuedFrame = encodedBatchOf('queued');

            const queued = session.sendDataPacket(message('queued'));
            const chunk = session.sendPacketsAsync(packetsOf('terrain '.repeat(500)), { direct: false });
            await Promise.all([queued, chunk]);

            expect(framed).toEqual([
                queuedFrame.toString('base64'),
                encodedBatchOf('terrain '.repeat(500)).toString('base64')
            ]);
        });

        it('flushes queued packets before a precompressed shared batch', async () => {
            const { framed, session } = fakeSession();
            const before = session.sendDataPacket(message('before'));
            const shared = session.sendSharedBatch(encodedBatchOf('shared'), packetsOf('shared'));

            await Promise.all([before, shared]);

            expect(framed).toEqual([
                encodedBatchOf('before').toString('base64'),
                encodedBatchOf('shared').toString('base64')
            ]);
        });

        it('flushes queued packets before an asynchronously prepared shared batch', async () => {
            const { framed, session } = fakeSession();
            const before = session.sendDataPacket(message('before'));
            const packet = message('shared');
            packet.encode();
            const batch = {
                content: encodedBatchOf('shared'),
                packets: [packet],
                packetBuffers: [packet.getBuffer()]
            };
            const shared = session.sendSharedBatchAsync(Promise.resolve(batch), message('shared'));

            await Promise.all([before, shared]);

            expect(framed).toEqual([
                encodedBatchOf('before').toString('base64'),
                encodedBatchOf('shared').toString('base64')
            ]);
        });

        it('combines queued movement packets with ordinary sends using equivalent defaults', async () => {
            const { framed, session } = fakeSession();
            const ordinary = session.sendDataPacket(message('ordinary'));
            session.sendPackets(packetsOf('movement'), { direct: false });
            const flush = session.flushOutboundPackets();

            await Promise.all([ordinary, flush]);

            expect(framed).toHaveLength(1);
            expect(
                BatchCodec.compressed({ algorithm: PacketCompressionAlgorithm.ZLIB }).decode(
                    Buffer.from(framed[0]!, 'base64')
                )
            ).toHaveLength(2);
        });

        it('flushes queued packets when the negotiated compression algorithm changes', async () => {
            const { framed, session } = fakeSession();
            const zlibSend = session.sendDataPacket(message('zlib'));
            session.setCompressionSettings(PacketCompressionAlgorithm.SNAPPY, 1);
            const snappySend = session.sendDataPacket(message('snappy'));

            await Promise.all([zlibSend, snappySend]);

            expect(framed).toHaveLength(2);
            expect(
                BatchCodec.compressed({ algorithm: PacketCompressionAlgorithm.ZLIB }).decode(
                    Buffer.from(framed[0]!, 'base64')
                )
            ).toHaveLength(1);
            expect(
                BatchCodec.compressed({ algorithm: PacketCompressionAlgorithm.SNAPPY }).decode(
                    Buffer.from(framed[1]!, 'base64')
                )
            ).toHaveLength(1);
        });

        it('flushes prior packets before a direct packet and marks its frame immediate', async () => {
            const { framed, direct, session } = fakeSession();

            const queued = session.sendDataPacket(message('queued'));
            const urgent = session.sendDataPacket(message('urgent'), true, true);
            await Promise.all([queued, urgent]);

            expect(framed).toHaveLength(2);
            expect(direct).toEqual([false, true]);
        });

        it('keeps later packets behind a cached compressed chunk batch', async () => {
            const { framed, session } = fakeSession();
            const terrain = message('cached terrain');
            terrain.encode();
            const cachedFrame = BatchCodec.compressed({ algorithm: PacketCompressionAlgorithm.ZLIB }).encode([
                terrain.getBuffer()
            ]);

            const chunkSend = session.sendSharedCompressedBatchAsync(cachedFrame, [terrain], false, [
                terrain.getBuffer()
            ]);
            const updateSend = session.sendDataPacket(message('block update'));
            await Promise.all([chunkSend, updateSend]);

            expect(framed).toEqual([cachedFrame.toString('base64'), encodedBatchOf('block update').toString('base64')]);
        });

        it('frames two batches in the order they were queued, not the order they compressed', async () => {
            const { framed, session } = fakeSession();

            // The big one is queued first and takes longer, so completion order and queue
            // order disagree.
            const first = packetsOf('a'.repeat(200_000));
            const second = packetsOf('b');

            await Promise.all([
                session.sendPacketsAsync(first, { direct: false }),
                session.sendPacketsAsync(second, { direct: false })
            ]);

            expect(framed).toEqual([
                encodedBatchOf('a'.repeat(200_000)).toString('base64'),
                encodedBatchOf('b').toString('base64')
            ]);
        });

        it('compresses a large single packet asynchronously without letting a later send pass it', async () => {
            const { framed, session } = fakeSession();
            let release: ((frame: Buffer) => void) | undefined;
            const delayedDeflate = new Promise<Buffer>((resolve) => {
                release = resolve;
            });
            const encodeAsync = vi.spyOn(BatchCodec.prototype, 'encodeAsync').mockReturnValue(delayedDeflate);

            const first = session.sendDataPacket(message('large '.repeat(12_000)));
            const second = session.sendDataPacket(message('later'));

            expect(encodeAsync).toHaveBeenCalledOnce();
            expect(framed).toEqual([]);
            const finishDeflate = release;
            if (finishDeflate === undefined) throw new Error('the large batch did not start compression');
            finishDeflate(Buffer.from('first frame'));

            await Promise.all([first, second]);

            expect(framed).toEqual([
                Buffer.from('first frame').toString('base64'),
                encodedBatchOf('later').toString('base64')
            ]);
            encodeAsync.mockRestore();
        });

        it('frames a later packet after the previous asynchronous batch drains', async () => {
            const { framed, session } = fakeSession();

            await session.sendPacketsAsync(packetsOf('terrain'), { direct: false });
            await session.sendDataPacket(message('after'));

            expect(framed.length).toBe(2);
        });

        it('does not let one failed send strand every packet behind it', async () => {
            const { framed, session } = fakeSession();

            const broken = packetsOf('doomed');

            const failed = session.sendPacketsAsync(broken, { direct: false, compressionLevel: 42 });
            const after = session.sendDataPacket(message('still gets through'));

            await expect(failed).rejects.toThrow();
            await after;

            expect(framed.length).toBe(1);
        });
    });
});
