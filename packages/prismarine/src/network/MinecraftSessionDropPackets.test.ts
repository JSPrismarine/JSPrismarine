import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import type { Frame, InetAddress, RakNetSession } from '@jsprismarine/raknet';
import { stub } from '../testing/stub.test.helper';
import MinecraftSession, { debugDroppedPackets } from './MinecraftSession';
import BatchPacket from './packet/BatchPacket';
import SetTimePacket from './packet/SetTimePacket';
import TextPacket from './packet/TextPacket';
import TextPacketType from './type/TextPacketType';

/**
 * The `JSP_DEBUG_DROP_PACKETS` debugging aid: a named packet never reaches RakNet, and the
 * log says so, through every send path the session has.
 */
const message = (text: string) => {
    const packet = new TextPacket();
    packet.type = TextPacketType.Raw;
    packet.needsTranslation = false;
    packet.message = text;
    packet.xuid = '';
    packet.platformChatId = '';
    packet.filtered = text;
    return packet;
};

const time = () => {
    const packet = new SetTimePacket();
    packet.time = 0;
    return packet;
};

const fakeSession = (dropped: Iterable<string>) => {
    const framed: Buffer[] = [];
    const warnings: string[] = [];
    const rakSession = stub<RakNetSession>({
        sendFrame: (frame: Frame) => void framed.push(frame.content),
        getAddress: () => stub<InetAddress>({ toToken: () => 'token' }),
        disconnect: () => {}
    });
    const logger = stub<Logger>({
        silly: () => {},
        error: () => {},
        warn: (message: unknown) => void warnings.push(String(message))
    });

    return { framed, warnings, session: new MinecraftSession(rakSession, logger, undefined, new Set(dropped)) };
};

describe('network', () => {
    describe('debugDroppedPackets', () => {
        it('reads a comma-separated list, trimming blanks', () => {
            expect([...debugDroppedPackets(' LevelChunkPacket, CraftingDataPacket ,,')]).toEqual([
                'LevelChunkPacket',
                'CraftingDataPacket'
            ]);
        });

        it('is empty when the variable is unset', () => {
            expect(debugDroppedPackets(undefined).size).toBe(0);
        });
    });

    describe('MinecraftSession packet dropping', () => {
        it('sends everything when nothing is named', async () => {
            const { framed, warnings, session } = fakeSession([]);

            await session.sendDataPacket(message('hello'));

            expect(framed.length).toBe(1);
            expect(warnings).toEqual([]);
        });

        it('drops a named packet and warns, keeping the rest', async () => {
            const { framed, warnings, session } = fakeSession(['TextPacket']);

            await session.sendDataPacket(message('dropped'));
            await session.sendDataPacket(time());

            expect(framed.length).toBe(1);
            expect(warnings).toEqual(['Dropped §bTextPacket§r packet, named by JSP_DEBUG_DROP_PACKETS']);
        });

        it('drops a batch whole when any packet in it is named', async () => {
            const { framed, warnings, session } = fakeSession(['TextPacket']);

            const batch = new BatchPacket();
            batch.addPacket(time());
            batch.addPacket(message('dropped'));
            await session.sendBatchAsync(batch, false);
            session.sendBatch(batch);

            expect(framed.length).toBe(0);
            expect(warnings.length).toBe(2);
        });

        it('drops a shared batch by the packet that labels it', () => {
            const { framed, session } = fakeSession(['SetTimePacket']);

            session.sendSharedBatch(Buffer.from([1, 2, 3]), time());
            session.sendSharedBatch(Buffer.from([4, 5, 6]), message('kept'));

            expect(framed).toEqual([Buffer.from([4, 5, 6])]);
        });
    });
});
