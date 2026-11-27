// @module-tag integration

import { createServer } from 'node:net';
import type { Server } from 'node:net';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runPacksOnHeadlessServer } from './jspHost.ts';

/** The TCP port Java Edition clients look for, which a server with Java enabled listens on. */
const JAVA_PORT = 25565;

describe('runPacksOnHeadlessServer', { tags: ['real-data'] }, () => {
    let holder: Server | undefined;
    let outcome: unknown;

    // Another server holds Java Edition's port, as a scenario server in a parallel test file does,
    // while the headless server boots. The boot builds the server's content, so it runs here.
    beforeAll(async () => {
        const server = createServer();
        holder = await new Promise<Server | undefined>((resolve) => {
            // Something else already holding the port is the same condition, so the test goes on.
            server.once('error', () => resolve(undefined));
            server.listen(JAVA_PORT, '127.0.0.1', () => resolve(server));
        });
        outcome = await runPacksOnHeadlessServer({ packDirectories: [], ended: () => true }).catch(
            (error: unknown) => ({ failed: error })
        );
    }, 300_000);

    afterAll(async () => {
        await new Promise((closed) => (holder === undefined ? closed(undefined) : holder.close(closed)));
    });

    it('boots while another server holds the Java Edition port', () => {
        expect(outcome).toEqual(expect.any(Array));
    });
});
