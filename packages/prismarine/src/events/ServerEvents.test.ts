import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Logger } from '@jsprismarine/logger';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Chat } from '../chat/Chat';
import { Config } from '../config/Config';
import Server from '../Server';
import TickEvent from './other/TickEvent';

describe('the server events', () => {
    let root: string;
    let previousDir: string | undefined;
    let server: Server;

    beforeAll(async () => {
        root = mkdtempSync(path.join(tmpdir(), 'jsprismarine-server-events-'));
        previousDir = process.env.JSP_DIR;
        process.env.JSP_DIR = root;
        server = new Server({ logger: new Logger(), config: new Config(), headless: true });
        // The modules' services, such as chat, without starting anything.
        await server.getKernel().registerAll();
    });

    afterAll(() => {
        if (previousDir === undefined) delete process.env.JSP_DIR;
        else process.env.JSP_DIR = previousDir;
        rmSync(root, { recursive: true, force: true });
    });

    it('keeps every listener on the kernel bus, in the order they subscribed', async () => {
        const calls: string[] = [];
        const plugin = (): void => void calls.push('server.on');
        server.on('chat', plugin);
        const unsubscribe = server.getKernel().events.on('chat', () => void calls.push('kernel bus'));
        server.on('chat', () => void calls.push('server.on again'));

        // Raised by the chat module on its scoped handle of the same bus.
        await server.getChatManager().send(new Chat({ sender: server.getConsoleSender(), message: 'hello' }));

        expect(calls).toEqual(['server.on', 'kernel bus', 'server.on again']);

        server.removeListener('chat', plugin);
        unsubscribe();
        server.removeAllListeners('chat');
        expect(server.hasListeners('chat')).toBe(false);
    });

    it('calls every listener after one that throws, and a once listener only once', () => {
        const calls: string[] = [];
        server.on('tick', () => {
            calls.push('throws');
            throw new Error('a broken plugin');
        });
        server.once('tick', () => void calls.push('once'));
        server.on('tick', () => void calls.push('last'));

        expect(server.getKernel().events.post('tick', new TickEvent(1))).toBe(3);
        expect(server.getKernel().events.post('tick', new TickEvent(2))).toBe(2);
        expect(calls).toEqual(['throws', 'once', 'last', 'throws', 'last']);

        server.removeAllListeners();
        expect(server.hasListeners('tick')).toBe(false);
    });
});
