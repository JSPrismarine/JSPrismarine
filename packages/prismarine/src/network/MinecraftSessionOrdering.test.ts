import { describe, expect, it } from 'vitest';

import MinecraftSession from './MinecraftSession';
import BatchPacket from './packet/BatchPacket';
import TextPacket from './packet/TextPacket';
import TextType from './type/TextType';

/**
 * The order frames reach RakNet in, which is the order the client applies them in.
 *
 * Everything here goes out reliable ordered on one channel, and RakNet stamps the order
 * index inside `sendFrame` - when the message is framed, not when it was asked for. So
 * anything that pauses between the two, as compressing a chunk batch does, is a chance for
 * a later packet to be applied first.
 */
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

/** Records what was framed, in the order RakNet was handed it. */
const fakeSession = () => {
    const framed: string[] = [];
    const rakSession = {
        sendFrame: (frame: any) => framed.push(frame.content.toString('base64')),
        getAddress: () => ({ toToken: () => 'token' }),
        disconnect: () => {}
    };
    const logger = { silly: () => {}, error: () => {}, warn: () => {} };

    return { framed, session: new MinecraftSession(rakSession as any, logger as any) };
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

            const chunks = batchOf('terrain '.repeat(500));
            const chunkSend = session.sendBatchAsync(chunks, false);

            // Synchronous, exactly as a block update broadcast is.
            const updateSend = session.sendDataPacket(message('block update'));

            await Promise.all([chunkSend, updateSend]);

            expect(framed.length).toBe(2);
            expect(framed[0]).toBe(chunks.getBuffer().toString('base64'));
        });

        it('frames two batches in the order they were queued, not the order they compressed', async () => {
            const { framed, session } = fakeSession();

            // The big one is queued first and takes longer, so completion order and queue
            // order disagree.
            const first = batchOf('a'.repeat(200_000));
            const second = batchOf('b');

            await Promise.all([session.sendBatchAsync(first, false), session.sendBatchAsync(second, false)]);

            expect(framed).toEqual([first.getBuffer().toString('base64'), second.getBuffer().toString('base64')]);
        });

        it('goes back to framing immediately once the queue has drained', async () => {
            const { framed, session } = fakeSession();

            await session.sendBatchAsync(batchOf('terrain'), false);
            void session.sendDataPacket(message('after'));

            expect(framed.length).toBe(2);
        });

        it('does not let one failed send strand every packet behind it', async () => {
            const { framed, session } = fakeSession();

            const broken = batchOf('doomed');
            broken.compressionLevel = 42; // zlib refuses this outright

            const failed = session.sendBatchAsync(broken, false);
            const after = session.sendDataPacket(message('still gets through'));

            await expect(failed).rejects.toThrow();
            await after;

            expect(framed.length).toBe(1);
        });
    });
});
