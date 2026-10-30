import { afterEach, describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stub } from '../testing/stub.test.helper';
import MinecraftSession, { debugPacketNames } from './MinecraftSession';
import type { TransportConnection } from './transport/Transport';
import { SetTimePacket } from '@jsprismarine/protocol';
import TextPacket from '@jsprismarine/protocol/packet/TextPacket';
import { TextPacketType } from '@jsprismarine/protocol';

/**
 * The `JSP_DEBUG_DROP_PACKETS` debugging aid: a named packet never reaches RakNet, and the
 * log says so, through every send path the session has.
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

const time = () => {
    return new SetTimePacket({ time: 0 });
};

const fakeSession = (dropped: Iterable<string>, dumped: Iterable<string> = [], dumpDir?: string) => {
    const framed: Buffer[] = [];
    const warnings: string[] = [];
    const connection = stub<TransportConnection>({
        token: '127.0.0.1:19132',
        sendFrame: (payload: Buffer) => void framed.push(payload),
        close: () => {}
    });
    const logger = stub<Logger>({
        silly: () => {},
        error: () => {},
        warn: (message: unknown) => void warnings.push(String(message))
    });

    return {
        framed,
        warnings,
        session: new MinecraftSession(connection, logger, undefined, new Set(dropped), new Set(dumped), dumpDir)
    };
};

describe('network', () => {
    describe('debugPacketNames', () => {
        it('reads a comma-separated list, trimming blanks', () => {
            expect([...debugPacketNames(' LevelChunkPacket, CraftingDataPacket ,,')]).toEqual([
                'LevelChunkPacket',
                'CraftingDataPacket'
            ]);
        });

        it('is empty when the variable is unset', () => {
            expect(debugPacketNames(undefined).size).toBe(0);
        });
    });

    describe('MinecraftSession packet dumping', () => {
        const dumpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsp-dump-test-'));
        afterEach(() => fs.rmSync(dumpDir, { recursive: true, force: true }));

        it('writes a named packet, header and all, and still sends it', async () => {
            const { framed, warnings, session } = fakeSession([], ['TextPacket'], dumpDir);

            const packet = message('dumped');
            await session.sendDataPacket(packet);

            const files = fs.readdirSync(dumpDir);
            expect(files.length).toBe(1);
            expect(files[0]).toMatch(/^\d+-127\.0\.0\.1-19132-TextPacket\.bin$/);
            expect(fs.readFileSync(path.join(dumpDir, files[0]!))).toEqual(packet.getBuffer());
            expect(framed.length).toBe(1);
            expect(warnings[0]).toContain('Dumped §bTextPacket§r packet');
        });

        it('dumps a packet that is also dropped', async () => {
            const { framed, session } = fakeSession(['TextPacket'], ['TextPacket'], dumpDir);

            await session.sendDataPacket(message('dumped and dropped'));

            expect(fs.readdirSync(dumpDir).length).toBe(1);
            expect(framed.length).toBe(0);
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

            const packets = [time(), message('dropped')];
            await session.sendPacketsAsync(packets, { direct: false });
            session.sendPackets(packets);

            expect(framed.length).toBe(0);
            expect(warnings.length).toBe(2);
        });

        it('drops a shared batch by the packet that labels it', () => {
            const { framed, session } = fakeSession(['SetTimePacket']);

            session.sendSharedBatch(Buffer.from([1, 2, 3]), [time()]);
            session.sendSharedBatch(Buffer.from([4, 5, 6]), [message('kept')]);

            expect(framed).toEqual([Buffer.from([4, 5, 6])]);
        });
    });
});
