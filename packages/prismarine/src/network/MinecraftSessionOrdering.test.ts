import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import { PacketCompressionAlgorithm } from '@jsprismarine/minecraft';
import { BatchCodec } from '@jsprismarine/protocol';
import { stub } from '../testing/stub.test.helper';
import MinecraftSession from './MinecraftSession';
import type { TransportConnection } from './transport/Transport';
import TextPacket from '@jsprismarine/protocol/packet/TextPacket';
import { TextPacketType } from '@jsprismarine/protocol';

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
    const connection = stub<TransportConnection>({
        token: 'token',
        sendFrame: (payload: Buffer) => void framed.push(payload.toString('base64')),
        close: () => {}
    });
    const logger = stub<Logger>({ silly: () => {}, error: () => {}, warn: () => {} });

    return { framed, session: new MinecraftSession(connection, logger) };
};

describe('network', () => {
    describe('MinecraftSession ordering', () => {
        it('frames a packet immediately when nothing is compressing', async () => {
            // The ordinary case has to stay as cheap as it was: no queue, no deferral.
            const { framed, session } = fakeSession();

            void session.sendDataPacket(message('now'));

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

        it('goes back to framing immediately once the queue has drained', async () => {
            const { framed, session } = fakeSession();

            await session.sendPacketsAsync(packetsOf('terrain'), { direct: false });
            void session.sendDataPacket(message('after'));

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
